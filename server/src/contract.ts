/**
 * MIRROR of mobile/src/services/api/contract.ts + types — keep in sync.
 *
 * Self-contained copy of every wire-level type the server needs, taken from
 * mobile/src/services/api/contract.ts and mobile/src/types/security.ts.
 * No imports from the mobile folder: change both sides together.
 */

/* ------------------------------------------------------------------ */
/* Languages (security.ts)                                             */
/* ------------------------------------------------------------------ */

/** Language of the app UI. English is the default (international jury). */
export type UiLanguage = 'en' | 'az';
export const UI_LANGUAGES = ['en', 'az'] as const satisfies readonly UiLanguage[];

/** Language hint passed to speech-to-text. */
export type SpeechLanguage = 'en' | 'az' | 'auto';
export const SPEECH_LANGUAGES = ['en', 'az', 'auto'] as const satisfies readonly SpeechLanguage[];

/** Detected language of analysed content. */
export type ContentLanguage = 'en' | 'az' | 'ru' | 'mixed' | 'other' | 'unknown';
export const CONTENT_LANGUAGES = [
  'en',
  'az',
  'ru',
  'mixed',
  'other',
  'unknown',
] as const satisfies readonly ContentLanguage[];

/* ------------------------------------------------------------------ */
/* Indicators (security.ts)                                            */
/* ------------------------------------------------------------------ */

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

export const INDICATOR_TYPES = [
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
] as const satisfies readonly IndicatorType[];

// Compile-time guard: the list above must contain every IndicatorType.
type MissingIndicatorTypes = Exclude<IndicatorType, (typeof INDICATOR_TYPES)[number]>;
const _indicatorListIsExhaustive: [MissingIndicatorTypes] extends [never] ? true : never = true;
void _indicatorListIsExhaustive;

/** Indicator types specific to child safety (grooming / exploitation). */
export const CHILD_SAFETY_TYPES = [
  'TRUST_GROOMING',
  'PERSONAL_INFO_PROBE',
  'GIFT_GROOMING',
  'PERSONAL_IMAGE_REQUEST',
  'MEETING_REQUEST',
  'SEXTORTION_THREAT',
] as const satisfies readonly IndicatorType[];

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
/* Links (security.ts)                                                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Family protection (security.ts)                                     */
/* ------------------------------------------------------------------ */

export type FamilyRole = 'protected' | 'guardian';
export const FAMILY_ROLES = ['protected', 'guardian'] as const satisfies readonly FamilyRole[];

export interface FamilyMember {
  memberId: string;
  displayName: string;
  role: FamilyRole;
  joinedAt: string;
}

export type AlertSourceKind = 'call' | 'message' | 'screen' | 'voice' | 'app';
export const ALERT_SOURCE_KINDS = [
  'call',
  'message',
  'screen',
  'voice',
  'app',
] as const satisfies readonly AlertSourceKind[];

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
export const ALERT_BANDS = ['high', 'critical'] as const satisfies readonly FamilyAlertPayload['band'][];

