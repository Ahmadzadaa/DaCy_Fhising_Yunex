/**
 * DaCy — core security domain types.
 *
 * These types are shared by the deterministic risk engine, the AI model
 * provider, the UI and the local history store. The server keeps a mirrored
 * copy of the wire-level types in `server/src/contract.ts`.
 *
 * Design rules encoded here:
 *  - The final 0–100 risk score is ALWAYS computed by the deterministic engine
 *    (`services/security/riskEngine.ts`). AI only contributes indicators.
 *  - Voice authenticity (deepfake detection) has no validated model yet, so the
 *    only allowed status is an honest "model pending" — never a fake score.
 *  - Call sessions never store transcripts or audio, only metadata.
 */

/* ------------------------------------------------------------------ */
/* Languages                                                           */
/* ------------------------------------------------------------------ */

/** Language of the app UI. English is the default (international jury). */
export type UiLanguage = 'en' | 'az';

/** Language hint passed to speech-to-text. */
export type SpeechLanguage = 'en' | 'az' | 'auto';

/** Detected language of analysed content. */
export type ContentLanguage = 'en' | 'az' | 'ru' | 'mixed' | 'other' | 'unknown';

/** A string available in both supported UI languages. */
export interface Localized {
  en: string;
  az: string;
}

/* ------------------------------------------------------------------ */
/* Inference routing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Execution modes of the hybrid inference router.
 *  - ON_DEVICE: local LLM runtime (llama.cpp / Core ML). Requires a native
 *    development build; not available inside Expo Go.
 *  - CLOUD_API: DaCy server → Claude for indicator extraction + speech-to-text.
 *  - DETERMINISTIC_ENGINE: offline rule engine on the phone. Always available.
 */
export type InferenceMode = 'ON_DEVICE' | 'CLOUD_API' | 'DETERMINISTIC_ENGINE';

/** Why the router used a different mode than the one requested. */
export type FallbackReason =
  | 'ON_DEVICE_UNAVAILABLE'
  | 'SERVER_UNREACHABLE'
  | 'AI_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_ERROR'
  | 'AI_REFUSED';

/* ------------------------------------------------------------------ */
/* Risk scoring                                                        */
/* ------------------------------------------------------------------ */

/**
 * Risk bands (fixed thresholds):
 *   0–24 low · 25–49 moderate · 50–74 high · 75–100 critical
 */
export type RiskBand = 'low' | 'moderate' | 'high' | 'critical';

/** Every signal the engine and the AI are allowed to report. */
export type IndicatorType =
  | 'OTP_REQUEST'
  | 'CARD_DATA_REQUEST'
  | 'CREDENTIAL_REQUEST'
  | 'REMOTE_ACCESS_REQUEST'
  | 'SAFE_ACCOUNT_TRANSFER'
  | 'MONEY_TRANSFER_REQUEST'
  | 'UPFRONT_FEE'
  | 'INVESTMENT_LURE'
  | 'PRIZE_LURE'
  | 'URGENCY'
  | 'SECRECY'
  | 'AUTHORITY_IMPERSONATION'
  | 'FAMILY_EMERGENCY'
  | 'THREAT_OR_FEAR'
  | 'NEW_CONTACT_CHANNEL'
  | 'SUSPICIOUS_URL'
  | 'PROTECTIVE_ADVICE'
  // Child-safety (grooming / exploitation) signals — used by DaCy Kids.
  | 'TRUST_GROOMING'
  | 'PERSONAL_INFO_PROBE'
  | 'GIFT_GROOMING'
  | 'PERSONAL_IMAGE_REQUEST'
  | 'MEETING_REQUEST'
  | 'SEXTORTION_THREAT';

export const INDICATOR_TYPES: readonly IndicatorType[] = [
  'OTP_REQUEST',
  'CARD_DATA_REQUEST',
  'CREDENTIAL_REQUEST',
  'REMOTE_ACCESS_REQUEST',
  'SAFE_ACCOUNT_TRANSFER',
  'MONEY_TRANSFER_REQUEST',
  'UPFRONT_FEE',
  'INVESTMENT_LURE',
  'PRIZE_LURE',
  'URGENCY',
  'SECRECY',
  'AUTHORITY_IMPERSONATION',
  'FAMILY_EMERGENCY',
  'THREAT_OR_FEAR',
  'NEW_CONTACT_CHANNEL',
  'SUSPICIOUS_URL',
  'PROTECTIVE_ADVICE',
  'TRUST_GROOMING',
  'PERSONAL_INFO_PROBE',
  'GIFT_GROOMING',
  'PERSONAL_IMAGE_REQUEST',
  'MEETING_REQUEST',
  'SEXTORTION_THREAT',
] as const;

