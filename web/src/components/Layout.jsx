import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { fetchPendingInvitesForEmail } from '../services/households'

function MenuIcon({ name }) {
  const paths = {
    households: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    invites: 'M3 6h18v12H3zM3 7l9 6 9-6',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    signout: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 17l5-5-5-5M21 12H9',
  }
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Avatar({ name, photoURL, size = 'small' }) {
  if (photoURL) {
    return <img className={`user-avatar ${size}`} src={photoURL} alt="" referrerPolicy="no-referrer" />
  }
  return (
    <span className={`user-avatar ${size}`} aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export default function Layout() {
  const { user, profile, logOut } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [inviteCount, setInviteCount] = useState(0)
  const menuRef = useRef(null)

  const name = profile?.displayName || user?.displayName || user?.email || 'Account'

  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    fetchPendingInvitesForEmail(user, profile)
      .then((invites) => {
        if (!cancelled) setInviteCount(invites.length)
      })
      .catch(() => {
        // The badge is a convenience; the Invites page shows any real error
      })
    return () => {
      cancelled = true
    }
  }, [user, profile, location.pathname])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined
    function handlePointer(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    function handleKey(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  const itemClass = ({ isActive }) => (isActive ? 'account-menu-item active' : 'account-menu-item')

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-inner">
          <Link to="/" className="top-bar-brand">Budget Tracker</Link>

          <div className="account-menu-anchor" ref={menuRef}>
            <button
              type="button"
              className="account-button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Avatar name={name} photoURL={user?.photoURL} />
              {inviteCount > 0 && <span className="account-button-dot" aria-hidden="true" />}
            </button>

            {menuOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-header">
                  <Avatar name={name} photoURL={user?.photoURL} size="large" />
                  <strong className="account-menu-name">{name}</strong>
                  {user?.email && <span className="account-menu-email">{user.email}</span>}
                </div>

                <nav className="account-menu-list">
                  <NavLink to="/" end className={itemClass} role="menuitem">
                    <MenuIcon name="households" />
                    Households
                  </NavLink>
                  <NavLink to="/invites" className={itemClass} role="menuitem">
                    <MenuIcon name="invites" />
                    Invites
                    {inviteCount > 0 && <span className="account-menu-badge">{inviteCount}</span>}
                  </NavLink>
                  <NavLink to="/profile" className={itemClass} role="menuitem">
                    <MenuIcon name="profile" />
                    Profile settings
                  </NavLink>
                </nav>

                <div className="account-menu-list bordered">
                  <button type="button" className="account-menu-item" role="menuitem" onClick={logOut}>
                    <MenuIcon name="signout" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
