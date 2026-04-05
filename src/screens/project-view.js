import { getProject, subscribeToTasks, subscribeToLogs, updateTask } from '../js/api.js'
import { formatDateShort, taskStatusLabel, formatTimestamp, relativeDate } from '../js/utils.js'

// ─── STATE ──────────────────────────────────────────────────

let _unsubTasks = null
let _unsubLogs  = null
let _taskMap    = {}   // taskId → task name, for log feed labels

// ─── LIFECYCLE ──────────────────────────────────────────────

export async function render(container, params = {}) {
  const { projectId, _logSaved } = params
  if (!projectId) { window.navigate('home'); return }

  container.innerHTML = buildShell()
  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))

  let project
  try {
    project = await getProject(projectId)
  } catch (err) {
    showError(container, err.message)
    return
  }

  if (!project) {
    showError(container, 'Projekt ikke fundet.')
    return
  }

  renderHeader(container, project)

  // Real-time tasks
  _unsubTasks = subscribeToTasks(projectId, tasks => {
    _taskMap = Object.fromEntries(tasks.map(t => [t.id, t.name || 'Unavngivet opgave']))
    renderTaskList(container, tasks, projectId)
  })

  // Real-time log feed
  _unsubLogs = subscribeToLogs(projectId, logs => {
    renderLogFeed(container, logs)
  })

  container.querySelector('#btn-log-general').addEventListener('click', () => {
    window.navigate('log', { projectId })
  })

  if (_logSaved) showToast(container, 'Log gemt!')
}

export function destroy() {
  if (_unsubTasks) { _unsubTasks(); _unsubTasks = null }
  if (_unsubLogs)  { _unsubLogs();  _unsubLogs  = null }
  _taskMap = {}
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="project-view-screen">
      <div class="top-bar">
        <button class="btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1 style="color:var(--text); font-size:17px;">Projekt</h1>
        </div>
      </div>

      <div id="project-header"></div>

      <div class="screen-body">

        <div class="section-header">
          <span class="section-title">Opgaver</span>
          <span class="section-count" id="tasks-count"></span>
        </div>
        <div class="list-content" id="task-list">
          <div class="empty-state"><div class="spinner"></div></div>
        </div>

        <div class="section-header" style="margin-top:8px;">
          <span class="section-title">Logs</span>
          <span class="section-count" id="logs-count"></span>
        </div>
        <div id="log-feed" style="padding:0 14px; display:flex; flex-direction:column; gap:10px;">
          <div class="empty-state"><div class="spinner"></div></div>
        </div>

        <div class="safe-bottom"></div>
      </div>

      <div class="fab-area">
        <button class="btn-primary" id="btn-log-general">
          ${iconCamera()}
          Log foto eller note
        </button>
      </div>
      <div id="toast-area"></div>
    </div>
  `
}

// ─── HEADER ─────────────────────────────────────────────────

function renderHeader(container, project) {
  const el = container.querySelector('#project-header')
  if (!el) return
  const dateStr = buildDateStr(project)
  el.innerHTML = `
    <div class="project-header">
      <div class="project-header-address">${escapeHtml(project.address || 'Ukendt adresse')}</div>
      ${project.description
        ? `<div class="project-header-desc">${escapeHtml(project.description)}</div>`
        : ''}
      ${dateStr
        ? `<div class="project-header-dates">${dateStr}</div>`
        : ''}
    </div>
  `
}

function buildDateStr(project) {
  const start = project.startDate ? formatDateShort(project.startDate) : null
  const end   = project.endDate   ? formatDateShort(project.endDate)   : null
  if (start && end) return `${start} → ${end}`
  if (start)        return `Fra ${start}`
  if (end)          return `Til ${end}`
  return null
}

// ─── TASK LIST ──────────────────────────────────────────────

function renderTaskList(container, tasks, projectId) {
  const list    = container.querySelector('#task-list')
  const countEl = container.querySelector('#tasks-count')
  if (!list) return

  if (countEl) countEl.textContent = tasks.length > 0 ? String(tasks.length) : ''

  if (tasks.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:32px;">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <div class="empty-title">Ingen opgaver</div>
        <div class="empty-body">Dette projekt har ingen opgaver endnu.</div>
      </div>
    `
    return
  }

  list.innerHTML = tasks.map(t => buildTaskRow(t)).join('')

  list.querySelectorAll('.task-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId  = btn.closest('.task-row').dataset.taskId
      const current = btn.dataset.status
      const next    = cycleStatus(current)
      btn.dataset.status = next
      btn.className  = `task-status-btn ${statusClass(next)}`
      btn.textContent = taskStatusLabel(next)
      const nameEl = btn.closest('.task-row').querySelector('.task-row-name')
      if (nameEl) nameEl.classList.toggle('done', next === 'done')
      try { await updateTask(taskId, { status: next }) }
      catch (err) { console.error('Kunne ikke opdatere opgavestatus:', err) }
    })
  })

  list.querySelectorAll('.task-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.task-row')
      window.navigate('log', {
        projectId,
        taskId:   row.dataset.taskId,
        taskName: row.dataset.taskName
      })
    })
  })
}

