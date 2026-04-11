import { subscribeToProjects, getTasks, createTask, updateTask } from '../js/api.js'
import { formatDayFull } from '../js/utils.js'
import { getApiKey } from '../js/claude.js'
import { getActive, setActive, clearActive } from '../js/activeTask.js'

let _unsubProjects = null
let _projects      = []   // full list for task picker + project name lookup

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container) {
  container.innerHTML = buildShell()

  container.querySelector('#btn-settings').addEventListener('click', () => {
    window.navigate('settings')
  })
  container.querySelector('#btn-new-project').addEventListener('click', () => {
    window.navigate('project-new')
  })
  container.querySelector('#btn-projekter').addEventListener('click', () => {
    window.navigate('projects')
  })

  const banner = container.querySelector('#api-key-banner')
  if (banner) banner.addEventListener('click', () => window.navigate('settings'))

  renderHero(container)

  _unsubProjects = subscribeToProjects(projects => {
    _projects = projects

    // Invalidate active state if project was removed/completed
    const active = getActive()
    if (active) {
      const proj = projects.find(p => p.id === active.projectId && p.status === 'active')
      if (!proj) { clearActive(); renderHero(container) }
    }
  })
}

export function destroy() {
  if (_unsubProjects) { _unsubProjects(); _unsubProjects = null }
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

      <!-- Hero: fixed above safe-bottom link -->
      <div id="hero-area"></div>

      <!-- Bottom: subtle projects link -->
      <div class="screen-body home-footer-area">
        <button class="btn-projekter" id="btn-projekter">PROJEKTER</button>
        <div class="safe-bottom"></div>
      </div>

      <!-- Picker bottom sheet (project or task) -->
      <div class="sheet-overlay" id="sheet-overlay">
        <div class="sheet">
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
        <button class="hero-selector-btn" disabled style="opacity:0.35; pointer-events:none;">
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

function closeSheet(container) {
  container.querySelector('#sheet-overlay')?.classList.remove('open')
}

// Project picker — shows all active projects; tap to expand tasks
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
      <div class="sheet-footer">
        <button class="btn-primary" id="sheet-btn-new-project">
          ${iconPlus()}
          Nyt projekt
        </button>
      </div>
    `
    body.querySelector('#sheet-btn-new-project').addEventListener('click', () => {
      closeSheet(container)
      window.navigate('project-new')
    })
    return
  }

  body.innerHTML = `
    <div id="picker-projects-list"></div>
    <div class="sheet-footer">
      <button class="btn-ghost sheet-new-project-btn" id="sheet-btn-new-project">
        ${iconPlus()}
        Nyt projekt
      </button>
    </div>
  `

  body.querySelector('#sheet-btn-new-project').addEventListener('click', () => {
    closeSheet(container)
    window.navigate('project-new')
  })

  renderPickerProjects(container, body.querySelector('#picker-projects-list'), activeProjects, null)
}

// Task picker — pre-expands to the current project's tasks
function openTaskPickerForProject(container, projectId) {
  const body = openSheet(container, 'Vælg opgave')
  if (!body) return

  const activeProjects = _projects.filter(p => p.status === 'active')
  if (activeProjects.length === 0) {
    body.innerHTML = `<div class="empty-state" style="padding:40px 0;"><div class="empty-title">Ingen aktive projekter</div></div>`
    return
  }

  renderPickerProjects(container, body, activeProjects, projectId)
}

function renderPickerProjects(container, el, projects, preExpandId) {
  el.innerHTML = projects.map(p => `
    <div class="picker-project" data-id="${escapeAttr(p.id)}">
      <div class="picker-project-header">
        <span class="picker-project-addr">${escapeHtml(p.address || 'Ukendt adresse')}</span>
        <span class="picker-chevron">${iconChevron()}</span>
      </div>
      <div class="picker-tasks" id="picker-tasks-${escapeAttr(p.id)}"></div>
    </div>
  `).join('')

  const expandProject = async (projectEl) => {
    const projectId = projectEl.dataset.id
    const tasksEl   = el.querySelector(`#picker-tasks-${CSS.escape(projectId)}`)

    // Collapse all
    el.querySelectorAll('.picker-project').forEach(p => {
      p.classList.remove('expanded')
      el.querySelector(`#picker-tasks-${CSS.escape(p.dataset.id)}`).innerHTML = ''
    })

    projectEl.classList.add('expanded')
    tasksEl.innerHTML = `<div style="padding:8px 16px;"><div class="spinner" style="width:18px;height:18px;border-width:2px;"></div></div>`

    try {
      const tasks   = await getTasks(projectId)
      const project = _projects.find(p => p.id === projectId)
      renderPickerTasks(container, tasksEl, tasks, project)
    } catch {
      tasksEl.innerHTML = `<div style="padding:10px 16px;font-size:13px;color:var(--danger);">Kunne ikke hente opgaver</div>`
    }
  }

  el.querySelectorAll('.picker-project').forEach(projectEl => {
    projectEl.querySelector('.picker-project-header').addEventListener('click', async () => {
      if (projectEl.classList.contains('expanded')) {
        projectEl.classList.remove('expanded')
        el.querySelector(`#picker-tasks-${CSS.escape(projectEl.dataset.id)}`).innerHTML = ''
      } else {
        await expandProject(projectEl)
      }
    })
  })

  if (preExpandId) {
    const target = el.querySelector(`.picker-project[data-id="${CSS.escape(preExpandId)}"]`)
    if (target) expandProject(target)
  }
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

  // Task selection
  el.querySelectorAll('.picker-task').forEach(taskEl => {
    taskEl.addEventListener('click', () => selectTask(container, {
      projectId:   taskEl.dataset.projectId,
      projectAddr: taskEl.dataset.projectAddr,
      taskId:      taskEl.dataset.taskId,
      taskName:    taskEl.dataset.taskName,
      taskStatus:  taskEl.dataset.taskStatus
    }, tasks))
  })

  // Inline add-task form
  const trigger  = el.querySelector('#picker-add-trigger')
  const form     = el.querySelector('#picker-add-form')
  const input    = el.querySelector('#picker-add-input')
  const cancelBtn = el.querySelector('#picker-add-cancel')
  const saveBtn  = el.querySelector('#picker-add-save')

  trigger.addEventListener('click', () => {
    trigger.style.display = 'none'
    form.style.display = 'block'
    input.value = ''
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

      // Set as active immediately
      const prev = getActive()
      if (prev && prev.taskId && prev.taskStatus !== 'done') {
        try { await updateTask(prev.taskId, { status: 'in progress' }) } catch { /* ignore */ }
      }
      if (newTaskId) {
        await updateTask(newTaskId, { status: 'in progress' })
      }

      setActive({
        projectId:   project.id,
        taskId:      newTaskId || '',
        taskName:    name,
        projectAddr: project.address || '',
        taskStatus:  'in progress'
      })

      closeSheet(container)
      renderHero(container)
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
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`
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

function iconChevron() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconChevronRight() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}
