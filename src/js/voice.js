/**
 * Shared voice input module using Web Speech API.
 *
 * Usage:
 *   const { stop } = startVoiceInput({ onResult, onError, onStart, onEnd })
 *   stop()  // cancel early
 */

export function startVoiceInput({ onResult, onError, onStart, onEnd, lang = 'da-DK' } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition

  if (!SR) {
    onError?.('not-supported')
    return { stop: () => {} }
  }

  const recognition = new SR()
  recognition.lang             = lang
  recognition.interimResults   = false
  recognition.maxAlternatives  = 1
  recognition.continuous       = true

  let _accumulated = ''

  recognition.onstart = () => onStart?.()

  recognition.onresult = e => {
    // In continuous mode results accumulate — e.resultIndex points to the newest segment
    const segment = e.results?.[e.resultIndex]?.[0]?.transcript ?? ''
    if (segment) _accumulated += (_accumulated ? ' ' : '') + segment
  }

  recognition.onend = () => {
    // Deliver full accumulated transcript before notifying end
    if (_accumulated) onResult?.(_accumulated)
    onEnd?.()
  }

  recognition.onerror = e => {
    // 'aborted' fires when we call stop() ourselves — not a user-visible error
    if (e.error !== 'aborted') {
      onError?.(e.error)
    }
  }

  try {
    recognition.start()
  } catch {
    onError?.('start-failed')
    return { stop: () => {} }
  }

  return {
    stop() {
      try { recognition.stop() } catch { /* already stopped */ }
    }
  }
}
