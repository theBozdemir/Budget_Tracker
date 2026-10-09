import { useAuth } from '../AuthContext'

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

      <div className="page-actions">
        <button type="button" className="btn danger full" onClick={logOut}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
