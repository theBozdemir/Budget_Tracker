import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import ErrorBanner from '../components/ErrorBanner'
import { DEFAULT_CURRENCY, formatCurrency, HOUSEHOLD_CURRENCIES } from '../constants'
import { firestoreErrorMessage } from '../firestoreErrors'
import { createHousehold, fetchHouseholds } from '../services/households'

export default function HouseholdsPage() {
  const { user, loading: authLoading } = useAuth()
  const [households, setHouseholds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [creating, setCreating] = useState(false)

  function closeCreateModal() {
    setShowCreate(false)
    setName('')
    setCurrency(DEFAULT_CURRENCY)
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      setHouseholds(await fetchHouseholds(user.uid))
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user || authLoading) return
    load()
  }, [user?.uid, authLoading])

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const household = await createHousehold(name, user, currency)
      setHouseholds((prev) => [...prev, household])
      closeCreateModal()
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Households</h1>
        <button className="btn small" onClick={() => setShowCreate(true)}>+ New</button>
      </header>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <p className="muted">Loading households...</p>
      ) : households.length === 0 ? (
        <div className="empty-card">
          <h2>No households yet</h2>
          <p>Create one for your family or roommates. Each group keeps its finances private.</p>
          <button className="btn primary" onClick={() => setShowCreate(true)}>Create Household</button>
        </div>
      ) : (
        <div className="card-list">
          {households.map((household) => (
            <Link key={household.id} to={`/households/${household.id}`} className="card-link">
              <strong>{household.name}</strong>
              <span>
                {household.memberIds?.length || 1} member{(household.memberIds?.length || 1) === 1 ? '' : 's'}
                {' · '}
                {household.currency || DEFAULT_CURRENCY}
              </span>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Household</h2>
            <form onSubmit={handleCreate} className="stack">
              <label>
                Household name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Our Family, Apartment 402..."
                  required
                />
              </label>
              <label>
                Currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {HOUSEHOLD_CURRENCIES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small preview-currency">
                Preview: {formatCurrency(1234.56, currency)}
              </p>
              <div className="row-actions">
                <button type="button" className="btn" onClick={closeCreateModal}>Cancel</button>
                <button className="btn primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
