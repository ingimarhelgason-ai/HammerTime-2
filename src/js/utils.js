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
 * Compress an image File to max 800px longest side, JPEG at 0.65 quality.
 * If the result is still over 500 KB a second pass at 0.5 quality is applied.
 * Canvas memory is explicitly released after each pass.
 * Returns a Blob.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Kan ikke læse billedet — prøv igen'))
    }

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const MAX = 800
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else                { width = Math.round(width * MAX / height); height = MAX }
        }

        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Billedkomprimering fejlede — prøv med et andet foto'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)

        // First pass at 0.65
        canvas.toBlob(blob1 => {
          if (!blob1) {
            canvas.width = 0; canvas.height = 0
            reject(new Error('Billedkomprimering fejlede — prøv igen'))
            return
          }

          if (blob1.size <= 500 * 1024) {
            canvas.width = 0; canvas.height = 0
            resolve(blob1)
            return
          }

          // Still over 500 KB — second pass at 0.5 from same canvas
          canvas.toBlob(blob2 => {
            canvas.width = 0; canvas.height = 0
            resolve(blob2 || blob1)
          }, 'image/jpeg', 0.5)
        }, 'image/jpeg', 0.65)

      } catch {
        reject(new Error('Billedkomprimering fejlede — prøv med et andet foto'))
      }
    }

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
