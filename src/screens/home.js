import { subscribeToProjects } from '../js/api.js'
import { formatDayFull, formatDateShort, relativeDate } from '../js/utils.js'
import { getApiKey } from '../js/claude.js'

let _unsubscribe = null

export function render(container) {
  container.innerHTML = `
    <div class="screen" id="home-screen">
      <div class="top-bar">
        <div class="top-bar-title">
          <h1>Hammer Time</h1>
          <div class="subtitle" id="home-date">${formatDayFull()}</div>
        </div>
        <div class="top-bar-actions">
          <button class="btn-icon" id="btn-settings" title="Indstillinger" aria-label="Indstillinger">
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

      <div class="section-header">
        <span class="section-title">Aktive projekter</span>
        <span class="section-count" id="projects-count"></span>
      </div>

      <div class="screen-body">
        <div class="list-content" id="projects-list">
          <div class="empty-state" id="loading-state">
            <div class="spinner"></div>
          </div>
        </div>
        <div class="safe-bottom"></div>
      </div>

      <div class="fab-area">
        <button class="btn-primary" id="btn-new-project">
          ${iconPlus()}
          Nyt projekt
        </button>
      </div>
    </div>
  `

  // Event handlers
  container.querySelector('#btn-new-project').addEventListener('click', () => {
    window.navigate('project-new')
  })

  container.querySelector('#btn-settings').addEventListener('click', () => {
    window.navigate('settings')
  })

  const banner = container.querySelector('#api-key-banner')
  if (banner) {
    banner.addEventListener('click', () => window.navigate('settings'))
  }

  // Real-time project subscription
  _unsubscribe = subscribeToProjects(projects => {
    renderProjectList(container, projects)
  })
}

export function destroy() {
  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }
}

// ─── HELPERS ────────────────────────────────────────────────

function renderProjectList(container, projects) {
  const list = container.querySelector('#projects-list')
  const countEl = container.querySelector('#projects-count')
  if (!list) return

  const active = projects.filter(p => p.status === 'active')
  const completed = projects.filter(p => p.status === 'completed')

  if (countEl) countEl.textContent = active.length > 0 ? `${active.length}` : ''

  if (projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <div class="empty-title">Ingen projekter endnu</div>
        <div class="empty-body">Tryk på "Nyt projekt" for at oprette dit første projekt ved at uploade en arbejdsseddel.</div>
      </div>
    `
    return
  }

  let html = ''

  if (active.length > 0) {
    html += active.map(p => projectCard(p)).join('')
  }

  if (completed.length > 0) {
    if (active.length > 0) html += '<div class="divider" style="margin: 12px 0;"></div>'
    html += `
      <div style="font-size:11px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:var(--text3); font-family:var(--mono); padding: 4px 2px 8px;">
        Afsluttede projekter
      </div>
    `
    html += completed.map(p => projectCard(p)).join('')
  }

  list.innerHTML = html

  // Attach click handlers
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
    <div class="project-card" data-id="${project.id}">
      <div class="project-card-top">
        <div class="project-address">${escapeHtml(project.address || 'Ukendt adresse')}</div>
        ${statusBadge}
      </div>
      ${project.description ? `<div class="project-desc">${escapeHtml(project.description)}</div>` : ''}
      <div class="project-meta">
        ${dateStr ? `
          <div class="project-meta-item">
            ${iconCalendar()}
            <span>${dateStr}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
