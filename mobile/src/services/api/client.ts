/**
 * Typed HTTP client for the DaCy server. Every call resolves to an ApiResult —
 * it never throws — so callers can fall back to the deterministic engine.
 */
import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import type {
  AnalyzeImageResponse,
  AnalyzeTextRequest,
  AnalyzeTextResponse,
  ApiErrorBody,
  ApiErrorCode,
  CreateFamilyRequest,
  CreateFamilyResponse,
  HealthResponse,
  InspectUrlResponse,
  JoinFamilyRequest,
  JoinFamilyResponse,
  LeaveFamilyResponse,
  ListAlertsResponse,
  LiveChunkResponse,
  PostAlertRequest,
  PostAlertResponse,
  TranscribeResponse,
  UpdateChildSettingsRequest,
  UpdateChildSettingsResponse,
} from './contract';
import type { SpeechLanguage, UiLanguage } from '@/types/security';

export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'CLIENT_TIMEOUT';

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; code: ClientErrorCode; message: string; status: number | null };

/** A local file to upload (RN file URI, or a blob:/http: URI on web). */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    !!value &&
    typeof value === 'object' &&
    'error' in value &&
    !!(value as ApiErrorBody).error &&
    typeof (value as ApiErrorBody).error.code === 'string'
  );
}

export async function apiRequest<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };
  let body: string | FormData | undefined;
  if (options.form) {
    body = options.form; // fetch sets the multipart boundary itself
  } else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      if (isApiErrorBody(parsed)) {
        return { ok: false, code: parsed.error.code, message: parsed.error.message, status: response.status };
      }
      return { ok: false, code: 'INTERNAL', message: `HTTP ${response.status}`, status: response.status };
    }
    return { ok: true, data: parsed as T, status: response.status };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, code: 'CLIENT_TIMEOUT', message: `No response within ${Math.round(timeoutMs / 1000)} s`, status: null };
    }
    const message = error instanceof Error ? error.message : 'Network request failed';
    return { ok: false, code: 'NETWORK', message, status: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Appends a local file to multipart form data on native and web. */
export async function appendFile(form: FormData, field: string, file: UploadFile): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, blob, file.name);
    return;
  }
  // Expo SDK 58's fetch only accepts Blob-like parts (objects with bytes()), not the
  // classic React Native { uri, name, type } object. expo-file-system's File implements that.
  if (file.uri.startsWith('file:')) {
    const local = new FsFile(file.uri);
    form.append(field, local as unknown as Blob, file.name);
    return;
  }
  // Remote/other URIs (rare on native): download into memory first.
  const blob = await (await fetch(file.uri)).blob();
  form.append(field, blob, file.name);
}

/* ---------------- Endpoints ---------------- */

export function getHealth(baseUrl: string, timeoutMs = 4_000): Promise<ApiResult<HealthResponse>> {
  return apiRequest<HealthResponse>(baseUrl, '/health', { timeoutMs });
}

export function analyzeTextRemote(
  baseUrl: string,
  request: AnalyzeTextRequest,
  timeoutMs = 20_000,
): Promise<ApiResult<AnalyzeTextResponse>> {
  return apiRequest<AnalyzeTextResponse>(baseUrl, '/v1/analyze/text', { json: request, timeoutMs });
}

export async function analyzeImageRemote(
  baseUrl: string,
  image: UploadFile,
  uiLanguage: UiLanguage,
  inspectUrls: boolean,
  timeoutMs = 45_000,
): Promise<ApiResult<AnalyzeImageResponse>> {
  const form = new FormData();
  await appendFile(form, 'image', image);
  form.append('uiLanguage', uiLanguage);
  form.append('inspectUrls', inspectUrls ? '1' : '0');
  return apiRequest<AnalyzeImageResponse>(baseUrl, '/v1/analyze/image', { form, timeoutMs });
}

export async function transcribeRemote(
  baseUrl: string,
  audio: UploadFile,
  language: SpeechLanguage,
  timeoutMs = 30_000,
): Promise<ApiResult<TranscribeResponse>> {
  const form = new FormData();
  await appendFile(form, 'audio', audio);
  form.append('language', language);
  return apiRequest<TranscribeResponse>(baseUrl, '/v1/transcribe', { form, timeoutMs });
}

export interface LiveChunkParams {
  audio: UploadFile;
  language: SpeechLanguage;
  uiLanguage: UiLanguage;
  seq: number;
  /** Previous transcript window (<= 2000 chars). */
  context: string;
  analyze: boolean;
}

