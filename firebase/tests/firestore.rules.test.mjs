// Security rules tests. Run with `npm run test:rules` in firebase/ (starts the
// Firestore emulator). Each "blocks" test is an attack that must be denied; each
// "allows" test mirrors a real write the web app makes, so tightening the rules
// can't silently break the app.
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
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

const HOUSEHOLD = 'h1'
const INVITE = 'invite1'
const TOKEN = 'token-carol'

let env

const users = {
  alice: { email: 'alice@example.com', email_verified: true }, // creator
  bob: { email: 'bob@example.com', email_verified: true }, // member
  carol: { email: 'carol@example.com', email_verified: true }, // invited, verified
  eve: { email: 'eve@example.com', email_verified: true }, // outsider
}

function db(name, overrides = {}) {
  return env.authenticatedContext(name, { ...users[name], ...overrides }).firestore()
}

function transaction(createdBy, extra = {}) {
  return {
    householdId: HOUSEHOLD,
    amount: 42.5,
    type: 'expense',
    category: 'Groceries',
    note: 'Weekly shop',
    timestamp: new Date(),
    createdBy,
    createdByName: createdBy,
    createdAt: serverTimestamp(),
    ...extra,
  }
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-budget-tracker',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})

after(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore()
    await setDoc(doc(admin, 'households', HOUSEHOLD), {
      name: 'Family',
      currency: 'CAD',
      expenseCategories: ['Groceries'],
      incomeCategories: ['Salary'],
      memberIds: ['alice', 'bob'],
      pendingInviteEmails: ['carol@example.com'],
      joinInviteFor: { 'carol@example.com': INVITE },
      createdBy: 'alice',
      createdAt: new Date(),
    })
    for (const name of ['alice', 'bob']) {
      await setDoc(doc(admin, 'households', HOUSEHOLD, 'members', name), {
        userId: name,
        email: users[name].email,
        displayName: name,
      })
    }
    await setDoc(doc(admin, 'invites', INVITE), {
      householdId: HOUSEHOLD,
      householdName: 'Family',
      email: 'carol@example.com',
      invitedBy: 'alice',
      invitedByName: 'alice',
      status: 'pending',
      token: TOKEN,
    })
    await setDoc(doc(admin, 'inviteLinks', TOKEN), {
      inviteId: INVITE,
      email: 'carol@example.com',
      householdId: HOUSEHOLD,
      status: 'pending',
    })
    await setDoc(doc(admin, 'transactions', 'tx-bob'), transaction('bob'))
    await setDoc(doc(admin, 'transactions', 'tx-alice'), transaction('alice'))
  })
})

describe('outsiders', () => {
  it('blocks listing every invite link (would leak invite emails and IDs)', async () => {
    await assertFails(getDocs(collection(db('eve'), 'inviteLinks')))
  })

  it('blocks reading a household, its members and its transactions', async () => {
    const eve = db('eve')
    await assertFails(getDoc(doc(eve, 'households', HOUSEHOLD)))
    await assertFails(getDocs(collection(eve, 'households', HOUSEHOLD, 'members')))
    await assertFails(getDocs(query(collection(eve, 'transactions'), where('householdId', '==', HOUSEHOLD))))
  })

  it('blocks adding themselves to a household', async () => {
    const eve = db('eve')
    await assertFails(updateDoc(doc(eve, 'households', HOUSEHOLD), { memberIds: arrayUnion('eve') }))
    await assertFails(setDoc(doc(eve, 'households', HOUSEHOLD, 'members', 'eve'), { userId: 'eve' }))
  })

  it('blocks joining with a stolen invite ID when the email is not theirs', async () => {
    await assertFails(
      setDoc(doc(db('eve'), 'households', HOUSEHOLD, 'members', 'eve'), { userId: 'eve', inviteId: INVITE })
    )
  })

  it('blocks creating a household that lists other people as members', async () => {
    await assertFails(
      setDoc(doc(db('eve'), 'households', 'h-eve'), {
        name: 'Trap',
        memberIds: ['eve', 'alice'],
        createdBy: 'eve',
      })
    )
  })
})

