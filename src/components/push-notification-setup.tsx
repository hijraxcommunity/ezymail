'use client'

import { useEffect, useRef, useCallback } from 'react'
import toast from 'sonner'
import { useAppStore } from '@/store/use-app-store'

type PushStatus = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied' | 'subscribed' | 'loading' | 'error'

export function PushNotificationSetup() {
  const { isAuthenticated, user, setSelectedEmailId } = useAppStore()
  const statusRef = useRef<PushStatus>('unknown')
  const tokenRef = useRef<string | null>(null)

  const subscribeToken = useCallback(async (token: string) => {
    try {
      const platform = /Android/i.test(navigator.userAgent)
        ? 'android'
        : /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? 'ios'
          : 'web'

      const deviceInfo = navigator.userAgent.substring(0, 200)

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token, deviceInfo, platform }),
      })

      if (res.ok) {
        statusRef.current = 'subscribed'
        tokenRef.current = token
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

  const requestPermissionAndSubscribe = useCallback(async (silent = false) => {
    if (statusRef.current === 'loading') return
    statusRef.current = 'loading'

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
  }, [subscribeToken, setSelectedEmailId])

  useEffect(() => {
    if (!isAuthenticated || !user) return

    // Firebase config is hardcoded — only VAPID key needed for token generation
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    if (!vapidKey || vapidKey.length < 20) {
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

  // Cleanup on logout
  useEffect(() => {
    if (isAuthenticated) return

    // Unsubscribe when user logs out
    if (tokenRef.current) {
      unsubscribeToken(tokenRef.current)
      tokenRef.current = null
    }
    statusRef.current = 'unknown'
  }, [isAuthenticated, unsubscribeToken])

  // Don't render anything
  return null
}
