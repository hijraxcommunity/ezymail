'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/store/use-app-store'
import { attemptMailSound } from '@/lib/mail-sound'

const POLL_INTERVAL = 15000 // 15 seconds

// ─── Browser Notification Helpers ──────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false

  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'Notification' in window
}

export function isNotificationGranted(): boolean {
  if (typeof window === 'undefined') return false
  return Notification.permission === 'granted'
}

export function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined') return
  if (!isNotificationGranted()) {
    // Desktop diagnostic (owner report 2026-11-09): a silent no-op here made
    // "no popup at all" indistinguishable from "permission never granted".
    console.warn('[PushDiag] browser notification skipped — permission not granted (state:', Notification.permission + ')')
    return
  }

  try {
    const notification = new Notification(title, {
      icon: '/logo.png',
      badge: '/logo.png',
      ...options,
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    console.log('[PushDiag] browser notification shown', { title })

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000)
  } catch (err) {
    console.warn('[PushDiag] browser notification constructor failed', err instanceof Error ? err.message : String(err))
    // Fallback: some browsers don't support Notification constructor
  }
}

// ─── User Preferences ──────────────────────────────────────────────────────

interface NotificationPreferences {
  desktopNotif: boolean
  soundNotif: boolean
}

function getStoredPreferences(): NotificationPreferences {
  try {
    const cached = sessionStorage.getItem('ezymail-notif-prefs')
    if (cached) return JSON.parse(cached)
  } catch { /* ignore */ }
  return { desktopNotif: true, soundNotif: true }
}

// ─── Main Hook ─────────────────────────────────────────────────────────────

