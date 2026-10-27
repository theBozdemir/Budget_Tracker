import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
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

// Only the entry's own fields change; who added it and when stay as they were
export async function updateTransaction(id, changes, userId) {
  await updateDoc(doc(db, 'transactions', id), {
    ...changes,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
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
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
  const toExclusive = dateTo ? new Date(`${dateTo}T00:00:00`) : null
  if (toExclusive) toExclusive.setDate(toExclusive.getDate() + 1)

  return transactions.filter((tx) => {
    if (type !== 'all' && tx.type !== type) return false
    if (categories.length > 0 && !categories.includes(tx.category)) return false
    if (memberId !== 'all' && tx.createdBy !== memberId) return false

    const date = toDate(tx.timestamp)
    if (from && !Number.isNaN(from.getTime()) && date < from) return false
    if (toExclusive && !Number.isNaN(toExclusive.getTime()) && date >= toExclusive) return false

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
