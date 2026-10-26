'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Capacitor } from '@capacitor/core'
import { useAppStore } from '@/store/use-app-store'

type PushStatus = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied' | 'subscribed' | 'loading' | 'error'

export function PushNotificationSetup() {
  const { isAuthenticated, user, setSelectedEmailId } = useAppStore()
  const statusRef = useRef<PushStatus>('unknown')
  const tokenRef = useRef<string | null>(null)
  const nativeListenersBoundRef = useRef(false)

  const subscribeToken = useCallback(async (token: string, platformOverride?: 'android' | 'ios') => {
    try {
      const platform = platformOverride
        ?? (/Android/i.test(navigator.userAgent)
          ? 'android'
          : /iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? 'ios'
            : 'web')

      const deviceInfo = navigator.userAgent.substring(0, 200)

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token, deviceInfo, platform }),
      })

      if (res.ok) {
        statusRef.current = 'subscribed'
        tokenRef.current = token
        // Foreground dedup flag — tells use-notifications to suppress its
        // own browser Notification/toast because FCM now owns those surfaces
        // (SW shows background notifications, onMessage shows foreground toast)
        try { sessionStorage.setItem('ezymail-push-active', '1') } catch { /* ignore */ }
      } else {
        statusRef.current = 'error'
      }
    } catch {
      statusRef.current = 'error'
    }
  }, [])

  const unsubscribeToken = useCallback(async (token: string) => {
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token }),
      })
    } catch {
      // Ignore
    }
  }, [])

  // Native shells (Capacitor Android/iOS): FCM native registration token —
  // no VAPID key and no service worker involved. Inert in normal browsers.
  const registerNativePush = useCallback(async (silent = false) => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')

      if (!nativeListenersBoundRef.current) {
        nativeListenersBoundRef.current = true

        PushNotifications.addListener('registration', (t) => {
          const platform: 'android' | 'ios' = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
          subscribeToken(t.value, platform)
        })
        PushNotifications.addListener('registrationError', (err) => {
          console.warn('[Push] native registration error:', err)
          statusRef.current = 'error'
          if (!silent) toast.error('Failed to enable push notifications')
        })
        PushNotifications.addListener('pushNotificationReceived', (n) => {
          const emailId = n.data?.emailId || ''
          toast(n.title || 'New Email', {
            description: n.body || 'You received a new message',
            duration: 6000,
            action: emailId ? {
              label: 'View',
              onClick: () => setSelectedEmailId(emailId),
            } : undefined,
          })
        })
        // Tap on a native notification → open the email (Phase 2c `?id=`
        // handling picks it up post-auth on cold start; replaceState is
        // cleaned by the existing page.tsx logic)
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const emailId = action.notification?.data?.emailId || ''
          if (!emailId) return
          try { window.history.replaceState(null, '', `/?id=${encodeURIComponent(emailId)}`) } catch { /* ignore */ }
          setSelectedEmailId(emailId)
        })
      }

      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') {
        statusRef.current = 'denied'
        return
      }
      PushNotifications.register()
    } catch (err) {
      console.error('[Push] native setup error:', err)
      statusRef.current = 'error'
      if (!silent) toast.error('Failed to enable push notifications')
    }
  }, [subscribeToken, setSelectedEmailId])

  const requestPermissionAndSubscribe = useCallback(async (silent = false) => {
    if (statusRef.current === 'loading') return
    statusRef.current = 'loading'

    // Native shells take the native path; web path below is unchanged
    if (Capacitor.isNativePlatform()) {
      await registerNativePush(silent)
      return
    }

    try {
      // Dynamic import so Firebase isn't bundled for non-auth users
      const { getFirebaseMessaging } = await import('@/lib/firebase')
      const { getToken, onMessage } = await import('firebase/messaging')

      const messaging = await getFirebaseMessaging()
      if (!messaging) {
        statusRef.current = 'unsupported'
        if (!silent) toast.error('Push notifications are not supported in this browser')
        return
      }

      // Request permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        statusRef.current = 'denied'
        return
      }

      // The app's main sw.js (registered by Providers) already includes
      // Firebase Messaging — just use its existing registration.
      const swRegistration = await navigator.serviceWorker.ready;

      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      })

      if (token) {
        await subscribeToken(token)

        // Foreground message handler — show notification + navigate to email when tapped
        onMessage(messaging, (payload) => {
          const data = payload.data || {}
          const emailId = data.emailId || ''
          const title = payload.notification?.title || 'New Email'
          const body = payload.notification?.body || 'You received a new message'

          toast(title, {
            description: body,
            duration: 6000,
            action: emailId ? {
              label: 'View',
              onClick: () => setSelectedEmailId(emailId),
            } : undefined,
          })
        })

        if (!silent) toast.success('Push notifications enabled')
      } else {
        statusRef.current = 'error'
        if (!silent) toast.error('Failed to get notification token')
      }
    } catch (err) {
      console.error('Push setup error:', err)
      statusRef.current = 'error'
      // Only show error toast when user explicitly requested (not on auto-subscribe)
      if (!silent) toast.error('Failed to enable push notifications')
    }
  }, [subscribeToken, setSelectedEmailId, registerNativePush])

  useEffect(() => {
    if (!isAuthenticated || !user) return

    // Native shells (Capacitor): register native FCM/APNs token — VAPID
    // and web service-worker checks do not apply on this path
    if (Capacitor.isNativePlatform()) {
      void registerNativePush(true)
      return
    }

    // Firebase config is hardcoded — only VAPID key needed for token generation
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    if (!vapidKey || vapidKey.length < 20) {
      // Surfaced for diagnosability (was a fully silent no-op — made the
      // "desktop works, mobile doesn't" investigation much harder)
      console.warn('[Push] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing/short — push subscription skipped')
      statusRef.current = 'unsupported'
      return
    }

    // Check basic support
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      statusRef.current = 'unsupported'
      return
    }

    if (Notification.permission === 'denied') {
      statusRef.current = 'denied'
      return
    }

    if (Notification.permission === 'granted') {
      // Auto-subscribe silently when permission already granted
      requestPermissionAndSubscribe(true)
    } else {
      statusRef.current = 'prompt'
    }
  }, [isAuthenticated, user, requestPermissionAndSubscribe])

  // Settings panel's "New Email Notifications" switch fires these events.
  // enable: complete the push subscription (native asks system permission,
  //         web uses the already-granted browser permission)
  // disable: remove THIS device's token so the server stops sending —
  //         before, turning the switch off left the token registered and
  //         notifications kept arriving ("toggle does not work" bug)
  useEffect(() => {
    const handleEnablePush = () => {
      if (statusRef.current === 'loading' || statusRef.current === 'subscribed') return
      if (Capacitor.isNativePlatform()) {
        void registerNativePush(false)
        return
      }
      if (typeof window === 'undefined' || !('Notification' in window)) return
      if (Notification.permission !== 'granted') return
      void requestPermissionAndSubscribe(false)
    }
    const handleDisablePush = () => {
      if (tokenRef.current) {
        void unsubscribeToken(tokenRef.current)
        tokenRef.current = null
      }
      try { sessionStorage.removeItem('ezymail-push-active') } catch { /* ignore */ }
      statusRef.current = 'prompt'
    }
    window.addEventListener('ezymail:enable-push', handleEnablePush)
    window.addEventListener('ezymail:disable-push', handleDisablePush)
    return () => {
      window.removeEventListener('ezymail:enable-push', handleEnablePush)
      window.removeEventListener('ezymail:disable-push', handleDisablePush)
    }
  }, [requestPermissionAndSubscribe, registerNativePush, unsubscribeToken])

  // Cleanup on logout
  useEffect(() => {
    if (isAuthenticated) return

    // Unsubscribe when user logs out
    if (tokenRef.current) {
      unsubscribeToken(tokenRef.current)
      tokenRef.current = null
    }
    try { sessionStorage.removeItem('ezymail-push-active') } catch { /* ignore */ }
    statusRef.current = 'unknown'
  }, [isAuthenticated, unsubscribeToken])

  // Don't render anything
  return null
}
