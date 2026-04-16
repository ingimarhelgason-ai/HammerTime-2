import { getProject, subscribeToTasks, subscribeToLogs, updateTask, createTask, addTask, addLog, addReferencePhoto, removeReferencePhoto } from '../js/api.js'
import { formatDateShort, formatTimestamp, relativeDate } from '../js/utils.js'
import { getActive } from '../js/activeTask.js'
import { startVoiceInput } from '../js/voice.js' // used by diktat FAB only
import { interpretDiktat } from '../js/claude.js'

// ─── STATE ──────────────────────────────────────────────────

let _unsubTasks          = null
let _unsubLogs           = null
let _taskMap             = {}
let _logFilter           = null
let _allLogs             = []
let _tasks               = []
let _projectId           = null
let _project             = null
let _container           = null
let _stopVoice           = null
let _revokeRefPreviews   = null
let _origConsoleLog      = null
let _origConsoleError    = null

// ─── COLUMN DEFINITIONS ─────────────────────────────────────

const COLS = [
  { status: 'not started', label: 'Ikke startet' },
  { status: 'in progress', label: 'I gang'       },
  { status: 'done',        label: 'Færdig'        },
]

// ─── LIFECYCLE ──────────────────────────────────────────────

export async function render(container, params = {}) {
  const { projectId } = params
  if (!projectId) { window.navigate('home'); return }

  _projectId   = projectId
  _container   = container
  _logFilter   = null
  _allLogs     = []
  _tasks       = []
  _taskMap     = {}

  container.innerHTML = buildShell()

  // ── Temporary debug panel ──────────────────────────────────
  _origConsoleLog   = console.log
  _origConsoleError = console.error
  const _appendDebug = (level, args) => {
    const panel = _container?.querySelector('#debug-panel')
    const lines = _container?.querySelector('#debug-lines')
    if (!panel || !lines) return
    panel.style.display = 'flex'
    const el  = document.createElement('div')
    const ts  = new Date().toLocaleTimeString('en', { hour12: false })
    el.style.cssText = `color:${level === 'error' ? '#ff6b6b' : '#7fff7f'};padding:1px 0;border-bottom:1px solid #111;word-break:break-all;`
    el.textContent   = `${ts}  ${args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ')}`
    lines.appendChild(el)
    lines.scrollTop = lines.scrollHeight
  }
  console.log   = (...args) => { _origConsoleLog(...args);   _appendDebug('log',   args) }
  console.error = (...args) => { _origConsoleError(...args); _appendDebug('error', args) }
  container.querySelector('#debug-clear').addEventListener('click', () => {
    const lines = container.querySelector('#debug-lines')
    if (lines) lines.innerHTML = ''
  })
  container.querySelector('#debug-close').addEventListener('click', () => {
    const panel = container.querySelector('#debug-panel')
    if (panel) panel.style.display = 'none'
  })
  // ──────────────────────────────────────────────────────────

  // Back
  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))

  // Feed sheet
  container.querySelector('#btn-feed-open').addEventListener('click', () => openFeedSheet())
  container.querySelector('#btn-feed-close').addEventListener('click', () => closeFeedSheet())
  container.querySelector('#feed-overlay').addEventListener('click', e => {
    if (e.target.id === 'feed-overlay') closeFeedSheet()
  })

  // Task sheet (create / edit)
  container.querySelector('#btn-task-edit-close').addEventListener('click', () => closeTaskSheet())
  container.querySelector('#task-edit-overlay').addEventListener('click', e => {
    if (e.target.id === 'task-edit-overlay') closeTaskSheet()
  })

  // Move sheet
  container.querySelector('#btn-move-close').addEventListener('click', () => closeMoveSheet())
  container.querySelector('#move-overlay').addEventListener('click', e => {
    if (e.target.id === 'move-overlay') closeMoveSheet()
  })

  // Diktat sheet
  container.querySelector('#btn-diktat-close').addEventListener('click', () => closeDiktatSheet())
  container.querySelector('#diktat-overlay').addEventListener('click', e => {
    if (e.target.id === 'diktat-overlay') closeDiktatSheet()
  })

  // Diktat FAB — hold to record
  const fab = container.querySelector('#fab-diktat')
  if (fab) {
    let _diktatPending = false

    const setIdle = () => {
      _diktatPending = false
      fab.innerHTML = `<span class="fab-diktat-icon">🎤</span><span>Diktat</span>`
      fab.style.background = ''
      fab.style.color = ''
      fab.style.pointerEvents = ''
      fab.style.transform = ''
    }

    const setRecording = () => {
      fab.innerHTML = `<span class="fab-diktat-icon">🎤</span><span>Optager…</span>`
      fab.style.background = 'var(--danger)'
      fab.style.color = '#fff'
    }

    const setProcessing = () => {
      _diktatPending = true
      fab.innerHTML = `<span class="spinner fab-diktat-spinner"></span><span>Analyserer…</span>`
      fab.style.background = 'var(--surface3)'
      fab.style.color = 'var(--text2)'
      fab.style.pointerEvents = 'none'
    }

    let _isRecording = false

    fab.addEventListener('click', () => {
      if (_diktatPending) return

      if (_isRecording) {
        // Second tap — stop and trigger analysis
        _stopVoice?.(); _stopVoice = null
        return
      }

      // First tap — start recording
      _isRecording = true
      setRecording()

      const lang = localStorage.getItem('voiceLang') || 'da-DK'
      const voice = startVoiceInput({
        lang,
        onStart: () => {},
        onEnd: () => {
          _isRecording = false
          if (!_diktatPending) setIdle()
        },
        onResult: async transcript => {
          const words = transcript.trim().split(/\s+/).filter(Boolean)
          if (words.length < 5) {
            showToast('Prøv igen — sig mere', true)
            setIdle()
            return
          }
          setProcessing()
          try {
            const actions = await interpretDiktat({
              transcript,
              tasks: _tasks,
              projectAddress: _project?.address || ''
            })
            setIdle()
            if (!actions || actions.length === 0) {
              showToast('Intet at tilføje — prøv igen', true)
            } else {
              openDiktatSheet(actions)
            }
          } catch (err) {
            console.error('[diktat] interpretDiktat threw in onResult:', err)
            setIdle()
            showToast('Analyse fejlede — prøv igen', true)
          }
        },
        onError: code => {
          setIdle()
          if (code === 'not-supported') showToast('Stemmeindtastning ikke understøttet i denne browser', true)
          else showToast('Kunne ikke optage — prøv igen', true)
        },
      })
      _stopVoice = voice.stop
    })
  }

  try {
    _project = await getProject(projectId)
  } catch (err) {
    showError(err.message)
    return
  }
  if (!_project) { showError('Projekt ikke fundet.'); return }

  renderHeader()

  _unsubTasks = subscribeToTasks(projectId, tasks => {
    _tasks   = tasks
    _taskMap = Object.fromEntries(tasks.map(t => [t.id, t.name || 'Unavngivet']))
    renderKanban()
  })

  _unsubLogs = subscribeToLogs(projectId, logs => {
    _allLogs = logs
    // Re-render feed if sheet is open
    if (_container?.querySelector('#feed-overlay')?.classList.contains('open')) {
      renderFeedInSheet()
    }
  })
}

