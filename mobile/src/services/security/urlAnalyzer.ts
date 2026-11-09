/**
 * On-device lexical URL analysis (no network) plus merging of the optional
 * server-side "sandbox" inspection.
 *
 * Pure TypeScript — no URL() dependency (React Native's URL polyfill is
 * incomplete), no react-native imports, so it runs in Node tests as well.
 *
 * Severity of a report = highest signal severity; 'info' when nothing
 * suspicious was found (an OFFICIAL_DOMAIN signal alone stays 'info').
 */
import type {
  Localized,
  ServerUrlInspection,
  TextSpan,
  UrlReport,
  UrlSignal,
  UrlSignalSeverity,
  UrlSignalType,
} from '@/types/security';

import { foldText } from './textNormalize';

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

/** Multi-label public suffixes (subset of the PSL relevant for our users). */
const MULTI_LABEL_SUFFIXES = new Set([
  'com.az', 'net.az', 'org.az', 'gov.az', 'edu.az', 'info.az', 'biz.az', 'name.az', 'pro.az', 'mil.az',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.tr', 'gov.tr', 'org.tr', 'net.tr', 'edu.tr',
  'com.ru', 'org.ru', 'net.ru',
  'co.jp', 'com.au', 'com.ua', 'com.ge', 'com.kz',
  'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'web.app', 'firebaseapp.com', 'herokuapp.com',
  'blogspot.com', 'workers.dev', 'glitch.me', 'repl.co', 'onrender.com', 'azurewebsites.net',
]);

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'ow.ly', 'rb.gy', 'shorturl.at', 'tiny.cc',
  's.id', 't.ly', 'rebrand.ly', 'buff.ly', 'bit.do', 'qps.ru', 'clck.ru', 'u.to', 'v.gd', 'lnkd.in',
  'shorte.st', 'adf.ly', 'soo.gd', 'x.co', 'short.io', 'tny.im', 'shrtco.de',
]);

const RISKY_TLDS = new Set([
  'top', 'xyz', 'click', 'zip', 'mov', 'icu', 'cyou', 'rest', 'buzz', 'monster', 'sbs', 'cfd', 'bond', 'lol',
  'quest', 'gq', 'ml', 'tk', 'cf', 'ga', 'work', 'support', 'live',
]);

/** TLDs accepted for bare domains without a path ("demobank.az"). */
const KNOWN_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'az', 'ru', 'uk', 'tr', 'de', 'fr', 'it', 'es', 'nl', 'pl', 'ua', 'kz',
  'ge', 'ir', 'cn', 'in', 'jp', 'us', 'eu', 'io', 'co', 'me', 'ly', 'app', 'dev', 'ai', 'gl', 'gd', 'to', 'id',
  'so', 'tv', 'cc', 'ws', 'pw', 'su', 'pro', 'online', 'site', 'shop', 'store', 'link', 'page', 'cloud',
  'website', 'space', 'fun', 'club', 'vip', 'win', 'bid', 'loan', 'today', 'world', 'life', 'news', 'email',
  'network', 'digital', 'services', 'gov', 'edu',
  ...[...RISKY_TLDS].filter((t) => t !== 'zip' && t !== 'mov'),
]);

interface BrandRule {
  brand: string;
  /** Registrable domains that legitimately belong to the brand. */
  official: string[];
  /** Returns true when the brand (or a look-alike) appears in the host. */
  test: (h: HostView) => boolean;
}

interface HostView {
  /** Host variants: as-is plus digit/homoglyph-substituted versions. */
  variants: string[];
  /** Words of each variant (split on . - _), TLD excluded. */
  words: string[][];
}

/*
 * Brand → official registrable domains.
 * NOTE: "demobank" is the FICTIONAL bank used by DaCy demo scenarios.
 * The Azerbaijani bank domains below were compiled for the prototype and MUST
 * be verified against each bank's official channels before production use.
 */
