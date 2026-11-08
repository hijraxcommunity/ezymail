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
  useEffect(() => {
    if (!isAuthenticated || isInitializedRef.current) return

    const timer = setTimeout(() => {
      isInitializedRef.current = true
      // Update last check time to NOW — any emails that existed before this
      // moment will never trigger a notification
      lastCheckTimeRef.current = Date.now()
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

      // Only consider emails that arrived AFTER our last check time
      const checkTime = lastCheckTimeRef.current
      const trulyNewEmails = latestEmails.filter(
        (e: { id: string; isRead: boolean; createdAt: string }) => {
          const emailTime = new Date(e.createdAt).getTime()
          return emailTime > checkTime && !e.isRead
        }
      )

      // Update check time to server's latest email time (or now if no emails)
      if (latestEmails.length > 0) {
        const maxTime = Math.max(
          ...latestEmails.map((e: { createdAt: string }) => new Date(e.createdAt).getTime())
        )
        lastCheckTimeRef.current = Math.max(checkTime, maxTime)
      } else {
        lastCheckTimeRef.current = Date.now()
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

        // Refresh the email list so new emails appear immediately.
        // Always page 1 — the newest page — so new mail merges in even when
        // the user has paginated into older history.
        const { currentFolder: folder } = useAppStore.getState()
        if (folder !== 'search') {
          const folderParam = folder === 'folder' ? 'custom' : folder
          const refreshRes = await fetch(`/api/emails?folder=${folderParam}&page=1&limit=20`)
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json()
            // Merge instead of replace — keeps already-loaded older messages
            // (and the user's scroll position) intact
            appendEmails(refreshData.emails || [])
            setTotalEmails(refreshData.total || 0)
          }
        }

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
