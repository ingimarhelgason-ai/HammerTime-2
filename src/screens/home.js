import { subscribeToProjects, getTasks, getTask, createTask, updateTask, subscribeToTaskLogs } from '../js/api.js'
import { formatDayFull, formatTimestamp, relativeDate } from '../js/utils.js'
import { getApiKey } from '../js/claude.js'
import { getActive, setActive, clearActive } from '../js/activeTask.js'

let _unsubProjects       = null
let _unsubTaskLogs       = null
let _activeTaskIdForFeed = null
let _activeTaskDesc      = null
let _projects            = []

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container) {
  container.innerHTML = buildShell()

  container.querySelector('#btn-projects').addEventListener('click', () => window.navigate('projects'))

  const banner = container.querySelector('#api-key-banner')
  if (banner) banner.addEventListener('click', () => window.navigate('settings'))

  // Feed click delegation — survives innerHTML refreshes on #home-task-feed
  container.querySelector('#home-task-feed').addEventListener('click', e => {
    const thumb = e.target.closest('img.home-feed-thumb')
    if (thumb?.src) { openLightbox(container, thumb.src); return }

    if (e.target.closest('.home-desc-card')) openDescViewSheet(container)
  })

  container.querySelector('#btn-hero-log').addEventListener('click', () => {
    const active = getActive()
    window.navigate('log', {
      projectId:  active?.projectId || null,
      taskId:     active?.taskId    || null,
      taskName:   active?.taskName  || null,
      returnTo:   'home',
      autoCamera: true
    })
  })

  container.querySelector('#btn-hero-note').addEventListener('click', () => {
    const active = getActive()
    window.navigate('log', {
      projectId: active?.projectId || null,
      taskId:    active?.taskId    || null,
      taskName:  active?.taskName  || null,
      returnTo:  'home',
      noteOnly:  true
    })
  })

  _unsubProjects = subscribeToProjects(projects => {
    _projects = projects

    const active = getActive()
    if (active) {
      const proj = projects.find(p => p.id === active.projectId && p.status === 'active')
      if (!proj) clearActive()
    }

    renderStatusCard(container)
  })
}

