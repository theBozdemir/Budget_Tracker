import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { authErrorMessage } from '../authErrors'

const MIN_PASSWORD_LENGTH = 6

function changePasswordError(err) {
  const code = err?.code || ''
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Your current password is incorrect.'
  }
  return authErrorMessage(err)
}

function ChangePasswordCard() {
  const { user, changePassword, resetPassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const inputType = showPasswords ? 'text' : 'password'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('Choose a password that is different from your current one.')
      return
    }

    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Your password has been changed.')
    } catch (err) {
      setError(changePasswordError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSendReset() {
    setError('')
    setSuccess('')
    try {
      await resetPassword(user.email)
      setSuccess(`We sent a password reset link to ${user.email}. Check your inbox and spam folder.`)
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <section className="card profile-section">
      <h2>Change password</h2>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          Current password
          <input
            type={inputType}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type={inputType}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type={inputType}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
          Show passwords
        </label>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}

        <button
          className={`btn${currentPassword && newPassword && confirmPassword ? ' primary' : ''}`}
          disabled={saving || !currentPassword || !newPassword || !confirmPassword}
        >
          {saving ? 'Saving...' : 'Change Password'}
        </button>
      </form>
      <button type="button" className="link-btn" onClick={handleSendReset}>
        Forgot your current password? Email me a reset link
      </button>
    </section>
  )
}

export default function ProfilePage() {
  const { user, profile, logOut } = useAuth()

  return (
    <div className="page">
      <header className="page-header">
        <h1>Profile</h1>
      </header>

      <div className="card profile-card">
        <p><strong>Name</strong><br />{profile?.displayName || user.displayName}</p>
        <p><strong>Email</strong><br />{user.email}</p>
      </div>

      <ChangePasswordCard />

      <div className="page-actions">
        <button type="button" className="btn danger full" onClick={logOut}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
