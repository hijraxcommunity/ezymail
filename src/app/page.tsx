'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/store/use-app-store'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/auth-layout'
import { MailHeader } from '@/components/mail/mail-header'
import { MailSidebar } from '@/components/mail/mail-sidebar'
import { EmailList } from '@/components/mail/email-list'
import { EmailDetail } from '@/components/mail/email-detail'
import { ComposeModal } from '@/components/mail/compose-modal'
import { AttachmentViewer } from '@/components/mail/attachment-viewer'
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
    setCurrentFolder,
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

  // ─── Native splash dismissal — end of the launch handover ──────────────
  // The native shell keeps the branded splash visible while the remote site
  // loads (no blank gap). This effect runs AFTER the real UI (or login) has
  // painted, so hiding here cannot flash an empty screen. The plugin's 15s
  // launchShowDuration is the native fallback cap if this never runs.
  // Browsers: isNativePlatform() is false, the plugin is never imported, and
  // the website behavior is unchanged.
  const splashHiddenRef = useRef(false)
  useEffect(() => {
    if (isCheckingAuth || splashHiddenRef.current) return
    splashHiddenRef.current = true
    if (!Capacitor.isNativePlatform()) return
    void import('@capacitor/splash-screen')
      .then(({ SplashScreen }) => SplashScreen.hide())
      .catch(() => { /* never block the UI on splash dismissal */ })
  }, [isCheckingAuth])

  // ─── Deep link: /?id=<emailId> opens that email (push notification taps) ─
  // Runs once after auth resolves; EmailDetail self-fetches by id, so no
  // dependency on the inbox list having loaded.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (isCheckingAuth || !isAuthenticated || deepLinkHandledRef.current) return
    deepLinkHandledRef.current = true
    try {
      const id = new URLSearchParams(window.location.search).get('id')
      if (!id) return
      // Email deep links only exist in the personal mail UI
      if (user && (user.role === 'admin' || user.accountType === 'business')) {
        window.history.replaceState({ ezView: true }, '', '/')
        return
      }
      setCurrentFolder('inbox')
      setSelectedEmailId(id)
      // Clean the URL without adding a history entry — passing ezView keeps
      // the back-navigation guard state intact
      window.history.replaceState({ ezView: true }, '', '/')
    } catch { /* silent */ }
  }, [isCheckingAuth, isAuthenticated, user, setCurrentFolder, setSelectedEmailId])

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

  // ─── Native-like back navigation (mobile hardware/browser back) ──────────
  // One history "guard" entry: pressing back closes the topmost in-app view
  // (compose → email detail → sidebar → settings/contacts/admin panels) one
  // at a time, like a native app. At the base view, the first back shows a
  // toast and the second back within 2.5s exits — never closing the app on a
  // single accidental press.
  useEffect(() => {
    if (!isAuthenticated) return
    window.history.pushState({ ezView: true }, '')
    let lastBaseBackAt = 0
    const onPopState = () => {
      // Always read fresh state — avoids stale closures, no re-subscription needed
      const s = useAppStore.getState()
      if (s.composeOpen || s.attachmentViewer || s.selectedEmailId || s.sidebarOpen || s.settingsView || s.contactsView || s.adminView) {
        lastBaseBackAt = 0 // In-app navigation resets the exit timer
        if (s.composeOpen) {
          s.setComposeOpen(false)
        } else if (s.attachmentViewer) {
          s.setAttachmentViewer(null)
        } else if (s.selectedEmailId) {
          s.setSelectedEmailId(null)
        } else if (s.sidebarOpen) {
          s.setSidebarOpen(false)
        } else if (s.settingsView) {
          s.setSettingsView(null)
        } else if (s.contactsView) {
          s.setContactsView(false)
        } else if (s.adminView) {
          s.setAdminView(false)
        }
      } else {
        // Base view — second back within 2.5s exits, like a native app
        const now = Date.now()
        if (lastBaseBackAt && now - lastBaseBackAt < 2500) {
          window.history.back() // Leave the app (no-op if there is no earlier page)
          // If the app is the first page, back() can't leave — restore the guard
          setTimeout(() => window.history.pushState({ ezView: true }, ''), 200)
          return
        }
        lastBaseBackAt = now
        toast('Press back again to exit')
      }
      // Always restore the guard so the next back press keeps navigating in-app
      window.history.pushState({ ezView: true }, '')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isAuthenticated])

  // ─── Android hardware back button — native control (APK only) ────────────
  // Capacitor 8 ships NO native back handling: without a listener the
  // hardware key finishes the activity and the app closes instantly on every
  // page. With a backButton listener registered, the official App plugin
  // hands the key to JavaScript instead: any open view steps back toward the
  // main page, and only at the main page does the app exit (first press
  // warns, second press within 2.5s exits). Browsers are unaffected — they
  // keep the popstate guard above.
  useEffect(() => {
    if (!isAuthenticated || !Capacitor.isNativePlatform()) return
    let lastBaseBackAt = 0
    let unsub: (() => void) | null = null
    import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('backButton', () => {
          const s = useAppStore.getState()
          // Any open in-app view — step back toward the main page
          if (s.composeOpen || s.attachmentViewer || s.selectedEmailId || s.sidebarOpen || s.settingsView || s.contactsView || s.adminView) {
            lastBaseBackAt = 0 // In-app navigation resets the exit timer
            if (s.composeOpen) s.setComposeOpen(false)
            else if (s.attachmentViewer) s.setAttachmentViewer(null)
            else if (s.selectedEmailId) s.setSelectedEmailId(null)
            else if (s.sidebarOpen) s.setSidebarOpen(false)
            else if (s.settingsView) s.setSettingsView(null)
            else if (s.contactsView) s.setContactsView(false)
            else if (s.adminView) s.setAdminView(false)
            return
          }
          // Main page — second press within 2.5s exits, like a native app
          const now = Date.now()
          if (lastBaseBackAt && now - lastBaseBackAt < 2500) {
            void App.exitApp()
            return
          }
          lastBaseBackAt = now
          toast('Press back again to exit')
        })
      )
      .then((handle) => { unsub = () => void handle?.remove() })
      .catch(() => { /* never block the UI on plugin errors */ })
    return () => { unsub?.() }
  }, [isAuthenticated])

  // ─── Native app: disable browser-style long-press text selection ─────────
  // Holding a touch in the APK WebView highlights text like a browser. The
  // html.native-app class switches on the CSS rule in globals.css — native
  // only; normal browsers keep text selection and inputs stay editable.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native-app')
  }, [])

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
      <div className="min-h-dvh bg-white flex flex-col items-center justify-between py-20">
        <div />
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="EzyMail" className="w-20 h-20 rounded-2xl" />
          <p className="font-bold text-2xl tracking-tight text-[#1F1F1F]">EzyMail</p>
          <p className="text-xs text-gray-400">Email made Ezy</p>
        </div>
        <p className="text-xs text-gray-400 pb-8">From <span className="font-semibold text-gray-500">HijraX</span></p>
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
      {/* Gmail-style: top header hidden on mobile while reading an email (list/detail panes unaffected on desktop) */}
      <div className={`shrink-0 ${selectedEmailId ? 'hidden md:block' : 'block'}`}>
        <MailHeader />
      </div>

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

      {/* Full-screen attachment / document viewer */}
      <AttachmentViewer />

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
