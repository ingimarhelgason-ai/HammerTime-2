# Architecture

## File Structure

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
