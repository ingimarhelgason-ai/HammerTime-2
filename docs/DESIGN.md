# Design System

Dark theme, mobile-first (max-width 480px), safe area insets for iOS notch/home bar.

---

## CSS Variables

Defined in `src/css/theme.css`:

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

---

## Component Patterns

**Bottom sheets** — `.sheet-overlay` / `.sheet`. Opened by adding `.open` class. Dismissed by tapping the backdrop or a close button. `.sheet-tall` modifier sets `max-height: 88vh` for content-heavy sheets (feed).

**Toasts** — `position: fixed`, appear at the bottom, auto-dismiss after 2.5s.

**Confirm dialogs** — custom `.confirm-overlay` / `.confirm-card` appended to the screen element. Returns a Promise. Used where native `confirm()` would show a URL on mobile.

**Kanban card borders** — use `box-shadow: inset 2px 0 0 <color>` instead of `border-left` to avoid layout shifts from varying border widths.