export function destroy() {
  if (_unsubTasks) { _unsubTasks(); _unsubTasks = null }
  if (_unsubLogs)  { _unsubLogs();  _unsubLogs  = null }
  _stopVoice?.(); _stopVoice = null
  _revokeRefPreviews?.(); _revokeRefPreviews = null
  if (_origConsoleLog)   { console.log   = _origConsoleLog;   _origConsoleLog   = null }
  if (_origConsoleError) { console.error = _origConsoleError; _origConsoleError = null }
  _taskMap = {}; _logFilter = null; _allLogs = []; _tasks = []
  _projectId = null; _project = null; _container = null
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
        <div class="top-bar-actions">
          <button class="btn-icon" id="btn-feed-open" aria-label="Vis log" title="Log">
            ${iconClock()}
          </button>
        </div>
      </div>

      <div id="project-header"></div>

      <div class="kanban-outer" id="kanban-outer">
        <div class="kanban-board" id="kanban-board"></div>
      </div>

      <div id="toast-area"></div>

      <!-- Task sheet (create / edit) -->
      <div class="sheet-overlay" id="task-edit-overlay">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title"></span>
            <button class="btn-icon sheet-close" id="btn-task-edit-close">${iconClose()}</button>
          </div>
          <div class="sheet-body" id="task-edit-body"></div>
        </div>
      </div>

      <!-- Move sheet -->
      <div class="sheet-overlay" id="move-overlay">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title">Flyt opgave til…</span>
            <button class="btn-icon sheet-close" id="btn-move-close">${iconClose()}</button>
          </div>
          <div class="sheet-body" id="move-body"></div>
        </div>
      </div>

      <!-- Feed sheet -->
      <div class="sheet-overlay" id="feed-overlay">
        <div class="sheet sheet-tall">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title">Log</span>
            <button class="btn-icon sheet-close" id="btn-feed-close">${iconClose()}</button>
          </div>
          <div class="sheet-body" id="feed-body"></div>
        </div>
      </div>

      <!-- Diktat review sheet -->
      <div class="sheet-overlay" id="diktat-overlay">
        <div class="sheet sheet-tall">
          <div class="sheet-handle"></div>
          <div class="sheet-header">
            <span class="sheet-title">Diktat — gennemse</span>
            <button class="btn-icon sheet-close" id="btn-diktat-close">${iconClose()}</button>
          </div>
          <div class="sheet-body" id="diktat-body"></div>
        </div>
      </div>

      <!-- Diktat FAB -->
      <button class="fab-diktat" id="fab-diktat" aria-label="Diktat">
        <span class="fab-diktat-icon">🎤</span>
        <span>Diktat</span>
      </button>

      <!-- Temporary debug panel -->
      <div id="debug-panel" style="display:none;position:fixed;top:0;left:0;right:0;z-index:300;background:#0a0a0a;border-bottom:1px solid #2a2a2a;flex-direction:column;max-height:45vh;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #1a1a1a;flex-shrink:0;">
          <span style="font-family:monospace;font-size:10px;color:#555;letter-spacing:0.05em;">DEBUG LOG</span>
          <div style="display:flex;gap:10px;">
            <button id="debug-clear" style="font-family:monospace;font-size:10px;color:#888;background:none;border:none;cursor:pointer;padding:2px 6px;">Clear</button>
            <button id="debug-close" style="font-family:monospace;font-size:10px;color:#888;background:none;border:none;cursor:pointer;padding:2px 6px;">✕</button>
          </div>
        </div>
        <div id="debug-lines" style="overflow-y:auto;padding:6px 10px;font-family:monospace;font-size:11px;line-height:1.5;"></div>
      </div>
    </div>
  `
}

// ─── HEADER ─────────────────────────────────────────────────

function renderHeader() {
  const el = _container?.querySelector('#project-header')
  if (!el) return
  const dateStr    = buildDateStr(_project)
  const isCompleted = _project.status === 'completed'

  el.innerHTML = `
    <div class="project-header">
      <div class="project-header-address">${escapeHtml(_project.address || 'Ukendt adresse')}</div>
      ${_project.description ? `<div class="project-header-desc">${escapeHtml(_project.description)}</div>` : ''}
      ${dateStr ? `<div class="project-header-dates">${dateStr}</div>` : ''}
      ${isCompleted ? `<span class="project-done-badge">FÆRDIG</span>` : ''}
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

// ─── KANBAN ──────────────────────────────────────────────────

function renderKanban() {
  const board = _container?.querySelector('#kanban-board')
  if (!board) return

  const active = getActive()

  board.innerHTML = COLS.map(col => {
    const colTasks = _tasks.filter(t => t.status === col.status)
    return buildColHtml(col, colTasks, active)
  }).join('')

  // Add task button → open task sheet (create mode)
  board.querySelectorAll('.kanban-add-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskSheet(null, btn.dataset.colStatus))
  })

  // Edit button → task sheet (edit mode) — stopPropagation prevents move sheet
  board.querySelectorAll('.kanban-card-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const task = _tasks.find(t => t.id === btn.dataset.taskId)
      if (task) openTaskSheet(task, null)
    })
  })

  // Card tap → move sheet
  board.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const task = _tasks.find(t => t.id === card.dataset.taskId)
      if (task) openMoveSheet(task)
    })
  })
}

