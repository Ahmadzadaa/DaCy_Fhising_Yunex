/**
 * Call Guard decisions and explanations (pure, unit-tested).
 *
 * 1. Certainty — DaCy interrupts a call by voice only when it is SURE:
 *    the score is critical (≥ 75) AND something sensitive is really being
 *    ASKED for (a code, card data, a password, remote access, a transfer…),
 *    not merely mentioned, AND that request is confirmed — either by both the
 *    rules and the AI, or in two analyses in a row. Anything less is shown
 *    quietly on screen.
 * 2. Explanation — built from what was actually said: every point quotes the
 *    caller's own words, a mention ("CVV") is explained as harmless, and a
 *    caller who only says who they are is told apart from one who asks for data.
 */
import { INDICATOR_META } from '@/constants/indicators';
import { REQUEST_TYPES, CHILD_REQUEST_TYPES } from '@/services/security/lexicon';
import { MENTION_CONFIDENCE } from '@/services/security/riskEngine';
import type { Indicator, IndicatorType, Localized, RiskAssessment } from '@/types/security';

const FINANCIAL_REQUESTS = new Set<IndicatorType>(REQUEST_TYPES.filter((t) => !CHILD_REQUEST_TYPES.includes(t)));
const PRESSURE = new Set<IndicatorType>(['URGENCY', 'THREAT_OR_FEAR', 'SECRECY']);

export const isMention = (i: Indicator) => FINANCIAL_REQUESTS.has(i.type) && i.confidence <= MENTION_CONFIDENCE && i.points === 0;
export const isRealRequest = (i: Indicator) => FINANCIAL_REQUESTS.has(i.type) && i.points > 0 && !isMention(i);

export type Certainty = 'none' | 'caution' | 'candidate' | 'sure';

/**
 * - caution:   score ≥ 50 — show quietly on screen, no voice, no family alert;
 * - candidate: critical + a real request, not yet confirmed;
 * - sure:      candidate confirmed (rules + AI agree, or `confirmations` ≥ 2).
 */
export function certainty(a: RiskAssessment | null, confirmations: number): Certainty {
  if (!a) return 'none';
  const requests = a.indicators.filter(isRealRequest);
  if (a.score >= 75 && requests.length > 0) {
    const corroborated = requests.some((i) => i.sources.includes('rules') && i.sources.includes('ai'));
    return corroborated || confirmations >= 2 ? 'sure' : 'candidate';
  }
  return a.score >= 50 ? 'caution' : 'none';
}

export interface ExplainPoint {
  tone: 'risk' | 'info' | 'ok';
  text: Localized;
  quote?: string;
}

export interface CallExplanation {
  headline: Localized;
  points: ExplainPoint[];
  advice: Localized | null;
}

const MENTION_TEXT: Localized = {
  en: 'was mentioned, but nobody asked you for it. On its own this is not a threat.',
  az: 'adı çəkildi, amma sizdən istənmədi. Bu özlüyündə təhlükə deyil.',
};

const AUTHORITY_ONLY: Localized = {
  en: 'The caller says they are from a bank or an official body. That alone is not a scam — but if they ask for a code, card details, a password or money, stop.',
  az: 'Zəng edən özünü bank və ya rəsmi qurum əməkdaşı kimi təqdim edir. Bu, tək başına fırıldaq deyil — amma sizdən kod, kart məlumatı, şifrə və ya pul istəsə, dayanın.',
};

const NOTHING: Localized = {
  en: 'Nothing suspicious has been said so far. DaCy keeps listening.',
  az: 'Hələlik şübhəli heç nə deyilməyib. DaCy dinləməyə davam edir.',
};

const HEADLINE: Record<Certainty | 'authority' | 'watch', Localized> = {
  none: { en: 'No warning signs so far', az: 'Hələlik təhlükə əlaməti yoxdur' },
  watch: { en: 'A few warning signs — DaCy keeps listening', az: 'Bəzi şübhəli əlamətlər var — DaCy dinləməyə davam edir' },
  authority: { en: 'Caller claims to be an official', az: 'Zəng edən özünü rəsmi şəxs kimi təqdim edir' },
  caution: { en: 'Be careful — warning signs', az: 'Diqqətli olun — şübhəli əlamətlər var' },
  candidate: { en: 'Looks like a scam — checking', az: 'Fırıldağa oxşayır — yoxlanılır' },
  sure: { en: 'This is very likely a scam', az: 'Bu, böyük ehtimalla fırıldaqdır' },
};

