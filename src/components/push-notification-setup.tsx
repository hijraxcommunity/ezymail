'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Capacitor } from '@capacitor/core'
import { useAppStore } from '@/store/use-app-store'
import { attemptMailSound } from '@/lib/mail-sound'

// Desktop diagnostic: when the web FCM subscription fails on THIS tab, the
// 'ezymail-push-active' flag must NOT keep suppressing the polling fallback
// (browser Notification constructor) — a stale flag was one of the reasons a
// dead web token left the desktop 100% silent (owner report 2026-11-09).
// WEB PATHS ONLY — the native/Android registration never touches this flag's
// failure semantics (Android owns its surfaces through the native renderer).
function releaseFallbackSuppression(reason: string) {
  try {
    if (sessionStorage.getItem('ezymail-push-active') === '1') {
      sessionStorage.removeItem('ezymail-push-active')
      console.warn('[PushDiag] FCM unavailable on this tab — polling notification fallback re-armed', { reason })
    }
  } catch { /* ignore */ }
}

function maskToken(t: string): string {
  return t.length > 16 ? `${t.slice(0, 10)}…${t.slice(-4)}` : '***'
}

type PushStatus = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied' | 'subscribed' | 'loading' | 'error'

/** The FCM token this device registered for the CURRENT account (persisted
 *  in localStorage because tokenRef dies with the page). Logout reads it and
 *  sends it to /api/auth/logout so the server can delete the device's token
 *  row in the same request that destroys the session — the old post-logout
 *  cleanup always 401'd (session already gone), leaving the row registered
 *  under the previous account so the device kept ringing for its mail. */
export function getDevicePushToken(): string | null {
  try {
    return localStorage.getItem('ezymail-fcm-token')
  } catch {
    return null
  }
}

/** Silent LOCAL-ONLY backfill of the device's FCM token into localStorage —
 *  NEVER subscribes, never calls any EzyMail endpoint. Used when auto-subscribe
 *  is blocked (account switch OFF on the server, or the profile fetch failed)
 *  so subscribeToken() never ran on this device and localStorage stayed empty.
 *  Why it matters: the compose send request carries getDevicePushToken() as
 *  senderFcmToken and the server uses it to skip this device at dispatch —
 *  the hard guarantee that a phone that once hosted account A does not ring
 *  when its current account B sends mail to A. Without the backfill, a
 *  blocked device reports no token, the skip is dead, and the stale row
 *  (recipient's account ↔ this device's token) rings — exactly the
 *  "notification comes on mobile chrome" owner report 2026-11-08.
 *  Runs at most once per session, and only when permission is already
 *  granted, so it can never pop a prompt. */
async function backfillDeviceToken(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'granted') return
    try { if (sessionStorage.getItem('ezymail-token-backfill') === '1') return } catch { /* ignore */ }
    try { sessionStorage.setItem('ezymail-token-backfill', '1') } catch { /* ignore */ }

    const { getFirebaseMessaging } = await import('@/lib/firebase')
    const { getToken } = await import('firebase/messaging')
    const messaging = await getFirebaseMessaging()
    if (!messaging) return

    const swRegistration = await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    })
    if (token) {
      try { localStorage.setItem('ezymail-fcm-token', token) } catch { /* ignore */ }
    }
  } catch {
    // Best effort — the sender-device skip simply stays without it
  }
}

