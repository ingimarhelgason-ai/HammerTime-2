import { subscribeToProjects, updateProject } from '../js/api.js'
import { formatDateShort } from '../js/utils.js'

let _unsub            = null
let _projects         = []
let _completedVisible = false
let _longPressTimer   = null
let _didLongPress     = false
let _container        = null

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container) {
  _container        = container
  _completedVisible = false

  container.innerHTML = buildShell()

  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))
  container.querySelector('#btn-new-project').addEventListener('click', () => window.navigate('project-new'))
  container.querySelector('#btn-settings').addEventListener('click', () => window.navigate('settings'))
  container.querySelector('#project-action-overlay').addEventListener('click', e => {
    if (e.target.id === 'project-action-overlay') closeActionSheet()
  })

  const listEl = container.querySelector('#projects-list')

  _unsub = subscribeToProjects(projects => {
    _projects = projects
    renderList(listEl, projects)
  })
}

export function destroy() {
  if (_unsub) { _unsub(); _unsub = null }
  clearTimeout(_longPressTimer)
  _longPressTimer = null
  _container = null
  _projects  = []
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="projects-screen">
      <div class="top-bar">
        <button class="btn-icon btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1>Projekter</h1>
        </div>
        <div class="top-bar-actions">
          <button class="btn-icon" id="btn-new-project" aria-label="Nyt projekt" title="Nyt projekt">
            ${iconPlus()}
          </button>
        </div>
      </div>

      <div class="screen-body" id="projects-list">
        <div class="empty-state" style="padding:60px 0;">
          <div class="spinner"></div>
        </div>
      </div>

      <div class="projects-footer">
        <button class="btn-text-link" id="btn-settings">Indstillinger</button>
      </div>

      <div class="sheet-overlay" id="project-action-overlay">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-body" id="project-action-body"></div>
        </div>
      </div>
    </div>
  `
}

// ─── LIST ───────────────────────────────────────────────────

function renderList(el, projects) {
  if (projects.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:60px 0;">
        <div class="empty-title">Ingen projekter</div>
        <div class="empty-body">Opret et projekt for at komme i gang.</div>
      </div>
    `
    return
  }

  const active    = projects.filter(p => p.status === 'active')
  const completed = projects.filter(p => p.status === 'completed')

  el.innerHTML = `
    <div class="list-content" style="padding:14px 14px 0;">
      ${active.length > 0 && completed.length > 0
        ? `<div class="projects-section-label">Aktive</div>`
        : ''}
      ${active.map(p => projectCard(p)).join('')}
      ${completed.length > 0 ? `
        <button class="projects-completed-toggle" id="btn-toggle-completed">
          <span class="projects-toggle-icon">${_completedVisible ? iconChevronDown() : iconChevronRight()}</span>
          Vis færdige (${completed.length})
        </button>
        <div id="completed-list" style="display:${_completedVisible ? 'flex' : 'none'}; flex-direction:column; gap:8px; margin-top:2px;">
          ${completed.map(p => projectCardDone(p)).join('')}
        </div>
      ` : ''}
      <div class="safe-bottom"></div>
    </div>
  `

  // Card clicks — navigate (suppressed if long press just fired)
  el.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      if (_didLongPress) { _didLongPress = false; return }
      window.navigate('project-view', { projectId: card.dataset.id })
    })
  })

  // Long press on active cards only
  el.querySelectorAll('.project-card[data-active="1"]').forEach(card => {
    attachLongPress(card)
  })

  // Toggle completed section
  el.querySelector('#btn-toggle-completed')?.addEventListener('click', () => {
    _completedVisible = !_completedVisible
    renderList(el, _projects)
  })
}

function projectCard(p) {
  const dateRange = dateRangeStr(p)
  return `
    <div class="project-card" data-id="${escapeAttr(p.id)}" data-active="1">
      <div class="project-card-inner">
        <div class="project-card-addr">${escapeHtml(p.address || 'Ukendt adresse')}</div>
        ${p.description ? `<div class="project-card-desc">${escapeHtml(p.description)}</div>` : ''}
        ${dateRange ? `<div class="project-card-dates">${escapeHtml(dateRange)}</div>` : ''}
      </div>
      <div class="project-card-chevron">${iconChevron()}</div>
    </div>
  `
}

function projectCardDone(p) {
  const dateRange = dateRangeStr(p)
  return `
    <div class="project-card project-card--done" data-id="${escapeAttr(p.id)}">
      <div class="project-card-inner">
        <div class="project-card-addr project-card-addr--done">${escapeHtml(p.address || 'Ukendt adresse')}</div>
        ${p.description ? `<div class="project-card-desc">${escapeHtml(p.description)}</div>` : ''}
        ${dateRange ? `<div class="project-card-dates">${escapeHtml(dateRange)}</div>` : ''}
      </div>
      <span class="project-done-badge-sm">FÆRDIG</span>
    </div>
  `
}

function dateRangeStr(p) {
  if (!p.startDate && !p.endDate) return null
  return `${p.startDate ? formatDateShort(p.startDate) : '?'} – ${p.endDate ? formatDateShort(p.endDate) : '?'}`
}

// ─── LONG PRESS ─────────────────────────────────────────────

function attachLongPress(card) {
  let startX = 0, startY = 0

  card.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    clearTimeout(_longPressTimer)
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null
      _didLongPress = true
      const project = _projects.find(p => p.id === card.dataset.id)
      if (project) openActionSheet(project)
    }, 500)
  }, { passive: true })

  card.addEventListener('touchmove', e => {
    if (!_longPressTimer) return
    if (Math.abs(e.touches[0].clientX - startX) > 10 ||
        Math.abs(e.touches[0].clientY - startY) > 10) {
      clearTimeout(_longPressTimer)
      _longPressTimer = null
    }
  }, { passive: true })

  const cancel = () => { clearTimeout(_longPressTimer); _longPressTimer = null }
  card.addEventListener('touchend',    cancel, { passive: true })
  card.addEventListener('touchcancel', cancel, { passive: true })
  card.addEventListener('contextmenu', e => e.preventDefault())
}

// ─── ACTION SHEET ────────────────────────────────────────────

function openActionSheet(project) {
  const body = _container?.querySelector('#project-action-body')
  if (!body) return

  body.innerHTML = `
    <div class="action-sheet-addr">${escapeHtml(project.address || 'Ukendt adresse')}</div>
    <button class="action-sheet-item action-sheet-item--danger" id="btn-confirm-done">
      ${iconCheck()} Marker færdig
    </button>
  `

  body.querySelector('#btn-confirm-done').addEventListener('click', async () => {
    closeActionSheet()
    try {
      await updateProject(project.id, { status: 'completed' })
    } catch { /* subscription will not update on failure — acceptable */ }
  })

  _container?.querySelector('#project-action-overlay')?.classList.add('open')
}

function closeActionSheet() {
  _container?.querySelector('#project-action-overlay')?.classList.remove('open')
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

function iconPlus() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`
}

function iconChevron() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconChevronRight() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg>`
}

function iconChevronDown() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M6 9l6 6 6-6"/></svg>`
}

function iconCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><path d="M20 6L9 17l-5-5"/></svg>`
}