/** Situation-specific explanation of the call so far, quoting the caller's own words. */
export function explainCall(a: RiskAssessment | null, level: Certainty): CallExplanation {
  if (!a) return { headline: HEADLINE.none, points: [{ tone: 'ok', text: NOTHING }], advice: null };
  const points: ExplainPoint[] = [];
  const positive = a.indicators.filter((i) => i.points > 0);
  const real = positive.filter((i) => !isMention(i));
  for (const i of real) points.push({ tone: 'risk', text: INDICATOR_META[i.type].explain, quote: i.evidence });
  for (const i of a.indicators.filter(isMention)) points.push({ tone: 'info', text: MENTION_TEXT, quote: i.evidence });
  for (const i of a.indicators.filter((x) => x.type === 'PROTECTIVE_ADVICE')) {
    points.push({ tone: 'ok', text: INDICATOR_META.PROTECTIVE_ADVICE.explain, quote: i.evidence });
  }

  const onlyAuthority = real.length > 0 && real.every((i) => i.type === 'AUTHORITY_IMPERSONATION');
  if (onlyAuthority) points.push({ tone: 'info', text: AUTHORITY_ONLY });
  if (!points.length) points.push({ tone: 'ok', text: NOTHING });

  const headline = level !== 'none' ? HEADLINE[level] : onlyAuthority ? HEADLINE.authority : real.length ? HEADLINE.watch : HEADLINE.none;
  const top = real.find(isRealRequest) ?? real[0];
  const advice = level === 'none' || !top ? null : INDICATOR_META[top.type].action;
  return { headline, points, advice };
}

const REQUEST_PHRASE: Partial<Record<IndicatorType, Localized>> = {
  OTP_REQUEST: { en: 'The caller is asking for your SMS code', az: 'Zəng edən sizdən SMS kodunu istəyir' },
  CARD_DATA_REQUEST: { en: 'The caller is asking for your card details', az: 'Zəng edən kart məlumatlarınızı istəyir' },
  CREDENTIAL_REQUEST: { en: 'The caller is asking for your password', az: 'Zəng edən şifrənizi istəyir' },
  REMOTE_ACCESS_REQUEST: { en: 'The caller wants you to install a remote-access app', az: 'Zəng edən telefonunuza uzaqdan idarə proqramı yükləməyinizi istəyir' },
  SAFE_ACCOUNT_TRANSFER: { en: 'The caller wants you to move your money to a so-called safe account', az: 'Zəng edən pulunuzu "təhlükəsiz hesaba" köçürməyinizi istəyir' },
  MONEY_TRANSFER_REQUEST: { en: 'The caller is asking you to send money', az: 'Zəng edən sizdən pul köçürməyinizi istəyir' },
  UPFRONT_FEE: { en: 'The caller wants you to pay a fee first', az: 'Zəng edən əvvəlcədən ödəniş etməyinizi istəyir' },
};

/** The spoken warning: what is being asked, why it is wrong, what to do. Only used when `sure`. */
export function spokenWarning(a: RiskAssessment): Localized {
  const requests = a.indicators.filter(isRealRequest).filter((i) => REQUEST_PHRASE[i.type]).slice(0, 2);
  const has = (t: IndicatorType) => a.indicators.some((i) => i.type === t && i.points > 0);
  const phrases: Localized[] = requests.length
    ? requests.map((i) => REQUEST_PHRASE[i.type] as Localized)
    : [{ en: 'The caller is asking for something sensitive', az: 'Zəng edən sizdən həssas məlumat istəyir' }];
  const parts = (lang: 'en' | 'az') => {
    const out = [lang === 'en' ? 'Warning.' : 'Diqqət.', ...phrases.map((p) => `${p[lang]}.`)];
    if (has('AUTHORITY_IMPERSONATION')) {
      out.push(lang === 'en' ? 'They claim to be a bank or an official body, but a real one never asks for this by phone.' : 'Özünü bank və ya rəsmi qurum kimi təqdim edir, amma əsl bank bunu telefonla heç vaxt soruşmur.');
    }
    if ([...PRESSURE].some(has)) {
      out.push(lang === 'en' ? 'They are rushing or frightening you on purpose.' : 'Sizi qəsdən tələsdirir və qorxudur.');
    }
    out.push(lang === 'en' ? 'Do not share anything. End the call and phone your bank on its official number.' : 'Heç nə deməyin. Zəngi bitirin və bankın rəsmi nömrəsinə özünüz zəng edin.');
    return out.join(' ');
  };
  return { en: parts('en'), az: parts('az') };
}
