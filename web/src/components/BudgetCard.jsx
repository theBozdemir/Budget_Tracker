import { useMemo, useState } from 'react'
import { compareBudget, cleanBudgets, emptyBudgets, hasBudget, suggestBudgets } from '../budget'
import { formatCurrency } from '../constants'
import { currentMonthKey, isInMonth, monthLabel, parseMonthKey } from '../months'
import { getHouseholdCategories } from '../services/categories'

const OPEN_KEY = 'budget.open'

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function saveOpen(open) {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    // Not remembered in private mode
  }
}

// How far through the month we are, for the "today" marker on the spending bar
function monthProgress(monthKey) {
  if (monthKey !== currentMonthKey()) return null
  const start = parseMonthKey(monthKey)
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  return new Date().getDate() / days
}

function BudgetBar({ actual, planned, kind, pace }) {
  const ratio = planned > 0 ? actual / planned : 0
  let tone = 'good'
  if (kind === 'expense') {
    if (ratio > 1) tone = 'over'
    else if (ratio > 0.85) tone = 'warn'
  } else if (ratio < 1) {
    tone = 'neutral'
  }
  return (
    <div className="budget-bar" role="presentation">
      <div className={`budget-bar-fill ${tone}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      {pace != null && <div className="budget-bar-pace" style={{ left: `${pace * 100}%` }} title="Today" />}
    </div>
  )
}

function BudgetRow({ row, kind, currency }) {
  const diff = row.planned - row.actual
  let note
  if (!row.planned) note = <span className="muted">Not in budget</span>
  else if (kind === 'expense') {
    note =
      diff > 0 ? (
        <span className="muted">{formatCurrency(diff, currency)} left</span>
      ) : diff === 0 ? (
        <span className="muted">Fully used</span>
      ) : (
        <span className="negative">{formatCurrency(-diff, currency)} over</span>
      )
  } else {
    note =
      diff > 0 ? (
        <span className="muted">{formatCurrency(diff, currency)} to go</span>
      ) : (
        <span className="positive">Received</span>
      )
  }

  return (
    <li className="budget-row">
      <div className="budget-row-top">
        <span className="budget-row-name">{row.category}</span>
        <span className="budget-row-amounts">
          <strong>{formatCurrency(row.actual, currency)}</strong>
          {row.planned > 0 && <span className="muted"> / {formatCurrency(row.planned, currency)}</span>}
        </span>
      </div>
      {row.planned > 0 && <BudgetBar actual={row.actual} planned={row.planned} kind={kind} />}
      <div className="budget-row-note">{note}</div>
    </li>
  )
}

function BudgetSection({ title, kind, data, currency }) {
  if (!data.rows.length && !data.unplanned.length) return null
  return (
    <div className="budget-section">
      <h3>{title}</h3>
      <ul className="budget-rows">
        {data.rows.map((row) => (
          <BudgetRow key={row.category} row={row} kind={kind} currency={currency} />
        ))}
        {data.unplanned.map((row) => (
          <BudgetRow key={row.category} row={row} kind={kind} currency={currency} />
        ))}
      </ul>
    </div>
  )
}

export default function BudgetCard({ household, transactions, monthKey, currency, onSave }) {
  const [open, setOpen] = useState(readOpen)
  const [editing, setEditing] = useState(false)
  const budgets = household.budgets || emptyBudgets()
  const planned = hasBudget(budgets)

  const monthTransactions = useMemo(
    () => transactions.filter((tx) => isInMonth(tx, monthKey)),
    [transactions, monthKey]
  )
  const comparison = useMemo(() => compareBudget(budgets, monthTransactions), [budgets, monthTransactions])
  const pace = monthProgress(monthKey)
  const spent = comparison.expense.actual
  const limit = comparison.expense.planned

  function toggle() {
    setOpen((current) => {
      saveOpen(!current)
      return !current
    })
  }

  return (
    <section className="insights-card budget-card">
      <button type="button" className="insights-header" aria-expanded={open} onClick={toggle}>
        <span className="insights-title">Budget</span>
        <span className="insights-summary budget-summary">
          {planned && limit > 0 ? (
            <>
              <span>
                Spent <strong className={spent > limit ? 'negative' : undefined}>{formatCurrency(spent, currency)}</strong>{' '}
                of {formatCurrency(limit, currency)}
              </span>
              <BudgetBar actual={spent} planned={limit} kind="expense" pace={pace} />
            </>
          ) : (
            <span>{planned ? 'Income plan set' : 'Plan your month and compare with what you spend'}</span>
          )}
        </span>
        <span className="insights-toggle">
          {open ? 'Hide' : 'Show'}
          <span className={`insights-chevron${open ? ' open' : ''}`} aria-hidden="true">▾</span>
        </span>
      </button>

      {open && (
        <div className="insights-body">
          {!planned ? (
            <div className="budget-empty">
              <p>
                Set how much you expect to earn and spend each month per category. The app then shows what&apos;s left,
                what&apos;s over, and how much you&apos;re saving.
              </p>
              <button type="button" className="btn primary" onClick={() => setEditing(true)}>
                Set up budget
              </button>
            </div>
          ) : (
            <>
              <div className="budget-totals">
                <div>
                  <span>Income</span>
                  <strong>{formatCurrency(comparison.income.actual, currency)}</strong>
                  <span className="muted">of {formatCurrency(comparison.income.planned, currency)} expected</span>
                </div>
                <div>
                  <span>Spending</span>
                  <strong className={spent > limit ? 'negative' : undefined}>{formatCurrency(spent, currency)}</strong>
                  <span className="muted">of {formatCurrency(limit, currency)} planned</span>
                </div>
                <div>
                  <span>Saved</span>
                  <strong className={comparison.actualSavings >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(comparison.actualSavings, currency)}
                  </strong>
                  <span className="muted">of {formatCurrency(comparison.plannedSavings, currency)} planned</span>
                </div>
              </div>
              {/* A projection from the first few days is meaningless, so wait a week */}
              {pace != null && pace >= 0.25 && limit > 0 && (
                <p className="muted small budget-pace-note">
                  At this pace you&apos;d spend about {formatCurrency(spent / pace, currency)} by the end of{' '}
                  {monthLabel(monthKey, 'long')}. The line on the bar at the top marks today.
                </p>
              )}
              <BudgetSection title="Spending" kind="expense" data={comparison.expense} currency={currency} />
              <BudgetSection title="Income" kind="income" data={comparison.income} currency={currency} />
              <button type="button" className="btn small budget-edit" onClick={() => setEditing(true)}>
                Edit budget
              </button>
            </>
          )}
        </div>
      )}

      {editing && (
        <BudgetEditor
          household={household}
          transactions={transactions}
          monthKey={monthKey}
          currency={currency}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await onSave(next)
            setEditing(false)
            setOpen(true)
            saveOpen(true)
          }}
        />
      )}
    </section>
  )
}

function BudgetEditor({ household, transactions, monthKey, currency, onClose, onSave }) {
  const categoryLists = getHouseholdCategories(household)
  const [tab, setTab] = useState('expense')
  const [values, setValues] = useState(() => {
    const current = household.budgets || emptyBudgets()
    const toStrings = (map) => Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k, String(v)]))
    return { expense: toStrings(current.expense), income: toStrings(current.income) }
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const cleaned = cleanBudgets(values, categoryLists)
  const total = (type) => Object.values(cleaned[type]).reduce((sum, amount) => sum + amount, 0)

  function setValue(type, category, value) {
    setValues((prev) => ({ ...prev, [type]: { ...prev[type], [category]: value } }))
  }

  function handleSuggest() {
    const { budgets: suggestion, months } = suggestBudgets(transactions, monthKey)
    if (!months) {
      setMessage('There are no entries in the last 3 months to learn from yet.')
      return
    }
    setValues((prev) => {
      const next = { expense: { ...prev.expense }, income: { ...prev.income } }
      for (const type of ['expense', 'income']) {
        for (const category of categoryLists[type]) {
          if (suggestion[type][category]) next[type][category] = String(suggestion[type][category])
        }
      }
      return next
    })
    setMessage(`Filled in your average from the last ${months === 1 ? 'month' : `${months} months`}. Adjust as you like.`)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(cleaned)
    } catch (err) {
      setError(err.message || 'Could not save the budget.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Monthly budget" onClick={(e) => e.stopPropagation()}>
        <h2>Monthly budget</h2>
        <p className="muted small modal-subtitle">
          Expected amounts for a typical month. Leave a category empty to skip it.
        </p>
        <button type="button" className="link-button budget-suggest" onClick={handleSuggest}>
          ✨ Suggest from my last 3 months
        </button>
        {message && <p className="muted small">{message}</p>}
        <form onSubmit={handleSave} className="stack">
          <div className="segmented">
            {['expense', 'income'].map((type) => (
              <button
                key={type}
                type="button"
                className={tab === type ? 'active' : ''}
                onClick={() => setTab(type)}
              >
                {type === 'expense' ? 'Spending' : 'Income'}
              </button>
            ))}
          </div>
          <div className="budget-inputs">
            {categoryLists[tab].map((category) => (
              <label key={category} className="budget-input-row">
                <span>{category}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={values[tab][category] ?? ''}
                  onChange={(e) => setValue(tab, category, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="budget-editor-total">
            <span>Planned income {formatCurrency(total('income'), currency)}</span>
            <span>Planned spending {formatCurrency(total('expense'), currency)}</span>
            <strong className={total('income') - total('expense') >= 0 ? 'positive' : 'negative'}>
              Left to save {formatCurrency(total('income') - total('expense'), currency)}
            </strong>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="row-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
