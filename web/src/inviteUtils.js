export const APP_URL = 'https://budget-tracker-74611.web.app'

export function buildInviteLink({ inviteId, token, email }) {
  const params = new URLSearchParams()
  if (inviteId) params.set('invite', inviteId)
  if (token) params.set('token', token)
  if (email) params.set('email', email.toLowerCase())
  return `${APP_URL}/join?${params.toString()}`
}

export function buildInviteEmail({ householdName, inviteEmail, link, inviterName }) {
  const subject = `You're invited to ${householdName} on Budget Tracker`
  const body = [
    'Hi,',
    '',
    `${inviterName} invited you to join "${householdName}" on Budget Tracker.`,
    '',
    'Open this link to join:',
    link,
    '',
    `Sign up or sign in with this email: ${inviteEmail}`,
    '',
    '— Budget Tracker',
  ].join('\n')

  return { subject, body }
}

export function buildInviteMailtoUrl({ householdName, inviteEmail, link, inviterName }) {
  const { subject, body } = buildInviteEmail({ householdName, inviteEmail, link, inviterName })
  return `mailto:${encodeURIComponent(inviteEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function createInviteToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const PENDING_INVITE_ID_KEY = 'pendingInviteId'
export const PENDING_INVITE_TOKEN_KEY = 'pendingInviteToken'
export const PENDING_INVITE_EMAIL_KEY = 'pendingInviteEmail'

export function savePendingInviteSession({ inviteId, token, email }) {
  if (inviteId) sessionStorage.setItem(PENDING_INVITE_ID_KEY, inviteId)
  if (token) sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token)
  if (email) sessionStorage.setItem(PENDING_INVITE_EMAIL_KEY, email.toLowerCase())
}

export function clearPendingInviteSession() {
  sessionStorage.removeItem(PENDING_INVITE_ID_KEY)
  sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
  sessionStorage.removeItem(PENDING_INVITE_EMAIL_KEY)
}

export function getPendingInviteRedirect() {
  const inviteId = sessionStorage.getItem(PENDING_INVITE_ID_KEY)
  const token = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY)
  const email = sessionStorage.getItem(PENDING_INVITE_EMAIL_KEY)
  if (!inviteId && !token) return null

  const params = new URLSearchParams()
  if (inviteId) params.set('invite', inviteId)
  if (token) params.set('token', token)
  if (email) params.set('email', email)
  return `/join?${params.toString()}`
}
