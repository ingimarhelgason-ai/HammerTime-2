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
  recognition.continuous       = false

  recognition.onstart = () => onStart?.()
  recognition.onend   = () => onEnd?.()

  recognition.onresult = e => {
    const transcript = e.results?.[0]?.[0]?.transcript ?? ''
    if (transcript) onResult?.(transcript)
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
