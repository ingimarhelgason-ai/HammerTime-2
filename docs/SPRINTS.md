# Sprints & Decisions

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
