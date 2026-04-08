import { subscribeToProjects, getTasks, updateTask } from '../js/api.js'
import { formatDayFull, formatDateShort, relativeDate } from '../js/utils.js'
import { getApiKey } from '../js/claude.js'
import { getActive, setActive, clearActive } from '../js/activeTask.js'

let _unsubscribe = null
let _projects    = []

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container) {
  container.innerHTML = buildShell()

  container.querySelector('#btn-new-project').addEventListener('click', () => {
    window.navigate('project-new')
  })
  container.querySelector('#btn-settings').addEventListener('click', () => {
    window.navigate('settings')
  })
  const banner = container.querySelector('#api-key-banner')
  if (banner) banner.addEventListener('click', () => window.navigate('settings'))

  renderHeroArea(container)

  _unsubscribe = subscribeToProjects(projects => {
    _projects = projects
    renderProjectList(container, projects)

    // If the active project was deleted or completed, clear active state
    const active = getActive()
    if (active) {
      const proj = projects.find(p => p.id === active.projectId && p.status === 'active')
      if (!proj) {
        clearActive()
        renderHeroArea(container)
      }
    }
  })
}

export function destroy() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }
  _projects = []
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="home-screen">
      <div class="top-bar">
        <div class="top-bar-title">
          <h1>Hammer Time</h1>
          <div class="subtitle" id="home-date">${formatDayFull()}</div>
        </div>
        <div class="top-bar-actions">
          <button class="btn-icon" id="btn-settings" aria-label="Indstillinger">
            ${iconSettings()}
          </button>
        </div>
      </div>

      ${!getApiKey() ? `
        <div id="api-key-banner" style="
          margin: 12px 14px 0;
          padding: 12px 14px;
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
          <span>Tilføj Anthropic API-nøgle for at bruge AI</span>
          <span style="font-size:11px; opacity:0.7;">→ Indstillinger</span>
        </div>
      ` : ''}

      <div class="screen-body">
        <div id="hero-area" style="padding: 14px 14px 0;"></div>

        <div class="section-header">
          <span class="section-title">Projekter</span>
          <span class="section-count" id="projects-count"></span>
        </div>
        <div class="list-content" id="projects-list">
          <div class="empty-state"><div class="spinner"></div></div>
        </div>
        <div class="safe-bottom"></div>
      </div>

      <div class="fab-area">
        <button class="btn-primary" id="btn-new-project">
          ${iconPlus()}
          Nyt projekt
        </button>
      </div>

      <!-- Task picker bottom sheet -->
      <div class="sheet-overlay" id="sheet-overlay">
        <div class="sheet" id="task-picker-sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title">Vælg opgave</span>
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

// ─── HERO AREA ──────────────────────────────────────────────

