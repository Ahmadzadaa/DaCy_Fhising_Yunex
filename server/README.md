# DaCy server

Backend for the DaCy anti-fraud demo app (Expo). It adds four things the phone cannot do alone:

- **AI indicator extraction** with Claude (text, live call transcripts, screenshots). Claude only points at
  verbatim evidence; the 0–100 risk score is always computed by the app's deterministic engine.
- **Speech-to-text proxy** (OpenAI or Groq) and **text-to-speech** for spoken call warnings (OpenAI).
- **Link sandbox**: an isolated server-side fetch of a URL (no JavaScript, no form submission) with an SSRF guard.
- **Family relay**: minimal high-risk alerts from a protected person's phone to a guardian's phone.

Stack: Node 24, TypeScript, Hono, the official `@anthropic-ai/sdk`, zod. No database.

## Run

```bash
cd server
cp .env.example .env      # optional: add keys (all keys are optional)
npm start                 # http://0.0.0.0:8787, prints LAN addresses + enabled capabilities
npm run dev               # same, with reload on change
npm run typecheck
npm test                  # offline, no keys needed
```

Requires Node >= 22.13 (developed on Node 24). `server/.env` is loaded automatically; variables already set in
the shell take precedence. The phone must be on the same network; the app talks to `http://<LAN-IP>:8787`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port (binds `0.0.0.0`). |
| `ANTHROPIC_API_KEY` | — | Enables Claude (`capabilities.llm` and `vision`). |
| `DACY_LLM_MODEL` | `claude-opus-5-5` | Claude model id. |
| `DACY_LLM_EFFORT` | `low` | `low`, `medium`, `high`, `xhigh` or `max`. |
| `OPENAI_API_KEY` | — | Enables TTS and (by default) speech-to-text via OpenAI. |
| `GROQ_API_KEY` | — | Speech-to-text via Groq (used when no OpenAI key, or `STT_PROVIDER=groq`). |
| `STT_PROVIDER` | auto | `openai` or `groq`. Auto: OpenAI if `OPENAI_API_KEY`, else Groq if `GROQ_API_KEY`. |
| `STT_MODEL` | `gpt-4o-mini-transcribe` / `whisper-large-v3-turbo` | Transcription model for the chosen provider. |
| `TTS_MODEL` | `gpt-4o-mini-tts` | OpenAI speech model. |
| `TTS_VOICE` | `alloy` | OpenAI voice. |
| `RATE_LIMIT_PER_MIN` | `120` | Requests per minute per client IP. |
| `DACY_DATA_DIR` | `server/data` | Folder for `family.json`. |
| `DACY_LOG_REQUESTS` | `1` | `0` turns off the per-request log line. |

## Endpoints

