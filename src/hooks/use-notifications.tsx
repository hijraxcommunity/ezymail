'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/store/use-app-store'

const POLL_INTERVAL = 15000 // 15 seconds

// ─── Notification Sound ────────────────────────────────────────────────────

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.setValueAtTime(880, audioContext.currentTime) // A5
    oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1) // C#6
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.4)
  } catch {
    // Audio not supported, silent fail
  }
}

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
  if (typeof window === 'undefined' || !isNotificationGranted()) return

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

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000)
  } catch {
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
  // The notification baseline is taken from the SERVER (newest inbox email's
  // createdAt), NOT from the client clock. The old `Date.now()` baseline made
  // every desktop whose clock is even a minute ahead of the server compare
  // server timestamps against local time: incoming mail was always "in the
  // past" → filtered out → no notification AND (because the list refresh was
  // gated on the same filter) no auto-refresh either — the owner's "desktop
  // notification and refreshing do not work" report 2026-11-08. Server time
  // vs server time never drifts. Fallback on fetch failure: client clock
  // (old behavior). Phones mask this bug via cold starts / visibilitychange;
  // a desktop tab that stays open for hours does not.
  useEffect(() => {
    if (!isAuthenticated || isInitializedRef.current) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/emails?folder=inbox&page=1&limit=1')
        if (res.ok) {
          const data = await res.json()
          const newest = data.emails?.[0]
          if (newest?.createdAt) {
            lastCheckTimeRef.current = new Date(newest.createdAt).getTime()
          }
        }
      } catch { /* keep the client-clock fallback */ }
      // Emails that existed before this moment never trigger a notification
      // (they are already on screen from the initial load)
      isInitializedRef.current = true
    }, 4000)

    return () => clearTimeout(timer)
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
          }

          // Play sound when app is in foreground
          if (prefs.soundNotif && !isBackground) {
            playNotificationSound()
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
