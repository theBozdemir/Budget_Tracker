export function firestoreErrorMessage(error) {
  const code = error?.code || ''
  const message = error?.message || ''

  if (code === 'permission-denied' || message.includes('insufficient permissions')) {
    return 'Permission denied. Make sure you are signed in with the email that received the invite, then try again.'
  }
  if (code === 'not-found') {
    return 'This item no longer exists.'
  }
  if (message.includes('Failed to fetch') || code === 'unavailable') {
    return 'Network error. Check your connection and try again.'
  }

  return message || 'Something went wrong. Please try again.'
}
