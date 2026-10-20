import { useMemo, useState } from 'react'
import { formatCurrency } from '../constants'

// Categorical slots in fixed order; anything past them folds into "Other"
const SLICE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const OTHER_COLOR = '#a8a7a1'

const SIZE = 200
const CENTER = SIZE / 2
const OUTER_RADIUS = 96
const INNER_RADIUS = 62

function polar(radius, angle) {
  return [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)]
}

function arcPath(start, end) {
  // A full circle can't be drawn as one arc, so stop just short of it
  const sweep = Math.min(end - start, Math.PI * 2 - 0.0001)
  const finish = start + sweep
  const large = sweep > Math.PI ? 1 : 0
  const [x1, y1] = polar(OUTER_RADIUS, start)
  const [x2, y2] = polar(OUTER_RADIUS, finish)
  const [x3, y3] = polar(INNER_RADIUS, finish)
  const [x4, y4] = polar(INNER_RADIUS, start)
  return [
    `M ${x1} ${y1}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

export function buildSlices(transactions, type) {
  const totals = new Map()
  for (const tx of transactions) {
    if (tx.type !== type) continue
    const name = tx.category || 'Uncategorized'
    totals.set(name, (totals.get(name) || 0) + Math.abs(tx.amount || 0))
  }

  const sorted = [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])

  // Only fold when it saves at least two categories from sharing a slice
  const keep = sorted.length > SLICE_COLORS.length + 1 ? SLICE_COLORS.length : sorted.length
  const slices = sorted.slice(0, keep).map(([name, amount], index) => ({
    name,
    amount,
    color: SLICE_COLORS[index] || OTHER_COLOR,
  }))
  const rest = sorted.slice(keep)
  if (rest.length > 0) {
    slices.push({
      name: `Other (${rest.length})`,
      amount: rest.reduce((sum, [, amount]) => sum + amount, 0),
      color: OTHER_COLOR,
      members: rest.map(([name]) => name),
    })
  }

  const total = slices.reduce((sum, slice) => sum + slice.amount, 0)
  let angle = 0
  return {
    total,
    slices: slices.map((slice) => {
      const start = angle
      angle += (slice.amount / total) * Math.PI * 2
      return { ...slice, share: slice.amount / total, start, end: angle }
    }),
  }
}

function formatShare(share) {
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`
}

export default function CategoryPieChart({ transactions, currency }) {
  const [type, setType] = useState('expense')
  const [active, setActive] = useState(null)

  const { total, slices } = useMemo(() => buildSlices(transactions, type), [transactions, type])
  const activeSlice = slices.find((slice) => slice.name === active)

  return (
    <section className="section-block">
      <div className="section-header">
        <h2>{type === 'expense' ? 'Spending' : 'Income'} by category</h2>
        <div className="segmented chart-switch" role="group" aria-label="Chart type">
          {['expense', 'income'].map((value) => (
            <button
              key={value}
              type="button"
              className={type === value ? 'active' : undefined}
              aria-pressed={type === value}
              onClick={() => {
                setType(value)
                setActive(null)
              }}
            >
              {value === 'expense' ? 'Expenses' : 'Income'}
            </button>
          ))}
        </div>
      </div>

      {slices.length === 0 ? (
        <p className="muted small">
          No {type === 'expense' ? 'expenses' : 'income'} to show for the current filters.
        </p>
      ) : (
        <div className="pie-card">
          <div className="pie-figure">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`${type === 'expense' ? 'Spending' : 'Income'} by category, total ${formatCurrency(total, currency)}`}
              onMouseLeave={() => setActive(null)}
            >
              {slices.map((slice) => (
                <path
                  key={slice.name}
                  d={arcPath(slice.start, slice.end)}
                  fill={slice.color}
                  className={`pie-slice${active && active !== slice.name ? ' dimmed' : ''}`}
                  onMouseEnter={() => setActive(slice.name)}
                  onClick={() => setActive((current) => (current === slice.name ? null : slice.name))}
                >
                  <title>{`${slice.name}: ${formatCurrency(slice.amount, currency)} (${formatShare(slice.share)})`}</title>
                </path>
              ))}
            </svg>
            <div className="pie-center" aria-hidden="true">
              <span className="pie-center-label">{activeSlice ? activeSlice.name : 'Total'}</span>
              <strong>{formatCurrency(activeSlice ? activeSlice.amount : total, currency)}</strong>
              {activeSlice && <span className="pie-center-label">{formatShare(activeSlice.share)}</span>}
            </div>
          </div>

          <ul className="pie-legend">
            {slices.map((slice) => (
              <li
                key={slice.name}
                className={active === slice.name ? 'active' : ''}
                onMouseEnter={() => setActive(slice.name)}
                onMouseLeave={() => setActive(null)}
                title={slice.members ? slice.members.join(', ') : undefined}
              >
                <span className="pie-swatch" style={{ background: slice.color }} />
                <span className="pie-legend-name">{slice.name}</span>
                <span className="pie-legend-value">{formatCurrency(slice.amount, currency)}</span>
                <span className="pie-legend-share">{formatShare(slice.share)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
