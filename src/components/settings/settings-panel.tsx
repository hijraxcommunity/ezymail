'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  X, Sun, Moon, Monitor, Bell, Volume2, Save, Loader2, Camera,
  Eye, EyeOff, Shield, Smartphone, Globe, Clock, Lock, Download,
  Trash2, AlertTriangle, CheckCircle2, XCircle, Copy, Key,
  Bold, Italic, Link as LinkIcon, List, ChevronRight,
  RefreshCw, LogOut, CalendarDays, Filter, ArrowLeft, User, Palette,
  BellRing, FileText, ShieldCheck, Settings as SettingsIcon
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
// Tabs removed — now using list → detail pattern
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { FiltersTab } from '@/components/settings/filters-tab'
import { useAppStore } from '@/store/use-app-store'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfileData {
  id: string
  email: string
  firstName: string
  lastName: string
  displayName: string | null
  avatar: string | null
  bio: string
  phone: string | null
  dateOfBirth: string
  recoveryEmail: string | null
  role: string
  status: string
  signature: string
  preferences: string
  createdAt: string
  lastLogin: string | null
}

interface SessionData {
  id: string
  deviceName: string
  deviceType: string
  ipAddress: string
  location: string | null
  lastActive: string
  isCurrent: boolean
}

interface LoginLogData {
  id: string
  date: string
  ipAddress: string
  userAgent: string | null
  deviceType: string | null
  location: string | null
  success: boolean
}

interface TwoFAStatus {
  enabled: boolean
  verified: boolean
  createdAt: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (score <= 2) return { score, label: 'Weak', color: 'bg-[#EA4335]' }
  if (score <= 3) return { score, label: 'Medium', color: 'bg-[#FBBC05]' }
  return { score, label: 'Strong', color: 'bg-[#34A853]' }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(dateStr: string) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getDeviceIcon(type: string) {
  switch (type) {
    case 'mobile': return <Smartphone className="w-4 h-4" />
    case 'tablet': return <Globe className="w-4 h-4" />
    case 'desktop': return <Monitor className="w-4 h-4" />
    default: return <Globe className="w-4 h-4" />
  }
}

// ─── Animation variants ─────────────────────────────────────────────────────

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

const tabVariants = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { settingsView, setSettingsView, user, setAdminView } = useAppStore()
  const { theme, setTheme } = useTheme()

  // Determine if showing list or a detail page
  const isListView = settingsView === 'settings' || settingsView === 'profile' || !settingsView
  const activeSection = isListView ? null : settingsView?.replace('settings-', '') || null

  // ─── Profile state ──────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0)

  // ─── Password state ─────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const passwordStrength = getPasswordStrength(newPassword)

  // ─── Sessions state ─────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [loginLogs, setLoginLogs] = useState<LoginLogData[]>([])
  const [loginLogsLoading, setLoginLogsLoading] = useState(false)

  // ─── 2FA state ─────────────────────────────────────────────────────────
  const [twoFA, setTwoFA] = useState<TwoFAStatus>({ enabled: false, verified: false, createdAt: null })
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [twoFASetup, setTwoFASetup] = useState(false)
  const [twoFASecret, setTwoFASecret] = useState('')
  const [twoFAUri, setTwoFAUri] = useState('')
  const [twoFABackupCodes, setTwoFABackupCodes] = useState<string[]>([])
  const [twoFAVerifyCode, setTwoFAVerifyCode] = useState('')
  const [twoFAVerifying, setTwoFAVerifying] = useState(false)
  const [twoFADisabling, setTwoFADisabling] = useState(false)
  const [disable2FAPassword, setDisable2FAPassword] = useState('')

  // ─── Preferences state ──────────────────────────────────────────────────
  const [emailDensity, setEmailDensity] = useState<'comfortable' | 'cozy' | 'compact'>('comfortable')
  const [previewLines, setPreviewLines] = useState<'none' | '1' | '2' | '3'>('2')
  const [conversationView, setConversationView] = useState(true)
  const [desktopNotif, setDesktopNotif] = useState(false)
  const [soundNotif, setSoundNotif] = useState(true)
  const [dateFormat, setDateFormat] = useState<'12h' | '24h'>('12h')
  const [savingPrefs, setSavingPrefs] = useState(false)

