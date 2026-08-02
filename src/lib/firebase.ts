import { initializeApp, getApps, getApp } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyDgnA1cUv6JuRZDAfaSz9R4ev_pY1xC_vM',
  authDomain: 'customer-database-88e9f.firebaseapp.com',
  projectId: 'customer-database-88e9f',
  storageBucket: 'customer-database-88e9f.firebasestorage.app',
  messagingSenderId: '961040699391',
  appId: '1:961040699391:web:9b47f3bbcfe82186ae21ca',
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

let messaging: ReturnType<typeof getMessaging> | null = null

export async function getFirebaseMessaging() {
  if (messaging) return messaging
  const supported = await isSupported()
  if (!supported) return null
  messaging = getMessaging(app)
  return messaging
}

export { app }
