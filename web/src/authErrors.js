export function authErrorMessage(error) {
  const code = error?.code || ''

  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email. Create an account first.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Wrong email or password. Try again, or use Forgot password to reset it.'
    case 'auth/email-already-in-use':
      return 'This email already has an account (maybe from the iOS app). Tap "Already have an account? Sign in" and use your existing password.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':
      return 'That email address does not look valid.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.'
    case 'auth/unauthorized-domain':
      return 'This website is not authorized in Firebase. Add budget-tracker-74611.web.app under Authentication → Settings → Authorized domains.'
    case 'auth/invalid-api-key':
      return 'Firebase API key problem. Contact support or check Firebase project settings.'
    default:
      return error?.message || 'Something went wrong. Please try again.'
  }
}