describe('household members', () => {
  it('blocks taking over ownership of the household', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'households', HOUSEHOLD), { createdBy: 'bob' }))
  })

  it('blocks removing other members', async () => {
    const bob = db('bob')
    await assertFails(updateDoc(doc(bob, 'households', HOUSEHOLD), { memberIds: ['bob'] }))
    await assertFails(deleteDoc(doc(bob, 'households', HOUSEHOLD, 'members', 'alice')))
  })

  it('blocks adding someone else to the household', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'households', HOUSEHOLD), { memberIds: arrayUnion('eve') }))
  })

  it('blocks adding transactions in someone else’s name', async () => {
    await assertFails(setDoc(doc(db('bob'), 'transactions', 'fake'), transaction('alice')))
  })

  it('blocks malformed or oversized transactions', async () => {
    const bob = db('bob')
    await assertFails(setDoc(doc(bob, 'transactions', 't1'), transaction('bob', { amount: '42' })))
    await assertFails(setDoc(doc(bob, 'transactions', 't2'), transaction('bob', { type: 'gift' })))
    await assertFails(setDoc(doc(bob, 'transactions', 't3'), transaction('bob', { note: 'x'.repeat(5000) })))
    await assertFails(setDoc(doc(bob, 'transactions', 't4'), transaction('bob', { isAdmin: true })))
  })

  it('blocks editing someone else’s transaction unless you own the household', async () => {
    await assertFails(
      updateDoc(doc(db('bob'), 'transactions', 'tx-alice'), { amount: 1, updatedBy: 'bob', updatedAt: serverTimestamp() })
    )
  })

  it('blocks edits that move an entry, change who added it, or break its fields', async () => {
    const bob = db('bob')
    const ref = doc(bob, 'transactions', 'tx-bob')
    const stamp = { updatedBy: 'bob', updatedAt: serverTimestamp() }
    await assertFails(updateDoc(ref, { householdId: 'other', ...stamp }))
    await assertFails(updateDoc(ref, { createdBy: 'alice', ...stamp }))
    await assertFails(updateDoc(ref, { createdByName: 'alice', ...stamp }))
    await assertFails(updateDoc(ref, { amount: 'lots', ...stamp }))
    await assertFails(updateDoc(ref, { type: 'gift', ...stamp }))
    await assertFails(updateDoc(ref, { note: 'x'.repeat(5000), ...stamp }))
    await assertFails(updateDoc(ref, { amount: 10, updatedBy: 'alice', updatedAt: serverTimestamp() }))
  })

  it('blocks outsiders from editing transactions', async () => {
    await assertFails(
      updateDoc(doc(db('eve'), 'transactions', 'tx-bob'), { amount: 1, updatedBy: 'eve', updatedAt: serverTimestamp() })
    )
  })

  it('blocks rewriting an invite to point at someone else', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'invites', INVITE), { email: 'eve@example.com' }))
  })
})

describe('invited people', () => {
  it('blocks someone who signed up with the invitee’s email but never verified it', async () => {
    const impostor = env
      .authenticatedContext('impostor', { email: 'carol@example.com', email_verified: false })
      .firestore()
    await assertFails(getDoc(doc(impostor, 'invites', INVITE)))
    await assertFails(
      getDocs(
        query(
          collection(impostor, 'invites'),
          where('email', '==', 'carol@example.com'),
          where('status', '==', 'pending')
        )
      )
    )
    await assertFails(
      setDoc(doc(impostor, 'households', HOUSEHOLD, 'members', 'impostor'), {
        userId: 'impostor',
        email: 'carol@example.com',
        inviteId: INVITE,
      })
    )
    await assertFails(updateDoc(doc(impostor, 'invites', INVITE), { status: 'accepted' }))
  })

  it('blocks invites with an empty email matching unverified accounts', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites', 'blank'), {
        householdId: HOUSEHOLD,
        email: '',
        invitedBy: 'alice',
        status: 'pending',
      })
    })
    const unverified = env.authenticatedContext('nobody', { email_verified: false }).firestore()
    await assertFails(getDoc(doc(unverified, 'invites', 'blank')))
    await assertFails(
      setDoc(doc(db('bob'), 'invites', 'blank2'), {
        householdId: HOUSEHOLD,
        email: '',
        invitedBy: 'bob',
        status: 'pending',
      })
    )
  })

  it('blocks changing anything but the status when answering an invite', async () => {
    await assertFails(
      updateDoc(doc(db('carol'), 'invites', INVITE), { status: 'accepted', householdId: 'other' })
    )
  })
})

