/**
 * DaCy deterministic risk engine.
 *
 * Pure TypeScript (no react-native imports) so it runs on the phone, offline,
 * and in Node unit tests. The final 0–100 score is ALWAYS computed here; the
 * AI layer can only contribute indicators, which are verified and capped.
 *
 * Scoring (fully deterministic):
 *  1. Rule signals: bilingual lexicon (lexicon.ts) on folded text, one clause
 *     at a time, with negation / quoting resolution (see detectRuleSignals).
 *  2. AI indicators (optional): evidence must be found in the text with
 *     locateEvidence. Unverified request-type indicators (OTP, card, password,
 *     money, remote access, child-safety requests…) are dropped; other
 *     unverified types count at half confidence with no span.
 *     AI confidence is capped at 0.85. AI SUSPICIOUS_URL is ignored unless the
 *     text contains a non-official link.
 *  3. One Indicator per IndicatorType. Rules + AI on the same type =
 *     corroborated: confidence = min(1, max(rule, ai) + 0.1).
 *  4. points = round(weight × confidence) (weights in constants/indicators.ts).
 *     SUSPICIOUS_URL points = URL_SEVERITY_POINTS[worst link severity]
 *       + 5 for every extra medium/high link signal across all links, max 45.
 *     PROTECTIVE_ADVICE (−15 × confidence) counts only when NO request-type
 *     indicator exists (a scam that quotes "never share your code" while
 *     asking for it is not made safer by the quote).
 *     Child-safety requests (PERSONAL_IMAGE_REQUEST, MEETING_REQUEST,
 *     SEXTORTION_THREAT) are request types too (see lexicon.CHILD_REQUEST_TYPES).
 *  5. Combination bonuses, each at most once:
 *       sensitive request (OTP/CARD/CREDENTIAL/REMOTE_ACCESS/SAFE_ACCOUNT)
 *         + pressure (URGENCY/THREAT/AUTHORITY)                     +15
 *       FAMILY_EMERGENCY + MONEY_TRANSFER_REQUEST                   +20
 *       SECRECY + (money or sensitive request)                      +10
 *       high-severity link + (AUTHORITY/THREAT/PRIZE/UPFRONT/URGENCY) +10
 *       SECRECY + PERSONAL_IMAGE_REQUEST                            +15
 *       (TRUST_GROOMING or GIFT_GROOMING) + PERSONAL_IMAGE_REQUEST  +10
 *       MEETING_REQUEST + SECRECY                                   +15
 *  6. Psychological-only cap: when every positive indicator is psychological
 *     or an early grooming signal (TRUST_GROOMING, GIFT_GROOMING,
 *     PERSONAL_INFO_PROBE) — no request, no financial lure, no link of medium+
 *     severity — the score is capped at 40: pressure words alone never make a
 *     message "high".
 *  7. SEXTORTION_THREAT present → the score is at least 80 (always critical).
 *  8. Clamp to an integer 0–100; band: 0–24 low · 25–49 moderate ·
 *     50–74 high · 75–100 critical.
 */
import { BAND_META, INDICATOR_META, URL_SEVERITY_POINTS, URL_SIGNAL_LABEL } from '@/constants/indicators';
import type {
  AiIndicator,
  ConfidenceLevel,
  Indicator,
  IndicatorSource,
  IndicatorType,
  Localized,
  RiskAssessment,
  RiskBand,
  RiskCategories,
  TextSpan,
  UrlReport,
  UrlSignalSeverity,
} from '@/types/security';
import { INDICATOR_TYPES } from '@/types/security';

import {
  CHILD_REQUEST_TYPES,
  CLAUSE_SPLIT_RE,
  COERCION_CONTEXT_RE,
  DIRECT_OBJECT_RE,
  FAMILY_TARGET_RE,
  LEXICON,
  REQUEST_TYPES,
  SENSITIVE_OBJECT_RE,
  type PatternKind,
} from './lexicon';
import { foldText, locateEvidence } from './textNormalize';
import { analyzeUrlsInText, compareSeverity } from './urlAnalyzer';

export const ENGINE_VERSION = 'dacy-risk-1.2.0';

