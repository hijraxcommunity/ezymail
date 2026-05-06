'use client'

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail } from 'lucide-react'
import { useAppStore } from '@/store/use-app-store'

const AUTO_DISMISS_MS = 5000

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  return '1m ago'
}

function AvatarFallback({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
    )
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4285F4] to-[#1a73e8] flex items-center justify-center shrink-0">
      <span className="text-white text-sm font-semibold">{getInitials(name)}</span>
    </div>
  )
}

export function InAppNotificationBanner() {
  const {
    pushNotifications,
    dismissPushNotification,
    clearPushNotifications,
    setSelectedEmailId,
    setCurrentFolder,
    setNewEmailNotification,
  } = useAppStore()

  // Auto-dismiss notifications after timeout + haptic feedback on new notif
  useEffect(() => {
    if (pushNotifications.length === 0) return

    // Haptic feedback on mobile
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([100, 30, 100]) } catch { /* ignore */ }
    }

    const timers = pushNotifications.map(n =>
      setTimeout(() => dismissPushNotification(n.id), AUTO_DISMISS_MS)
    )

    return () => timers.forEach(clearTimeout)
  }, [pushNotifications, dismissPushNotification])

  // Clear all when user taps background
  const handleBackgroundTap = useCallback(() => {
    if (pushNotifications.length > 0) {
      clearPushNotifications()
    }
  }, [pushNotifications.length, clearPushNotifications])

  const handleTapNotif = useCallback((notif: typeof pushNotifications[number]) => {
    dismissPushNotification(notif.id)
    setCurrentFolder('inbox')
    setSelectedEmailId(notif.emailId)
    setNewEmailNotification(notif.emailId)
  }, [dismissPushNotification, setCurrentFolder, setSelectedEmailId, setNewEmailNotification])

  const handleDismiss = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    dismissPushNotification(id)
  }, [dismissPushNotification])

  return (
    <>
      {/* Background overlay on mobile */}
      <AnimatePresence>
        {pushNotifications.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-[200] md:hidden"
            onClick={handleBackgroundTap}
          />
        )}
      </AnimatePresence>

      {/* Notification stack — slides down from top */}
      <div className="fixed top-0 left-0 right-0 z-[210] pointer-events-none flex flex-col items-center gap-2 p-3 pt-2">
        <AnimatePresence mode="popLayout">
          {pushNotifications.slice(0, 3).map((notif, index) => (
            <motion.div
              key={notif.id}
              layout
              initial={{ opacity: 0, y: -80, scale: 0.9 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                  type: 'spring',
                  damping: 22,
                  stiffness: 300,
                  delay: index * 0.06,
                },
              }}
              exit={{
                opacity: 0,
                y: -60,
                scale: 0.85,
                transition: { duration: 0.25 },
              }}
              className="pointer-events-auto w-full max-w-sm"
              onClick={() => handleTapNotif(notif)}
            >
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 border border-gray-100 dark:border-gray-800 overflow-hidden cursor-pointer active:scale-[0.97] transition-transform">

                {/* Header row: app icon + label + dismiss */}
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-[#4285F4] flex items-center justify-center">
                      <Mail className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      EzyMail
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDismiss(e, notif.id)}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>

                {/* Main content: avatar + sender + subject */}
                <div className="flex items-start gap-3 px-4 pb-3.5 pt-1.5">
                  <AvatarFallback name={notif.senderName} avatar={notif.senderAvatar} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-[#1F1F1F] dark:text-white truncate">
                        {notif.senderName}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                        {timeAgo(notif.timestamp)}
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-700 dark:text-gray-300 truncate mt-0.5">
                      {notif.subject}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
