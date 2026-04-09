import { subscribeToProjects, subscribeToRecentLogs, getTask, getTasks, updateTask } from '../js/api.js'
import { formatDayFull, formatTimestamp, relativeDate } from '../js/utils.js'
import { getApiKey } from '../js/claude.js'
import { getActive, setActive, clearActive } from '../js/activeTask.js'

let _unsubProjects = null
let _unsubLogs     = null
let _projects      = []   // full list for task picker + project name lookup
let _projectMap    = {}   // projectId → address
let _taskCache     = {}   // taskId → name (populated lazily from log feed)

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container) {
  container.innerHTML = buildShell()

  container.querySelector('#btn-settings').addEventListener('click', () => {
    window.navigate('settings')
  })
  container.querySelector('#btn-new-project').addEventListener('click', () => {
    window.navigate('project-new')
  })

  const banner = container.querySelector('#api-key-banner')
  if (banner) banner.addEventListener('click', () => window.navigate('settings'))

  renderHero(container)

  // Projects subscription — used for task picker + project name map
  _unsubProjects = subscribeToProjects(projects => {
    _projects   = projects
    _projectMap = Object.fromEntries(projects.map(p => [p.id, p.address || 'Ukendt adresse']))

    // Invalidate active state if project was removed/completed
    const active = getActive()
    if (active) {
      const proj = projects.find(p => p.id === active.projectId && p.status === 'active')
      if (!proj) { clearActive(); renderHero(container) }
    }
  })

  // Recent logs feed subscription
  _unsubLogs = subscribeToRecentLogs(20, async logs => {
    // Fetch task names for any taskIds not yet in cache
    const unknownIds = [...new Set(logs.map(l => l.taskId).filter(Boolean))]
      .filter(id => !_taskCache[id])

    if (unknownIds.length > 0) {
      await Promise.all(unknownIds.map(async id => {
        try {
          const t = await getTask(id)
          if (t) _taskCache[id] = t.name || 'Unavngivet opgave'
        } catch { /* ignore */ }
      }))
    }

    renderFeed(container, logs)
  })
}

