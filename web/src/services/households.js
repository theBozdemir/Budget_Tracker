import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { buildInviteLink, createInviteToken } from '../inviteUtils'
import { DEFAULT_CURRENCY, isValidCurrency } from '../constants'
import {
  defaultExpenseCategories,
  defaultIncomeCategories,
  getHouseholdCategories,
  normalizeCategoryName,
  uniqCategories,
} from './categories'
import { addJoinedHousehold, ensureUserProfile, normalizedEmail, removeJoinedHousehold } from './users'

function withoutJoinInviteEntry(joinInviteFor, email) {
  const next = { ...(joinInviteFor || {}) }
  delete next[email.toLowerCase()]
  return next
}

function buildJoinInviteMap(invites) {
  return Object.fromEntries(invites.map((invite) => [invite.email, invite.id]))
}

function formatDisplayNameFromEmail(email) {
  if (!email) return 'Member'
  const local = email.split('@')[0] || 'Member'
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

function looksLikeEmailDerivedName(name, email) {
  if (!name?.trim() || !email) return !name?.trim()
  const normalizedName = name.trim().toLowerCase()
  const local = email.split('@')[0]?.toLowerCase() || ''
  if (local && normalizedName === local) return true
  return normalizedName === formatDisplayNameFromEmail(email).toLowerCase()
}

function resolveMemberDisplayName(user, profile) {
  const profileName = profile?.displayName?.trim()
  const authName = user?.displayName?.trim()
  if (profileName && profileName !== 'User') return profileName
  if (authName) return authName
  return formatDisplayNameFromEmail(normalizedEmail(user, profile))
}

function displayNameForMember(member, isSelf, currentUser, currentProfile) {
  if (isSelf) return resolveMemberDisplayName(currentUser, currentProfile)

  const stored = member.displayName?.trim()
  if (stored && !looksLikeEmailDerivedName(stored, member.email)) {
    return stored
  }

  return stored || 'Member'
}

export async function fetchHouseholds(userId) {
  let joinedIds = []
  try {
    const userSnap = await getDoc(doc(db, 'users', userId))
    if (userSnap.exists()) {
      joinedIds = userSnap.data().joinedHouseholdIds || []
    }
  } catch (error) {
    console.warn('Could not load user profile for households:', error)
  }

  const households = new Map()

  try {
    const directSnap = await getDocs(
      query(collection(db, 'households'), where('memberIds', 'array-contains', userId))
    )
    for (const householdDoc of directSnap.docs) {
      households.set(householdDoc.id, { id: householdDoc.id, ...householdDoc.data() })
    }
  } catch (error) {
    console.warn('Could not load owned households:', error)
  }

  const inaccessibleIds = []
  for (const householdId of joinedIds) {
    if (households.has(householdId)) continue
    try {
      const householdSnap = await getDoc(doc(db, 'households', householdId))
      if (householdSnap.exists()) {
        households.set(householdSnap.id, { id: householdSnap.id, ...householdSnap.data() })
      } else {
        inaccessibleIds.push(householdId)
      }
    } catch (error) {
      console.warn(`Could not load household ${householdId}:`, error)
      inaccessibleIds.push(householdId)
    }
  }

  if (inaccessibleIds.length > 0) {
    try {
      await Promise.all(inaccessibleIds.map((id) => removeJoinedHousehold(userId, id)))
    } catch (error) {
      console.warn('Could not prune stale household links:', error)
    }
  }

  return [...households.values()].sort(
    (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
  )
}

export async function createHousehold(name, user, currency = DEFAULT_CURRENCY) {
  const profile = await ensureUserProfile(user)
  const household = {
    name: name.trim(),
    currency: isValidCurrency(currency) ? currency : DEFAULT_CURRENCY,
    expenseCategories: defaultExpenseCategories(),
    incomeCategories: defaultIncomeCategories(),
    memberIds: [user.uid],
    pendingInviteEmails: [],
    joinInviteFor: {},
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'households'), household)
  await setDoc(doc(db, 'households', ref.id, 'members', user.uid), {
    userId: user.uid,
    email: normalizedEmail(user, profile),
    displayName: resolveMemberDisplayName(user, profile),
    joinedAt: serverTimestamp(),
  })
  await addJoinedHousehold(user.uid, ref.id)
  return { id: ref.id, ...household, createdAt: new Date() }
}

export async function updateHouseholdCurrency(householdId, currency) {
  if (!isValidCurrency(currency)) {
    throw new Error('Please choose a valid currency.')
  }

  await updateDoc(doc(db, 'households', householdId), { currency })
}

export async function ensureHouseholdCategories(household) {
  if (!household?.id) return household

  const expenseCategories = uniqCategories(
    household.expenseCategories?.length ? household.expenseCategories : defaultExpenseCategories()
  )
  const incomeCategories = uniqCategories(
    household.incomeCategories?.length ? household.incomeCategories : defaultIncomeCategories()
  )

  const needsSave =
    !household.expenseCategories?.length ||
    !household.incomeCategories?.length ||
    expenseCategories.length !== (household.expenseCategories || []).length ||
    incomeCategories.length !== (household.incomeCategories || []).length

  if (needsSave) {
    await updateDoc(doc(db, 'households', household.id), {
      expenseCategories,
      incomeCategories,
    })
  }

  return { ...household, expenseCategories, incomeCategories }
}

export async function updateHouseholdCategories(householdId, { expenseCategories, incomeCategories }) {
  const expense = uniqCategories(expenseCategories || [])
  const income = uniqCategories(incomeCategories || [])

  if (expense.length === 0 || income.length === 0) {
    throw new Error('Each list needs at least one category.')
  }

  await updateDoc(doc(db, 'households', householdId), {
    expenseCategories: expense,
    incomeCategories: income,
  })

  return { expenseCategories: expense, incomeCategories: income }
}

export async function syncJoinInviteMap(household, invites, userId) {
  const joinInviteFor = buildJoinInviteMap(invites)
  const pendingInviteEmails = invites.map((invite) => invite.email)
  const existingJoinInviteFor = household.joinInviteFor || {}
  const existingPendingInviteEmails = household.pendingInviteEmails || []
  const canManage = (household.memberIds || []).includes(userId)

  const joinUnchanged =
    Object.keys(joinInviteFor).length === Object.keys(existingJoinInviteFor).length &&
    Object.entries(joinInviteFor).every(([email, inviteId]) => existingJoinInviteFor[email] === inviteId)
  const pendingUnchanged =
    pendingInviteEmails.length === existingPendingInviteEmails.length &&
    pendingInviteEmails.every((email) => existingPendingInviteEmails.includes(email))

  if (!canManage || (joinUnchanged && pendingUnchanged)) {
    return { ...household, joinInviteFor, pendingInviteEmails }
  }

  await updateDoc(doc(db, 'households', household.id), {
    joinInviteFor,
    pendingInviteEmails,
  })

  return { ...household, joinInviteFor, pendingInviteEmails }
}

export async function ensureHouseholdMembership(householdId, userId) {
  const householdRef = doc(db, 'households', householdId)
  const householdSnap = await getDoc(householdRef)
  if (!householdSnap.exists()) return null

  const household = { id: householdSnap.id, ...householdSnap.data() }
  const memberIds = household.memberIds || []
  if (memberIds.includes(userId)) return household

  const memberSnap = await getDoc(doc(db, 'households', householdId, 'members', userId))
  if (!memberSnap.exists()) return household

  await updateDoc(householdRef, {
    memberIds: arrayUnion(userId),
  })

  return {
    ...household,
    memberIds: [...memberIds, userId],
  }
}

export async function ensureMemberRecord(householdId, user, profile) {
  const profileData = profile || (await ensureUserProfile(user))
  const memberRef = doc(db, 'households', householdId, 'members', user.uid)
  const snap = await getDoc(memberRef)
  const email = normalizedEmail(user, profileData)
  const displayName = resolveMemberDisplayName(user, profileData)

  if (!snap.exists()) {
    await setDoc(memberRef, {
      userId: user.uid,
      email,
      displayName,
      joinedAt: serverTimestamp(),
    })
    return
  }

  const stored = snap.data()
  const updates = {}
  const storedName = stored.displayName?.trim()
  if (
    displayName &&
    (!storedName ||
      storedName === 'User' ||
      storedName === 'Member' ||
      looksLikeEmailDerivedName(storedName, stored.email || email))
  ) {
    updates.displayName = displayName
  }
  if (!stored.email && email) updates.email = email
  if (Object.keys(updates).length > 0) {
    await setDoc(memberRef, updates, { merge: true })
  }
}

export async function syncMemberRecordsForUser(user, profile) {
  let joinedIds = profile?.joinedHouseholdIds || []
  if (joinedIds.length === 0) {
    const userSnap = await getDoc(doc(db, 'users', user.uid))
    if (userSnap.exists()) {
      joinedIds = userSnap.data().joinedHouseholdIds || []
    }
  }

  await Promise.all(
    joinedIds.map((householdId) =>
      ensureMemberRecord(householdId, user, profile).catch((error) => {
        console.warn(`Could not sync member record for ${householdId}:`, error)
      })
    )
  )
}

export async function fetchHouseholdMembers(household, currentUserId, currentProfile, currentUser) {
  const membersSnap = await getDocs(collection(db, 'households', household.id, 'members'))
  const byUserId = new Map()

  for (const memberDoc of membersSnap.docs) {
    const data = memberDoc.data()
    const userId = data.userId || memberDoc.id
    byUserId.set(userId, {
      userId,
      email: data.email || '',
      displayName: data.displayName || '',
      joinedAt: data.joinedAt,
    })
  }

  for (const userId of household.memberIds || []) {
    if (!byUserId.has(userId)) {
      byUserId.set(userId, { userId, email: '', displayName: '' })
    }
  }

  return [...byUserId.values()]
    .map((member) => {
      const isSelf = member.userId === currentUserId
      const isOwner = member.userId === household.createdBy
      const name = displayNameForMember(member, isSelf, currentUser, currentProfile)

      return {
        ...member,
        name,
        isOwner,
        isSelf,
      }
    })
    .sort((a, b) => {
      if (a.isSelf) return -1
      if (b.isSelf) return 1
      if (a.isOwner) return -1
      if (b.isOwner) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
}

export async function fetchHouseholdInvites(householdId) {
  const q = query(
    collection(db, 'invites'),
    where('householdId', '==', householdId),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
}

export async function fetchPendingInvitesForEmail(user, profile) {
  const normalized = (user?.email || profile?.email || '').toLowerCase()
  if (!normalized) return []

  const q = query(
    collection(db, 'invites'),
    where('email', '==', normalized),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function fetchInviteById(inviteId, email) {
  const normalized = email?.toLowerCase()
  if (!inviteId || !normalized) return null

  const snap = await getDoc(doc(db, 'invites', inviteId))
  if (!snap.exists()) return null

  const data = snap.data()
  if (data.status !== 'pending' || data.email !== normalized) return null
  return { id: snap.id, ...data }
}

export async function fetchInviteByToken(token, email) {
  const normalized = email?.toLowerCase()
  if (!token || !normalized) return null

  const linkSnap = await getDoc(doc(db, 'inviteLinks', token))
  if (linkSnap.exists()) {
    const link = linkSnap.data()
    if (link.status !== 'pending' || link.email !== normalized || !link.inviteId) {
      return null
    }
    return fetchInviteById(link.inviteId, normalized)
  }

  const q = query(
    collection(db, 'invites'),
    where('email', '==', normalized),
    where('status', '==', 'pending'),
    where('token', '==', token)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  return { id: docSnap.id, ...docSnap.data() }
}

export async function fetchInviteForJoin({ inviteId, token, email }) {
  if (inviteId) {
    return fetchInviteById(inviteId, email)
  }
  if (token) {
    return fetchInviteByToken(token, email)
  }
  return null
}

async function hasPendingInviteForEmail(householdId, email) {
  const snap = await getDocs(
    query(
      collection(db, 'invites'),
      where('householdId', '==', householdId),
      where('email', '==', email),
      where('status', '==', 'pending')
    )
  )
  return !snap.empty
}

async function isEmailAlreadyMember(householdId, email) {
  const snap = await getDocs(
    query(collection(db, 'households', householdId, 'members'), where('email', '==', email))
  )
  return !snap.empty
}

export async function inviteMember(email, household, user, profile) {
  const normalized = email.toLowerCase().trim()
  if (!normalized) throw new Error('Please enter a valid email address.')
  if (normalizedEmail(user, profile) === normalized) {
    throw new Error('You are already in this household.')
  }

  if ((household.pendingInviteEmails || []).includes(normalized) || household.joinInviteFor?.[normalized]) {
    throw new Error('This person already has a pending invite for this household.')
  }

  if (await hasPendingInviteForEmail(household.id, normalized)) {
    throw new Error('This person already has a pending invite for this household.')
  }

  if (await isEmailAlreadyMember(household.id, normalized)) {
    throw new Error('This person is already a member of this household.')
  }

  const memberIds = [...new Set([...(household.memberIds || []), user.uid])]

  const token = createInviteToken()
  const ref = await addDoc(collection(db, 'invites'), {
    householdId: household.id,
    householdName: household.name,
    householdMemberIds: memberIds,
    email: normalized,
    invitedBy: user.uid,
    invitedByName: profile?.displayName || user.displayName || 'Someone',
    status: 'pending',
    token,
    createdAt: serverTimestamp(),
  })

  await setDoc(doc(db, 'inviteLinks', token), {
    inviteId: ref.id,
    email: normalized,
    householdId: household.id,
    status: 'pending',
    createdAt: serverTimestamp(),
  })

  await updateDoc(doc(db, 'households', household.id), {
    pendingInviteEmails: arrayUnion(normalized),
    joinInviteFor: {
      ...(household.joinInviteFor || {}),
      [normalized]: ref.id,
    },
  })

  const link = buildInviteLink({ inviteId: ref.id, token, email: normalized })
  return { id: ref.id, token, link, email: normalized }
}

export async function cancelInvite(invite) {
  await deleteDoc(doc(db, 'invites', invite.id))
  if (invite.token) {
    try {
      await deleteDoc(doc(db, 'inviteLinks', invite.token))
    } catch (error) {
      console.warn('Could not delete invite link:', error)
    }
  }
  if (!invite.householdId || !invite.email) return

  const normalized = invite.email.toLowerCase()
  const householdRef = doc(db, 'households', invite.householdId)
  const householdSnap = await getDoc(householdRef)
  if (!householdSnap.exists()) return

  await updateDoc(householdRef, {
    pendingInviteEmails: arrayRemove(normalized),
    joinInviteFor: withoutJoinInviteEntry(householdSnap.data().joinInviteFor, normalized),
  })
}

export async function declineInvite(invite, user, profile) {
  const email = normalizedEmail(user, profile)
  if (!email || invite.email !== email) {
    throw new Error('You can only decline invites sent to your email address.')
  }

  await updateDoc(doc(db, 'invites', invite.id), {
    status: 'declined',
    declinedAt: serverTimestamp(),
  })
}

export async function acceptInvite(invite, user, profile) {
  await ensureUserProfile(user)
  const email = normalizedEmail(user, profile) || user.email?.toLowerCase()
  if (!email) {
    throw new Error('Your account must have an email address to accept invites.')
  }
  if (invite.email !== email) {
    throw new Error(`This invite was sent to ${invite.email}. You are signed in as ${email}.`)
  }

  const inviteRef = doc(db, 'invites', invite.id)
  const memberRef = doc(db, 'households', invite.householdId, 'members', user.uid)

  const inviteSnap = await getDoc(inviteRef)
  if (!inviteSnap.exists()) {
    throw new Error('This invite is no longer valid.')
  }

  const inviteData = inviteSnap.data()
  if (inviteData.email !== email) {
    throw new Error('This invite was sent to a different email address.')
  }

  if (inviteData.status !== 'pending' && inviteData.status !== 'accepted') {
    throw new Error('This invite is no longer valid.')
  }

  const memberSnap = await getDoc(memberRef)
  const displayName = resolveMemberDisplayName(user, profile)
  if (!memberSnap.exists()) {
    await setDoc(memberRef, {
      userId: user.uid,
      email,
      displayName,
      inviteId: invite.id,
      joinedAt: serverTimestamp(),
    })
  } else {
    const stored = memberSnap.data()
    const updates = {}
    const storedName = stored.displayName?.trim()
    if (
      !storedName ||
      storedName === 'User' ||
      storedName === 'Member' ||
      looksLikeEmailDerivedName(storedName, stored.email || email)
    ) {
      updates.displayName = displayName
    }
    if (Object.keys(updates).length > 0) {
      await setDoc(memberRef, updates, { merge: true })
    }
  }

  const householdRef = doc(db, 'households', invite.householdId)
  const householdSnap = await getDoc(householdRef)
  if (householdSnap.exists()) {
    const memberIds = householdSnap.data().memberIds || []
    if (!memberIds.includes(user.uid)) {
      await updateDoc(householdRef, {
        memberIds: arrayUnion(user.uid),
      })
    }
  }

  if (inviteData.status === 'pending') {
    await updateDoc(inviteRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
    })
  }

  await addJoinedHousehold(user.uid, invite.householdId)
}

export async function fetchAllHouseholdInvites(householdId) {
  const q = query(
    collection(db, 'invites'),
    where('householdId', '==', householdId)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function leaveHousehold(household, userId) {
  const householdRef = doc(db, 'households', household.id)
  const memberIds = household.memberIds || []
  const memberRef = doc(db, 'households', household.id, 'members', userId)

  if (memberIds.includes(userId)) {
    await updateDoc(householdRef, {
      memberIds: arrayRemove(userId),
    })
  }

  try {
    const memberSnap = await getDoc(memberRef)
    if (memberSnap.exists()) {
      await deleteDoc(memberRef)
    }
  } catch (error) {
    console.warn('Could not remove household membership:', error)
    throw error
  }

  await removeJoinedHousehold(userId, household.id)
}

export async function deleteHousehold(household, userId) {
  if (household.createdBy !== userId) {
    throw new Error('Only the household creator can delete it.')
  }

  const [transactionsSnap, invites, membersSnap] = await Promise.all([
    getDocs(query(collection(db, 'transactions'), where('householdId', '==', household.id))),
    fetchAllHouseholdInvites(household.id),
    getDocs(collection(db, 'households', household.id, 'members')),
  ])

  await Promise.all(transactionsSnap.docs.map((transactionDoc) => deleteDoc(transactionDoc.ref)))

  for (const invite of invites) {
    await cancelInvite(invite)
  }

  await Promise.all(membersSnap.docs.map((memberDoc) => deleteDoc(memberDoc.ref)))

  await deleteDoc(doc(db, 'households', household.id))
  await removeJoinedHousehold(userId, household.id)
}
