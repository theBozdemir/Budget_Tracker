import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants'

export function defaultExpenseCategories() {
  return [...EXPENSE_CATEGORIES]
}

export function defaultIncomeCategories() {
  return [...INCOME_CATEGORIES]
}

export function normalizeCategoryName(name) {
  return name.trim().replace(/\s+/g, ' ')
}

export function uniqCategories(list) {
  const seen = new Set()
  return list.reduce((categories, item) => {
    if (typeof item !== 'string') return categories
    const normalized = normalizeCategoryName(item)
    if (!normalized) return categories
    const key = normalized.toLowerCase()
    if (seen.has(key)) return categories
    seen.add(key)
    categories.push(normalized)
    return categories
  }, [])
}

export function getHouseholdCategories(household) {
  return {
    expense: uniqCategories(
      household?.expenseCategories?.length ? household.expenseCategories : defaultExpenseCategories()
    ),
    income: uniqCategories(
      household?.incomeCategories?.length ? household.incomeCategories : defaultIncomeCategories()
    ),
  }
}

export function categoriesForHouseholdType(household, type) {
  const lists = getHouseholdCategories(household)
  return type === 'income' ? lists.income : lists.expense
}
