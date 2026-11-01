import { useMemo, useState } from 'react'
import { isInMonth, monthLabel, shiftMonth } from '../months'
import CategoryPieChart, { buildSlices } from './CategoryPieChart'
import MonthlyChart from './MonthlyChart'

const OPEN_KEY = 'insights.open'
const TAB_KEY = 'insights.tab'

const TABS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'categories', label: 'Categories' },
]

function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode); the setting just won't persist
  }
}

function spendingIn(transactions, key) {
  return transactions
    .filter((tx) => tx.type === 'expense' && isInMonth(tx, key))
    .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0)
}

// Spending in the selected month compared with the month before it
function spendingChange(transactions, key) {
  if (!key) return null
  const previous = shiftMonth(key, -1)
  const now = spendingIn(transactions, key)
  const before = spendingIn(transactions, previous)
  if (before === 0) return null
  return { percent: Math.round(((now - before) / before) * 100), previousLabel: monthLabel(previous, 'short') }
}

export default function InsightsCard({ transactions, periodTransactions, currency, dateFrom, dateTo, compareMonth }) {
  const [open, setOpen] = useState(() => readSetting(OPEN_KEY, 'false') === 'true')
  const [tab, setTab] = useState(() => {
    const saved = readSetting(TAB_KEY, 'monthly')
    return TABS.some((t) => t.key === saved) ? saved : 'monthly'
  })

  const change = useMemo(() => spendingChange(transactions, compareMonth), [transactions, compareMonth])
  const topCategory = useMemo(() => {
    const { slices } = buildSlices(periodTransactions, 'expense')
    return slices.find((slice) => !slice.members) || null
  }, [periodTransactions])

  function toggleOpen() {
    setOpen((current) => {
      saveSetting(OPEN_KEY, String(!current))
      return !current
    })
  }

  function selectTab(key) {
    setTab(key)
    saveSetting(TAB_KEY, key)
  }

  return (
    <section className="insights-card">
      <button
        type="button"
        className="insights-header"
        aria-expanded={open}
        aria-controls="insights-body"
        onClick={toggleOpen}
      >
        <span className="insights-title">Insights</span>
        <span className="insights-summary">
          {change && (
            <span>
              Spending{' '}
              <strong className={change.percent > 0 ? 'negative' : change.percent < 0 ? 'positive' : undefined}>
                {change.percent > 0 ? '▲' : change.percent < 0 ? '▼' : ''}
                {Math.abs(change.percent)}%
              </strong>{' '}
              vs {change.previousLabel}
            </span>
          )}
          {!change && !topCategory && <span>No spending yet this period</span>}
          {topCategory && (
            <span className="insights-summary-extra">
              Top: {topCategory.name} {Math.round(topCategory.share * 100)}%
            </span>
          )}
        </span>
        <span className="insights-toggle">
          {open ? 'Hide' : 'Show'}
          <span className={`insights-chevron${open ? ' open' : ''}`} aria-hidden="true">▾</span>
        </span>
      </button>

      {open && (
        <div id="insights-body" className="insights-body">
          <div className="insights-tabs" role="tablist" aria-label="Insights view">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={tab === t.key ? 'active' : undefined}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'monthly' ? (
            <MonthlyChart transactions={transactions} currency={currency} dateFrom={dateFrom} dateTo={dateTo} />
          ) : (
            <CategoryPieChart transactions={periodTransactions} currency={currency} />
          )}
        </div>
      )}
    </section>
  )
}
