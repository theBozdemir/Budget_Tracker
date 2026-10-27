import { useCallback, useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { useAuth } from '../AuthContext'
import { authenticate, isAppLockEnabled, isAppLockSupported, isCancelError, isFreshSignIn } from '../appLock'

// The Face ID / fingerprint sheet itself briefly makes the app inactive;
// background events this soon after a prompt are ignored
const PROMPT_GRACE_MS = 1500

export default function AppLock() {
  const { logOut } = useAuth()
  // Someone who just typed their password doesn't need to unlock again
  const [locked, setLocked] = useState(() => isAppLockEnabled() && !isFreshSignIn())
  const [error, setError] = useState('')
  const lockedRef = useRef(locked)
  const prompting = useRef(false)
  const lastPromptEnd = useRef(0)

  const setLockedState = useCallback((value) => {
    lockedRef.current = value
    setLocked(value)
  }, [])

  const unlock = useCallback(async () => {
    if (prompting.current) return
    prompting.current = true
    setError('')
    try {
      await authenticate('Unlock to see your budget')
      setLockedState(false)
    } catch (err) {
      if (!isCancelError(err)) setError(err?.message || 'Could not verify it is you. Try again.')
    } finally {
      prompting.current = false
      lastPromptEnd.current = Date.now()
    }
  }, [setLockedState])

  // Lock as soon as the app goes to the background so the app switcher
  // preview is covered too, and ask again when it comes back
  useEffect(() => {
    if (!isAppLockSupported()) return undefined
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!isAppLockEnabled() || prompting.current) return
      if (!isActive) {
        if (Date.now() - lastPromptEnd.current > PROMPT_GRACE_MS) setLockedState(true)
      } else if (lockedRef.current) {
        unlock()
      }
    })
    return () => {
      listener.then((handle) => handle.remove())
    }
  }, [unlock, setLockedState])

  // Prompt automatically on launch; later prompts come from resuming or the Unlock button
  useEffect(() => {
    if (lockedRef.current) unlock()
  }, [unlock])

  if (!locked) return null

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-label="Budget Tracker is locked">
      <div className="app-lock-content">
        <div className="logo-circle">$</div>
        <h1>Budget Tracker is locked</h1>
        <p className="muted">Unlock with Face ID, fingerprint or your phone passcode.</p>
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn primary full" onClick={unlock}>
          Unlock
        </button>
        <button type="button" className="link-btn" onClick={logOut}>
          Sign out instead
        </button>
      </div>
    </div>
  )
}
