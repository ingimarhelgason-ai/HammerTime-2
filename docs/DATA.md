# Data

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

---

## Firestore Collections

### `projects`
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

### `tasks`
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

### `logs`
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

---

## Firebase Storage

Photos stored at: `photos/{projectId}/{timestamp}_{filename}`

Images are compressed client-side before upload: max 1400px on longest side, JPEG at 0.82 quality.

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
