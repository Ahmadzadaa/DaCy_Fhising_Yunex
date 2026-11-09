/**
 * DaCy Kids — deterministic, conversation-level grooming engine.
 *
 * Pure TypeScript (no react-native imports): runs on the child's phone, offline,
 * and in Node unit tests. It screens ONE conversation from a guardian-selected
 * app and decides whether the guardian should get a minimal alert (band,
 * category, app, time — never message text). Message content stays on the child
 * device, in memory.
 *
 * Grooming is a process, not a single message: trust is built over weeks, the
 * child is isolated, probed, asked for photos and finally coerced. The engine
 * therefore scores the whole recent conversation, not message by message.
 *
 * Rules (fully deterministic):
 *  1. Only messages from the other person (`from === 'contact'`) are scored;
 *     the child's own messages never produce indicators.
 *  2. Only messages inside the window are used: `windowDays` (default 30)
 *     before `now` (default: the latest message time). Messages after `now`
 *     are ignored. Messages with an unparseable timestamp are kept.
 *  3. Signals per message come from the bilingual rule lexicon
 *     (riskEngine.detectRuleSignals). PROTECTIVE_ADVICE and zero-weight types
 *     are ignored here — safety advice does not make a grooming chat safer.
 *     Unconditional photo-sharing statements ("I'll send your photos to your
 *     parents") only count as SEXTORTION_THREAT with a coercive structure in
 *     the same message or after an earlier photo request inside the window
 *     (lexicon `bare` patterns) — a coach or a grandparent says them too.
 *  4. Stages: TRUST_GROOMING/GIFT_GROOMING → trust; SECRECY/NEW_CONTACT_CHANNEL
 *     → isolation; PERSONAL_INFO_PROBE/MEETING_REQUEST → probing;
 *     PERSONAL_IMAGE_REQUEST → image_request; SEXTORTION_THREAT/THREAT_OR_FEAR →
 *     coercion. In a conversation, generic THREAT_OR_FEAR (e.g. "penalty",
 *     "account blocked") only counts as coercion once a photo request has been
 *     made — otherwise a football chat could look like extortion.
 *  5. Score = Σ over distinct types of max(round(weight × confidence)) in the
 *     window, + 10 when ≥ 3 distinct stages were reached, + 15 when a trust or
 *     isolation stage is followed by a later photo request or coercion.
 *  6. Early-stage cap: with no request (photo / meeting / threat / money /
 *     codes …) and no coercion, the score is capped at 45 ("moderate — keep an
 *     eye on it"). Flattery, gifts and questions alone never alert a parent.
 *  7. Coercion → at least 80.
 *  8. Request trigger → at least 50 (high), so "parent alerted" always means a
 *     high or critical band. A trigger is a PERSONAL_IMAGE_REQUEST or
 *     MEETING_REQUEST that is either
 *       - unambiguous on its own (lexicon `hard`, confidence ≥ 0.7: "send me a
 *         photo of you", "a private photo just for me", "come alone", "get in
 *         my car"), or
 *       - accompanied by grooming context in the window (trust, gifts,
 *         secrecy, a move to a private app, personal questions, or both a
 *         photo and a meeting request), confidence ≥ 0.6. Without context,
 *         "send a selfie from the trip" or "I'll wait outside your school"
 *         only add points.
 *     With `knownContact` (the contact is in the family's trusted circle) no
 *     request trigger applies: a grandmother's "send me a photo of you in the
 *     costume" never alerts; only a high/critical conversation does.
 *  9. Clamp to an integer 0–100, band via scoreToBand.
 *     shouldAlert = band high or critical.
 * 10. perMessage[i].score is the cumulative score of messages[0..i] evaluated
 *     at message i's own time (a sliding-window timeline for the chart);
 *     perMessage[i].stage / types describe message i itself.
 */
import { childContextAction, childContextExplain, GUARDIAN_GENERAL_ACTIONS } from '@/constants/childSafetyGuidance';
import { INDICATOR_META } from '@/constants/indicators';
import type {
  ChatMessage,
  ConversationAssessment,
  GroomingStage,
  Indicator,
  IndicatorType,
  Localized,
  RiskBand,
  TextSpan,
} from '@/types/security';
import { INDICATOR_TYPES } from '@/types/security';

