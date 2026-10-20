import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCurrency, toDate } from '../constants'

const SERIES = [
  { key: 'income', label: 'Income', color: '#2a78d6' },
  { key: 'expenses', label: 'Expenses', color: '#eb6834' },
]

const DEFAULT_MONTHS = 12
const MAX_MONTHS = 24

const HEIGHT = 240
const PAD = { top: 12, right: 8, bottom: 28, left: 52 }

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function parseDateInput(value) {
  return value ? new Date(`${value}T00:00:00`) : null
}

export function buildMonths(transactions, { dateFrom, dateTo } = {}) {
  const end = monthStart(parseDateInput(dateTo) || new Date())
  let start = parseDateInput(dateFrom)
  start = start ? monthStart(start) : new Date(end.getFullYear(), end.getMonth() - (DEFAULT_MONTHS - 1), 1)
  if (start > end) start = end

  const months = []
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ key: monthKey(d), date: d, income: 0, expenses: 0 })
  }
  const visible = months.slice(-MAX_MONTHS)
  const byKey = new Map(visible.map((month) => [month.key, month]))

  for (const tx of transactions) {
    const month = byKey.get(monthKey(toDate(tx.timestamp)))
    if (!month) continue
    const amount = Math.abs(tx.amount || 0)
    if (tx.type === 'income') month.income += amount
    else if (tx.type === 'expense') month.expenses += amount
  }
  return visible
}

function niceMax(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude * 4 >= value) * magnitude
  return step * 4
}

function compactAmount(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  } catch {
    return String(Math.round(value))
  }
}

// Bar with rounded top corners, square at the baseline
function barPath(x, y, width, height) {
  if (height <= 0) return ''
  const r = Math.min(4, width / 2, height)
  return [
    `M ${x} ${y + height}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height}`,
    'Z',
  ].join(' ')
}

export default function MonthlyChart({ transactions, currency, dateFrom, dateTo }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const figureRef = useRef(null)
  const [width, setWidth] = useState(640)

  const months = useMemo(
    () => buildMonths(transactions, { dateFrom, dateTo }),
    [transactions, dateFrom, dateTo]
  )
  const hasData = months.some((m) => m.income > 0 || m.expenses > 0)

  useEffect(() => {
    const node = figureRef.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasData])

  const yMax = niceMax(Math.max(...months.map((m) => Math.max(m.income, m.expenses))))
  const ticks = [0, 1, 2, 3, 4].map((i) => (yMax / 4) * i)

  const plotWidth = width - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const band = plotWidth / months.length
  const groupWidth = Math.min(band * 0.7, 48)
  const barGap = 2
  const barWidth = (groupWidth - barGap) / 2
  const y = (value) => PAD.top + plotHeight - (value / yMax) * plotHeight
  const labelEvery = Math.ceil(months.length / Math.max(2, Math.floor(plotWidth / 56)))

  const showYear = months[0]?.date.getFullYear() !== months[months.length - 1]?.date.getFullYear()
  const monthLabel = (date, long = false) =>
    date.toLocaleDateString(undefined, {
      month: long ? 'long' : 'short',
      ...(long || showYear ? { year: long ? 'numeric' : '2-digit' } : {}),
    })

  const hovered = hoverIndex != null ? months[hoverIndex] : null
  const tooltipLeft = hoverIndex != null ? ((PAD.left + band * (hoverIndex + 0.5)) / width) * 100 : 0

  return (
    <section className="section-block">
      <div className="section-header">
        <h2>Monthly overview</h2>
        <div className="chart-legend">
          {SERIES.map((s) => (
            <span key={s.key} className="chart-legend-item">
              <span className="pie-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="muted small">No transactions in this period.</p>
      ) : (
        <div className="monthly-card">
          <div className="monthly-figure" ref={figureRef} onMouseLeave={() => setHoverIndex(null)}>
            <svg
              viewBox={`0 0 ${width} ${HEIGHT}`}
              role="img"
              aria-label="Monthly income and expenses"
              width={width}
              height={HEIGHT}
            >
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(tick)}
                    y2={y(tick)}
                    className={tick === 0 ? 'chart-baseline' : 'chart-grid'}
                  />
                  <text x={PAD.left - 8} y={y(tick)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                    {compactAmount(tick, currency)}
                  </text>
                </g>
              ))}

              {months.map((month, index) => {
                const groupX = PAD.left + band * index + (band - groupWidth) / 2
                return (
                  <g key={month.key}>
                    {hoverIndex === index && (
                      <rect x={PAD.left + band * index} y={PAD.top} width={band} height={plotHeight} className="chart-hover-band" />
                    )}
                    {SERIES.map((s, si) => {
                      const value = month[s.key]
                      return (
                        <path
                          key={s.key}
                          d={barPath(groupX + si * (barWidth + barGap), y(value), barWidth, y(0) - y(value))}
                          fill={s.color}
                        />
                      )
                    })}
                    {index % labelEvery === 0 && (
                      <text x={PAD.left + band * (index + 0.5)} y={HEIGHT - 8} className="chart-axis-label" textAnchor="middle">
                        {monthLabel(month.date)}
                      </text>
                    )}
                    <rect
                      x={PAD.left + band * index}
                      y={PAD.top}
                      width={band}
                      height={plotHeight}
                      fill="transparent"
                      onMouseEnter={() => setHoverIndex(index)}
                      onClick={() => setHoverIndex(index)}
                    />
                  </g>
                )
              })}
            </svg>

            {hovered && (
              <div
                className={`chart-tooltip${tooltipLeft > 60 ? ' flip' : ''}`}
                style={{ left: `${tooltipLeft}%` }}
              >
                <strong>{monthLabel(hovered.date, true)}</strong>
                {SERIES.map((s) => (
                  <div key={s.key} className="chart-tooltip-row">
                    <span className="pie-swatch" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span>{formatCurrency(hovered[s.key], currency)}</span>
                  </div>
                ))}
                <div className="chart-tooltip-row net">
                  <span />
                  <span>Net</span>
                  <span className={hovered.income - hovered.expenses >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(hovered.income - hovered.expenses, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <details className="chart-table-toggle">
            <summary>Show as table</summary>
            <table className="chart-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.key}>
                    <td>{monthLabel(m.date, true)}</td>
                    <td>{formatCurrency(m.income, currency)}</td>
                    <td>{formatCurrency(m.expenses, currency)}</td>
                    <td className={m.income - m.expenses >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(m.income - m.expenses, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </section>
  )
}