const BRAND_SPECS: { brand: string; tokens: string[]; official: string[] }[] = [
  { brand: 'DemoBank', tokens: ['demobank'], official: ['demobank.az'] },
  { brand: 'PayPal', tokens: ['paypal'], official: ['paypal.com'] },
  { brand: 'Apple', tokens: ['apple', 'icloud'], official: ['apple.com', 'icloud.com'] },
  { brand: 'Google', tokens: ['google'], official: ['google.com', 'google.az'] },
  { brand: 'Microsoft', tokens: ['microsoft'], official: ['microsoft.com', 'live.com', 'outlook.com'] },
  { brand: 'WhatsApp', tokens: ['whatsapp'], official: ['whatsapp.com', 'whatsapp.net', 'wa.me'] },
  { brand: 'Instagram', tokens: ['instagram'], official: ['instagram.com'] },
  { brand: 'Facebook', tokens: ['facebook'], official: ['facebook.com', 'fb.com', 'meta.com'] },
  { brand: 'Telegram', tokens: ['telegram'], official: ['telegram.org', 't.me'] },
  { brand: 'DHL', tokens: ['dhl'], official: ['dhl.com'] },
  { brand: 'FedEx', tokens: ['fedex'], official: ['fedex.com'] },
  { brand: 'Amazon', tokens: ['amazon'], official: ['amazon.com'] },
  { brand: 'Netflix', tokens: ['netflix'], official: ['netflix.com'] },
  { brand: 'Binance', tokens: ['binance'], official: ['binance.com'] },
  { brand: 'Kapital Bank / Birbank', tokens: ['kapitalbank', 'birbank'], official: ['kapitalbank.az', 'birbank.az'] },
  { brand: 'PASHA Bank', tokens: ['pashabank'], official: ['pashabank.az'] },
  { brand: 'Leobank', tokens: ['leobank'], official: ['leobank.az'] },
  { brand: 'Unibank', tokens: ['unibank'], official: ['unibank.az'] },
  { brand: 'Bank of Baku', tokens: ['bankofbaku'], official: ['bankofbaku.com'] },
];

/** Dictionary words that are one edit away from a brand token (avoid false look-alikes). */
const EDIT_EXCLUSIONS = new Set(['finance', 'finances', 'cloud', 'clouds', 'goggle', 'goggles', 'telegraf']);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const SEVERITY_RANK: Record<UrlSignalSeverity, number> = { info: 0, low: 1, medium: 2, high: 3 };

export function maxSeverity(signals: readonly UrlSignal[]): UrlSignalSeverity {
  let best: UrlSignalSeverity = 'info';
  for (const s of signals) if (SEVERITY_RANK[s.severity] > SEVERITY_RANK[best]) best = s.severity;
  return best;
}

export function compareSeverity(a: UrlSignalSeverity, b: UrlSignalSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

function isIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  return m.slice(1).every((part) => Number(part) <= 255);
}

function isIpHost(host: string): boolean {
  return isIpv4(host) || host.startsWith('[') || (host.includes(':') && /^[0-9a-f:]+$/i.test(host));
}