export function PushNotificationSetup() {
  const { isAuthenticated, user, setSelectedEmailId } = useAppStore()
  const statusRef = useRef<PushStatus>('unknown')
  const tokenRef = useRef<string | null>(null)
  const nativeListenersBoundRef = useRef(false)
  // Reinstalling the APK resets the Android notification permission, and a
  // registration failure used to stay INVISIBLE on the silent auto path —
  // the phone then showed nothing at all and the owner had no idea why
  // ("android does not work"). These make the failure loud (once per
  // session) and re-register the token when the app returns to foreground.
  const nativeFailToastedRef = useRef(false)
  const lastNativeRegisterRef = useRef(0)
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
        console.log('[PushDiag] token registered', { platform, token: maskToken(token) })
        // Persist for logout (getDevicePushToken above) — survives reloads,
        // so signing out always carries the device token with it.
        try { localStorage.setItem('ezymail-fcm-token', token) } catch { /* ignore */ }
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
        console.error('[PushDiag] token registration rejected by server', { platform, httpStatus: res.status })
        if (platform !== 'android' && platform !== 'ios') releaseFallbackSuppression('subscribe-http-' + res.status)
      }
    } catch {
      statusRef.current = 'error'
      console.error('[PushDiag] token registration request failed (network)')
      releaseFallbackSuppression('subscribe-network')
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
          // Always visible: manual attempts toast every time, the silent
          // auto path toasts once per session. (silentModeRef, NOT the
          // stale `silent` arg — listeners are bound only once.)
          if (!silentModeRef.current || !nativeFailToastedRef.current) {
            nativeFailToastedRef.current = true
            toast.error('Could not enable notifications. Restart the app and try again.')
          }
        })
        // Owner request 2026-11-08: no in-app toast for a received push.
        // In the foreground Android's native renderer (EzyMailMessagingService
        // → EzyMailNotification) already posts the OS notification, so the
        // toast was a duplicate popup INSIDE the app — the popup must live
        // OUTSIDE the app only. Nothing to do here anymore.
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
      lastNativeRegisterRef.current = Date.now()
      if (perm.receive !== 'granted') {
        statusRef.current = 'denied'
        // Tell the user WHY nothing was enabled — a silent return here made
        // the switch look broken (flipped on, nothing happened). This now
        // also fires on the silent auto path (once per session): a reinstall
        // resets the Android notification permission, and without this the
        // phone fails with zero feedback.
        if (!silent || !nativeFailToastedRef.current) {
          nativeFailToastedRef.current = true
          toast.error('Notifications are off. Allow them for EzyMail in your phone settings.')
        }
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
        console.warn('[PushDiag] firebase messaging unsupported in this browser')
        releaseFallbackSuppression('messaging-unsupported')
        if (!silent) toast.error('Push notifications are not supported in this browser')
        return
      }

      // Request permission
      const permission = await Notification.requestPermission()
      console.log('[PushDiag] notification permission', { permission })
      if (permission !== 'granted') {
        statusRef.current = 'denied'
        releaseFallbackSuppression('permission-' + permission)
        return
      }

      // The app's main sw.js (registered by Providers) already includes
      // Firebase Messaging — just use its existing registration.
      const swRegistration = await navigator.serviceWorker.ready;
      console.log('[PushDiag] service worker ready')

      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      })
      console.log('[PushDiag] fcm getToken', { ok: !!token, token: token ? maskToken(token) : undefined })

      if (token) {
        await subscribeToken(token, undefined, !silent)

        // Foreground message handler — fires ONLY while the page is visible
        if (!onMessageBoundRef.current) {
          onMessageBoundRef.current = true
          onMessage(messaging, (payload) => {
            const data = payload.data || {}
            const emailId = data.emailId || ''
            const title = payload.notification?.title || data.title || 'New Email'
            const body = payload.notification?.body || data.body || 'You received a new message'
            console.log('[PushDiag] foreground push received', { emailId: emailId || '(none)', hasTitle: !!title })

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
                console.log('[PushDiag] foreground OS notification shown')
              } else {
                console.warn('[PushDiag] foreground notification skipped — permission not granted')
              }
            } catch (err) {
              console.warn('[PushDiag] foreground OS notification failed', err instanceof Error ? err.message : String(err))
              /* OS popup is best-effort */
            }

            // New-email sound for the FCM foreground path — the polling chime
            // is deduped against this one by email id (one ping per email).
            void attemptMailSound(emailId)
          })
        }

        if (!silent) toast.success('Push notifications enabled')
      } else {
        statusRef.current = 'error'
        releaseFallbackSuppression('getToken-empty')
        if (!silent) toast.error('Failed to get notification token')
      }
    } catch (err) {
      console.error('[PushDiag] web push setup error', err instanceof Error ? err.message : String(err))
      statusRef.current = 'error'
      releaseFallbackSuppression('setup-error')
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
              // subscription path for this session (restart included).
              // Still backfill the device token LOCALLY (no subscribe) so the
              // send request can report this device and the server-side skip
              // keeps other accounts' mail off this phone.
              pushDisabledRef.current = true
              statusRef.current = 'prompt'
              void backfillDeviceToken()
              return
            }
          }
        }
      } catch {
        // Profile fetch failed (offline/network): do NOT auto-subscribe —
        // the user may have the switch OFF on the server; subscribing here
        // would silently override their choice. The Settings switch still
        // works and asks + subscribes on demand. Backfill the device token
        // locally so the sender-device skip stays alive regardless.
        void backfillDeviceToken()
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
        console.warn('[PushDiag] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing/short — push subscription skipped')
        statusRef.current = 'unsupported'
        releaseFallbackSuppression('vapid-missing')
        return
      }

      // Check basic support
      if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
        statusRef.current = 'unsupported'
        releaseFallbackSuppression('browser-unsupported')
        return
      }

      if (Notification.permission === 'denied') {
        statusRef.current = 'denied'
        releaseFallbackSuppression('permission-denied')
        return
      }

      if (Notification.permission === 'granted') {
        // Auto-subscribe silently when permission already granted
        pushDisabledRef.current = false
        await requestPermissionAndSubscribe(true)
      } else {
        statusRef.current = 'prompt'
        // Permission never decided — ASK, but from a REAL user gesture.
        // (Owner request: "Chrome does not ask me to allow or not".)
        // The previous version called Notification.requestPermission()
        // directly here, inside this useEffect — two awaited fetches after
        // the login click, so the transient user activation had long
        // expired. Chrome silently DENIES gestureless notification
        // permission requests, so on desktop the prompt never appeared AND
        // the once-per-session flag below was burned on a call that could
        // never succeed: no permission → no web-push token → the polling
        // fallback's showBrowserNotification() also no-op'd on 'default'.
        // Desktop stayed 100% silent while Android kept ringing (the native
        // plugin dialog needs no browser gesture). Fix: defer the ask to the
        // FIRST interaction of the session — any click/keypress is a valid
        // gesture and the prompt appears right after login. One ask per
        // browser session; if dismissed, the Settings switch still asks on
        // demand.
        try {
          if (!sessionStorage.getItem('ezymail-push-asked')) {
            sessionStorage.setItem('ezymail-push-asked', '1')
            const askOnGesture = () => {
              document.removeEventListener('pointerdown', askOnGesture, true)
              document.removeEventListener('keydown', askOnGesture, true)
              void (async () => {
                try {
                  if (pushDisabledRef.current) return
                  if (typeof Notification === 'undefined') return
                  const permission = await Notification.requestPermission()
                  if (permission === 'granted') {
                    pushDisabledRef.current = false
                    await requestPermissionAndSubscribe(true)
                  }
                } catch { /* ignore */ }
              })()
            }
            document.addEventListener('pointerdown', askOnGesture, { capture: true })
            document.addEventListener('keydown', askOnGesture, { capture: true })
          }
        } catch { /* ignore */ }
      }
    }

    void autoSubscribe()
  }, [isAuthenticated, user, requestPermissionAndSubscribe, registerNativePush])

  // Self-heal: make sure the server still has this device's token while the
  // app is open. Two real scenarios left the phone/desktop dead with the app
  // in the foreground:
  //   1. The switch-OFF on ANY device removes EVERY token of the account
  //      (the "OFF must really turn it off" rule). The desktop heals itself
  //      on page reload; a phone app or an open desktop TAB left alone never
  //      re-registered — owner report: "it was working minutes ago, then
  //      stopped" (2026-11-08: the desktop browser notification silently
  //      stopped because the tab was open for days through such an OFF/ON
  //      cycle).
  //   2. A reinstall / token refresh kills the old token (Google reports
  //      UNREGISTERED and the server purges the row).
  // Re-registering is an idempotent upsert (same token, same row), so this
  // runs on every return to foreground AND every 2 minutes while visible.
  // The server preference is re-checked first, so this can never resurrect
  // a subscription the user turned OFF, and it picks up a permission the
  // user just granted in the phone's system settings.
  // Runs for NATIVE shells (FCM native registration) and — since 2026-11-08 —
  // for WEB/desktop too (silent FCM re-subscribe, only when browser
  // permission is already granted so it can never pop the prompt).
  useEffect(() => {
    const recheckAndRegister = async () => {
      if (!isAuthenticated || pushDisabledRef.current) return
      if (Date.now() - lastNativeRegisterRef.current < 60000) return
      lastNativeRegisterRef.current = Date.now()
      try {
        const res = await fetch('/api/user/profile')
        if (res.ok) {
          const data = await res.json()
          const prefs = data.user?.preferences
          const parsed = typeof prefs === 'string' ? JSON.parse(prefs) : prefs
          if (parsed && parsed.desktopNotif === false) {
            pushDisabledRef.current = true
            return
          }
        } else {
          return // profile unavailable — retry on the next tick
        }
      } catch {
        return // offline — retry on the next tick
      }
      if (Capacitor.isNativePlatform()) {
        void registerNativePush(true)
      } else if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        // Web/desktop heal — the same wiped-row scenarios as native, plus
        // the web-only one: an open desktop tab never reloads, so once the
        // account's rows were wiped (OFF/ON from another device, purge) the
        // browser notification silently died until a manual reload. The
        // re-subscribe is silent and idempotent; permission is already
        // granted so requestPermission() resolves instantly — this can
        // never pop the browser prompt.
        void requestPermissionAndSubscribe(true)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void recheckAndRegister()
    }
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') void recheckAndRegister()
    }, 120000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(tick)
    }
  }, [isAuthenticated, registerNativePush, requestPermissionAndSubscribe])

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
      // 'loading' only — 'subscribed' must NOT skip: the switch-OFF on
      // another device (or the dead-token purge) deletes this device's row
      // server-side while this session still believes it is subscribed.
      // The registration upsert is idempotent, so always (re)register.
      if (statusRef.current === 'loading') return
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

    // Unsubscribe when user logs out. Best effort only: the session is gone
    // by now so the endpoint 401s — the REAL row deletion happens inside
    // /api/auth/logout (which the logout buttons call with the token).
    if (tokenRef.current) {
      unsubscribeToken(tokenRef.current)
      tokenRef.current = null
    }
    try { localStorage.removeItem('ezymail-fcm-token') } catch { /* ignore */ }
    try { sessionStorage.removeItem('ezymail-push-active') } catch { /* ignore */ }
    statusRef.current = 'unknown'
  }, [isAuthenticated, unsubscribeToken])

  // Don't render anything
  return null
}
