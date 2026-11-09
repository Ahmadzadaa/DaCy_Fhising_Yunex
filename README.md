# DaCy — AI anti-fraud protection for families

> **Fırıldaqçı tələsdirir. DaCy düşündürür.**
> *Scammers rush you. DaCy makes you think.*

DaCy protects elderly people and children from phone and message fraud and from
online grooming. It is an Expo (React Native) app for iPhone plus a small Node
server. The demo runs in **Expo Go**, so no Xcode build is needed.

| # | Feature | What the user does | What DaCy does |
|---|---|---|---|
| 1 | **Screen Scan** | Taps one button (Control Center, Action Button or Back Tap) while a suspicious message is on screen | iOS Shortcuts takes a screenshot and Apple's on-device OCR reads it. DaCy opens with the verdict, highlights the exact suspicious words and inspects links in a server-side sandbox |
| 2 | **Call Guard** | Starts Call Guard and keeps the call on speakerphone | Listens in real time. In the first 5 s it identifies the caller: if it is a trusted contact, DaCy deletes what it heard and switches off. Otherwise it keeps listening and, when it detects fraud, **says a warning out loud** and alerts the family |
| 3 | **Family protection** | The guardian creates a family group with a **leave PIN**; the grandparent's or child's phone joins with a code | Dangerous calls trigger an alert on the guardian's phone within seconds. Only risk level, category and time are shared, never content. A protected member can leave the group only with the guardian's PIN |
| 4 | **DaCy Kids** | The guardian picks which apps to screen (Instagram, WhatsApp, Telegram, TikTok, Snapchat, Discord, Roblox, SMS). The child uses the phone as usual | Screening runs **only while a selected app is open**. A conversation-level engine follows grooming stages (trust, secrecy, probing, photo request, threats) over 30 days. When something is suspicious, the child sees a gentle private tip and the guardian gets a short alert (band, category, app, time) with "stay calm, don't blame your child" guidance. Messages never leave the phone |

## Honest platform notes (important for the jury)

- **iOS gives no app access to phone-call audio** (and WhatsApp calls are end-to-end encrypted). In this demo Call Guard listens through the **microphone** while the call is on speakerphone. In production the audio stream would come from the **mobile operator** (a network-level integration such as Azercell). The app and engine stay the same.
- iPhone does not share caller ID with apps, so before the call you pick "Unknown number" or a trusted contact. In production the operator provides it.
- **DaCy Kids app screening needs Android.** On Android a DaCy agent (Accessibility Service and notification access, set up with consent) screens the selected apps while they are open; the design is in `docs/dacy-kids-android-agent.md`. **iPhone does not let any app read other apps**, so on iPhone DaCy relies on Apple Communication Safety, Screen Scan and Call Guard. Expo Go cannot run a background agent, so the demo shows the same engine in a **child-phone simulator**, and its alerts are marked "Demo".
- The **final 0–100 score is always calculated by a deterministic engine on the phone**. The AI only extracts indicators with verbatim evidence; it never invents a score.
- **Voice authenticity (deepfake) is shown as "experimental, model pending"**. No fake detection score is ever displayed.
- No result is presented as "100% safe". "No signal" does not mean safe.

## Architecture

```
iPhone (Expo Go) ──HTTP──► Metro dev server :8081 ──/dacy-api/* proxy──► DaCy server :8787 (Node 24 + Hono)
                                                                          ├─ /v1/analyze/text, /image → OpenAI gpt-4.1-mini
                                                                          │    (or Claude claude-opus-5-5 when ANTHROPIC_API_KEY is set)
                                                                          ├─ /v1/live/chunk → speech-to-text + AI
                                                                          ├─ /v1/url/inspect → link sandbox (SSRF-safe, RDAP age)
                                                                          ├─ /v1/tts → Azerbaijani spoken warnings
                                                                          └─ /v1/family/* → alert relay, leave PIN, DaCy Kids settings

On the phone:
  • deterministic risk engine (EN + AZ rules, 0–100) and the DaCy Kids grooming engine
  • inference router: Cloud AI / On-device* / Deterministic
  • Call Guard: recorder segments (4 s AAC) → uploaded, transcribed, deleted
  • local history (codes and card numbers masked)
  iOS Shortcut: Take Screenshot → Extract Text (on-device) → Open DaCy link
  * An on-device LLM needs a native build (llama.cpp / Core ML); in Expo Go the router falls back honestly.
```

