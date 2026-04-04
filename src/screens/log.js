// Placeholder — to be built in the next session
export function render(container, params = {}) {
  container.innerHTML = `
    <div class="screen">
      <div class="top-bar">
        <button class="btn-back" id="btn-back" aria-label="Tilbage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div class="top-bar-title">
          <h1 style="color:var(--text); font-size:17px;">Log</h1>
        </div>
      </div>
      <div class="screen-body">
        <div class="empty-state" style="margin-top:60px;">
          <div class="empty-title" style="color:var(--text3);">Kommer snart</div>
          <div class="empty-body">Log-skærmen er under opbygning.</div>
        </div>
      </div>
    </div>
  `
  container.querySelector('#btn-back').addEventListener('click', () => window.navigate('home'))
}

export function destroy() {}
