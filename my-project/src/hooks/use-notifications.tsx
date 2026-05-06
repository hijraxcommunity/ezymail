'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'
import { Mail } from 'lucide-react'

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
      icon: '/favicon.ico',
      badge: '/favicon.ico',
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
  const { isAuthenticated, setNewEmailNotification, setCurrentFolder, setEmails, setTotalEmails } = useAppStore()
  const lastEmailIdsRef = useRef<Set<string>>(new Set())
  const isInitializedRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prefsRef = useRef<NotificationPreferences>(getStoredPreferences())

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

    // Listen for storage changes to pick up prefs saved from settings
    const handleStorage = () => {
      try {
        const cached = sessionStorage.getItem('ezymail-notif-prefs')
        if (cached) prefsRef.current = JSON.parse(cached)
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', handleStorage)

    return () => window.removeEventListener('storage', handleStorage)
  }, [isAuthenticated])

  // ─── Initialize tracking IDs once emails have loaded ───────────────────
  useEffect(() => {
    if (!isAuthenticated || isInitializedRef.current) return

    const timer = setTimeout(() => {
      const currentEmails = useAppStore.getState().emails
      if (currentEmails.length > 0) {
        lastEmailIdsRef.current = new Set(currentEmails.map(e => e.id))
      }
      isInitializedRef.current = true
    }, 3000)

    return () => clearTimeout(timer)
  }, [isAuthenticated])

  // ─── Poll for new emails (works even when tab is in background) ─────────
  const pollForNewEmails = useCallback(async () => {
    if (!isAuthenticated || !isInitializedRef.current) return

    try {
      const res = await fetch('/api/emails?folder=inbox&page=1&limit=5')
      if (!res.ok) return

      const data = await res.json()
      const latestEmails = data.emails || []
      const trackedIds = lastEmailIdsRef.current
      const serverIds = new Set(latestEmails.map((e: { id: string }) => e.id))

      const newEmails = latestEmails.filter(
        (e: { id: string; isRead: boolean }) => !trackedIds.has(e.id) && !e.isRead
      )

      if (newEmails.length > 0) {
        lastEmailIdsRef.current = serverIds
        const prefs = prefsRef.current
        const isBackground = document.visibilityState === 'hidden'

        // Refresh the email list so new emails appear immediately
        const { currentFolder: folder, currentPage } = useAppStore.getState()
        if (folder !== 'search') {
          const folderParam = folder === 'folder' ? 'custom' : folder
          const refreshRes = await fetch(`/api/emails?folder=${folderParam}&page=${currentPage}&limit=20`)
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json()
            setEmails(refreshData.emails || [])
            setTotalEmails(refreshData.total || 0)
          }
        }

        for (const email of newEmails) {
          const senderName = (email as { sender?: { firstName?: string; lastName?: string } }).sender
            ? `${(email as { sender: { firstName: string; lastName: string } }).sender.firstName} ${(email as { sender: { firstName: string; lastName: string } }).sender.lastName}`
            : 'Unknown'

          const subject = (email as { subject?: string }).subject || '(No subject)'

          // Always show browser notification (works in background)
          if (prefs.desktopNotif) {
            showBrowserNotification(`New email from ${senderName}`, {
              body: subject,
              tag: `email-${(email as { id: string }).id}`,
            })
          }

          // Only play sound and show toast when app is in foreground
          if (!isBackground) {
            if (prefs.soundNotif) {
              playNotificationSound()
            }

            toast.info(`New email from ${senderName}`, {
              description: subject,
              icon: <Mail className="w-4 h-4 text-[#4285F4]" />,
              duration: 6000,
              action: {
                label: 'View',
                onClick: () => {
                  setNewEmailNotification((email as { id: string }).id)
                  setCurrentFolder('inbox')
                },
              },
            })

            setCurrentFolder('inbox')
          }
        }
      } else {
        lastEmailIdsRef.current = serverIds
      }
    } catch {
      // Silent fail
    }
  }, [isAuthenticated, setNewEmailNotification, setCurrentFolder, setEmails, setTotalEmails])

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
        // Also refresh the email list for the current view
        const { currentFolder: folder, currentPage } = useAppStore.getState()
        if (folder !== 'search') {
          const folderParam = folder === 'folder' ? 'custom' : folder
          fetch(`/api/emails?folder=${folderParam}&page=${currentPage}&limit=20`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data) {
                setEmails(data.emails || [])
                setTotalEmails(data.total || 0)
              }
            })
            .catch(() => { /* silent */ })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isAuthenticated, pollForNewEmails, setEmails, setTotalEmails])
}