/** Indicator types specific to child safety (grooming / exploitation). */
export const CHILD_SAFETY_TYPES: readonly IndicatorType[] = [
  'TRUST_GROOMING',
  'PERSONAL_INFO_PROBE',
  'GIFT_GROOMING',
  'PERSONAL_IMAGE_REQUEST',
  'MEETING_REQUEST',
  'SEXTORTION_THREAT',
] as const;

/**
 * financial: money / codes / card data at stake
 * psychological: manipulation levers (pressure, fear, secrecy, emotion)
 * technical: links, remote access, infrastructure
 * protective: benign safety advice (lowers risk; hard-negative signal)
 */
export type IndicatorCategory = 'financial' | 'psychological' | 'technical' | 'protective' | 'child_safety';

/** Who detected an indicator. More than one source = corroborated. */
export type IndicatorSource = 'rules' | 'ai' | 'url_scan';

/** Character range inside the analysed text (UTF-16 indices, end exclusive). */
export interface TextSpan {
  start: number;
  end: number;
}

/** A scored indicator as shown in the UI. */
export interface Indicator {
  /** Stable key, unique within one assessment. */
  id: string;
  type: IndicatorType;
  category: IndicatorCategory;
  sources: IndicatorSource[];
  /** Exact fragment of the analysed text (or URL) that triggered the signal. */
  evidence: string;
  /** Location of `evidence` in the analysed text when it could be located. */
  span?: TextSpan;
  /** 0..1 — rules use fixed confidences, AI confidences are capped by the engine. */
  confidence: number;
  /** Points this indicator contributed to the 0–100 score (negative for PROTECTIVE_ADVICE). */
  points: number;
  /** Optional extra explanation, e.g. URL details ("domain registered 3 days ago"). */
  detail?: Localized;
}

