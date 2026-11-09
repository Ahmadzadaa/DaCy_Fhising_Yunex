/**
 * Wire contract between the DaCy app and the DaCy server.
 * MIRRORED in server/src/contract.ts — change both files together.
 *
 * Base URL: http://<dev-machine-ip>:8787 (auto-detected from the Expo dev host).
 */
import type {
  AiTextAnalysis,
  AlertSourceKind,
  ChildSafetySettings,
  MonitoredAppId,
  FamilyAlert,
  FamilyMember,
  FamilyRole,
  IndicatorType,
  ServerUrlInspection,
  UiLanguage,
} from '@/types/security';

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
/** Who said a line in a live call: the CALLER (heard on speaker) or the phone's OWNER. */
export type LiveSpeakerRole = 'caller' | 'owner' | 'unknown';
export interface LiveSegment {
  role: LiveSpeakerRole;
  text: string;
}

export interface LiveChunkResponse {
  seq: number;
  text: string;
  /** The same text split by speaker (diarization + role assignment); one 'unknown' segment when unavailable. */
  segments?: LiveSegment[];
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

/* POST /v1/family/join  (JSON) */
/** Always joins as a protected member; the server rejects role "guardian" (400). */
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
