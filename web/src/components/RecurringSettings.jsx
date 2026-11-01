import { useState } from 'react'
import { formatCurrency } from '../constants'
import { firestoreErrorMessage } from '../firestoreErrors'
import { monthLabel } from '../months'
import { categoriesForHouseholdType } from '../services/categories'

function ordinal(day) {
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix}`
}

function RecurringItem({ template, household, currency, canEdit, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(template.amount))
  const [day, setDay] = useState(String(template.dayOfMonth))
  const [category, setCategory] = useState(template.category)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const paused = template.active === false
  const categories = categoriesForHouseholdType(household, template.type)
  const categoryOptions = categories.includes(template.category) ? categories : [template.category, ...categories]

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      return true
    } catch (err) {
      setError(firestoreErrorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    const parsedDay = Number(day)
    if (!parsedAmount || parsedAmount <= 0) return setError('Enter a valid amount.')
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) return setError('Day must be 1–31.')
    if (await run(() => onUpdate(template.id, { amount: parsedAmount, dayOfMonth: parsedDay, category }))) {
      setEditing(false)
    }
  }

  return (
    <li className={`recurring-item${paused ? ' paused' : ''}`}>
      <div className="recurring-item-top">
        <div>
          <strong>{template.category}</strong>
          <span className="muted small">
            {' '}
            · {template.type === 'income' ? 'Income' : 'Expense'} · every month on the {ordinal(template.dayOfMonth)}
            {paused && ' · paused'}
          </span>
          {template.note && <div className="muted small">{template.note}</div>}
          <div className="muted small">Since {monthLabel(template.startMonth, 'short')} · set up by {template.createdByName}</div>
        </div>
        <strong className={template.type === 'income' ? 'positive' : 'negative'}>
          {formatCurrency(template.amount, currency)}
        </strong>
      </div>

      {editing ? (
        <form className="recurring-edit" onSubmit={handleSave}>
          <label>
            Amount
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Day of month
            <input type="number" min="1" max="31" step="1" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="recurring-edit-wide">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="row-actions recurring-edit-wide">
            <button type="button" className="btn small" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn small primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </button>
          </div>
          <p className="muted small recurring-edit-wide">Changes apply to entries added from now on.</p>
        </form>
      ) : (
        canEdit && (
          <div className="recurring-actions">
            <button type="button" className="link-button" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => run(() => onUpdate(template.id, { active: paused }))}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className="link-button danger"
              disabled={busy}
              onClick={() => {
                if (confirm(`Stop repeating "${template.category}"? Entries already added stay.`)) {
                  run(() => onDelete(template.id))
                }
              }}
            >
              Delete
            </button>
          </div>
        )
      )}
      {error && <p className="error-text">{error}</p>}
    </li>
  )
}

export default function RecurringSettings({ household, recurring, currency, canEdit, onUpdate, onDelete }) {
  return (
    <section className="settings-section">
      <h3>Recurring entries</h3>
      {recurring.length === 0 ? (
        <p className="muted small">
          None yet. When adding an entry, turn on <strong>Repeat every month</strong> for rent, salary, subscriptions
          and other regular amounts.
        </p>
      ) : (
        <>
          <p className="muted small">Added automatically on their day each month when someone opens the household.</p>
          <ul className="recurring-list">
            {recurring.map((template) => (
              <RecurringItem
                key={template.id}
                template={template}
                household={household}
                currency={currency}
                canEdit={canEdit(template)}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
