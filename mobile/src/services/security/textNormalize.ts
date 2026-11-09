/**
 * Text normalisation helpers shared by the rule lexicon, the risk engine and
 * the AI evidence verifier.
 *
 * `foldText` is LENGTH-PRESERVING: every UTF-16 unit of the input maps to
 * exactly one UTF-16 unit of the output. Regexes therefore run on the folded
 * text while match indices stay valid for the ORIGINAL text (highlights,
 * evidence extraction, redaction all share the same offsets).
 *
 * Folding:
 *  - Azerbaijani / Turkish letters → plain Latin: ə→e, ı/I/İ→i, ş→s, ç→c,
 *    ğ→g, ö→o, ü→u (upper- and lowercase)
 *  - curly quotes, guillemets and apostrophe look-alikes → '
 *  - exotic spaces (NBSP, thin space …) → ' '
 *  - everything else → toLowerCase() when that stays a single unit,
 *    otherwise unchanged (Cyrillic is simply lowercased)
 */
import type { ContentLanguage, TextSpan } from '@/types/security';

const FOLD_MAP: Record<string, string> = {
  ə: 'e',
  Ə: 'e',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ö: 'o',
  Ö: 'o',
  ü: 'u',
  Ü: 'u',
  // Apostrophes and quotes.
  '‘': "'", // ‘
  '’': "'", // ’
  '‚': "'", // ‚
  '‛': "'", // ‛
  'ʼ': "'", // ʼ
  '′': "'", // ′
  '`': "'", // `
  '´': "'", // ´
  '“': "'", // “
  '”': "'", // ”
  '„': "'", // „
  '‟': "'", // ‟
  '«': "'", // «
  '»': "'", // »
  '″': "'", // ″
  // Spaces.
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '　': ' ',
};

/** Length-preserving lowercase fold (see file header). */
export function foldText(text: string): string {
  const out: string[] = new Array<string>(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i);
    const mapped = FOLD_MAP[c];
    if (mapped !== undefined) {
      out[i] = mapped;
      continue;
    }
    const lower = c.toLowerCase();
    out[i] = lower.length === 1 ? lower : c;
  }
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* Language detection                                                  */
/* ------------------------------------------------------------------ */

/** Letters that (practically) only Azerbaijani/Turkish Latin script uses. */
const AZ_LETTERS = /[əƏğĞıİşŞçÇöÖüÜ]/g;
/** ə is unique to Azerbaijani among Latin-script languages — counts double. */
const AZ_SCHWA = /[əƏ]/g;
const CYRILLIC = /[Ѐ-ӿ]/g;
const LETTERS = /[A-Za-zÀ-ɏəƏЀ-ӿ]/g;

/** Frequent Azerbaijani words (folded spelling). */
const AZ_WORDS = new Set([
  've', 'bu', 'ucun', 'ile', 'deyil', 'siz', 'sizin', 'size', 'sizi', 'men', 'mene', 'menim', 'sen', 'senin',
  'var', 'yox', 'olub', 'edin', 'edir', 'edirem', 'zehmet', 'olmasa', 'salam', 'sabah', 'indi', 'tecili', 'hec',
  'kime', 'nece', 'amma', 'lakin', 'ki', 'da', 'de', 'cox', 'gun', 'saat', 'sonra', 'evvel', 'qeder', 'kimi',
  'her', 'biz', 'bizim', 'bize', 'gonderin', 'deyin', 'olunur', 'xahis', 'edirik', 'kart', 'kartiniz', 'pul',
  'hesab', 'hesabiniz', 'ana', 'ata', 'menem', 'yeni', 'nomre', 'tez', 'derhal', 'cemi', 'yalniz', 'gore',
]);

/** Frequent English function words (ASCII only, checked on the raw lowercase text). */
const EN_WORDS = new Set([
  'the', 'and', 'you', 'your', 'is', 'are', 'to', 'of', 'for', 'this', 'that', 'with', 'it', 'be', 'will',
  'please', 'have', 'has', 'not', 'we', 'our', 'at', 'my', 'me', 'i', 'an', 'from', 'can', 'do', 'was', 'if',
  'or', 'by', 'now', 'hi', 'hello', 'dear', 'it\'s', 'i\'m', 'don\'t', 'here', 'just', 'what', 'they', 'them',
]);

