import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDVfSdueIXMdZfG-S82mhXGNbb2wrCHsVc',
  authDomain: 'budget-tracker-74611.firebaseapp.com',
  projectId: 'budget-tracker-74611',
  storageBucket: 'budget-tracker-74611.firebasestorage.app',
  messagingSenderId: '958755122153',
  appId: '1:958755122153:web:a8e935dc6d25708cfef978',
}

const app = initializeApp(firebaseConfig)
export default app
export const auth = getAuth(app)
export const db = getFirestore(app)
