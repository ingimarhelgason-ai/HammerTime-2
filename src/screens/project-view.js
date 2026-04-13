import { getProject, subscribeToTasks, subscribeToLogs, updateTask, createTask, updateProject } from '../js/api.js'
import { formatDateShort, taskStatusLabel, formatTimestamp, relativeDate } from '../js/utils.js'
import { getActive } from '../js/activeTask.js'

// ─── STATE ──────────────────────────────────────────────────

let _unsubTasks  = null
let _unsubLogs   = null
let _taskMap     = {}
let _logFilter   = null
let _allLogs     = []
let _tasks       = []
let _taskFilter  = 'in progress'
let _projectId   = null
let _project     = null

// ─── LIFECYCLE ──────────────────────────────────────────────

export async function render(container, params = {}) {
  const { projectId } = params
  if (!projectId) { window.navigate('home'); return }
  _projectId   = projectId
  _taskFilter  = 'in progress'

  container.innerHTML = buildShell()
  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(container, btn.dataset.tab))
  })

  try {
    _project = await getProject(projectId)
  } catch (err) {
    showError(container, err.message)
    return
  }
  if (!_project) { showError(container, 'Projekt ikke fundet.'); return }

  renderHeader(container, _project)

  _unsubTasks = subscribeToTasks(projectId, tasks => {
    _tasks  = tasks
    _taskMap = Object.fromEntries(tasks.map(t => [t.id, t.name || 'Unavngivet']))
    renderTaskTab(container, tasks, projectId)
  })

  _unsubLogs = subscribeToLogs(projectId, logs => {
    _allLogs = logs
    renderFeedTab(container, logs)
  })

  setupAddTask(container, projectId)
}

