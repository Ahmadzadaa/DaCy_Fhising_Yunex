/**
 * Address and hostname policy for the URL "sandbox" (SSRF guard), plus the
 * registrable-domain helper. Pure functions, no network access.
 */
import net from 'node:net';

/* ------------------------------------------------------------------ */
/* IP address classification                                           */
/* ------------------------------------------------------------------ */

function parseIPv4(address: string): number[] | null {
  if (net.isIPv4(address) === false) return null;
  const parts = address.split('.').map((p) => Number.parseInt(p, 10));
  return parts.length === 4 && parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

/** Expands an IPv6 address into 8 hextets (handles `::` and a trailing dotted IPv4). */
function parseIPv6(input: string): number[] | null {
  const address = input.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  if (!net.isIPv6(address)) return null;
  let head = address;
  const tail: number[] = [];
  const lastColon = head.lastIndexOf(':');
  const maybeV4 = head.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    tail.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0));
    head = head.slice(0, lastColon + 1);
    if (head.endsWith('::')) {
      // keep the `::` marker intact
    } else if (head.endsWith(':')) {
      head = head.slice(0, -1);
    }
  }
  const toHextets = (s: string): number[] =>
    s === '' ? [] : s.split(':').map((h) => Number.parseInt(h, 16));
  let hextets: number[];
  const doubleColon = head.indexOf('::');
  if (doubleColon >= 0) {
    const left = toHextets(head.slice(0, doubleColon));
    const right = toHextets(head.slice(doubleColon + 2));
    const fill = 8 - tail.length - left.length - right.length;
    if (fill < 0) return null;
    hextets = [...left, ...new Array<number>(fill).fill(0), ...right, ...tail];
  } else {
    hextets = [...toHextets(head), ...tail];
  }
  if (hextets.length !== 8 || hextets.some((h) => !Number.isInteger(h) || h < 0 || h > 0xffff)) {
    return null;
  }
  return hextets;
}

type V4Range = [a: number, b: number, c: number, d: number, prefix: number];

/** Non-public IPv4 space: private, loopback, link-local, CGNAT, multicast, reserved, docs, unspecified. */
const BLOCKED_V4: readonly V4Range[] = [
  [0, 0, 0, 0, 8], // "this network" / unspecified
  [10, 0, 0, 0, 8], // private
  [100, 64, 0, 0, 10], // CGNAT
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local (cloud metadata lives here)
  [172, 16, 0, 0, 12], // private
  [192, 0, 0, 0, 24], // IETF protocol assignments
  [192, 0, 2, 0, 24], // TEST-NET-1
  [192, 88, 99, 0, 24], // 6to4 relay anycast
  [192, 168, 0, 0, 16], // private
  [198, 18, 0, 0, 15], // benchmarking
  [198, 51, 100, 0, 24], // TEST-NET-2
  [203, 0, 113, 0, 24], // TEST-NET-3
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // reserved + broadcast
];

function v4ToInt(p: readonly number[]): number {
  return (((p[0] ?? 0) << 24) >>> 0) + ((p[1] ?? 0) << 16) + ((p[2] ?? 0) << 8) + (p[3] ?? 0);
}

function isBlockedV4(parts: readonly number[]): boolean {
  const value = v4ToInt(parts);
  return BLOCKED_V4.some(([a, b, c, d, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return ((value & mask) >>> 0) === ((v4ToInt([a, b, c, d]) & mask) >>> 0);
  });
}

function hextetsMatch(h: readonly number[], prefix: readonly number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; i < 8 && remaining > 0; i += 1) {
    const take = Math.min(16, remaining);
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if (((h[i] ?? 0) & mask) !== ((prefix[i] ?? 0) & mask)) return false;
    remaining -= take;
  }
  return true;
}

function embeddedV4(h: readonly number[]): number[] {
  const hi = h[6] ?? 0;
  const lo = h[7] ?? 0;
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function isBlockedV6(h: readonly number[]): boolean {
  // IPv4-mapped ::ffff:a.b.c.d → judge the embedded IPv4 address.
  if (hextetsMatch(h, [0, 0, 0, 0, 0, 0xffff], 96)) return isBlockedV4(embeddedV4(h));
  // NAT64 well-known prefix 64:ff9b::/96 → judge the embedded IPv4 address.
  if (hextetsMatch(h, [0x64, 0xff9b, 0, 0, 0, 0], 96)) return isBlockedV4(embeddedV4(h));
  // Allowlist: only global unicast 2000::/3 may be public. This excludes ::, ::1,
  // ::/96 (IPv4-compatible), 64:ff9b:1::/48, 100::/64, fc00::/7, fe80::/10, fec0::/10, ff00::/8.
  if (!hextetsMatch(h, [0x2000], 3)) return true;
  // Special-purpose blocks inside 2000::/3.
  if (hextetsMatch(h, [0x2001, 0x0000], 23)) return true; // IETF protocol assignments (incl. Teredo)
  if (hextetsMatch(h, [0x2001, 0x0db8], 32)) return true; // documentation
  if (hextetsMatch(h, [0x2002], 16)) return true; // 6to4 (embeds arbitrary IPv4)
  if (hextetsMatch(h, [0x3fff, 0x0000], 20)) return true; // documentation (RFC 9637)
  return false;
}

/**
 * True when `address` (an IPv4 or IPv6 literal) is not a public unicast address.
 * Unparseable input is treated as blocked.
 */
export function isBlockedAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isBlockedV4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isBlockedV6(v6);
  return true;
}

/** Strips IPv6 brackets from a URL hostname. */
export function bareHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

export function isIpLiteral(hostname: string): boolean {
  return net.isIP(bareHostname(hostname)) !== 0;
}

/** Hostnames that always point at internal infrastructure, regardless of DNS. */
export function isInternalHostname(hostname: string): boolean {
  const host = bareHostname(hostname);
  if (!host.includes('.')) return true; // single-label names resolve via search domains
  return /(?:^|\.)(?:localhost|local|internal|intranet|lan|home\.arpa|localdomain)$/.test(host);
}

/* ------------------------------------------------------------------ */
/* Registrable domain                                                  */
/* ------------------------------------------------------------------ */

/** Small multi-label public-suffix list — enough for the AZ/EU/TR/RU demo audience + common hosts. */
export const MULTI_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  'com.az',
  'net.az',
  'org.az',
  'gov.az',
  'edu.az',
  'info.az',
  'biz.az',
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.tr',
  'gov.tr',
  'com.ru',
  'co.jp',
  'com.au',
  'com.br',
  'co.in',
  'com.cn',
  'github.io',
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'herokuapp.com',
  'blogspot.com',
  'workers.dev',
]);

/**
 * "login.kapitalbank.az" → "kapitalbank.az", "a.b.example.com.az" → "example.com.az",
 * "user.github.io" → "user.github.io". IP literals are returned as-is.
 */
export function registrableDomain(hostname: string): string {
  const host = bareHostname(hostname);
  if (!host || net.isIP(host) !== 0) return host;
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}