  // ─── Signature editor ───────────────────────────────────────────────────
  const signatureEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your email signature here...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'min-h-[100px] w-full px-3 py-2 text-sm text-[#1F1F1F] dark:text-gray-300 focus:outline-none prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror-placeholder.is-empty::before]:text-gray-400 [&_.ProseMirror-placeholder.is-empty::before]:content-[attr(data-placeholder)] [&_.ProseMirror-placeholder.is-empty::before]:float-left [&_.ProseMirror-placeholder.is-empty::before]:pointer-events-none',
      },
    },
  })

  const [savingSignature, setSavingSignature] = useState(false)

  // ─── Account state ──────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)

  // ─── Refs ───────────────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // ─── Load profile data ──────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    try {
      const res = await fetch('/api/user/profile')
      if (res.ok) {
        const data = await res.json()
        const u = data.user as ProfileData
        setProfile(u)
        // Load preferences
        if (u.preferences) {
          try {
            const prefs = typeof u.preferences === 'string' ? JSON.parse(u.preferences) : u.preferences
            if (prefs.emailDensity) setEmailDensity(prefs.emailDensity)
            if (prefs.previewLines) setPreviewLines(prefs.previewLines)
            if (prefs.conversationView !== undefined) setConversationView(prefs.conversationView)
            if (prefs.desktopNotif !== undefined) setDesktopNotif(prefs.desktopNotif)
            if (prefs.soundNotif !== undefined) setSoundNotif(prefs.soundNotif)
            if (prefs.dateFormat) setDateFormat(prefs.dateFormat)
          } catch {
            // ignore parse errors
          }
        }
        // Set signature editor content
        if (u.signature && signatureEditor) {
          signatureEditor.commands.setContent(u.signature)
        }
      }
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }, [signatureEditor])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // ─── Profile handlers ──────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!profile) return
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      toast.error('Name fields are required')
      return
    }
    setSavingProfile(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: profile.displayName,
          bio: profile.bio,
          phone: profile.phone,
          dateOfBirth: profile.dateOfBirth,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const updated = data.user as ProfileData
        setProfile(updated)
        // Also update Zustand store user
        const store = useAppStore.getState()
        store.setUser({
          id: updated.id,
          email: updated.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          avatar: updated.avatar,
          role: updated.role,
          status: updated.status,
          onboardingDone: store.user?.onboardingDone ?? false,
        })
        toast.success('Profile updated')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update profile')
      }
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }
    setAvatarUploading(true)
    setAvatarUploadProgress(0)
    const formData = new FormData()
    formData.append('avatar', file)
    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setAvatarUploadProgress(prev => {
        if (prev >= 85) return prev
        return prev + Math.random() * 15 + 5
      })
    }, 150)
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData })
      clearInterval(progressInterval)
      setAvatarUploadProgress(100)
      await new Promise(r => setTimeout(r, 400))
      if (res.ok) {
        const data = await res.json()
        setProfile(prev => prev ? { ...prev, avatar: data.avatar } : prev)
        const store = useAppStore.getState()
        if (store.user) store.setUser({ ...store.user, avatar: data.avatar })
        toast.success('Avatar updated')
      } else {
        toast.error('Failed to upload avatar')
      }
    } catch {
      clearInterval(progressInterval)
      toast.error('Failed to upload avatar')
    } finally {
      setAvatarUploading(false)
      setAvatarUploadProgress(0)
    }
  }

  // ─── Password handlers ─────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('All password fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        toast.success('Password changed')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to change password')
      }
    } catch {
      toast.error('Failed to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  // ─── Sessions handlers ─────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch('/api/user/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.data.sessions || [])
      }
    } catch {
      toast.error('Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const loadLoginLogs = useCallback(async () => {
    setLoginLogsLoading(true)
    try {
      const res = await fetch('/api/user/login-history?limit=15')
      if (res.ok) {
        const data = await res.json()
        setLoginLogs(data.data.logs || [])
      }
    } catch {
      toast.error('Failed to load login history')
    } finally {
      setLoginLogsLoading(false)
    }
  }, [])

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await fetch('/api/user/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (res.ok) {
        toast.success('Session revoked')
        loadSessions()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to revoke session')
      }
    } catch {
      toast.error('Failed to revoke session')
    }
  }

  const handleRevokeAllOthers = async () => {
    try {
      const res = await fetch('/api/user/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.data.revoked} session(s) revoked`)
        loadSessions()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to revoke sessions')
      }
    } catch {
      toast.error('Failed to revoke sessions')
    }
  }

  // ─── 2FA handlers ──────────────────────────────────────────────────────
  const load2FA = useCallback(async () => {
    setTwoFALoading(true)
    try {
      const res = await fetch('/api/user/2fa')
      if (res.ok) {
        const data = await res.json()
        setTwoFA(data.data)
      }
    } catch {
      toast.error('Failed to load 2FA status')
    } finally {
      setTwoFALoading(false)
    }
  }, [])

  const handleSetup2FA = async () => {
    try {
      const res = await fetch('/api/user/2fa', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setTwoFASecret(data.data.secret)
        setTwoFAUri(data.data.otpAuthUri)
        setTwoFABackupCodes(data.data.backupCodes)
        setTwoFASetup(true)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to setup 2FA')
      }
    } catch {
      toast.error('Failed to setup 2FA')
    }
  }

  const handleVerify2FA = async () => {
    if (twoFAVerifyCode.length !== 6) {
      toast.error('Enter 6-digit code')
      return
    }
    setTwoFAVerifying(true)
    try {
      const res = await fetch('/api/user/2fa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFAVerifyCode }),
      })
      if (res.ok) {
        toast.success('2FA enabled successfully')
        setTwoFASetup(false)
        setTwoFAVerifyCode('')
        load2FA()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Invalid code')
      }
    } catch {
      toast.error('Failed to verify 2FA')
    } finally {
      setTwoFAVerifying(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!disable2FAPassword) {
      toast.error('Enter your password to confirm')
      return
    }
    setTwoFADisabling(true)
    try {
      const res = await fetch('/api/user/2fa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disable2FAPassword }),
      })
      if (res.ok) {
        toast.success('2FA disabled')
        setDisable2FAPassword('')
        load2FA()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to disable 2FA')
      }
    } catch {
      toast.error('Failed to disable 2FA')
    } finally {
      setTwoFADisabling(false)
    }
  }

  // ─── Preferences handlers ───────────────────────────────────────────────
  const handleSavePreferences = async () => {
    setSavingPrefs(true)
    try {
      const prefs = {
        emailDensity,
        previewLines,
        conversationView,
        desktopNotif,
        soundNotif,
        dateFormat,
      }
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs }),
      })
      if (res.ok) {
        // Update the notification preferences cache so the hook picks up changes immediately
        try {
          sessionStorage.setItem('ezymail-notif-prefs', JSON.stringify({ desktopNotif, soundNotif }))
        } catch { /* ignore */ }
        toast.success('Preferences saved')
      } else {
        toast.error('Failed to save preferences')
      }
    } catch {
      toast.error('Failed to save preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  // ─── Signature handlers ────────────────────────────────────────────────
  const handleSaveSignature = async () => {
    if (!signatureEditor) return
    setSavingSignature(true)
    try {
      const html = signatureEditor.getHTML()
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: html }),
      })
      if (res.ok) {
        toast.success('Signature saved')
      } else {
        toast.error('Failed to save signature')
      }
    } catch {
      toast.error('Failed to save signature')
    } finally {
      setSavingSignature(false)
    }
  }

  // ─── Export handler ────────────────────────────────────────────────────
  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true)
    try {
      const res = await fetch(`/api/user/export?format=${format}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ezymail-export-${new Date().toISOString().slice(0, 10)}.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`Data exported as ${format.toUpperCase()}`)
      } else {
        toast.error('Failed to export data')
      }
    } catch {
      toast.error('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  // ─── Derived values ────────────────────────────────────────────────────
  const initials = profile
    ? `${profile.firstName?.charAt(0) || ''}${profile.lastName?.charAt(0) || ''}`.toUpperCase()
    : 'U'

  // ─── Render ────────────────────────────────────────────────────────────
  if (!profile && profileLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#4285F4]" />
      </div>
    )
  }

  const handleClose = () => setSettingsView(null)
  const goBack = () => setSettingsView('settings')
  const navigateTo = (section: string) => setSettingsView(`settings-${section}`)

  // Settings list items with value previews
  const settingsItems = [
    { key: 'profile', label: 'Profile', description: 'Manage your personal information, avatar, and bio', icon: User, color: 'bg-[#4285F4]/10 text-[#4285F4]', preview: profile?.displayName || `${profile?.firstName} ${profile?.lastName}` },
    { key: 'security', label: 'Security', description: 'Password, sessions, login history, and two-factor authentication', icon: ShieldCheck, color: 'bg-[#34A853]/10 text-[#34A853]', badge: 'Protected' },
    { key: 'preferences', label: 'Appearance & Preferences', description: 'Theme, density, notifications, date format, and signature', icon: Palette, color: 'bg-[#FBBC05]/10 text-[#E37400]', preview: theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System' },
    { key: 'filters', label: 'Filters & Rules', description: 'Email filters, auto-labeling, and automated rules', icon: Filter, color: 'bg-[#EA4335]/10 text-[#EA4335]' },
    { key: 'account', label: 'Account', description: 'Export data and manage your account', icon: SettingsIcon, color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
  ]

  // Add admin panel item for admin users
  if (user?.role === 'admin') {
    settingsItems.push({ key: 'admin', label: 'Admin Panel', description: 'Manage users, reports, announcements, and system settings', icon: Shield, color: 'bg-[#4285F4]/10 text-[#4285F4]' })
  }

  // Detail page titles
  const sectionTitles: Record<string, string> = {
    profile: 'Profile',
    security: 'Security',
    preferences: 'Appearance & Preferences',
    filters: 'Filters & Rules',
    account: 'Account',
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 h-14">
          {!isListView && (
            <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white flex-1">
            {isListView ? 'Settings' : (sectionTitles[activeSection || ''] || 'Settings')}
          </h2>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-9 w-9 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {isListView ? (
            <motion.div
              key="settings-list"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto p-4 sm:p-6 space-y-3 pb-8"
            >
              {/* Profile Card */}
              <motion.div
                {...fadeInUp}
                onClick={() => navigateTo('profile')}
                className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#D3E3FD]/60 to-[#E6F4EA]/60 dark:from-[#4285F4]/10 dark:to-[#34A853]/10 border border-[#D3E3FD]/50 dark:border-[#4285F4]/20 cursor-pointer hover:from-[#D3E3FD]/80 hover:to-[#E6F4EA]/80 dark:hover:from-[#4285F4]/15 dark:hover:to-[#34A853]/15 transition-all"
              >
                <div className="relative">
                  <Avatar className="h-14 w-14 ring-2 ring-white dark:ring-gray-800 shadow-sm">
                    <AvatarImage src={profile?.avatar || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-lg font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#34A853] rounded-full border-2 border-white dark:border-gray-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#1F1F1F] dark:text-white truncate">
                    {profile?.displayName || `${profile?.firstName} ${profile?.lastName}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{profile?.email}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </motion.div>

              {/* Settings Items Group */}
              <motion.div {...fadeInUp} className="pt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">General</p>
                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                  {settingsItems.map((item, index) => (
                    <motion.button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.key === 'admin') {
                          setSettingsView(null)
                          setAdminView('dashboard')
                        } else {
                          navigateTo(item.key)
                        }
                      }}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.03 }}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors text-left group"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                        <item.icon className="w-[18px] h-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">{item.label}</p>
                        <p className="text-[11px] text-gray-400 mt-px line-clamp-1">{item.description}</p>
                      </div>
                      {item.preview && (
                        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md truncate max-w-[80px]">
                          {item.preview}
                        </span>
                      )}
                      {item.badge && (
                        <span className="text-[10px] font-medium text-[#34A853] bg-[#34A853]/10 px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors flex-shrink-0" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Sign Out */}
              <motion.div {...fadeInUp} className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' })
                    toast.success('Logged out')
                    useAppStore.getState().logout()
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[#EA4335] hover:bg-[#FCE8E6] dark:hover:bg-[#3B1A17] transition-colors border border-transparent hover:border-[#EA4335]/20"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#EA4335]/10 flex items-center justify-center flex-shrink-0">
                    <LogOut className="w-[18px] h-[18px]" />
                  </div>
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
              </motion.div>

              {/* App Version Footer */}
              <motion.p {...fadeInUp} className="text-center text-[11px] text-gray-400 dark:text-gray-600 pt-4">
                EzyMail v1.0 &middot; From HijraX
              </motion.p>
            </motion.div>
          ) : (
            <>
              {activeSection === 'profile' && (
                <motion.div key="detail-profile" {...tabVariants} initial="initial" animate="animate" exit="exit">
                  <ProfileTabContent
                    profile={profile}
                    setProfile={setProfile}
                    initials={initials}
                    avatarUploading={avatarUploading}
                    avatarUploadProgress={avatarUploadProgress}
                    savingProfile={savingProfile}
                    avatarInputRef={avatarInputRef}
                    handleAvatarUpload={handleAvatarUpload}
                    handleSaveProfile={handleSaveProfile}
                  />
                </motion.div>
              )}
              {activeSection === 'security' && (
                <motion.div key="detail-security" {...tabVariants} initial="initial" animate="animate" exit="exit">
                  <SecurityTabContent
                    currentPassword={currentPassword}
                    setCurrentPassword={setCurrentPassword}
                    newPassword={newPassword}
                    setNewPassword={setNewPassword}
                    confirmPassword={confirmPassword}
                    setConfirmPassword={setConfirmPassword}
                    showCurrentPassword={showCurrentPassword}
                    setShowCurrentPassword={setShowCurrentPassword}
                    showNewPassword={showNewPassword}
                    setShowNewPassword={setShowNewPassword}
                    savingPassword={savingPassword}
                    passwordStrength={passwordStrength}
                    handleChangePassword={handleChangePassword}
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    loadSessions={loadSessions}
                    handleRevokeSession={handleRevokeSession}
                    handleRevokeAllOthers={handleRevokeAllOthers}
                    loginLogs={loginLogs}
                    loginLogsLoading={loginLogsLoading}
                    loadLoginLogs={loadLoginLogs}
                    twoFA={twoFA}
                    twoFALoading={twoFALoading}
                    load2FA={load2FA}
                    twoFASetup={twoFASetup}
                    twoFASecret={twoFASecret}
                    twoFAUri={twoFAUri}
                    twoFABackupCodes={twoFABackupCodes}
                    twoFAVerifyCode={twoFAVerifyCode}
                    setTwoFAVerifyCode={setTwoFAVerifyCode}
                    twoFAVerifying={twoFAVerifying}
                    handleSetup2FA={handleSetup2FA}
                    handleVerify2FA={handleVerify2FA}
                    setTwoFASetup={setTwoFASetup}
                    twoFADisabling={twoFADisabling}
                    disable2FAPassword={disable2FAPassword}
                    setDisable2FAPassword={setDisable2FAPassword}
                    handleDisable2FA={handleDisable2FA}
                  />
                </motion.div>
              )}
              {activeSection === 'preferences' && (
                <motion.div key="detail-preferences" {...tabVariants} initial="initial" animate="animate" exit="exit">
                  <PreferencesTabContent
                    emailDensity={emailDensity}
                    setEmailDensity={setEmailDensity}
                    previewLines={previewLines}
                    setPreviewLines={setPreviewLines}
                    conversationView={conversationView}
                    setConversationView={setConversationView}
                    theme={theme || 'system'}
                    setTheme={setTheme}
                    desktopNotif={desktopNotif}
                    setDesktopNotif={setDesktopNotif}
                    soundNotif={soundNotif}
                    setSoundNotif={setSoundNotif}
                    dateFormat={dateFormat}
                    setDateFormat={setDateFormat}
                    savingPrefs={savingPrefs}
                    handleSavePreferences={handleSavePreferences}
                    signatureEditor={signatureEditor}
                    savingSignature={savingSignature}
                    handleSaveSignature={handleSaveSignature}
                  />
                </motion.div>
              )}
              {activeSection === 'filters' && (
                <motion.div key="detail-filters" {...tabVariants} initial="initial" animate="animate" exit="exit">
                  <FiltersTab />
                </motion.div>
              )}
              {activeSection === 'account' && (
                <motion.div key="detail-account" {...tabVariants} initial="initial" animate="animate" exit="exit">
                  <AccountTabContent
                    exporting={exporting}
                    handleExport={handleExport}
                  />
                </motion.div>
              )}

            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Profile Tab ──────────────────────────────────────────────────────────

function ProfileTabContent({
  profile, setProfile, initials, avatarUploading, avatarUploadProgress, savingProfile,
  avatarInputRef, handleAvatarUpload, handleSaveProfile,
}: {
  profile: ProfileData | null
  setProfile: React.Dispatch<React.SetStateAction<ProfileData | null>>
  initials: string
  avatarUploading: boolean
  avatarUploadProgress: number
  savingProfile: boolean
  avatarInputRef: React.RefObject<HTMLInputElement | null>
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSaveProfile: () => void
}) {
  if (!profile) return null

  const update = (field: keyof ProfileData, value: string) => {
    setProfile(prev => prev ? { ...prev, [field]: value } : prev)
  }

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-6 pb-8">
      {/* Avatar */}
      <motion.div className="flex flex-col items-center gap-3" {...fadeInUp}>
        <div className="relative group" style={{ width: 96, height: 96 }}>
          {/* Upload progress SVG ring */}
          {avatarUploading && (
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="45" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-gray-700" />
              <circle
                cx="48" cy="48" r="45" fill="none" stroke="#4285F4" strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - avatarUploadProgress / 100)}`}
                className="transition-all duration-200 ease-out"
              />
            </svg>
          )}
          <Avatar className="w-full h-full">
            <AvatarImage src={profile.avatar || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-xl sm:text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className={`absolute inset-0 rounded-full flex items-center justify-center cursor-pointer transition-all ${
              avatarUploading
                ? 'bg-black/50 opacity-100'
                : 'bg-black/40 opacity-0 group-hover:opacity-100'
            }`}
            aria-label="Change avatar"
          >
            {avatarUploading ? (
              <span className="text-white text-xs font-bold tabular-nums">{Math.round(avatarUploadProgress)}%</span>
            ) : (
              <Camera className="w-6 h-6 text-white" />
            )}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <p className="text-xs text-gray-500">
          {avatarUploading ? 'Uploading...' : 'Click to change photo'}
        </p>
      </motion.div>

      {/* Personal Information */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Personal Information</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-sm text-gray-600 dark:text-gray-400">First Name *</Label>
                <Input
                  id="firstName"
                  value={profile.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  className="h-10 rounded-xl border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-sm text-gray-600 dark:text-gray-400">Last Name *</Label>
                <Input
                  id="lastName"
                  value={profile.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  className="h-10 rounded-xl border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-gray-600 dark:text-gray-400">Email Address</Label>
              <div className="relative">
                <Input
                  id="email"
                  value={profile.email}
                  readOnly
                  className="h-10 rounded-xl bg-gray-50 dark:bg-gray-900 pr-16 border-gray-200 dark:border-gray-700"
                />
                <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4285F4] border-[#4285F4]/30 text-[10px] px-1.5">
                  @ezy.af
                </Badge>
              </div>
              <p className="text-[11px] text-gray-400">Your email address cannot be changed</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio" className="text-sm text-gray-600 dark:text-gray-400">Bio</Label>
              <Textarea
                id="bio"
                value={profile.bio || ''}
                onChange={(e) => {
                  if (e.target.value.length <= 60) update('bio', e.target.value)
                }}
                placeholder="Tell others about yourself (max 60 chars)"
                className="rounded-xl min-h-[70px] resize-none border-gray-200 dark:border-gray-700"
              />
              <p className="text-[11px] text-gray-400">{(profile.bio || '').length}/60</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm text-gray-600 dark:text-gray-400">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone || ''}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="93700000000"
                  className="h-10 rounded-xl border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dob" className="text-sm text-gray-600 dark:text-gray-400">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={profile.dateOfBirth || ''}
                  onChange={(e) => update('dateOfBirth', e.target.value)}
                  className="h-10 rounded-xl border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Info (read-only) */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Account Details</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-0 divide-y divide-gray-100 dark:divide-gray-800">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-gray-400" /> Account Created
              </span>
              <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                {formatDate(profile.createdAt)}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" /> Last Login
              </span>
              <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                {formatDate(profile.lastLogin)}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-400" /> Account Role
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5">
                {profile.role}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeInUp}>
        <Button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium shadow-sm shadow-[#4285F4]/20 active:scale-[0.98] transition-transform"
        >
          {savingProfile ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Save Profile</>
          )}
        </Button>
      </motion.div>
    </div>
  )
}

// ─── Security Tab ─────────────────────────────────────────────────────────

function SecurityTabContent({
  currentPassword, setCurrentPassword,
  newPassword, setNewPassword,
  confirmPassword, setConfirmPassword,
  showCurrentPassword, setShowCurrentPassword,
  showNewPassword, setShowNewPassword,
  savingPassword, passwordStrength,
  handleChangePassword,
  sessions, sessionsLoading, loadSessions,
  handleRevokeSession, handleRevokeAllOthers,
  loginLogs, loginLogsLoading, loadLoginLogs,
  twoFA, twoFALoading, load2FA,
  twoFASetup, twoFASecret, twoFAUri, twoFABackupCodes,
  twoFAVerifyCode, setTwoFAVerifyCode, twoFAVerifying,
  handleSetup2FA, handleVerify2FA, setTwoFASetup,
  twoFADisabling, disable2FAPassword, setDisable2FAPassword, handleDisable2FA,
}: {
  currentPassword: string
  setCurrentPassword: (v: string) => void
  newPassword: string
  setNewPassword: (v: string) => void
  confirmPassword: string
  setConfirmPassword: (v: string) => void
  showCurrentPassword: boolean
  setShowCurrentPassword: (v: boolean) => void
  showNewPassword: boolean
  setShowNewPassword: (v: boolean) => void
  savingPassword: boolean
  passwordStrength: { score: number; label: string; color: string }
  handleChangePassword: () => void
  sessions: SessionData[]
  sessionsLoading: boolean
  loadSessions: () => void
  handleRevokeSession: (id: string) => void
  handleRevokeAllOthers: () => void
  loginLogs: LoginLogData[]
  loginLogsLoading: boolean
  loadLoginLogs: () => void
  twoFA: TwoFAStatus
  twoFALoading: boolean
  load2FA: () => void
  twoFASetup: boolean
  twoFASecret: string
  twoFAUri: string
  twoFABackupCodes: string[]
  twoFAVerifyCode: string
  setTwoFAVerifyCode: (v: string) => void
  twoFAVerifying: boolean
  handleSetup2FA: () => void
  handleVerify2FA: () => void
  setTwoFASetup: (v: boolean) => void
  twoFADisabling: boolean
  disable2FAPassword: string
  setDisable2FAPassword: (v: string) => void
  handleDisable2FA: () => void
}) {
  const [activeSection, setActiveSection] = useState<'password' | 'sessions' | 'login-history' | '2fa'>('password')

  useEffect(() => {
    if (activeSection === 'sessions') loadSessions()
    if (activeSection === 'login-history') loadLoginLogs()
    if (activeSection === '2fa') load2FA()
  }, [activeSection, loadSessions, loadLoginLogs, load2FA])

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4 pb-8">
      {/* Section Navigation */}
      <motion.div className="space-y-1" {...fadeInUp}>
        {([
          { key: 'password' as const, label: 'Change Password', description: 'Update your account password', icon: Lock },
          { key: 'sessions' as const, label: 'Active Sessions', description: 'Manage devices logged into your account', icon: Smartphone },
          { key: 'login-history' as const, label: 'Login History', description: 'Recent login activity and attempts', icon: Clock },
          { key: '2fa' as const, label: 'Two-Factor Auth', description: 'Add extra security to your account', icon: Shield },
        ]).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveSection(item.key)}
            className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all ${
              activeSection === item.key
                ? 'bg-[#D3E3FD] dark:bg-[#4285F4]/15 text-[#4285F4] shadow-sm'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900 text-[#1F1F1F] dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                activeSection === item.key
                  ? 'bg-[#4285F4]/15'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}>
                <item.icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-sm font-medium">{item.label}</span>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:block">{item.description}</p>
              </div>
            </div>
            {activeSection === item.key && (
              <Badge className="text-[10px] px-1.5 bg-[#4285F4] text-white border-0">Active</Badge>
            )}
          </button>
        ))}
      </motion.div>

      <Separator />

      <AnimatePresence mode="wait">
        {/* Change Password */}
        {activeSection === 'password' && (
          <motion.div key="password" {...tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Change Password</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="currentPwd" className="text-sm">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPwd"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-10 rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Toggle password visibility"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPwd" className="text-sm">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPwd"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10 rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Toggle password visibility"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-gray-700'
                        }`} />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${
                      passwordStrength.label === 'Weak' ? 'text-[#EA4335]' :
                      passwordStrength.label === 'Medium' ? 'text-[#FBBC05]' : 'text-[#34A853]'
                    }`}>{passwordStrength.label}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPwd" className="text-sm">Confirm New Password</Label>
                <Input
                  id="confirmPwd"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 rounded-xl"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-[#EA4335]">Passwords do not match</p>
                )}
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={savingPassword}
                className="w-full h-10 rounded-xl bg-[#34A853] hover:bg-[#2d9249] text-white font-medium"
              >
                {savingPassword ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Changing...</> : 'Change Password'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Active Sessions */}
        {activeSection === 'sessions' && (
          <motion.div key="sessions" {...tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Active Sessions</h3>
              {sessions.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeAllOthers}
                  className="text-xs h-8 rounded-lg text-[#EA4335] border-[#EA4335]/30 hover:bg-[#EA4335]/10"
                >
                  <LogOut className="w-3 h-3 mr-1" />Revoke All Others
                </Button>
              )}
            </div>
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No active sessions</p>
            ) : (
              <Card className="border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {getDeviceIcon(session.deviceType)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[#1F1F1F] dark:text-white truncate">
                            {session.deviceName}
                          </p>
                          {session.isCurrent && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-[#34A853] hover:bg-[#34A853] text-white">This device</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {session.ipAddress} &middot; {timeAgo(session.lastActive)}
                        </p>
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeSession(session.id)}
                        className="text-xs h-8 text-[#EA4335] hover:text-[#EA4335] hover:bg-[#EA4335]/10 flex-shrink-0"
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </motion.div>
        )}

        {/* Login History */}
        {activeSection === 'login-history' && (
          <motion.div key="login-history" {...tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Login History</h3>
              <Button variant="ghost" size="sm" onClick={loadLoginLogs} className="text-xs h-8">
                <RefreshCw className="w-3 h-3 mr-1" />Refresh
              </Button>
            </div>
            {loginLogsLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : loginLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No login history</p>
            ) : (
              <Card className="border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">IP</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">Device</TableHead>
                        <TableHead className="text-xs text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs py-2">
                            {formatDate(log.date)}
                          </TableCell>
                          <TableCell className="text-xs py-2 font-mono">
                            {log.ipAddress}
                          </TableCell>
                          <TableCell className="text-xs py-2 hidden sm:table-cell text-gray-500">
                            {log.deviceType || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-xs py-2 text-right">
                            {log.success ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-[#34A853]/10 text-[#34A853] border-0">
                                <CheckCircle2 className="w-3 h-3 mr-1" />Success
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] px-1.5 py-0 bg-[#EA4335]/10 text-[#EA4335] border-0">
                                <XCircle className="w-3 h-3 mr-1" />Failed
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {/* 2FA */}
        {activeSection === '2fa' && (
          <motion.div key="2fa" {...tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Two-Factor Authentication</h3>

            {twoFALoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : twoFASetup ? (
              /* Setup flow */
              <Card className="border-gray-200 dark:border-gray-800">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#D3E3FD] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Key className="w-4 h-4 text-[#4285F4]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Setup 2FA</p>
                      <p className="text-xs text-gray-500 mt-0.5">Scan this QR code in your authenticator app, or use the secret key below.</p>
                    </div>
                  </div>

                  {/* Secret key */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                    <code className="text-xs font-mono text-[#1F1F1F] dark:text-white flex-1 break-all">
                      {twoFASecret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(twoFASecret)
                        toast.success('Secret copied')
                      }}
                      className="h-8 w-8 p-0 flex-shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* OTPAuth URI as clickable link */}
                  <a
                    href={twoFAUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-[#4285F4] hover:underline break-all"
                  >
                    {twoFAUri}
                  </a>

                  {/* Backup codes */}
                  <div>
                    <p className="text-xs font-medium text-[#1F1F1F] dark:text-white mb-2">Backup Codes</p>
                    <p className="text-[11px] text-gray-500 mb-2">Save these codes in a safe place. Each can only be used once.</p>
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                      {twoFABackupCodes.map((code, i) => (
                        <code key={i} className="text-xs font-mono text-[#1F1F1F] dark:text-white py-0.5">
                          {code}
                        </code>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Verify code */}
                  <div className="space-y-2">
                    <Label htmlFor="verifyCode" className="text-sm">Enter Verification Code</Label>
                    <Input
                      id="verifyCode"
                      value={twoFAVerifyCode}
                      onChange={(e) => setTwoFAVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="h-10 rounded-xl text-center font-mono text-lg tracking-[0.5em]"
                      maxLength={6}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setTwoFASetup(false)}
                      className="flex-1 h-10 rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleVerify2FA}
                      disabled={twoFAVerifyCode.length !== 6 || twoFAVerifying}
                      className="flex-1 h-10 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white"
                    >
                      {twoFAVerifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</> : 'Verify & Enable'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : twoFA.enabled ? (
              /* Enabled state */
              <Card className="border-gray-200 dark:border-gray-800">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#34A853]/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-[#34A853]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">2FA Enabled</p>
                        <Badge className="text-[10px] px-1.5 py-0 bg-[#34A853] hover:bg-[#34A853] text-white">Active</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {twoFA.createdAt ? `Enabled since ${formatDate(twoFA.createdAt)}` : 'Your account is protected with two-factor authentication'}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="disable2faPwd" className="text-sm">Password to Disable</Label>
                    <Input
                      id="disable2faPwd"
                      type="password"
                      value={disable2FAPassword}
                      onChange={(e) => setDisable2FAPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="h-10 rounded-xl"
                    />
                  </div>

                  <Button
                    onClick={handleDisable2FA}
                    disabled={twoFADisabling || !disable2FAPassword}
                    variant="outline"
                    className="w-full h-10 rounded-xl text-[#EA4335] border-[#EA4335]/30 hover:bg-[#EA4335]/10"
                  >
                    {twoFADisabling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Disabling...</> : <><Shield className="w-4 h-4 mr-2" />Disable 2FA</>}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              /* Not enabled */
              <Card className="border-gray-200 dark:border-gray-800">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">2FA Not Enabled</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add an extra layer of security to your account</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleSetup2FA}
                    className="w-full h-10 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white"
                  >
                    <Shield className="w-4 h-4 mr-2" />Enable 2FA
                  </Button>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Preferences Tab ──────────────────────────────────────────────────────

// ─── Notification Settings ────────────────────────────────────────────────

function NotificationSettings({
  desktopNotif, setDesktopNotif,
  soundNotif, setSoundNotif,
}: {
  desktopNotif: boolean
  setDesktopNotif: (v: boolean) => void
  soundNotif: boolean
  setSoundNotif: (v: boolean) => void
}) {
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default')
  const [requesting, setRequesting] = useState(false)

  // Check current notification permission
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionStatus('unsupported')
      return
    }
    setPermissionStatus(Notification.permission)
  }, [])

  const handleRequestPermission = async () => {
    setRequesting(true)
    try {
      const permission = await Notification.requestPermission()
      setPermissionStatus(permission)
      if (permission === 'granted') {
        toast.success('Browser notifications enabled!')
      } else if (permission === 'denied') {
        toast.error('Notifications blocked. Please enable them in your browser settings.')
      }
    } catch {
      toast.error('Failed to request notification permission')
    } finally {
      setRequesting(false)
    }
  }

  const getPermissionBadge = () => {
    switch (permissionStatus) {
      case 'granted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E6F4EA] dark:bg-[#1B3626] text-[#34A853]">
            <CheckCircle2 className="w-3 h-3" /> Enabled
          </span>
        )
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FCE8E6] dark:bg-[#3B1A17] text-[#EA4335]">
            <XCircle className="w-3 h-3" /> Blocked
          </span>
        )
      case 'unsupported':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500">
            Not supported
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEF7E0] dark:bg-[#3B3117] text-[#FBBC05]">
            Not enabled
          </span>
        )
    }
  }

  return (
    <motion.div className="space-y-3" {...fadeInUp}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Notifications</h3>
        {getPermissionBadge()}
      </div>
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="p-4 space-y-4">
          {/* Permission request */}
          {permissionStatus !== 'granted' && permissionStatus !== 'unsupported' && (
            <div className="p-3 rounded-xl bg-[#FEF7E0] dark:bg-[#3B3117] border border-[#FBBC05]/30">
              <div className="flex items-start gap-2">
                <Bell className="w-4 h-4 text-[#FBBC05] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-[#1F1F1F] dark:text-white">
                    {permissionStatus === 'denied'
                      ? 'Notifications are blocked by your browser'
                      : 'Enable browser notifications for new emails'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {permissionStatus === 'denied'
                      ? 'Go to your browser settings to allow notifications for this site'
                      : 'Allow EzyMail to send you desktop notifications when you receive new emails'}
                  </p>
                  {permissionStatus === 'default' && (
                    <button
                      onClick={handleRequestPermission}
                      disabled={requesting}
                      className="mt-2 px-3 py-1.5 text-xs font-medium bg-[#4285F4] hover:bg-[#1a73e8] text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {requesting ? 'Requesting...' : 'Enable Notifications'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Desktop notifications toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Desktop Notifications</p>
                <p className="text-xs text-gray-500">Show browser push notifications for new emails</p>
              </div>
            </div>
            <Switch
              checked={desktopNotif}
              onCheckedChange={setDesktopNotif}
              className="data-[state=checked]:bg-[#4285F4]"
              disabled={permissionStatus === 'unsupported'}
            />
          </div>

          {/* Sound toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <Volume2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Notification Sound</p>
                <p className="text-xs text-gray-500">Play a sound when new emails arrive</p>
              </div>
            </div>
            <Switch
              checked={soundNotif}
              onCheckedChange={setSoundNotif}
              className="data-[state=checked]:bg-[#4285F4]"
            />
          </div>

          {/* Info about how it works */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                EzyMail checks for new emails every 15 seconds while the app is open.
                Desktop notifications only appear when EzyMail is in the background.
                {permissionStatus === 'denied' && ' To re-enable, go to your browser\'s site settings and reset notification permissions.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Preferences Tab ───────────────────────────────────────────────────────

function PreferencesTabContent({
  emailDensity, setEmailDensity,
  previewLines, setPreviewLines,
  conversationView, setConversationView,
  theme, setTheme,
  desktopNotif, setDesktopNotif,
  soundNotif, setSoundNotif,
  dateFormat, setDateFormat,
  savingPrefs, handleSavePreferences,
  signatureEditor, savingSignature, handleSaveSignature,
}: {
  emailDensity: 'comfortable' | 'cozy' | 'compact'
  setEmailDensity: (v: 'comfortable' | 'cozy' | 'compact') => void
  previewLines: 'none' | '1' | '2' | '3'
  setPreviewLines: (v: 'none' | '1' | '2' | '3') => void
  conversationView: boolean
  setConversationView: (v: boolean) => void
  theme: string
  setTheme: (v: string) => void
  desktopNotif: boolean
  setDesktopNotif: (v: boolean) => void
  soundNotif: boolean
  setSoundNotif: (v: boolean) => void
  dateFormat: '12h' | '24h'
  setDateFormat: (v: '12h' | '24h') => void
  savingPrefs: boolean
  handleSavePreferences: () => void
  signatureEditor: ReturnType<typeof useEditor> | null
  savingSignature: boolean
  handleSaveSignature: () => void
}) {
  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-5 pb-8">
      {/* Email Density & Display */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Email Display</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium text-[#1F1F1F] dark:text-white">Email Density</Label>
              <p className="text-[11px] text-gray-500 mt-0.5">Choose how compact emails appear in your inbox</p>
            </div>
            <RadioGroup value={emailDensity} onValueChange={(v) => setEmailDensity(v as typeof emailDensity)} className="space-y-1">
              {[
                { value: 'comfortable' as const, label: 'Comfortable', desc: 'More spacing, relaxed reading' },
                { value: 'cozy' as const, label: 'Cozy', desc: 'Balanced spacing' },
                { value: 'compact' as const, label: 'Compact', desc: 'More emails visible at once' },
              ].map((opt) => (
                <div key={opt.value} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <RadioGroupItem value={opt.value} id={`density-${opt.value}`} className="data-[state=checked]:border-[#4285F4] data-[state=checked]:text-[#4285F4]" />
                  <Label htmlFor={`density-${opt.value}`} className="cursor-pointer flex-1">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-[11px] text-gray-500 ml-2">{opt.desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <Label className="text-sm font-medium text-[#1F1F1F] dark:text-white">Preview Lines</Label>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">How many lines of preview to show</p>
              <RadioGroup value={previewLines} onValueChange={(v) => setPreviewLines(v as typeof previewLines)} className="flex gap-2">
                {(['none', '1', '2', '3'] as const).map((val) => (
                  <div key={val} className="flex items-center space-x-2">
                    <RadioGroupItem value={val} id={`preview-${val}`} className="data-[state=checked]:border-[#4285F4] data-[state=checked]:text-[#4285F4]" />
                    <Label htmlFor={`preview-${val}`} className="text-sm cursor-pointer">
                      {val === 'none' ? 'None' : val}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Mail Behavior */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Mail Behavior</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-[#4285F4]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Conversation View</p>
                  <p className="text-[11px] text-gray-500">Group emails as threads</p>
                </div>
              </div>
              <Switch checked={conversationView} onCheckedChange={setConversationView} className="data-[state=checked]:bg-[#4285F4]" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Appearance & Theme */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Appearance</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium text-[#1F1F1F] dark:text-white">Theme</Label>
              <p className="text-[11px] text-gray-500 mt-0.5">Choose your preferred theme</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'system', icon: Monitor, label: 'System' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    theme === opt.value
                      ? 'border-[#4285F4] bg-[#4285F4]/5 text-[#4285F4]'
                      : 'border-gray-100 dark:border-gray-800 text-gray-500 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    theme === opt.value ? 'bg-[#4285F4]/10' : 'bg-gray-50 dark:bg-gray-900'
                  }`}>
                    <opt.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notifications */}
      <NotificationSettings
        desktopNotif={desktopNotif}
        setDesktopNotif={setDesktopNotif}
        soundNotif={soundNotif}
        setSoundNotif={setSoundNotif}
      />

      {/* Date Format */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Date & Time</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FBBC05]/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-[#E37400]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Time Format</p>
                  <p className="text-[11px] text-gray-500">12-hour or 24-hour clock</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setDateFormat('12h')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    dateFormat === '12h'
                      ? 'bg-white dark:bg-gray-800 shadow-sm text-[#4285F4]'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  12h
                </button>
                <button
                  type="button"
                  onClick={() => setDateFormat('24h')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    dateFormat === '24h'
                      ? 'bg-white dark:bg-gray-800 shadow-sm text-[#4285F4]'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  24h
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeInUp}>
        <Button
          onClick={handleSavePreferences}
          disabled={savingPrefs}
          className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium shadow-sm shadow-[#4285F4]/20 active:scale-[0.98] transition-transform"
        >
          {savingPrefs ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Preferences</>}
        </Button>
      </motion.div>

      {/* Signature */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Email Signature</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="rounded-t-xl border border-b-0 border-gray-100 dark:border-gray-800 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
              <button
                type="button"
                onClick={() => signatureEditor?.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded-lg transition-colors ${
                  signatureEditor?.isActive('bold') ? 'bg-[#4285F4] text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Bold"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => signatureEditor?.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded-lg transition-colors ${
                  signatureEditor?.isActive('italic') ? 'bg-[#4285F4] text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Italic"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = window.prompt('Enter URL:')
                  if (url) signatureEditor?.chain().focus().setLink({ href: url }).run()
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  signatureEditor?.isActive('link') ? 'bg-[#4285F4] text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Link"
              >
                <LinkIcon className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
              <button
                type="button"
                onClick={() => signatureEditor?.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded-lg transition-colors ${
                  signatureEditor?.isActive('bulletList') ? 'bg-[#4285F4] text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Bullet list"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <EditorContent editor={signatureEditor} />
          </div>
        </Card>
        <Button
          onClick={handleSaveSignature}
          disabled={savingSignature}
          variant="outline"
          className="w-full h-10 rounded-xl font-medium"
        >
          {savingSignature ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Signature</>}
        </Button>
      </motion.div>
    </div>
  )
}

// ─── Account Tab ──────────────────────────────────────────────────────────

function AccountTabContent({
  exporting, handleExport,
}: {
  exporting: boolean
  handleExport: (format: 'json' | 'csv') => void
}) {
  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-5 pb-8">
      {/* Export Data */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Export Data</h3>
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
                <Download className="w-4 h-4 text-[#4285F4]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Download Your Data</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Export all your emails, contacts, folders, and settings</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => handleExport('json')}
                disabled={exporting}
                className="h-10 rounded-xl border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={exporting}
                className="h-10 rounded-xl border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Danger Zone */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-xs font-semibold text-[#EA4335] uppercase tracking-wider px-1">Danger Zone</h3>
        <Card className="border-[#EA4335]/30 bg-[#EA4335]/5 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#EA4335]/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-[#EA4335]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Delete Account</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Permanently delete your account and all associated data. This action cannot be undone.</p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-10 rounded-xl text-[#EA4335] border-[#EA4335]/30 hover:bg-[#EA4335]/10 hover:text-[#EA4335]"
                >
                  <Trash2 className="w-4 h-4 mr-2" />Delete My Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your account, all your emails, contacts, folders, and settings. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => toast.error('Account deletion is disabled in this demo')}
                    className="bg-[#EA4335] hover:bg-[#d33426] text-white"
                  >
                    Yes, delete my account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
