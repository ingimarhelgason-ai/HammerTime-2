import { addLog } from '../js/api.js'
import { compressImage } from '../js/utils.js'
import { storage } from '../js/firebase.js'
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

// ─── STATE ──────────────────────────────────────────────────

let _photoBlob   = null
let _photoPreview = null
let _mode        = 'initial' // 'initial' | 'photo' | 'note'
let _saving      = false

// ─── LIFECYCLE ──────────────────────────────────────────────

export function render(container, params = {}) {
  const { projectId, taskId = null, taskName = null, returnTo = null, noteOnly = false } = params
  if (!projectId) { window.navigate('home'); return }

  // Reset state on each render
  _photoBlob    = null
  _photoPreview = null
  _mode         = 'initial'
  _saving       = false

  container.innerHTML = buildShell(taskName)

  // Back
  container.querySelector('#btn-back').addEventListener('click', () => {
    if (returnTo === 'home') window.navigate('home')
    else window.navigate('project-view', { projectId })
  })

  // Hidden file input — camera
  const fileInput = container.querySelector('#photo-input')
  container.querySelector('#btn-camera').addEventListener('click', () => fileInput.click())

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]
    if (!file) return
    try {
      const blob = await compressImage(file)
      _photoBlob    = blob
      _photoPreview = URL.createObjectURL(blob)
      _mode         = 'photo'
      renderPhotoState(container, projectId, taskId, returnTo)
    } catch (err) {
      showToast(container, 'Kan ikke læse billede', true)
    }
  })

  // Note-only path
  container.querySelector('#btn-note-only').addEventListener('click', () => {
    _mode = 'note'
    renderNoteState(container, projectId, taskId, returnTo)
  })

  // Jump directly to note state if requested
  if (noteOnly) {
    _mode = 'note'
    renderNoteState(container, projectId, taskId, returnTo)
  }
}

export function destroy() {
  if (_photoPreview) { URL.revokeObjectURL(_photoPreview); _photoPreview = null }
}

// ─── SHELL ──────────────────────────────────────────────────

function buildShell(taskName) {
  return `
    <div class="screen" id="log-screen">
      <div class="top-bar">
        <button class="btn-back" id="btn-back" aria-label="Tilbage">
          ${iconBack()}
        </button>
        <div class="top-bar-title">
          <h1 style="font-size:17px;">${taskName ? escapeHtml(taskName) : 'Log'}</h1>
          ${taskName ? '' : ''}
        </div>
      </div>

      <div class="screen-body" id="log-body">
        ${buildInitialState()}
      </div>

      <input id="photo-input" type="file" accept="image/*" capture="environment"
             style="display:none;" aria-hidden="true">

      <div id="toast-area"></div>
    </div>
  `
}

function buildInitialState() {
  return `
    <div id="initial-state" style="
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      height:100%;
      gap:24px;
      padding:32px 24px;
    ">
      <button id="btn-camera" style="
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:16px;
        width:100%;
        flex:1;
        max-height:300px;
        background:var(--surface);
        border:1px solid var(--border2);
        border-radius:var(--radius);
        color:var(--text2);
        cursor:pointer;
        transition:background 0.15s, border-color 0.15s;
      " aria-label="Tag foto">
        <div style="
          width:72px;height:72px;
          background:var(--accent-dim);
          border:1.5px solid var(--accent-rim);
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          color:var(--accent);
        ">
          ${iconCameraLg()}
        </div>
        <span style="font-size:18px;font-weight:600;letter-spacing:-0.3px;">Tag foto</span>
      </button>

      <button id="btn-note-only" style="
        display:flex;align-items:center;justify-content:center;gap:8px;
        width:100%;padding:16px;
        background:var(--surface);
        border:0.5px solid var(--border);
        border-radius:var(--radius);
        color:var(--text2);
        font-size:15px;font-weight:500;
        cursor:pointer;
        transition:background 0.15s;
      " aria-label="Skriv note">
        ${iconNote()}
        Bare en note
      </button>
    </div>
  `
}

// ─── PHOTO STATE ────────────────────────────────────────────