export function destroy() {
  if (_unsubProjects) { _unsubProjects(); _unsubProjects = null }
  if (_unsubTaskLogs) { _unsubTaskLogs(); _unsubTaskLogs = null }
  _activeTaskIdForFeed = null
  _activeTaskDesc = null
  _projects = []
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
          <button class="btn-icon" id="btn-projects" aria-label="Projekter">
            ${iconFolder()}
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

      <div class="screen-body home-body">
        <div id="status-area"></div>

        <div class="home-actions">
          <button class="btn-hero-camera" id="btn-hero-log">
            ${iconCamera()}
            Log foto
          </button>
          <button class="btn-ghost btn-hero-note" id="btn-hero-note">
            ${iconNote()}
            Bare en note
          </button>
        </div>

        <div id="home-task-feed"></div>

        <div class="safe-bottom"></div>
      </div>

      <div class="sheet-overlay" id="sheet-overlay">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title" id="sheet-title"></span>
            <button class="btn-icon sheet-close" id="btn-sheet-close">${iconClose()}</button>
          </div>
          <div class="sheet-body" id="sheet-body"></div>
        </div>
      </div>
    </div>
  `
}

// ─── STATUS CARD ────────────────────────────────────────────

function renderStatusCard(container) {
  const area   = container.querySelector('#status-area')
  if (!area) return
  const active = getActive()

  if (!active) {
    area.innerHTML = `
      <div class="status-card status-card-empty">
        <div class="status-empty-label">Ingen aktiv opgave</div>
        <div class="status-empty-hint">Vælg et projekt og en opgave for at komme i gang</div>
        <button class="btn-primary status-empty-btn" id="btn-select-project">Vælg projekt</button>
      </div>
    `
    area.querySelector('#btn-select-project').addEventListener('click', () => openProjectPicker(container))
    refreshTaskFeed(container, null)
    return
  }

  const hasTask = !!active.taskId

  area.innerHTML = `
    <div class="status-card">
      <div class="status-card-header">
        <span class="status-dot${hasTask ? '' : ' status-dot-idle'}"></span>
        <span class="status-aktiv${hasTask ? '' : ' status-aktiv-idle'}">${hasTask ? 'AKTIV' : 'KLAR'}</span>
      </div>
      <div class="status-card-rows">
        <button class="status-row" id="btn-pick-project">
          <div class="status-row-inner">
            <div class="status-row-label">PROJEKT</div>
            <div class="status-row-value">${escapeHtml(active.projectAddr || 'Ukendt projekt')}</div>
          </div>
          <div class="status-row-chevron">${iconChevronRight()}</div>
        </button>
        ${hasTask ? `
        <div class="status-task-wrapper">
          <button class="status-row status-row-task" id="btn-pick-task">
            <div class="status-row-inner">
              <div class="status-row-label">OPGAVE</div>
              <div class="status-row-value">${escapeHtml(active.taskName || 'Unavngivet')}</div>
            </div>
            <div class="status-row-chevron">${iconChevronRight()}</div>
          </button>
          <button class="status-task-goto-btn" id="btn-goto-task" aria-label="Gå til opgave">
            ${iconArrowRight()}
          </button>
        </div>
        ` : `
        <button class="status-row" id="btn-pick-task">
          <div class="status-row-inner">
            <div class="status-row-label">OPGAVE</div>
            <div class="status-row-value status-row-placeholder">Vælg opgave\u2026</div>
          </div>
          <div class="status-row-chevron">${iconChevronRight()}</div>
        </button>
        `}
      </div>
    </div>
  `

  area.querySelector('#btn-pick-project').addEventListener('click', () => openProjectPicker(container))
  area.querySelector('#btn-pick-task').addEventListener('click', () => openTaskPicker(container, active.projectId))

  if (hasTask) {
    area.querySelector('#btn-goto-task').addEventListener('click', () => {
      window.navigate('project-view', { projectId: active.projectId })
    })
  }

  refreshTaskFeed(container, active)
}

// ─── TASK LOG FEED ──────────────────────────────────────────

async function refreshTaskFeed(container, active) {
  const taskId = active?.taskId || null
  const feedEl = container.querySelector('#home-task-feed')
  if (!feedEl) return

  if (taskId === _activeTaskIdForFeed) return

  if (_unsubTaskLogs) { _unsubTaskLogs(); _unsubTaskLogs = null }
  _activeTaskIdForFeed = taskId
  _activeTaskDesc = null

  if (!taskId) {
    feedEl.innerHTML = ''
    return
  }

  // Fetch task description before subscribing so first render includes it
  try {
    const task = await getTask(taskId)
    _activeTaskDesc = task?.description || null
  } catch { /* ignore */ }

  // Guard: user may have switched away during the async fetch
  if (taskId !== _activeTaskIdForFeed) return

  _unsubTaskLogs = subscribeToTaskLogs(taskId, logs => {
    renderHomeFeed(feedEl, logs.slice(0, 10))
  })
}

function renderHomeFeed(feedEl, logs) {
  const hasLogs = logs && logs.length > 0

  feedEl.innerHTML = `
    <div class="home-task-feed-wrap">
      <div class="home-section-label">SENESTE LOGS</div>
      <div class="home-feed-list">
        ${buildHomeDescCard(_activeTaskDesc)}
        ${hasLogs ? logs.map(log => buildHomeLogCard(log)).join('') : ''}
      </div>
    </div>
  `
}

function buildHomeDescCard(desc) {
  const empty = !desc
  return `
    <div class="home-desc-card">
      <div class="home-desc-label">Instruktioner</div>
      <div class="home-desc-text${empty ? ' dim' : ''}">${escapeHtml(desc || 'Ingen instruktioner endnu')}</div>
    </div>
  `
}

function buildHomeLogCard(log) {
  const time    = log.timestamp ? formatTimestamp(log.timestamp) : ''
  const day     = log.timestamp ? relativeDate(log.timestamp)    : ''
  const timeStr = day && time ? `${day} ${time}` : (time || day || '')

  return `
    <div class="home-feed-card">
      ${log.photoUrl
        ? `<img src="${escapeAttr(log.photoUrl)}" alt="" loading="lazy" class="home-feed-thumb">`
        : `<div class="home-feed-thumb home-feed-thumb-note">${iconNoteSmall()}</div>`
      }
      <div class="home-feed-card-body">
        ${log.note
          ? `<div class="home-feed-note">${escapeHtml(log.note)}</div>`
          : `<div class="home-feed-note home-feed-note-dim">Foto</div>`
        }
        <div class="home-feed-time">${escapeHtml(timeStr)}</div>
      </div>
    </div>
  `
}

// ─── PROJECT PICKER ─────────────────────────────────────────

function openProjectPicker(container) {
  const body = openSheet(container, 'Vælg projekt')
  if (!body) return

  const active         = getActive()
  const activeProjects = _projects.filter(p => p.status === 'active')
  const doneProjects   = _projects.filter(p => p.status === 'completed')

  const listHtml = [
    ...activeProjects.map(p => `
      <div class="picker-proj-item${active && active.projectId === p.id ? ' is-active' : ''}"
           data-id="${escapeAttr(p.id)}"
           data-addr="${escapeAttr(p.address || '')}">
        <div class="picker-proj-addr">${escapeHtml(p.address || 'Ukendt adresse')}</div>
        ${p.description ? `<div class="picker-proj-desc">${escapeHtml(p.description)}</div>` : ''}
      </div>
    `),
    ...doneProjects.map(p => `
      <div class="picker-proj-item picker-proj-done">
        <div class="picker-proj-addr">${escapeHtml(p.address || 'Ukendt adresse')}</div>
        <span class="picker-proj-badge">FÆRDIG</span>
      </div>
    `)
  ].join('')

  body.innerHTML = `
    <div id="picker-proj-list">
      ${_projects.length === 0 ? `
        <div class="empty-state" style="padding:40px 0;">
          <div class="empty-title">Ingen projekter</div>
          <div class="empty-body">Opret dit første projekt for at komme i gang.</div>
        </div>
      ` : listHtml}
    </div>
    <div class="sheet-footer">
      <button class="btn-dashed-new sheet-new-proj-btn" id="sheet-btn-new">
        ${iconPlus()}
        Nyt projekt
      </button>
    </div>
  `

  body.querySelectorAll('.picker-proj-item:not(.picker-proj-done)').forEach(el => {
    el.addEventListener('click', () => selectProject(container, el.dataset.id, el.dataset.addr))
  })

  body.querySelector('#sheet-btn-new').addEventListener('click', () => {
    closeSheet(container)
    window.navigate('project-new')
  })
}

async function selectProject(container, projectId, projectAddr) {
  const prev = getActive()

  if (!prev || prev.projectId !== projectId) {
    if (prev && prev.taskId && prev.taskStatus !== 'done') {
      try { await updateTask(prev.taskId, { status: 'in progress' }) } catch { /* ignore */ }
    }
    setActive({ projectId, projectAddr, taskId: null, taskName: null, taskStatus: 'not started' })
    renderStatusCard(container)
  }

  closeSheet(container)
  setTimeout(() => openTaskPicker(container, projectId), 300)
}

// ─── TASK PICKER ────────────────────────────────────────────

function openTaskPicker(container, projectId) {
  const project = _projects.find(p => p.id === projectId)
  const title   = project?.address || 'Vælg opgave'
  const body    = openSheet(container, title)
  if (!body) return

  body.innerHTML = `<div class="empty-state" style="padding:40px 0;"><div class="spinner" style="width:18px;height:18px;border-width:2px;"></div></div>`

  getTasks(projectId)
    .then(tasks => { if (body.isConnected) renderPickerTasks(container, body, tasks, project) })
    .catch(() => { if (body.isConnected) body.innerHTML = `<div style="padding:16px 18px;font-size:13px;color:var(--danger);">Kunne ikke hente opgaver</div>` })
}

function renderPickerTasks(container, el, tasks, project) {
  const currentActive = getActive()
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
        ${isActive          ? `<span class="picker-task-badge active-badge-sm">Aktiv</span>` : ''}
        ${!isActive && isDone ? `<span class="picker-task-badge done-badge-sm">Færdig</span>` : ''}
      </div>
    `
  }

  el.innerHTML = `
    ${notDone.length === 0 && done.length === 0
      ? `<div class="picker-empty-tasks">Ingen opgaver endnu</div>`
      : notDone.map(taskRow).join('') +
        (done.length > 0 ? `<div class="picker-section-label">Færdige</div>` + done.map(taskRow).join('') : '')}
    <div class="picker-add-task-area">
      <button class="picker-add-task-trigger" id="picker-add-trigger">
        ${iconPlus()}
        Tilføj opgave
      </button>
      <div class="picker-add-task-form" id="picker-add-form" style="display:none;">
        <input class="picker-add-input" id="picker-add-input" type="text"
               placeholder="Opgavenavn" maxlength="200" autocomplete="off">
        <div class="picker-add-actions">
          <button class="btn-cancel-task" id="picker-add-cancel">Annuller</button>
          <button class="btn-save-task" id="picker-add-save">Gem</button>
        </div>
      </div>
    </div>
  `

  el.querySelectorAll('.picker-task').forEach(taskEl => {
    taskEl.addEventListener('click', () => selectTask(container, {
      projectId:   taskEl.dataset.projectId,
      projectAddr: taskEl.dataset.projectAddr,
      taskId:      taskEl.dataset.taskId,
      taskName:    taskEl.dataset.taskName,
      taskStatus:  taskEl.dataset.taskStatus
    }))
  })

  const trigger   = el.querySelector('#picker-add-trigger')
  const form      = el.querySelector('#picker-add-form')
  const input     = el.querySelector('#picker-add-input')
  const cancelBtn = el.querySelector('#picker-add-cancel')
  const saveBtn   = el.querySelector('#picker-add-save')

  trigger.addEventListener('click', () => {
    trigger.style.display = 'none'
    form.style.display = 'block'
    setTimeout(() => input.focus(), 50)
  })

  cancelBtn.addEventListener('click', () => {
    form.style.display = 'none'
    trigger.style.display = 'flex'
  })

  const saveNewTask = async () => {
    const name = input.value.trim()
    if (!name) { input.focus(); return }

    saveBtn.disabled = true
    saveBtn.textContent = '...'

    try {
      const newTaskId = await createTask(project.id, name)

      const prev = getActive()
      if (prev && prev.taskId && prev.taskStatus !== 'done') {
        try { await updateTask(prev.taskId, { status: 'in progress' }) } catch { /* ignore */ }
      }
      await updateTask(newTaskId, { status: 'in progress' })

      setActive({
        projectId:   project.id,
        taskId:      newTaskId,
        taskName:    name,
        projectAddr: project.address || '',
        taskStatus:  'in progress'
      })

      closeSheet(container)
      renderStatusCard(container)
    } catch (err) {
      console.error('Kunne ikke oprette opgave:', err)
      saveBtn.disabled = false
      saveBtn.textContent = 'Gem'
      input.focus()
    }
  }

  saveBtn.addEventListener('click', saveNewTask)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewTask()
    if (e.key === 'Escape') cancelBtn.click()
  })
}