export async function sendLiveChunk(
  baseUrl: string,
  params: LiveChunkParams,
  timeoutMs = 20_000,
): Promise<ApiResult<LiveChunkResponse>> {
  const form = new FormData();
  await appendFile(form, 'audio', params.audio);
  form.append('language', params.language);
  form.append('uiLanguage', params.uiLanguage);
  form.append('seq', String(params.seq));
  form.append('context', params.context.slice(-2000));
  form.append('analyze', params.analyze ? '1' : '0');
  return apiRequest<LiveChunkResponse>(baseUrl, '/v1/live/chunk', { form, timeoutMs });
}

export function inspectUrlRemote(baseUrl: string, url: string, timeoutMs = 15_000): Promise<ApiResult<InspectUrlResponse>> {
  return apiRequest<InspectUrlResponse>(baseUrl, '/v1/url/inspect', { json: { url }, timeoutMs });
}

/** URL of the server TTS endpoint (GET returns audio/mpeg) — playable directly by an audio player. */
export function ttsUrl(baseUrl: string, text: string, language: UiLanguage): string {
  return `${baseUrl}/v1/tts?language=${language}&text=${encodeURIComponent(text)}`;
}

/* ---------------- Family relay ---------------- */

export function createFamilyRemote(baseUrl: string, request: CreateFamilyRequest): Promise<ApiResult<CreateFamilyResponse>> {
  return apiRequest<CreateFamilyResponse>(baseUrl, '/v1/family', { json: request, timeoutMs: 8_000 });
}

export function joinFamilyRemote(baseUrl: string, request: JoinFamilyRequest): Promise<ApiResult<JoinFamilyResponse>> {
  return apiRequest<JoinFamilyResponse>(baseUrl, '/v1/family/join', { json: request, timeoutMs: 8_000 });
}

export function postFamilyAlertRemote(
  baseUrl: string,
  familyId: string,
  secret: string,
  request: PostAlertRequest,
): Promise<ApiResult<PostAlertResponse>> {
  return apiRequest<PostAlertResponse>(baseUrl, `/v1/family/${encodeURIComponent(familyId)}/alerts`, {
    json: request,
    headers: { 'x-family-secret': secret },
    timeoutMs: 8_000,
  });
}

export function listFamilyAlertsRemote(
  baseUrl: string,
  familyId: string,
  secret: string,
  sinceIso: string | null,
): Promise<ApiResult<ListAlertsResponse>> {
  const query = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : '';
  return apiRequest<ListAlertsResponse>(baseUrl, `/v1/family/${encodeURIComponent(familyId)}/alerts${query}`, {
    headers: { 'x-family-secret': secret },
    timeoutMs: 6_000,
  });
}

export function leaveFamilyRemote(
  baseUrl: string,
  familyId: string,
  secret: string,
  memberId: string,
  leavePin?: string,
): Promise<ApiResult<LeaveFamilyResponse>> {
  const headers: Record<string, string> = { 'x-family-secret': secret };
  if (leavePin) headers['x-leave-pin'] = leavePin;
  return apiRequest<LeaveFamilyResponse>(
    baseUrl,
    `/v1/family/${encodeURIComponent(familyId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE', headers, timeoutMs: 8_000 },
  );
}

export function changeLeavePinRemote(
  baseUrl: string,
  familyId: string,
  secret: string,
  leavePin: string,
): Promise<ApiResult<LeaveFamilyResponse>> {
  return apiRequest<LeaveFamilyResponse>(baseUrl, `/v1/family/${encodeURIComponent(familyId)}/leave-pin`, {
    method: 'PUT',
    json: { leavePin },
    headers: { 'x-family-secret': secret },
    timeoutMs: 8_000,
  });
}

/** Guardian only: replace the DaCy Kids settings that the family's protected phones follow. */
export function updateChildSettingsRemote(
  baseUrl: string,
  familyId: string,
  secret: string,
  request: UpdateChildSettingsRequest,
): Promise<ApiResult<UpdateChildSettingsResponse>> {
  return apiRequest<UpdateChildSettingsResponse>(baseUrl, `/v1/family/${encodeURIComponent(familyId)}/child-settings`, {
    method: 'PUT',
    json: request,
    headers: { 'x-family-secret': secret },
    timeoutMs: 8_000,
  });
}
