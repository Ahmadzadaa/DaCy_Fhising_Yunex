/**
 * The link "sandbox": an isolated, server-side fetch of a URL.
 *
 *  - No JavaScript is executed and no form is ever submitted — we read raw HTML only.
 *  - SSRF guard: only http/https on default ports, no userinfo, internal hostnames and
 *    non-public IP literals are rejected up front, and every DNS answer is checked again
 *    at connect time by a custom `lookup` (so DNS rebinding cannot reach internal hosts).
 *  - Redirects are followed manually (max 5) and every hop is re-validated.
 *  - Budget: 7 s overall, at most 1 MB of (decompressed) body.
 *
 * `inspectUrl` never throws; failures are reported in `error` with a short machine code.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import zlib from 'node:zlib';
import type { ServerUrlInspection } from './contract.js';
import {
  bareHostname,
  isBlockedAddress,
  isInternalHostname,
  isIpLiteral,
  registrableDomain,
} from './netguard.js';

export { registrableDomain, isBlockedAddress } from './netguard.js';

export type InspectErrorCode =
  | 'BLOCKED_PRIVATE_ADDRESS'
  | 'DNS_FAILED'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'CONNECTION_FAILED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PORT';

const OVERALL_BUDGET_MS = 7_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 1024 * 1024;
const RDAP_TIMEOUT_MS = 3_000;
const MAX_TITLE_CHARS = 140;

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

/** Dedicated agents: no keep-alive, and never an environment-configured proxy (which would bypass `lookup`). */
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

class InspectFailure extends Error {
  readonly code: InspectErrorCode;
  constructor(code: InspectErrorCode) {
    super(code);
    this.name = 'InspectFailure';
    this.code = code;
  }
}

const BLOCKED_ERRNO = 'EDACYBLOCKED';

/* ------------------------------------------------------------------ */
/* Target validation                                                   */
/* ------------------------------------------------------------------ */

const NON_HIERARCHICAL_SCHEME = /^(?:javascript|data|mailto|file|tel|sms|intent|blob|about|ftp|ws|wss):/i;

/** Adds `https://` to scheme-less input such as `www.example.com/login`. */
export function normalizeUrlInput(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (NON_HIERARCHICAL_SCHEME.test(trimmed) || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed; // some other scheme → rejected by validateTarget
  }
  return `https://${trimmed}`;
}

/**
 * Throws InspectFailure unless `target` is a URL we are willing to connect to.
 * Purely syntactic + IP-literal checks — no network access.
 */
export function validateTarget(target: string | URL): URL {
  let url: URL;
  try {
    url = typeof target === 'string' ? new URL(target) : new URL(target.href);
  } catch {
    throw new InspectFailure('INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new InspectFailure('INVALID_URL');
  if (url.username !== '' || url.password !== '') throw new InspectFailure('INVALID_URL');
  const host = bareHostname(url.hostname);
  if (!host || host.length > 253) throw new InspectFailure('INVALID_URL');
  if (isIpLiteral(host)) {
    if (isBlockedAddress(host)) throw new InspectFailure('BLOCKED_PRIVATE_ADDRESS');
  } else {
    if (host.split('.').some((label) => label.length === 0 || label.length > 63)) {
      throw new InspectFailure('INVALID_URL');
    }
    if (isInternalHostname(host)) throw new InspectFailure('BLOCKED_PRIVATE_ADDRESS');
  }
  // WHATWG URL normalises the scheme's default port (80/443) to ''.
  if (url.port !== '') throw new InspectFailure('UNSUPPORTED_PORT');
  url.hash = '';
  return url;
}

/**
 * DNS lookup that refuses to hand non-public addresses to the socket layer.
 * Runs at connect time for every hop, which defeats DNS rebinding.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', undefined);
      return;
    }
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error('Resolved to a non-public address');
      blocked.code = BLOCKED_ERRNO;
      callback(blocked, '', undefined);
      return;
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      const first = addresses[0]!;
      callback(null, first.address, first.family);
    }
  });
};

/* ------------------------------------------------------------------ */
/* Single hop                                                          */
/* ------------------------------------------------------------------ */

interface HopResult {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer | null;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function shouldReadBody(contentType: string): boolean {
  return contentType === '' || /html|xml|text\/plain/i.test(contentType);
}

function fetchOnce(url: URL, signal: AbortSignal): Promise<HopResult> {
  return new Promise<HopResult>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void): void => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    let req: http.ClientRequest;
    try {
      req = transport.request(
        url,
        {
          method: 'GET',
          agent: isHttps ? httpsAgent : httpAgent,
          lookup: guardedLookup,
          signal,
          timeout: OVERALL_BUDGET_MS,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.9,az;q=0.8,ru;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          // An aborted response emits 'error'; without a listener that would crash the process.
          res.on('error', () => undefined);
          const location = typeof res.headers.location === 'string' ? res.headers.location : null;
          const contentType = String(res.headers['content-type'] ?? '');
          if ((isRedirect(status) && location) || !shouldReadBody(contentType)) {
            res.destroy();
            done(() => resolve({ status, location, contentType, body: null }));
            return;
          }
          const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
          let stream: NodeJS.ReadableStream = res;
          if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip());
          else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
          else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
          const chunks: Buffer[] = [];
          let total = 0;
          const finish = (): void => {
            done(() =>
              resolve({ status, location, contentType, body: Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES) }),
            );
          };
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            total += chunk.length;
            if (total >= MAX_BODY_BYTES) {
              finish();
              res.destroy();
            }
          });
          stream.on('end', finish);
          // A broken/aborted body still gives us whatever HTML arrived.
          stream.on('error', finish);
          res.on('error', finish);
          res.on('close', () => {
            // Give a decompressor a moment to flush its tail after the socket closes.
            if (stream === res) finish();
            else setTimeout(finish, 250).unref();
          });
          signal.addEventListener('abort', finish, { once: true });
        },
      );
    } catch (err) {
      reject(err);
      return;
    }
    req.on('timeout', () => req.destroy(new InspectFailure('TIMEOUT')));
    req.on('error', (err) => done(() => reject(err)));
    req.end();
  });
}