All errors are JSON: `{ "error": { "code", "message" } }` with codes from `ApiErrorCode`
(`BAD_REQUEST` 400, `UNAUTHORIZED` 401, `NOT_FOUND` 404, `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429,
`INTERNAL` 500, `PROVIDER_ERROR` 502, `*_NOT_CONFIGURED` 503, `TIMEOUT` 504). CORS is open (`*`).
Body limits: JSON 256 KB, audio 10 MB, images 8 MB. Wire types live in `src/contract.ts`
(a mirror of `mobile/src/services/api/contract.ts` and its types).

| Method & path | What it does |
|---|---|
| `GET /health` | Service info and which capabilities are configured. |
| `POST /v1/analyze/text` | JSON `{ text, uiLanguage, context, inspectUrls }` (text 1–20000 chars). Claude extracts indicators; if `inspectUrls`, up to 3 links in the text are inspected in parallel. Without a Claude key: HTTP 200 with `ai: null`, `aiError: "AI_NOT_CONFIGURED"` (URL inspections still returned). AI failures (`TIMEOUT`, `RATE_LIMITED`, `PROVIDER_ERROR`, `AI_REFUSED`) are also reported in `aiError` with HTTP 200. |
| `POST /v1/analyze/image` | Multipart `image` (JPEG/PNG/WebP/GIF, detected from bytes), `uiLanguage`, `inspectUrls`. Claude vision returns the verbatim visible text (`extractedText`) plus indicators quoted from it; links found in that text can be inspected. 503 `AI_NOT_CONFIGURED` without a Claude key. |
| `POST /v1/transcribe` | Multipart `audio` (m4a/mp4/webm/wav/mp3/ogg) and `language` (`en`/`az`/`auto`). Returns the transcript. 503 `STT_NOT_CONFIGURED` without an STT key. Near-empty audio returns `text: ""`. |
| `POST /v1/live/chunk` | Multipart `audio`, `language`, `uiLanguage`, `seq`, `context`, `analyze`. Transcribes the chunk; with `analyze=1` (and Claude configured) analyses the last 2000 chars of `context + "\n" + text` as a call transcript. Stateless: the client sends the context window, the server stores nothing. |
| `POST /v1/url/inspect` | JSON `{ url }` → `{ inspection }` (see the link sandbox below). |
| `GET /v1/tts?text=&language=` / `POST /v1/tts` | Text (max 300 chars) → `audio/mpeg` via OpenAI. Cached in memory (50 entries). 503 `TTS_NOT_CONFIGURED` without `OPENAI_API_KEY`. |
| `POST /v1/family` | JSON `{ displayName }`: a guardian creates a family group → `{ familyId, memberId, secret, code, role }`. |
| `POST /v1/family/join` | JSON `{ code, displayName, role? }`: join with the 6-character code — always as a **protected** member (`role: "guardian"` → 400; only the family creator is a guardian). |
| `POST /v1/family/:familyId/alerts` | Header `x-family-secret`; JSON `{ memberId, band, category, source, app?, demo? }`. Posts an alert as yourself. `demo: true` marks a simulator / test alert. |
| `GET /v1/family/:familyId/alerts?since=ISO` | Header `x-family-secret`. Alerts newer than `since` (or the last 50) plus the member list and `childSettings`. A guardian sees every alert; a protected member only the alerts its own device sent. |
| `DELETE /v1/family/:familyId/members/:memberId` | Header `x-family-secret`. Leave the family (a guardian may also remove others). |

### Claude integration (`src/llm.ts`, `src/prompt.ts`)

- Official SDK, beta Messages endpoint: `client.beta.messages.parse` with a zod schema converted by
  `betaZodOutputFormat` (structured outputs). Output: `indicators[{ type, evidence, confidence, rationale }]`,
  `language`, `summary`, `benignContext` (+ `extractedText` for screenshots). There is no score field.
- `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`: if the model declines for policy reasons,
  the API retries on Anthropic's recommended fallback model. A final `stop_reason: "refusal"` → `AI_REFUSED`.
- `output_config.effort` from `DACY_LLM_EFFORT` (default `low`); no `thinking`, no temperature, no prefill.
- The system prompt (role, indicator definitions, rules, 4 few-shot examples in EN/AZ) is fully static and sent
  with `cache_control` on its last block, so repeated requests read it from the prompt cache.
- Content is wrapped in `<content context="...">` and the prompt tells the model to treat it as data
  (prompt-injection resistant). Post-processing drops empty evidence, clamps confidence to [0, 1] and limits the
  summary to 200 characters. Timeouts: 15 s for text and live chunks, 40 s for images; 1 retry.

### Link sandbox (`src/urlInspect.ts`)

- Only `http`/`https` on default ports, no `user:pass@`. Internal names (`localhost`, `*.local`, single-label
  hosts…) and non-public IP literals are rejected before any network access.
- DNS answers are checked again at connect time through a custom `lookup`: private, loopback, link-local,
  CGNAT, multicast, reserved and unspecified IPv4/IPv6 (including IPv4-mapped IPv6, `fc00::/7`, `fe80::/10`)
  are refused. This also stops DNS rebinding.
- Redirects are followed manually (max 5) with each hop re-validated; 7 s total budget; at most 1 MB of body.
  The HTML is read with regular expressions only: page title, password field, card fields, and the
  registrable domains of forms that post elsewhere.
- Domain age comes from RDAP (`rdap.org`, 3 s timeout; `null` when unknown — `.az` has no RDAP).
- Failures are reported in `error`: `BLOCKED_PRIVATE_ADDRESS`, `DNS_FAILED`, `TIMEOUT`, `TOO_MANY_REDIRECTS`,
  `CONNECTION_FAILED`, `INVALID_URL`, `UNSUPPORTED_PORT`.

## Privacy

- The server **stores nothing except family relay metadata**: no message text, transcripts, audio, images,
  URLs or AI output are written anywhere. Analysis requests are processed in memory and forwarded only to the
  configured AI/speech providers. The TTS cache holds only warning phrases, in memory.
- Family alerts carry only `band`, `category`, `source`, sender id/name and time; the API rejects any other field.
  Alerts expire after 24 hours (max 200 per family). `data/family.json` stores only SHA-256 hashes of member
  secrets; secrets are compared in constant time and stop working when a member leaves.
- Request logs contain method, path, status and duration only — never bodies, query strings, transcripts,
  audio, inspected URLs or secrets. Errors from providers are logged as class name and HTTP status only.
- `data/` and `.env` are git-ignored.