describe('normal app use still works', () => {
  it('allows creating a household with its first member record', async () => {
    const alice = db('alice')
    await assertSucceeds(
      setDoc(doc(alice, 'households', 'h-new'), {
        name: 'New',
        currency: 'USD',
        expenseCategories: ['Groceries'],
        incomeCategories: ['Salary'],
        memberIds: ['alice'],
        pendingInviteEmails: [],
        joinInviteFor: {},
        createdBy: 'alice',
        createdAt: serverTimestamp(),
      })
    )
    await assertSucceeds(
      setDoc(doc(alice, 'households', 'h-new', 'members', 'alice'), {
        userId: 'alice',
        email: 'alice@example.com',
        displayName: 'alice',
        joinedAt: serverTimestamp(),
      })
    )
  })

  it('allows any member to change currency and categories', async () => {
    const bob = db('bob')
    await assertSucceeds(updateDoc(doc(bob, 'households', HOUSEHOLD), { currency: 'EUR' }))
    await assertSucceeds(
      updateDoc(doc(bob, 'households', HOUSEHOLD), {
        expenseCategories: ['Groceries', 'Pets'],
        incomeCategories: ['Salary'],
      })
    )
  })

  it('allows members to invite someone and cancel the invite', async () => {
    const bob = db('bob')
    await assertSucceeds(
      setDoc(doc(bob, 'invites', 'invite2'), {
        householdId: HOUSEHOLD,
        householdName: 'Family',
        householdMemberIds: ['alice', 'bob'],
        email: 'dan@example.com',
        invitedBy: 'bob',
        invitedByName: 'bob',
        status: 'pending',
        token: 'token-dan',
        createdAt: serverTimestamp(),
      })
    )
    await assertSucceeds(
      setDoc(doc(bob, 'inviteLinks', 'token-dan'), {
        inviteId: 'invite2',
        email: 'dan@example.com',
        householdId: HOUSEHOLD,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    )
    await assertSucceeds(
      updateDoc(doc(bob, 'households', HOUSEHOLD), {
        pendingInviteEmails: arrayUnion('dan@example.com'),
        joinInviteFor: { 'carol@example.com': INVITE, 'dan@example.com': 'invite2' },
      })
    )
    await assertSucceeds(deleteDoc(doc(bob, 'invites', 'invite2')))
    await assertSucceeds(deleteDoc(doc(bob, 'inviteLinks', 'token-dan')))
    await assertSucceeds(
      updateDoc(doc(bob, 'households', HOUSEHOLD), {
        pendingInviteEmails: arrayRemove('dan@example.com'),
        joinInviteFor: { 'carol@example.com': INVITE },
      })
    )
  })

  it('allows the invited person to see their invites once their email is verified', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(db('carol'), 'invites'),
          where('email', '==', 'carol@example.com'),
          where('status', '==', 'pending')
        )
      )
    )
  })

  it('allows the invited person to open the link and join', async () => {
    const carol = db('carol')
    await assertSucceeds(getDoc(doc(carol, 'inviteLinks', TOKEN)))
    await assertSucceeds(getDoc(doc(carol, 'invites', INVITE)))
    await assertSucceeds(
      setDoc(doc(carol, 'households', HOUSEHOLD, 'members', 'carol'), {
        userId: 'carol',
        email: 'carol@example.com',
        displayName: 'carol',
        inviteId: INVITE,
        joinedAt: serverTimestamp(),
      })
    )
    await assertSucceeds(updateDoc(doc(carol, 'households', HOUSEHOLD), { memberIds: arrayUnion('carol') }))
    await assertSucceeds(
      updateDoc(doc(carol, 'invites', INVITE), { status: 'accepted', acceptedAt: serverTimestamp() })
    )
    await assertSucceeds(getDoc(doc(carol, 'households', HOUSEHOLD)))
  })

  it('allows the invited person to decline', async () => {
    await assertSucceeds(
      updateDoc(doc(db('carol'), 'invites', INVITE), { status: 'declined', declinedAt: serverTimestamp() })
    )
  })

  it('allows members to add and delete their own transactions', async () => {
    const bob = db('bob')
    await assertSucceeds(setDoc(doc(bob, 'transactions', 'tx-new'), transaction('bob')))
    await assertSucceeds(
      setDoc(doc(bob, 'transactions', 'tx-income'), transaction('bob', { type: 'income', note: '' }))
    )
    await assertSucceeds(
      getDocs(query(collection(bob, 'transactions'), where('householdId', '==', HOUSEHOLD)))
    )
    await assertSucceeds(deleteDoc(doc(bob, 'transactions', 'tx-new')))
  })

  it('allows the person who added an entry to edit it', async () => {
    await assertSucceeds(
      updateDoc(doc(db('bob'), 'transactions', 'tx-bob'), {
        amount: 99.99,
        type: 'income',
        category: 'Salary',
        note: 'Fixed amount',
        timestamp: new Date(),
        updatedBy: 'bob',
        updatedAt: serverTimestamp(),
      })
    )
  })

  it('allows the household owner to edit anyone’s entry', async () => {
    await assertSucceeds(
      updateDoc(doc(db('alice'), 'transactions', 'tx-bob'), {
        category: 'Rent',
        updatedBy: 'alice',
        updatedAt: serverTimestamp(),
      })
    )
  })

  it('allows the household creator to delete any transaction', async () => {
    await assertSucceeds(deleteDoc(doc(db('alice'), 'transactions', 'tx-bob')))
  })

  it('allows members to update their own member record', async () => {
    await assertSucceeds(
      setDoc(doc(db('bob'), 'households', HOUSEHOLD, 'members', 'bob'), { displayName: 'Bobby' }, { merge: true })
    )
  })

  it('allows a member to leave', async () => {
    const bob = db('bob')
    await assertSucceeds(updateDoc(doc(bob, 'households', HOUSEHOLD), { memberIds: arrayRemove('bob') }))
    await assertSucceeds(deleteDoc(doc(bob, 'households', HOUSEHOLD, 'members', 'bob')))
  })

  it('allows the creator to delete the whole household', async () => {
    const alice = db('alice')
    await assertSucceeds(deleteDoc(doc(alice, 'transactions', 'tx-bob')))
    await assertSucceeds(deleteDoc(doc(alice, 'invites', INVITE)))
    await assertSucceeds(deleteDoc(doc(alice, 'inviteLinks', TOKEN)))
    await assertSucceeds(deleteDoc(doc(alice, 'households', HOUSEHOLD, 'members', 'bob')))
    await assertSucceeds(deleteDoc(doc(alice, 'households', HOUSEHOLD, 'members', 'alice')))
    await assertSucceeds(deleteDoc(doc(alice, 'households', HOUSEHOLD)))
  })

  it('allows people to manage and delete their own profile', async () => {
    const eve = db('eve')
    await assertSucceeds(setDoc(doc(eve, 'users', 'eve'), { displayName: 'Eve', email: 'eve@example.com' }))
    await assertSucceeds(getDoc(doc(eve, 'users', 'eve')))
    await assertSucceeds(deleteDoc(doc(eve, 'users', 'eve')))
    await assertFails(getDoc(doc(eve, 'users', 'alice')))
  })
})
