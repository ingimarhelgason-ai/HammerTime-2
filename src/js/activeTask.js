// ─── ACTIVE TASK — localStorage layer ───────────────────────
// Stores which project + task the worker is currently working on.
// IDs are authoritative; name/addr are display caches.

const P = 'ht_active_'

export function getActive() {
  const projectId = localStorage.getItem(P + 'projectId')
  const taskId    = localStorage.getItem(P + 'taskId')
  if (!projectId || !taskId) return null
  return {
    projectId,
    taskId,
    taskName:    localStorage.getItem(P + 'taskName')    || '',
    projectAddr: localStorage.getItem(P + 'projectAddr') || '',
    taskStatus:  localStorage.getItem(P + 'taskStatus')  || 'not started'
  }
}

export function setActive({ projectId, taskId, taskName = '', projectAddr = '', taskStatus = 'not started' }) {
  localStorage.setItem(P + 'projectId',   projectId)
  localStorage.setItem(P + 'taskId',      taskId)
  localStorage.setItem(P + 'taskName',    taskName)
  localStorage.setItem(P + 'projectAddr', projectAddr)
  localStorage.setItem(P + 'taskStatus',  taskStatus)
}

export function clearActive() {
  ;[P + 'projectId', P + 'taskId', P + 'taskName', P + 'projectAddr', P + 'taskStatus']
    .forEach(k => localStorage.removeItem(k))
}

/** Call this whenever the active task's Firestore status changes locally. */
export function updateActiveStatus(status) {
  if (localStorage.getItem(P + 'taskId')) {
    localStorage.setItem(P + 'taskStatus', status)
  }
}