function buildColHtml(col, colTasks, active) {
  return `
    <div class="kanban-col" data-status="${escapeAttr(col.status)}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${escapeHtml(col.label)}</span>
        <span class="kanban-col-count">${colTasks.length}</span>
      </div>
      <div class="kanban-col-body">
        ${colTasks.map(t => buildKanbanCard(t, active)).join('')}
      </div>
      <div class="kanban-col-footer">
        <button class="kanban-add-btn" data-col-status="${escapeAttr(col.status)}">${iconPlus()} Tilføj</button>
      </div>
    </div>
  `
}

function buildKanbanCard(task, active) {
  const isActive   = active && active.taskId === task.id
  const desc       = task.description || ''
  const photoCount = (task.referencePhotos || []).length

  return `
    <div class="kanban-card${isActive ? ' active-task' : ''}"
         data-task-id="${escapeAttr(task.id)}">
      <div class="kanban-card-content">
        <div class="kanban-card-name">${escapeHtml(task.name || 'Unavngivet')}</div>
        ${desc ? `<div class="kanban-card-desc">${escapeHtml(desc)}</div>` : ''}
        ${photoCount > 0 ? `<div class="kanban-card-photo-badge">${iconCameraSmall()} ${photoCount} ${photoCount === 1 ? 'billede' : 'billeder'}</div>` : ''}
      </div>
      <button class="kanban-card-edit" data-task-id="${escapeAttr(task.id)}" aria-label="Rediger">
        ${iconPencil()}
      </button>
    </div>
  `
}

