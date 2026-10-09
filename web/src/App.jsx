import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { getPendingInviteRedirect } from './inviteUtils'
import AuthPage from './pages/AuthPage'
import JoinPage from './pages/JoinPage'
import HouseholdsPage from './pages/HouseholdsPage'
import HouseholdDetailPage from './pages/HouseholdDetailPage'
import InvitesPage from './pages/InvitesPage'
import ProfilePage from './pages/ProfilePage'
import Layout from './components/Layout'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-page">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function LoginRoute() {
  const { user } = useAuth()
  if (user) {
    const pendingJoin = getPendingInviteRedirect()
    if (pendingJoin) {
      return <Navigate to={pendingJoin} replace />
    }
    return <Navigate to="/" replace />
  }
  return <AuthPage />
}

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return <div className="center-page">Loading...</div>
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/join" element={<JoinPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HouseholdsPage />} />
        <Route path="households/:id" element={<HouseholdDetailPage />} />
        <Route path="invites" element={<InvitesPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}
