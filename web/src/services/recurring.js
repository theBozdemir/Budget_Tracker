import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { currentMonthKey, parseMonthKey, shiftMonth } from '../months'

// Never post more than a year of missed months in one go
const MAX_CATCH_UP_MONTHS = 12

export async function fetchRecurring(householdId) {
  const snap = await getDocs(query(collection(db, 'recurring'), where('householdId', '==', householdId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createRecurring(data) {
  const ref = await addDoc(collection(db, 'recurring'), { ...data, active: true, createdAt: serverTimestamp() })
  return ref.id
}

export async function updateRecurring(id, changes) {
  await updateDoc(doc(db, 'recurring', id), changes)
}

export async function deleteRecurring(id) {
  await deleteDoc(doc(db, 'recurring', id))
}

// The template's day in a given month, clamped to short months (31 -> 30 or 28/29), at noon
export function dueDate(template, monthKey) {
  const start = parseMonthKey(monthKey)
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  return new Date(start.getFullYear(), start.getMonth(), Math.min(template.dayOfMonth, lastDay), 12)
}

export function appliesToMonth(template, monthKey) {
  return template.active !== false && template.startMonth <= monthKey
}

function isPosted(template, monthKey) {
  return Boolean(template.lastPostedMonth) && template.lastPostedMonth >= monthKey
}

// Templates whose entry for this month hasn't been added yet
export function upcomingForMonth(templates, monthKey) {
  return templates
    .filter((t) => appliesToMonth(t, monthKey) && !isPosted(t, monthKey))
    .map((t) => ({ template: t, date: dueDate(t, monthKey) }))
    .sort((a, b) => a.date - b.date)
}

// Expected amount per category for a month from active templates
export function recurringPlan(templates, monthKey) {
  const plan = { expense: {}, income: {} }
  for (const t of templates) {
    if (!appliesToMonth(t, monthKey)) continue
    plan[t.type][t.category] = (plan[t.type][t.category] || 0) + Math.abs(t.amount)
  }
  return plan
}

// Add every entry that has come due since a template last posted. Each month's
// entry has a fixed ID, so if two people open the household at once, the second
// write is refused by the security rules instead of creating a duplicate.
export async function postDueRecurring(templates, user, now = new Date()) {
  const posted = []
  const thisMonth = currentMonthKey()
  const earliest = shiftMonth(thisMonth, -(MAX_CATCH_UP_MONTHS - 1))

  for (const template of templates) {
    if (template.active === false) continue
    let key = template.lastPostedMonth ? shiftMonth(template.lastPostedMonth, 1) : template.startMonth
    if (key < earliest) key = earliest
    let postedThrough = null

    for (; key <= thisMonth; key = shiftMonth(key, 1)) {
      const date = dueDate(template, key)
      if (date > now) break
      const entry = {
        householdId: template.householdId,
        amount: Math.abs(template.amount),
        type: template.type,
        category: template.category,
        note: template.note || '',
        timestamp: date,
        createdBy: user.uid,
        createdByName: template.createdByName || 'Recurring',
        recurringId: template.id,
      }
      try {
        await setDoc(doc(db, 'transactions', `rec_${template.id}_${key}`), { ...entry, createdAt: serverTimestamp() })
        posted.push({ id: `rec_${template.id}_${key}`, ...entry, createdAt: new Date() })
      } catch (error) {
        // Already added by someone else (the rules refuse overwriting it); move on
        if (error?.code !== 'permission-denied') throw error
      }
      postedThrough = key
    }

    if (postedThrough) {
      try {
        await updateRecurring(template.id, { lastPostedMonth: postedThrough })
        template.lastPostedMonth = postedThrough
      } catch (error) {
        console.warn('Could not record recurring progress:', error)
      }
    }
  }
  return posted
}
