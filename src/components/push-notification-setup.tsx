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
  // Master OFF gate: while true, NO code path may (re)subscribe a token.
  // This closes the race where the user turns the switch OFF while a native
  // FCM registration is still in flight — the late 'registration' event used
  // to re-add the token behind the switch's back, so notifications kept
  // coming even though the switch said off (owner: "static not dynamic").
  const pushDisabledRef = useRef(false)
  // onMessage must be registered ONCE per messaging instance — re-registering
  // it on every login/toggle stacked duplicate handlers, so one message
  // produced several toasts (and now would produce several OS popups).
  const onMessageBoundRef = useRef(false)

  const subscribeToken = useCallback(async (token: string, platformOverride?: 'android' | 'ios', showSuccess = false) => {
    // Switch is OFF — never resurrect the subscription (see pushDisabledRef)
    if (pushDisabledRef.current) return
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
        // Positive confirmation (toggle-ON path only): this toast proves the
        // device REALLY reached the server and registered. If the user flips
        // the switch on and this never appears, registration failed upstream
        // (permission dialog refused, Firebase init, Play Services...).
        if (showSuccess) toast.success('Notifications enabled on this device')
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

  // OFF must REALLY turn notifications off on this account: remove EVERY
  // token stored for the user, not just the one this session happens to
  // know. Stale tokens left behind by reinstalls used to keep receiving
  // pushes after the switch was off — that was the real reason the owner
  // had to disable notifications in the phone's system settings instead.
  const unsubscribeAllTokens = useCallback(async () => {
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {
      // Ignore
    }
  }, [])

  // Native shells (Capacitor Android/iOS): FCM native registration token —
  // no VAPID key and no service worker involved. Inert in normal browsers.
  const silentModeRef = useRef(true)
  const registerNativePush = useCallback(async (silent = false) => {
    silentModeRef.current = silent
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')

      if (!nativeListenersBoundRef.current) {
        nativeListenersBoundRef.current = true

        PushNotifications.addListener('registration', (t) => {
          const platform: 'android' | 'ios' = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
          subscribeToken(t.value, platform, !silentModeRef.current)
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
        // Tell the user WHY nothing was enabled — a silent return here made
        // the switch look broken (flipped on, nothing happened)
        if (!silent) toast.error('Notifications are off. Allow them for EzyMail in your phone settings.')
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
        await subscribeToken(token, undefined, !silent)

        // Foreground message handler — fires ONLY while the page is visible
        // (when focused, the Firebase SDK routes the message here and the
        // service worker does NOT show the OS notification). Owner request:
        // the popup must appear OUTSIDE the app even while it is open, so
        // this handler shows the system notification as well as the toast.
        if (!onMessageBoundRef.current) {
          onMessageBoundRef.current = true
          onMessage(messaging, (payload) => {
            const data = payload.data || {}
            const emailId = data.emailId || ''
            const title = payload.notification?.title || data.title || 'New Email'
            const body = payload.notification?.body || data.body || 'You received a new message'

            // OS-level popup while the app is open (page context)
            try {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const n = new Notification(title, {
                  body,
                  icon: '/logo.png',
                  badge: '/logo.png',
                  tag: data.tag || (emailId ? `email-${emailId}` : 'ezy-email'),
                })
                n.onclick = () => {
                  try { window.focus() } catch { /* ignore */ }
                  if (emailId) setSelectedEmailId(emailId)
                  n.close()
                }
              }
            } catch { /* OS popup is best-effort — the in-app toast still shows */ }

            toast(title, {
              description: body,
              duration: 6000,
              action: emailId ? {
                label: 'View',
                onClick: () => setSelectedEmailId(emailId),
              } : undefined,
            })
          })
        }

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

    const autoSubscribe = async () => {
      // Respect the user's switch across app restarts: when they turned
      // notifications OFF, that choice is saved on the server — do NOT
      // re-register the token behind their back. (Before, every app
      // restart silently subscribed again, so OFF only "worked" via the
      // phone's system settings — owner-reported bug.)
      try {
        const res = await fetch('/api/user/profile')
        if (res.ok) {
          const data = await res.json()
          const prefs = data.user?.preferences
          if (prefs) {
            const parsed = typeof prefs === 'string' ? JSON.parse(prefs) : prefs
            if (parsed.desktopNotif === false) {
              // Switch is OFF on the server — keep it truly off: block every
              // subscription path for this session (restart included)
              pushDisabledRef.current = true
              statusRef.current = 'prompt'
              return
            }
          }
        }
      } catch {
        // Profile fetch failed (offline/network): do NOT auto-subscribe —
        // the user may have the switch OFF on the server; subscribing here
        // would silently override their choice. The Settings switch still
        // works and asks + subscribes on demand.
        return
      }

      // Native shells (Capacitor): register native FCM/APNs token — VAPID
      // and web service-worker checks do not apply on this path
      if (Capacitor.isNativePlatform()) {
        pushDisabledRef.current = false
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
        pushDisabledRef.current = false
        await requestPermissionAndSubscribe(true)
      } else {
        statusRef.current = 'prompt'
        // Permission never decided — ASK NOW, right after login (owner
        // request: "Chrome does not ask me to allow or not"). One ask per
        // browser session; if the user dismisses it, the Settings switch
        // still asks on demand (user-gesture prompt always goes through).
        try {
          if (!sessionStorage.getItem('ezymail-push-asked')) {
            sessionStorage.setItem('ezymail-push-asked', '1')
            const permission = await Notification.requestPermission()
            if (permission === 'granted') {
              pushDisabledRef.current = false
              await requestPermissionAndSubscribe(true)
            }
          }
        } catch { /* ignore */ }
      }
    }

    void autoSubscribe()
  }, [isAuthenticated, user, requestPermissionAndSubscribe, registerNativePush])

  // Settings panel's "Notifications" switch fires these events.
  // enable: ASK for permission (native system dialog / browser prompt) and
  //         complete the push subscription only when really allowed
  // disable: remove THIS device's token AND every other token stored for
  //         the user, then block re-subscription until the switch is back
  //         on — before, OFF left tokens registered and notifications kept
  //         arriving ("toggle does not work" bug)
  useEffect(() => {
    const handleEnablePush = () => {
      pushDisabledRef.current = false
      if (statusRef.current === 'loading' || statusRef.current === 'subscribed') return
      if (Capacitor.isNativePlatform()) {
        void registerNativePush(false)
        return
      }
      if (typeof window === 'undefined' || !('Notification' in window)) return
      // Ask whenever permission is not decided yet — requestPermission()
      // resolves instantly when already granted and returns 'denied' when
      // blocked. (Before, this handler only ran when permission was ALREADY
      // granted, so it never actually asked — the browser prompt could never
      // appear from the switch.)
      void requestPermissionAndSubscribe(false)
    }
    const handleDisablePush = () => {
      // Master gate FIRST — any in-flight registration that completes after
      // this point is refused by subscribeToken
      pushDisabledRef.current = true
      if (tokenRef.current) {
        void unsubscribeToken(tokenRef.current)
        tokenRef.current = null
      }
      // Purge stale tokens too (reinstalls leave old rows that kept
      // receiving pushes after OFF — the owner's original bug)
      void unsubscribeAllTokens()
      try { sessionStorage.removeItem('ezymail-push-active') } catch { /* ignore */ }
      statusRef.current = 'prompt'
    }
    window.addEventListener('ezymail:enable-push', handleEnablePush)
    window.addEventListener('ezymail:disable-push', handleDisablePush)
    return () => {
      window.removeEventListener('ezymail:enable-push', handleEnablePush)
      window.removeEventListener('ezymail:disable-push', handleDisablePush)
    }
  }, [requestPermissionAndSubscribe, registerNativePush, unsubscribeToken, unsubscribeAllTokens])

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