export interface FamilyAlert extends FamilyAlertPayload {
  id: string;
  familyId: string;
  fromMemberId: string;
  fromName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* DaCy Kids — child-safety screening of selected apps (security.ts)   */
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

export const MONITORED_APP_IDS = [
  'instagram',
  'whatsapp',
  'telegram',
  'tiktok',
  'snapchat',
  'discord',
  'roblox',
  'messages',
] as const satisfies readonly MonitoredAppId[];

// Compile-time guard: the list above must contain every MonitoredAppId.
type MissingMonitoredApps = Exclude<MonitoredAppId, (typeof MONITORED_APP_IDS)[number]>;
const _monitoredAppListIsExhaustive: [MissingMonitoredApps] extends [never] ? true : never = true;
void _monitoredAppListIsExhaustive;

/** Guardian-controlled settings, synced to the child device through the family relay. */
export interface ChildSafetySettings {
  enabled: boolean;
  monitoredApps: MonitoredAppId[];
  /** Show the child a gentle, private safety tip when risk is detected (default true). */
  childWarnings: boolean;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Wire contract (contract.ts)                                         */
/* ------------------------------------------------------------------ */

export const SERVER_PORT = 8787;

/** Error codes returned by the server in `{ error: { code, message } }`. */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'AI_NOT_CONFIGURED'
  | 'STT_NOT_CONFIGURED'
  | 'TTS_NOT_CONFIGURED'
  | 'AI_REFUSED'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PAYLOAD_TOO_LARGE'
  | 'LEAVE_PIN_INVALID'
  | 'LEAVE_PIN_LOCKED'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

/* GET /health */
export interface HealthResponse {
  ok: true;
  service: 'dacy-server';
  version: string;
  time: string;
  capabilities: {
    llm: boolean;
    llmModel: string | null;
    vision: boolean;
    stt: boolean;
    sttProvider: string | null;
    sttModel: string | null;
    tts: boolean;
    urlInspection: boolean;
    familyRelay: boolean;
  };
}

/* POST /v1/analyze/text  (JSON) */
export type AnalysisContext = 'message' | 'call_transcript' | 'screen';
export const ANALYSIS_CONTEXTS = [
  'message',
  'call_transcript',
  'screen',
] as const satisfies readonly AnalysisContext[];

export interface AnalyzeTextRequest {
  text: string;
  uiLanguage: UiLanguage;
  context: AnalysisContext;
  /** Inspect up to 3 URLs found in the text with the isolated fetcher. */
  inspectUrls: boolean;
}

export interface AnalyzeTextResponse {
  /** Null when AI is not configured or failed; see aiError. */
  ai: AiTextAnalysis | null;
  aiError: ApiErrorCode | null;
  model: string | null;
  urlInspections: ServerUrlInspection[];
  latencyMs: number;
}

/* POST /v1/analyze/image  (multipart: field "image" = jpeg/png file; fields "uiLanguage", "inspectUrls") */
export interface AnalyzeImageResponse {
  /** Verbatim visible text read from the screenshot ('' when unreadable). */
  extractedText: string;
  ai: AiTextAnalysis | null;
  aiError: ApiErrorCode | null;
  model: string | null;
  urlInspections: ServerUrlInspection[];
  latencyMs: number;
}

/* POST /v1/transcribe  (multipart: field "audio" = m4a/webm/wav/mp3; field "language" = en|az|auto) */
export interface TranscribeResponse {
  text: string;
  language: string | null;
  provider: string;
  model: string;
  latencyMs: number;
}

/*
 * POST /v1/live/chunk  (multipart)
 *   audio:      audio chunk file (3–6 s)
 *   language:   en | az | auto
 *   uiLanguage: en | az
 *   seq:        chunk sequence number
 *   context:    previous transcript window (<= 2000 chars) — server is stateless and stores nothing
 *   analyze:    "1" to run AI indicator extraction on context + new text, "0" for transcription only
 */
export interface LiveChunkResponse {
  seq: number;
  text: string;
  ai: AiTextAnalysis | null;
  aiError: ApiErrorCode | null;
  model: string | null;
  latencyMs: { stt: number; ai: number };
}

/* POST /v1/url/inspect  (JSON) */
export interface InspectUrlRequest {
  url: string;
}
export interface InspectUrlResponse {
  inspection: ServerUrlInspection;
}

/* POST /v1/tts  (JSON) → audio/mpeg bytes. 503 TTS_NOT_CONFIGURED when unavailable. */
export interface TtsRequest {
  text: string;
  language: UiLanguage;
}

/* ---------------- Family relay ---------------- */

/* POST /v1/family  (JSON) — guardian creates a family group */
export interface CreateFamilyRequest {
  displayName: string;
  /** 4–8 digit PIN chosen by the guardian; protected members need it to leave the family. */
  leavePin: string;
}

/* PUT /v1/family/:familyId/leave-pin  (JSON, header x-family-secret, guardian only) */
export interface ChangeLeavePinRequest {
  leavePin: string;
}
export interface CreateFamilyResponse {
  familyId: string;
  memberId: string;
  secret: string;
  code: string;
  role: FamilyRole;
}

/* POST /v1/family/join  (JSON) — always joins as a protected member; role "guardian" → 400 */
export interface JoinFamilyRequest {
  code: string;
  displayName: string;
  role?: 'protected';
}
export interface JoinFamilyResponse {
  familyId: string;
  memberId: string;
  secret: string;
  code: string;
  role: FamilyRole;
  members: FamilyMember[];
}

/* POST /v1/family/:familyId/alerts  (JSON, header x-family-secret) — minimal metadata only */
export interface PostAlertRequest {
  memberId: string;
  band: 'high' | 'critical';
  category: IndicatorType;
  source: AlertSourceKind;
  /** Only with source 'app' (DaCy Kids): which monitored app. */
  app?: MonitoredAppId;
  /** DaCy Kids simulator alert: shown with a "Demo" badge so it is never mistaken for a real detection. */
  demo?: true;
}
export interface PostAlertResponse {
  alert: FamilyAlert;
}

/* GET /v1/family/:familyId/alerts?since=<ISO>  (header x-family-secret)
   Guardians get every family alert; a protected member only the alerts its own device sent. */
export interface ListAlertsResponse {
  alerts: FamilyAlert[];
  members: FamilyMember[];
  serverTime: string;
  /** DaCy Kids settings chosen by the guardian (null until set). */
  childSettings: ChildSafetySettings | null;
}

/* PUT /v1/family/:familyId/child-settings  (JSON, header x-family-secret, guardian only) */
export interface UpdateChildSettingsRequest {
  enabled: boolean;
  monitoredApps: MonitoredAppId[];
  childWarnings: boolean;
}
export interface UpdateChildSettingsResponse {
  childSettings: ChildSafetySettings;
}

/* DELETE /v1/family/:familyId/members/:memberId  (headers x-family-secret, x-leave-pin for protected members) */
export interface LeaveFamilyResponse {
  ok: true;
}