/** Optimal-string-alignment distance ≤ 1 (substitution, insertion, deletion, adjacent swap). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    const diffs: number[] = [];
    for (let i = 0; i < la; i += 1) if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length === 1) return true;
    if (diffs.length === 2) {
      const [i, j] = diffs as [number, number];
      return j === i + 1 && a[i] === b[j] && a[j] === b[i];
    }
    return false;
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i += 1;
      j += 1;
    } else {
      if (skipped) return false;
      skipped = true;
      j += 1;
    }
  }
  return true;
}

const DIGIT_SUBS: [RegExp, string][] = [
  [/0/g, 'o'],
  [/3/g, 'e'],
  [/4/g, 'a'],
  [/5/g, 's'],
  [/7/g, 't'],
  [/8/g, 'b'],
  [/@/g, 'a'],
];

function buildHostView(host: string): HostView {
  const base = host.toLowerCase();
  let digits = base;
  for (const [re, ch] of DIGIT_SUBS) digits = digits.replace(re, ch);
  const variants = new Set<string>([
    base,
    digits.replace(/1/g, 'l'),
    digits.replace(/1/g, 'i'),
    digits.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/1/g, 'l'),
  ]);
  const list = [...variants];
  // Hyphen-free copies catch "demo-bank.top" / "pay-pal.xyz" in substring checks.
  for (const v of list) if (v.includes('-')) variants.add(v.replace(/-/g, ''));
  const words = list.map((v) => {
    const labels = v.split('.');
    if (labels.length > 1) labels.pop(); // drop TLD
    return labels.join('.').split(/[.\-_]+/).filter(Boolean);
  });
  return { variants: [...variants], words };
}

function tokenRule(token: string): (h: HostView) => boolean {
  if (token === 'dhl') return (h) => h.variants.some((v) => v.includes('dhl'));
  if (token.length <= 5) {
    // Short tokens (apple, fedex): word must start with the token ("appleid", not "pineapple").
    return (h) => h.words.some((ws) => ws.some((w) => w.startsWith(token)));
  }
  return (h) =>
    h.variants.some((v) => v.includes(token)) ||
    h.words.some((ws) =>
      ws.some((w) => w.length >= 5 && !EDIT_EXCLUSIONS.has(w) && withinOneEdit(w, token)),
    );
}

const BRAND_RULES: BrandRule[] = [
  ...BRAND_SPECS.map((spec) => {
    const tests = spec.tokens.map(tokenRule);
    return { brand: spec.brand, official: spec.official, test: (h: HostView) => tests.some((t) => t(h)) };
  }),
  {
    brand: 'ABB',
    official: ['abb-bank.az'],
    // "abb" only as a whole label/word or together with "bank".
    test: (h) =>
      h.words.some((ws) => ws.includes('abb')) || h.variants.some((v) => v.includes('abbbank') || v.includes('abb-bank')),
  },
  {
    brand: 'e-gov (Azerbaijan)',
    official: ['e-gov.az'],
    test: (h) => h.variants.some((v) => v.includes('egov') || v.includes('e-gov')),
  },
];

const OFFICIAL_DOMAINS = new Set(BRAND_RULES.flatMap((b) => b.official));

/** True when the registrable domain is on the official list (any *.gov.az counts). */
export function isOfficialDomain(registrableDomain: string): boolean {
  const d = registrableDomain.toLowerCase();
  return OFFICIAL_DOMAINS.has(d) || d.endsWith('.gov.az');
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

interface ParsedUrl {
  scheme: string | null;
  userinfo: string | null;
  host: string;
  port: string | null;
  rest: string;
  normalized: string;
}

function parseUrl(input: string): ParsedUrl {
  const s = input.trim();
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  const scheme = schemeMatch?.[1]?.toLowerCase() ?? null;
  const afterScheme = schemeMatch ? s.slice(schemeMatch[0].length) : s;
  const authEnd = afterScheme.search(/[/?#]/);
  const authority = authEnd >= 0 ? afterScheme.slice(0, authEnd) : afterScheme;
  const rest = authEnd >= 0 ? afterScheme.slice(authEnd) : '';
  const at = authority.lastIndexOf('@');
  const userinfo = at >= 0 ? authority.slice(0, at) : null;
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  let host: string;
  let port: string | null = null;
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    host = close >= 0 ? hostPort.slice(0, close + 1) : hostPort;
    const after = close >= 0 ? hostPort.slice(close + 1) : '';
    if (after.startsWith(':')) port = after.slice(1) || null;
  } else {
    const colon = hostPort.lastIndexOf(':');
    if (colon >= 0 && /^\d*$/.test(hostPort.slice(colon + 1))) {
      host = hostPort.slice(0, colon);
      port = hostPort.slice(colon + 1) || null;
    } else {
      host = hostPort;
    }
  }
  host = host.toLowerCase().replace(/\.+$/, '');
  const normalized = `${scheme ?? 'https'}://${userinfo !== null ? `${userinfo}@` : ''}${host}${port ? `:${port}` : ''}${rest || '/'}`;
  return { scheme, userinfo, host, port, rest, normalized };
}

/** Registrable domain ("eTLD+1") using a small multi-label public suffix list. */
export function getRegistrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.+$/, '');
  if (!h) return '';
  if (isIpHost(h)) return h;
  const labels = h.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  for (const size of [3, 2]) {
    if (labels.length <= size) continue;
    const suffix = labels.slice(-size).join('.');
    if (MULTI_LABEL_SUFFIXES.has(suffix)) return labels.slice(-(size + 1)).join('.');
  }
  return labels.slice(-2).join('.');
}

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