/** Keep in sync with RISK_THRESHOLDS in constants/theme.ts (not imported: theme pulls in react-native). */
const THRESHOLDS = { moderate: 25, high: 50, critical: 75 } as const;
const AI_CONFIDENCE_CAP = 0.85;
const CORROBORATION_BONUS = 0.1;
const URL_EXTRA_SIGNAL_POINTS = 5;
const URL_POINTS_CAP = 45;
const PSYCHOLOGICAL_ONLY_CAP = 40;
const SEXTORTION_FLOOR = 80;

const REQUEST_SET = new Set<IndicatorType>(REQUEST_TYPES);
const CHILD_REQUEST_SET = new Set<IndicatorType>(CHILD_REQUEST_TYPES);
/** Child-safety signals that keep "don't tell X" as grooming secrecy (never protective advice). */
const CHILD_CONTEXT_SET = new Set<IndicatorType>([...CHILD_REQUEST_TYPES, 'TRUST_GROOMING', 'GIFT_GROOMING']);
/** Early grooming signals: on their own they are treated like psychological pressure (capped). */
const SOFT_CHILD_SET = new Set<IndicatorType>(['TRUST_GROOMING', 'GIFT_GROOMING', 'PERSONAL_INFO_PROBE']);
const SENSITIVE_SET = new Set<IndicatorType>([
  'OTP_REQUEST',
  'CARD_DATA_REQUEST',
  'CREDENTIAL_REQUEST',
  'REMOTE_ACCESS_REQUEST',
  'SAFE_ACCOUNT_TRANSFER',
]);
const PRESSURE_SET = new Set<IndicatorType>(['URGENCY', 'THREAT_OR_FEAR', 'AUTHORITY_IMPERSONATION']);
const LINK_LURE_SET = new Set<IndicatorType>([
  'AUTHORITY_IMPERSONATION',
  'THREAT_OR_FEAR',
  'PRIZE_LURE',
  'UPFRONT_FEE',
  'URGENCY',
]);

/* ------------------------------------------------------------------ */
/* Rule signals                                                        */
/* ------------------------------------------------------------------ */

export interface RuleSignal {
  type: IndicatorType;
  evidence: string;
  span: TextSpan;
  confidence: number;
  /** True when an unambiguous (`hard`) child-safety pattern of this type matched (lexicon header). */
  hard?: boolean;
}

export interface RuleSignalOptions {
  /**
   * The conversation already contains a photo request (DaCy Kids). Unconditional
   * photo-sharing statements (`bare` patterns) then count as a sextortion threat
   * even without a coercive structure in this message.
   */
  imageRequested?: boolean;
}

interface RawMatch {
  type: IndicatorType;
  start: number;
  end: number;
  confidence: number;
  kind?: PatternKind;
  np: boolean;
  hard: boolean;
  bare: boolean;
  direct: boolean;
  suppressed: boolean;
}

/** The folded clause (sentence) that contains [start, end). */
function clauseAround(folded: string, start: number, end: number): string {
  for (const c of splitClauses(folded)) if (c.start <= start && end <= c.end + 1) return folded.slice(c.start, c.end);
  return folded.slice(Math.max(0, start - 80), Math.min(folded.length, end + 80));
}

/** Splits folded text into clauses: sentences, further split before "but / amma / ancaq / lakin". */
function splitClauses(folded: string): TextSpan[] {
  const units: TextSpan[] = [];
  let start = 0;
  for (const m of folded.matchAll(CLAUSE_SPLIT_RE)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > start) units.push({ start, end });
    start = end;
  }
  if (start < folded.length) units.push({ start, end: folded.length });
  return units;
}

const overlaps = (a: RawMatch, b: RawMatch) => a.start < b.end && b.start < a.end;

/**
 * Words that turn a mention of sensitive data into a request (folded text, EN + AZ):
 * "tell / read / send me…", "deyin / oxuyun / göndərin / mənə…". Without one, "CVV" or
 * "the code from the SMS" is only a MENTION (a bank explaining, a warning, small talk).
 * Bare AZ "de" (= "also") and "want" are left out on purpose: they are too common.
 */
