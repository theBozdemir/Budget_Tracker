import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import ErrorBanner from '../components/ErrorBanner'
import { firestoreErrorMessage } from '../firestoreErrors'
import { acceptInvite, declineInvite, fetchPendingInvitesForEmail } from '../services/households'
import { normalizedEmail } from '../services/users'

export default function InvitesPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setInvites(await fetchPendingInvitesForEmail(user, profile))
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user || authLoading) return
    load()
  }, [user?.uid, profile?.email, user?.email, authLoading])

  async function handleAccept(invite) {
    setActingOn(`${invite.id}-accept`)
    setError('')
    try {
      await acceptInvite(invite, user, profile)
      setInvites((prev) => prev.filter((i) => i.id !== invite.id))
      navigate('/', { replace: true })
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActingOn(null)
    }
  }

  async function handleDecline(invite) {
    if (!confirm(`Decline invite to join ${invite.householdName}?`)) return
    setActingOn(`${invite.id}-decline`)
    setError('')
    try {
      await declineInvite(invite, user, profile)
      setInvites((prev) => prev.filter((i) => i.id !== invite.id))
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActingOn(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Invites</h1>
        <button type="button" className="btn small" onClick={load} disabled={loading}>
          Refresh
        </button>
      </header>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <p className="muted">Loading invites...</p>
      ) : invites.length === 0 ? (
        <div className="empty-card">
          <h2>No pending invites</h2>
          <p>When someone invites you to a household, it will show up here.</p>
        </div>
      ) : (
        <div className="card-list">
          {invites.map((invite) => (
            <div key={invite.id} className="card">
              <strong>{invite.householdName}</strong>
              <p className="muted">Invited by {invite.invitedByName}</p>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={actingOn != null}
                  onClick={() => handleDecline(invite)}
                >
                  {actingOn === `${invite.id}-decline` ? 'Declining...' : 'Decline'}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={actingOn != null}
                  onClick={() => handleAccept(invite)}
                >
                  {actingOn === `${invite.id}-accept` ? 'Joining...' : 'Accept'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
