import { parseArbejtsseddel, getApiKey } from '../js/claude.js'
import { createProject, createTasks } from '../js/api.js'
import { fileToBase64 } from '../js/utils.js'

// ─── STATE ──────────────────────────────────────────────────

let state = {
  phase: 'upload',   // 'upload' | 'processing' | 'review' | 'saving'
  projectData: null,
  pdfFile: null
}

// ─── RENDER ─────────────────────────────────────────────────

export function render(container) {
  state = { phase: 'upload', projectData: null, pdfFile: null }
  container.innerHTML = buildShell()
  attachShellHandlers(container)
  renderPhase(container)
}

export function destroy() {
  state = { phase: 'upload', projectData: null, pdfFile: null }
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="new-project-screen">
      <div class="top-bar">
        <button class="btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1 style="color: var(--text); font-size:17px;">Nyt projekt</h1>
        </div>
      </div>
      <div class="screen-body">
        <div id="phase-container" style="padding: 18px 18px 0;"></div>
        <div class="safe-bottom"></div>
      </div>
    </div>
  `
}

function attachShellHandlers(container) {
  container.querySelector('#btn-back').addEventListener('click', () => {
    window.navigate('home')
  })
}

// ─── PHASE ROUTER ───────────────────────────────────────────

function renderPhase(container) {
  const el = container.querySelector('#phase-container')
  if (!el) return

  if (state.phase === 'upload') {
    el.innerHTML = buildUploadPhase()
    attachUploadHandlers(container, el)

  } else if (state.phase === 'processing') {
    el.innerHTML = buildProcessingPhase()

  } else if (state.phase === 'review') {
    el.innerHTML = buildReviewPhase(state.projectData)
    attachReviewHandlers(container, el)

  } else if (state.phase === 'saving') {
    el.innerHTML = buildSavingPhase()
  }
}

// ─── UPLOAD PHASE ───────────────────────────────────────────

function buildUploadPhase() {
  const hasKey = !!getApiKey()

  return `
    <div id="upload-phase">
      ${!hasKey ? `
        <div style="
          padding: 12px 14px;
          background: var(--danger-dim);
          border: 0.5px solid rgba(208,68,68,0.3);
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--danger);
          margin-bottom: 16px;
        ">
          Anthropic API-nøgle mangler — <span style="text-decoration:underline; cursor:pointer;" id="link-settings">gå til Indstillinger</span>
        </div>
      ` : ''}

      <div class="upload-zone" id="upload-zone" role="button" tabindex="0" aria-label="Upload arbejdsseddel PDF">
        ${iconUpload()}
        <div>
          <div class="upload-title">Upload arbejdsseddel</div>
          <div class="upload-sub">PDF fra e-conomic</div>
        </div>
        <div style="font-size:12px; color:var(--text3);">Tryk eller træk fil hertil</div>
      </div>
      <input type="file" id="pdf-input" accept="application/pdf" style="display:none" aria-hidden="true">

      <div style="margin-top: 24px; display:flex; align-items:center; gap:12px;">
        <div style="flex:1; height:0.5px; background:var(--border);"></div>
        <span style="font-size:11px; color:var(--text3); font-family:var(--mono);">eller opret manuelt</span>
        <div style="flex:1; height:0.5px; background:var(--border);"></div>
      </div>

      <div style="margin-top: 16px;">
        <button class="btn-ghost" id="btn-manual" style="width:100%;">
          Opret projekt uden PDF
        </button>
      </div>
    </div>
  `
}

function attachUploadHandlers(container, el) {
  const zone = el.querySelector('#upload-zone')
  const input = el.querySelector('#pdf-input')

  zone.addEventListener('click', () => input.click())
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click() })

  // Drag & drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    const file = e.dataTransfer.files?.[0]
    if (file) handlePdfFile(container, file)
  })

  input.addEventListener('change', () => {
    if (input.files?.[0]) handlePdfFile(container, input.files[0])
  })

  el.querySelector('#btn-manual')?.addEventListener('click', () => {
    state.projectData = blankProjectData()
    state.phase = 'review'
    renderPhase(container)
  })

  el.querySelector('#link-settings')?.addEventListener('click', () => {
    window.navigate('settings')
  })
}

async function handlePdfFile(container, file) {
  if (file.type !== 'application/pdf') {
    showToast(container, 'Vælg en PDF-fil', true)
    return
  }

  state.pdfFile = file
  state.phase = 'processing'
  renderPhase(container)

  try {
    const base64 = await fileToBase64(file)
    const data = await parseArbejtsseddel(base64)

    // Normalise tasks array
    data.tasks = (data.tasks || []).filter(t => t?.name?.trim())

    state.projectData = data
    state.phase = 'review'
    renderPhase(container)
  } catch (err) {
    console.error('PDF parse error:', err)
    state.phase = 'upload'
    renderPhase(container)
    showToast(container, err.message || 'Kunne ikke læse PDF', true)
  }
}

// ─── PROCESSING PHASE ───────────────────────────────────────

function buildProcessingPhase() {
  return `
    <div class="processing-state" style="min-height:260px;">
      <div class="spinner"></div>
      <div class="processing-label">Læser arbejdsseddel…</div>
      <div class="processing-sub">Claude analyserer PDF'en</div>
    </div>
  `
}

// ─── REVIEW PHASE ───────────────────────────────────────────

function buildReviewPhase(data) {
  const tasks = data?.tasks || []

  return `
    <div id="review-phase">
      <div class="list-content-padded" style="padding: 0;">

        ${data?.address !== undefined ? `
          <div style="
            padding: 10px 12px;
            background: var(--green-dim);
            border: 0.5px solid rgba(58,158,106,0.25);
            border-radius: var(--radius-sm);
            font-size: 12px;
            color: var(--green);
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            ${iconCheck()}
            <span>Arbejdsseddel læst — tjek oplysningerne nedenfor</span>
          </div>
        ` : ''}

        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label" for="field-address">Adresse *</label>
          <input class="form-input" id="field-address" type="text"
            placeholder="Nordbyvej 13, 4000 Roskilde"
            value="${escapeAttr(data?.address || '')}"
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="field-desc">Beskrivelse</label>
          <textarea class="form-textarea" id="field-desc"
            placeholder="Kort beskrivelse af arbejdet…"
            rows="3"
          >${escapeHtml(data?.description || '')}</textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="field-start">Startdato</label>
            <input class="form-input" id="field-start" type="date"
              value="${escapeAttr(data?.startDate || '')}">
          </div>
          <div class="form-group">
            <label class="form-label" for="field-end">Slutdato</label>
            <input class="form-input" id="field-end" type="date"
              value="${escapeAttr(data?.endDate || '')}">
          </div>
        </div>

        <div>
          <div class="tasks-header">
            <span class="tasks-label">Opgaver</span>
            <span class="tasks-count" id="tasks-count">${tasks.length}</span>
          </div>
          <div class="task-editor-list" id="task-list">
            ${tasks.map((t, i) => buildTaskRow(t, i)).join('')}
          </div>
          <button class="btn-add-task" id="btn-add-task" style="margin-top:8px;">
            ${iconPlus()}
            Tilføj opgave
          </button>
        </div>

        <button class="btn-primary" id="btn-confirm" style="margin-top: 8px;">
          ${iconSave()}
          Opret projekt
        </button>

      </div>
    </div>
  `
}

function buildTaskRow(task, index) {
  return `
    <div class="task-editor-item" data-index="${index}">
      <input
        class="task-name-input"
        type="text"
        placeholder="Opgavenavn…"
        value="${escapeAttr(task.name || '')}"
        aria-label="Opgave navn"
      >
      <input
        class="task-hours-input"
        type="number"
        min="0"
        step="0.5"
        placeholder="—t"
        value="${task.estimatedHours != null ? task.estimatedHours : ''}"
        aria-label="Estimerede timer"
        title="Estimerede timer"
      >
      <button class="task-remove-btn" aria-label="Fjern opgave">
        ${iconX()}
      </button>
    </div>
  `
}

function attachReviewHandlers(container, el) {
  // Add task
  el.querySelector('#btn-add-task').addEventListener('click', () => {
    if (!state.projectData) state.projectData = blankProjectData()
    state.projectData.tasks.push({ name: '', estimatedHours: null })
    rerenderTaskList(el)
    // Focus the new input
    const items = el.querySelectorAll('.task-editor-item')
    items[items.length - 1]?.querySelector('.task-name-input')?.focus()
  })

  // Delegate remove buttons
  el.querySelector('#task-list').addEventListener('click', e => {
    const btn = e.target.closest('.task-remove-btn')
    if (!btn) return
    const item = btn.closest('.task-editor-item')
    const index = Number(item.dataset.index)
    state.projectData.tasks.splice(index, 1)
    rerenderTaskList(el)
  })

  // Confirm
  el.querySelector('#btn-confirm').addEventListener('click', () => {
    handleConfirm(container, el)
  })
}

function rerenderTaskList(el) {
  const list = el.querySelector('#task-list')
  const count = el.querySelector('#tasks-count')
  if (!list || !state.projectData) return
  list.innerHTML = state.projectData.tasks.map((t, i) => buildTaskRow(t, i)).join('')
  if (count) count.textContent = state.projectData.tasks.length
}

async function handleConfirm(container, el) {
  // Collect current form values
  const address = el.querySelector('#field-address')?.value.trim()
  const description = el.querySelector('#field-desc')?.value.trim()
  const startDate = el.querySelector('#field-start')?.value || null
  const endDate = el.querySelector('#field-end')?.value || null

  if (!address) {
    showToast(container, 'Adresse er påkrævet', true)
    el.querySelector('#field-address')?.focus()
    return
  }

  // Collect tasks from live DOM inputs
  const taskItems = el.querySelectorAll('.task-editor-item')
  const tasks = Array.from(taskItems).map(item => {
    const name = item.querySelector('.task-name-input')?.value.trim() || ''
    const hoursRaw = item.querySelector('.task-hours-input')?.value
    const estimatedHours = hoursRaw !== '' && hoursRaw != null ? Number(hoursRaw) : null
    return { name, estimatedHours }
  }).filter(t => t.name)

  state.phase = 'saving'
  renderPhase(container)

  try {
    const projectId = await createProject({ address, description, startDate, endDate })
    if (tasks.length > 0) await createTasks(projectId, tasks)

    // Navigate to the new project
    window.navigate('project-view', { projectId })
  } catch (err) {
    console.error('Create project error:', err)
    state.projectData = { address, description, startDate, endDate, tasks }
    state.phase = 'review'
    renderPhase(container)
    showToast(container, err.message || 'Kunne ikke oprette projekt', true)
  }
}

// ─── SAVING PHASE ───────────────────────────────────────────

function buildSavingPhase() {
  return `
    <div class="processing-state" style="min-height:260px;">
      <div class="spinner"></div>
      <div class="processing-label">Opretter projekt…</div>
    </div>
  `
}

// ─── HELPERS ────────────────────────────────────────────────

function blankProjectData() {
  return { address: '', description: '', startDate: null, endDate: null, tasks: [] }
}

function showToast(container, message, isError = false) {
  let toast = document.getElementById('ht-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'ht-toast'
    toast.className = 'toast'
    document.getElementById('app').appendChild(toast)
  }
  toast.textContent = message
  toast.className = `toast${isError ? ' error' : ''}`
  // Force reflow
  void toast.offsetWidth
  toast.classList.add('show')
  clearTimeout(toast._timeout)
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000)
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;')
}

// ─── ICONS ──────────────────────────────────────────────────

function iconBack() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`
}

function iconUpload() {
  return `<svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>`
}

function iconPlus() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>`
}

function iconX() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}

function iconSave() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`
}

function iconCheck() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`
}
