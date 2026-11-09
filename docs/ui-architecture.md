# DaCy UI architecture: "Minimal"

DaCy uses an ultra-minimal, light-only design that follows Apple's Human Interface Guidelines.
Its source of truth is `mobile/src/constants/theme.ts`. Every screen reads these tokens, so changing a token restyles the whole app.

The earlier designs are kept in backups on the Desktop:
- `DaCy-backup-before-dark-redesign-2026-11-09.zip`: the warm light design.
- `DaCy-backup-dark-glass-2026-11-09.zip`: the dark glass design.

## Principles

1. **White and whitespace.** The background is pure white, and the screen gutter is 24 pt with 24 pt between blocks.
2. **Flat.** There are no shadows, glass, gradients or glow. Cards and lists use a 1 px `#E5E5EA` border.
3. **One accent.** Safety Green is used only for:
   - the primary button (the only filled button),
   - the active tab,
   - selected states,
   - text links such as "More".

   Everything else is greyscale.
4. **Red and amber only carry risk information.** They mark a score, a warning or an alert dot, never decoration.
5. **One idea per screen.** Long text is hidden behind an info icon (ⓘ) or "More". Only the essential actions are visible.
6. **Functional motion only.** A pressed control dims to 50 % or scales to 0.98. There are no entrance animations and no looping or decorative motion.

## Colour

| Token | Hex | Use |
|---|---|---|
| `bg`, `surface` | `#FFFFFF` | Background, cards |
| `surfaceSunken`, `fill` | `#F5F5F7` / `#F2F2F7` | Inputs, segmented-control track |
| `border` | `#E5E5EA` | 1 px card / list borders, dividers |
| `borderStrong` | `#D1D1D6` | Tab bar top edge, unselected radio |
| `text` | `#111111` | Primary text and icons |
| `textSecondary` | `#6E6E73` | Secondary text |
| `textMuted` | `#A1A1A6` | Inactive tabs, chevrons, placeholders |
| **`primary` (the accent)** | **`#0A8754`** Safety Green | Primary button, active tab, selection, links. White on it passes WCAG AA (4.6:1) |
| `primarySoft` | `#EAF6F0` | Selected background |
| `critical` | `#D93025` | Critical risk, destructive label, alert dot |
| `high` / `moderate` | `#C2410C` / `#B7791F` | Risk bands only |

## Typography

SF Pro is used on iOS, and Inter or the system UI font on web. The type uses high contrast and few weights.

| Variant | Size / line | Weight | Use |
|---|---|---|---|
| `hero` | 48 / 54 | 600 | Call timer |
| `display` | 34 / 41 | 700 | Screen titles, "DaCy" |
| `title` | 22 / 28 | 700 | Status ("Protected"), risk score |
| `heading` | 17 / 22 | 600 | Section question ("Who is calling?") |
| `body` | 16 / 23 | 400 | List rows, content |
| `small` | 14 / 19 | 400 | Secondary lines |
| `caption` | 13 / 18 | 500 | Field labels (sentence case, no caps) |

## Spacing and shape

- **Spacing:** 4 pt grid (`4 · 8 · 12 · 16 · 24 · 32 · 48`).
  - Screen gutter and block gap: 24 pt.
  - Status block: 32 pt vertical padding.
  - List rows: at least 56 pt tall with 16 pt side padding.
- **Radius:** 8 (small), 12 (inputs and buttons), 14 (cards and lists), pill for small toggles.
- **Elevation:** none (`elevation = {}`).
- **Tab bar:** a flat white bar, 56 pt tall plus the safe area, with a hairline top border. The active tab uses the accent colour and shows no indicator.

## Screens

### Dashboard (`app/(tabs)/index.tsx`)

1. **Header:** the "DaCy" title, plus two outlined circular buttons for the language (EN/AZ) and Settings.
2. **Status:**
   - A single 56 pt status icon, followed by the status word ("Protected", "Offline mode" or "New family alert").
   - An ⓘ next to the status word explains it.
   - Below it are the last-check time and **More**.
   - **More** opens a bordered list: Server, AI analysis, Speech-to-text, Link sandbox and Family link. Each row has an on/off dot.
3. **One primary button:** "Check a message".
4. **One list** of the other essential actions: Call Guard, Family (with a red dot when there is a new alert), Screen Scan and History.

### Call Protection (`features/callGuard/CallGuardPanel.tsx`)

- **Before the call:**
  1. The question "Who is calling?". Its ⓘ explains caller ID and how listening works.
  2. A radio list of callers: Unknown number, trusted contacts, and "+ Add trusted contacts".
  3. **More** hides the speech-language control.
  4. One primary button: "Start Call Guard". If the server is missing, a one-line note says why.
- **During the call:**
  1. A centred status line ("Identifying… 3s" or "Listening"), a large timer and the caller.
  2. A 4 px level bar driven by the microphone. It is green normally and turns red after a warning.
  3. A bordered warning box (only when DaCy has warned).
  4. One line for the risk ("Risk 82 / 100 · Critical").
  5. **Transcript and details** (collapsed) holds the mode, indicators, transcript and timing.
  6. An outlined "End" button with a red label.

## Shared components

| Component | File | Purpose |
|---|---|---|
| `TabBar` | `components/ui/TabBar.tsx` | Flat bottom tab bar |
| `Card` | `components/ui/Card.tsx` | White card with a 1 px border (no shadow, no entrance animation) |
| `Button` | `components/ui/Button.tsx` | Filled green primary; outlined secondary; outlined danger with a red label |
| `InfoTip` | `components/ui/InfoTip.tsx` | ⓘ button that opens a bordered tooltip (replaces long paragraphs) |
| `Screen` | `components/ui/Screen.tsx` | White page, 24 pt gutter, large title |
