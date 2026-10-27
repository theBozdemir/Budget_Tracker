import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { authErrorMessage } from '../authErrors'

const MIN_PASSWORD_LENGTH = 6
const DELETE_CONFIRM_WORD = 'DELETE'

const ICONS = {
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
}

function passwordError(err, wrongPasswordMessage) {
  const code = err?.code || ''
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return wrongPasswordMessage
  }
  return authErrorMessage(err)
}

function ProfileItem({ id, icon, label, danger = false, open, onToggle, children }) {
  return (
    <section className={`card profile-section${danger ? ' danger' : ''}`}>
      <button type="button" className="profile-item" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={ICONS[icon]}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="profile-item-label">{label}</span>
        <span className={`insights-chevron${open ? ' open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div id={id} className="profile-item-panel">
          {children}
        </div>
      )}
    </section>
  )
}

function ChangePasswordCard() {
  const { user, changePassword, resetPassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [open, setOpen] = useState(false)
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
      setError(passwordError(err, 'Your current password is incorrect.'))
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

  function toggleOpen() {
    setOpen((current) => {
      if (current) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setShowPasswords(false)
        setError('')
        setSuccess('')
      }
      return !current
    })
  }

  return (
    <ProfileItem id="change-password-panel" icon="lock" label="Change password" open={open} onToggle={toggleOpen}>
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
    </ProfileItem>
  )
}

function DeleteAccountCard() {
  const { deleteAccount } = useAuth()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmWord, setConfirmWord] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const ready = password && confirmWord.trim().toUpperCase() === DELETE_CONFIRM_WORD

  function toggleOpen() {
    setOpen((current) => {
      if (current) {
        setPassword('')
        setConfirmWord('')
        setError('')
      }
      return !current
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ready) return
    setError('')
    setDeleting(true)
    try {
      // On success the auth listener signs the user out and the router shows the login page
      await deleteAccount(password)
    } catch (err) {
      setError(passwordError(err, 'Your password is incorrect.'))
      setDeleting(false)
    }
  }

  return (
    <ProfileItem id="delete-account-panel" icon="trash" label="Delete account" danger open={open} onToggle={toggleOpen}>
      <div className="delete-account-info">
        <p>This permanently deletes your Budget Tracker account. It cannot be undone.</p>
        <ul>
          <li>Households where you are the only member are deleted with all their entries.</li>
          <li>
            You leave shared households. Entries you added there stay, because they are part of the other members&apos;
            budget.
          </li>
          <li>Your profile (name and email) is removed.</li>
        </ul>
      </div>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Type {DELETE_CONFIRM_WORD} to confirm
          <input
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className={`btn${ready ? ' danger-solid' : ''}`} disabled={deleting || !ready}>
          {deleting ? 'Deleting account...' : 'Delete My Account'}
        </button>
      </form>
    </ProfileItem>
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
      <DeleteAccountCard />

      <div className="page-actions">
        <button type="button" className="btn danger full" onClick={logOut}>
          Sign Out
        </button>
      </div>

      <p className="muted small profile-footer">
        <Link to="/privacy">Privacy policy</Link>
      </p>
    </div>
  )
}
