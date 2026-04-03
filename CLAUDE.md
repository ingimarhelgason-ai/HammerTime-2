# Hammer Time — Project Documentation

## What It Is

A mobile-first field logging app for tradespeople to document job site activity in real time. Workers select an active project, capture photos and notes, optionally tag them to a task, and the app automatically infers working hours from log timestamps. Projects are created by uploading a PDF arbejdsseddel (work order) from e-conomic — Claude reads it and pre-fills the task list automatically.

The app is written primarily in Danish (UI labels, placeholder text, button labels).

---

## Architecture

Clean multi-file structured app. Not a single HTML file. Each screen/feature has its own file. Shared logic (Firebase, utilities, design tokens) lives in dedicated modules.

```
HammerTime 2/
├── index.html          # App shell / entry point
├── export.html         # Standalone data export/review page
├── CLAUDE.md
└── src/
    ├── css/
    │   └── theme.css       # Design tokens and shared styles
    ├── js/
    │   ├── firebase.js     # Firebase init and shared db/storage refs
    │   ├── api.js          # All Firestore read/write functions
    │   ├── claude.js       # Anthropic API calls (PDF parsing, task suggestion)
    │   ├── location.js     # GPS + reverse geocoding
    │   ├── hours.js        # Working hours inference logic
    │   └── utils.js        # Formatting helpers, image compression
    └── screens/
        ├── home.js         # Project selector / daily overview
        ├── log.js          # Camera + note logging screen
        ├── project-new.js  # PDF upload → AI task extraction → confirm screen
        ├── project-view.js # Project detail: tasks, logs, hours summary
        └── settings.js     # API key management
```

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
  estimatedHours: number | null,
  status: "not started" | "in progress" | "done"
}
```

#### `logs`
```js
{
  id: string,                  // Firestore auto-ID
  projectId: string,           // Foreign key → projects
  taskId: string | null,       // Foreign key → tasks (optional — user may not tag)
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
| **Tidsplan** | The scheduled sequence of tasks with time estimates for a project |
| **Log** | Any recorded event on a project — a photo or a note |
| **Arbejdsseddel** | Work order PDF from e-conomic, uploaded to create a project |

---

## Key Flows

### Project Creation (PDF → AI → Confirm)
1. User taps "Nyt projekt" and uploads a PDF arbejdsseddel from e-conomic
2. PDF is sent to Claude (vision) which extracts:
   - Job site address
   - Task list with names and estimated hours
   - Start/end dates if present
3. App shows a review screen with the extracted data pre-filled
4. User can edit any field, add/remove tasks, then confirm
5. One `projects` document and N `tasks` documents are written to Firestore

### Daily Logging Flow
1. User opens app — sees list of active projects, selects one
2. Takes photo or writes note
3. Optional: taps a task from the project's task list to tag the log
4. Entry is saved to `logs` with `projectId`, optional `taskId`, location, timestamp
5. If untagged, Claude reviews untagged logs at end of day and suggests task matches for quick one-tap confirmation

### Working Hours Inference
- No clock in/out — hours are inferred from log timestamps
- **First log of the day** on a project → assumed start time: **07:00**
- **Last log of the day** on a project → assumed end time: **15:00** (Mon–Thu), **14:30** (Fri)
- Hours per day = end − start (capped, not summed from individual logs)
- Edge case: only one log that day → count as a half day or configurable default
- Weekly and per-project hour totals are calculated from these daily inferences

---

## Design System

Dark theme, mobile-first (max-width 480px), safe area insets for iOS notch/home bar.

CSS variables (defined in `src/css/theme.css`):
```css
--bg: #0f0f0f
--surface: #181818
--surface2: #222
--accent: #f0c040      /* yellow — primary buttons, title */
--accent-dark: #c8a030
--accent-dim: rgba(240,192,64,0.1)
--green: #3a9e6a       /* confirmation tags, completed status */
--danger: #d04444
--border: rgba(255,255,255,0.07)
--border2: rgba(255,255,255,0.13)
--text: #f0f0f0
--text2: #888
--text3: #3a3a3a       /* very dim — placeholders, hints */
```

Font: system sans-serif for body, DM Mono for metadata/timestamps/addresses/codes.

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

## Legacy Files

| File | Status |
|---|---|
| `index.html` (original single-file app) | Legacy — replace with multi-file rebuild |
| `export.html` | Keep — useful standalone data review tool |
