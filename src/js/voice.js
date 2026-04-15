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
  recognition.lang            = lang
  recognition.interimResults  = false
  recognition.maxAlternatives = 1
  recognition.continuous      = true

  let isRecording  = true   // set false by stop() to distinguish user stop from browser stop
  let _accumulated = ''

  recognition.onstart = () => onStart?.()

  recognition.onresult = e => {
    // In continuous mode results accumulate — e.resultIndex points to the newest segment
    const segment = e.results?.[e.resultIndex]?.[0]?.transcript ?? ''
    if (segment) _accumulated += (_accumulated ? ' ' : '') + segment
  }

  recognition.onend = () => {
    if (isRecording) {
      // Browser stopped on its own (pause, timeout) — restart to keep recording
      try { recognition.start() } catch { /* ignore race */ }
    } else {
      // User called stop() — deliver full transcript and signal done
      if (_accumulated) onResult?.(_accumulated)
      onEnd?.()
    }
  }

  recognition.onerror = e => {
    if (e.error === 'aborted')   return  // from our own stop() — handled in onend
    if (e.error === 'no-speech') return  // silent pause — onend will restart
    // Real error (not-allowed, audio-capture, etc.) — stop the restart loop
    isRecording = false
    onError?.(e.error)
  }

  try {
    recognition.start()
  } catch {
    onError?.('start-failed')
    return { stop: () => {} }
  }

  return {
    stop() {
      isRecording = false
      try { recognition.stop() } catch { /* already stopped */ }
    }
  }
}
