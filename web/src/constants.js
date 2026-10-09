export const EXPENSE_CATEGORIES = [
  'Groceries',
  'Rent',
  'Utilities',
  'Transport',
  'Dining',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Other',
]

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Bonus',
  'Refund',
  'Gift',
  'Investment',
  'Other',
]

export const DEFAULT_CURRENCY = 'USD'

export const HOUSEHOLD_CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'TRY', label: 'Turkish Lira (TRY)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'MXN', label: 'Mexican Peso (MXN)' },
]

export function isValidCurrency(code) {
  return HOUSEHOLD_CURRENCIES.some((currency) => currency.code === code)
}

export function categoriesForType(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

export function formatCurrency(value, currency = DEFAULT_CURRENCY) {
  const code = isValidCurrency(currency) ? currency : DEFAULT_CURRENCY
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(value)
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
    }).format(value)
  }
}

export function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function toDate(value) {
  if (!value) return new Date()
  if (value.toDate) return value.toDate()
  if (value instanceof Date) return value
  return new Date(value)
}
