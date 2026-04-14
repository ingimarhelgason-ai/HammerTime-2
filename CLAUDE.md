# Hammer Time — Project Documentation

## What It Is

A mobile-first field logging app for tradespeople to document job site activity in real time. Workers select an active project and task, capture photos and notes, and the app automatically infers working hours from log timestamps. Projects are created by uploading a PDF arbejdsseddel (work order) from e-conomic — Claude reads it and pre-fills the task list automatically.

The app is written primarily in Danish (UI labels, placeholder text, button labels).

---

## Architecture

Clean multi-file structured app. Not a single HTML file. Each screen/feature has its own file. Shared logic (Firebase, utilities, design tokens) lives in dedicated modules.

```
HammerTime 2/
├── index.html          # App shell / router
├── export.html         # Standalone data export/review page
├── CLAUDE.md
└── src/
    ├── css/
    │   └── theme.css       # Design tokens and all shared styles
    ├── js/
    │   ├── firebase.js     # Firebase init and shared db/storage refs
    │   ├── api.js          # All Firestore read/write functions
    │   ├── activeTask.js   # localStorage: active project + task state
    │   ├── claude.js       # Anthropic API calls (PDF parsing, task suggestions)
    │   ├── location.js     # GPS + reverse geocoding (Nominatim)
    │   ├── hours.js        # Working hours inference logic
    │   └── utils.js        # Formatting helpers, image compression
    └── screens/
        ├── home.js         # Active task feed + project/task selector
        ├── log.js          # Camera + note logging screen
        ├── project-new.js  # PDF upload → AI extraction → confirm screen
        ├── project-view.js # Kanban board + log feed sheet
        ├── projects.js     # Full project list with completed section
        └── settings.js     # API key management
```

`task-view.js` was deleted — task detail lives inline on the kanban board.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (ES modules), no build step |
| Database | Firebase Firestore |
| File storage | Firebase Storage |
| Geocoding | Nominatim (OpenStreetMap) — free, no API key |
| PDF parsing | Anthropic Claude API (claude-sonnet-4-6) — vision on PDF pages |
| AI suggestions | Anthropic Claude API — end-of-day task tagging suggestions |
| Fonts | DM Mono (Google Fonts) |

---

## Firebase Configuration

Project ID: `hammertime-d30bf`

```js
const firebaseConfig = {
  apiKey: "AIzaSyAglgiWxVoXo6O8bLZOWCeJqYkRGjKzr0k",
  authDomain: "hammertime-d30bf.firebaseapp.com",
  projectId: "hammertime-d30bf",
  storageBucket: "hammertime-d30bf.firebasestorage.app",
  messagingSenderId: "607382441157",
  appId: "1:607382441157:web:410e1e5df3e35b39c2b4ac"
};
```

### Firestore Collections

#### `projects`
```js
{
  id: string,                  // Firestore auto-ID
  address: string,             // Job site address, e.g. "Nordbyvej 13, Roskilde"
  description: string | null,  // Free-text description of the job
  status: "active" | "completed",
  createdAt: Timestamp,
  startDate: string | null,    // ISO date "YYYY-MM-DD" — from arbejdsseddel or manual
  endDate: string | null       // ISO date "YYYY-MM-DD" — from arbejdsseddel or manual
}
```

#### `tasks`
```js
{
  id: string,                  // Firestore auto-ID
  projectId: string,           // Foreign key → projects
  name: string,                // Task name, e.g. "Udskift radiator i køkken"
  description: string | null,  // Instructions, goals, materials
  estimatedHours: number | null,
  status: "not started" | "in progress" | "done",
  createdAt: Timestamp
}
```

#### `logs`
```js
{
  id: string,                  // Firestore auto-ID
  projectId: string,           // Foreign key → projects
  taskId: string | null,       // Foreign key → tasks (optional)
  type: "photo" | "note",
  photoUrl: string | null,     // Firebase Storage download URL (type === "photo" only)
  note: string | null,         // Text content or caption
  location: {
    lat: number,
    lng: number,
    accuracy: number,
    address: string | null     // Reverse-geocoded street address
  } | null,
  timestamp: Timestamp         // Firestore server timestamp
}
```

### Firebase Storage

Photos stored at: `photos/{projectId}/{timestamp}_{filename}`

Images are compressed client-side before upload: max 1400px on longest side, JPEG at 0.82 quality.

---

## Domain Vocabulary

| Term | Meaning |
|---|---|
| **Project** | The whole job — one address, one arbejdsseddel. E.g. "Nordbyvej 13" |
| **Task** | An individual line item from the arbejdsseddel. E.g. "Udskift radiator i køkken" |
| **Active task** | The task currently being worked on — stored in localStorage via `activeTask.js` |
| **Log** | Any recorded event on a project — a photo or a note |
| **Arbejdsseddel** | Work order PDF from e-conomic, uploaded to create a project |
| **Instruktioner** | The `description` field on a task — shown as a pinned card on the home screen |

---

## Screen-by-Screen Behaviour

### `home.js` — Active task feed
The home screen centres on the currently active project + task.

