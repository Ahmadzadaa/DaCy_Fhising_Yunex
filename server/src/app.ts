/**
 * DaCy HTTP API (Hono). Exported without a listener so tests can call `app.request()`.
 * Privacy: request logs carry method, path, status and duration only — never bodies,
 * query strings, transcripts, audio, URLs being inspected or family secrets.
 */
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  getLlmModel,
  getRateLimitPerMinute,
  getSttConfig,
  getTtsConfig,
  isLlmConfigured,
  isRequestLogEnabled,
  SERVER_VERSION,
} from './config.js';
import {
  ALERT_BANDS,
  ALERT_SOURCE_KINDS,
  ANALYSIS_CONTEXTS,
  FAMILY_ROLES,
  INDICATOR_TYPES,
  MONITORED_APP_IDS,
  SPEECH_LANGUAGES,
  UI_LANGUAGES,
  type AiTextAnalysis,
  type AnalyzeImageResponse,
  type AnalyzeTextResponse,
  type ApiErrorCode,
  type CreateFamilyResponse,
  type HealthResponse,
  type InspectUrlResponse,
  type JoinFamilyResponse,
  type LeaveFamilyResponse,
  type ListAlertsResponse,
  type LiveChunkResponse,
  type LiveSegment,
  type LiveSpeakerRole,
  type PostAlertResponse,
  type TranscribeResponse,
  type UpdateChildSettingsResponse,
} from './contract.js';
import { ApiError, errorBody } from './errors.js';
import { getFamilyStore } from './family.js';
import {
  extractUrls,
  formFile,
  formFlag,
  formString,
  oneOf,
  readJson,
  readMultipart,
  sniffImageType,
  validate,
} from './http.js';
import { analyzeImage, analyzeText } from './llm.js';
import { RateLimiter } from './rateLimit.js';
import { splitByRole } from './roles.js';
import { diarizeSegments, requireStt, transcribe } from './stt.js';
import { requireTts, synthesize, TTS_MAX_CHARS } from './tts.js';
import { inspectUrl } from './urlInspect.js';


/** Labels used in the AI window for live calls (see prompt.ts, call transcripts). */
const ROLE_LABEL: Record<LiveSpeakerRole, string> = { caller: 'Caller', owner: 'Owner', unknown: '' };
const KB = 1024;
const MB = 1024 * KB;
const JSON_LIMIT = 256 * KB;
const AUDIO_LIMIT = 10 * MB;
const IMAGE_LIMIT = 8 * MB;
const MAX_TEXT_CHARS = 20_000;
const LIVE_WINDOW_CHARS = 2_000;
const MAX_URL_INSPECTIONS = 3;

export const app = new Hono();

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'x-family-secret', 'x-leave-pin'],
    maxAge: 600,
  }),
);