import { REQUEST_TYPES } from './lexicon';
import { detectRuleSignals, scoreToBand } from './riskEngine';

export const GROOMING_ENGINE_VERSION = 'dacy-kids-1.1.0';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
const MULTI_STAGE_MIN = 3;
const MULTI_STAGE_BONUS = 10;
const PROGRESSION_BONUS = 15;
const EARLY_STAGE_CAP = 45;
const COERCION_FLOOR = 80;
const TRIGGER_FLOOR = 50;
/** A `hard` request alerts on its own from this confidence. */
const TRIGGER_CONFIDENCE = 0.7;
/** With grooming context, any photo / meeting request from this confidence alerts. */
const CONTEXT_TRIGGER_CONFIDENCE = 0.6;

const REQUEST_SET = new Set<IndicatorType>(REQUEST_TYPES);
const TRIGGER_TYPES = new Set<IndicatorType>(['PERSONAL_IMAGE_REQUEST', 'MEETING_REQUEST']);
/** Grooming context that lets an ambiguous photo / meeting request alert the guardian. */
const CONTEXT_TYPES = new Set<IndicatorType>([
  'TRUST_GROOMING',
  'GIFT_GROOMING',
  'SECRECY',
  'NEW_CONTACT_CHANNEL',
  'PERSONAL_INFO_PROBE',
]);

/** Alert category priority (strongest first). A follow-up alert is sent when the category moves up this list. */
export const ALERT_PRIORITY: readonly IndicatorType[] = [
  'SEXTORTION_THREAT',
  'PERSONAL_IMAGE_REQUEST',
  'MEETING_REQUEST',
  'PERSONAL_INFO_PROBE',
  'SECRECY',
  'TRUST_GROOMING',
  'GIFT_GROOMING',
];

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

export const STAGE_META: Record<GroomingStage, { label: Localized; description: Localized; level: number }> = {
  none: {
    level: 0,
    label: { en: 'No warning signs', az: 'Narahatlıq yoxdur' },
    description: {
      en: 'Nothing in the screened messages matches a known risk pattern.',
      az: 'Yoxlanılan mesajlarda tanınmış təhlükə ssenarisinə uyğun heç nə yoxdur.',
    },
  },
  trust: {
    level: 1,
    label: { en: 'Building trust', az: 'Etibar qazanma' },
    description: {
      en: 'Compliments, gifts and “only I understand you” to create a special bond.',
      az: 'Xüsusi bağlılıq yaratmaq üçün tərif, hədiyyə və “səni ancaq mən başa düşürəm” kimi sözlər.',
    },
  },
  isolation: {
    level: 2,
    label: { en: 'Secrecy & isolation', az: 'Gizlilik və təcrid' },
    description: {
      en: 'Asks to hide the chat from parents or to move to a more private app.',
      az: 'Yazışmanı valideynlərdən gizlətməyi və ya başqa, daha qapalı tətbiqə keçməyi istəyir.',
    },
  },
  probing: {
    level: 3,
    label: { en: 'Probing & meeting', az: 'Məlumat toplama və görüş' },
    description: {
      en: 'Asks for age, school, address, when the child is alone, or to meet.',
      az: 'Yaşını, məktəbini, ünvanını, nə vaxt tək qaldığını soruşur və ya görüş təklif edir.',
    },
  },
  image_request: {
    level: 4,
    label: { en: 'Photo requests', az: 'Şəkil tələbi' },
    description: {
      en: 'Asks the child for personal photos or videos of themselves.',
      az: 'Uşaqdan özünün şəxsi şəkil və ya videolarını istəyir.',
    },
  },
  coercion: {
    level: 5,
    label: { en: 'Threats & coercion', az: 'Hədə və şantaj' },
    description: {
      en: 'Threatens to share images or otherwise pressures the child to comply.',
      az: 'Dediyini etməsə, şəkilləri yaymaqla və ya başqa yolla hədələyir.',
    },
  },
};