- **Top bar**: app title, folder icon → `projects` screen
- **Two tappable selector cards**: one for project, one for task — both open bottom sheet pickers
- **Action row**: Camera button and Note button side-by-side (56px height, compact row)
- **Instruktioner card**: always visible below the buttons when a task is active; shows the task `description` field in read-only. Shows dim placeholder text "Ingen instruktioner endnu" when description is empty
- **Task feed**: the 10 most recent logs for the active task, newest first. Photo thumbnails tap to open a full-screen lightbox. Feed is empty when no task is active
- **Active task reactivation**: if the selected task has `status === 'done'`, selecting it automatically sets it back to `'in progress'`
- **Navigate to project**: "Gå til projekt" button opens `project-view` for the active project

### `project-view.js` — Kanban board
Replaces the old tab system (OPGAVER/FEED was removed).

- **Top bar**: back button, "Projekt" title, clock icon → feed bottom sheet
- **Project header**: address, description, dates. FÆRDIG badge shown for completed projects. No "Marker færdig" button here — that lives in `projects.js`
- **Kanban board**: three full-width columns with horizontal snap-scroll (`scroll-snap-type: x mandatory`). Each column is `calc(100vw - 44px)` wide so the next column peeks
  - **Ikke startet** — neutral header (grey)
  - **I gang** — amber/yellow tinted header (`--accent-dim` background, `--accent` title)
  - **Færdig** — green tinted header (`--green-dim` background, `--green` title)
- **Task cards**: name (max 2 lines, clipped with `line-clamp`), description preview (truncated). Active task gets yellow left border + accent-dim background. Cards in each column get a subtle matching `inset box-shadow` left-border (grey / amber / green)
- **Tap to move**: tapping any card opens a "Flyt opgave til…" bottom sheet with all three columns listed. Current column shows a yellow checkmark. Tapping a different column updates Firestore immediately
- **Edit pencil**: pencil icon on each card opens an edit sheet for task name + beskrivelse. `stopPropagation` prevents the move sheet from opening
- **Add task per column**: each column footer has a "+ Tilføj" button that reveals an inline input. New tasks created in "I gang" or "Færdig" columns get their status set with a follow-up `updateTask` call
- **"Vælg næste opgave?" notice**: shown as a dismissible banner when the active task is moved to Færdig
- **Feed sheet**: clock icon in top-bar opens a tall bottom sheet (88vh) with all project logs, filter pills by task, and log cards

### `projects.js` — Project list
- **Back** → home, **+** → project-new, **Indstillinger** → settings (footer link)
- Active projects listed at the top, with "Aktive" section label when completed projects also exist
- **Long press** (~500ms) on an active project card opens an action sheet with "Marker færdig". Movement >10px during press cancels it. The subsequent click event is suppressed via `_didLongPress` flag
- **Marker færdig**: tapping the action sheet option immediately calls `updateProject({ status: 'completed' })`. No secondary confirm dialog — the long press + sheet tap is sufficient friction
- **Completed projects**: collapsed by default. A "Vis færdige (N)" toggle button with a chevron appears when completed projects exist. When expanded, completed cards show 65% opacity, strikethrough address, and a green FÆRDIG badge
- Tapping any card (active or completed) navigates to `project-view`

### `log.js` — Camera + note logging
Photo and note capture screen. Logs are tagged to the active task if one is set.

### `project-new.js` — Project creation
PDF upload → Claude vision extraction → editable review form → Firestore write.

### `settings.js` — API key management
Stores the Anthropic API key in `localStorage`.

---

## Active Task System (`activeTask.js`)

Tracks which project and task the user is currently working on.

```js
getActive()   // → { projectId, taskId } | null
setActive(projectId, taskId)
clearActive()
```

Stored in `localStorage` as `activeTask`. Both `home.js` and `project-view.js` read this to highlight the active task card.

---

## Key Flows

### Project Creation (PDF → AI → Confirm)
1. User taps "Nyt projekt" and uploads a PDF arbejdsseddel from e-conomic
2. PDF is sent to Claude (vision) which extracts: address, task list (name + hours), start/end dates
3. App shows a review screen with the extracted data pre-filled
4. User can edit any field, add/remove tasks, then confirm
5. One `projects` document and N `tasks` documents are written to Firestore

### Daily Logging Flow
1. User opens app → home screen shows active project + task
2. Takes photo or writes note — saved to `logs` with `projectId`, `taskId`, location, timestamp
3. Task feed on home updates in real-time showing the latest 10 logs for the active task

### Task Management Flow
1. From home, user taps "Gå til projekt" → project-view kanban
2. Kanban shows all tasks in three columns by status
3. Tap a card → move sheet to change column (status)
4. Pencil icon → edit name and beskrivelse
5. Per-column "+ Tilføj" creates tasks with the right status

### Working Hours Inference
- No clock in/out — hours are inferred from log timestamps
- **First log of the day** → assumed start time: **07:00**
- **Last log of the day** → assumed end time: **15:00** (Mon–Thu), **14:30** (Fri)
- Hours per day = end − start (capped, not summed from individual logs)
- Edge case: only one log that day → count as a half day or configurable default

