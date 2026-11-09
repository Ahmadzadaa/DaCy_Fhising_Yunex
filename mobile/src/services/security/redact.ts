/**
 * Length-preserving redaction of secrets before anything is stored locally.
 *
 * Every masked character is replaced 1:1 by "•", so character offsets of
 * indicator spans stay valid and highlights still line up after redaction.
 *
 * Masked:
 *  - card numbers (13–19 digits, optional spaces/dashes) — last 4 digits kept
 *  - IBANs (AZ + 26 chars and generic IBAN shapes) — first 4 and last 4 kept
 *  - 4–8 digit codes near code/PIN/CVV/password keywords, and any standalone 6-digit number
 *  - 3–4 digit CVV/CVC values next to the keyword
 *  - the token following "password:", "parol:", "şifrə:"
 */

const MASK = '•';

function maskRange(
  chars: string[],
  start: number,
  end: number,
  keep: (index: number, char: string) => boolean,
  maskable: RegExp = /[0-9A-Za-z]/,
): void {
  for (let i = start; i < end; i += 1) {
    const c = chars[i];
    if (c !== undefined && maskable.test(c) && !keep(i, c)) chars[i] = MASK;
  }
}

const CODE_KEYWORDS =
  /(otp|code|kod|kodu|pin|cvv|cvc|parol|password|passcode|şifrə|sifre|şifre|verification|təsdiq|tesdiq|sms)/i;

export function redactSensitive(text: string): string {
  // split('') keeps UTF-16 units, matching JS string indices used by spans.
  const chars = text.split('');

  // Card numbers: 13–19 digits with optional single spaces/dashes between groups.
  const cardRe = /(?<![0-9])(?:[0-9][ -]?){12,18}[0-9](?![0-9])/g;
  for (let m = cardRe.exec(text); m; m = cardRe.exec(text)) {
    const digitsIdx: number[] = [];
    for (let i = m.index; i < m.index + m[0].length; i += 1) if (/[0-9]/.test(text[i] ?? '')) digitsIdx.push(i);
    if (digitsIdx.length < 13 || digitsIdx.length > 19) continue;
    const keepFrom = digitsIdx[digitsIdx.length - 4] ?? Number.MAX_SAFE_INTEGER;
    maskRange(chars, m.index, m.index + m[0].length, (i) => i >= keepFrom);
  }

  // IBAN-like: two letters, two digits, then 10–30 alphanumerics.
  const ibanRe = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}\b/g;
  for (let m = ibanRe.exec(text); m; m = ibanRe.exec(text)) {
    const start = m.index;
    const end = m.index + m[0].length;
    maskRange(chars, start, end, (i) => i < start + 4 || i >= end - 4);
  }

  // Codes near keywords (within 40 chars before or after).
  const codeRe = /(?<![0-9])[0-9]{3,8}(?![0-9])/g;
  for (let m = codeRe.exec(text); m; m = codeRe.exec(text)) {
    const len = m[0].length;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const after = text.slice(m.index + len, m.index + len + 40);
    const nearKeyword = CODE_KEYWORDS.test(before) || CODE_KEYWORDS.test(after);
    const standaloneSix = len === 6;
    const cvvLike = len <= 4 && /(cvv|cvc|pin)\s*[:\-]?\s*$/i.test(before);
    if ((len >= 4 && nearKeyword) || standaloneSix || cvvLike) {
      maskRange(chars, m.index, m.index + len, () => false);
    }
  }

  // "password: xyz" style secrets.
  const secretRe = /(password|parol|şifrə|sifre|passcode)\s*[:=]\s*(\S+)/gi;
  for (let m = secretRe.exec(text); m; m = secretRe.exec(text)) {
    const value = m[2] ?? '';
    const valueStart = m.index + m[0].length - value.length;
    maskRange(chars, valueStart, valueStart + value.length, () => false, /\S/);
  }

  return chars.join('');
}
