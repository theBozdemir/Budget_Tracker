import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { toDate } from '../constants'

export async function fetchTransactions(householdId) {
  const q = query(collection(db, 'transactions'), where('householdId', '==', householdId))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
}

export async function addTransaction(data) {
  await addDoc(collection(db, 'transactions'), {
    ...data,
    createdAt: serverTimestamp(),
  })
}

export async function deleteTransaction(id) {
  await deleteDoc(doc(db, 'transactions', id))
}

export function summarize(transactions) {
  const income = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const expenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  return { income, expenses, balance: income - expenses }
}

export function filterTransactions(transactions, filters) {
  const { type = 'all', categories = [], memberId = 'all', dateFrom = '', dateTo = '' } = filters

  return transactions.filter((tx) => {
    if (type !== 'all' && tx.type !== type) return false
    if (categories.length > 0 && !categories.includes(tx.category)) return false
    if (memberId !== 'all' && tx.createdBy !== memberId) return false

    const date = toDate(tx.timestamp)
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`)
      if (date < from) return false
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999`)
      if (date > to) return false
    }

    return true
  })
}

export function hasActiveFilters(filters) {
  return (
    filters.type !== 'all' ||
    filters.categories.length > 0 ||
    filters.memberId !== 'all' ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo)
  )
}

export function memberOptionsFromTransactions(transactions) {
  const map = new Map()
  for (const tx of transactions) {
    if (!tx.createdBy) continue
    map.set(tx.createdBy, tx.createdByName || 'Member')
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
}
