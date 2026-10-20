import { useMemo, useState } from 'react'
import { formatCurrency, toDate } from '../constants'
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

function monthSummary(transactions, dateTo) {
  const ref = dateTo ? new Date(`${dateTo}T00:00:00`) : new Date()
  let net = 0
  for (const tx of transactions) {
    const date = toDate(tx.timestamp)
    if (date.getFullYear() !== ref.getFullYear() || date.getMonth() !== ref.getMonth()) continue
    const amount = Math.abs(tx.amount || 0)
    if (tx.type === 'income') net += amount
    else if (tx.type === 'expense') net -= amount
  }
  const isCurrent = !dateTo
  const label = isCurrent ? 'This month' : ref.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return { label, net }
}

export default function InsightsCard({ transactions, currency, dateFrom, dateTo }) {
  const [open, setOpen] = useState(() => readSetting(OPEN_KEY, 'false') === 'true')
  const [tab, setTab] = useState(() => {
    const saved = readSetting(TAB_KEY, 'monthly')
    return TABS.some((t) => t.key === saved) ? saved : 'monthly'
  })

  const month = useMemo(() => monthSummary(transactions, dateTo), [transactions, dateTo])
  const topCategory = useMemo(() => {
    const { slices } = buildSlices(transactions, 'expense')
    return slices.find((slice) => !slice.members) || null
  }, [transactions])

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
          <span>
            {month.label} net:{' '}
            <strong className={month.net >= 0 ? 'positive' : 'negative'}>
              {formatCurrency(month.net, currency)}
            </strong>
          </span>
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
            <CategoryPieChart transactions={transactions} currency={currency} />
          )}
        </div>
      )}
    </section>
  )
}
