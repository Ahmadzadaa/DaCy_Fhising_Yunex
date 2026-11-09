# DaCy Kids — production design of the on-device screening agent

> Hackathon status: the screening logic (`mobile/src/services/security/groomingEngine.ts`) and the
> parent-alert relay are implemented and demoed with the **Child phone simulator** in Expo Go.
> The native Android agent below is the production path; it requires a development build.

## Principle

The child uses the phone normally. The agent screens **only the apps the guardian selected, and only
while one of them is in the foreground**. Nothing is shown to the child unless risk is detected (an
optional gentle tip), and only a **minimal alert** (risk band, category, app, time) reaches the parent.
Message text never leaves the phone.

## Platform reality

| | Android (child phone) | iPhone |
|---|---|---|
| Know which app is open | Yes — `AccessibilityService` window-state events (package name) | Yes — Screen Time `DeviceActivity` (usage events only) |
| Read the chat text in that app | Yes — on-screen text via `AccessibilityNodeInfo`, incoming messages via `NotificationListenerService` | **No** — Apple forbids reading other apps |
| Background, no user action | Yes (foreground service with persistent, honest notification) | No |
| What DaCy offers instead | — | Apple **Communication Safety** (on-device nudity blur, Family Sharing), DaCy **Screen Scan** shortcut, DaCy **Call Guard** |

## Android architecture

```
Selected apps (from guardian, synced via family relay: GET /v1/family/:id/alerts → childSettings)
        │
AccessibilityService (DaCyKidsAccessibility)
  ├─ onAccessibilityEvent(TYPE_WINDOW_STATE_CHANGED) → foreground package
  │     ├─ package ∈ selected → state = SCREENING
  │     └─ otherwise          → state = PAUSED (no text is read)
  └─ while SCREENING: TYPE_WINDOW_CONTENT_CHANGED → collect visible message nodes
        (debounced 1–2 s, deduplicated by text hash, own messages vs contact by bubble side/view id)
NotificationListenerService
  └─ onNotificationPosted(pkg ∈ selected) → MessagingStyle messages (sender, text, time)
        │
On-device conversation store (encrypted, per conversation id, rolling 30 days, text kept in memory /
encrypted local DB only for the context window; never uploaded)
        │
groomingEngine.assessConversation()  ← same TypeScript engine (Hermes) or a Kotlin port
        │  optional on-device LLM (small quantised model) for paraphrases, evidence-verified
        ▼
shouldAlert? ──yes──► POST /v1/family/:id/alerts {band, category, source:"app", app}  (metadata only)
        │                └─► guardian phone: banner + local notification
        └─► optional gentle tip to the child (system notification, non-blocking)
```

### Permissions & store policy
- `BIND_ACCESSIBILITY_SERVICE` with `isAccessibilityTool=false` → Google Play **"Accessibility API" declaration** for a parental-control use case, plus the **Monitoring Tools / IsMonitoringTool** declaration.
- `BIND_NOTIFICATION_LISTENER_SERVICE` with prominent disclosure.
- Persistent foreground notification "DaCy Kids is protecting this phone" — **no hidden monitoring, no icon hiding** (stalkerware is prohibited and harmful).
- Guardian consent + child-visible onboarding screen explaining what is screened and what is shared.

### Privacy guarantees
- Only selected apps, only while open; everything else is never read.
- Raw text never sent to the server or the parent; the alert schema rejects free text (server validates).
- Context window capped (30 days) and wiped on unlink (unlink requires the guardian's leave PIN).
- Parent sees band/category/app/time and guidance — not the conversation.

### What the parent is told to do (in-app guidance)
Talk calmly, do not blame the child, keep evidence (do not delete), report the account to the platform,
contact the police for meeting requests or threats, never pay in sextortion cases.