The Metro dev server forwards `/dacy-api/*` to the DaCy server, so the phone needs only one address (it works on LAN and through a tunnel).

## Quick start

Requirements: a Mac with **Node ≥ 22.13** (Expo SDK 58) and the latest **Expo Go** on the iPhone.

```bash
cp server/.env.example server/.env   # add your API key (see below)
./dev.sh --lan                       # server + Expo on the local network
```

Scan the QR code with the iPhone camera to open it in Expo Go. The most reliable network setup is to connect the Mac to the **iPhone's Personal Hotspot**, because many Wi-Fi networks isolate devices from each other. Other modes: `./dev.sh` (ngrok tunnel) and `./dev.sh --web` (browser).

Keys (`server/.env`):

| Variable | Needed for |
|---|---|
| `OPENAI_API_KEY` | Everything cloud-based: AI indicators and screenshot reading (`gpt-4.1-mini`), speech-to-text (`gpt-4o-mini-transcribe`) and Azerbaijani spoken warnings (`gpt-4o-mini-tts`) |
| `ANTHROPIC_API_KEY` (optional) | If set, AI analysis uses Claude (`claude-opus-5-5`) instead of OpenAI |
| `GROQ_API_KEY` (optional) | Alternative speech-to-text provider |

Without keys, messages are still scored by the offline engine and DaCy Kids runs fully on the phone. Live Call Guard and Voice Lab need `OPENAI_API_KEY` (speech-to-text).

## 5-minute demo script (real cases only)

The app has no built-in scam scenarios: every check below uses a real message, a real call or a real recording. The only scripted content is the DaCy Kids child-phone simulator, because no iPhone app can read other apps.

1. **Home**: show protection status and the three inference modes (Settings).
2. **Screen Scan**: open a real suspicious SMS or chat on screen and press the Action Button. DaCy opens with the verdict; the suspicious words, the link and the urgency are highlighted, and the link sandbox shows whether the domain is new or a brand look-alike.
3. **Call Guard, scam**: Call Guard → Unknown number → *Start*. A teammate calls a second phone on speakerphone, placed next to this one, and talks like a "bank security" caller asking for the SMS code. Within seconds the transcript appears, the gauge climbs, DaCy **speaks the warning** and the guardian phone shows a family alert.
4. **Call Guard, trusted**: choose a trusted contact (e.g. "Elvin, son") → *Start*, and the teammate talks normally. After 5 s: *"Trusted contact — DaCy deleted the first 5 seconds and switched off."*
5. **Azerbaijani**: switch speech language to Azərbaycanca and let a teammate say: *"Salam, bankın təhlükəsizlik şöbəsindən zəng edirik. Kartınız bloklanıb, SMS ilə gələn kodu deyin."*
6. **Family**: guardian phone shows the alert feed and the privacy preview (exactly what is shared). On the child's phone, *Leave family group* asks for the guardian's PIN.
7. **DaCy Kids**: Family → Child protection → choose apps → *Save*. Then *Open child phone simulator* on the child's phone → "A gaming friend over 4 weeks" → *Start* (Fast). Watch the agent panel: the risk line climbs through the grooming stages, the first alert fires at the photo request (day 21) and a follow-up alert at the threat (day 28). The guardian phone receives both, with next steps. The two "should not alert" scenarios (classmates, gaming teammate) stay at 0.
8. **No internet?** Settings → Deterministic engine: typed and scanned messages are still scored on the phone, and DaCy Kids works offline. Live calls and voice checks need the server.

## Screen Scan shortcut (iPhone)