// ─── MOVE SHEET ──────────────────────────────────────────────

function openMoveSheet(task) {
  const overlay = _container?.querySelector('#move-overlay')
  const body    = _container?.querySelector('#move-body')
  if (!overlay) return

  body.innerHTML = COLS.map(col => `
    <div class="move-option${task.status === col.status ? ' current' : ''}"
         data-status="${escapeAttr(col.status)}">
      <span class="move-option-label">${escapeHtml(col.label)}</span>
      ${task.status === col.status ? `<span class="move-option-check">${iconCheck()}</span>` : ''}
    </div>
  `).join('')

  overlay.classList.add('open')

  body.querySelectorAll('.move-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const newStatus = opt.dataset.status
      closeMoveSheet()
      if (newStatus === task.status) return
      try {
        await updateTask(task.id, { status: newStatus })
        const active = getActive()
        if (active?.taskId === task.id && newStatus === 'done') {
          showNextTaskNotice()
        }
      } catch {
        showToast('Fejl ved flytning', true)
      }
    })
  })
}

function closeMoveSheet() {
  _container?.querySelector('#move-overlay')?.classList.remove('open')
}

// ─── NEXT TASK NOTICE ────────────────────────────────────────

function showNextTaskNotice() {
  _container?.querySelector('.next-task-notice')?.remove()
  const notice = document.createElement('div')
  notice.className = 'next-task-notice'
  notice.innerHTML = `
    <span>Vælg næste opgave?</span>
    <button class="next-task-dismiss" aria-label="Luk">×</button>
  `
  notice.querySelector('.next-task-dismiss').addEventListener('click', () => notice.remove())
  _container?.querySelector('#kanban-outer')?.insertAdjacentElement('beforebegin', notice)
}

// ─── TASK SHEET (unified create / edit) ─────────────────────

function buildRefThumb(url) {
  return `
    <div class="ref-thumb-wrap">
      <img src="${escapeAttr(url)}" class="task-sheet-ref-thumb" alt="">
      <button class="ref-del-btn" data-url="${escapeAttr(url)}" aria-label="Slet">×</button>
    </div>
  `
}

function buildRefThumbPreview(blobUrl) {
  return `
    <div class="ref-thumb-wrap">
      <img src="${escapeAttr(blobUrl)}" class="task-sheet-ref-thumb" alt="">
    </div>
  `
}

