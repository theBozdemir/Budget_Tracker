import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import ErrorBanner from '../components/ErrorBanner'
import { db } from '../firebase'
import { firestoreErrorMessage } from '../firestoreErrors'
import { DEFAULT_CURRENCY, formatCurrency, formatDateTime, HOUSEHOLD_CURRENCIES, toDate } from '../constants'
import BudgetCard from '../components/BudgetCard'
import InsightsCard from '../components/InsightsCard'
import RecurringSettings from '../components/RecurringSettings'
import useDragSelect from '../hooks/useDragSelect'
import {
  currentMonthKey,
  dateInMonth,
  isInMonth,
  monthEndInput,
  monthKeyOf,
  monthLabel,
  monthsWithEntries,
  shiftMonth,
} from '../months'
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
  updateHouseholdBudgets,
  updateHouseholdCategories,
  updateHouseholdCurrency,
} from '../services/households'
import { buildInviteLink, buildInviteMailtoUrl } from '../inviteUtils'
import {
  addTransaction,
  deleteTransaction,
  deleteTransactions,
  fetchTransactions,
  updateTransaction,
  updateTransactions,
  filterTransactions,
  hasActiveFilters,
  memberOptionsFromTransactions,
  summarize,
} from '../services/transactions'
import {
  createRecurring,
  deleteRecurring,
  fetchRecurring,
  postDueRecurring,
  recurringPlan,
  upcomingForMonth,
  updateRecurring,
} from '../services/recurring'