const ASK_CUE_RE =
  /\b(?:tell|read|send|give|say|share|provide|enter|type|confirm|dictate|repeat|spell|need|what\s+is|what's|let\s+me\s+know|deyin|soyleyin|soyle|oxuyun|oxuyasiniz|yazin|gonderin|gonder|verin|bildirin|bildir|tesdiqleyin|tesdiqle|daxil\s+edin|diqte\s+edin|qeyd\s+edin|lazimdir|lazim|nedir|mene|bize)\b/;
/** Confidence of a sensitive-data mention with no request verb: visible, but never alarming. */
export const MENTION_CONFIDENCE = 0.25;
const isRequest = (m: RawMatch) => REQUEST_SET.has(m.type) && m.kind === undefined;

/**
 * Applies protective advice: suppresses non-direct requests that overlap it or are mention-only.
 * A sextortion threat is never neutralised: advice cannot make a threat safe.
 */
function applyAdvice(matches: RawMatch[], advice: RawMatch[]): void {
  for (const req of matches) {
    if (!isRequest(req) || req.suppressed || req.direct || req.type === 'SEXTORTION_THREAT') continue;
    if (advice.some((a) => req.np || overlaps(a, req))) req.suppressed = true;
  }
}

/**
 * Runs the bilingual lexicon and returns the strongest match per indicator
 * type (sorted by position). Resolution, per clause:
 *  0. benign hard-negative contexts ("a photo of the homework page") suppress
 *     overlapping matches of the same type and are then dropped;
 *  1. "never ask" statements suppress every request in the clause (except
 *     child-safety requests: "I'd never ask you for anything bad" is grooming);
 *  2. third-person scam descriptions ("fraudsters pretend…", "dələduzlar
 *     özlərini … təqdim edir") suppress all non-first-person signals;
 *  3. protective advice ("never share your code", "kodu heç kimə deməyin")
 *     suppresses overlapping or mention-only requests (not "send ME the code",
 *     and never a sextortion threat);
 *  4. "don't tell X" becomes PROTECTIVE_ADVICE when the clause is about codes /
 *     passwords / card data and contains no real request — otherwise SECRECY.
 *     It always stays SECRECY when X is a parent or family member ("don't tell
 *     your mom", "anana demə") or the clause has a child-safety signal (a Robux
 *     or gift-card "code" is a grooming gift, not a bank code).
 * Finally, for the whole message: `bare` photo-sharing statements are kept only
 * with a coercive structure (COERCION_CONTEXT_RE), a photo request in the same
 * message, or `options.imageRequested` (an earlier photo request in the chat).
 */
export function detectRuleSignals(text: string, options: RuleSignalOptions = {}): RuleSignal[] {
  if (!text || !text.trim()) return [];
  const folded = foldText(text);
  const clauses = splitClauses(folded);
  const byClause: RawMatch[][] = [];

  for (const clause of clauses) {
    const fSlice = folded.slice(clause.start, clause.end);
    const oSlice = text.slice(clause.start, clause.end);
    const matches: RawMatch[] = [];
    for (const pat of LEXICON) {
      const hay = pat.onOriginal ? oSlice : fSlice;
      for (const m of hay.matchAll(pat.re)) {
        const raw = m[0];
        if (!raw || !raw.trim()) continue;
        const lead = raw.length - raw.trimStart().length;
        const trail = raw.length - raw.trimEnd().length;
        const start = clause.start + (m.index ?? 0) + lead;
        const end = clause.start + (m.index ?? 0) + raw.length - trail;
        matches.push({
          type: pat.type,
          start,
          end,
          confidence: pat.confidence,
          kind: pat.kind,
          np: pat.np === true,
          hard: pat.hard === true,
          bare: pat.bare === true,
          direct: REQUEST_SET.has(pat.type) && DIRECT_OBJECT_RE.test(folded.slice(start, end)),
          suppressed: false,
        });
      }
    }

    // 0. Benign context for a type (homework photo …) → overlapping matches of that type are not real.
    for (const b of matches) {
      if (b.kind !== 'benign') continue;
      for (const m of matches) if (m !== b && m.kind !== 'benign' && m.type === b.type && overlaps(b, m)) m.suppressed = true;
      b.suppressed = true;
    }
    // 1. Institutional "we never ask" → no (financial) request in this clause is real.
    if (matches.some((m) => m.kind === 'neverAsk')) {
      for (const m of matches) if (isRequest(m) && !CHILD_REQUEST_SET.has(m.type)) m.suppressed = true;
    }
    // 2. Reported speech about scammers → only first-person requests survive.
    if (matches.some((m) => m.kind === 'warning')) {
      for (const m of matches) if (m.type !== 'PROTECTIVE_ADVICE' && !m.direct) m.suppressed = true;
    }
    // 3. Explicit protective advice.
    applyAdvice(
      matches,
      matches.filter((m) => m.kind === 'advice' && !m.suppressed),
    );
    // 4. "Don't tell …": secrecy pressure or protective advice?
    const converted: RawMatch[] = [];
    const realRequest = matches.some((m) => isRequest(m) && !m.suppressed && !m.np);
    const aboutSecrets = SENSITIVE_OBJECT_RE.test(fSlice);
    const childContext = matches.some((m) => CHILD_CONTEXT_SET.has(m.type) && m.kind === undefined && !m.suppressed);
    for (const m of matches) {
      if (m.kind !== 'tellNeg' || m.suppressed) continue;
      const fromFamily = FAMILY_TARGET_RE.test(folded.slice(m.start, m.end));
      if (!realRequest && aboutSecrets && !childContext && !fromFamily) {
        m.type = 'PROTECTIVE_ADVICE';
        m.kind = 'advice';
        converted.push(m);
      } else if (fromFamily || childContext) {
        // "…kodu göndərərəm, anana demə": the same words also matched a "don't share the code"
        // advice pattern — it is grooming secrecy, not advice.
        for (const a of matches) if (a.kind === 'advice' && !a.suppressed && overlaps(a, m)) a.suppressed = true;
      }
    }
    if (converted.length > 0) applyAdvice(matches, converted);

    // 4b. "CVV kodunu deyin" / "PIN code": a card code, not an SMS one-time code.
    for (const m of matches) {
      if (m.type !== 'OTP_REQUEST' || m.suppressed) continue;
      if (/\b(?:cvv\w*|cvc\w*|pin\w*)\s*(?:-?\s*)?$/.test(folded.slice(Math.max(clause.start, m.start - 14), m.start)) || /\b(?:cvv|cvc|pin)\b/.test(folded.slice(m.start, m.end))) {
        m.suppressed = true;
      }
    }

    // 5. Mention without a request: a noun phrase like "CVV" or "the code from the SMS" in a
    //    clause with no asking verb ("we want to inform you about card numbers and CVV")
    //    is a mention, not a request — it is kept at a low confidence and never alarms.
    if (!ASK_CUE_RE.test(fSlice) && !matches.some((m) => isRequest(m) && !m.np && !m.suppressed)) {
      for (const m of matches) if (isRequest(m) && m.np && !m.suppressed) m.confidence = Math.min(m.confidence, MENTION_CONFIDENCE);
    }

    byClause.push(matches);
  }

  // `bare` photo-sharing statements are a threat only in a coercive context (see lexicon header).
  const all = byClause.flat();
  if (all.some((m) => m.bare && !m.suppressed)) {
    const coercive =
      options.imageRequested === true ||
      COERCION_CONTEXT_RE.test(folded) ||
      all.some((m) => m.type === 'PERSONAL_IMAGE_REQUEST' && m.kind === undefined && !m.suppressed);
    if (!coercive) for (const m of all) if (m.bare) m.suppressed = true;
  }

  // Strongest match per type: highest confidence, then earliest, then longest.
  const best = new Map<IndicatorType, RawMatch>();
  const hardTypes = new Set<IndicatorType>();
  for (const m of all) {
    if (m.suppressed) continue;
    if (m.hard && m.kind === undefined) hardTypes.add(m.type);
    const prev = best.get(m.type);
    if (
      !prev ||
      m.confidence > prev.confidence ||
      (m.confidence === prev.confidence && (m.start < prev.start || (m.start === prev.start && m.end > prev.end)))
    ) {
      best.set(m.type, m);
    }
  }
  return [...best.values()]
    .sort((a, b) => a.start - b.start)
    .map((m) => ({
      type: m.type,
      evidence: text.slice(m.start, m.end),
      span: { start: m.start, end: m.end },
      confidence: m.confidence,
      ...(hardTypes.has(m.type) ? { hard: true } : {}),
    }));
}

/* ------------------------------------------------------------------ */
/* Bands                                                               */
/* ------------------------------------------------------------------ */

export function scoreToBand(score: number): RiskBand {
  if (score >= THRESHOLDS.critical) return 'critical';
  if (score >= THRESHOLDS.high) return 'high';
  if (score >= THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

export type AssessContext = 'message' | 'call' | 'screen';

export interface AssessInput {
  text: string;
  context: AssessContext;
  /** undefined/null = AI did not run; [] = AI ran and found nothing */
  aiIndicators?: AiIndicator[] | null;
  /** If omitted, computed with analyzeUrlsInText(text). */
  urlReports?: UrlReport[];
  aiBenignContext?: boolean;
}

interface Evidence {
  confidence: number;
  evidence: string;
  span?: TextSpan;
}

interface Accumulator {
  type: IndicatorType;
  rule?: Evidence;
  ai?: Evidence;
  url?: Evidence & { points: number; severity: UrlSignalSeverity; detail: Localized };
}

const URL_SEVERITY_CONFIDENCE: Record<UrlSignalSeverity, number> = { info: 0.5, low: 0.6, medium: 0.8, high: 0.95 };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

const COMBO_LABELS = {
  sensitive_pressure: {
    en: 'Sensitive request under pressure',
    az: 'Təzyiq altında həssas məlumat tələbi',
  },
  family_money: {
    en: 'Relative-in-trouble story + money request',
    az: 'Çətin vəziyyətdə qohum hekayəsi + pul tələbi',
  },
  secrecy_request: {
    en: 'Secrecy + money or data request',
    az: 'Gizlilik tələbi + pul və ya məlumat tələbi',
  },
  dangerous_link_lure: {
    en: 'Dangerous link + pressure or lure',
    az: 'Təhlükəli link + təzyiq və ya tələ',
  },
  secrecy_image: {
    en: 'Secrecy + request for personal photos',
    az: 'Gizlilik tələbi + şəxsi şəkil tələbi',
  },
  grooming_image: {
    en: 'Trust-building or gifts + photo request',
    az: 'Etibar qazanma və ya hədiyyə + şəkil tələbi',
  },
  secret_meeting: {
    en: 'Secret meeting request',
    az: 'Gizli görüş tələbi',
  },
} satisfies Record<string, Localized>;

const COMBO_POINTS = {
  sensitive_pressure: 15,
  family_money: 20,
  secrecy_request: 10,
  dangerous_link_lure: 10,
  secrecy_image: 15,
  grooming_image: 10,
  secret_meeting: 15,
} as const;

function bandDefault(band: RiskBand, context: AssessContext): Localized {
  if (band === 'critical' || band === 'high') {
    return context === 'call'
      ? {
          en: 'Do not share any data or money; end the call and verify through the official number.',
          az: 'Heç bir məlumat və ya pul verməyin; zəngi bitirin və rəsmi nömrə ilə özünüz yoxlayın.',
        }
      : {
          en: 'Do not share any data or money; do not reply, and verify through the official number.',
          az: 'Heç bir məlumat və ya pul verməyin; cavab yazmayın və rəsmi nömrə ilə özünüz yoxlayın.',
        };
  }
  if (band === 'moderate') {
    return {
      en: 'Verify through an official channel before acting.',
      az: 'Hərəkət etməzdən əvvəl rəsmi kanal vasitəsilə yoxlayın.',
    };
  }
  return {
    en: 'If something still feels wrong, verify through the official app or number.',
    az: 'Nəsə yenə də şübhəli görünürsə, rəsmi tətbiq və ya nömrə vasitəsilə yoxlayın.',
  };
}

const CONFIDENCE_REASONS = {
  short: {
    en: 'The text is very short, so there is little to analyse.',
    az: 'Mətn çox qısadır, təhlil üçün az məlumat var.',
  },
  corroborated: {
    en: 'Rule-based checks and the AI analysis independently found the same signals.',
    az: 'Qayda əsaslı yoxlama və süni intellekt təhlili eyni əlamətləri bir-birindən asılı olmadan tapdı.',
  },
  bothClean: {
    en: 'Neither the rule-based checks nor the AI analysis found anything suspicious.',
    az: 'Nə qayda əsaslı yoxlama, nə də süni intellekt təhlili şübhəli heç nə tapmadı.',
  },
  aiPartial: {
    en: 'Rule-based checks and AI analysis were both used, but their findings only partly overlap.',
    az: 'Həm qayda əsaslı yoxlama, həm də süni intellekt təhlili istifadə olundu, lakin nəticələr yalnız qismən üst-üstə düşür.',
  },
  aiCleanShort: {
    en: 'Both checks found nothing suspicious, but the text is short.',
    az: 'Hər iki yoxlama şübhəli heç nə tapmadı, lakin mətn qısadır.',
  },
  rulesSeveral: {
    en: 'Several independent rule-based signals were found; AI analysis was not used.',
    az: 'Bir neçə müstəqil qayda əsaslı əlamət tapıldı; süni intellekt təhlili istifadə olunmayıb.',
  },
  rulesOnly: {
    en: 'Only the offline rule engine was used and it found few signals.',
    az: 'Yalnız oflayn qayda mühərriki istifadə olundu və az əlamət tapdı.',
  },
} satisfies Record<string, Localized>;

const typeOrder = (t: IndicatorType) => INDICATOR_TYPES.indexOf(t);

/** Builds the SUSPICIOUS_URL evidence from link reports (null when no link is at least 'low'). */
function urlEvidence(reports: UrlReport[]): Accumulator['url'] | null {
  let worst: UrlReport | null = null;
  let mediumHigh = 0;
  for (const r of reports) {
    for (const s of r.signals) if (s.severity === 'medium' || s.severity === 'high') mediumHigh += 1;
    if (compareSeverity(r.severity, 'low') < 0) continue;
    if (!worst || compareSeverity(r.severity, worst.severity) > 0) worst = r;
  }
  if (!worst) return null;
  const extra = Math.max(0, mediumHigh - 1);
  const points = Math.min(URL_POINTS_CAP, URL_SEVERITY_POINTS[worst.severity] + URL_EXTRA_SIGNAL_POINTS * extra);
  const top = worst.signals.find((s) => s.severity === worst.severity) ?? worst.signals[0];
  return {
    confidence: URL_SEVERITY_CONFIDENCE[worst.severity],
    evidence: worst.input,
    ...(worst.span ? { span: worst.span } : {}),
    points,
    severity: worst.severity,
    detail: top ? URL_SIGNAL_LABEL[top.type] : INDICATOR_META.SUSPICIOUS_URL.label,
  };
}

export function assessRisk(input: AssessInput): RiskAssessment {
  const text = input.text ?? '';
  const folded = foldText(text);
  const context = input.context;
  const aiRan = Array.isArray(input.aiIndicators);
  const urlReports = input.urlReports ?? analyzeUrlsInText(text);

  const acc = new Map<IndicatorType, Accumulator>();
  const slot = (type: IndicatorType): Accumulator => {
    let a = acc.get(type);
    if (!a) {
      a = { type };
      acc.set(type, a);
    }
    return a;
  };

  // 1. Rules.
  for (const s of detectRuleSignals(text)) {
    slot(s.type).rule = { confidence: s.confidence, evidence: s.evidence, span: s.span };
  }

  // 2. Links.
  const url = urlEvidence(urlReports);
  if (url) slot('SUSPICIOUS_URL').url = url;

  // 3. AI indicators (verified + capped).
  const hasNonOfficialLink = urlReports.some((r) => !r.signals.some((s) => s.type === 'OFFICIAL_DOMAIN') || r.severity !== 'info');
  let aiAccepted = 0;
  for (const ai of input.aiIndicators ?? []) {
    if (!ai || !(ai.type in INDICATOR_META)) continue;
    if (ai.type === 'SUSPICIOUS_URL' && !hasNonOfficialLink) continue;
    let confidence = Math.min(clamp01(ai.confidence), AI_CONFIDENCE_CAP);
    const quote = typeof ai.evidence === 'string' ? ai.evidence : '';
    const span = quote ? locateEvidence(text, quote) : null;
    // A request (code, card, password, money…) is only accepted when the quote
    // is really in the text: an unverifiable "they asked for your CVV" must
    // never raise an alarm on its own. Other unverified types count at half.
    if (!span && (REQUEST_SET.has(ai.type) || CHILD_REQUEST_SET.has(ai.type))) continue;
    if (!span) confidence /= 2;
    // The AI sometimes reads "we want to give you information about card numbers" as a
    // request. A financial request must have an asking verb in its sentence.
    if (span && REQUEST_SET.has(ai.type) && !CHILD_REQUEST_SET.has(ai.type) && !ASK_CUE_RE.test(clauseAround(folded, span.start, span.end))) {
      confidence = Math.min(confidence, MENTION_CONFIDENCE);
    }
    if (confidence <= 0) continue;
    const evidence: Evidence = span
      ? { confidence, evidence: text.slice(span.start, span.end), span }
      : { confidence, evidence: quote.slice(0, 200) };
    const a = slot(ai.type);
    if (!a.ai || evidence.confidence > a.ai.confidence || (evidence.confidence === a.ai.confidence && span && !a.ai.span)) {
      a.ai = evidence;
    }
    aiAccepted += 1;
  }

  // 4. Merge into one indicator per type.
  const hasRequest = [...acc.values()].some((a) => REQUEST_SET.has(a.type));
  const indicators: Indicator[] = [];
  for (const a of acc.values()) {
    const meta = INDICATOR_META[a.type];
    const sources: IndicatorSource[] = [];
    if (a.rule) sources.push('rules');
    if (a.url) sources.push('url_scan');
    if (a.ai) sources.push('ai');

    const primary = a.rule ?? a.url;
    let confidence: number;
    if (primary && a.ai) confidence = Math.min(1, Math.max(primary.confidence, a.ai.confidence) + CORROBORATION_BONUS);
    else confidence = (primary ?? a.ai)?.confidence ?? 0;
    confidence = round2(confidence);

    let points: number;
    if (a.type === 'SUSPICIOUS_URL') {
      const aiPoints = a.ai ? Math.round(URL_SEVERITY_POINTS.medium * a.ai.confidence) : 0;
      points = Math.max(a.url?.points ?? 0, aiPoints);
    } else if (a.type === 'PROTECTIVE_ADVICE') {
      points = hasRequest ? 0 : Math.round(meta.weight * confidence);
    } else if (REQUEST_SET.has(a.type) && confidence <= MENTION_CONFIDENCE) {
      // Only mentioned ("…card number and CVV…" with no asking verb): listed, but adds no risk.
      points = 0;
    } else {
      points = Math.round(meta.weight * confidence);
    }
    const mention = REQUEST_SET.has(a.type) && confidence <= MENTION_CONFIDENCE;
    if (points === 0 && a.type !== 'PROTECTIVE_ADVICE' && !mention) continue;

    const ev =
      a.rule ?? a.url ?? (a.ai?.span ? a.ai : undefined) ?? a.ai ?? { confidence: 0, evidence: '' };
    // Normalise "-0" for protective advice that was neutralised by a request.
    if (Object.is(points, -0)) points = 0;
    indicators.push({
      id: `ind_${a.type.toLowerCase()}`,
      type: a.type,
      category: meta.category,
      sources,
      evidence: ev.evidence,
      ...(ev.span ? { span: ev.span } : {}),
      confidence,
      points,
      ...(a.type === 'SUSPICIOUS_URL' && a.url ? { detail: a.url.detail } : {}),
    });
  }
  indicators.sort((x, y) => Math.abs(y.points) - Math.abs(x.points) || typeOrder(x.type) - typeOrder(y.type));

  // 5. Combination bonuses (positive indicators only).
  // A request counts for a combination only when it is a real request, not a bare
  // mention ("a bank calls and says the words card / CVV" is not "asks for your CVV").
  const positive = indicators.filter((i) => i.points > 0 && !(REQUEST_SET.has(i.type) && i.confidence <= MENTION_CONFIDENCE));
  const has = (t: IndicatorType) => positive.some((i) => i.type === t);
  const hasAny = (set: Set<IndicatorType>) => positive.some((i) => set.has(i.type));
  const urlHigh = has('SUSPICIOUS_URL') && url?.severity === 'high';
  const urlMediumPlus = has('SUSPICIOUS_URL') && url !== null && url !== undefined && compareSeverity(url.severity, 'medium') >= 0;

  const combos: RiskAssessment['combos'] = [];
  const addCombo = (id: keyof typeof COMBO_POINTS) =>
    combos.push({ id, label: COMBO_LABELS[id], points: COMBO_POINTS[id] });
  if (hasAny(SENSITIVE_SET) && hasAny(PRESSURE_SET)) addCombo('sensitive_pressure');
  if (has('FAMILY_EMERGENCY') && has('MONEY_TRANSFER_REQUEST')) addCombo('family_money');
  if (has('SECRECY') && (has('MONEY_TRANSFER_REQUEST') || hasAny(SENSITIVE_SET))) addCombo('secrecy_request');
  if (urlHigh && hasAny(LINK_LURE_SET)) addCombo('dangerous_link_lure');
  if (has('SECRECY') && has('PERSONAL_IMAGE_REQUEST')) addCombo('secrecy_image');
  if ((has('TRUST_GROOMING') || has('GIFT_GROOMING')) && has('PERSONAL_IMAGE_REQUEST')) addCombo('grooming_image');
  if (has('MEETING_REQUEST') && has('SECRECY')) addCombo('secret_meeting');

  // 6. Score.
  let raw = indicators.reduce((sum, i) => sum + i.points, 0) + combos.reduce((sum, c) => sum + c.points, 0);
  const psychologicalOnly =
    positive.length > 0 &&
    positive.every(
      (i) =>
        i.category === 'psychological' ||
        SOFT_CHILD_SET.has(i.type) ||
        (i.type === 'SUSPICIOUS_URL' && !urlMediumPlus),
    );
  if (psychologicalOnly) raw = Math.min(raw, PSYCHOLOGICAL_ONLY_CAP);
  // 7. A threat to share a child's images is always critical.
  if (has('SEXTORTION_THREAT')) raw = Math.max(raw, SEXTORTION_FLOOR);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const band = scoreToBand(score);

  // 8. Explanation (templates only).
  const top3 = positive.slice(0, 3);
  const explanation: Localized =
    top3.length === 0
      ? { ...BAND_META[band].lead }
      : {
          en: [BAND_META[band].lead.en, ...top3.map((i) => INDICATOR_META[i.type].explain.en)].join(' '),
          az: [BAND_META[band].lead.az, ...top3.map((i) => INDICATOR_META[i.type].explain.az)].join(' '),
        };

  // 9. Recommendations: indicator actions by points (max 5) + band default.
  const recommendations: Localized[] = [];
  const seen = new Set<string>();
  for (const i of positive) {
    const action = INDICATOR_META[i.type].action;
    if (!action || seen.has(action.en)) continue;
    seen.add(action.en);
    recommendations.push(action);
    if (recommendations.length >= 5) break;
  }
  const fallback = bandDefault(band, context);
  if (!seen.has(fallback.en)) recommendations.push(fallback);

  // 10. Categories.
  const categories: RiskCategories = {
    financial: positive.some((i) => i.category === 'financial'),
    psychological: positive.some((i) => i.category === 'psychological'),
    technical: positive.some((i) => i.category === 'technical'),
    childSafety: positive.some((i) => i.category === 'child_safety'),
  };

  // 11. Confidence in the verdict.
  const textLength = text.trim().length;
  const corroborated = indicators.some((i) => i.sources.length >= 2);
  const ruleIndicators = indicators.filter((i) => i.sources.includes('rules')).length;
  const aiFoundNothing =
    aiRan &&
    (aiAccepted === 0 ||
      (input.aiBenignContext === true && (input.aiIndicators ?? []).every((a) => a.type === 'PROTECTIVE_ADVICE')));
  const nonAiFoundNothing = !positive.some((i) => i.sources.includes('rules') || i.sources.includes('url_scan'));

  let confidence: ConfidenceLevel;
  let confidenceReason: Localized;
  if (textLength < 20) {
    confidence = 'low';
    confidenceReason = CONFIDENCE_REASONS.short;
  } else if (score >= THRESHOLDS.high && corroborated) {
    confidence = 'high';
    confidenceReason = CONFIDENCE_REASONS.corroborated;
  } else if (aiFoundNothing && nonAiFoundNothing && textLength >= 40) {
    confidence = 'high';
    confidenceReason = CONFIDENCE_REASONS.bothClean;
  } else if (aiRan) {
    confidence = 'medium';
    confidenceReason = aiFoundNothing && nonAiFoundNothing ? CONFIDENCE_REASONS.aiCleanShort : CONFIDENCE_REASONS.aiPartial;
  } else if (ruleIndicators >= 2) {
    confidence = 'medium';
    confidenceReason = CONFIDENCE_REASONS.rulesSeveral;
  } else {
    confidence = 'low';
    confidenceReason = CONFIDENCE_REASONS.rulesOnly;
  }

  return {
    score,
    band,
    indicators,
    categories,
    explanation,
    recommendations,
    confidence,
    confidenceReason,
    combos,
    engineVersion: ENGINE_VERSION,
  };
}
