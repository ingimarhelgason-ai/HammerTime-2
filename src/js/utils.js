// ─── DATE FORMATTING ────────────────────────────────────────

const DAYS_DA = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag']
const MONTHS_DA = ['januar','februar','marts','april','maj','juni','juli','august','september','oktober','november','december']
const MONTHS_SHORT = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']

export function formatDayFull(date = new Date()) {
  return `${DAYS_DA[date.getDay()]}, ${date.getDate()}. ${MONTHS_DA[date.getMonth()]}`
}

export function formatDateShort(isoDate) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  return `${d}. ${MONTHS_SHORT[m - 1]} ${y}`
}

export function formatTimestamp(ts) {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function toISODate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/**
 * Returns a relative label like "i dag", "i går", or "3. apr"
 */
export function relativeDate(ts) {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'i dag'
  if (date.toDateString() === yesterday.toDateString()) return 'i går'
  return `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]}`
}

// ─── IMAGE COMPRESSION ──────────────────────────────────────

/**
 * Compress an image File to max 1400px longest side, JPEG at 0.82 quality.
 * Returns a Blob.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1400
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Komprimering fejlede')), 'image/jpeg', 0.82)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Kan ikke læse billede')) }
    img.src = url
  })
}

// ─── FILE UTILS ─────────────────────────────────────────────

/**
 * Read a File as a base64 string (without data URI prefix).
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target.result
      // Strip the "data:...;base64," prefix
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = () => reject(new Error('Kan ikke læse fil'))
    reader.readAsDataURL(file)
  })
}

// ─── HOURS FORMATTING ───────────────────────────────────────

export function formatHours(h) {
  if (h == null) return '—'
  if (h === 1) return '1 time'
  return `${h} timer`
}

export function formatHoursShort(h) {
  if (h == null) return '—'
  return `${h}t`
}

// ─── STATUS LABELS ──────────────────────────────────────────

export function taskStatusLabel(status) {
  return { 'not started': 'Ikke startet', 'in progress': 'I gang', 'done': 'Færdig' }[status] || status
}

export function projectStatusLabel(status) {
  return { 'active': 'Aktiv', 'completed': 'Færdig' }[status] || status
}