async function selectTask(container, { projectId, projectAddr, taskId, taskName, taskStatus }) {
  const prev = getActive()

  if (prev && prev.taskId && prev.taskId !== taskId && prev.taskStatus !== 'done') {
    try { await updateTask(prev.taskId, { status: 'in progress' }) } catch { /* ignore */ }
  }

  if (taskStatus === 'not started' || taskStatus === 'done') {
    try { await updateTask(taskId, { status: 'in progress' }) } catch { /* ignore */ }
    taskStatus = 'in progress'
  }

  setActive({ projectId, taskId, taskName, projectAddr, taskStatus })
  closeSheet(container)
  renderStatusCard(container)
}

// ─── DESC EDIT SHEET ────────────────────────────────────────

function openDescViewSheet(container) {
  const body = openSheet(container, 'Instruktioner')
  if (!body) return

  const desc = _activeTaskDesc
  body.innerHTML = `
    <div style="padding:4px 0 16px;">
      <p style="font-size:15px;color:${desc ? 'var(--text)' : 'var(--text3)'};line-height:1.65;white-space:pre-wrap;word-break:break-word;margin:0;">
        ${desc ? escapeHtml(desc) : 'Ingen instruktioner endnu'}
      </p>
    </div>
  `
}

// ─── LIGHTBOX ────────────────────────────────────────────────

