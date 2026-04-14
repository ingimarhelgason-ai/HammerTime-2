import { subscribeToProjects } from '../js/api.js'
import { formatDateShort } from '../js/utils.js'

let _unsub = null

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container) {
  container.innerHTML = buildShell()

  container.querySelector('#btn-back').addEventListener('click', () => {
    window.navigate('home')
  })
  container.querySelector('#btn-new-project').addEventListener('click', () => {
    window.navigate('project-new')
  })
  container.querySelector('#btn-settings').addEventListener('click', () => {
    window.navigate('settings')
  })

  const listEl = container.querySelector('#projects-list')

  _unsub = subscribeToProjects(projects => {
    renderList(listEl, projects)
  })
}

export function destroy() {
  if (_unsub) { _unsub(); _unsub = null }
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
      ${active.length > 0 ? `
        <div class="projects-section-label">Aktive</div>
        ${active.map(projectCard).join('')}
      ` : ''}
      ${completed.length > 0 ? `
        <div class="projects-section-label" style="margin-top:8px;">Afsluttede</div>
        ${completed.map(projectCard).join('')}
      ` : ''}
      <div class="safe-bottom"></div>
    </div>
  `

  el.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      window.navigate('project-view', { projectId: card.dataset.id })
    })
  })
}

function projectCard(p) {
  const dateRange = p.startDate || p.endDate
    ? `${p.startDate ? formatDateShort(p.startDate) : '?'} – ${p.endDate ? formatDateShort(p.endDate) : '?'}`
    : null

  return `
    <div class="project-card" data-id="${escapeAttr(p.id)}">
      <div class="project-card-inner">
        <div class="project-card-addr">${escapeHtml(p.address || 'Ukendt adresse')}</div>
        ${p.description ? `<div class="project-card-desc">${escapeHtml(p.description)}</div>` : ''}
        ${dateRange ? `<div class="project-card-dates">${escapeHtml(dateRange)}</div>` : ''}
      </div>
      <div class="project-card-chevron">${iconChevron()}</div>
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

function iconBack() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`
}

function iconPlus() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`
}

function iconChevron() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>`
}
