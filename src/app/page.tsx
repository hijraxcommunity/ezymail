'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/store/use-app-store'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/auth-layout'
import { MailHeader } from '@/components/mail/mail-header'
import { MailSidebar } from '@/components/mail/mail-sidebar'
import { EmailList } from '@/components/mail/email-list'
import { EmailDetail } from '@/components/mail/email-detail'
import { ComposeModal } from '@/components/mail/compose-modal'
import { MobileNav } from '@/components/mail/mobile-nav'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { AdminPanel } from '@/components/admin/admin-panel'
import { ContactsPanel } from '@/components/contacts/contacts-panel'
import { BusinessApp } from '@/components/business/business-app'
import { useNotifications } from '@/hooks/use-notifications'
import { PushNotificationSetup } from '@/components/push-notification-setup'

// ─── Undo Snackbar ──────────────────────────────────────────────────────────

function UndoSnackbar() {
  const { undoAction, setUndoAction, addEmail, totalEmails, setTotalEmails } = useAppStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!undoAction) return

    timerRef.current = setTimeout(() => {
      setUndoAction(null)
    }, 8000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [undoAction, setUndoAction])

  const handleUndo = useCallback(async () => {
    if (!undoAction) return

    // Capture values before clearing
    const action = undoAction

    // Restore the email locally
    addEmail(action.email)
    setTotalEmails(totalEmails + 1)

    // Clear undo immediately to prevent double-clicks
    if (timerRef.current) clearTimeout(timerRef.current)
    setUndoAction(null)

    // Restore on the server
    try {
      if (action.type === 'archive') {
        await fetch(`/api/emails/${action.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isArchived: false }),
        })
      } else if (action.type === 'delete') {
        // Move back to original folder from trash
        const folder = action.email.folder === 'trash' ? 'inbox' : (action.email.folder || 'inbox')
        await fetch(`/api/emails/${action.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder, isArchived: false }),
        })
      }
    } catch {
      toast.error('Failed to undo')
    }
  }, [undoAction, addEmail, setUndoAction, totalEmails, setTotalEmails])

  if (!undoAction) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-16 left-2 right-2 z-50 md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto"
      >
        <div className="flex items-center justify-between bg-[#323232] dark:bg-[#424242] text-white px-4 py-3 rounded-lg shadow-2xl border border-gray-600 dark:border-gray-500 w-full md:w-auto md:min-w-[360px]">
          <span className="text-sm font-medium">
            {undoAction.type === 'delete' ? 'Email deleted' : 'Email archived'}
          </span>
          <button
            onClick={handleUndo}
            className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-[#8AB4F8] hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          >
            UNDO
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function HomePage() {
  const {
    isAuthenticated,
    authView,
    settingsView,
    adminView,
    contactsView,
    selectedEmailId,
    composeOpen,
    currentFolder,
    emails,
    user,
    setSelectedEmailId,
    setComposeOpen,
    setReplyToEmail,
    setUser,
    setEmails,
    setIsLoading,
    setTotalEmails,
    setSettingsView,
    setAdminView,
    setContactsView,
    setSidebarOpen,
    clearSelection,
  } = useAppStore()

  // ─── Auth check loading state — prevents login flash on refresh ────────
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // ─── Check session on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user)
      })
      .catch(() => { /* silent */ })
      .finally(() => setIsCheckingAuth(false))
  }, [setUser])

  // ─── Fetch emails when authenticated ─────────────────────────────────────
  const fetchEmails = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('folder', currentFolder)
      params.set('page', '1')
      params.set('limit', '20')
      const res = await fetch(`/api/emails?${params}`)
      const data = await res.json()
      if (res.ok) {
        setEmails(data.emails || [])
        setTotalEmails(data.total || 0)
      }
    } catch {
      /* silent */
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, currentFolder, setEmails, setIsLoading, setTotalEmails])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  // ─── Email notifications ──────────────────────────────────────────────────
  useNotifications()

  // ─── Dynamic document title with unread count ────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      document.title = 'EzyMail - Email made Ezy'
      return
    }
    const unreadCount = emails.filter((e) => e.folder === 'inbox' && !e.isRead).length
    document.title = unreadCount > 0
      ? `(${unreadCount}) EzyMail - Email made Ezy`
      : 'EzyMail - Email made Ezy'
  }, [isAuthenticated, emails])

  // ─── Mobile back button: navigate within app instead of closing PWA ──
  useEffect(() => {
    if (!isAuthenticated) return

    const handlePopState = () => {
      const store = useAppStore.getState()
      // Close overlays first (compose > contacts > settings > admin > email detail)
      if (store.composeOpen) {
        store.setComposeOpen(false)
        history.pushState(null, '', location.href)
        return
      }
      if (store.contactsView) {
        store.setContactsView(false)
        history.pushState(null, '', location.href)
        return
      }
      if (store.settingsView) {
        store.setSettingsView(null)
        history.pushState(null, '', location.href)
        return
      }
      if (store.adminView) {
        store.setAdminView(null)
        history.pushState(null, '', location.href)
        return
      }
      if (store.selectedEmailId) {
        store.setSelectedEmailId(null)
        return
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isAuthenticated])

  // Push history entry when entering a "sub-page" so back button works
  useEffect(() => {
    if (!isAuthenticated) return
    const prevId = selectedEmailId
    const prevCompose = composeOpen
    const prevContacts = contactsView
    const prevSettings = settingsView
    const prevAdmin = adminView

    // Any of these opening means we're entering a sub-page
    if (selectedEmailId || composeOpen || contactsView || settingsView || adminView) {
      history.pushState(null, '', location.href)
    }
  }, [isAuthenticated, selectedEmailId, composeOpen, contactsView, settingsView, adminView])

  // ─── Auth views ──────────────────────────────────────────────────────────
  if (isCheckingAuth) {
    return (
      <div className="min-h-dvh bg-white flex flex-col items-center justify-between py-24">
        <div />
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="EzyMail" className="w-24 h-24 rounded-2xl" />
          <p className="font-bold text-2xl tracking-tight text-[#1F1F1F]">EzyMail</p>
          <p className="text-xs text-gray-400">Email made Ezy</p>
        </div>
        <p className="text-xs text-gray-400 pb-10">From <span className="font-semibold text-gray-500">HijraX</span></p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthLayout />
  }

  // ─── Business users get their own dashboard ───────────────────────────
  if (user?.accountType === 'business') {
    return <BusinessApp />
  }

  // ─── Admin users go directly to admin panel (no personal inbox) ───────
  if (user?.role === 'admin') {
    return (
      <>
        <AdminPanel />
        <PushNotificationSetup />
      </>
    )
  }

  // ─── Main mail view (personal users) ─────────────────────────────────────
  return (
    <div className="h-dvh flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <MailHeader />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex-1 flex overflow-hidden min-h-0"
      >
        <MailSidebar />

        <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-w-0">
          {/* Email List — hidden on mobile when an email is selected */}
          <div
            className={`flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-gray-950 overflow-hidden ${
              selectedEmailId ? 'hidden md:flex' : 'flex'
            }`}
          >
            <EmailList />
          </div>

          {/* Email Detail — shown on mobile when selected, always on desktop */}
          <div
            className={`flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-gray-950 overflow-hidden ${
              selectedEmailId ? 'flex' : 'hidden md:flex'
            }`}
          >
            <EmailDetail />
          </div>
        </main>
      </motion.div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Compose modal */}
      <ComposeModal />

      {/* Settings / Admin slide-in panels */}
      <AnimatePresence>
        {settingsView && (
          <motion.div
            key={settingsView || 'settings'}
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SettingsPanel />
          </motion.div>
        )}
        {adminView && (
          <motion.div
            key="admin"
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AdminPanel />
          </motion.div>
        )}
        {contactsView && (
          <motion.div
            key="contacts"
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ContactsPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Push notification setup (FCM) */}
      <PushNotificationSetup />

      {/* Undo snackbar */}
      <UndoSnackbar />

    </div>
  )
}
