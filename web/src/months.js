import { toDate } from './constants'

// Months are handled as 'YYYY-MM' keys in the user's local time zone

export function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonthKey() {
  return monthKeyOf(new Date())
}

export function parseMonthKey(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

export function shiftMonth(key, delta) {
  const date = parseMonthKey(key)
  return monthKeyOf(new Date(date.getFullYear(), date.getMonth() + delta, 1))
}

export function monthLabel(key, format = 'long') {
  return parseMonthKey(key).toLocaleDateString(undefined, { month: format, year: 'numeric' })
}

// Last day of the month as 'YYYY-MM-DD', the format the date filters use
export function monthEndInput(key) {
  const date = parseMonthKey(key)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return `${monthKeyOf(end)}-${String(end.getDate()).padStart(2, '0')}`
}

export function isInMonth(tx, key) {
  return monthKeyOf(toDate(tx.timestamp)) === key
}

// Every month that has entries, plus the current one, newest first
export function monthsWithEntries(transactions, extraKeys = []) {
  const keys = new Set(extraKeys)
  for (const tx of transactions) keys.add(monthKeyOf(toDate(tx.timestamp)))
  return [...keys].sort().reverse()
}

// Same day of the month (clamped to the month's length) at the current time
export function dateInMonth(key, reference = new Date()) {
  const start = parseMonthKey(key)
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  const date = new Date(reference)
  date.setFullYear(start.getFullYear(), start.getMonth(), Math.min(reference.getDate(), lastDay))
  return date
}
