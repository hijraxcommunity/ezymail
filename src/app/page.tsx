'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/store/use-app-store'
import { toast } from 'sonner'
import { LoginForm } from '@/components/auth/login-form'
import { RegisterForm } from '@/components/auth/register-form'
import { MailHeader } from '@/components/mail/mail-header'
import { MailSidebar } from '@/components/mail/mail-sidebar'
import { EmailList } from '@/components/mail/email-list'
import { EmailDetail } from '@/components/mail/email-detail'
import { ComposeModal } from '@/components/mail/compose-modal'
import { MobileNav } from '@/components/mail/mobile-nav'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { AdminPanel } from '@/components/admin/admin-panel'
import { ContactsPanel } from '@/components/contacts/contacts-panel'
import { useNotifications } from '@/hooks/use-notifications'

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

// ─── Forgot Password (inline) ──────────────────────────────────────────────

function ForgotPasswordForm() {
  const { setAuthView } = useAppStore()
  return (
    <div className="min-h-screen flex items-center justify-center p-0 sm:p-4 bg-white dark:bg-gray-900 sm:bg-transparent">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full sm:max-w-md h-full sm:h-auto sm:min-h-0 min-h-screen sm:min-h-0 flex flex-col sm:flex-initial"
      >
        <div className="bg-white dark:bg-gray-900 sm:rounded-2xl sm:shadow-xl sm:shadow-black/5 p-6 sm:p-8 text-center flex-1 flex flex-col justify-center sm:justify-start">
          <div className="w-16 h-16 rounded-2xl bg-[#D3E3FD] flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#4285F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white mb-2">Reset your password</h2>
          <p className="text-sm text-[#444746] dark:text-gray-400 mb-6">
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <div className="space-y-4 mb-6">
            <input type="email" placeholder="you@ezy.af"
              className="w-full h-11 rounded-xl px-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none" />
            <button className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200">
              Send Reset Link
            </button>
          </div>
          <button onClick={() => setAuthView('login')}
            className="text-sm text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors">
            Back to sign in
          </button>
        </div>
      </motion.div>
    </div>
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

  // ─── Auth views ──────────────────────────────────────────────────────────
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#D3E3FD] via-white to-[#E6F4EA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#D3E3FD] via-white to-[#E6F4EA]">
        <AnimatePresence mode="wait">
          {authView === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <LoginForm />
            </motion.div>
          )}
          {authView === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <RegisterForm />
            </motion.div>
          )}
          {authView === 'forgot-password' && (
            <motion.div
              key="forgot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ForgotPasswordForm />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ─── Main mail view ──────────────────────────────────────────────────────
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

      {/* Undo snackbar */}
      <UndoSnackbar />

    </div>
  )
}