const EXPLICIT_URL_RE = /\bhttps?:\/\/[^\s<>"'«»“”‘’]+/gi;
const WWW_URL_RE = /\bwww\.[^\s<>"'«»“”‘’]+/gi;
const BARE_DOMAIN_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24})(?::\d{2,5})?(?:[/?#][^\s<>"'«»“”‘’]*)?/gi;
const BARE_IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?(?:\/[^\s<>"'«»“”‘’]*)?/g;

const TRAILING_PUNCT = /[).,;:!?»"'’”…\]>]+$/;

function trimTrailing(raw: string): string {
  let s = raw;
  for (;;) {
    const before = s;
    s = s.replace(TRAILING_PUNCT, '');
    // Keep a closing parenthesis only when the URL itself opened one.
    if (s.endsWith(')') && (s.match(/\(/g) ?? []).length < (s.match(/\)/g) ?? []).length) s = s.slice(0, -1);
    if (s === before) break;
  }
  return s;
}

/**
 * Finds links in free text: explicit http(s)://, www.…, bare IPs with a port
 * or path, and bare domains that have a path or a known TLD
 * ("demobank-az.top/verify", "demobank.az"). Trailing punctuation is trimmed,
 * e-mail addresses are skipped and duplicates are removed.
 */
export function extractUrls(text: string): { input: string; span: TextSpan }[] {
  const found: { input: string; span: TextSpan }[] = [];
  const taken: TextSpan[] = [];
  const overlaps = (s: TextSpan) => taken.some((t) => s.start < t.end && t.start < s.end);

  const add = (start: number, raw: string): void => {
    const input = trimTrailing(raw);
    if (input.length < 4) return;
    const span = { start, end: start + input.length };
    if (overlaps(span)) return;
    taken.push(span);
    found.push({ input, span });
  };

  for (const re of [EXPLICIT_URL_RE, WWW_URL_RE]) {
    for (const m of text.matchAll(re)) add(m.index ?? 0, m[0]);
  }
  for (const m of text.matchAll(BARE_IP_RE)) {
    const idx = m.index ?? 0;
    const raw = m[0];
    if (!/[:/]/.test(raw)) continue; // plain dotted numbers are usually not links
    if (!isIpv4(raw.split(/[:/]/)[0] ?? '')) continue;
    if (idx > 0 && /[@\w.]/.test(text.charAt(idx - 1))) continue;
    add(idx, raw);
  }
  for (const m of text.matchAll(BARE_DOMAIN_RE)) {
    const idx = m.index ?? 0;
    const raw = m[0];
    const prev = idx > 0 ? text.charAt(idx - 1) : '';
    if (prev === '@' || prev === '.' || prev === '/' || prev === '-') continue; // e-mail or part of a bigger token
    const tld = (m[1] ?? '').toLowerCase();
    const hasPath = /[/?#]/.test(raw);
    if (!hasPath && !KNOWN_TLDS.has(tld)) continue;
    // Skip e-mail addresses whose local part contains a dot ("first.last@mail.com").
    const after = text.charAt(idx + raw.length);
    if (after === '@') continue;
    add(idx, raw);
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.span.start - b.span.start)
    .filter((u) => {
      const key = u.input.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/* ------------------------------------------------------------------ */
/* Lexical analysis                                                    */
/* ------------------------------------------------------------------ */

const KEYWORDS_LONG = ['login', 'signin', 'verif', 'secur', 'update', 'account', 'wallet', 'bonus', 'unlock', 'confirm', 'odenis', 'bloklama'];
const KEYWORDS_SHORT = ['gift', 'kod', 'kart'];

function signal(type: UrlSignalType, severity: UrlSignalSeverity, detail: Localized): UrlSignal {
  return { type, severity, detail };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function findKeywords(host: string, rest: string): string[] {
  const hay = foldText(safeDecode(`${host} ${rest}`));
  const segments = hay.split(/[^a-z0-9]+/).filter(Boolean);
  const hits = new Set<string>();
  for (const seg of segments) {
    for (const kw of KEYWORDS_LONG) if (seg.includes(kw)) hits.add(kw);
    for (const kw of KEYWORDS_SHORT) if (seg.startsWith(kw)) hits.add(kw);
  }
  return [...hits];
}

/** Lexical (offline) analysis of one URL as it appeared in the text. */
export function analyzeUrlLexical(input: string, span?: TextSpan): UrlReport {
  const parsed = parseUrl(input);
  const host = parsed.host;
  const registrableDomain = getRegistrableDomain(host);
  const signals: UrlSignal[] = [];
  const official = isOfficialDomain(registrableDomain);

  if (parsed.userinfo !== null) {
    signals.push(
      signal('CREDENTIALS_IN_URL', 'high', {
        en: `Text before “@” disguises the real destination, which is ${host}.`,
        az: `“@” işarəsindən əvvəlki hissə əsl ünvanı gizlədir: link ${host} saytına aparır.`,
      }),
    );
  }

  const ip = isIpHost(host);
  if (ip) {
    signals.push(
      signal('IP_HOST', 'high', {
        en: `The link points to a raw IP address (${host}) instead of a named website.`,
        az: `Link adlı sayt əvəzinə birbaşa IP ünvana (${host}) aparır.`,
      }),
    );
  }

  if (!ip && (/(^|\.)xn--/.test(host) || /[^\x00-\x7F]/.test(host))) {
    signals.push(
      signal('PUNYCODE_OR_IDN', 'high', {
        en: `The domain uses encoded or non-Latin characters (${host}) that can imitate real letters.`,
        az: `Domendə real hərfləri təqlid edə bilən kodlaşdırılmış və ya qeyri-latın simvollar var (${host}).`,
      }),
    );
  }

  if (SHORTENERS.has(registrableDomain) || SHORTENERS.has(host)) {
    signals.push(
      signal('URL_SHORTENER', 'medium', {
        en: `Shortened link (${registrableDomain}) — the real destination is hidden.`,
        az: `Qısaldılmış link (${registrableDomain}) — əsl ünvan gizlədilir.`,
      }),
    );
  }

  if (!ip && !official) {
    const view = buildHostView(host);
    const brand = BRAND_RULES.find((b) => b.test(view));
    if (brand) {
      const officialList = brand.official.join(' / ');
      signals.push(
        signal('BRAND_LOOKALIKE', 'high', {
          en: `Looks like ${brand.brand}, but ${brand.brand}'s official address is ${officialList}. This link goes to ${registrableDomain}.`,
          az: `Link ${brand.brand} brendinə oxşayır, lakin rəsmi ünvan ${officialList} olmalıdır. Bu link isə ${registrableDomain} domeninə aparır.`,
        }),
      );
    }
  }

  const tld = ip ? '' : (host.split('.').pop() ?? '');
  if (tld && RISKY_TLDS.has(tld) && !official) {
    signals.push(
      signal('RISKY_TLD', 'low', {
        en: `The domain ending “.${tld}” is cheap and often used for scam sites.`,
        az: `“.${tld}” domen sonluğu ucuzdur və fırıldaq saytlarında tez-tez istifadə olunur.`,
      }),
    );
  }

  if (parsed.scheme === 'http') {
    signals.push(
      signal('NO_HTTPS', 'low', {
        en: 'The link uses unencrypted http://.',
        az: 'Link şifrələnməmiş http:// ilə açılır.',
      }),
    );
  }

  if (!ip) {
    const sub = host.split('.').length - registrableDomain.split('.').length;
    if (sub >= 4) {
      signals.push(
        signal('EXCESSIVE_SUBDOMAINS', 'low', {
          en: `Unusually long chain of subdomains (${sub} levels).`,
          az: `Qeyri-adi uzun subdomen zənciri (${sub} səviyyə).`,
        }),
      );
    }
  }

  if (!official) {
    const kws = findKeywords(ip ? '' : host, parsed.rest);
    if (kws.length > 0) {
      signals.push(
        signal('SUSPICIOUS_KEYWORDS', 'low', {
          en: `Contains words typical of phishing pages: ${kws.join(', ')}.`,
          az: `Fişinq səhifələrinə xas sözlər var: ${kws.join(', ')}.`,
        }),
      );
    }
  }

  if (official) {
    signals.push(
      signal('OFFICIAL_DOMAIN', 'info', {
        en: `${registrableDomain} is on DaCy's list of official domains.`,
        az: `${registrableDomain} DaCy-nin rəsmi domenlər siyahısındadır.`,
      }),
    );
  }

  return {
    input,
    normalized: parsed.normalized,
    host,
    registrableDomain,
    signals,
    severity: maxSeverity(signals),
    ...(span ? { span } : {}),
  };
}

export function analyzeUrlsInText(text: string): UrlReport[] {
  return extractUrls(text).map((u) => analyzeUrlLexical(u.input, u.span));
}

/* ------------------------------------------------------------------ */
/* Server inspection merge                                             */
/* ------------------------------------------------------------------ */

const SERVER_SIGNAL_TYPES = new Set<UrlSignalType>([
  'NEW_DOMAIN',
  'REDIRECT_CHAIN',
  'CROSS_DOMAIN_REDIRECT',
  'PASSWORD_FORM',
  'CARD_FORM',
  'UNREACHABLE',
]);

/**
 * Attaches a server inspection to a lexical report and adds server signals:
 *  - NEW_DOMAIN: age < 30 days → high, < 180 days → medium
 *  - REDIRECT_CHAIN: ≥ 2 redirects → low
 *  - CROSS_DOMAIN_REDIRECT: final registrable domain differs → medium;
 *    high when the original was a shortener and the final domain is not official
 *  - PASSWORD_FORM: medium; high together with BRAND_LOOKALIKE or NEW_DOMAIN
 *  - CARD_FORM: high
 *  - UNREACHABLE: info, when the inspection failed
 * Password/card forms on an official domain are expected and not flagged.
 * Severity is recomputed. Merging twice replaces the previous server signals.
 */
export function mergeInspection(report: UrlReport, inspection: ServerUrlInspection): UrlReport {
  const signals = report.signals.filter((s) => !SERVER_SIGNAL_TYPES.has(s.type));
  const has = (t: UrlSignalType) => signals.some((s) => s.type === t);

  const age = inspection.domainAgeDays;
  if (age !== null && age >= 0 && age < 180) {
    signals.push(
      signal('NEW_DOMAIN', age < 30 ? 'high' : 'medium', {
        en: `The domain was registered only ${age} day${age === 1 ? '' : 's'} ago.`,
        az: `Domen cəmi ${age} gün əvvəl qeydiyyatdan keçib.`,
      }),
    );
  }

  if (inspection.redirects.length >= 2) {
    signals.push(
      signal('REDIRECT_CHAIN', 'low', {
        en: `The link redirects ${inspection.redirects.length} times before reaching the page.`,
        az: `Link səhifəyə çatmazdan əvvəl ${inspection.redirects.length} dəfə yönləndirir.`,
      }),
    );
  }

  let finalRegistrable = report.registrableDomain;
  if (inspection.finalUrl) {
    finalRegistrable = getRegistrableDomain(parseUrl(inspection.finalUrl).host) || report.registrableDomain;
    if (finalRegistrable && finalRegistrable !== report.registrableDomain) {
      const fromShortener = has('URL_SHORTENER');
      const severe = fromShortener && !isOfficialDomain(finalRegistrable);
      signals.push(
        signal('CROSS_DOMAIN_REDIRECT', severe ? 'high' : 'medium', {
          en: `The link ends up on a different domain: ${finalRegistrable}.`,
          az: `Link başqa domenə aparır: ${finalRegistrable}.`,
        }),
      );
    }
  }

  const finalIsOfficial = isOfficialDomain(finalRegistrable);
  if (inspection.hasPasswordField && !finalIsOfficial) {
    const severe = has('BRAND_LOOKALIKE') || has('NEW_DOMAIN');
    signals.push(
      signal('PASSWORD_FORM', severe ? 'high' : 'medium', {
        en: 'The page contains a password field.',
        az: 'Səhifədə şifrə xanası var.',
      }),
    );
  }

  if (inspection.hasCardField && !finalIsOfficial) {
    signals.push(
      signal('CARD_FORM', 'high', {
        en: 'The page asks for card details.',
        az: 'Səhifə kart məlumatlarını istəyir.',
      }),
    );
  }

  if (inspection.error) {
    signals.push(
      signal('UNREACHABLE', 'info', {
        en: `The page could not be inspected (${inspection.error}).`,
        az: `Səhifəni yoxlamaq mümkün olmadı (${inspection.error}).`,
      }),
    );
  }

  return { ...report, signals, severity: maxSeverity(signals), inspection };
}
