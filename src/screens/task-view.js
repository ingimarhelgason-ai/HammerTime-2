import { getTask, getProject, updateTask, subscribeToTasks, subscribeToTaskLogs } from '../js/api.js'
import { formatTimestamp, relativeDate } from '../js/utils.js'
import { getActive, setActive, updateActiveStatus } from '../js/activeTask.js'

// ─── STATE ──────────────────────────────────────────────────

let _unsubLogs  = null
let _unsubTasks = null
let _task       = null
let _project    = null
let _allTasks   = []
let _projectId  = null

// ─── LIFECYCLE ──────────────────────────────────────────────

export async function render(container, params = {}) {
  const { taskId, projectId } = params
  if (!taskId || !projectId) { window.navigate('home'); return }
  _projectId = projectId

  container.innerHTML = buildShell()
  container.querySelector('#btn-back').addEventListener('click', () => {
    window.navigate('project-view', { projectId })
  })

  try {
    [_task, _project] = await Promise.all([getTask(taskId), getProject(projectId)])
  } catch (err) {
    showError(container, err.message)
    return
  }
  if (!_task) { showError(container, 'Opgave ikke fundet.'); return }

  container.querySelector('#task-title').textContent = _task.name || 'Opgave'

  renderDescription(container, _task)
  renderStatusSelector(container, _task)

  _unsubTasks = subscribeToTasks(projectId, tasks => {
    _allTasks = tasks
  })

  _unsubLogs = subscribeToTaskLogs(taskId, logs => {
    renderLogFeed(container, logs)
  })

  container.querySelector('#btn-log-task').addEventListener('click', () => {
    window.navigate('log', {
      projectId,
      taskId:     _task.id,
      taskName:   _task.name || '',
      autoCamera: true
    })
  })
}

export function destroy() {
  if (_unsubLogs)  { _unsubLogs();  _unsubLogs  = null }
  if (_unsubTasks) { _unsubTasks(); _unsubTasks = null }
  _task = null; _project = null; _allTasks = []; _projectId = null
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell() {
  return `
    <div class="screen" id="task-view-screen">
      <div class="top-bar">
        <button class="btn-icon btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1 id="task-title" style="font-size:16px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Opgave</h1>
        </div>
      </div>

      <div class="screen-body">
        <!-- Description -->
        <div class="task-detail-section">
          <div class="task-detail-label">BESKRIVELSE</div>
          <textarea id="task-description" class="task-detail-desc"
                    placeholder="Instruktioner, mål, materialer, noter…" rows="4"></textarea>
        </div>

        <!-- Status selector -->
        <div class="task-detail-section" id="status-selector-section">
          <div class="task-detail-label">STATUS</div>
          <div class="status-selector" id="status-selector"></div>
        </div>

        <!-- Log feed -->
        <div class="task-detail-section task-detail-section-feed">
          <div class="task-detail-label">FOTOS &amp; NOTER</div>
          <div id="task-log-feed" style="display:flex; flex-direction:column; gap:10px;">
            <div class="empty-state" style="padding:24px 0;">
              <div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>
            </div>
          </div>
        </div>

        <div class="safe-bottom"></div>
      </div>

      <div class="fab-area">
        <button class="btn-primary" id="btn-log-task">
          ${iconCamera()}
          Log foto
        </button>
      </div>

      <div id="toast-area"></div>
    </div>
  `
}

// ─── DESCRIPTION ────────────────────────────────────────────

function renderDescription(container, task) {
  const el = container.querySelector('#task-description')
  if (!el) return
  el.value = task.description || ''
  let _saved = task.description || ''
  el.addEventListener('blur', async () => {
    const val = el.value
    if (val === _saved) return
    _saved = val
    try {
      await updateTask(task.id, { description: val })
    } catch (err) {
      console.error('Kunne ikke gemme beskrivelse:', err)
    }
  })
}

// ─── STATUS SELECTOR ────────────────────────────────────────

function renderStatusSelector(container, task) {
  const el = container.querySelector('#status-selector')
  if (!el) return

  const statuses = [
    { value: 'not started', label: 'Ikke startet' },
    { value: 'in progress', label: 'I gang' },
    { value: 'done',        label: 'Færdig' }
  ]

  el.innerHTML = statuses.map(s => `
    <button class="status-sel-btn${task.status === s.value ? ' is-active' : ''}"
            data-status="${escapeAttr(s.value)}">
      ${escapeHtml(s.label)}
    </button>
  `).join('')

  el.querySelectorAll('.status-sel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.status
      if (newStatus === task.status) return

      // Optimistic UI update
      el.querySelectorAll('.status-sel-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.status === newStatus)
      })
      task.status = newStatus

      // Sync active task cache
      const active = getActive()
      if (active && active.taskId === task.id) {
        updateActiveStatus(newStatus)
      }

      try {
        await updateTask(task.id, { status: newStatus })
      } catch (err) {
        console.error('Kunne ikke opdatere status:', err)
      }

      if (newStatus === 'done') {
        showNextTaskPrompt(container)
      } else {
        container.querySelector('#next-task-prompt')?.remove()
      }
    })
  })
}