In the app: **Check → "Set it up"** shows the steps and the exact link to paste.
Shortcuts app → New Shortcut → *Take Screenshot* → *Extract Text from Image* → *URL Encode* → *Open URLs* (`exp://<your-mac-ip>:8081/--/scan?text=` + encoded text) → name it **DaCy Scan** → add it to **Control Center** (iOS 18+), the **Action Button** (iPhone 15 Pro) or **Back Tap**.

## Privacy & security

- Call audio is cut into ~4 s chunks, uploaded, transcribed and **deleted immediately**; transcripts live only in memory during the call. History stores call **metadata only**.
- Message history stays on the phone; codes, card numbers, IBANs and passwords are masked before saving (this can be switched off entirely).
- Family alerts contain only band, category, source, app and time. The server rejects any free text.
- **DaCy Kids**: chats are analysed on the child's phone, in memory only, and never sent to the server or an AI provider. A protected member sees only the alerts sent from their own phone; siblings never see each other's alerts. Lock-screen notifications for child-safety alerts are neutral (no name, no category).
- Joining with a code always creates a protected member; only the guardian can change DaCy Kids settings, change the leave PIN or remove members. The leave PIN is stored as a scrypt hash and locks for 15 minutes after 5 wrong tries.
- Links are never opened on the phone. The server fetches them without running JavaScript or submitting forms, blocks private and internal addresses (SSRF), and limits redirects and size.
- AI prompt injection: analysed content is treated as data; the model has no tools.

## Project layout

```
mobile/   Expo SDK 58 app (expo-router, TypeScript)
  src/app/                  screens (tabs: Home, Check, Call Guard, History, Family) + kids-demo
  src/services/security/    riskEngine, groomingEngine, lexicon (EN+AZ), urlAnalyzer, redaction
  src/services/ai/modelProvider.ts   inference router
  src/features/callGuard/   real-time listening engine
  src/components/kids/      DaCy Kids UI (child phone, timeline, stage stepper, settings)
server/   Node 24 + Hono backend (OpenAI/Claude, STT, TTS, link sandbox, family relay)
docs/     dacy-kids-android-agent.md (production design of the Android screening agent)
```

Tests: `cd mobile && npm run test:engine` (236) · `cd server && npm test` (74) · `npm run typecheck` in both.

---

## Qısa xülasə (Azərbaycanca)

DaCy yaşlıları və uşaqları telefon və mesaj fırıldaqlarından, uşaqları isə internetdə şirnikləndirmədən (grooming) qoruyan AI tətbiqidir. Dörd funksiyası var:

1. **Ekran skanı:** İdarəetmə Mərkəzindən bir toxunuşla açıq ekran oxunur, linklər serverdəki sandbox-da yoxlanılır.
2. **Zəng qoruması:** zəng real vaxtda dinlənilir. İlk 5 saniyədə zəng edən yaxın adamdırsa, DaCy eşitdiyini silir və söndürülür. Fırıldaq aşkarlansa, xəbərdarlığı səsli deyir və ailəyə bildiriş göndərir.
3. **Ailə qoruması:** valideyn yalnız təhlükə barədə xəbər alır, məzmun heç vaxt paylaşılmır. Uşaq qrupdan yalnız valideynin PIN-i ilə çıxa bilər.
4. **DaCy Kids:** valideyn hansı tətbiqlərin yoxlanacağını seçir. Uşaq telefonu adi qaydada istifadə edir. Yoxlama yalnız seçilmiş tətbiq açıq olanda işləyir. Şübhəli yazışma olanda uşağa yumşaq məsləhət çıxır, valideynə isə qısa bildiriş gedir. Mesajlar telefondan çıxmır.

iPhone zəng səsini və başqa tətbiqləri tətbiqlərə vermədiyi üçün demoda zəng dinləmə mikrofonla aparılır, DaCy Kids isə simulyatorda göstərilir. Real məhsulda zəng səsi operatordan gələcək, tətbiq yoxlaması Android agenti ilə işləyəcək. Yekun risk balını həmişə telefondakı deterministik mühərrik hesablayır, AI yalnız sübuta əsaslanan göstəricilər əlavə edir.