export function useNotifications() {
  const { isAuthenticated, appendEmails, setTotalEmails } = useAppStore()
  const isInitializedRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prefsRef = useRef<NotificationPreferences>(getStoredPreferences())
  // Track the timestamp of when we first loaded — only notify about emails
  // that arrived AFTER this time, preventing false notifications on login/page refresh
  const lastCheckTimeRef = useRef<number>(Date.now())

  // ─── Fetch user notification preferences ───────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return

    const fetchPrefs = async () => {
      try {
        const res = await fetch('/api/user/profile')
        if (res.ok) {
          const data = await res.json()
          const u = data.user
          if (u?.preferences) {
            try {
              const parsed = typeof u.preferences === 'string' ? JSON.parse(u.preferences) : u.preferences
              const newPrefs: NotificationPreferences = {
                desktopNotif: parsed.desktopNotif !== false,
                soundNotif: parsed.soundNotif !== false,
              }
              prefsRef.current = newPrefs
              sessionStorage.setItem('ezymail-notif-prefs', JSON.stringify(newPrefs))
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    fetchPrefs()

    const handleStorage = () => {
      try {
        const cached = sessionStorage.getItem('ezymail-notif-prefs')
        if (cached) prefsRef.current = JSON.parse(cached)
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', handleStorage)

    return () => window.removeEventListener('storage', handleStorage)
  }, [isAuthenticated])

  // ─── Mark as initialized after a short delay (so initial email load completes) ──
  // The notification baseline is the newest email ALREADY ON SCREEN (the store
  // list produced by the initial page-1 load). The old baseline came from a
  // fresh server fetch 4s after login: any email that arrived between the
  // initial load and that fetch was treated as "already seen" and silently
  // swallowed — mail sent within seconds of opening the app never rang and
  // never sounded (reproduced in sandbox E2E 2026-11-09: baseline init
  // absorbed the test mail). Reading the store removes the race entirely:
  // no second fetch, no blind window. Server time vs server time still never
  // drifts (the store rows carry server timestamps).
  useEffect(() => {
    if (!isAuthenticated || isInitializedRef.current) return

    let tries = 0
    const timer = setInterval(() => {
      tries++
      const { emails } = useAppStore.getState()
      if (emails.length > 0 || tries >= 10) {
        clearInterval(timer)
        const newestOnScreen = emails.reduce((max, e) => {
          const t = new Date(e.createdAt).getTime()
          return t > max ? t : max
        }, 0)
        if (newestOnScreen > 0) {
          lastCheckTimeRef.current = newestOnScreen
        } else {
          // Empty inbox at login (nothing on screen): allow a 60s grace so a
          // client clock slightly AHEAD of the server cannot swallow the next
          // incoming mail (the 2026-11-08 clock-skew blindness).
          lastCheckTimeRef.current = Math.min(lastCheckTimeRef.current, Date.now() - 60000)
        }
        // Emails that existed before this moment never trigger a notification
        // (they are already on screen from the initial load)
        isInitializedRef.current = true
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [isAuthenticated])

  // ─── Poll for new emails (works even when tab is in background) ─────────
  const pollForNewEmails = useCallback(async () => {
    if (!isAuthenticated || !isInitializedRef.current) return

    try {
      const res = await fetch('/api/emails?folder=inbox&page=1&limit=5&includeThreads=true')
      if (!res.ok) return

      const data = await res.json()
      const latestEmails = data.emails || []

      // Notification detection ONLY (never gates the list refresh below):
      // emails that arrived AFTER our server-time baseline and are unread
      const checkTime = lastCheckTimeRef.current
      const trulyNewEmails = latestEmails.filter(
        (e: { id: string; isRead: boolean; createdAt: string }) => {
          const emailTime = new Date(e.createdAt).getTime()
          return emailTime > checkTime && !e.isRead
        }
      )

      // Advance the baseline to the server's latest email time. NO `Date.now()`
      // bump when the inbox is empty — mixing the client clock back in would
      // reintroduce the clock-skew blindness described at the init effect.
      if (latestEmails.length > 0) {
        const maxTime = Math.max(
          ...latestEmails.map((e: { createdAt: string }) => new Date(e.createdAt).getTime())
        )
        lastCheckTimeRef.current = Math.max(checkTime, maxTime)
      }

      // ── Refresh the visible folder on EVERY poll cycle ───────────────────
      // Was gated on trulyNewEmails.length > 0: one missed detection (clock
      // skew, a read-state race) froze the inbox until a manual reload — the
      // "refresh does not work on desktop" owner report 2026-11-08. A desktop
      // tab stays VISIBLE for hours, so the visibilitychange refresh below
      // never fires and this interval is the only live updater.
      // Always page 1 — the newest page — merged in so already-loaded older
      // messages (and the user's scroll position) stay intact.
      const { currentFolder: folder } = useAppStore.getState()
      if (folder !== 'search') {
        const folderParam = folder === 'folder' ? 'custom' : folder
        const refreshRes = await fetch(`/api/emails?folder=${folderParam}&page=1&limit=20`)
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          appendEmails(refreshData.emails || [])
          setTotalEmails(refreshData.total || 0)
        }
      }

      if (trulyNewEmails.length > 0) {
        console.log('[PushDiag] poll detected new mail', { count: trulyNewEmails.length })
        const prefs = prefsRef.current
        const isBackground = document.visibilityState === 'hidden'
        // When FCM push is subscribed (flag set by push-notification-setup),
        // FCM owns the notification surfaces: SW shows background system
        // notifications, onMessage shows the instant foreground popup.
        // Polling then only refreshes the list + plays sound — no doubles.
        let pushActive = false
        try { pushActive = sessionStorage.getItem('ezymail-push-active') === '1' } catch { /* ignore */ }

        for (const email of trulyNewEmails) {
          const e = email as {
            id: string
            subject?: string
            isRead: boolean
            sender?: { firstName?: string; lastName?: string; avatar?: string | null }
          }
          const senderName = e.sender
            ? `${e.sender.firstName} ${e.sender.lastName}`
            : 'Unknown'
          const subject = e.subject || '(No subject)'

          // Always show native browser push notification (outside the app)
          // — suppressed when FCM push is active (it owns this surface)
          if (prefs.desktopNotif && !pushActive) {
            showBrowserNotification(`New email from ${senderName}`, {
              body: subject,
              tag: `email-${e.id}`,
            })
          } else {
            console.log('[PushDiag] poll notification suppressed', {
              emailId: e.id,
              desktopNotif: prefs.desktopNotif,
              pushActive,
            })
          }

          // Sound: shared autoplay-safe chime (deduped per email id against
          // the FCM foreground handler — one ping per email, no doubles)
          if (prefs.soundNotif && !isBackground) {
            void attemptMailSound(e.id)
          } else {
            console.log('[PushDiag] sound skipped (background or pref off)', {
              emailId: e.id,
              soundNotif: prefs.soundNotif,
              isBackground,
            })
          }

          // Owner request 2026-11-08: NO in-app popup for new mail — the
          // popup must be the one OUTSIDE the app (browser notification above,
          // or the FCM/SW/native renderer when push is active). The list
          // refresh + sound above are the only in-app signals.
        }
      }
    } catch {
      // Silent fail
    }
  }, [isAuthenticated, appendEmails, setTotalEmails])

  // ─── Start/stop polling ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const initialTimeout = setTimeout(() => {
      pollForNewEmails()
    }, 5000)

    intervalRef.current = setInterval(pollForNewEmails, POLL_INTERVAL)

    return () => {
      clearTimeout(initialTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isAuthenticated, pollForNewEmails])

  // ─── Re-poll and refresh when tab becomes visible ──────────────────────
  useEffect(() => {
    if (!isAuthenticated) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollForNewEmails()
        // Also refresh the email list for the current view — page 1 (the
        // newest) so anything that arrived while hidden merges in even on a
        // paginated view. Merge keeps loaded history + scroll intact.
        const { currentFolder: folder } = useAppStore.getState()
        if (folder !== 'search') {
          const folderParam = folder === 'folder' ? 'custom' : folder
          fetch(`/api/emails?folder=${folderParam}&page=1&limit=20`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data) {
                // Merge instead of replace — preserves loaded history + scroll
                appendEmails(data.emails || [])
                setTotalEmails(data.total || 0)
              }
            })
            .catch(() => { /* silent */ })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isAuthenticated, pollForNewEmails, appendEmails, setTotalEmails])
}