function openLightbox(container, url) {
  container.querySelector('#home-lightbox')?.remove()

  const lb = document.createElement('div')
  lb.id = 'home-lightbox'
  lb.className = 'lightbox'
  lb.innerHTML = `
    <img class="lightbox-img" src="${escapeAttr(url)}" alt="">
    <button class="lightbox-close" aria-label="Luk">${iconClose()}</button>
  `
  lb.addEventListener('click', e => { if (!e.target.closest('.lightbox-img')) lb.remove() })
  lb.querySelector('.lightbox-close').addEventListener('click', () => lb.remove())
  container.querySelector('#home-screen').appendChild(lb)
}

// ─── SHEET HELPERS ──────────────────────────────────────────

function openSheet(container, title) {
  const overlay = container.querySelector('#sheet-overlay')
  const body    = container.querySelector('#sheet-body')
  const titleEl = container.querySelector('#sheet-title')
  if (!overlay) return null

  if (titleEl) titleEl.textContent = title
  overlay.classList.add('open')
  body.innerHTML = ''

  overlay.onclick = e => { if (e.target === overlay) closeSheet(container) }
  container.querySelector('#btn-sheet-close').onclick = () => closeSheet(container)

  return body
}

function closeSheet(container) {
  container.querySelector('#sheet-overlay')?.classList.remove('open')
}

// ─── HELPERS ────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;')
}

// ─── ICONS ──────────────────────────────────────────────────

function iconFolder() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
  </svg>`
}

function iconCameraLg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}

function iconCamera() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}

function iconNoteSmall() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`
}

function iconNote() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`
}

function iconChevronRight() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}

function iconArrowRight() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`
}

function iconPlus() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`
}