export function destroy() {
  if (_unsubProjects) { _unsubProjects(); _unsubProjects = null }
  if (_unsubLogs)     { _unsubLogs();     _unsubLogs     = null }
  _projects   = []
  _projectMap = {}
  _taskCache  = {}
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="home-screen">
      <div class="top-bar">
        <div class="top-bar-title">
          <h1>Hammer Time</h1>
          <div class="subtitle">${formatDayFull()}</div>
        </div>
        <div class="top-bar-actions">
          <button class="btn-icon" id="btn-new-project" aria-label="Nyt projekt" title="Nyt projekt">
            ${iconPlus()}
          </button>
          <button class="btn-icon" id="btn-settings" aria-label="Indstillinger">
            ${iconSettings()}
          </button>
        </div>
      </div>

      ${!getApiKey() ? `
        <div id="api-key-banner" style="
          margin: 10px 14px 0;
          padding: 11px 14px;
          background: var(--accent-dim);
          border: 0.5px solid var(--accent-rim);
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          cursor: pointer;
        ">
          <span>Tilføj Anthropic API-nøgle for AI-funktioner</span>
          <span style="font-size:11px;opacity:0.7;">→</span>
        </div>
      ` : ''}

      <!-- Hero: fixed above the scroll -->
      <div id="hero-area"></div>

      <!-- Feed: main scrollable content -->
      <div class="screen-body">
        <div class="section-header" style="padding-top:18px;">
          <span class="section-title">Seneste logs</span>
          <span class="section-count" id="feed-count"></span>
        </div>
        <div id="feed-list" style="padding: 0 14px; display:flex; flex-direction:column; gap:10px;">
          <div class="empty-state"><div class="spinner"></div></div>
        </div>
        <div class="safe-bottom"></div>
      </div>

      <!-- Picker bottom sheet (project or task) -->
      <div class="sheet-overlay" id="sheet-overlay">
        <div class="sheet" id="task-picker-sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title" id="sheet-title">Vælg projekt</span>
            <button class="btn-icon sheet-close" id="btn-sheet-close" aria-label="Luk">
              ${iconClose()}
            </button>
          </div>
          <div class="sheet-body" id="sheet-body"></div>
        </div>
      </div>
    </div>
  `
}

// ─── HERO ───────────────────────────────────────────────────

function renderHero(container) {
  const area   = container.querySelector('#hero-area')
  if (!area) return
  const active = getActive()

  if (!active) {
    area.innerHTML = `
      <div class="home-hero home-hero-empty">
        <button class="hero-selector-btn" id="btn-pick-project">
          <div class="hero-selector-content">
            <div class="hero-selector-label">Projekt</div>
            <div class="hero-selector-value" style="color:var(--text2);">Vælg projekt…</div>
          </div>
          <div class="hero-selector-chevron">${iconChevronRight()}</div>
        </button>
        <button class="hero-selector-btn" id="btn-pick-task" disabled style="opacity:0.4;">
          <div class="hero-selector-content">
            <div class="hero-selector-label">Opgave</div>
            <div class="hero-selector-value" style="color:var(--text2);">Vælg opgave…</div>
          </div>
          <div class="hero-selector-chevron">${iconChevronRight()}</div>
        </button>
      </div>
    `
    area.querySelector('#btn-pick-project').addEventListener('click', () => openProjectPicker(container))
    return
  }

  area.innerHTML = `
    <div class="home-hero">
      <button class="hero-selector-btn" id="btn-pick-project">
        <div class="hero-selector-content">
          <div class="hero-selector-label">Projekt</div>
          <div class="hero-selector-value">${escapeHtml(active.projectAddr || 'Ukendt projekt')}</div>
        </div>
        <div class="hero-selector-chevron">${iconChevronRight()}</div>
      </button>
      <button class="hero-selector-btn" id="btn-pick-task">
        <div class="hero-selector-content">
          <div class="hero-selector-label">Opgave</div>
          <div class="hero-selector-value">${escapeHtml(active.taskName || 'Unavngivet opgave')}</div>
        </div>
        <div class="hero-selector-chevron">${iconChevronRight()}</div>
      </button>
      <div class="home-hero-actions">
        <button class="btn-hero-camera" id="btn-hero-log">
          <div class="hero-camera-circle">${iconCameraLg()}</div>
          <span>Log foto</span>
        </button>
        <button class="btn-ghost btn-hero-note" id="btn-hero-note">
          ${iconNote()}
          Bare en note
        </button>
      </div>
    </div>
  `

  area.querySelector('#btn-pick-project').addEventListener('click', () => openProjectPicker(container))
  area.querySelector('#btn-pick-task').addEventListener('click', () => openTaskPickerForProject(container, active.projectId))

  area.querySelector('#btn-hero-log').addEventListener('click', () => {
    window.navigate('log', {
      projectId:  active.projectId,
      taskId:     active.taskId,
      taskName:   active.taskName,
      returnTo:   'home',
      autoCamera: true
    })
  })

  area.querySelector('#btn-hero-note').addEventListener('click', () => {
    window.navigate('log', {
      projectId: active.projectId,
      taskId:    active.taskId,
      taskName:  active.taskName,
      returnTo:  'home',
      noteOnly:  true
    })
  })
}

// ─── RECENT FEED ────────────────────────────────────────────

function renderFeed(container, logs) {
  const list    = container.querySelector('#feed-list')
  const countEl = container.querySelector('#feed-count')
  if (!list) return

  if (countEl) countEl.textContent = logs.length > 0 ? String(logs.length) : ''

  if (logs.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-title">Ingen logs endnu</div>
        <div class="empty-body">Tag et foto eller skriv en note for at komme i gang.</div>
      </div>
    `
    return
  }

  list.innerHTML = logs.map(log => buildFeedCard(log)).join('')

  // Clicking a feed card navigates to the project
  list.querySelectorAll('.feed-card[data-project-id]').forEach(card => {
    card.addEventListener('click', () => {
      window.navigate('project-view', { projectId: card.dataset.projectId })
    })
  })
}