function renderHeroArea(container) {
  const area = container.querySelector('#hero-area')
  if (!area) return
  const active = getActive()

  if (!active) {
    area.innerHTML = `
      <div class="hero-empty">
        <div class="hero-empty-icon">${iconTaskLg()}</div>
        <div class="hero-empty-title">Ingen aktiv opgave</div>
        <div class="hero-empty-body">Vælg et projekt og en opgave for at komme i gang.</div>
        <button class="btn-primary" id="btn-pick-task" style="margin-top: 4px;">
          ${iconSwap()}
          Vælg opgave
        </button>
      </div>
    `
    area.querySelector('#btn-pick-task').addEventListener('click', () => {
      openTaskPicker(container)
    })
    return
  }

  area.innerHTML = `
    <div class="active-task-hero">
      <div class="active-task-meta">
        <span class="active-task-project">${escapeHtml(active.projectAddr)}</span>
        <span class="active-badge">Aktiv</span>
      </div>
      <div class="active-task-name">${escapeHtml(active.taskName || 'Unavngivet opgave')}</div>
      <button class="btn-hero-camera" id="btn-hero-log">
        <div class="hero-camera-circle">
          ${iconCameraLg()}
        </div>
        <span>Log foto</span>
      </button>
      <button class="btn-ghost btn-hero-note" id="btn-hero-note">
        ${iconNote()}
        Bare en note
      </button>
      <button class="btn-switch-task" id="btn-switch-task">
        ${iconSwap()}
        Skift opgave
      </button>
    </div>
  `

  area.querySelector('#btn-hero-log').addEventListener('click', () => {
    window.navigate('log', {
      projectId: active.projectId,
      taskId:    active.taskId,
      taskName:  active.taskName,
      returnTo:  'home'
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

  area.querySelector('#btn-switch-task').addEventListener('click', () => {
    openTaskPicker(container)
  })
}

// ─── TASK PICKER SHEET ──────────────────────────────────────

function openTaskPicker(container) {
  const overlay = container.querySelector('#sheet-overlay')
  const body    = container.querySelector('#sheet-body')
  if (!overlay) return

  overlay.classList.add('open')
  body.innerHTML = '<div class="empty-state" style="padding:40px 0;"><div class="spinner"></div></div>'

  const closeBtn = container.querySelector('#btn-sheet-close')
  overlay.onclick = e => { if (e.target === overlay) closeSheet(container) }
  closeBtn.onclick = () => closeSheet(container)

  const active = _projects.filter(p => p.status === 'active')

  if (active.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-title">Ingen aktive projekter</div>
        <div class="empty-body">Opret et projekt for at komme i gang.</div>
      </div>
    `
    return
  }

  renderPickerProjects(container, body, active)
}

function closeSheet(container) {
  const overlay = container.querySelector('#sheet-overlay')
  if (!overlay) return
  overlay.classList.remove('open')
}

function renderPickerProjects(container, body, projects) {
  body.innerHTML = projects.map(p => `
    <div class="picker-project" data-id="${escapeAttr(p.id)}">
      <div class="picker-project-header">
        <span class="picker-project-addr">${escapeHtml(p.address || 'Ukendt adresse')}</span>
        <span class="picker-chevron" id="chevron-${escapeAttr(p.id)}">${iconChevron()}</span>
      </div>
      <div class="picker-tasks" id="picker-tasks-${escapeAttr(p.id)}"></div>
    </div>
  `).join('')

  body.querySelectorAll('.picker-project').forEach(el => {
    el.querySelector('.picker-project-header').addEventListener('click', async () => {
      const projectId = el.dataset.id
      const tasksEl   = body.querySelector(`#picker-tasks-${CSS.escape(projectId)}`)
      const chevron   = body.querySelector(`#chevron-${CSS.escape(projectId)}`)
      const isOpen    = el.classList.contains('expanded')

      // Collapse all
      body.querySelectorAll('.picker-project').forEach(p => {
        p.classList.remove('expanded')
        body.querySelector(`#picker-tasks-${CSS.escape(p.dataset.id)}`).innerHTML = ''
      })

      if (!isOpen) {
        el.classList.add('expanded')
        tasksEl.innerHTML = `
          <div style="padding: 8px 16px;">
            <div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>
          </div>
        `
        try {
          const tasks   = await getTasks(projectId)
          const project = _projects.find(p => p.id === projectId)
          renderPickerTasks(container, tasksEl, tasks, project)
        } catch {
          tasksEl.innerHTML = `<div style="padding:10px 16px; font-size:13px; color:var(--danger);">Kunne ikke hente opgaver</div>`
        }
      }
    })
  })
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
        ${isActive
          ? `<span class="picker-task-badge active-badge-sm">Aktiv</span>`
          : isDone
            ? `<span class="picker-task-badge done-badge-sm">Færdig</span>`
            : ''}
      </div>
    `
  }

  el.innerHTML =
    notDone.map(taskRow).join('') +
    (done.length > 0
      ? `<div class="picker-section-label">Færdige</div>` + done.map(taskRow).join('')
      : '')

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

  // Set previous task back to 'in progress' if it wasn't done
  if (prev && prev.taskId && prev.taskId !== taskId && prev.taskStatus !== 'done') {
    try { await updateTask(prev.taskId, { status: 'in progress' }) } catch { /* ignore */ }
  }

  // Set new task to 'in progress' if it was 'not started'
  if (taskStatus === 'not started') {
    try { await updateTask(taskId, { status: 'in progress' }) } catch { /* ignore */ }
    taskStatus = 'in progress'
  }

  setActive({ projectId, taskId, taskName, projectAddr, taskStatus })
  closeSheet(container)
  renderHeroArea(container)
}

// ─── PROJECT LIST (secondary) ────────────────────────────────

function renderProjectList(container, projects) {
  const list    = container.querySelector('#projects-list')
  const countEl = container.querySelector('#projects-count')
  if (!list) return

  const active    = projects.filter(p => p.status === 'active')
  const completed = projects.filter(p => p.status === 'completed')

  if (countEl) countEl.textContent = active.length > 0 ? String(active.length) : ''

  if (projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <div class="empty-title">Ingen projekter endnu</div>
        <div class="empty-body">Tryk på "Nyt projekt" for at oprette dit første projekt.</div>
      </div>
    `
    return
  }

  let html = ''
  if (active.length > 0) html += active.map(projectCard).join('')
  if (completed.length > 0) {
    if (active.length > 0) html += '<div class="divider" style="margin: 12px 0;"></div>'
    html += `<div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text3);font-family:var(--mono);padding:4px 2px 8px;">Afsluttede projekter</div>`
    html += completed.map(projectCard).join('')
  }

  list.innerHTML = html

  list.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      window.navigate('project-view', { projectId: card.dataset.id })
    })
  })
}

function projectCard(project) {
  const statusBadge = project.status === 'active'
    ? `<span class="badge badge-active">Aktiv</span>`
    : `<span class="badge badge-completed">Færdig</span>`

  const dateStr = project.startDate
    ? `Fra ${formatDateShort(project.startDate)}`
    : (project.createdAt ? `Oprettet ${relativeDate(project.createdAt)}` : '')

  return `
    <div class="project-card" data-id="${escapeAttr(project.id)}">
      <div class="project-card-top">
        <div class="project-address">${escapeHtml(project.address || 'Ukendt adresse')}</div>
        ${statusBadge}
      </div>
      ${project.description ? `<div class="project-desc">${escapeHtml(project.description)}</div>` : ''}
      <div class="project-meta">
        ${dateStr ? `<div class="project-meta-item">${iconCalendar()}<span>${dateStr}</span></div>` : ''}
      </div>
    </div>
  `
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

function iconCalendar() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
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

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}

function iconTaskLg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="40" height="40">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
    <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>`
}