// ─── NEXT TASK PROMPT ────────────────────────────────────────

function showNextTaskPrompt(container) {
  container.querySelector('#next-task-prompt')?.remove()

  const remaining = _allTasks.filter(t => t.status !== 'done' && t.id !== _task.id)
  const el        = document.createElement('div')
  el.id        = 'next-task-prompt'
  el.className = 'next-task-prompt'

  if (remaining.length === 0) {
    el.innerHTML = `
      <div class="next-task-prompt-title">Alle opgaver er færdige!</div>
      <div class="next-task-prompt-body">Godt arbejde — projektet kan afsluttes.</div>
      <button class="next-task-dismiss">Luk</button>
    `
  } else {
    el.innerHTML = `
      <div class="next-task-prompt-title">Vælg næste opgave?</div>
      <div class="next-task-prompt-tasks">
        ${remaining.map(t => `
          <div class="next-task-option"
               data-task-id="${escapeAttr(t.id)}"
               data-task-name="${escapeAttr(t.name || '')}"
               data-task-status="${escapeAttr(t.status)}">
            ${escapeHtml(t.name || 'Unavngivet')}
          </div>
        `).join('')}
      </div>
      <button class="next-task-dismiss">Nej tak</button>
    `
  }

  container.querySelector('#status-selector-section')?.after(el)

  el.querySelector('.next-task-dismiss').addEventListener('click', () => el.remove())

  el.querySelectorAll('.next-task-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const nextTaskId   = opt.dataset.taskId
      const nextTaskName = opt.dataset.taskName
      let   nextStatus   = opt.dataset.taskStatus

      const prev = getActive()
      if (prev && prev.taskId && prev.taskId !== nextTaskId && prev.taskStatus !== 'done') {
        try { await updateTask(prev.taskId, { status: 'in progress' }) } catch {}
      }

      if (nextStatus === 'not started') {
        try { await updateTask(nextTaskId, { status: 'in progress' }) } catch {}
        nextStatus = 'in progress'
      }

      setActive({
        projectId:   _project?.id || _task.projectId,
        taskId:      nextTaskId,
        taskName:    nextTaskName,
        projectAddr: _project?.address || '',
        taskStatus:  nextStatus
      })

      el.remove()
      window.navigate('task-view', {
        taskId:    nextTaskId,
        projectId: _project?.id || _task.projectId
      })
    })
  })
}

// ─── LOG FEED ────────────────────────────────────────────────

function renderLogFeed(container, logs) {
  const feed = container.querySelector('#task-log-feed')
  if (!feed) return

  if (logs.length === 0) {
    feed.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <div class="empty-title">Ingen logs for denne opgave</div>
        <div class="empty-body">Tap "Log foto" for at tilføje et foto.</div>
      </div>
    `
    return
  }

  feed.innerHTML = logs.map(log => {
    const time    = log.timestamp ? formatTimestamp(log.timestamp) : ''
    const day     = log.timestamp ? relativeDate(log.timestamp)    : ''
    const timeStr = day && time ? `${day} ${time}` : (time || day || '')

    return `
      <div class="log-card">
        ${log.photoUrl ? `<img class="log-card-photo" src="${escapeAttr(log.photoUrl)}" alt="Log foto" loading="lazy">` : ''}
        ${log.note     ? `<div class="log-card-note">${escapeHtml(log.note)}</div>` : ''}
        <div class="log-card-meta">
          <span class="log-card-task">${escapeHtml(_task?.name || 'Opgave')}</span>
          <span class="log-card-time">${escapeHtml(timeStr)}</span>
        </div>
      </div>
    `
  }).join('')
}

// ─── HELPERS ────────────────────────────────────────────────

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

function iconCamera() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}