function mapError(err: unknown, signal: AbortSignal): InspectErrorCode {
  if (err instanceof InspectFailure) return err.code;
  if (signal.aborted) return 'TIMEOUT';
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === BLOCKED_ERRNO) return 'BLOCKED_PRIVATE_ADDRESS';
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || e?.code === 'ABORT_ERR') return 'TIMEOUT';
  if (e?.code === 'ETIMEDOUT') return 'TIMEOUT';
  if (
    e?.code === 'ENOTFOUND' ||
    e?.code === 'EAI_AGAIN' ||
    e?.code === 'EAI_FAIL' ||
    e?.code === 'EAI_NODATA' ||
    e?.code === 'EAI_NONAME'
  ) {
    return 'DNS_FAILED';
  }
  return 'CONNECTION_FAILED';
}

/* ------------------------------------------------------------------ */
/* HTML extraction (regex based — we never build a DOM or run scripts) */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const inner = tag.replace(/^<\s*[a-z0-9]+/i, '').replace(/\/?>$/, '');
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const m of inner.matchAll(re)) {
    const name = (m[1] ?? '').toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return attrs;
}

const CARD_FIELD_RE =
  /cc-?number|card-?number|cardnumber|card_number|cvv|cvc|cc-csc|cc-exp|exp-?date|exp_date|expiry|expiration|exp-?month|exp_month|exp-?year|exp_year|^exp$/i;

function detectCharset(contentType: string, head: Buffer): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const sniff = head.subarray(0, 4096).toString('latin1');
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(sniff)?.[1] ?? 'utf-8';
}

function decodeBody(body: Buffer, contentType: string): string {
  const charset = detectCharset(contentType, body);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(body);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(body);
  }
}

interface PageFacts {
  pageTitle: string | null;
  hasPasswordField: boolean;
  hasCardField: boolean;
  formActionDomains: string[];
}

