'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/store/use-app-store'
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
import { KeyboardShortcutsHelp } from '@/components/shared/keyboard-shortcuts-help'
import { InAppNotificationBanner } from '@/components/shared/in-app-notification-banner'
import { useNotifications } from '@/hooks/use-notifications'

// ─── Undo Snackbar ──────────────────────────────────────────────────────────

function UndoSnackbar() {
  const { undoAction, setUndoAction, addEmail } = useAppStore()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

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

    // Restore the email locally
    addEmail(undoAction.email)

    // Restore on the server
    try {
      if (undoAction.type === 'archive') {
        await fetch(`/api/emails/${undoAction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isArchived: false }),
        })
      } else if (undoAction.type === 'delete') {
        // Move back to inbox from trash
        const folder = undoAction.email.folder === 'trash' ? 'inbox' : (undoAction.email.folder || 'inbox')
        await fetch(`/api/emails/${undoAction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder }),
        })
      }
    } catch {
      // silent
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    setUndoAction(null)
  }, [undoAction, addEmail, setUndoAction])

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
            className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-[#8AB4F8] hover:text-white rounded-md hover:bg-white/10 transition-colors"
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-black/5 p-6 sm:p-8 text-center">
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

  // ─── Keyboard shortcuts help dialog ─────────────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // ─── Check session on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user)
      })
      .catch(() => { /* silent */ })
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

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      if (isInput && e.key !== 'Escape') return

      const key = e.key.toLowerCase()

      switch (key) {
        case 'c':
        case 'n':
          if (!isInput) {
            e.preventDefault()
            setComposeOpen(true)
          }
          break
        case 'r':
          if (!isInput && selectedEmailId) {
            e.preventDefault()
            const selected = emails.find((em) => em.id === selectedEmailId)
            if (selected) setReplyToEmail(selected)
          }
          break
        case 'e':
          if (!isInput && selectedEmailId) {
            e.preventDefault()
            // Archive
            fetch(`/api/emails/${selectedEmailId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isArchived: true }),
            }).catch(() => { /* silent */ })
          }
          break
        case '#':
        case 'delete':
          if (!isInput && selectedEmailId) {
            e.preventDefault()
            // Delete (move to trash)
            fetch(`/api/emails/${selectedEmailId}`, {
              method: 'DELETE',
            }).catch(() => { /* silent */ })
            setSelectedEmailId(null)
          }
          break
        case 'j': {
          if (!isInput) {
            e.preventDefault()
            const idx = emails.findIndex((em) => em.id === selectedEmailId)
            if (idx < emails.length - 1) {
              setSelectedEmailId(emails[idx + 1].id)
            } else if (emails.length > 0 && !selectedEmailId) {
              setSelectedEmailId(emails[0].id)
            }
          }
          break
        }
        case 'k': {
          if (!isInput) {
            e.preventDefault()
            const idx = emails.findIndex((em) => em.id === selectedEmailId)
            if (idx > 0) {
              setSelectedEmailId(emails[idx - 1].id)
            }
          }
          break
        }
        case '/':
          if (!isInput) {
            e.preventDefault()
            const searchInput = document.querySelector<HTMLInputElement>(
              'input[placeholder*="Search"], input[type="search"], input[data-search-input]'
            )
            if (searchInput) searchInput.focus()
          }
          break
        case 'escape':
          e.preventDefault()
          if (shortcutsOpen) {
            setShortcutsOpen(false)
          } else if (composeOpen) {
            setComposeOpen(false)
          } else if (selectedEmailId) {
            setSelectedEmailId(null)
            clearSelection()
          } else if (settingsView) {
            setSettingsView(null)
          } else if (adminView) {
            setAdminView(null)
          } else if (contactsView) {
            setContactsView(false)
          } else {
            setSidebarOpen(false)
            clearSelection()
          }
          break
        case '?':
          if (!isInput) {
            e.preventDefault()
            setShortcutsOpen(true)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isAuthenticated,
    composeOpen,
    selectedEmailId,
    emails,
    settingsView,
    adminView,
    contactsView,
    setComposeOpen,
    setReplyToEmail,
    setSelectedEmailId,
    clearSelection,
    setSettingsView,
    setAdminView,
    setContactsView,
    setSidebarOpen,
    shortcutsOpen,
  ])

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
        {(settingsView === 'profile' || settingsView === 'settings') && (
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

      {/* Keyboard shortcuts help dialog */}
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* In-app push notification banner */}
      <InAppNotificationBanner />
    </div>
  )
}
