import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { clearPendingInviteSession } from '../inviteUtils'

export function normalizedEmail(user, profile) {
  return (user?.email || profile?.email || '').toLowerCase()
}

export async function ensureUserProfile(user) {
  if (!user) return null

  const ref = doc(db, 'users', user.uid)
  const email = user.email?.toLowerCase() || ''
  const existing = await getDoc(ref)
  const profileData = {
    displayName: user.displayName || existing.data()?.displayName || 'User',
    email: email || existing.data()?.email || '',
    joinedHouseholdIds: existing.data()?.joinedHouseholdIds || [],
  }

  await setDoc(ref, profileData, { merge: true })
  return profileData
}

export async function addJoinedHousehold(userId, householdId) {
  await setDoc(
    doc(db, 'users', userId),
    { joinedHouseholdIds: arrayUnion(householdId) },
    { merge: true }
  )
}

export async function removeJoinedHousehold(userId, householdId) {
  const ref = doc(db, 'users', userId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  await updateDoc(ref, {
    joinedHouseholdIds: arrayRemove(householdId),
  })
}

export { clearPendingInviteSession as clearInviteSession }

// Remove what we store about the user. The rules allow deleting your own
// profile; if they haven't been redeployed yet, blank it out instead.
export async function deleteUserProfile(userId) {
  const ref = doc(db, 'users', userId)
  try {
    await deleteDoc(ref)
  } catch (error) {
    if (error?.code !== 'permission-denied') throw error
    await setDoc(ref, { displayName: '', email: '', joinedHouseholdIds: [], deleted: true })
  }
}
