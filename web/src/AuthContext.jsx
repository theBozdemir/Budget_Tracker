import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, sendCustomPasswordResetEmail } from './firebase'
import { clearInviteSession, ensureUserProfile } from './services/users'
import { syncMemberRecordsForUser } from './services/households'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      setUser(firebaseUser)

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
    const result = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password)
    await updateProfile(result.user, { displayName })
    await result.user.getIdToken(true)

    const profileData = await ensureUserProfile({ ...result.user, displayName })
    setProfile(profileData)
    return result.user
  }

  async function signIn(email, password) {
    const result = await signInWithEmailAndPassword(auth, email.toLowerCase(), password)
    await result.user.getIdToken(true)
    const profileData = await ensureUserProfile(result.user)
    setProfile(profileData)
    return result.user
  }

  async function resetPassword(email) {
    const normalized = email.toLowerCase()
    try {
      await sendCustomPasswordResetEmail(normalized)
    } catch (error) {
      const code = error?.code || ''
      if (code === 'functions/failed-precondition' || code === 'functions/not-found') {
        await sendPasswordResetEmail(auth, normalized)
        return
      }
      throw error
    }
  }

  async function logOut() {
    clearInviteSession()
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, resetPassword, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
