import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { authErrorMessage } from '../authErrors'
import { getPendingInviteRedirect, PENDING_INVITE_EMAIL_KEY } from '../inviteUtils'

export default function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState(() => sessionStorage.getItem(PENDING_INVITE_EMAIL_KEY) || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const pendingEmail = sessionStorage.getItem(PENDING_INVITE_EMAIL_KEY)
    if (pendingEmail && !email) {
      setEmail(pendingEmail)
    }
  }, [email])

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setSuccess('')
  }

  function goAfterAuth() {
    const pendingJoin = getPendingInviteRedirect()
    navigate(pendingJoin || '/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUp(displayName, email, password)
        goAfterAuth()
      } else if (mode === 'reset') {
        await resetPassword(email)
        setSuccess(`Password reset email sent to ${email.toLowerCase()}. Check your inbox and spam folder.`)
      } else {
        await signIn(email, password)
        goAfterAuth()
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-circle">$</div>
          <h1>Budget Tracker</h1>
          <p>
            {mode === 'reset'
              ? 'Reset your password'
              : 'Shared households. Private groups.'}
          </p>
        </div>

        {sessionStorage.getItem(PENDING_INVITE_EMAIL_KEY) && (
          <p className="muted small">
            You have a household invite. Sign in or create an account with{' '}
            <strong>{sessionStorage.getItem(PENDING_INVITE_EMAIL_KEY)}</strong>.
          </p>
        )}

        <form onSubmit={handleSubmit} className="stack">
          {mode === 'signup' && (
            <label>
              Your name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>
          )}
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
          <button className="btn primary" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'signup'
                ? 'Create Account'
                : mode === 'reset'
                  ? 'Send Reset Email'
                  : 'Sign In'}
          </button>
        </form>

        {mode === 'signin' && (
          <button type="button" className="link-btn" onClick={() => switchMode('reset')}>
            Forgot password?
          </button>
        )}

        {mode === 'reset' && (
          <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
            Back to sign in
          </button>
        )}

        {mode !== 'reset' && (
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'}
          </button>
        )}

        <p className="hint-text">
          Use the same account on phone or computer. Open in Safari and tap Share → Add to Home Screen.
        </p>
      </div>
    </div>
  )
}
