# Hammer Time

A mobile-first field logging app for tradespeople to document job site activity in real time. Workers select an active project and task, capture photos and notes, and the app automatically infers working hours from log timestamps. Projects are created by uploading a PDF arbejdsseddel (work order) from e-conomic — Claude reads it and pre-fills the task list automatically. The UI is written in Danish.

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

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — File structure, screen-by-screen behaviour, navigation wiring, key flows
- [docs/DATA.md](docs/DATA.md) — Firestore schemas, Firebase config, Storage paths, activeTask.js API, Claude API usage
- [docs/DESIGN.md](docs/DESIGN.md) — CSS variables, component patterns (sheets, toasts, dialogs, kanban borders), fonts
- [docs/SPRINTS.md](docs/SPRINTS.md) — Sprint history, known decisions & constraints, domain vocabulary

---

> Always read the relevant docs/ file before working on a feature.
