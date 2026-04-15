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

  let isRecording       = true   // set false by stop() to distinguish user stop from browser stop
  let _accumulated      = ''
  let _hasStarted       = false  // true after first successful onstart
  let _notAllowedRetry  = false  // true after first not-allowed retry attempt
  let _restartDelay     = 300    // ms — bumped to 500 on not-allowed retry

  recognition.onstart = () => {
    _hasStarted = true
    onStart?.()
  }

  recognition.onresult = e => {
    // In continuous mode results accumulate — e.resultIndex points to the newest segment
    const segment = e.results?.[e.resultIndex]?.[0]?.transcript ?? ''
    if (segment) _accumulated += (_accumulated ? ' ' : '') + segment
  }

  recognition.onend = () => {
    console.log('[voice] onend fired — isRecording:', isRecording, 'accumulated:', _accumulated)
    if (isRecording) {
      const delay = _restartDelay
      _restartDelay = 300  // reset for next cycle
      console.log('[voice] restarting recognition in', delay, 'ms')
      setTimeout(() => {
        try {
          recognition.start()
          console.log('[voice] recognition.start() called on restart')
        } catch (err) {
          console.error('[voice] restart failed:', err.name, err.message)
        }
      }, delay)
    } else {
      // User called stop() — deliver full transcript and signal done
      console.log('[voice] stop was intentional — delivering transcript:', _accumulated)
      if (_accumulated) onResult?.(_accumulated)
      onEnd?.()
    }
  }

  recognition.onerror = e => {
    console.log('[voice] onerror fired — error:', e.error, 'isRecording:', isRecording, '_hasStarted:', _hasStarted)
    if (e.error === 'aborted')   return  // from our own stop() — handled in onend
    if (e.error === 'no-speech') return  // silent pause — onend will restart

    if (e.error === 'not-allowed' && _hasStarted) {
      // Chrome on Android can revoke permission between restarts — retry once with a longer delay
      if (!_notAllowedRetry) {
        console.log('[voice] not-allowed during restart — retrying once after 500ms')
        _notAllowedRetry = true
        _restartDelay = 500  // onend will use this delay for the next restart
        return  // let onend handle the restart as normal
      }
      console.log('[voice] not-allowed again after retry — giving up')
      // fall through to stop the loop
    }

    // Real error — stop the restart loop
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