/**
 * Heuristic content-language detection. Cheap and offline; good enough to
 * pick a speech-to-text hint and to label results — never used for scoring.
 */
export function detectLanguage(text: string): ContentLanguage {
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';

  const letterCount = (trimmed.match(LETTERS) ?? []).length;
  if (letterCount === 0) return 'unknown';

  const cyr = (trimmed.match(CYRILLIC) ?? []).length;
  if (cyr / letterCount >= 0.3) return 'ru';

  const azLetterHits = (trimmed.match(AZ_LETTERS) ?? []).length + (trimmed.match(AZ_SCHWA) ?? []).length;

  const folded = foldText(trimmed);
  const foldedWords = folded.split(/[^a-z']+/).filter(Boolean);
  const rawWords = trimmed
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-zÀ-ɏə']+/)
    .filter(Boolean);

  let azWordHits = 0;
  for (const w of foldedWords) if (AZ_WORDS.has(w)) azWordHits += 1;
  let enWordHits = 0;
  for (const w of rawWords) if (/^[a-z']+$/.test(w) && EN_WORDS.has(w)) enWordHits += 1;

  const tokens = Math.max(1, rawWords.length);
  const azScore = azLetterHits + 2 * azWordHits;
  const azStrong = azScore >= 3 || (azLetterHits >= 1 && azWordHits >= 1);
  const enStrong = enWordHits >= 2 && enWordHits / tokens >= 0.12;

  if (azStrong && enStrong) {
    // Both present: "mixed" only when neither clearly dominates.
    const enShare = enWordHits / tokens;
    const azShare = Math.min(1, azScore / (2 * tokens));
    if (enShare >= 0.2 && azShare >= 0.15) return 'mixed';
    return enShare >= azShare ? 'en' : 'az';
  }
  if (azStrong) return 'az';
  if (enStrong) return 'en';
  if (enWordHits >= 1 && /^[\x00-\x7F]*$/.test(trimmed)) return 'en';
  // Weak evidence: one AZ-specific letter, or two common AZ words ("de"/"ki" alone are ambiguous).
  if (azLetterHits >= 1 || azWordHits >= 2) return 'az';
  return 'other';
}

/* ------------------------------------------------------------------ */
/* Evidence location                                                   */
/* ------------------------------------------------------------------ */

const EDGE_TRIM = /^[\s"'`.,;:!?…()[\]{}<>\-–—]+|[\s"'`.,;:!?…()[\]{}<>\-–—]+$/g;

/** Collapses whitespace runs to one space and keeps a map back to original indices. */
function collapseWhitespace(folded: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < folded.length; i += 1) {
    const c = folded.charAt(i);
    if (/\s/.test(c)) {
      if (!inSpace) {
        chars.push(' ');
        map.push(i);
      }
      inSpace = true;
    } else {
      chars.push(c);
      map.push(i);
      inSpace = false;
    }
  }
  return { text: chars.join(''), map };
}

/**
 * Finds `evidence` inside `text` and returns its span in ORIGINAL indices.
 * Matching is done on folded forms (case/diacritics-insensitive) and tolerates
 * collapsed whitespace plus quotes/punctuation trimmed from the ends.
 * Returns null when the evidence cannot be located (e.g. fabricated quote).
 */
export function locateEvidence(text: string, evidence: string): TextSpan | null {
  if (!text || !evidence) return null;
  const ft = foldText(text);
  const fe = foldText(evidence);
  if (fe.trim().length < 2) return null;

  // 1. Exact folded match (folding is length-preserving → same indices).
  let idx = ft.indexOf(fe);
  if (idx >= 0) return { start: idx, end: idx + fe.length };

  // 2. Trim quotes / punctuation / whitespace at both ends.
  const trimmed = fe.replace(EDGE_TRIM, '');
  if (trimmed.length < 2) return null;
  idx = ft.indexOf(trimmed);
  if (idx >= 0) return { start: idx, end: idx + trimmed.length };

  // 3. Collapse whitespace on both sides, map back to original indices.
  const collapsed = collapseWhitespace(ft);
  const needle = trimmed.replace(/\s+/g, ' ');
  idx = collapsed.text.indexOf(needle);
  if (idx >= 0) {
    const start = collapsed.map[idx];
    const last = collapsed.map[idx + needle.length - 1];
    if (start !== undefined && last !== undefined) return { start, end: last + 1 };
  }
  return null;
}
