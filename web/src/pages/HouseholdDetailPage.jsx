import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import ErrorBanner from '../components/ErrorBanner'
import { db } from '../firebase'
import { firestoreErrorMessage } from '../firestoreErrors'
import { DEFAULT_CURRENCY, formatCurrency, formatDateTime, HOUSEHOLD_CURRENCIES, toDate } from '../constants'
import InsightsCard from '../components/InsightsCard'
import { categoriesForHouseholdType, getHouseholdCategories, normalizeCategoryName, uniqCategories } from '../services/categories'
import {
  deleteHousehold,
  ensureHouseholdCategories,
  ensureHouseholdMembership,
  ensureMemberRecord,
  fetchHouseholdInvites,
  fetchHouseholdMembers,
  inviteMember,
  cancelInvite,
  leaveHousehold,
  syncJoinInviteMap,
  updateHouseholdCategories,
  updateHouseholdCurrency,
} from '../services/households'
import { buildInviteLink, buildInviteMailtoUrl } from '../inviteUtils'
import {
  addTransaction,
  deleteTransaction,
  fetchTransactions,
  filterTransactions,
  hasActiveFilters,
  memberOptionsFromTransactions,
  summarize,
} from '../services/transactions'

export default function HouseholdDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [household, setHousehold] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [invites, setInvites] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [filterCategories, setFilterCategories] = useState([])
  const [filterMemberId, setFilterMemberId] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      await ensureMemberRecord(id, user, profile)
      let householdData = await ensureHouseholdMembership(id, user.uid)
      if (!householdData) {
        const householdSnap = await getDoc(doc(db, 'households', id))
        if (!householdSnap.exists()) throw new Error('Household not found')
        householdData = { id: householdSnap.id, ...householdSnap.data() }
      }

      const [txs, pendingInvites] = await Promise.all([
        fetchTransactions(id),
        fetchHouseholdInvites(id),
      ])

      householdData = await syncJoinInviteMap(householdData, pendingInvites, user.uid)
      householdData = await ensureHouseholdCategories(householdData)
      setHousehold(householdData)
      setTransactions(txs)
      setInvites(pendingInvites)
      try {
        setMembers(await fetchHouseholdMembers(householdData, user.uid, profile, user))
      } catch {
        // The header falls back to the member count when names can't be loaded
      }
    } catch (err) {
      if (!silent) setHousehold(null)
      setError(firestoreErrorMessage(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const filters = useMemo(
    () => ({
      type: filterType,
      categories: filterCategories,
      memberId: filterMemberId,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
    }),
    [filterType, filterCategories, filterMemberId, filterDateFrom, filterDateTo]
  )

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters]
  )

  const summary = summarize(filteredTransactions)
  const householdCurrency = household?.currency || DEFAULT_CURRENCY
  const categoryLists = household ? getHouseholdCategories(household) : { expense: [], income: [] }
  const filterCategoryOptions = useMemo(() => {
    if (filterType === 'expense') return categoryLists.expense
    if (filterType === 'income') return categoryLists.income
    return uniqCategories([...categoryLists.expense, ...categoryLists.income])
  }, [filterType, categoryLists])
  const memberOptions = useMemo(() => memberOptionsFromTransactions(transactions), [transactions])
  const filtersActive = hasActiveFilters(filters)

  async function handleCategoriesUpdate(nextLists) {
    if (!household) return
    setActing(true)
    setError('')
    try {
      const updated = await updateHouseholdCategories(household.id, nextLists)
      setHousehold((prev) => ({ ...prev, ...updated }))
      setFilterCategories((prev) =>
        prev.filter((category) =>
          updated.expenseCategories.includes(category) || updated.incomeCategories.includes(category)
        )
      )
    } finally {
      setActing(false)
    }
  }

  function toggleFilterCategory(category) {
    setFilterCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category]
    )
  }

  function clearFilters() {
    setFilterType('all')
    setFilterCategories([])
    setFilterMemberId('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  async function handleCurrencyChange(nextCurrency) {
    if (!household || nextCurrency === householdCurrency) return
    setActing(true)
    setError('')
    try {
      await updateHouseholdCurrency(household.id, nextCurrency)
      setHousehold((prev) => ({ ...prev, currency: nextCurrency }))
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  async function handleDelete(transaction) {
    if (!confirm('Delete this entry?')) return
    try {
      await deleteTransaction(transaction.id)
      setTransactions((prev) => prev.filter((t) => t.id !== transaction.id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCancelInvite(invite) {
    if (!confirm(`Cancel invite for ${invite.email}?`)) return
    try {
      await cancelInvite(invite)
      setInvites((prev) => prev.filter((i) => i.id !== invite.id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleLeave() {
    if (!household || !user) return
    if (
      !confirm(
        `Leave "${household.name}"?\n\nYou will lose access to this household and its transactions.`
      )
    ) {
      return
    }

    setActing(true)
    setError('')
    try {
      await leaveHousehold(household, user.uid)
      navigate('/', { replace: true })
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  async function handleDeleteHousehold() {
    if (!household || !user) return
    const memberCount = household.memberIds?.length || 1
    const warning =
      memberCount > 1
        ? `This will permanently delete "${household.name}" for everyone, including all transactions and pending invites.`
        : `This will permanently delete "${household.name}" and all of its transactions.`

    if (!confirm(`${warning}\n\nThis cannot be undone. Continue?`)) return

    setActing(true)
    setError('')
    try {
      await deleteHousehold(household, user.uid)
      navigate('/', { replace: true })
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  const isOwner = household?.createdBy === user?.uid

  if (loading) {
    return (
      <div className="page">
        <Link to="/" className="back-link">← Households</Link>
        <p className="muted">Loading...</p>
      </div>
    )
  }

  if (!household) {
    return (
      <div className="page">
        <Link to="/" className="back-link">← Households</Link>
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        {!error && <p className="muted">Household not found.</p>}
        <button type="button" className="btn" onClick={load}>Try again</button>
      </div>
    )
  }

  return (
    <div className="page">
      <Link to="/" className="back-link">← Households</Link>
      <header className="page-header">
        <div className="page-title-block">
          <h1>{household.name}</h1>
          <div className="members-popover-anchor">
            <MembersBar
              members={members}
              memberCount={household.memberIds?.length || members.length || 1}
              inviteCount={invites.length}
              expanded={showMembers}
              onOpen={() => setShowMembers((open) => !open)}
              onInvite={() => setShowInvite(true)}
            />
            {showMembers && (
              <>
                <button
                  type="button"
                  className="popover-backdrop"
                  aria-label="Close members list"
                  onClick={() => setShowMembers(false)}
                />
                <MembersPopover
                  household={household}
                  user={user}
                  profile={profile}
                  members={members}
                  invites={invites}
                  onCancelInvite={handleCancelInvite}
                  onInvite={() => {
                    setShowMembers(false)
                    setShowInvite(true)
                  }}
                  onClose={() => setShowMembers(false)}
                />
              </>
            )}
          </div>
        </div>
        <button className="btn small primary" onClick={() => setShowAdd(true)}>+ Add</button>
      </header>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <section className="summary-card">
        <p className="summary-label">
          {filtersActive ? 'Filtered balance' : 'Balance'}
        </p>
        <p className={`summary-balance ${summary.balance >= 0 ? 'positive' : 'negative'}`}>
          {formatCurrency(summary.balance, householdCurrency)}
        </p>
        <div className="summary-row">
          <div>
            <span>Income</span>
            <strong className="positive">{formatCurrency(summary.income, householdCurrency)}</strong>
          </div>
          <div>
            <span>Expenses</span>
            <strong className="negative">{formatCurrency(summary.expenses, householdCurrency)}</strong>
          </div>
        </div>
        {filtersActive && (
          <p className="muted small summary-filter-note">
            Based on {filteredTransactions.length} of {transactions.length} entries
          </p>
        )}
      </section>

      <InsightsCard
        transactions={filteredTransactions}
        currency={householdCurrency}
        dateFrom={filterDateFrom}
        dateTo={filterDateTo}
      />

      <CategorySettings
        household={household}
        disabled={acting}
        onUpdate={handleCategoriesUpdate}
      />

      <section className="section-block">
        <div className="section-header">
          <h2>Transactions</h2>
          <button type="button" className="btn small" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? 'Hide filters' : 'Filter'}
          </button>
        </div>

        {showFilters && (
          <TransactionFilters
            filterType={filterType}
            setFilterType={setFilterType}
            filterCategories={filterCategories}
            toggleFilterCategory={toggleFilterCategory}
            filterCategoryOptions={filterCategoryOptions}
            filterMemberId={filterMemberId}
            setFilterMemberId={setFilterMemberId}
            memberOptions={memberOptions}
            filterDateFrom={filterDateFrom}
            setFilterDateFrom={setFilterDateFrom}
            filterDateTo={filterDateTo}
            setFilterDateTo={setFilterDateTo}
            onClear={clearFilters}
            filtersActive={filtersActive}
            onTypeChange={() => setFilterCategories([])}
          />
        )}

        {filteredTransactions.length === 0 ? (
          <p className="muted">
            {transactions.length === 0
              ? 'No transactions yet. Add an expense or income to get started.'
              : 'No transactions match these filters.'}
          </p>
        ) : (
          <div className="card-list compact">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="transaction-card">
                <div className="transaction-top">
                  <strong>{tx.category}</strong>
                  <span className={tx.type === 'income' ? 'positive' : ''}>
                    {formatCurrency(Math.abs(tx.amount), householdCurrency)}
                  </span>
                </div>
                {tx.note && <p>{tx.note}</p>}
                <p className="muted small">{formatDateTime(toDate(tx.timestamp))}</p>
                <p className="muted small">Added by {tx.createdByName}</p>
                {tx.createdBy === user.uid && (
                  <button className="link-btn danger" onClick={() => handleDelete(tx)}>Delete</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <h2>Currency</h2>
        <p className="muted small">All amounts in this household use the selected currency.</p>
        <label className="currency-setting">
          Currency
          <select
            value={householdCurrency}
            disabled={acting}
            onChange={(e) => handleCurrencyChange(e.target.value)}
          >
            {HOUSEHOLD_CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small preview-currency">
          Preview: {formatCurrency(1234.56, householdCurrency)}
        </p>
      </section>

      <section className="section-block danger-zone">
        <h2>Household Settings</h2>
        <p className="muted small">
          {isOwner
            ? 'Leave this household or delete it permanently. Only you can delete it.'
            : 'Leave this household if you no longer want access.'}
        </p>
        <div className="invite-action-stack">
          <button type="button" className="btn" disabled={acting} onClick={handleLeave}>
            {acting ? 'Working...' : 'Leave Household'}
          </button>
          {isOwner && (
            <button type="button" className="btn danger" disabled={acting} onClick={handleDeleteHousehold}>
              {acting ? 'Deleting...' : 'Delete Household'}
            </button>
          )}
        </div>
      </section>

      {showAdd && (
        <AddTransactionModal
          household={household}
          user={user}
          profile={profile}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false)
            await load()
          }}
        />
      )}

      {showInvite && (
        <InviteModal
          household={household}
          user={user}
          profile={profile}
          onClose={() => setShowInvite(false)}
          onInvited={() => load({ silent: true })}
        />
      )}
    </div>
  )
}

const AVATAR_LIMIT = 4

function initialFor(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?'
}

function MembersBar({ members, memberCount, inviteCount, expanded, onOpen, onInvite }) {
  const shown = members.slice(0, AVATAR_LIMIT)
  const extra = memberCount - shown.length

  return (
    <div className="members-bar">
      <button
        type="button"
        className="members-bar-open"
        aria-expanded={expanded}
        aria-label="Show household members"
        onClick={onOpen}
      >
        {shown.length > 0 && (
          <span className="avatar-stack" aria-hidden="true">
            {shown.map((member) => (
              <span key={member.userId} className="avatar-stack-item" title={member.name}>
                {initialFor(member.name)}
              </span>
            ))}
            {extra > 0 && <span className="avatar-stack-item more">+{extra}</span>}
          </span>
        )}
        <span className="members-bar-text">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
          {inviteCount > 0 && (
            <span className="members-bar-pending">
              {' · '}
              {inviteCount} pending
              <span className="hide-narrow"> {inviteCount === 1 ? 'invite' : 'invites'}</span>
            </span>
          )}
        </span>
      </button>
      <button type="button" className="avatar-add" aria-label="Invite a member" title="Invite a member" onClick={onInvite}>
        +
      </button>
    </div>
  )
}

function MembersPopover({ household, user, profile, members, invites, onCancelInvite, onInvite, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const inviterName = profile?.displayName || user.displayName || 'Someone'

  return (
    <div className="members-popover" role="dialog" aria-label="Household members">
      <div className="members-popover-header">
        <strong>Household Members</strong>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {members.length === 0 ? (
        <p className="muted small">Could not load member details.</p>
      ) : (
        <ul className="members-popover-list">
          {members.map((member) => (
            <li key={member.userId} className="members-popover-item">
              <div className="member-avatar">{initialFor(member.name)}</div>
              <div className="member-details">
                <div className="member-name-row">
                  <span className="member-name">{member.name}</span>
                  {member.isOwner && <span className="badge member-badge">Owner</span>}
                </div>
                {member.email && <span className="muted small member-email">{member.email}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <>
          <p className="members-popover-subheading">Pending invites</p>
          <ul className="members-popover-list">
            {invites.map((invite) => (
              <li key={invite.id} className="members-popover-item invite-item">
                <div className="member-avatar pending">{initialFor(invite.email)}</div>
                <div className="member-details">
                  <span className="member-name member-email">{invite.email}</span>
                  <span className="muted small">Invited by {invite.invitedByName}</span>
                  <div className="invite-item-actions">
                    {invite.token && (
                      <a
                        className="link-button"
                        href={buildInviteMailtoUrl({
                          householdName: household.name,
                          inviteEmail: invite.email,
                          link: buildInviteLink({ inviteId: invite.id, token: invite.token, email: invite.email }),
                          inviterName,
                        })}
                      >
                        Email again
                      </a>
                    )}
                    <button type="button" className="link-button danger" onClick={() => onCancelInvite(invite)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="btn small primary full members-popover-invite" onClick={onInvite}>
        + Invite someone
      </button>
      <p className="muted small members-popover-note">Invites are only for this household.</p>
    </div>
  )
}

function CategorySettings({ household, disabled, onUpdate }) {
  const [tab, setTab] = useState('expense')
  const [newName, setNewName] = useState('')
  const [localError, setLocalError] = useState('')
  const lists = getHouseholdCategories(household)
  const currentList = tab === 'income' ? lists.income : lists.expense

  async function handleAdd(e) {
    e.preventDefault()
    setLocalError('')
    const name = normalizeCategoryName(newName)
    if (!name) {
      setLocalError('Enter a category name.')
      return
    }
    if (currentList.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setLocalError('That category already exists.')
      return
    }

    const expenseCategories =
      tab === 'expense' ? uniqCategories([...lists.expense, name]) : lists.expense
    const incomeCategories =
      tab === 'income' ? uniqCategories([...lists.income, name]) : lists.income

    try {
      await onUpdate({ expenseCategories, incomeCategories })
      setNewName('')
    } catch (err) {
      setLocalError(err.message || 'Could not save categories.')
    }
  }

  async function handleRemove(name) {
    setLocalError('')
    if (currentList.length <= 1) {
      setLocalError('Keep at least one category in each list.')
      return
    }
    if (!confirm(`Remove "${name}" from ${tab} categories?`)) return

    const expenseCategories =
      tab === 'expense' ? lists.expense.filter((item) => item !== name) : lists.expense
    const incomeCategories =
      tab === 'income' ? lists.income.filter((item) => item !== name) : lists.income

    try {
      await onUpdate({ expenseCategories, incomeCategories })
    } catch (err) {
      setLocalError(err.message || 'Could not save categories.')
    }
  }

  return (
    <section className="section-block">
      <h2>Categories</h2>
      <p className="muted small">Customize expense and income categories for this household.</p>

      <div className="segmented category-tabs">
        <button
          type="button"
          className={tab === 'expense' ? 'active' : ''}
          disabled={disabled}
          onClick={() => {
            setTab('expense')
            setLocalError('')
          }}
        >
          Expense
        </button>
        <button
          type="button"
          className={tab === 'income' ? 'active' : ''}
          disabled={disabled}
          onClick={() => {
            setTab('income')
            setLocalError('')
          }}
        >
          Income
        </button>
      </div>

      <ul className="category-chip-list">
        {currentList.map((name) => (
          <li key={name} className="category-chip">
            <span>{name}</span>
            <button
              type="button"
              className="chip-remove"
              disabled={disabled || currentList.length <= 1}
              aria-label={`Remove ${name}`}
              onClick={() => handleRemove(name)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="category-add-form">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Add ${tab} category`}
          disabled={disabled}
        />
        <button type="submit" className="btn small" disabled={disabled}>
          Add
        </button>
      </form>
      {localError && <p className="error-text">{localError}</p>}
    </section>
  )
}

function TransactionFilters({
  filterType,
  setFilterType,
  filterCategories,
  toggleFilterCategory,
  filterCategoryOptions,
  filterMemberId,
  setFilterMemberId,
  memberOptions,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  onClear,
  filtersActive,
  onTypeChange,
}) {
  return (
    <div className="filter-panel stack">
      <label>
        Type
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value)
            onTypeChange()
          }}
        >
          <option value="all">All</option>
          <option value="expense">Expenses only</option>
          <option value="income">Income only</option>
        </select>
      </label>

      <div>
        <span className="filter-label">Categories</span>
        <div className="filter-chip-grid">
          {filterCategoryOptions.map((category) => (
            <button
              key={category}
              type="button"
              className={`filter-chip ${filterCategories.includes(category) ? 'active' : ''}`}
              onClick={() => toggleFilterCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <p className="muted small">Tap categories to filter. Leave none selected to show all.</p>
      </div>

      <label>
        Added by
        <select value={filterMemberId} onChange={(e) => setFilterMemberId(e.target.value)}>
          <option value="all">Everyone</option>
          {memberOptions.map(([memberId, name]) => (
            <option key={memberId} value={memberId}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <div className="filter-date-row">
        <label>
          From
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
        </label>
      </div>

      {filtersActive && (
        <button type="button" className="btn small" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  )
}

function AddTransactionModal({ household, user, profile, onClose, onSaved }) {
  const [type, setType] = useState('expense')
  const expenseCategories = categoriesForHouseholdType(household, 'expense')
  const incomeCategories = categoriesForHouseholdType(household, 'income')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(expenseCategories[0] || 'Other')
  const [note, setNote] = useState('')
  const [timestamp, setTimestamp] = useState(toLocalInputValue(new Date()))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleTypeChange(nextType) {
    setType(nextType)
    const nextList = categoriesForHouseholdType(household, nextType)
    setCategory(nextList[0] || 'Other')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = Number(amount)
    if (!parsed || parsed <= 0) {
      setError('Enter a valid amount')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addTransaction({
        householdId: household.id,
        amount: parsed,
        type,
        category,
        note: note.trim(),
        timestamp: new Date(timestamp),
        createdBy: user.uid,
        createdByName: profile?.displayName || user.displayName || 'User',
      })
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const categoryOptions = type === 'income' ? incomeCategories : expenseCategories

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Entry</h2>
        <form onSubmit={handleSubmit} className="stack">
          <div className="segmented">
            <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => handleTypeChange('expense')}>
              Expense
            </button>
            <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => handleTypeChange('income')}>
              Income
            </button>
          </div>
          <label>
            Amount
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Date & Time
            <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} required />
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="row-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddTransactionModalOldRemove({ householdId, user, profile, onClose, onSaved }) {
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categoriesForType('expense')[0])
  const [note, setNote] = useState('')
  const [timestamp, setTimestamp] = useState(toLocalInputValue(new Date()))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleTypeChange(nextType) {
    setType(nextType)
    setCategory(categoriesForType(nextType)[0])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = Number(amount)
    if (!parsed || parsed <= 0) {
      setError('Enter a valid amount')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addTransaction({
        householdId,
        amount: parsed,
        type,
        category,
        note: note.trim(),
        timestamp: new Date(timestamp),
        createdBy: user.uid,
        createdByName: profile?.displayName || user.displayName || 'User',
      })
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Entry</h2>
        <form onSubmit={handleSubmit} className="stack">
          <div className="segmented">
            <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => handleTypeChange('expense')}>
              Expense
            </button>
            <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => handleTypeChange('income')}>
              Income
            </button>
          </div>
          <label>
            Amount
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoriesForType(type).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Date & Time
            <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} required />
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="row-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InviteModal({ household, user, profile, onClose, onInvited }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [inviteResult, setInviteResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const inviterName = profile?.displayName || user.displayName || 'Someone'

  const mailtoUrl = inviteResult
    ? buildInviteMailtoUrl({
        householdName: household.name,
        inviteEmail: inviteResult.email,
        link: inviteResult.link,
        inviterName,
      })
    : ''

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await inviteMember(email, household, user, profile)
      setInviteResult(result)
      onInvited()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDone() {
    onClose()
  }

  async function copyLink() {
    if (!inviteResult?.link) return
    try {
      await navigator.clipboard.writeText(inviteResult.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link. Select and copy it manually.')
    }
  }

  async function shareLink() {
    if (!inviteResult?.link) return
    const text = `Join "${household.name}" on Budget Tracker: ${inviteResult.link}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Budget Tracker Invite',
          text,
          url: inviteResult.link,
        })
      } catch (err) {
        if (err.name !== 'AbortError') {
          await copyLink()
        }
      }
    } else {
      await copyLink()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Invite Member</h2>

        {!inviteResult ? (
          <form onSubmit={handleSubmit} className="stack">
            <label>
              Email address
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <p className="muted small">
              Enter their email and create the invite. Then tap Send Email to open your mail app.
              Invites cannot be sent to existing members or anyone with a pending invite.
            </p>
            {error && <p className="error-text">{error}</p>}
            <div className="row-actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Invite'}
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <p className="success-text">
              Invite created for <strong>{inviteResult.email}</strong>
            </p>
            <label>
              Invite link
              <input readOnly value={inviteResult.link} onFocus={(e) => e.target.select()} />
            </label>
            <p className="muted small">
              Tap <strong>Send Email</strong> below to open your mail app. They must sign in with{' '}
              <strong>{inviteResult.email}</strong>.
            </p>
            <div className="invite-action-stack">
              <a className="btn primary full" href={mailtoUrl}>
                Send Email to {inviteResult.email}
              </a>
              <button type="button" className="btn full" onClick={shareLink}>
                Share Link (WhatsApp, Messages...)
              </button>
              <button type="button" className="btn full" onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
            <button type="button" className="link-btn" onClick={handleDone}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