---

## Design System

Dark theme, mobile-first (max-width 480px), safe area insets for iOS notch/home bar.

CSS variables (defined in `src/css/theme.css`):
```css
--bg: #0f0f0f
--surface: #181818
--surface2: #222
--surface3: #2a2a2a
--accent: #f0c040      /* yellow — primary buttons, active task highlight */
--accent-dark: #c8a030
--accent-dim: rgba(240,192,64,0.10)
--accent-rim: rgba(240,192,64,0.30)
--green: #3a9e6a       /* confirmation, done status, completed badge */
--green-dim: rgba(58,158,106,0.12)
--danger: #d04444
--danger-dim: rgba(208,68,68,0.12)
--border: rgba(255,255,255,0.07)
--border2: rgba(255,255,255,0.13)
--text: #f0f0f0
--text2: #888
--text3: #3a3a3a       /* very dim — placeholders, hints */
--mono: 'DM Mono', monospace
--radius: 12px
--radius-sm: 8px
```

Font: system sans-serif for body, DM Mono for metadata/timestamps/addresses/codes.

### Component Patterns

**Bottom sheets** — `.sheet-overlay` / `.sheet`. Opened by adding `.open` class. Dismissed by tapping the backdrop or a close button. `.sheet-tall` modifier sets `max-height: 88vh` for content-heavy sheets (feed).

**Toasts** — `position: fixed`, appear at the bottom, auto-dismiss after 2.5s.

**Confirm dialogs** — custom `.confirm-overlay` / `.confirm-card` appended to the screen element. Returns a Promise. Used where native `confirm()` would show a URL on mobile.

**Kanban card borders** — use `box-shadow: inset 2px 0 0 <color>` instead of `border-left` to avoid layout shifts from varying border widths.

---

## Claude API Usage

The Anthropic API key is entered by the user on first launch and stored in `localStorage`. All Claude calls are made directly from the browser (acceptable for a personal-use tool — no backend proxy).

Use `claude-sonnet-4-6` for all calls.

### PDF Parsing (project creation)
- Send PDF pages as base64 images to Claude vision
- System prompt instructs extraction of: address, task list (name + hours), dates
- Response parsed as JSON

### End-of-Day Task Suggestions
- Collect that day's untagged logs for the active project (notes + photo descriptions)
- Send to Claude with the project's task list
- Claude returns suggested `taskId` for each log
- Displayed as a quick swipe-to-confirm review card at end of session

---

## Sprint History

### Sprint 0 — Initial build
Core app skeleton: Firebase integration, PDF upload and Claude parsing, basic photo/note logging, project creation flow, working hours inference, export.html data review page.

### Sprint 1 — Task workflow cleanup
- Deleted `task-view.js` — task detail is now inline on the project view
- Expandable task rows with inline beskrivelse
- Status pill on each task row (display-only, no tap)
- Instruktioner card pinned to home screen (read-only, always visible when task is active)
- Project cards left-aligned in the projects screen
- Active task reactivation: selecting a done task resets it to in-progress
- Custom confirm dialog replacing native `confirm()` (which shows a URL on mobile)
- Folder icon in home top-bar → projects screen (replaced settings gear)

### Sprint 2 — Kanban board
- Replaced OPGAVER/FEED tab system in project-view with a three-column kanban board
- Full-width columns with horizontal snap-scroll
- Tap-to-move bottom sheet (replaced touch drag-and-drop which was unreliable)
- Feed moved to a clock-icon bottom sheet in the top-bar
- Task names truncated to 2 lines on cards
- Column colour treatment: I gang = amber tint, Færdig = green tint
- Per-column inline task creation
- "Vælg næste opgave?" notice when active task is moved to Færdig
- "Marker færdig" moved from project-view header to projects screen long-press action sheet
- Completed projects section on projects screen (collapsed by default, toggle to expand)
- FÆRDIG badge + strikethrough on completed project cards

### Sprint 3 — Planned: Voice input
Voice notes as a third log type alongside photos and notes. User holds a button, speaks, audio is transcribed (Whisper API or Web Speech API), saved as a `type: "voice"` log entry. Possibly also used for quick task name dictation during project creation.

---

## Known Decisions & Constraints

- **No drag-and-drop**: replaced with tap-to-move sheet. Touch drag-and-drop conflicted with horizontal board scroll and column scroll — the threshold detection was unreliable enough to drop.
- **No backend proxy**: Claude and Firebase calls go directly from the browser. Acceptable for a single-user personal tool.
- **No auth**: single-user app, no login screen.
- **Firestore real-time**: all list screens use `onSnapshot` subscriptions for live updates. Unsubscribe functions stored at module level and called in `destroy()`.
- **Task status has no pill on kanban cards**: status is communicated by which column the card is in, not a redundant label.
- **Marker færdig is destructive enough to require friction**: long-press (500ms) + tap in action sheet = two deliberate interactions. No additional confirm dialog needed.