function buildFeedCard(log) {
  const projectAddr = _projectMap[log.projectId] || ''
  const taskName    = log.taskId ? (_taskCache[log.taskId] || null) : null
  const time        = log.timestamp ? formatTimestamp(log.timestamp) : ''
  const day         = log.timestamp ? relativeDate(log.timestamp)    : ''
  const timeStr     = day && time ? `${day} · ${time}` : (time || day || '')

  return `
    <div class="feed-card" data-project-id="${escapeAttr(log.projectId)}">
      ${log.photoUrl
        ? `<img class="feed-card-photo" src="${escapeAttr(log.photoUrl)}" alt="Foto" loading="lazy">`
        : ''}
      ${log.note
        ? `<div class="feed-card-note">${escapeHtml(log.note)}</div>`
        : ''}
      <div class="feed-card-meta">
        <div class="feed-card-meta-left">
          ${taskName
            ? `<span class="feed-card-task">${escapeHtml(taskName)}</span>`
            : ''}
          ${projectAddr
            ? `<span class="feed-card-project">${escapeHtml(projectAddr)}</span>`
            : ''}
        </div>
        <span class="feed-card-time">${escapeHtml(timeStr)}</span>
      </div>
    </div>
  `
}

// ─── PICKER SHEET ───────────────────────────────────────────

function openSheet(container, title) {
  const overlay = container.querySelector('#sheet-overlay')
  const body    = container.querySelector('#sheet-body')
  const titleEl = container.querySelector('#sheet-title')
  if (!overlay) return null

  if (titleEl) titleEl.textContent = title
  overlay.classList.add('open')
  body.innerHTML = '<div class="empty-state" style="padding:40px 0;"><div class="spinner"></div></div>'

  overlay.onclick = e => { if (e.target === overlay) closeSheet(container) }
  container.querySelector('#btn-sheet-close').onclick = () => closeSheet(container)

  return body
}

// Opens full project list — tap a project to expand its tasks and pick one
function openProjectPicker(container) {
  const body = openSheet(container, 'Vælg projekt')
  if (!body) return

  const activeProjects = _projects.filter(p => p.status === 'active')

  if (activeProjects.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-title">Ingen aktive projekter</div>
        <div class="empty-body">Opret et projekt for at komme i gang.</div>
      </div>
    `
    return
  }

  renderPickerProjects(container, body, activeProjects, null)
}

// Opens the sheet pre-expanded to a specific project's tasks
async function openTaskPickerForProject(container, projectId) {
  const body = openSheet(container, 'Vælg opgave')
  if (!body) return

  const activeProjects = _projects.filter(p => p.status === 'active')

  if (activeProjects.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-title">Ingen aktive projekter</div>
      </div>
    `
    return
  }

  renderPickerProjects(container, body, activeProjects, projectId)
}

function closeSheet(container) {
  container.querySelector('#sheet-overlay')?.classList.remove('open')
}