const TYPE_STAGE: Partial<Record<IndicatorType, GroomingStage>> = {
  TRUST_GROOMING: 'trust',
  GIFT_GROOMING: 'trust',
  SECRECY: 'isolation',
  NEW_CONTACT_CHANNEL: 'isolation',
  PERSONAL_INFO_PROBE: 'probing',
  MEETING_REQUEST: 'probing',
  PERSONAL_IMAGE_REQUEST: 'image_request',
  SEXTORTION_THREAT: 'coercion',
  THREAT_OR_FEAR: 'coercion',
};

const level = (s: GroomingStage) => STAGE_META[s].level;

/** Highest grooming stage implied by a set of indicator types ('none' when no type maps to a stage). */
export function stageForTypes(types: readonly IndicatorType[]): GroomingStage {
  let best: GroomingStage = 'none';
  for (const t of types) {
    const s = TYPE_STAGE[t];
    if (s && level(s) > level(best)) best = s;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Per-message signals                                                 */
/* ------------------------------------------------------------------ */

/** A scored rule signal inside one message (span indices refer to that message's text). */
export interface GroomingSignal {
  type: IndicatorType;
  evidence: string;
  span: TextSpan;
  confidence: number;
  points: number;
  /** Unambiguous request (lexicon `hard`): alerts on its own. */
  hard: boolean;
}

/** 0-based rank in ALERT_PRIORITY (lower = more serious); unknown types rank last. */
export function alertPriorityRank(type: IndicatorType | null | undefined): number {
  const i = type ? ALERT_PRIORITY.indexOf(type) : -1;
  return i < 0 ? ALERT_PRIORITY.length : i;
}

/**
 * Signals of one message, strongest per type, with spans for highlighting.
 * Child messages and safety advice never produce signals. `imageRequested`: an
 * earlier message in the conversation asked for a photo (see header, rule 3).
 */
export function messageSignals(message: ChatMessage, options: { imageRequested?: boolean } = {}): GroomingSignal[] {
  if (!message || message.from !== 'contact' || typeof message.text !== 'string') return [];
  const out: GroomingSignal[] = [];
  for (const s of detectRuleSignals(message.text, { imageRequested: options.imageRequested === true })) {
    const weight = INDICATOR_META[s.type]?.weight ?? 0;
    if (weight <= 0) continue;
    out.push({
      type: s.type,
      evidence: s.evidence,
      span: s.span,
      confidence: s.confidence,
      points: Math.round(weight * s.confidence),
      hard: s.hard === true,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Conversation evaluation                                             */
/* ------------------------------------------------------------------ */

interface ScoredMessage {
  index: number;
  message: ChatMessage;
  /** Epoch ms, NaN when unparseable. */
  time: number;
  signals: GroomingSignal[];
  /** Signals when an earlier photo request is inside the window (bare threats count). */
  signalsAfterImage: GroomingSignal[];
}

interface Evaluation {
  score: number;
  band: RiskBand;
  stage: GroomingStage;
  stagesReached: GroomingStage[];
  /** Strongest signal per type inside the window. */
  best: Map<IndicatorType, GroomingSignal>;
  /** Stage of each in-window message (gated), by message index. */
  messageStage: Map<number, GroomingStage>;
  /** Indicator types of each in-window message, by message index. */
  messageTypes: Map<number, IndicatorType[]>;
  progression: boolean;
  /** A photo / meeting request trigger fired (rule 8). */
  triggered: boolean;
  /** The trigger fired without any other grooming context (a single unambiguous request). */
  triggerOnly: boolean;
  /** Days between the first and the last flagged message (progression explanation). */
  spanDays: number;
}

const isFiniteTime = (t: number) => Number.isFinite(t);

function inWindow(time: number, ref: number, windowDays: number): boolean {
  if (!isFiniteTime(time) || !isFiniteTime(ref)) return true;
  return time <= ref && time >= ref - windowDays * DAY_MS;
}

/** Evaluates messages[0..upto] at reference time `ref`. */
function evaluate(scored: ScoredMessage[], upto: number, ref: number, windowDays: number, knownContact: boolean): Evaluation {
  const best = new Map<IndicatorType, GroomingSignal>();
  const messageStage = new Map<number, GroomingStage>();
  const messageTypes = new Map<number, IndicatorType[]>();
  const hardTypes = new Set<IndicatorType>();
  const stagesReached: GroomingStage[] = [];
  let imageReached = false;
  let coercion = false;
  let firstEarlyIndex = -1;
  let progression = false;
  let firstFlaggedTime = Number.NaN;
  let lastFlaggedTime = Number.NaN;

  for (let i = 0; i <= upto && i < scored.length; i += 1) {
    const m = scored[i]!;
    if (m.message.from !== 'contact') continue;
    if (!inWindow(m.time, ref, windowDays)) continue;
    // After a photo request in the window, "I'll send your photos to …" is a threat (rule 3).
    const signals = imageReached ? m.signalsAfterImage : m.signals;
    if (signals.length === 0) continue;

    for (const s of signals) {
      const prev = best.get(s.type);
      if (!prev || s.points > prev.points || (s.points === prev.points && s.confidence > prev.confidence)) best.set(s.type, s);
      if (s.hard && s.confidence >= TRIGGER_CONFIDENCE) hardTypes.add(s.type);
    }

    const types = signals.map((s) => s.type);
    messageTypes.set(m.index, types);
    if (types.includes('PERSONAL_IMAGE_REQUEST')) imageReached = true;
    // Generic threats only mean coercion after a photo request (see header, rule 4).
    const stageTypes = types.filter((t) => t !== 'THREAT_OR_FEAR' || imageReached);
    const stages = [...new Set(stageTypes.map((t) => TYPE_STAGE[t]).filter((s): s is GroomingStage => !!s))].sort(
      (a, b) => level(a) - level(b),
    );
    if (stages.length === 0) continue;

    messageStage.set(m.index, stages[stages.length - 1]!);
    for (const s of stages) if (!stagesReached.includes(s)) stagesReached.push(s);
    if (stages.includes('coercion')) coercion = true;
    if (firstEarlyIndex >= 0 && (stages.includes('image_request') || stages.includes('coercion'))) progression = true;
    if (firstEarlyIndex < 0 && (stages.includes('trust') || stages.includes('isolation'))) firstEarlyIndex = m.index;
    if (isFiniteTime(m.time)) {
      if (!isFiniteTime(firstFlaggedTime)) firstFlaggedTime = m.time;
      lastFlaggedTime = m.time;
    }
  }

  let raw = 0;
  for (const b of best.values()) raw += b.points;
  if (stagesReached.length >= MULTI_STAGE_MIN) raw += MULTI_STAGE_BONUS;
  if (progression) raw += PROGRESSION_BONUS;
  const hasRequest = [...best.keys()].some((t) => REQUEST_SET.has(t));
  if (!hasRequest && !coercion) raw = Math.min(raw, EARLY_STAGE_CAP);
  if (coercion) raw = Math.max(raw, COERCION_FLOOR);

  // Rule 8: a clear photo / meeting request alerts the guardian (score ≥ 50).
  const hasContext =
    [...best.keys()].some((t) => CONTEXT_TYPES.has(t)) || (best.has('PERSONAL_IMAGE_REQUEST') && best.has('MEETING_REQUEST'));
  const hardRequest = [...hardTypes].some((t) => TRIGGER_TYPES.has(t));
  const contextRequest =
    hasContext && [...best.values()].some((s) => TRIGGER_TYPES.has(s.type) && s.confidence >= CONTEXT_TRIGGER_CONFIDENCE);
  const triggered = !knownContact && (hardRequest || contextRequest);
  if (triggered) raw = Math.max(raw, TRIGGER_FLOOR);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  let stage: GroomingStage = 'none';
  for (const s of stagesReached) if (level(s) > level(stage)) stage = s;

  const spanDays =
    isFiniteTime(firstFlaggedTime) && isFiniteTime(lastFlaggedTime)
      ? Math.max(0, Math.round((lastFlaggedTime - firstFlaggedTime) / DAY_MS))
      : 0;

  return {
    score,
    band: scoreToBand(score),
    stage,
    stagesReached,
    best,
    messageStage,
    messageTypes,
    progression,
    spanDays,
    triggered,
    triggerOnly: triggered && !hasContext && !coercion,
  };
}

/* ------------------------------------------------------------------ */
/* Texts                                                               */
/* ------------------------------------------------------------------ */

const LEAD: Record<RiskBand, Localized> = {
  low: {
    en: 'Only weak signals were found in the screened messages; no action is needed right now.',
    az: 'Yoxlanılan mesajlarda yalnız zəif əlamətlər tapıldı; hazırda tədbir lazım deyil.',
  },
  moderate: {
    en: 'Early warning signs were found. Keep an eye on this contact.',
    az: 'İlkin narahatlıq əlamətləri tapıldı. Bu şəxsə diqqət yetirin.',
  },
  high: {
    en: 'This conversation shows a typical grooming pattern.',
    az: 'Bu yazışmada uşaqları şirnikləndirmənin (grooming) tipik əlamətləri var.',
  },
  critical: {
    en: 'This conversation shows serious signs of grooming or exploitation. Act today.',
    az: 'Bu yazışmada ciddi istismar və ya şantaj əlamətləri var. Bu gün tədbir görün.',
  },
};

const TRIGGER_LEAD: Localized = {
  en: 'A request that a child should never get from someone online was found.',
  az: 'Uşağın internetdə heç kimdən almamalı olduğu bir tələb aşkarlandı.',
};

const explainFor = childContextExplain;
const actionFor = childContextAction;

const CHILD_TIP_WARNING: Localized = {
  en: "This chat shows warning signs. You don't have to reply or send anything. It's not your fault — talk to a parent or an adult you trust.",
  az: 'Bu yazışmada narahatlıq doğuran əlamətlər var. Cavab yazmağa və ya nəsə göndərməyə məcbur deyilsən. Bu sənin günahın deyil — valideyninlə və ya etibar etdiyin bir böyüklə danış.',
};

const CHILD_TIP_NEUTRAL: Localized = {
  en: 'If anyone online makes you feel uncomfortable, you can always talk to a parent or an adult you trust.',
  az: 'İnternetdə kimsə səni narahat etsə, həmişə valideyninlə və ya etibar etdiyin bir böyüklə danışa bilərsən.',
};

function buildExplanation(ev: Evaluation, indicators: Indicator[], windowDays: number): Localized {
  if (indicators.length === 0) {
    return {
      en: `No warning signs were found in the screened messages from the last ${windowDays} days.`,
      az: `Son ${windowDays} gündə yoxlanılan mesajlarda narahatlıq əlaməti tapılmadı.`,
    };
  }
  const lead = ev.triggerOnly ? TRIGGER_LEAD : LEAD[ev.band];
  const en: string[] = [lead.en];
  const az: string[] = [lead.az];
  if (ev.stage !== 'none') {
    const label = STAGE_META[ev.stage].label;
    en.push(`Highest stage reached: ${label.en}.`);
    az.push(`Ən yüksək mərhələ: ${label.az}.`);
  }
  for (const i of indicators.slice(0, 3)) {
    en.push(explainFor(i.type).en);
    az.push(explainFor(i.type).az);
  }
  if (ev.progression && ev.spanDays >= 1) {
    en.push(`These signs built up step by step over ${ev.spanDays} ${ev.spanDays === 1 ? 'day' : 'days'} — the usual way grooming progresses.`);
    az.push(`Bu əlamətlər ${ev.spanDays} gün ərzində addım-addım artıb — şirnikləndirmə adətən belə inkişaf edir.`);
  }
  return { en: en.join(' '), az: az.join(' ') };
}

/**
 * Guardian guidance. When the result is serious, the safeguarding basics come FIRST
 * (don't blame → keep evidence → report), then the top two indicator-specific
 * actions, then "talk calmly" — so a short list never hides the most important advice.
 */
function buildGuardianActions(indicators: Indicator[], serious: boolean): Localized[] {
  if (indicators.length === 0) return [GUARDIAN_GENERAL_ACTIONS.prevention];
  const actions: Localized[] = [];
  const seen = new Set<string>();
  const add = (a: Localized | null | undefined) => {
    if (!a || seen.has(a.en)) return;
    seen.add(a.en);
    actions.push(a);
  };
  if (serious) {
    add(GUARDIAN_GENERAL_ACTIONS.noBlame);
    add(GUARDIAN_GENERAL_ACTIONS.evidence);
    add(GUARDIAN_GENERAL_ACTIONS.report);
  }
  const limit = actions.length + (serious ? 2 : 4);
  for (const i of indicators) {
    if (actions.length >= limit) break;
    add(actionFor(i.type));
  }
  add(GUARDIAN_GENERAL_ACTIONS.talk);
  return actions;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const typeOrder = (t: IndicatorType) => INDICATOR_TYPES.indexOf(t);
const parseTime = (iso: string | undefined) => (typeof iso === 'string' ? Date.parse(iso) : Number.NaN);

/**
 * Assesses one screened conversation (messages in chronological order).
 * Deterministic: the same messages and options always give the same result.
 */
export interface AssessConversationOptions {
  /** Reference time (ISO); default: the latest message time. Later messages are ignored. */
  now?: string;
  /** Sliding window in days (default 30). */
  windowDays?: number;
  /**
   * The contact is in the family's trusted circle (e.g. a grandparent). Single
   * photo / meeting requests then never alert on their own; only a conversation
   * that scores high or critical does (header, rule 8).
   */
  knownContact?: boolean;
}

export function assessConversation(messages: ChatMessage[], options: AssessConversationOptions = {}): ConversationAssessment {
  const list = Array.isArray(messages) ? messages : [];
  const knownContact = options.knownContact === true;
  const windowDays =
    typeof options.windowDays === 'number' && Number.isFinite(options.windowDays) && options.windowDays > 0
      ? options.windowDays
      : DEFAULT_WINDOW_DAYS;

  const scored: ScoredMessage[] = list.map((message, index) => ({
    index,
    message,
    time: parseTime(message?.at),
    signals: messageSignals(message),
    signalsAfterImage: messageSignals(message, { imageRequested: true }),
  }));

  let latest = Number.NaN;
  for (const m of scored) {
    if (isFiniteTime(m.time) && (!isFiniteTime(latest) || m.time > latest)) latest = m.time;
  }
  const explicitNow = parseTime(options.now);
  const now = isFiniteTime(explicitNow) ? explicitNow : latest;

  const ev = evaluate(scored, scored.length - 1, now, windowDays, knownContact);

  const perMessage: ConversationAssessment['perMessage'] = scored.map((m) => {
    const at = isFiniteTime(m.time) ? m.time : now;
    const prefix = evaluate(scored, m.index, at, windowDays, knownContact);
    return {
      messageId: m.message?.id ?? String(m.index),
      score: prefix.score,
      stage: prefix.messageStage.get(m.index) ?? 'none',
      types: prefix.messageTypes.get(m.index) ?? m.signals.map((s) => s.type),
    };
  });

  const indicators: Indicator[] = [...ev.best.entries()]
    .map(([type, b]) => ({
      id: `ind_${type.toLowerCase()}`,
      type,
      category: INDICATOR_META[type].category,
      sources: ['rules' as const],
      evidence: b.evidence,
      span: b.span,
      confidence: b.confidence,
      points: b.points,
    }))
    .sort((x, y) => y.points - x.points || typeOrder(x.type) - typeOrder(y.type));

  const shouldAlert = ev.band === 'high' || ev.band === 'critical';

  const present = new Set(indicators.map((i) => i.type));
  let alertCategory: IndicatorType | null = ALERT_PRIORITY.find((t) => present.has(t)) ?? null;
  // Non-grooming requests (e.g. "send me your mom's card code") still need a category for the alert.
  if (!alertCategory && shouldAlert) alertCategory = indicators[0]?.type ?? null;

  const serious = shouldAlert || ev.band !== 'low';
  return {
    score: ev.score,
    band: ev.band,
    stage: ev.stage,
    stagesReached: ev.stagesReached,
    indicators,
    perMessage,
    shouldAlert,
    alertCategory,
    explanation: buildExplanation(ev, indicators, windowDays),
    guardianActions: buildGuardianActions(indicators, serious),
    childTip: serious ? CHILD_TIP_WARNING : CHILD_TIP_NEUTRAL,
    engineVersion: GROOMING_ENGINE_VERSION,
  };
}
