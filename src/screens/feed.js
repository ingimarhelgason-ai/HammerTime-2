import { getProject, getProjects, getTasks, subscribeToLogs } from '../js/api.js'
import { formatTimestamp, relativeDate } from '../js/utils.js'

let _unsubLogs    = null
let _projectId    = null
let _projectAddr  = null
let _projects     = []
let _container    = null
let _tasks        = []
let _taskMap      = {}
let _allLogs      = []
let _filter       = null

// ─── LIFECYCLE ──────────────────────────────────────────────

export async function render(container, params = {}) {
  const { projectId } = params
  if (!projectId) { window.navigate('home'); return }

  _projectId   = projectId
  _projectAddr = null
  _projects    = []
  _container   = container
  _filter      = null
  _allLogs     = []
  _tasks       = []
  _taskMap     = {}

  container.innerHTML = buildShell()
  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))

  // Project selector — listener on the stable wrapper, not the re-rendered card
  container.querySelector('#feed-project-selector-wrap').addEventListener('click', () => openProjectSheet())

  // Project picker sheet
  container.querySelector('#feed-sheet-overlay').addEventListener('click', e => {
    if (e.target.id === 'feed-sheet-overlay') closeProjectSheet()
  })
  container.querySelector('#btn-feed-sheet-close').addEventListener('click', () => closeProjectSheet())

  let project
  try {
    const [proj, tasks, projects] = await Promise.all([
      getProject(projectId),
      getTasks(projectId),
      getProjects()
    ])
    project   = proj
    _tasks    = tasks
    _taskMap  = Object.fromEntries(tasks.map(t => [t.id, t.name || 'Unavngivet']))
    _projects = projects
  } catch {
    showToast('Kunne ikke indlæse data', true)
    return
  }

  if (!project) { window.navigate('home'); return }

  _projectAddr = project.address || ''

  const titleEl = container.querySelector('#feed-title')
  if (titleEl) titleEl.textContent = _projectAddr || 'Feed'

  renderProjectSelector()
  renderPills()

  _unsubLogs = subscribeToLogs(projectId, logs => {
    _allLogs = logs
    renderGrid()
  })
}