export default function HouseholdDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [household, setHousehold] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [invites, setInvites] = useState([])
  const [members, setMembers] = useState([])
  const [recurring, setRecurring] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [filterCategories, setFilterCategories] = useState([])
  const [filterMemberId, setFilterMemberId] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  // Always open on the current month; older months are one tap away
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [pageSize, setPageSize] = useState(readPageSize)
  const [visibleCount, setVisibleCount] = useState(pageSize)

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

      const [txs, pendingInvites, templates] = await Promise.all([
        fetchTransactions(id),
        fetchHouseholdInvites(id),
        // Older security rules don't know about recurring entries yet; carry on without them
        fetchRecurring(id).catch(() => []),
      ])

      // Add any recurring entries that have come due since someone last opened the household
      let postedRecurring = []
      try {
        postedRecurring = await postDueRecurring(templates, user)
      } catch (err) {
        console.warn('Could not add recurring entries:', err)
      }
      const allTransactions = [...postedRecurring, ...txs].sort(
        (a, b) => toDate(b.timestamp) - toDate(a.timestamp)
      )

      householdData = await syncJoinInviteMap(householdData, pendingInvites, user.uid)
      householdData = await ensureHouseholdCategories(householdData)
      setHousehold(householdData)
      setTransactions(allTransactions)
      setRecurring(templates)
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

  // A custom date range from the filters replaces the month view
  const customRange = Boolean(filterDateFrom || filterDateTo)

  // Everything matching the filters, across all months (used for trends)
  const matchingTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters]
  )

  // What the page shows: the selected month, or the custom date range
  const filteredTransactions = useMemo(
    () => (customRange ? matchingTransactions : matchingTransactions.filter((tx) => isInMonth(tx, selectedMonth))),
    [matchingTransactions, customRange, selectedMonth]
  )

  const periodTotal = useMemo(
    () => (customRange ? transactions.length : transactions.filter((tx) => isInMonth(tx, selectedMonth)).length),
    [transactions, customRange, selectedMonth]
  )

  const thisMonth = currentMonthKey()
  const monthOptions = useMemo(
    () => monthsWithEntries(transactions, [thisMonth, selectedMonth]),
    [transactions, thisMonth, selectedMonth]
  )
  const periodLabel = customRange ? 'Selected dates' : monthLabel(selectedMonth)

  // Start again from the newest entries whenever the period, filters or list size change
  useEffect(() => {
    setVisibleCount(pageSize)
  }, [filters, pageSize, selectedMonth])

  const canEditTransaction = (tx) => tx.createdBy === user?.uid || household?.createdBy === user?.uid
  const selectableTransactions = filteredTransactions.filter(canEditTransaction)
  const selectedTransactions = filteredTransactions.filter((tx) => selectedIds.has(tx.id))

  // Only keep selections that are still on screen after the period or filters change
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filteredTransactions.map((tx) => tx.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredTransactions])

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleBulkDelete() {
    const count = selectedTransactions.length
    if (!count) return
    if (!confirm(`Delete ${count} ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`)) return
    setBulkBusy(true)
    setError('')
    try {
      const ids = selectedTransactions.map((tx) => tx.id)
      await deleteTransactions(ids)
      const removed = new Set(ids)
      setTransactions((prev) => prev.filter((t) => !removed.has(t.id)))
      exitSelectMode()
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkEdit(updates) {
    await updateTransactions(updates, user.uid)
    const byId = new Map(updates.map((update) => [update.id, update.changes]))
    setTransactions((prev) =>
      prev
        .map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id), updatedAt: new Date(), updatedBy: user.uid } : t))
        .sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp))
    )
    setShowBulkEdit(false)
    exitSelectMode()
  }

  const visibleTransactions = visibleCount === 0 ? filteredTransactions : filteredTransactions.slice(0, visibleCount)
  const hiddenCount = filteredTransactions.length - visibleTransactions.length

  const listRef = useRef(null)
  const { onPointerDown: onListPointerDown } = useDragSelect({
    listRef,
    orderedIds: visibleTransactions.filter(canEditTransaction).map((tx) => tx.id),
    selectedIds,
    setSelectedIds,
    onStart: () => setSelectMode(true),
    bottomInset: 90,
  })

  const summary = summarize(filteredTransactions)

  // Recurring entries still to come in the month being viewed (none for past months)
  const upcoming = useMemo(
    () => (customRange || selectedMonth < currentMonthKey() ? [] : upcomingForMonth(recurring, selectedMonth)),
    [recurring, selectedMonth, customRange]
  )
  const upcomingNet = upcoming.reduce(
    (net, { template }) => net + (template.type === 'income' ? 1 : -1) * Math.abs(template.amount),
    0
  )
  const canEditRecurring = (template) =>
    template.createdBy === user?.uid || household?.createdBy === user?.uid
  const householdCurrency = household?.currency || DEFAULT_CURRENCY
  const categoryLists = household ? getHouseholdCategories(household) : { expense: [], income: [] }
  const filterCategoryOptions = useMemo(() => {
    if (filterType === 'expense') return categoryLists.expense
    if (filterType === 'income') return categoryLists.income
    return uniqCategories([...categoryLists.expense, ...categoryLists.income])
  }, [filterType, categoryLists])
  const memberOptions = useMemo(() => memberOptionsFromTransactions(transactions), [transactions])
  const filtersActive = hasActiveFilters({ ...filters, dateFrom: '', dateTo: '' })

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
    if (!confirm('Delete this entry? This cannot be undone.')) return false
    await deleteTransaction(transaction.id)
    setTransactions((prev) => prev.filter((t) => t.id !== transaction.id))
    return true
  }

  function handleEdited(id, changes) {
    setTransactions((prev) =>
      prev
        .map((t) => (t.id === id ? { ...t, ...changes } : t))
        .sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp))
    )
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
      <header className="page-header household-header">
        <div className="household-title">
          <h1>{household.name}</h1>
          <button
            type="button"
            className="avatar-add"
            aria-label="Invite a member"
            title="Invite a member"
            onClick={() => setShowInvite(true)}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn small icon-btn"
            aria-label="Household settings"
            title="Household settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
          <button className="btn small primary" onClick={() => setShowAdd(true)}>+ Add</button>
        </div>
        <button
          type="button"
          className="members-toggle"
          aria-expanded={showMembers}
          aria-controls="members-card"
          onClick={() => setShowMembers((open) => !open)}
        >
          {memberCountLabel(household.memberIds?.length || members.length || 1)}
          <span className={`insights-chevron${showMembers ? ' open' : ''}`} aria-hidden="true">▾</span>
        </button>
        {showMembers && (
          <MembersCard
            household={household}
            user={user}
            profile={profile}
            members={members}
            invites={invites}
            onCancelInvite={handleCancelInvite}
            onInvite={() => setShowInvite(true)}
          />
        )}
      </header>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {customRange ? (
        <div className="month-bar custom">
          <span>Showing the dates chosen in Filter</span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setFilterDateFrom('')
              setFilterDateTo('')
            }}
          >
            Back to months
          </button>
        </div>
      ) : (
        <div className="month-bar">
          <button
            type="button"
            className="month-step"
            aria-label="Previous month"
            onClick={() => setSelectedMonth((key) => shiftMonth(key, -1))}
          >
            ‹
          </button>
          <label className="month-select">
            <span className="visually-hidden">Month</span>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {monthOptions.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="month-step"
            aria-label="Next month"
            onClick={() => setSelectedMonth((key) => shiftMonth(key, 1))}
          >
            ›
          </button>
          {selectedMonth !== thisMonth && (
            <button type="button" className="link-button month-today" onClick={() => setSelectedMonth(thisMonth)}>
              Today
            </button>
          )}
        </div>
      )}

      <section className="summary-card">
        <p className="summary-label">
          {filtersActive ? `${periodLabel} · filtered` : periodLabel} balance
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
        {upcoming.length > 0 && !filtersActive && (
          <p className="muted small summary-filter-note">
            After upcoming recurring entries:{' '}
            <strong className={summary.balance + upcomingNet >= 0 ? 'positive' : 'negative'}>
              {formatCurrency(summary.balance + upcomingNet, householdCurrency)}
            </strong>
          </p>
        )}
        {filtersActive && (
          <p className="muted small summary-filter-note">
            Based on {filteredTransactions.length} of {periodTotal} entries
          </p>
        )}
      </section>

      {!customRange && (
        <BudgetCard
          household={household}
          transactions={transactions}
          monthKey={selectedMonth}
          currency={householdCurrency}
          recurringPlan={recurringPlan(recurring, selectedMonth)}
          onSave={async (budgets) => {
            await updateHouseholdBudgets(household.id, budgets)
            setHousehold((prev) => ({ ...prev, budgets }))
          }}
        />
      )}

      <InsightsCard
        transactions={matchingTransactions}
        periodTransactions={filteredTransactions}
        currency={householdCurrency}
        dateFrom={filterDateFrom}
        dateTo={customRange ? filterDateTo : monthEndInput(selectedMonth)}
        compareMonth={customRange ? null : selectedMonth}
      />

      <section className="section-block">
        <div className="section-header">
          <h2>Transactions</h2>
          <div className="transactions-tools">
            <label className="page-size-select">
              Show
              <select
                value={pageSize}
                onChange={(e) => {
                  const size = Number(e.target.value)
                  setPageSize(size)
                  savePageSize(size)
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
                <option value={0}>All</option>
              </select>
            </label>
            <button type="button" className="btn small" onClick={() => setShowFilters((v) => !v)}>
              {showFilters ? 'Hide filters' : 'Filter'}
            </button>
            {selectableTransactions.length > 0 && (
              <button
                type="button"
                className={`btn small${selectMode ? ' primary' : ''}`}
                aria-pressed={selectMode}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                {selectMode ? 'Done' : 'Select'}
              </button>
            )}
          </div>
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
              : periodTotal === 0
                ? `No transactions in ${periodLabel} yet.`
                : 'No transactions match these filters.'}
          </p>
        ) : (
          <>
            <div className="card-list compact" ref={listRef} onPointerDown={onListPointerDown}>
              {visibleTransactions.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  currency={householdCurrency}
                  canEdit={canEditTransaction(tx)}
                  onEdit={setEditingTransaction}
                  selectMode={selectMode}
                  selected={selectedIds.has(tx.id)}
                  onToggleSelect={toggleSelected}
                />
              ))}
            </div>
            <div className="load-more">
              <p className="muted small">
                Showing {visibleTransactions.length} of {filteredTransactions.length}
              </p>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
                >
                  Load {Math.min(hiddenCount, LOAD_MORE_STEP)} more
                </button>
              )}
            </div>
          </>
        )}

        {upcoming.length > 0 && (
          <div className="upcoming">
            <h3>Upcoming this month</h3>
            <ul className="card-list compact">
              {upcoming.map(({ template, date }) => (
                <li key={template.id} className="transaction-card upcoming-item">
                  <div className="transaction-summary">
                    <span className="transaction-category">
                      <strong>{template.category}</strong>
                      <span className="transaction-date">
                        {' · due '}
                        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </span>
                    <span className={`transaction-amount ${template.type === 'income' ? 'positive' : 'negative'}`}>
                      {template.type === 'income' ? '+' : '−'}
                      {formatCurrency(Math.abs(template.amount), householdCurrency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">Added automatically on their day. Manage them in ⚙ Settings.</p>
          </div>
        )}
      </section>

      {showAdd && (
        <TransactionModal
          household={household}
          user={user}
          profile={profile}
          defaultDate={customRange || selectedMonth === thisMonth ? new Date() : dateInMonth(selectedMonth)}
          onClose={() => setShowAdd(false)}
          onCreateRecurring={async (template) => {
            const recurringId = await createRecurring(template)
            setRecurring((prev) => [...prev, { id: recurringId, ...template, active: true }])
            return recurringId
          }}
          onSaved={async () => {
            setShowAdd(false)
            await load()
          }}
        />
      )}

      {selectMode && <div className="bulk-bar-spacer" aria-hidden="true" />}

      {selectMode && (
        <div className="bulk-bar" role="toolbar" aria-label="Selected transactions">
          <div className="bulk-bar-inner">
            <span className="bulk-count">
              {selectedTransactions.length ? `${selectedTransactions.length} selected` : 'Tap, or hold and slide'}
            </span>
            <button
              type="button"
              className="link-button"
              onClick={() =>
                setSelectedIds(
                  selectedTransactions.length === selectableTransactions.length
                    ? new Set()
                    : new Set(selectableTransactions.map((tx) => tx.id))
                )
              }
            >
              {selectedTransactions.length === selectableTransactions.length
                ? 'Clear'
                : `Select all ${selectableTransactions.length}`}
            </button>
            <div className="bulk-actions">
              <button
                type="button"
                className="btn small"
                disabled={!selectedTransactions.length || bulkBusy}
                onClick={() => setShowBulkEdit(true)}
              >
                Change…
              </button>
              <button
                type="button"
                className="btn small danger"
                disabled={!selectedTransactions.length || bulkBusy}
                onClick={handleBulkDelete}
              >
                {bulkBusy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkEdit && (
        <BulkEditModal
          household={household}
          transactions={selectedTransactions}
          onClose={() => setShowBulkEdit(false)}
          onSave={handleBulkEdit}
        />
      )}

      {editingTransaction && (
        <TransactionModal
          household={household}
          user={user}
          profile={profile}
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={(changes) => {
            handleEdited(editingTransaction.id, changes)
            setEditingTransaction(null)
          }}
          onDelete={async () => {
            if (await handleDelete(editingTransaction)) setEditingTransaction(null)
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          household={household}
          currency={householdCurrency}
          isOwner={isOwner}
          acting={acting}
          onCategoriesUpdate={handleCategoriesUpdate}
          onCurrencyChange={handleCurrencyChange}
          recurring={recurring}
          canEditRecurring={canEditRecurring}
          onRecurringUpdate={async (recurringId, changes) => {
            await updateRecurring(recurringId, changes)
            setRecurring((prev) => prev.map((t) => (t.id === recurringId ? { ...t, ...changes } : t)))
          }}
          onRecurringDelete={async (recurringId) => {
            await deleteRecurring(recurringId)
            setRecurring((prev) => prev.filter((t) => t.id !== recurringId))
          }}
          onLeave={handleLeave}
          onDelete={handleDeleteHousehold}
          onClose={() => setShowSettings(false)}
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

const LOAD_MORE_STEP = 10
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const PAGE_SIZE_KEY = 'transactions.pageSize'

// 0 means "show all"
function readPageSize() {
  try {
    const stored = localStorage.getItem(PAGE_SIZE_KEY)
    const saved = stored === null ? NaN : Number(stored)
    return saved === 0 || PAGE_SIZE_OPTIONS.includes(saved) ? saved : PAGE_SIZE_OPTIONS[0]
  } catch {
    return PAGE_SIZE_OPTIONS[0]
  }
}

function savePageSize(size) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size))
  } catch {
    // The choice just won't be remembered
  }
}

function initialFor(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?'
}

function memberCountLabel(count) {
  return `${count} ${count === 1 ? 'member' : 'members'}`
}

function MembersCard({ household, user, profile, members, invites, onCancelInvite, onInvite }) {
  const inviterName = profile?.displayName || user.displayName || 'Someone'

  return (
    <div id="members-card" className="members-card">
      <p className="members-popover-subheading first">In this household</p>

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

function TransactionItem({ transaction: tx, currency, canEdit, onEdit, selectMode, selected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false)
  const isIncome = tx.type === 'income'
  const detailsId = `tx-details-${tx.id}`
  const showDetails = expanded && !selectMode
  const amountText = `${isIncome ? '+' : '−'}${formatCurrency(Math.abs(tx.amount), currency)}`

  // The row keeps the same elements in both modes (only the checkbox and date
  // appear), so a finger holding it isn't lost when select mode switches on
  const className = [
    'transaction-card',
    showDetails && 'expanded',
    selectMode && 'selectable',
    selectMode && selected && 'selected',
    selectMode && !canEdit && 'locked',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} data-select-id={tx.id} data-selectable={canEdit}>
      <button
        type="button"
        className="transaction-summary"
        {...(selectMode
          ? { role: 'checkbox', 'aria-checked': selected, 'aria-disabled': !canEdit }
          : { 'aria-expanded': showDetails, 'aria-controls': detailsId })}
        aria-label={selectMode ? `${tx.category} ${amountText}` : undefined}
        onClick={() => {
          if (!selectMode) setExpanded((open) => !open)
          else if (canEdit) onToggleSelect(tx.id)
        }}
      >
        {selectMode && <span className={`transaction-check${selected ? ' checked' : ''}`} aria-hidden="true" />}
        <span className="transaction-category">
          <strong>{tx.category}</strong>
          {selectMode && (
            <span className="transaction-date">
              {' · '}
              {toDate(tx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {!canEdit && ` · ${tx.createdByName}`}
            </span>
          )}
        </span>
        <span className={`transaction-amount ${isIncome ? 'positive' : 'negative'}`}>{amountText}</span>
        {!selectMode && (
          <span className={`insights-chevron${expanded ? ' open' : ''}`} aria-hidden="true">▾</span>
        )}
      </button>

      {showDetails && (
        <div id={detailsId} className="transaction-details">
          {tx.note && <p>{tx.note}</p>}
          <p className="muted small">{isIncome ? 'Income' : 'Expense'} · {formatDateTime(toDate(tx.timestamp))}</p>
          <p className="muted small">
            Added by {tx.createdByName}
            {tx.recurringId && ' · repeats monthly'}
            {tx.updatedAt && ' · edited'}
          </p>
          {canEdit && (
            <button type="button" className="btn small transaction-edit" onClick={() => onEdit(tx)}>
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function BulkEditModal({ household, transactions, onClose, onSave }) {
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // A category only makes sense if every selected entry is the same type
  const types = new Set(transactions.map((tx) => tx.type))
  const sharedType = types.size === 1 ? [...types][0] : null
  const categoryOptions = sharedType ? categoriesForHouseholdType(household, sharedType) : []
  const count = transactions.length

  async function handleSubmit(e) {
    e.preventDefault()
    if (!date && !category) {
      setError('Choose a new date, a new category, or both.')
      return
    }
    const [year, month, day] = date ? date.split('-').map(Number) : []
    const updates = transactions.map((tx) => {
      const changes = {}
      if (date) {
        // Move to the new day but keep each entry's time of day
        const moved = new Date(toDate(tx.timestamp))
        moved.setFullYear(year, month - 1, day)
        changes.timestamp = moved
      }
      if (category) changes.category = category
      return { id: tx.id, changes }
    })
    setSaving(true)
    setError('')
    try {
      await onSave(updates)
    } catch (err) {
      setError(firestoreErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Change selected entries" onClick={(e) => e.stopPropagation()}>
        <h2>
          Change {count} {count === 1 ? 'entry' : 'entries'}
        </h2>
        <p className="muted small modal-subtitle">Leave a field empty to keep it as it is.</p>
        <form onSubmit={handleSubmit} className="stack">
          <label>
            New date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="muted small field-hint">Each entry keeps its time of day.</span>
          </label>
          {sharedType ? (
            <label>
              New category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Keep current categories</option>
                {categoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted small">
              To change the category, select only expenses or only income.
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="row-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className={`btn${date || category ? ' primary' : ''}`} disabled={saving || (!date && !category)}>
              {saving ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SettingsModal({
  household,
  currency,
  isOwner,
  acting,
  onCategoriesUpdate,
  onCurrencyChange,
  onLeave,
  onDelete,
  onClose,
  recurring,
  canEditRecurring,
  onRecurringUpdate,
  onRecurringDelete,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" role="dialog" aria-label="Household settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Household Settings</h2>
          <button type="button" className="popover-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <CategorySettings household={household} disabled={acting} onUpdate={onCategoriesUpdate} />

        <RecurringSettings
          household={household}
          recurring={recurring}
          currency={currency}
          canEdit={canEditRecurring}
          onUpdate={onRecurringUpdate}
          onDelete={onRecurringDelete}
        />

        <section className="settings-section">
          <h3>Currency</h3>
          <p className="muted small">All amounts in this household use the selected currency.</p>
          <label className="currency-setting">
            Currency
            <select value={currency} disabled={acting} onChange={(e) => onCurrencyChange(e.target.value)}>
              {HOUSEHOLD_CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small preview-currency">Preview: {formatCurrency(1234.56, currency)}</p>
        </section>

        <section className="settings-section danger-zone">
          <h3>Leave or delete</h3>
          <p className="muted small">
            {isOwner
              ? 'Leave this household or delete it permanently. Only you can delete it.'
              : 'Leave this household if you no longer want access.'}
          </p>
          <div className="invite-action-stack">
            <button type="button" className="btn" disabled={acting} onClick={onLeave}>
              {acting ? 'Working...' : 'Leave Household'}
            </button>
            {isOwner && (
              <button type="button" className="btn danger" disabled={acting} onClick={onDelete}>
                {acting ? 'Deleting...' : 'Delete Household'}
              </button>
            )}
          </div>
        </section>
      </div>
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
    <section className="settings-section">
      <h3>Categories</h3>
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
        <button
          type="submit"
          className={`btn small${normalizeCategoryName(newName) ? ' primary' : ''}`}
          disabled={disabled || !normalizeCategoryName(newName)}
        >
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

function TransactionModal({
  household,
  user,
  profile,
  transaction,
  defaultDate,
  onClose,
  onSaved,
  onDelete,
  onCreateRecurring,
}) {
  const editing = Boolean(transaction)
  const [type, setType] = useState(transaction?.type || 'expense')
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amount)) : '')
  const [category, setCategory] = useState(
    transaction?.category || categoriesForHouseholdType(household, 'expense')[0] || 'Other'
  )
  const [note, setNote] = useState(transaction?.note || '')
  const [timestamp, setTimestamp] = useState(
    toLocalInputValue(transaction ? toDate(transaction.timestamp) : defaultDate || new Date())
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [repeatMonthly, setRepeatMonthly] = useState(false)

  const typeCategories = categoriesForHouseholdType(household, type)
  // Keep an entry's old category selectable even if it was removed from the list since
  const categoryOptions =
    editing && type === transaction.type && !typeCategories.includes(transaction.category)
      ? [transaction.category, ...typeCategories]
      : typeCategories

  function handleTypeChange(nextType) {
    setType(nextType)
    if (editing && nextType === transaction.type) {
      setCategory(transaction.category)
      return
    }
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
    const fields = {
      amount: parsed,
      type,
      category,
      note: note.trim(),
      timestamp: new Date(timestamp),
    }
    setSaving(true)
    setError('')
    try {
      if (editing) {
        await updateTransaction(transaction.id, fields, user.uid)
        onSaved({ ...fields, updatedAt: new Date(), updatedBy: user.uid })
      } else {
        const createdByName = profile?.displayName || user.displayName || 'User'
        const entryMonth = monthKeyOf(fields.timestamp)
        const isDue = fields.timestamp <= new Date()
        let recurringId = null
        if (repeatMonthly && onCreateRecurring) {
          // A future date just sets up the template; its first entry is added on the day
          recurringId = await onCreateRecurring({
            householdId: household.id,
            type,
            amount: parsed,
            category,
            note: fields.note,
            dayOfMonth: fields.timestamp.getDate(),
            startMonth: entryMonth,
            ...(isDue ? { lastPostedMonth: entryMonth } : {}),
            createdBy: user.uid,
            createdByName,
          })
        }
        if (!recurringId || isDue) {
          await addTransaction({
            ...fields,
            householdId: household.id,
            createdBy: user.uid,
            createdByName,
            ...(recurringId ? { recurringId } : {}),
          })
        }
        await onSaved()
      }
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await onDelete()
    } catch (err) {
      setError(firestoreErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Edit Entry' : 'Add Entry'}</h2>
        {editing && (
          <p className="muted small modal-subtitle">Added by {transaction.createdByName}</p>
        )}
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
          {!editing && onCreateRecurring && (
            <label className="checkbox-row repeat-row">
              <input type="checkbox" checked={repeatMonthly} onChange={(e) => setRepeatMonthly(e.target.checked)} />
              <span>
                Repeat every month
                {repeatMonthly && timestamp && (
                  <span className="muted small"> on day {new Date(timestamp).getDate()}</span>
                )}
              </span>
            </label>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="row-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn primary" disabled={busy}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save'}
            </button>
          </div>
          {editing && onDelete && (
            <button type="button" className="btn danger full" onClick={handleDelete} disabled={busy}>
              {deleting ? 'Deleting...' : 'Delete Entry'}
            </button>
          )}
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