function openTaskSheet(task, colStatus) {
  const isCreate = task === null
  const overlay  = _container?.querySelector('#task-edit-overlay')
  const body     = _container?.querySelector('#task-edit-body')
  const titleEl  = overlay?.querySelector('.sheet-title')
  if (!overlay || !body) return

  if (titleEl) titleEl.textContent = isCreate ? 'Ny opgave' : 'Rediger opgave'

  const existingPhotos = task?.referencePhotos || []

  body.innerHTML = `
    <div class="task-sheet-form">
      <input id="task-sheet-name" class="task-sheet-name-input"
             type="text" placeholder="Hvad skal laves?"
             value="${escapeAttr(task?.name || '')}"
             maxlength="200" autocomplete="off">
      <div class="task-sheet-label">INSTRUKTIONER</div>
      <textarea id="task-sheet-desc" class="task-sheet-desc-textarea"
                placeholder="Instruktioner, mål, materialer…">${escapeHtml(task?.description || '')}</textarea>
      <div class="task-sheet-label">REFERENCE BILLEDER</div>
      <div id="ref-photo-strip" class="task-sheet-ref-strip">
        ${existingPhotos.map(url => buildRefThumb(url)).join('')}
        <button id="btn-add-ref-photo" class="task-sheet-add-photo" type="button">
          ${iconCameraSmall()}
          <span>Tilføj</span>
        </button>
      </div>
      <input type="file" id="ref-photo-input" accept="image/*" multiple style="display:none;">
      <button id="task-sheet-save" class="task-sheet-save-btn">Gem opgave</button>
    </div>
  `

  overlay.classList.add('open')

  const nameInput = body.querySelector('#task-sheet-name')
  const descInput = body.querySelector('#task-sheet-desc')
  const saveBtn   = body.querySelector('#task-sheet-save')
  const strip     = body.querySelector('#ref-photo-strip')
  const addBtn    = body.querySelector('#btn-add-ref-photo')
  const fileInput = body.querySelector('#ref-photo-input')

  if (isCreate) {
    // ── Create mode: stage files, upload after task is created ──
    const pendingFiles = []
    const blobUrls     = []
    _revokeRefPreviews = () => { blobUrls.forEach(u => URL.revokeObjectURL(u)); blobUrls.length = 0 }

    addBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files)
      if (!files.length) return
      fileInput.value = ''
      for (const file of files) {
        pendingFiles.push(file)
        const url = URL.createObjectURL(file)
        blobUrls.push(url)
        const wrap = document.createElement('div')
        wrap.innerHTML = buildRefThumbPreview(url)
        strip.insertBefore(wrap.firstElementChild, addBtn)
      }
    })

    const doSave = async () => {
      const name = nameInput.value.trim()
      const desc = descInput.value.trim()
      if (!name) { nameInput.focus(); nameInput.style.borderColor = 'var(--danger)'; return }
      saveBtn.disabled = true; saveBtn.textContent = '…'
      try {
        const taskId = await createTask(_projectId, name)
        const updates = {}
        if (desc) updates.description = desc
        if (colStatus && colStatus !== 'not started') updates.status = colStatus
        if (Object.keys(updates).length > 0) await updateTask(taskId, updates)
        if (pendingFiles.length > 0) {
          await Promise.all(pendingFiles.map(f => addReferencePhoto(taskId, f)))
        }
        closeTaskSheet()
      } catch {
        showToast('Fejl ved oprettelse', true)
        saveBtn.disabled = false; saveBtn.textContent = 'Gem opgave'
      }
    }

    saveBtn.addEventListener('click', doSave)
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSave()
      if (e.key === 'Escape') closeTaskSheet()
    })

  } else {
    // ── Edit mode: photo changes are immediate ────────────────
    _revokeRefPreviews = null

    strip.addEventListener('click', async e => {
      const delBtn = e.target.closest('.ref-del-btn')
      if (!delBtn) return
      const url = delBtn.dataset.url
      try {
        await removeReferencePhoto(task.id, url)
        delBtn.closest('.ref-thumb-wrap')?.remove()
      } catch {
        showToast('Kunne ikke slette billede', true)
      }
    })

    addBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files)
      if (!files.length) return
      fileInput.value = ''
      const origHtml = addBtn.innerHTML
      addBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>`
      addBtn.disabled = true
      try {
        const urls = await Promise.all(files.map(f => addReferencePhoto(task.id, f)))
        for (const url of urls) {
          const wrap = document.createElement('div')
          wrap.innerHTML = buildRefThumb(url)
          strip.insertBefore(wrap.firstElementChild, addBtn)
        }
      } catch {
        showToast('Nogle billeder kunne ikke uploades — prøv igen', true)
      } finally {
        addBtn.innerHTML = origHtml
        addBtn.disabled = false
      }
    })

    const doSave = async () => {
      const name = nameInput.value.trim()
      const desc = descInput.value.trim()
      if (!name) { nameInput.focus(); nameInput.style.borderColor = 'var(--danger)'; return }
      saveBtn.disabled = true; saveBtn.textContent = '…'
      try {
        await updateTask(task.id, { name, description: desc || null })
        closeTaskSheet()
      } catch {
        showToast('Fejl ved gem', true)
        saveBtn.disabled = false; saveBtn.textContent = 'Gem opgave'
      }
    }

    saveBtn.addEventListener('click', doSave)
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSave()
      if (e.key === 'Escape') closeTaskSheet()
    })
  }

  setTimeout(() => nameInput?.focus(), 80)
}

function closeTaskSheet() {
  _revokeRefPreviews?.(); _revokeRefPreviews = null
  _container?.querySelector('#task-edit-overlay')?.classList.remove('open')
}

// ─── DIKTAT REVIEW SHEET ────────────────────────────────────

function openDiktatSheet(actions) {
  const overlay = _container?.querySelector('#diktat-overlay')
  const body    = _container?.querySelector('#diktat-body')
  if (!overlay || !body) return

  const checkAllDone = () => {
    if (body.querySelectorAll('.diktat-action-card').length === 0) {
      body.innerHTML = `<div class="diktat-all-done">Alt håndteret 👍</div>`
      setTimeout(() => closeDiktatSheet(), 1500)
    }
  }

  body.innerHTML = actions.map((action, i) => buildDiktatActionCard(action, i)).join('')

  body.querySelectorAll('.diktat-confirm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card  = btn.closest('.diktat-action-card')
      const index = parseInt(btn.dataset.index, 10)
      btn.disabled = true
      btn.textContent = '…'
      try {
        await executeAction(actions[index])
        card.remove()
        checkAllDone()
      } catch {
        showToast('Fejl — prøv igen', true)
        btn.disabled = false
        btn.textContent = '✓ Tilføj'
      }
    })
  })

  body.querySelectorAll('.diktat-dismiss').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.diktat-action-card').remove()
      checkAllDone()
    })
  })

  overlay.classList.add('open')
}

function closeDiktatSheet() {
  _container?.querySelector('#diktat-overlay')?.classList.remove('open')
}

function buildDiktatActionCard(action, i) {
  const btns = `
    <div class="diktat-action-btns">
      <button class="btn-primary diktat-confirm" data-index="${i}" style="flex:1;font-size:14px;padding:10px 0;">✓ Tilføj</button>
      <button class="btn-ghost  diktat-dismiss"  data-index="${i}" style="flex:1;font-size:14px;padding:10px 0;">✕ Afvis</button>
    </div>
  `
  switch (action.type) {
    case 'new_task':
      return `
        <div class="diktat-action-card" data-index="${i}">
          <div class="diktat-action-label" style="color:var(--accent)">NY OPGAVE</div>
          <div class="diktat-action-name">${escapeHtml(action.name || '')}</div>
          ${action.description ? `<div class="diktat-action-body">${escapeHtml(action.description)}</div>` : ''}
          ${action.estimatedHours ? `<div class="diktat-action-meta">${action.estimatedHours} timer</div>` : ''}
          ${btns}
        </div>`

    case 'task_note':
      return `
        <div class="diktat-action-card" data-index="${i}">
          <div class="diktat-action-label">NOTE</div>
          <div class="diktat-action-task">${escapeHtml(action.taskName || '')}</div>
          <div class="diktat-action-body">${escapeHtml(action.note || '')}</div>
          ${btns}
        </div>`

    case 'status_change': {
      const currentTask = _tasks.find(t => t.id === action.taskId)
      const oldLabel    = statusLabel(currentTask?.status || '')
      const newLabel    = statusLabel(action.newStatus)
      return `
        <div class="diktat-action-card" data-index="${i}">
          <div class="diktat-action-label">STATUSÆNDRING</div>
          <div class="diktat-action-name">${escapeHtml(action.taskName || '')}</div>
          <div class="diktat-action-body">${escapeHtml(oldLabel)} → ${escapeHtml(newLabel)}</div>
          ${btns}
        </div>`
    }

    case 'project_note':
      return `
        <div class="diktat-action-card" data-index="${i}">
          <div class="diktat-action-label">PROJEKTNOTAT</div>
          <div class="diktat-action-body">${escapeHtml(action.note || '')}</div>
          ${btns}
        </div>`

    default:
      return ''
  }
}

async function executeAction(action) {
  switch (action.type) {
    case 'new_task':
      await addTask({
        projectId:      _projectId,
        name:           action.name,
        description:    action.description    || null,
        estimatedHours: action.estimatedHours || null,
        status:         'not started'
      })
      break
    case 'task_note':
      await addLog({ projectId: _projectId, taskId: action.taskId, type: 'note', note: action.note, photoUrl: null, location: null })
      break
    case 'status_change':
      await updateTask(action.taskId, { status: action.newStatus })
      break
    case 'project_note':
      await addLog({ projectId: _projectId, taskId: null, type: 'note', note: action.note, photoUrl: null, location: null })
      break
  }
}

function statusLabel(status) {
  return { 'not started': 'Ikke startet', 'in progress': 'I gang', 'done': 'Færdig' }[status] || status
}

// ─── FEED SHEET ──────────────────────────────────────────────

function openFeedSheet() {
  _container?.querySelector('#feed-overlay')?.classList.add('open')
  renderFeedInSheet()
}

function closeFeedSheet() {
  _container?.querySelector('#feed-overlay')?.classList.remove('open')
}

function renderFeedInSheet() {
  const body = _container?.querySelector('#feed-body')
  if (!body) return

  if (_allLogs.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:32px;">
        <div class="empty-title">Ingen logs endnu</div>
        <div class="empty-body">Log et foto eller en note fra en opgave.</div>
      </div>
    `
    return
  }

  const taskIdsInLogs = [...new Set(_allLogs.map(l => l.taskId).filter(Boolean))]
  const showFilter    = taskIdsInLogs.length > 0

  body.innerHTML = `
    ${showFilter ? `
      <div class="log-filter-row" id="feed-filter-row">
        <button class="log-filter-pill${_logFilter === null ? ' active' : ''}" data-filter="">Alle</button>
        ${taskIdsInLogs.map(tid => {
          const name = _taskMap[tid] || 'Ukendt opgave'
          return `<button class="log-filter-pill${_logFilter === tid ? ' active' : ''}" data-filter="${escapeAttr(tid)}">${escapeHtml(name)}</button>`
        }).join('')}
      </div>
    ` : ''}
    <div id="feed-log-cards" style="display:flex;flex-direction:column;gap:10px;padding-bottom:24px;"></div>
  `

  if (showFilter) {
    body.querySelectorAll('.log-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        _logFilter = pill.dataset.filter || null
        body.querySelectorAll('.log-filter-pill').forEach(p => {
          p.classList.toggle('active', p.dataset.filter === pill.dataset.filter)
        })
        renderFilteredFeedLogs(body)
      })
    })
  }

  renderFilteredFeedLogs(body)
}

function renderFilteredFeedLogs(body) {
  const cards = body.querySelector('#feed-log-cards')
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

function showToast(message, isError = false) {
  const area = _container?.querySelector('#toast-area')
  if (!area) return
  const toast = document.createElement('div')
  toast.className = `toast${isError ? ' error' : ''}`
  toast.textContent = message
  area.innerHTML = ''
  area.appendChild(toast)
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')))
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300) }, 2500)
}

function showError(message) {
  const body = _container?.querySelector('.kanban-outer') || _container
  if (body) body.innerHTML = `
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

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>`
}

function iconPencil() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
    <path d="M17 3a2.828 2.828 0 014 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>`
}

function iconCameraSmall() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`
}

function iconPlus() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>`
}

function iconClock() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`
}

function iconCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>`
}

