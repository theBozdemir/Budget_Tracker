import { Capacitor } from '@capacitor/core'
import { BiometricAuth, BiometryErrorType, BiometryType } from '@aparajita/capacitor-biometric-auth'

const ENABLED_KEY = 'appLock.enabled'

const FRESH_SIGN_IN_MS = 15000

let signedInAt = 0

export function markFreshSignIn() {
  signedInAt = Date.now()
}

export function isFreshSignIn() {
  return Date.now() - signedInAt < FRESH_SIGN_IN_MS
}

// Face ID / fingerprint lock only exists in the iPhone and Android apps
export function isAppLockSupported() {
  return Capacitor.isNativePlatform()
}

export function isAppLockEnabled() {
  if (!isAppLockSupported()) return false
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setAppLockEnabled(enabled) {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled))
  } catch {
    // Without storage the lock simply stays off
  }
}

function biometryLabel(type) {
  switch (type) {
    case BiometryType.faceId:
      return 'Face ID'
    case BiometryType.touchId:
      return 'Touch ID'
    case BiometryType.fingerprintAuthentication:
      return 'Fingerprint'
    case BiometryType.faceAuthentication:
      return 'Face unlock'
    case BiometryType.irisAuthentication:
      return 'Iris unlock'
    default:
      return 'Passcode'
  }
}

// What the device can do: biometrics, or at least the phone's passcode as a fallback
export async function getBiometryInfo() {
  if (!isAppLockSupported()) return { available: false, label: '' }
  const result = await BiometricAuth.checkBiometry()
  return {
    available: result.isAvailable || result.deviceIsSecure,
    label: biometryLabel(result.isAvailable ? result.biometryType : BiometryType.none),
  }
}

export async function authenticate(reason) {
  await BiometricAuth.authenticate({
    reason,
    cancelTitle: 'Cancel',
    allowDeviceCredential: true,
    iosFallbackTitle: 'Use passcode',
    androidTitle: 'Unlock Budget Tracker',
    androidSubtitle: reason,
  })
}

export function isCancelError(error) {
  return [BiometryErrorType.userCancel, BiometryErrorType.appCancel, BiometryErrorType.systemCancel].includes(
    error?.code,
  )
}