function buildTaskRow(task) {
  const sc    = statusClass(task.status)
  const isDone = task.status === 'done'
  return `
    <div class="task-row" data-task-id="${escapeAttr(task.id)}" data-task-name="${escapeAttr(task.name || '')}">
      <div class="task-row-name${isDone ? ' done' : ''}">${escapeHtml(task.name || 'Unavngivet opgave')}</div>
      ${task.estimatedHours != null
        ? `<div class="task-row-hours">${task.estimatedHours}t</div>`
        : ''}
      <button class="task-status-btn ${sc}" data-status="${escapeAttr(task.status)}" title="Skift status">
        ${taskStatusLabel(task.status)}
      </button>
      <button class="task-log-btn" aria-label="Log mod denne opgave" title="Log">
        ${iconCamera()}
      </button>
    </div>
  `
}

function cycleStatus(current) {
  return { 'not started': 'in progress', 'in progress': 'done', 'done': 'not started' }[current] ?? 'not started'
}

function statusClass(status) {
  return { 'not started': 'not-started', 'in progress': 'in-progress', 'done': 'done' }[status] ?? 'not-started'
}

// ─── LOG FEED ────────────────────────────────────────────────

function renderLogFeed(container, logs) {
  const feed    = container.querySelector('#log-feed')
  const countEl = container.querySelector('#logs-count')
  if (!feed) return

  if (countEl) countEl.textContent = logs.length > 0 ? String(logs.length) : ''

  if (logs.length === 0) {
    feed.innerHTML = `
      <div class="empty-state" style="padding:32px;">
        <div class="empty-title">Ingen logs endnu</div>
        <div class="empty-body">Tap kameraknappen på en opgave for at logge.</div>
      </div>
    `
    return
  }

  feed.innerHTML = logs.map(log => buildLogCard(log)).join('')
}

function buildLogCard(log) {
  const taskName = log.taskId ? (_taskMap[log.taskId] || null) : null
  const time     = log.timestamp ? formatTimestamp(log.timestamp) : ''
  const day      = log.timestamp ? relativeDate(log.timestamp)    : ''
  const timeStr  = day && time ? `${day} ${time}` : (time || day || '')

  return `
    <div class="log-card">
      ${log.photoUrl
        ? `<img class="log-card-photo" src="${escapeAttr(log.photoUrl)}" alt="Log foto" loading="lazy">`
        : ''}
      ${log.note
        ? `<div class="log-card-note">${escapeHtml(log.note)}</div>`
        : ''}
      <div class="log-card-meta">
        ${taskName
          ? `<span class="log-card-task">${escapeHtml(taskName)}</span>`
          : `<span class="log-card-task untagged">Ingen opgave</span>`}
        <span class="log-card-time">${escapeHtml(timeStr)}</span>
      </div>
    </div>
  `
}

// ─── HELPERS ────────────────────────────────────────────────

function showToast(container, message, isError = false) {
  const area = container.querySelector('#toast-area')
  if (!area) return
  const toast = document.createElement('div')
  toast.className = `toast${isError ? ' error' : ''}`
  toast.textContent = message
  area.innerHTML = ''
  area.appendChild(toast)
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show') }) })
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300) }, 2500)
}

function showError(container, message) {
  const body = container.querySelector('.screen-body') || container
  body.innerHTML = `
    <div class="empty-state">
      <div class="empty-title" style="color:var(--danger);">Fejl</div>
      <div class="empty-body">${escapeHtml(message)}</div>
    </div>
  `
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;')
}

// ─── ICONS ──────────────────────────────────────────────────

function iconBack() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`
}

function iconCamera() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}
