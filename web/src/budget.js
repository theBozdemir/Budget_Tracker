import { isInMonth, shiftMonth } from './months'

const TYPES = ['expense', 'income']

export function emptyBudgets() {
  return { expense: {}, income: {} }
}

export function hasBudget(budgets) {
  return TYPES.some((type) => Object.values(budgets?.[type] || {}).some((amount) => amount > 0))
}

function totalsByCategory(transactions, type) {
  const totals = new Map()
  for (const tx of transactions) {
    if (tx.type !== type) continue
    totals.set(tx.category, (totals.get(tx.category) || 0) + Math.abs(tx.amount || 0))
  }
  return totals
}

// Planned vs actual for one month. `monthTransactions` must already be limited to that month.
// Categories without their own budget use the month's recurring total as the expected amount.
export function compareBudget(budgets, monthTransactions, recurring = emptyBudgets()) {
  const result = {}
  for (const type of TYPES) {
    const own = budgets?.[type] || {}
    const fromRecurring = new Set()
    const planned = { ...own }
    for (const [category, amount] of Object.entries(recurring?.[type] || {})) {
      if (!(own[category] > 0) && amount > 0) {
        planned[category] = amount
        fromRecurring.add(category)
      }
    }
    const actual = totalsByCategory(monthTransactions, type)
    const rows = Object.entries(planned)
      .filter(([, amount]) => amount > 0)
      .map(([category, amount]) => ({
        category,
        planned: amount,
        actual: actual.get(category) || 0,
        recurring: fromRecurring.has(category),
      }))
      .sort((a, b) => b.planned - a.planned)
    const unplanned = [...actual.entries()]
      .filter(([category, amount]) => amount > 0 && !(planned[category] > 0))
      .map(([category, amount]) => ({ category, planned: 0, actual: amount }))
      .sort((a, b) => b.actual - a.actual)
    const sum = (list, key) => list.reduce((total, row) => total + row[key], 0)
    result[type] = {
      rows,
      unplanned,
      planned: sum(rows, 'planned'),
      actual: sum(rows, 'actual') + sum(unplanned, 'actual'),
    }
  }
  return {
    ...result,
    plannedSavings: result.income.planned - result.expense.planned,
    actualSavings: result.income.actual - result.expense.actual,
  }
}

// Average per category over the months before `monthKey` that have any entries
export function suggestBudgets(transactions, monthKey, months = 3) {
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(monthKey, -(i + 1)))
  const inRange = transactions.filter((tx) => keys.some((key) => isInMonth(tx, key)))
  const activeMonths = keys.filter((key) => inRange.some((tx) => isInMonth(tx, key))).length
  const suggestion = emptyBudgets()
  if (!activeMonths) return { budgets: suggestion, months: 0 }
  for (const type of TYPES) {
    for (const [category, total] of totalsByCategory(inRange, type)) {
      suggestion[type][category] = Math.ceil(total / activeMonths)
    }
  }
  return { budgets: suggestion, months: activeMonths }
}

// Keep only positive whole-cent amounts for categories that still exist
export function cleanBudgets(budgets, categoryLists) {
  const clean = emptyBudgets()
  for (const type of TYPES) {
    for (const category of categoryLists[type] || []) {
      const amount = Math.round(Number(budgets?.[type]?.[category]) * 100) / 100
      if (amount > 0) clean[type][category] = amount
    }
  }
  return clean
}
