import { getApiKey, setApiKey } from '../js/claude.js'

export function render(container) {
  container.innerHTML = `
    <div class="screen">
      <div class="top-bar">
        <button class="btn-back" id="btn-back" aria-label="Tilbage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div class="top-bar-title">
          <h1 style="color:var(--text); font-size:17px;">Indstillinger</h1>
        </div>
      </div>
      <div class="screen-body">
        <div class="list-content-padded" style="margin-top:20px;">
          <div class="form-group">
            <label class="form-label" for="field-apikey">Anthropic API-nøgle</label>
            <input class="form-input" id="field-apikey" type="password"
              placeholder="sk-ant-…"
              value="${escapeAttr(getApiKey())}"
              autocomplete="off"
              spellcheck="false"
            >
            <div style="font-size:12px; color:var(--text3); font-family:var(--mono); margin-top:4px;">
              Gemmes lokalt på enheden. Bruges til AI-analyse.
            </div>
          </div>
          <button class="btn-primary" id="btn-save">Gem</button>
        </div>
        <div class="safe-bottom"></div>
      </div>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))

  container.querySelector('#btn-save').addEventListener('click', () => {
    const val = container.querySelector('#field-apikey').value.trim()
    setApiKey(val)
    showToast(val ? 'API-nøgle gemt' : 'API-nøgle fjernet')
    setTimeout(() => window.navigate('home'), 800)
  })
}

export function destroy() {}

function showToast(message, isError = false) {
  let toast = document.getElementById('ht-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'ht-toast'
    toast.className = 'toast'
    document.getElementById('app').appendChild(toast)
  }
  toast.textContent = message
  toast.className = `toast${isError ? ' error' : ''}`
  void toast.offsetWidth
  toast.classList.add('show')
  clearTimeout(toast._timeout)
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500)
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;')
}