export function destroy() {
  if (_unsubLogs) { _unsubLogs(); _unsubLogs = null }
  _projectId = null; _projectAddr = null; _projects = []
  _container = null
  _allLogs = []; _tasks = []; _taskMap = {}; _filter = null
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="feed-screen">
      <div class="top-bar" style="border-bottom:1px solid var(--border);">
        <button class="btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1 id="feed-title" style="font-size:15px;font-family:var(--mono);font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></h1>
        </div>
      </div>

      <div id="feed-project-selector-wrap"></div>

      <div id="feed-pills-row"></div>

      <div class="screen-body" id="feed-body">
        <div id="feed-grid-wrap" style="margin-top:12px;"></div>
        <div class="safe-bottom"></div>
      </div>

      <div id="feed-toast-area"></div>

      <!-- Project picker sheet -->
      <div class="sheet-overlay" id="feed-sheet-overlay">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title">Vælg projekt</span>
            <button class="btn-icon sheet-close" id="btn-feed-sheet-close">${iconClose()}</button>
          </div>
          <div class="sheet-body" id="feed-sheet-body"></div>
        </div>
      </div>
    </div>
  `
}

// ─── PROJECT SELECTOR ────────────────────────────────────────

function renderProjectSelector() {
  const wrap = _container?.querySelector('#feed-project-selector-wrap')
  if (!wrap) return
  wrap.innerHTML = `
    <div class="feed-project-selector">
      <div class="feed-project-selector-label">PROJEKT</div>
      <div class="feed-project-selector-row">
        <div class="feed-project-selector-value">${escapeHtml(_projectAddr || 'Ukendt projekt')}</div>
        <div class="feed-project-selector-chevron">›</div>
      </div>
    </div>
  `
}

function openProjectSheet() {
  const overlay = _container?.querySelector('#feed-sheet-overlay')
  const body    = _container?.querySelector('#feed-sheet-body')
  if (!overlay || !body) return

  body.innerHTML = _projects.map(p => `
    <div class="feed-proj-option${p.id === _projectId ? ' selected' : ''}"
         data-id="${escapeAttr(p.id)}"
         data-addr="${escapeAttr(p.address || '')}">
      ${escapeHtml(p.address || 'Ukendt adresse')}
    </div>
  `).join('')

  body.querySelectorAll('.feed-proj-option').forEach(opt => {
    opt.addEventListener('click', () => {
      closeProjectSheet()
      switchProject(opt.dataset.id, opt.dataset.addr)
    })
  })

  overlay.classList.add('open')
}

function closeProjectSheet() {
  _container?.querySelector('#feed-sheet-overlay')?.classList.remove('open')
}

async function switchProject(projectId, projectAddr) {
  if (projectId === _projectId) return

  _projectId   = projectId
  _projectAddr = projectAddr
  _filter      = null
  _allLogs     = []
  _tasks       = []
  _taskMap     = {}

  // Update top bar title
  const titleEl = _container?.querySelector('#feed-title')
  if (titleEl) titleEl.textContent = projectAddr || 'Feed'

  // Unsub old log listener, clear grid
  if (_unsubLogs) { _unsubLogs(); _unsubLogs = null }
  const wrap = _container?.querySelector('#feed-grid-wrap')
  if (wrap) wrap.innerHTML = ''

  renderProjectSelector()

  // Re-fetch tasks for new project, rebuild pills
  try {
    const tasks = await getTasks(projectId)
    _tasks   = tasks
    _taskMap = Object.fromEntries(tasks.map(t => [t.id, t.name || 'Unavngivet']))
  } catch {
    showToast('Kunne ikke indlæse opgaver', true)
  }

  renderPills()

  // Subscribe to new project's logs
  _unsubLogs = subscribeToLogs(projectId, logs => {
    _allLogs = logs
    renderGrid()
  })
}

// ─── FILTER PILLS ────────────────────────────────────────────

function renderPills() {
  const row = _container?.querySelector('#feed-pills-row')
  if (!row) return

  if (_tasks.length === 0) {
    row.innerHTML = ''
    return
  }

  row.innerHTML = `
    <div class="log-filter-row">
      <button class="log-filter-pill${_filter === null ? ' active' : ''}" data-filter="">Alle</button>
      ${_tasks.map(t => `
        <button class="log-filter-pill${_filter === t.id ? ' active' : ''}"
                data-filter="${escapeAttr(t.id)}">${escapeHtml(t.name || 'Unavngivet')}</button>
      `).join('')}
    </div>
  `

  row.querySelectorAll('.log-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _filter = pill.dataset.filter || null
      row.querySelectorAll('.log-filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.filter === pill.dataset.filter)
      })
      renderGrid()
    })
  })
}

// ─── GRID ────────────────────────────────────────────────────

function renderGrid() {
  const wrap = _container?.querySelector('#feed-grid-wrap')
  if (!wrap) return

  const logs = _filter ? _allLogs.filter(l => l.taskId === _filter) : _allLogs

  if (logs.length === 0) {
    const msg = _filter ? 'Ingen logs for denne opgave' : 'Ingen logs endnu'
    wrap.innerHTML = `<div class="feed-empty"><span>${escapeHtml(msg)}</span></div>`
    return
  }

  // Build photo URL list for lightbox navigation (in display order)
  const photos = logs.filter(l => l.photoUrl).map(l => l.photoUrl)

  let photoIndex = 0
  wrap.innerHTML = `
    <div class="feed-grid">
      ${logs.map(log => {
        if (log.photoUrl) {
          return buildPhotoCell(log, photoIndex++)
        }
        return buildNoteCell(log)
      }).join('')}
    </div>
  `

  wrap.querySelectorAll('.feed-grid-photo').forEach(cell => {
    cell.addEventListener('click', () => {
      openLightbox(photos, parseInt(cell.dataset.photoIndex, 10))
    })
  })
}

function buildPhotoCell(log, idx) {
  return `
    <div class="feed-grid-photo" data-photo-index="${idx}">
      <img src="${escapeAttr(log.photoUrl)}" alt="" loading="lazy">
    </div>
  `
}

function buildNoteCell(log) {
  const taskName = log.taskId ? (_taskMap[log.taskId] || null) : null
  const time     = log.timestamp ? formatTimestamp(log.timestamp) : ''
  const day      = log.timestamp ? relativeDate(log.timestamp)    : ''
  const timeStr  = day && time ? `${day} ${time}` : (time || day || '')
  const meta     = [timeStr, taskName].filter(Boolean).join(' · ')

  return `
    <div class="feed-grid-note">
      <div class="feed-grid-note-text">${escapeHtml(log.note || '')}</div>
      ${meta ? `<div class="feed-grid-note-meta">${escapeHtml(meta)}</div>` : ''}
    </div>
  `
}

// ─── LIGHTBOX ────────────────────────────────────────────────

function openLightbox(photos, startIndex) {
  _container?.querySelector('#feed-lightbox')?.remove()
  if (!photos.length) return

  let current    = Math.max(0, Math.min(startIndex, photos.length - 1))
  let touchStartX = null

  const lb = document.createElement('div')
  lb.id = 'feed-lightbox'
  lb.className = 'feed-lightbox'

  const img = document.createElement('img')
  img.className = 'feed-lightbox-img'
  img.alt = ''

  const closeBtn = document.createElement('button')
  closeBtn.className = 'feed-lightbox-close'
  closeBtn.setAttribute('aria-label', 'Luk')
  closeBtn.textContent = '×'

  lb.appendChild(img)
  lb.appendChild(closeBtn)

  const show = () => { img.src = photos[current] }
  const close = () => lb.remove()

  closeBtn.addEventListener('click', e => { e.stopPropagation(); close() })
  lb.addEventListener('click', close)

  lb.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX
  }, { passive: true })

  lb.addEventListener('touchend', e => {
    if (touchStartX === null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    touchStartX = null
    if (Math.abs(dx) < 40) return
    if (dx < 0 && current < photos.length - 1) { current++; show() }
    if (dx > 0 && current > 0)                 { current--; show() }
  }, { passive: true })

  _container.querySelector('#feed-screen').appendChild(lb)
  show()
}

// ─── TOAST ───────────────────────────────────────────────────

function showToast(message, isError = false) {
  const area = _container?.querySelector('#feed-toast-area')
  if (!area) return
  const toast = document.createElement('div')
  toast.className = `toast${isError ? ' error' : ''}`
  toast.textContent = message
  area.innerHTML = ''
  area.appendChild(toast)
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')))
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300) }, 2500)
}

// ─── HELPERS ────────────────────────────────────────────────

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

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}