export function destroy() {
  if (_unsubTasks) { _unsubTasks(); _unsubTasks = null }
  if (_unsubLogs)  { _unsubLogs();  _unsubLogs  = null }
  _taskMap = {}; _logFilter = null; _allLogs = []
  _tasks = []; _taskFilter = 'in progress'; _projectId = null; _project = null
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="project-view-screen">
      <div class="top-bar">
        <button class="btn-icon btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1 style="font-size:17px; color:var(--text);">Projekt</h1>
        </div>
      </div>

      <div id="project-header"></div>

      <div class="pv-tab-bar">
        <button class="tab-btn active" data-tab="tasks">OPGAVER</button>
        <button class="tab-btn" data-tab="feed">FEED</button>
      </div>

      <div class="screen-body pv-body">
        <!-- OPGAVER TAB -->
        <div id="tab-tasks" class="tab-panel">
          <div id="tasks-toolbar"></div>
          <div class="list-content" id="task-list">
            <div class="empty-state"><div class="spinner"></div></div>
          </div>
          <div class="tasks-add-area">
            <button class="btn-add-task" id="btn-add-task">
              ${iconPlus()} Tilføj opgave
            </button>
            <div id="add-task-form" style="display:none;">
              <div class="add-task-inner">
                <input id="new-task-name" class="add-task-input" type="text"
                       placeholder="Opgavenavn" maxlength="200" autocomplete="off">
                <div class="add-task-actions">
                  <button class="btn-cancel-task" id="btn-cancel-task">Annuller</button>
                  <button class="btn-save-task" id="btn-save-task">Gem</button>
                </div>
              </div>
            </div>
          </div>
          <div class="safe-bottom"></div>
        </div>

        <!-- FEED TAB -->
        <div id="tab-feed" class="tab-panel" style="display:none;">
          <div id="log-feed" style="padding:14px; display:flex; flex-direction:column; gap:10px;">
            <div class="empty-state"><div class="spinner"></div></div>
          </div>
          <div class="safe-bottom"></div>
        </div>
      </div>

      <div id="toast-area"></div>
    </div>
  `
}

// ─── TAB SWITCHING ──────────────────────────────────────────

function switchTab(container, tab) {
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  })
  container.querySelector('#tab-tasks').style.display = tab === 'tasks' ? '' : 'none'
  container.querySelector('#tab-feed').style.display  = tab === 'feed'  ? '' : 'none'
}

// ─── HEADER ─────────────────────────────────────────────────

function renderHeader(container, project) {
  const el = container.querySelector('#project-header')
  if (!el) return
  const dateStr = buildDateStr(project)
  const isActive = project.status === 'active'

  el.innerHTML = `
    <div class="project-header">
      <div class="project-header-address">${escapeHtml(project.address || 'Ukendt adresse')}</div>
      ${project.description ? `<div class="project-header-desc">${escapeHtml(project.description)}</div>` : ''}
      ${dateStr ? `<div class="project-header-dates">${dateStr}</div>` : ''}
      ${isActive
        ? `<button class="btn-complete-project" id="btn-complete-project">Marker færdig</button>`
        : `<span class="project-done-badge">FÆRDIG</span>`}
    </div>
  `

  if (isActive) {
    setupCompleteButton(el, container)
  }
}

function setupCompleteButton(headerEl, container) {
  const btn = headerEl.querySelector('#btn-complete-project')
  if (!btn) return

  btn.addEventListener('click', async () => {
    if (!confirm('Er du sikker?')) return

    btn.disabled = true
    btn.textContent = 'Markerer…'

    try {
      await updateProject(_projectId, { status: 'completed' })
      showToast(container, 'Projekt markeret færdigt')
      setTimeout(() => window.navigate('home'), 1200)
    } catch {
      showToast(container, 'Fejl — prøv igen', true)
      btn.disabled = false
      btn.textContent = 'Marker færdig'
    }
  })
}

function buildDateStr(project) {
  const start = project.startDate ? formatDateShort(project.startDate) : null
  const end   = project.endDate   ? formatDateShort(project.endDate)   : null
  if (start && end) return `${start} → ${end}`
  if (start)        return `Fra ${start}`
  if (end)          return `Til ${end}`
  return null
}

// ─── OPGAVER TAB ────────────────────────────────────────────

function renderTaskTab(container, tasks, projectId) {
  renderToolbar(container, tasks)
  renderTaskList(container, tasks, projectId)
}

function renderToolbar(container, tasks) {
  const toolbar = container.querySelector('#tasks-toolbar')
  if (!toolbar) return

  const filters = [
    { value: 'in progress', label: 'I gang' },
    { value: 'not started', label: 'Ikke startet' },
    { value: 'done',        label: 'Færdig' }
  ]

  toolbar.innerHTML = `
    <div class="task-filter-pills">
      ${filters.map(f => `
        <button class="task-filter-pill${_taskFilter === f.value ? ' active' : ''}"
                data-filter="${escapeAttr(f.value)}">
          ${escapeHtml(f.label)}
        </button>
      `).join('')}
    </div>
  `

  toolbar.querySelectorAll('.task-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _taskFilter = pill.dataset.filter
      renderTaskTab(container, _tasks, _projectId)
    })
  })
}

function renderTaskList(container, tasks, projectId) {
  const list = container.querySelector('#task-list')
  if (!list) return

  const active  = getActive()
  const display = tasks.filter(t => t.status === _taskFilter)

  if (display.length === 0) {
    const allEmpty = tasks.length === 0
    const filterLabels = { 'in progress': 'I gang', 'not started': 'Ikke startet', 'done': 'Færdige' }
    list.innerHTML = `
      <div class="empty-state" style="padding:32px;">
        ${allEmpty ? `
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          <div class="empty-title">Ingen opgaver</div>
          <div class="empty-body">Tilføj en opgave for at komme i gang.</div>
        ` : `
          <div class="empty-title">Ingen ${filterLabels[_taskFilter] || ''} opgaver</div>
        `}
      </div>
    `
    return
  }

  list.innerHTML = display.map(t => buildTaskRow(t, active)).join('')

  list.querySelectorAll('.task-row').forEach(row => {
    row.addEventListener('click', () => {
      window.navigate('task-view', { taskId: row.dataset.taskId, projectId })
    })
  })
}

function buildTaskRow(task, active) {
  const isActive = active && active.taskId === task.id
  const isDone   = task.status === 'done'
  const sc       = statusPillClass(task.status)

  return `
    <div class="task-row task-row-link${isActive ? ' task-row-active' : ''}"
         data-task-id="${escapeAttr(task.id)}">
      <div class="task-row-body">
        <div class="task-row-name${isDone ? ' done' : ''}">${escapeHtml(task.name || 'Unavngivet opgave')}</div>
      </div>
      <span class="task-status-pill ${sc}">${taskStatusLabel(task.status)}</span>
      <div class="task-row-chevron">${iconChevron()}</div>
    </div>
  `
}

function statusPillClass(status) {
  return { 'not started': 'not-started', 'in progress': 'in-progress', 'done': 'done' }[status] ?? 'not-started'
}

// ─── ADD TASK ────────────────────────────────────────────────

function setupAddTask(container, projectId) {
  const btn     = container.querySelector('#btn-add-task')
  const form    = container.querySelector('#add-task-form')
  const cancel  = container.querySelector('#btn-cancel-task')
  const save    = container.querySelector('#btn-save-task')
  const input   = container.querySelector('#new-task-name')

  btn.addEventListener('click', () => {
    form.style.display = 'block'
    btn.style.display  = 'none'
    input.value = ''
    input.focus()
  })

  cancel.addEventListener('click', () => {
    form.style.display = 'none'
    btn.style.display  = 'block'
  })

  const doSave = async () => {
    const name = input.value.trim()
    if (!name) { input.focus(); return }
    save.disabled = true; save.textContent = '...'
    try {
      await createTask(projectId, name)
      form.style.display = 'none'
      btn.style.display  = 'block'
      showToast(container, 'Opgave tilføjet')
    } catch {
      showToast(container, 'Fejl ved oprettelse', true)
    } finally {
      save.disabled = false; save.textContent = 'Gem'
    }
  }

  save.addEventListener('click', doSave)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave()
    if (e.key === 'Escape') cancel.click()
  })
}

// ─── FEED TAB ────────────────────────────────────────────────

function renderFeedTab(container, logs) {
  const feed = container.querySelector('#log-feed')
  if (!feed) return

  if (logs.length === 0) {
    feed.innerHTML = `
      <div class="empty-state" style="padding:32px;">
        <div class="empty-title">Ingen logs endnu</div>
        <div class="empty-body">Log et foto eller en note fra en opgave.</div>
      </div>
    `
    return
  }

  const taskIdsInLogs = [...new Set(logs.map(l => l.taskId).filter(Boolean))]
  const showFilter    = taskIdsInLogs.length > 0

  feed.innerHTML = `
    ${showFilter ? `
      <div class="log-filter-row" id="log-filter-row">
        <button class="log-filter-pill${_logFilter === null ? ' active' : ''}" data-filter="">Alle</button>
        ${taskIdsInLogs.map(tid => {
          const name = _taskMap[tid] || 'Ukendt opgave'
          return `<button class="log-filter-pill${_logFilter === tid ? ' active' : ''}" data-filter="${escapeAttr(tid)}">${escapeHtml(name)}</button>`
        }).join('')}
      </div>
    ` : ''}
    <div id="log-cards" style="display:flex;flex-direction:column;gap:10px;"></div>
  `

  if (showFilter) {
    feed.querySelectorAll('.log-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        _logFilter = pill.dataset.filter || null
        feed.querySelectorAll('.log-filter-pill').forEach(p => {
          p.classList.toggle('active', p.dataset.filter === (pill.dataset.filter))
        })
        renderFilteredLogs(feed)
      })
    })
  }

  renderFilteredLogs(feed)
}

function renderFilteredLogs(feed) {
  const cards    = feed.querySelector('#log-cards')
  if (!cards) return
  const filtered = _logFilter ? _allLogs.filter(l => l.taskId === _logFilter) : _allLogs

  if (filtered.length === 0) {
    cards.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-title">Ingen logs for denne opgave</div></div>`
  } else {
    cards.innerHTML = filtered.map(log => buildLogCard(log)).join('')
  }
}

function buildLogCard(log) {
  const taskName = log.taskId ? (_taskMap[log.taskId] || null) : null
  const time     = log.timestamp ? formatTimestamp(log.timestamp) : ''
  const day      = log.timestamp ? relativeDate(log.timestamp)    : ''
  const timeStr  = day && time ? `${day} ${time}` : (time || day || '')

  return `
    <div class="log-card">
      ${log.photoUrl ? `<img class="log-card-photo" src="${escapeAttr(log.photoUrl)}" alt="Log foto" loading="lazy">` : ''}
      ${log.note     ? `<div class="log-card-note">${escapeHtml(log.note)}</div>` : ''}
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
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')))
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;')
}

// ─── ICONS ──────────────────────────────────────────────────

function iconBack() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`
}

function iconPlus() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:-2px;"><path d="M12 5v14M5 12h14"/></svg>`
}

function iconChevron() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>`
}