function renderPickerProjects(container, body, projects, preExpandId) {
  body.innerHTML = projects.map(p => `
    <div class="picker-project" data-id="${escapeAttr(p.id)}">
      <div class="picker-project-header">
        <span class="picker-project-addr">${escapeHtml(p.address || 'Ukendt adresse')}</span>
        <span class="picker-chevron">${iconChevron()}</span>
      </div>
      <div class="picker-tasks" id="picker-tasks-${escapeAttr(p.id)}"></div>
    </div>
  `).join('')

  const expandProject = async (el) => {
    const projectId = el.dataset.id
    const tasksEl   = body.querySelector(`#picker-tasks-${CSS.escape(projectId)}`)

    body.querySelectorAll('.picker-project').forEach(p => {
      p.classList.remove('expanded')
      body.querySelector(`#picker-tasks-${CSS.escape(p.dataset.id)}`).innerHTML = ''
    })

    el.classList.add('expanded')
    tasksEl.innerHTML = `<div style="padding:8px 16px;"><div class="spinner" style="width:18px;height:18px;border-width:2px;"></div></div>`
    try {
      const tasks   = await getTasks(projectId)
      const project = _projects.find(p => p.id === projectId)
      renderPickerTasks(container, tasksEl, tasks, project)
    } catch {
      tasksEl.innerHTML = `<div style="padding:10px 16px;font-size:13px;color:var(--danger);">Kunne ikke hente opgaver</div>`
    }
  }

  body.querySelectorAll('.picker-project').forEach(el => {
    el.querySelector('.picker-project-header').addEventListener('click', async () => {
      if (el.classList.contains('expanded')) {
        // Collapse
        el.classList.remove('expanded')
        body.querySelector(`#picker-tasks-${CSS.escape(el.dataset.id)}`).innerHTML = ''
      } else {
        await expandProject(el)
      }
    })
  })

  // Auto-expand a specific project if requested
  if (preExpandId) {
    const target = body.querySelector(`.picker-project[data-id="${CSS.escape(preExpandId)}"]`)
    if (target) expandProject(target)
  }
}

function renderPickerTasks(container, el, tasks, project) {
  const currentActive = getActive()

  if (tasks.length === 0) {
    el.innerHTML = `<div class="picker-empty-tasks">Ingen opgaver på dette projekt</div>`
    return
  }

  const notDone = tasks.filter(t => t.status !== 'done')
  const done    = tasks.filter(t => t.status === 'done')

  const taskRow = t => {
    const isActive = currentActive && currentActive.taskId === t.id
    const isDone   = t.status === 'done'
    return `
      <div class="picker-task${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}"
           data-task-id="${escapeAttr(t.id)}"
           data-task-name="${escapeAttr(t.name || '')}"
           data-task-status="${escapeAttr(t.status)}"
           data-project-id="${escapeAttr(project.id)}"
           data-project-addr="${escapeAttr(project.address || '')}">
        <span class="picker-task-name">${escapeHtml(t.name || 'Unavngivet')}</span>
        ${isActive ? `<span class="picker-task-badge active-badge-sm">Aktiv</span>` : ''}
        ${!isActive && isDone ? `<span class="picker-task-badge done-badge-sm">Færdig</span>` : ''}
      </div>
    `
  }

  el.innerHTML =
    notDone.map(taskRow).join('') +
    (done.length > 0 ? `<div class="picker-section-label">Færdige</div>` + done.map(taskRow).join('') : '')

  el.querySelectorAll('.picker-task').forEach(taskEl => {
    taskEl.addEventListener('click', () => {
      selectTask(container, {
        projectId:   taskEl.dataset.projectId,
        projectAddr: taskEl.dataset.projectAddr,
        taskId:      taskEl.dataset.taskId,
        taskName:    taskEl.dataset.taskName,
        taskStatus:  taskEl.dataset.taskStatus
      }, tasks)
    })
  })
}

async function selectTask(container, { projectId, projectAddr, taskId, taskName, taskStatus }, allTasks) {
  const prev = getActive()

  if (prev && prev.taskId && prev.taskId !== taskId && prev.taskStatus !== 'done') {
    try { await updateTask(prev.taskId, { status: 'in progress' }) } catch { /* ignore */ }
  }

  if (taskStatus === 'not started') {
    try { await updateTask(taskId, { status: 'in progress' }) } catch { /* ignore */ }
    taskStatus = 'in progress'
  }

  setActive({ projectId, taskId, taskName, projectAddr, taskStatus })
  closeSheet(container)
  renderHero(container)
}

// ─── HELPERS ────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;')
}

// ─── ICONS ──────────────────────────────────────────────────

function iconPlus() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`
}

function iconSettings() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>`
}

function iconCameraLg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}

function iconNote() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`
}

function iconSwap() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15">
    <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
  </svg>`
}

function iconChevron() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconChevronRight() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}