app.use('*', async (c, next) => {
  const started = performance.now();
  await next();
  if (isRequestLogEnabled()) {
    // c.req.path is the pathname only — query strings (TTS text, `since`) are never logged.
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - started)}ms`);
  }
});

function clientIp(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown'; // app.request() in tests has no socket
  }
}

const limiter = new RateLimiter();
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const retryAfter = limiter.hit(clientIp(c), getRateLimitPerMinute());
  if (retryAfter > 0) {
    return c.json(errorBody('RATE_LIMITED', 'Too many requests, slow down'), 429, {
      'Retry-After': String(retryAfter),
    });
  }
  return next();
});

const tooLarge =
  (what: string): ((c: Context) => Response) =>
  (c) =>
    c.json(errorBody('PAYLOAD_TOO_LARGE', what), 413);
const jsonLimit = bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge('JSON body must be at most 256 KB') });
const audioLimit = bodyLimit({ maxSize: AUDIO_LIMIT, onError: tooLarge('Audio upload must be at most 10 MB') });
const imageLimit = bodyLimit({ maxSize: IMAGE_LIMIT, onError: tooLarge('Image upload must be at most 8 MB') });

const limitBody: MiddlewareHandler = (c, next) => {
  const path = c.req.path;
  if (path === '/v1/transcribe' || path === '/v1/live/chunk') return audioLimit(c, next);
  if (path === '/v1/analyze/image') return imageLimit(c, next);
  return jsonLimit(c, next);
};
app.use('*', limitBody);

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

app.get('/', (c) => c.json({ service: 'dacy-server', health: '/health' }));

app.get('/health', (c) => {
  const llm = isLlmConfigured();
  const stt = getSttConfig();
  const body: HealthResponse = {
    ok: true,
    service: 'dacy-server',
    version: SERVER_VERSION,
    time: new Date().toISOString(),
    capabilities: {
      llm,
      llmModel: llm ? getLlmModel() : null,
      vision: llm,
      stt: stt !== null,
      sttProvider: stt?.provider ?? null,
      sttModel: stt?.model ?? null,
      tts: getTtsConfig() !== null,
      urlInspection: true,
      familyRelay: true,
    },
  };
  return c.json(body);
});

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

const AnalyzeTextBody = z.object({
  text: z
    .string()
    .max(MAX_TEXT_CHARS, `text must be at most ${MAX_TEXT_CHARS} characters`)
    .refine((s) => s.trim().length > 0, 'text must not be empty'),
  uiLanguage: z.enum(UI_LANGUAGES).default('en'),
  context: z.enum(ANALYSIS_CONTEXTS).default('message'),
  inspectUrls: z.boolean().default(false),
});

app.post('/v1/analyze/text', async (c) => {
  const started = performance.now();
  const body = validate(AnalyzeTextBody, await readJson(c));
  const urls = body.inspectUrls ? extractUrls(body.text, MAX_URL_INSPECTIONS) : [];
  const [ai, urlInspections] = await Promise.all([
    analyzeText(body.text, body.uiLanguage, body.context),
    Promise.all(urls.map((url) => inspectUrl(url))),
  ]);
  const response: AnalyzeTextResponse = {
    ai: ai.ok ? ai.value : null,
    aiError: ai.ok ? null : ai.error,
    model: ai.model,
    urlInspections,
    latencyMs: Math.round(performance.now() - started),
  };
  return c.json(response);
});

app.post('/v1/analyze/image', async (c) => {
  const started = performance.now();
  if (!isLlmConfigured()) {
    throw new ApiError('AI_NOT_CONFIGURED', 'Screenshot analysis needs ANTHROPIC_API_KEY on the server');
  }
  const fields = await readMultipart(c);
  const image = formFile(fields, 'image');
  if (!image || image.size === 0) throw new ApiError('BAD_REQUEST', 'Missing "image" file field');
  const bytes = new Uint8Array(await image.arrayBuffer());
  const mediaType = sniffImageType(bytes);
  if (!mediaType) throw new ApiError('BAD_REQUEST', 'Unsupported image type: send JPEG, PNG, WebP or GIF');
  const uiLanguage = oneOf(formString(fields, 'uiLanguage'), UI_LANGUAGES, 'en');

  const result = await analyzeImage(Buffer.from(bytes).toString('base64'), mediaType, uiLanguage);
  const extractedText = result.ok ? result.value.extractedText : '';
  const urls = result.ok && formFlag(fields, 'inspectUrls') ? extractUrls(extractedText, MAX_URL_INSPECTIONS) : [];
  const urlInspections = await Promise.all(urls.map((url) => inspectUrl(url)));
  const response: AnalyzeImageResponse = {
    extractedText,
    ai: result.ok ? result.value.analysis : null,
    aiError: result.ok ? null : result.error,
    model: result.model,
    urlInspections,
    latencyMs: Math.round(performance.now() - started),
  };
  return c.json(response);
});

/* ------------------------------------------------------------------ */
/* Speech                                                              */
/* ------------------------------------------------------------------ */

app.post('/v1/transcribe', async (c) => {
  const started = performance.now();
  const stt = requireStt();
  const fields = await readMultipart(c);
  const audio = formFile(fields, 'audio');
  if (!audio) throw new ApiError('BAD_REQUEST', 'Missing "audio" file field');
  const language = oneOf(formString(fields, 'language'), SPEECH_LANGUAGES, 'auto');
  const transcript = await transcribe(audio, language, stt);
  const response: TranscribeResponse = {
    text: transcript.text,
    language: transcript.language,
    provider: transcript.provider,
    model: transcript.model,
    latencyMs: Math.round(performance.now() - started),
  };
  return c.json(response);
});

/** Stateless: the transcript window comes from the client and nothing is stored. */
app.post('/v1/live/chunk', async (c) => {
  const stt = requireStt();
  const fields = await readMultipart(c);
  const audio = formFile(fields, 'audio');
  if (!audio) throw new ApiError('BAD_REQUEST', 'Missing "audio" file field');
  const language = oneOf(formString(fields, 'language'), SPEECH_LANGUAGES, 'auto');
  const uiLanguage = oneOf(formString(fields, 'uiLanguage'), UI_LANGUAGES, 'en');
  const seqRaw = formString(fields, 'seq')?.trim();
  const seq = seqRaw ? Number(seqRaw) : 0;
  if (!Number.isSafeInteger(seq) || seq < 0) throw new ApiError('BAD_REQUEST', 'seq must be a non-negative integer');
  const context = (formString(fields, 'context') ?? '').slice(-LIVE_WINDOW_CHARS);
  const analyze = formString(fields, 'analyze')?.trim() === '1';

  const sttStarted = performance.now();
  // Accurate words + (in parallel) where the speaker changes; then split the words into
  // caller / owner pieces so only the caller's words are scored (see roles.ts).
  const [transcript, hints] = await Promise.all([transcribe(audio, language, stt), diarizeSegments(audio, language, stt)]);
  const segments: LiveSegment[] = await splitByRole(context, transcript.text, hints);
  const sttMs = Math.round(performance.now() - sttStarted);

  let ai: AiTextAnalysis | null = null;
  let aiError: ApiErrorCode | null = null;
  let model: string | null = null;
  let aiMs = 0;
  // Unknown speaker (no diarization) stays unlabelled, exactly as before.
  const labelled = segments.map((sg) => (sg.role === 'unknown' ? sg.text : `${ROLE_LABEL[sg.role]}: ${sg.text}`)).join('\n');
  const window = [context, labelled]
    .filter((part) => part.trim().length > 0)
    .join('\n')
    .slice(-LIVE_WINDOW_CHARS);
  if (analyze && window.trim().length > 0) {
    if (!isLlmConfigured()) {
      aiError = 'AI_NOT_CONFIGURED';
    } else {
      const aiStarted = performance.now();
      const result = await analyzeText(window, uiLanguage, 'call_transcript');
      aiMs = Math.round(performance.now() - aiStarted);
      model = result.model;
      if (result.ok) ai = result.value;
      else aiError = result.error;
    }
  }
  const response: LiveChunkResponse = {
    seq,
    text: transcript.text,
    segments,
    ai,
    aiError,
    model,
    latencyMs: { stt: sttMs, ai: aiMs },
  };
  return c.json(response);
});

const TtsInput = z.object({
  text: z
    .string({ error: 'text is required' })
    .trim()
    .min(1, 'text must not be empty')
    .max(TTS_MAX_CHARS, `text must be at most ${TTS_MAX_CHARS} characters`),
  language: z.enum(UI_LANGUAGES).default('en'),
});

async function speak(c: Context, input: unknown): Promise<Response> {
  const config = requireTts();
  const { text, language } = validate(TtsInput, input);
  const audio = await synthesize(text, language, config);
  return c.body(audio.slice().buffer, 200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.byteLength),
    'Cache-Control': 'private, max-age=86400',
  });
}

/** GET form so a player can stream straight from a URL. */
app.get('/v1/tts', (c) => {
  requireTts();
  return speak(c, { text: c.req.query('text'), language: c.req.query('language') || undefined });
});

app.post('/v1/tts', async (c) => {
  requireTts();
  return speak(c, await readJson(c));
});

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

const InspectUrlBody = z.object({
  url: z.string().trim().min(1, 'url must not be empty').max(2048, 'url must be at most 2048 characters'),
});

app.post('/v1/url/inspect', async (c) => {
  const { url } = validate(InspectUrlBody, await readJson(c));
  const response: InspectUrlResponse = { inspection: await inspectUrl(url) };
  return c.json(response);
});

/* ------------------------------------------------------------------ */
/* Family relay                                                        */
/* ------------------------------------------------------------------ */

const DisplayName = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim())
  .pipe(z.string().min(1, 'displayName must not be empty').max(40, 'displayName must be at most 40 characters'));

const LeavePin = z.string().trim().regex(/^\d{4,8}$/, 'leavePin must be 4–8 digits');
const CreateFamilyBody = z.object({ displayName: DisplayName, leavePin: LeavePin });
const ChangeLeavePinBody = z.object({ leavePin: LeavePin });

/**
 * Joining with a code always makes a PROTECTED member. The child's phone knows the
 * code, so accepting role "guardian" here would let it grant itself guardian rights
 * (switch off app screening, change the leave PIN, leave without the PIN).
 */
const JoinFamilyBody = z.object({
  code: z.string().trim().min(4, 'code is too short').max(16, 'code is too long'),
  displayName: DisplayName,
  role: z
    .enum(FAMILY_ROLES)
    .default('protected')
    .refine((role) => role === 'protected', 'Only protected members can join with a code; the guardian creates the family group'),
});

/**
 * Strict: unknown keys (e.g. a "text" field) are rejected — alerts carry metadata only.
 * `app` (which monitored app, never its content) is required for source "app" and
 * forbidden for every other source.
 */
const PostAlertBody = z
  .strictObject({
    memberId: z.string().min(1).max(64),
    band: z.enum(ALERT_BANDS),
    category: z.enum(INDICATOR_TYPES),
    source: z.enum(ALERT_SOURCE_KINDS),
    app: z.enum(MONITORED_APP_IDS).optional(),
    /** DaCy Kids simulator alert: shown with a "Demo" badge so it is never mistaken for a real detection. */
    demo: z.literal(true).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.source === 'app' && body.app === undefined) {
      ctx.addIssue({ code: 'custom', path: ['app'], message: 'app is required when source is "app"' });
    } else if (body.source !== 'app' && body.app !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['app'], message: 'app is only allowed when source is "app"' });
    }
  });

/** Strict: DaCy Kids settings are three guardian choices, nothing else. */
const UpdateChildSettingsBody = z.strictObject({
  enabled: z.boolean(),
  monitoredApps: z
    .array(z.enum(MONITORED_APP_IDS))
    .max(MONITORED_APP_IDS.length, `monitoredApps must have at most ${MONITORED_APP_IDS.length} entries`),
  childWarnings: z.boolean(),
});

const PathId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

app.post('/v1/family', async (c) => {
  const { displayName, leavePin } = validate(CreateFamilyBody, await readJson(c));
  const response: CreateFamilyResponse = getFamilyStore().create(displayName, leavePin);
  return c.json(response);
});

app.post('/v1/family/join', async (c) => {
  const body = validate(JoinFamilyBody, await readJson(c));
  const response: JoinFamilyResponse = getFamilyStore().join(body.code, body.displayName);
  return c.json(response);
});

app.post('/v1/family/:familyId/alerts', async (c) => {
  const familyId = validate(PathId, c.req.param('familyId'));
  const body = validate(PostAlertBody, await readJson(c));
  const alert = getFamilyStore().postAlert(familyId, c.req.header('x-family-secret'), body);
  const response: PostAlertResponse = { alert };
  return c.json(response);
});

app.get('/v1/family/:familyId/alerts', (c) => {
  const familyId = validate(PathId, c.req.param('familyId'));
  const sinceRaw = c.req.query('since');
  let sinceMs: number | null = null;
  if (sinceRaw !== undefined && sinceRaw !== '') {
    sinceMs = Date.parse(sinceRaw);
    if (!Number.isFinite(sinceMs)) throw new ApiError('BAD_REQUEST', 'since must be an ISO 8601 timestamp');
  }
  const { alerts, members, childSettings } = getFamilyStore().listAlerts(
    familyId,
    c.req.header('x-family-secret'),
    sinceMs,
  );
  const response: ListAlertsResponse = { alerts, members, serverTime: new Date().toISOString(), childSettings };
  return c.json(response);
});

/** Guardian only: which apps the child's device may screen (DaCy Kids). */
app.put('/v1/family/:familyId/child-settings', async (c) => {
  const familyId = validate(PathId, c.req.param('familyId'));
  const body = validate(UpdateChildSettingsBody, await readJson(c));
  const childSettings = getFamilyStore().updateChildSettings(familyId, c.req.header('x-family-secret'), body);
  const response: UpdateChildSettingsResponse = { childSettings };
  return c.json(response);
});

app.delete('/v1/family/:familyId/members/:memberId', (c) => {
  const familyId = validate(PathId, c.req.param('familyId'));
  const memberId = validate(PathId, c.req.param('memberId'));
  getFamilyStore().removeMember(familyId, c.req.header('x-family-secret'), memberId, c.req.header('x-leave-pin'));
  const response: LeaveFamilyResponse = { ok: true };
  return c.json(response);
});

app.put('/v1/family/:familyId/leave-pin', async (c) => {
  const familyId = validate(PathId, c.req.param('familyId'));
  const { leavePin } = validate(ChangeLeavePinBody, await readJson(c));
  getFamilyStore().changeLeavePin(familyId, c.req.header('x-family-secret'), leavePin);
  const response: LeaveFamilyResponse = { ok: true };
  return c.json(response);
});

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

app.notFound((c) => c.json(errorBody('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`), 404));

const CODE_BY_HTTP_STATUS: Record<number, ApiErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(errorBody(err.code, err.message), err.status);
  if (err instanceof HTTPException) {
    const code = CODE_BY_HTTP_STATUS[err.status] ?? 'INTERNAL';
    return c.json(errorBody(code, code === 'INTERNAL' ? 'Internal server error' : 'Request rejected'), err.status);
  }
  // Name + stack frames only: messages of unexpected errors could contain request data.
  const frames = err instanceof Error && err.stack ? err.stack.split('\n').slice(1, 4).join(' | ') : '';
  console.error(`[error] ${c.req.method} ${c.req.path}: ${err instanceof Error ? err.name : 'error'} ${frames}`);
  return c.json(errorBody('INTERNAL', 'Internal server error'), 500);
});
