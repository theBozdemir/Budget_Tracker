import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import ErrorBanner from '../components/ErrorBanner'
import VerifyEmailNotice from '../components/VerifyEmailNotice'
import { firestoreErrorMessage } from '../firestoreErrors'
import {
  clearPendingInviteSession,
  savePendingInviteSession,
} from '../inviteUtils'
import { acceptInvite, declineInvite, fetchInviteForJoin } from '../services/households'
import { ensureUserProfile, normalizedEmail } from '../services/users'

function clearPendingInviteToken() {
  clearPendingInviteSession()
}

export default function JoinPage() {
  const [searchParams] = useSearchParams()
  const inviteId = searchParams.get('invite')
  const token = searchParams.get('token')
  const emailHint = searchParams.get('email')?.toLowerCase() || ''
  const navigate = useNavigate()
  const { user, profile, emailVerified, loading } = useAuth()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    if (!inviteId && !token) {
      clearPendingInviteToken()
      navigate('/', { replace: true })
      return
    }

    savePendingInviteSession({
      inviteId,
      token,
      email: emailHint || invite?.email || '',
    })

    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [inviteId, token, user, loading, navigate, emailHint, invite?.email])

  useEffect(() => {
    async function loadInvite() {
      if (!user || loading || !emailVerified || (!inviteId && !token)) return
      setError('')
      setInvite(null)
      try {
        await ensureUserProfile(user)
        const accountEmail = normalizedEmail(user, profile)
        const found = await fetchInviteForJoin({ inviteId, token, email: accountEmail })
        if (!found) {
          clearPendingInviteToken()
          const hint = emailHint || accountEmail
          setError(
            hint
              ? `This invite link is invalid, expired, or was sent to ${hint}. Sign in with the email that received the invite.`
              : 'This invite link is invalid, expired, or was sent to a different email address.'
          )
          return
        }
        savePendingInviteSession({
          inviteId: found.id,
          token: found.token || token,
          email: found.email,
        })
        setInvite(found)
      } catch (err) {
        setError(firestoreErrorMessage(err))
      }
    }

    if (user && !loading && emailVerified && (inviteId || token)) {
      loadInvite()
    }
  }, [user, profile, inviteId, token, loading, emailHint, emailVerified])

  async function handleAccept() {
    if (!invite || !user) return
    setActing(true)
    setError('')
    try {
      await acceptInvite(invite, user, profile)
      clearPendingInviteToken()
      navigate('/', { replace: true })
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  async function handleDecline() {
    if (!invite || !user) return
    if (!confirm(`Decline invite to join ${invite.householdName}?`)) return
    setActing(true)
    setError('')
    try {
      await declineInvite(invite, user, profile)
      clearPendingInviteToken()
      navigate('/', { replace: true })
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  function handleDismiss() {
    setError('')
    clearPendingInviteToken()
    navigate('/', { replace: true })
  }

  if (loading || (!user && (inviteId || token))) {
    return (
      <div className="center-page">
        <p className="muted">Loading invite...</p>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-circle">$</div>
          <h1>Join Household</h1>
        </div>

        <ErrorBanner message={error} onDismiss={handleDismiss} />

        {user && !emailVerified && <VerifyEmailNotice />}

        {invite && (
          <div className="stack">
            <p>
              You were invited to join <strong>{invite.householdName}</strong> by{' '}
              <strong>{invite.invitedByName}</strong>.
            </p>
            <div className="invite-action-stack">
              <button type="button" className="btn" disabled={acting} onClick={handleDecline}>
                {acting ? 'Working...' : 'Decline'}
              </button>
              <button type="button" className="btn primary" disabled={acting} onClick={handleAccept}>
                {acting ? 'Joining...' : 'Accept'}
              </button>
            </div>
            <Link to="/invites" className="link-btn">View all invites</Link>
          </div>
        )}

        {!invite && !error && user && emailVerified && (
          <p className="muted">Checking invite...</p>
        )}

        {!invite && error && (
          <button type="button" className="btn primary full" onClick={handleDismiss}>
            Go to Households
          </button>
        )}
      </div>
    </div>
  )
}