export function extractPageFacts(html: string, pageUrl: URL): PageFacts {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let pageTitle: string | null = null;
  if (titleMatch?.[1]) {
    const cleaned = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    pageTitle = cleaned ? Array.from(cleaned).slice(0, MAX_TITLE_CHARS).join('') : null;
  }

  // Ignore markup that only looks like inputs: comments, scripts, styles, templates.
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ');

  let hasPasswordField = false;
  let hasCardField = false;
  for (const m of markup.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = parseAttributes(m[0]);
    if ((attrs.get('type') ?? '').trim().toLowerCase() === 'password') hasPasswordField = true;
    for (const key of ['name', 'id', 'autocomplete']) {
      const value = attrs.get(key);
      if (value && value.split(/\s+/).some((token) => CARD_FIELD_RE.test(token))) hasCardField = true;
    }
  }

  const pageDomain = registrableDomain(pageUrl.hostname);
  const formActionDomains = new Set<string>();
  for (const m of markup.matchAll(/<form\b[^>]*>/gi)) {
    const action = (parseAttributes(m[0]).get('action') ?? '').trim();
    if (!/^(?:https?:)?\/\//i.test(action)) continue; // only absolute (or protocol-relative) actions
    try {
      const target = new URL(action, pageUrl);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') continue;
      const domain = registrableDomain(target.hostname);
      if (domain && domain !== pageDomain) formActionDomains.add(domain);
    } catch {
      // unparseable action → ignore
    }
  }

  return { pageTitle, hasPasswordField, hasCardField, formActionDomains: [...formActionDomains] };
}

/* ------------------------------------------------------------------ */
/* Domain age via RDAP                                                 */
/* ------------------------------------------------------------------ */

const RDAP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RDAP_CACHE_MAX = 500;
const rdapCache = new Map<string, { days: number | null; expires: number }>();

export async function domainAgeDays(domain: string): Promise<number | null> {
  if (!domain || !domain.includes('.') || isIpLiteral(domain)) return null;
  const cached = rdapCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.days;
  const remember = (days: number | null): number | null => {
    if (rdapCache.size >= RDAP_CACHE_MAX) {
      const oldest = rdapCache.keys().next().value;
      if (oldest !== undefined) rdapCache.delete(oldest);
    }
    rdapCache.set(domain, { days, expires: Date.now() + RDAP_CACHE_TTL_MS });
    return days;
  };
  try {
    // Fixed bootstrap host (not user-controlled); it redirects to the TLD's RDAP server.
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
      headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (res.status === 404) return remember(null); // e.g. .az has no RDAP service
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: { eventAction?: unknown; eventDate?: unknown }[] };
    const registration = data.events?.find((e) => e.eventAction === 'registration');
    const when = typeof registration?.eventDate === 'string' ? Date.parse(registration.eventDate) : Number.NaN;
    if (!Number.isFinite(when)) return remember(null);
    return remember(Math.max(0, Math.floor((Date.now() - when) / 86_400_000)));
  } catch {
    return null; // network trouble: unknown, and not cached
  }
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

function emptyInspection(url: string): ServerUrlInspection {
  return {
    url,
    finalUrl: null,
    redirects: [],
    httpStatus: null,
    pageTitle: null,
    hasPasswordField: false,
    hasCardField: false,
    formActionDomains: [],
    domainAgeDays: null,
    tls: false,
    error: null,
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Inspects one URL. `rawUrl` is echoed back unchanged in `url` (so the app can match
 * it to the link it extracted); scheme-less input such as `www.x.az` is fetched over https.
 */
export async function inspectUrl(rawUrl: string): Promise<ServerUrlInspection> {
  const input = rawUrl.trim().slice(0, 2048);
  const result = emptyInspection(input);
  try {
    let current: URL;
    try {
      current = validateTarget(normalizeUrlInput(input));
    } catch (err) {
      result.error = err instanceof InspectFailure ? err.code : 'INVALID_URL';
      return result;
    }

    const agePromise = domainAgeDays(registrableDomain(current.hostname));
    const signal = AbortSignal.timeout(OVERALL_BUDGET_MS);
    try {
      let hop = await fetchOnce(current, signal);
      while (isRedirect(hop.status) && hop.location) {
        if (result.redirects.length >= MAX_REDIRECTS) throw new InspectFailure('TOO_MANY_REDIRECTS');
        let next: URL;
        try {
          next = new URL(hop.location, current);
        } catch {
          throw new InspectFailure('INVALID_URL');
        }
        next = validateTarget(next);
        result.redirects.push(next.href);
        current = next;
        hop = await fetchOnce(current, signal);
      }
      result.finalUrl = current.href;
      result.httpStatus = hop.status;
      result.tls = current.protocol === 'https:';
      if (hop.body && hop.body.length > 0) {
        Object.assign(result, extractPageFacts(decodeBody(hop.body, hop.contentType), current));
      }
    } catch (err) {
      result.error = mapError(err, signal);
    }
    result.domainAgeDays = await agePromise;
    return result;
  } catch {
    result.error = result.error ?? 'CONNECTION_FAILED';
    return result;
  }
}