export interface RiskCategories {
  financial: boolean;
  psychological: boolean;
  technical: boolean;
  /** Grooming / exploitation signals present. */
  childSafety: boolean;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** Output of the deterministic risk engine. */
export interface RiskAssessment {
  /** 0–100, integer. Computed only by the deterministic engine. */
  score: number;
  band: RiskBand;
  /** Sorted by absolute points, descending. */
  indicators: Indicator[];
  categories: RiskCategories;
  /** Plain-language explanation built from templates (never free LLM text). */
  explanation: Localized;
  /** Ordered, de-duplicated recommended actions. */
  recommendations: Localized[];
  confidence: ConfidenceLevel;
  confidenceReason: Localized;
  /** Bonus rules that fired (e.g. "pressure + secret request"), for transparency. */
  combos: { id: string; label: Localized; points: number }[];
  engineVersion: string;
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

export type UrlSignalType =
  | 'URL_SHORTENER'
  | 'IP_HOST'
  | 'PUNYCODE_OR_IDN'
  | 'BRAND_LOOKALIKE'
  | 'RISKY_TLD'
  | 'NO_HTTPS'
  | 'CREDENTIALS_IN_URL'
  | 'EXCESSIVE_SUBDOMAINS'
  | 'SUSPICIOUS_KEYWORDS'
  | 'NEW_DOMAIN'
  | 'REDIRECT_CHAIN'
  | 'CROSS_DOMAIN_REDIRECT'
  | 'PASSWORD_FORM'
  | 'CARD_FORM'
  | 'UNREACHABLE'
  | 'OFFICIAL_DOMAIN';

export type UrlSignalSeverity = 'info' | 'low' | 'medium' | 'high';

export interface UrlSignal {
  type: UrlSignalType;
  severity: UrlSignalSeverity;
  detail: Localized;
}

/** Result of the server-side "sandbox" inspection of one URL (no JS executed, no forms submitted). */
export interface ServerUrlInspection {
  url: string;
  finalUrl: string | null;
  redirects: string[];
  httpStatus: number | null;
  pageTitle: string | null;
  hasPasswordField: boolean;
  hasCardField: boolean;
  /** Registrable domains that page forms post to (when different from the page's). */
  formActionDomains: string[];
  /** Days since domain registration via RDAP; null when unknown (e.g. no RDAP for the TLD). */
  domainAgeDays: number | null;
  tls: boolean;
  /** Machine-readable failure reason when the fetch failed. */
  error: string | null;
  inspectedAt: string;
}

/** Combined lexical (on-device) + optional server inspection view of a URL. */
export interface UrlReport {
  /** URL exactly as it appeared in the text. */
  input: string;
  /** Normalised absolute URL (scheme added when missing). */
  normalized: string;
  host: string;
  registrableDomain: string;
  signals: UrlSignal[];
  /** Highest signal severity, or 'info' when nothing suspicious was found. */
  severity: UrlSignalSeverity;
  span?: TextSpan;
  inspection?: ServerUrlInspection;
}

/* ------------------------------------------------------------------ */
/* AI indicator extraction (wire format from the server)               */
/* ------------------------------------------------------------------ */

export interface AiIndicator {
  type: IndicatorType;
  /** Must be a verbatim quote from the analysed text; the engine verifies this. */
  evidence: string;
  /** 0..1 */
  confidence: number;
  /** Short reason in the requested UI language. */
  rationale: string;
}

export interface AiTextAnalysis {
  indicators: AiIndicator[];
  language: ContentLanguage;
  /** <= 200 chars, requested UI language. Shown as "AI summary", never used for scoring. */
  summary: string;
  /** True when the model judged the text to be ordinary/benign communication. */
  benignContext: boolean;
}

/* ------------------------------------------------------------------ */
/* Scan results & history                                              */
/* ------------------------------------------------------------------ */

export type ScanSource =
  | 'manual'
  | 'clipboard'
  | 'shortcut'
  | 'screenshot'
  | 'voice_recording'
  | 'voice_file'
  | 'live_call';

export interface AnalysisRun {
  modeRequested: InferenceMode;
  modeUsed: InferenceMode;
  fallbackReason?: FallbackReason;
  aiModel?: string;
  /** Wall-clock time of the whole analysis. */
  latencyMs: number;
  /** Optional AI summary (display only). */
  aiSummary?: string;
}

export interface TextScanResult {
  id: string;
  kind: 'text';
  createdAt: string;
  source: ScanSource;
  /** Analysed text. Stored redacted (OTP/card numbers masked) when persisted. */
  text: string;
  language: ContentLanguage;
  urls: UrlReport[];
  assessment: RiskAssessment;
  run: AnalysisRun;
}

export interface VoiceAuthenticity {
  /** Only honest status available until an anti-spoofing model is validated on Azerbaijani speech. */
  status: 'MODEL_PENDING';
  note: Localized;
}

export interface VoiceScanResult {
  id: string;
  kind: 'voice';
  createdAt: string;
  source: ScanSource;
  durationMs: number;
  transcript: string;
  transcriptLanguage: ContentLanguage;
  sttProvider?: string;
  assessment: RiskAssessment;
  run: AnalysisRun;
  authenticity: VoiceAuthenticity;
}

export type CallOutcome =
  /** Caller was a trusted contact: listening stopped after the first window and audio was deleted. */
  | 'TRUSTED_STOPPED'
  /** Unknown caller, whole call guarded, nothing serious found. */
  | 'COMPLETED_NO_RISK'
  /** A spoken warning was given. */
  | 'WARNED'
  /** User stopped the guard manually before any warning. */
  | 'STOPPED_BY_USER';

/** Metadata-only record of a guarded call. No transcript, no audio — by design. */
export interface CallSessionSummary {
  id: string;
  kind: 'call';
  createdAt: string;
  durationMs: number;
  callerLabel: string;
  callerTrusted: boolean;
  outcome: CallOutcome;
  peakScore: number;
  peakBand: RiskBand;
  indicatorTypes: IndicatorType[];
  warningsSpoken: number;
  familyNotified: boolean;
  chunksAnalyzed: number;
  modeUsed: InferenceMode;
}

export type HistoryEntry = TextScanResult | VoiceScanResult | CallSessionSummary;
export type HistoryKind = HistoryEntry['kind'];

/* ------------------------------------------------------------------ */
/* Family protection                                                   */
/* ------------------------------------------------------------------ */

export type FamilyRole = 'protected' | 'guardian';

export interface TrustedContact {
  id: string;
  name: string;
  /** As typed or imported; compared using digits only. */
  phone: string;
  relation: string;
}

export interface FamilyMember {
  memberId: string;
  displayName: string;
  role: FamilyRole;
  joinedAt: string;
}

/** This device's membership in a family relay group. */
export interface FamilyLink {
  familyId: string;
  memberId: string;
  /** Shared secret returned by the server; sent as `x-family-secret`. */
  secret: string;
  role: FamilyRole;
  displayName: string;
  /** 6-character join code (shown on the guardian device). */
  code: string;
  linkedAt: string;
}

export type AlertSourceKind = 'call' | 'message' | 'screen' | 'voice' | 'app';

/**
 * Minimal alert payload. Privacy by construction: no message text, no audio,
 * no transcript, no codes — only band, category, source kind and time.
 */
export interface FamilyAlertPayload {
  band: 'high' | 'critical';
  category: IndicatorType;
  source: AlertSourceKind;
  /** Which monitored app the event happened in (DaCy Kids, source 'app'). Never the content. */
  app?: MonitoredAppId;
  /** DaCy Kids child-phone simulator alert: shown with a "Demo" badge. */
  demo?: true;
}

export interface FamilyAlert extends FamilyAlertPayload {
  id: string;
  familyId: string;
  fromMemberId: string;
  fromName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* DaCy Kids — child-safety screening of selected apps                 */
/* ------------------------------------------------------------------ */

/**
 * Apps a guardian can select for screening. The agent screens an app ONLY while
 * it is open on the child's phone; everything else is never looked at.
 */
export type MonitoredAppId =
  | 'instagram'
  | 'whatsapp'
  | 'telegram'
  | 'tiktok'
  | 'snapchat'
  | 'discord'
  | 'roblox'
  | 'messages';

export const MONITORED_APP_IDS: readonly MonitoredAppId[] = [
  'instagram',
  'whatsapp',
  'telegram',
  'tiktok',
  'snapchat',
  'discord',
  'roblox',
  'messages',
] as const;

/** Guardian-controlled settings, synced to the child device through the family relay. */
export interface ChildSafetySettings {
  enabled: boolean;
  monitoredApps: MonitoredAppId[];
  /** Show the child a gentle, private safety tip when risk is detected (default true). */
  childWarnings: boolean;
  updatedAt: string;
}

/** Typical grooming progression (safeguarding literature), in order of severity. */
export type GroomingStage = 'none' | 'trust' | 'isolation' | 'probing' | 'image_request' | 'coercion';

export const GROOMING_STAGES: readonly GroomingStage[] = [
  'none',
  'trust',
  'isolation',
  'probing',
  'image_request',
  'coercion',
] as const;

/** One message in a screened conversation (content stays on the child device, in memory). */
export interface ChatMessage {
  id: string;
  /** 'contact' = the other person, 'child' = the protected child. */
  from: 'contact' | 'child';
  text: string;
  /** ISO timestamp. */
  at: string;
}

/** Conversation-level assessment produced by services/security/groomingEngine.ts. */
export interface ConversationAssessment {
  /** 0–100, deterministic. */
  score: number;
  band: RiskBand;
  /** Highest stage reached so far. */
  stage: GroomingStage;
  /** Stages reached, in order of first appearance. */
  stagesReached: GroomingStage[];
  /** Aggregated indicators (strongest evidence per type, from contact messages only). */
  indicators: Indicator[];
  /** Per-message contribution, for the timeline chart. */
  perMessage: { messageId: string; score: number; stage: GroomingStage; types: IndicatorType[] }[];
  /** True when the guardian should be alerted (band high/critical or a hard trigger). */
  shouldAlert: boolean;
  /** Category to report in the minimal alert (strongest child-safety indicator). */
  alertCategory: IndicatorType | null;
  explanation: Localized;
  /** Guidance for the guardian (never shown with message content). */
  guardianActions: Localized[];
  /** Gentle tip for the child. */
  childTip: Localized;
  engineVersion: string;
}