function renderPhotoState(container, projectId, taskId, returnTo) {
  const body = container.querySelector('#log-body')
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="flex:1;overflow:hidden;position:relative;">
        <img id="photo-preview" src="${_photoPreview}"
          style="width:100%;height:100%;object-fit:cover;display:block;"
          alt="Foto forhåndsvisning">
        <button id="btn-retake" style="
          position:absolute;top:12px;right:12px;
          display:flex;align-items:center;gap:6px;
          padding:8px 14px;
          background:rgba(0,0,0,0.6);
          border:0.5px solid rgba(255,255,255,0.2);
          border-radius:20px;
          color:var(--text);
          font-size:13px;
          cursor:pointer;
        " aria-label="Tag om">
          ${iconCamera()}
          Tag om
        </button>
      </div>

      <div style="
        padding:14px 18px;
        padding-bottom:max(14px, env(safe-area-inset-bottom));
        display:flex;flex-direction:column;gap:10px;
        background:var(--bg);
        border-top:0.5px solid var(--border);
        flex-shrink:0;
      ">
        <textarea id="note-input"
          class="form-textarea"
          placeholder="Tilføj note (valgfrit)…"
          rows="3"
          style="min-height:0;resize:none;"
        ></textarea>
        <button id="btn-save" class="btn-primary" style="font-size:17px;padding:17px;">
          Gem
        </button>
      </div>
    </div>
  `

  // Re-attach camera input since we rebuilt the body
  const fileInput = container.querySelector('#photo-input')

  container.querySelector('#btn-retake').addEventListener('click', () => {
    if (_photoPreview) { URL.revokeObjectURL(_photoPreview); _photoPreview = null }
    _photoBlob = null
    fileInput.value = ''
    fileInput.click()
  })

  container.querySelector('#btn-save').addEventListener('click', () => {
    const note = container.querySelector('#note-input').value.trim() || null
    saveLog(container, { projectId, taskId, type: 'photo', note, returnTo })
  })
}

// ─── NOTE STATE ─────────────────────────────────────────────

function renderNoteState(container, projectId, taskId, returnTo) {
  const body = container.querySelector('#log-body')
  body.innerHTML = `
    <div style="
      display:flex;flex-direction:column;height:100%;
      padding:18px;
      padding-bottom:max(18px, env(safe-area-inset-bottom));
      gap:14px;
    ">
      <textarea id="note-input"
        class="form-textarea"
        placeholder="Hvad skete der?…"
        style="flex:1;resize:none;min-height:0;font-size:17px;line-height:1.6;"
        autofocus
      ></textarea>
      <button id="btn-save" class="btn-primary" style="font-size:17px;padding:17px;flex-shrink:0;">
        Gem
      </button>
    </div>
  `

  // Auto-focus
  setTimeout(() => container.querySelector('#note-input')?.focus(), 50)

  container.querySelector('#btn-save').addEventListener('click', () => {
    const note = container.querySelector('#note-input').value.trim()
    if (!note) { showToast(container, 'Skriv en note først', true); return }
    saveLog(container, { projectId, taskId, type: 'note', note, returnTo })
  })
}

// ─── SAVE ────────────────────────────────────────────────────

async function saveLog(container, { projectId, taskId, type, note, returnTo }) {
  if (_saving) return
  _saving = true

  const saveBtn = container.querySelector('#btn-save')
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Gemmer…' }

  try {
    let photoUrl = null

    if (type === 'photo' && _photoBlob) {
      const filename = `${Date.now()}.jpg`
      const storageRef = ref(storage, `photos/${projectId}/${filename}`)
      await uploadBytes(storageRef, _photoBlob, { contentType: 'image/jpeg' })
      photoUrl = await getDownloadURL(storageRef)
    }

    await addLog({ projectId, taskId, type, photoUrl, note })

    // Clean up object URL
    if (_photoPreview) { URL.revokeObjectURL(_photoPreview); _photoPreview = null }

    // Navigate back with success signal
    if (returnTo === 'home') window.navigate('home')
    else window.navigate('project-view', { projectId, _logSaved: true })

  } catch (err) {
    console.error('Gem log fejlede:', err)
    showToast(container, 'Kunne ikke gemme — prøv igen', true)
    _saving = false
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Gem' }
  }
}

// ─── TOAST ──────────────────────────────────────────────────

function showToast(container, message, isError = false) {
  const area = container.querySelector('#toast-area')
  if (!area) return
  const toast = document.createElement('div')
  toast.className = `toast${isError ? ' error' : ''}`
  toast.textContent = message
  area.innerHTML = ''
  area.appendChild(toast)
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show') }) })
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300) }, 2500)
}

// ─── HELPERS ────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── ICONS ──────────────────────────────────────────────────

function iconBack() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`
}

function iconCamera() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}

function iconCameraLg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`
}

function iconNote() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`
}
