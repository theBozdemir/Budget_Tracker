import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { authErrorMessage } from '../authErrors'

// Invites can only be seen and accepted from a verified email address, so nobody
// can claim an invite by signing up with someone else's email first
export default function VerifyEmailNotice({ onVerified }) {
  const { user, resendVerificationEmail, refreshEmailVerification } = useAuth()
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleResend() {
    setBusy('resend')
    setMessage('')
    setError('')
    try {
      await resendVerificationEmail()
      setMessage(`We sent a new link to ${user.email}. Check your inbox and spam folder.`)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleCheck() {
    setBusy('check')
    setMessage('')
    setError('')
    try {
      const verified = await refreshEmailVerification()
      if (verified) {
        onVerified?.()
      } else {
        setError('Your email is not verified yet. Open the link in the email we sent, then try again.')
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card verify-email-card">
      <h2>Verify your email</h2>
      <p>
        To see and accept household invites, confirm that <strong>{user.email}</strong> is yours. Open the link we
        emailed you, then come back here.
      </p>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
      <div className="row-actions">
        <button type="button" className="btn" disabled={busy != null} onClick={handleResend}>
          {busy === 'resend' ? 'Sending...' : 'Resend email'}
        </button>
        <button type="button" className="btn primary" disabled={busy != null} onClick={handleCheck}>
          {busy === 'check' ? 'Checking...' : "I've verified"}
        </button>
      </div>
    </div>
  )
}
