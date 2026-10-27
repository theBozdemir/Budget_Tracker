import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { auth, db } from './firebase'
import { APP_URL } from './inviteUtils'
import { markFreshSignIn } from './appLock'
import { clearInviteSession, deleteUserProfile, ensureUserProfile } from './services/users'
import { removeUserFromAllHouseholds, syncMemberRecordsForUser } from './services/households'

const AuthContext = createContext(null)

// Links in Firebase emails return here. The app shell's own origin isn't a real
// website, so the phone apps point at the hosted app instead.
function appOrigin() {
  return Capacitor.isNativePlatform() ? APP_URL : window.location.origin
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      setUser(firebaseUser)
      setEmailVerified(Boolean(firebaseUser?.emailVerified))

      if (firebaseUser) {
        try {
          await firebaseUser.getIdToken(true)
          await ensureUserProfile(firebaseUser)
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          const profileData = snap.exists() ? snap.data() : null
          setProfile(profileData)
          syncMemberRecordsForUser(firebaseUser, profileData).catch((error) => {
            console.warn('Could not sync household member names:', error)
          })
        } catch (error) {
          console.error('Could not load profile:', error)
          setProfile({
            displayName: firebaseUser.displayName || 'User',
            email: firebaseUser.email?.toLowerCase() || '',
            joinedHouseholdIds: [],
          })
        }
      } else {
        setProfile(null)
      }

      setLoading(false)
    })
  }, [])

  async function signUp(displayName, email, password) {
    markFreshSignIn()
    const result = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password)
    await updateProfile(result.user, { displayName })
    try {
      await sendEmailVerification(result.user, { url: `${appOrigin()}/invites` })
    } catch (error) {
      // Not fatal: the Invites page lets people resend the email
      console.warn('Could not send verification email:', error)
    }
    await result.user.getIdToken(true)

    const profileData = await ensureUserProfile({ ...result.user, displayName })
    setProfile(profileData)
    return result.user
  }

  async function signIn(email, password) {
    markFreshSignIn()
    const result = await signInWithEmailAndPassword(auth, email.toLowerCase(), password)
    await result.user.getIdToken(true)
    const profileData = await ensureUserProfile(result.user)
    setProfile(profileData)
    return result.user
  }

  async function resendVerificationEmail() {
    if (!auth.currentUser) throw new Error('You need to be signed in.')
    await sendEmailVerification(auth.currentUser, { url: `${appOrigin()}/invites` })
  }

  // After the person clicks the link in the email, reload the account and get a
  // fresh ID token so the security rules see email_verified = true
  async function refreshEmailVerification() {
    const currentUser = auth.currentUser
    if (!currentUser) return false
    await currentUser.reload()
    await currentUser.getIdToken(true)
    setEmailVerified(Boolean(currentUser.emailVerified))
    return Boolean(currentUser.emailVerified)
  }

  async function resetPassword(email) {
    const normalized = email.trim().toLowerCase()
    try {
      // After resetting, Firebase's page offers a "Continue" button back to our login
      await sendPasswordResetEmail(auth, normalized, { url: `${appOrigin()}/login` })
    } catch (error) {
      const code = error?.code || ''
      if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
        await sendPasswordResetEmail(auth, normalized)
        return
      }
      throw error
    }
  }

  async function reauthenticate(password) {
    const currentUser = auth.currentUser
    if (!currentUser?.email) throw new Error('You need to be signed in to do this.')
    await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password))
    return currentUser
  }

  async function changePassword(currentPassword, newPassword) {
    const currentUser = await reauthenticate(currentPassword)
    await updatePassword(currentUser, newPassword)
  }

  async function deleteAccount(password) {
    // Re-authenticate first so a wrong password fails before any data is touched
    const currentUser = await reauthenticate(password)
    await removeUserFromAllHouseholds(currentUser.uid)
    await deleteUserProfile(currentUser.uid)
    clearInviteSession()
    await deleteUser(currentUser)
  }

  async function logOut() {
    clearInviteSession()
    await signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        emailVerified,
        signUp,
        signIn,
        resetPassword,
        resendVerificationEmail,
        refreshEmailVerification,
        changePassword,
        deleteAccount,
        logOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
