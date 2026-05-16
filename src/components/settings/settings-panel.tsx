'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Sun, Moon, Monitor, Bell, Volume2, Save, Loader2, Camera,
  Eye, EyeOff, Shield, Smartphone, Globe, Clock, Lock, Download,
  Trash2, AlertTriangle, CheckCircle2, XCircle, Copy, Key,
  Bold, Italic, Link as LinkIcon, List, ImagePlus,
  RefreshCw, LogOut, CalendarDays, Filter, User, Settings,
  PenLine, ArrowLeft, Menu, X, Send, Languages, Undo2,
  ChevronRight
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
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

// ─── Sidebar section type ───────────────────────────────────────────────────

type SettingsSection =
  | 'profile'
  | 'security'
  | 'appearance'
  | 'notifications'
  | 'compose'
  | 'filters'
  | 'account'

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

// ─── Sidebar navigation config ──────────────────────────────────────────────

const sidebarSections: { key: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'appearance', label: 'Appearance', icon: Sun },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'compose', label: 'Compose', icon: PenLine },
  { key: 'filters', label: 'Filters & Rules', icon: Filter },
  { key: 'account', label: 'Account', icon: Settings },
]

// ─── Main Component ─────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { user, settingsView, setSettingsView, setAdminView, logout } = useAppStore()
  const { theme, setTheme } = useTheme()

  // Map old tab names to new section names
  const initialSection: SettingsSection = settingsView === 'security' ? 'security'
    : settingsView === 'preferences' ? 'appearance'
    : settingsView === 'filters' ? 'filters'
    : settingsView === 'account' ? 'account'
    : 'profile'

  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // ─── Profile state ──────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

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

  // ─── New preferences state ──────────────────────────────────────────────
  const [readReceipts, setReadReceipts] = useState(false)
  const [undoSendTimeout, setUndoSendTimeout] = useState<number>(10)
  const [defaultReplyMode, setDefaultReplyMode] = useState<'reply' | 'replyAll'>('reply')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [language, setLanguage] = useState('en')

  // ─── Vacation responder state ───────────────────────────────────────────
  const [vacationEnabled, setVacationEnabled] = useState(false)
  const [vacationSubject, setVacationSubject] = useState('')
  const [vacationMessage, setVacationMessage] = useState('')
  const [vacationStartDate, setVacationStartDate] = useState('')
  const [vacationEndDate, setVacationEndDate] = useState('')
  const [savingVacation, setSavingVacation] = useState(false)

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
            if (prefs.readReceipts !== undefined) setReadReceipts(prefs.readReceipts)
            if (prefs.undoSendTimeout !== undefined) setUndoSendTimeout(prefs.undoSendTimeout)
            if (prefs.defaultReplyMode) setDefaultReplyMode(prefs.defaultReplyMode)
            if (prefs.autoAdvance !== undefined) setAutoAdvance(prefs.autoAdvance)
            if (prefs.language) setLanguage(prefs.language)
            // Vacation responder
            if (prefs.vacationEnabled !== undefined) setVacationEnabled(prefs.vacationEnabled)
            if (prefs.vacationSubject !== undefined) setVacationSubject(prefs.vacationSubject)
            if (prefs.vacationMessage !== undefined) setVacationMessage(prefs.vacationMessage)
            if (prefs.vacationStartDate !== undefined) setVacationStartDate(prefs.vacationStartDate)
            if (prefs.vacationEndDate !== undefined) setVacationEndDate(prefs.vacationEndDate)
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
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData })
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
      toast.error('Failed to upload avatar')
    } finally {
      setAvatarUploading(false)
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
        readReceipts,
        undoSendTimeout,
        defaultReplyMode,
        autoAdvance,
        language,
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

  // ─── Vacation responder handler ────────────────────────────────────────
  const handleSaveVacation = async () => {
    setSavingVacation(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            vacationEnabled,
            vacationSubject,
            vacationMessage,
            vacationStartDate,
            vacationEndDate,
          },
        }),
      })
      if (res.ok) {
        toast.success('Vacation responder updated')
      } else {
        toast.error('Failed to save vacation responder')
      }
    } catch {
      toast.error('Failed to save vacation responder')
    } finally {
      setSavingVacation(false)
    }
  }

  // ─── Logout handler ────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    logout()
  }

  // ─── Derived values ────────────────────────────────────────────────────
  const initials = profile
    ? `${profile.firstName?.charAt(0) || ''}${profile.lastName?.charAt(0) || ''}`.toUpperCase()
    : 'U'

  // ─── Close handler ─────────────────────────────────────────────────────
  const handleClose = () => setSettingsView(null)

  // ─── Section navigation handler (closes mobile sidebar) ────────────────
  const handleSectionChange = (section: SettingsSection) => {
    setActiveSection(section)
    setMobileSidebarOpen(false)
  }

  // ─── Render: Loading state ─────────────────────────────────────────────
  if (!profile && profileLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#4285F4]" />
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white">Settings</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-9 w-9">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* ── Body: Sidebar + Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:flex flex-col w-[240px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto">
          {/* Navigation items */}
          <nav className="flex-1 p-3 space-y-1">
            {sidebarSections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeSection === section.key
                    ? 'bg-[#D3E3FD] dark:bg-[#4285F4]/15 text-[#4285F4] dark:text-[#A8C7FA] shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-[#1F1F1F] dark:hover:text-gray-200'
                }`}
              >
                <section.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          {/* Sidebar footer: Admin + Logout */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  setSettingsView(null)
                  setAdminView('dashboard')
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-[#1F1F1F] dark:hover:text-gray-200 transition-all duration-200"
              >
                <Shield className="w-[18px] h-[18px] flex-shrink-0" />
                <span>Admin Panel</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#EA4335] hover:bg-[#EA4335]/10 transition-all duration-200"
            >
              <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* ── Mobile sidebar overlay ── */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                key="mobile-sidebar-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden fixed inset-0 z-40 bg-black/40"
                onClick={() => setMobileSidebarOpen(false)}
              />
              {/* Sidebar panel */}
              <motion.aside
                key="mobile-sidebar"
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-[260px] flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 shadow-xl"
              >
                {/* Mobile sidebar header */}
                <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-[#1F1F1F] dark:text-white">Settings Menu</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setMobileSidebarOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Navigation items */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                  {sidebarSections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => handleSectionChange(section.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        activeSection === section.key
                          ? 'bg-[#D3E3FD] dark:bg-[#4285F4]/15 text-[#4285F4] dark:text-[#A8C7FA]'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <section.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <span>{section.label}</span>
                    </button>
                  ))}
                </nav>

                {/* Mobile sidebar footer */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsView(null)
                        setAdminView('dashboard')
                        setMobileSidebarOpen(false)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
                    >
                      <Shield className="w-[18px] h-[18px] flex-shrink-0" />
                      <span>Admin Panel</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#EA4335] hover:bg-[#EA4335]/10 transition-all duration-200"
                  >
                    <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
                    <span>Log Out</span>
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Content area ── */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeSection === 'profile' && (
              <motion.div key="profile" {...tabVariants} initial="initial" animate="animate" exit="exit">
                <ProfileTabContent
                  profile={profile}
                  setProfile={setProfile}
                  initials={initials}
                  avatarUploading={avatarUploading}
                  savingProfile={savingProfile}
                  avatarInputRef={avatarInputRef}
                  handleAvatarUpload={handleAvatarUpload}
                  handleSaveProfile={handleSaveProfile}
                />
              </motion.div>
            )}
            {activeSection === 'security' && (
              <motion.div key="security" {...tabVariants} initial="initial" animate="animate" exit="exit">
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
            {activeSection === 'appearance' && (
              <motion.div key="appearance" {...tabVariants} initial="initial" animate="animate" exit="exit">
                <AppearanceTabContent
                  emailDensity={emailDensity}
                  setEmailDensity={setEmailDensity}
                  previewLines={previewLines}
                  setPreviewLines={setPreviewLines}
                  conversationView={conversationView}
                  setConversationView={setConversationView}
                  theme={theme || 'system'}
                  setTheme={setTheme}
                  dateFormat={dateFormat}
                  setDateFormat={setDateFormat}
                  language={language}
                  setLanguage={setLanguage}
                  savingPrefs={savingPrefs}
                  handleSavePreferences={handleSavePreferences}
                />
              </motion.div>
            )}
            {activeSection === 'notifications' && (
              <motion.div key="notifications" {...tabVariants} initial="initial" animate="animate" exit="exit">
                <NotificationsTabContent
                  desktopNotif={desktopNotif}
                  setDesktopNotif={setDesktopNotif}
                  soundNotif={soundNotif}
                  setSoundNotif={setSoundNotif}
                  readReceipts={readReceipts}
                  setReadReceipts={setReadReceipts}
                  savingPrefs={savingPrefs}
                  handleSavePreferences={handleSavePreferences}
                />
              </motion.div>
            )}
            {activeSection === 'compose' && (
              <motion.div key="compose" {...tabVariants} initial="initial" animate="animate" exit="exit">
                <ComposeTabContent
                  signatureEditor={signatureEditor}
                  savingSignature={savingSignature}
                  handleSaveSignature={handleSaveSignature}
                  undoSendTimeout={undoSendTimeout}
                  setUndoSendTimeout={setUndoSendTimeout}
                  defaultReplyMode={defaultReplyMode}
                  setDefaultReplyMode={setDefaultReplyMode}
                  autoAdvance={autoAdvance}
                  setAutoAdvance={setAutoAdvance}
                  savingPrefs={savingPrefs}
                  handleSavePreferences={handleSavePreferences}
                />
              </motion.div>
            )}
            {activeSection === 'filters' && (
              <motion.div key="filters" {...tabVariants} initial="initial" animate="animate" exit="exit">
                <FiltersTab />
              </motion.div>
            )}
            {activeSection === 'account' && (
              <motion.div key="account" {...tabVariants} initial="initial" animate="animate" exit="exit">
                <AccountTabContent
                  exporting={exporting}
                  handleExport={handleExport}
                  vacationEnabled={vacationEnabled}
                  setVacationEnabled={setVacationEnabled}
                  vacationSubject={vacationSubject}
                  setVacationSubject={setVacationSubject}
                  vacationMessage={vacationMessage}
                  setVacationMessage={setVacationMessage}
                  vacationStartDate={vacationStartDate}
                  setVacationStartDate={setVacationStartDate}
                  vacationEndDate={vacationEndDate}
                  setVacationEndDate={setVacationEndDate}
                  savingVacation={savingVacation}
                  handleSaveVacation={handleSaveVacation}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

// ─── Profile Section ───────────────────────────────────────────────────────

function ProfileTabContent({
  profile, setProfile, initials, avatarUploading, savingProfile,
  avatarInputRef, handleAvatarUpload, handleSaveProfile,
}: {
  profile: ProfileData | null
  setProfile: React.Dispatch<React.SetStateAction<ProfileData | null>>
  initials: string
  avatarUploading: boolean
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
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <h2 className="text-xl font-bold text-[#1F1F1F] dark:text-white mb-1">Profile</h2>
        <p className="text-sm text-gray-500">Manage your personal information and account details</p>
      </motion.div>

      {/* Avatar */}
      <motion.div className="flex flex-col items-center gap-3" {...fadeInUp}>
        <div className="relative group">
          <Avatar className="w-20 h-20 sm:w-24 sm:h-24">
            <AvatarImage src={profile.avatar || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-xl sm:text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="Change avatar"
          >
            {avatarUploading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
        <p className="text-xs text-gray-500">Click to change photo</p>
      </motion.div>

      {/* Personal Information */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Personal Information</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName" className="text-sm">Display Name</Label>
              <Input
                id="displayName"
                value={profile.displayName || ''}
                onChange={(e) => update('displayName', e.target.value)}
                placeholder="How others see you"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-sm">First Name *</Label>
                <Input
                  id="firstName"
                  value={profile.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-sm">Last Name *</Label>
                <Input
                  id="lastName"
                  value={profile.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <div className="relative">
                <Input
                  id="email"
                  value={profile.email}
                  readOnly
                  className="h-10 rounded-xl bg-gray-50 dark:bg-gray-900 pr-16"
                />
                <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4285F4] border-[#4285F4]/30 text-[10px] px-1.5">
                  @ezy.af
                </Badge>
              </div>
              <p className="text-[11px] text-gray-400">Your email address cannot be changed</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio" className="text-sm">Bio</Label>
              <Textarea
                id="bio"
                value={profile.bio || ''}
                onChange={(e) => update('bio', e.target.value)}
                placeholder="Tell others about yourself"
                className="rounded-xl min-h-[70px] resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone || ''}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dob" className="text-sm">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={profile.dateOfBirth || ''}
                  onChange={(e) => update('dateOfBirth', e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Info (read-only) */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Account Info</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> Account Created
              </span>
              <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                {formatDate(profile.createdAt)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Last Login
              </span>
              <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                {formatDate(profile.lastLogin)}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeInUp}>
        <Button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium"
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

// ─── Security Section ──────────────────────────────────────────────────────

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
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <h2 className="text-xl font-bold text-[#1F1F1F] dark:text-white mb-1">Security</h2>
        <p className="text-sm text-gray-500">Protect your account with password, 2FA, and session management</p>
      </motion.div>

      {/* Section Navigation */}
      <motion.div className="space-y-1" {...fadeInUp}>
        {([
          { key: 'password' as const, label: 'Change Password', icon: Lock },
          { key: 'sessions' as const, label: 'Active Sessions', icon: Smartphone },
          { key: 'login-history' as const, label: 'Login History', icon: Clock },
          { key: '2fa' as const, label: 'Two-Factor Authentication', icon: Shield },
        ]).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveSection(item.key)}
            className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors ${
              activeSection === item.key
                ? 'bg-[#D3E3FD] dark:bg-[#4285F4]/15 text-[#4285F4]'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900 text-[#1F1F1F] dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                activeSection === item.key
                  ? 'bg-[#4285F4]/10'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}>
                <item.icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {activeSection === item.key && (
                <Badge variant="secondary" className="text-[10px] px-1.5">Active</Badge>
              )}
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </button>
        ))}
      </motion.div>

      <Separator />

      <AnimatePresence mode="wait">
        {/* Change Password */}
        {activeSection === 'password' && (
          <motion.div key="password" {...tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Change Password</h3>
            <Card className="border-gray-200 dark:border-gray-800">
              <CardContent className="p-4 sm:p-6 space-y-4">
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
              </CardContent>
            </Card>
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

// ─── Appearance Section ─────────────────────────────────────────────────────

function AppearanceTabContent({
  emailDensity, setEmailDensity,
  previewLines, setPreviewLines,
  conversationView, setConversationView,
  theme, setTheme,
  dateFormat, setDateFormat,
  language, setLanguage,
  savingPrefs, handleSavePreferences,
}: {
  emailDensity: 'comfortable' | 'cozy' | 'compact'
  setEmailDensity: (v: 'comfortable' | 'cozy' | 'compact') => void
  previewLines: 'none' | '1' | '2' | '3'
  setPreviewLines: (v: 'none' | '1' | '2' | '3') => void
  conversationView: boolean
  setConversationView: (v: boolean) => void
  theme: string
  setTheme: (v: string) => void
  dateFormat: '12h' | '24h'
  setDateFormat: (v: '12h' | '24h') => void
  language: string
  setLanguage: (v: string) => void
  savingPrefs: boolean
  handleSavePreferences: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <h2 className="text-xl font-bold text-[#1F1F1F] dark:text-white mb-1">Appearance</h2>
        <p className="text-sm text-gray-500">Customize how your inbox looks and feels</p>
      </motion.div>

      {/* Theme */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Theme</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Sun className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Color Theme</p>
                  <p className="text-xs text-gray-500">Choose your preferred theme</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
                {([
                  { value: 'light', icon: Sun },
                  { value: 'dark', icon: Moon },
                  { value: 'system', icon: Monitor },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    className={`p-2 rounded-md transition-all ${
                      theme === opt.value
                        ? 'bg-white dark:bg-gray-800 shadow-sm text-[#4285F4]'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    aria-label={opt.value}
                  >
                    <opt.icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Email Density */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Email Display</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div>
              <Label className="text-sm font-medium text-[#1F1F1F] dark:text-white">Email Density</Label>
              <p className="text-xs text-gray-500 mt-0.5">Choose how compact emails appear in your inbox</p>
            </div>
            <RadioGroup value={emailDensity} onValueChange={(v) => setEmailDensity(v as typeof emailDensity)} className="space-y-2">
              {[
                { value: 'comfortable' as const, label: 'Comfortable', desc: 'More spacing, relaxed reading' },
                { value: 'cozy' as const, label: 'Cozy', desc: 'Balanced spacing' },
                { value: 'compact' as const, label: 'Compact', desc: 'More emails visible at once' },
              ].map((opt) => (
                <div key={opt.value} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                  <RadioGroupItem value={opt.value} id={`density-${opt.value}`} />
                  <Label htmlFor={`density-${opt.value}`} className="cursor-pointer flex-1">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-gray-500 ml-2">{opt.desc}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      </motion.div>

      {/* Message Preview Lines */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div>
              <Label className="text-sm font-medium text-[#1F1F1F] dark:text-white">Message Preview Lines</Label>
              <p className="text-xs text-gray-500 mt-0.5">How many lines of preview to show</p>
            </div>
            <RadioGroup value={previewLines} onValueChange={(v) => setPreviewLines(v as typeof previewLines)} className="flex gap-3">
              {(['none', '1', '2', '3'] as const).map((val) => (
                <div key={val} className="flex items-center space-x-2">
                  <RadioGroupItem value={val} id={`preview-${val}`} />
                  <Label htmlFor={`preview-${val}`} className="text-sm cursor-pointer">
                    {val === 'none' ? 'None' : val}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

      {/* Mail Behavior */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Mail Behavior</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Conversation View</p>
                  <p className="text-xs text-gray-500">Group emails as threads</p>
                </div>
              </div>
              <Switch checked={conversationView} onCheckedChange={setConversationView} className="data-[state=checked]:bg-[#4285F4]" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

      {/* Date Format */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Date & Time</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Time Format</p>
                  <p className="text-xs text-gray-500">12-hour or 24-hour clock</p>
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

      <Separator />

      {/* Language */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Language</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Languages className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Display Language</p>
                  <p className="text-xs text-gray-500">Choose your preferred language</p>
                </div>
              </div>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[160px] h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fa">Dari / دری</SelectItem>
                  <SelectItem value="ps">Pashto / پښتو</SelectItem>
                  <SelectItem value="ar">Arabic / العربية</SelectItem>
                  <SelectItem value="ur">Urdu / اردو</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save button */}
      <motion.div {...fadeInUp}>
        <Button
          onClick={handleSavePreferences}
          disabled={savingPrefs}
          className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium"
        >
          {savingPrefs ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Preferences</>}
        </Button>
      </motion.div>
    </div>
  )
}

// ─── Notification Settings (original sub-component) ─────────────────────────

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
    <div className="space-y-3">
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
    </div>
  )
}

// ─── Notifications Section ──────────────────────────────────────────────────

function NotificationsTabContent({
  desktopNotif, setDesktopNotif,
  soundNotif, setSoundNotif,
  readReceipts, setReadReceipts,
  savingPrefs, handleSavePreferences,
}: {
  desktopNotif: boolean
  setDesktopNotif: (v: boolean) => void
  soundNotif: boolean
  setSoundNotif: (v: boolean) => void
  readReceipts: boolean
  setReadReceipts: (v: boolean) => void
  savingPrefs: boolean
  handleSavePreferences: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <h2 className="text-xl font-bold text-[#1F1F1F] dark:text-white mb-1">Notifications</h2>
        <p className="text-sm text-gray-500">Control how and when you receive notifications</p>
      </motion.div>

      {/* Core notification settings (original NotificationSettings component) */}
      <motion.div {...fadeInUp}>
        <NotificationSettings
          desktopNotif={desktopNotif}
          setDesktopNotif={setDesktopNotif}
          soundNotif={soundNotif}
          setSoundNotif={setSoundNotif}
        />
      </motion.div>

      <Separator />

      {/* Read Receipts (new) */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Privacy</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Read Receipts</p>
                  <p className="text-xs text-gray-500">Let senders know when you&apos;ve read their emails</p>
                </div>
              </div>
              <Switch
                checked={readReceipts}
                onCheckedChange={setReadReceipts}
                className="data-[state=checked]:bg-[#4285F4]"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save button */}
      <motion.div {...fadeInUp}>
        <Button
          onClick={handleSavePreferences}
          disabled={savingPrefs}
          className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium"
        >
          {savingPrefs ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Preferences</>}
        </Button>
      </motion.div>
    </div>
  )
}

// ─── Compose Section ────────────────────────────────────────────────────────

function ComposeTabContent({
  signatureEditor, savingSignature, handleSaveSignature,
  undoSendTimeout, setUndoSendTimeout,
  defaultReplyMode, setDefaultReplyMode,
  autoAdvance, setAutoAdvance,
  savingPrefs, handleSavePreferences,
}: {
  signatureEditor: ReturnType<typeof useEditor> | null
  savingSignature: boolean
  handleSaveSignature: () => void
  undoSendTimeout: number
  setUndoSendTimeout: (v: number) => void
  defaultReplyMode: 'reply' | 'replyAll'
  setDefaultReplyMode: (v: 'reply' | 'replyAll') => void
  autoAdvance: boolean
  setAutoAdvance: (v: boolean) => void
  savingPrefs: boolean
  handleSavePreferences: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <h2 className="text-xl font-bold text-[#1F1F1F] dark:text-white mb-1">Compose</h2>
        <p className="text-sm text-gray-500">Configure your email composing preferences</p>
      </motion.div>

      {/* Signature */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Email Signature</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-0 space-y-0">
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
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
            <div className="p-3">
              <EditorContent editor={signatureEditor} />
            </div>
          </CardContent>
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

      <Separator />

      {/* Compose Preferences */}
      <motion.div className="space-y-3" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Sending Behavior</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            {/* Undo Send Timeout */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Undo2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Undo Send</p>
                  <p className="text-xs text-gray-500">Cancellation period after sending an email</p>
                </div>
              </div>
              <Select value={String(undoSendTimeout)} onValueChange={(v) => setUndoSendTimeout(Number(v))}>
                <SelectTrigger className="w-[100px] h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 sec</SelectItem>
                  <SelectItem value="10">10 sec</SelectItem>
                  <SelectItem value="15">15 sec</SelectItem>
                  <SelectItem value="30">30 sec</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Default Reply Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <Send className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Default Reply Mode</p>
                  <p className="text-xs text-gray-500">Choose whether Reply or Reply All is default</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setDefaultReplyMode('reply')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    defaultReplyMode === 'reply'
                      ? 'bg-white dark:bg-gray-800 shadow-sm text-[#4285F4]'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultReplyMode('replyAll')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    defaultReplyMode === 'replyAll'
                      ? 'bg-white dark:bg-gray-800 shadow-sm text-[#4285F4]'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Reply All
                </button>
              </div>
            </div>

            <Separator />

            {/* Auto-advance */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Auto-advance</p>
                  <p className="text-xs text-gray-500">Move to the next email after deleting or archiving</p>
                </div>
              </div>
              <Switch
                checked={autoAdvance}
                onCheckedChange={setAutoAdvance}
                className="data-[state=checked]:bg-[#4285F4]"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save button */}
      <motion.div {...fadeInUp}>
        <Button
          onClick={handleSavePreferences}
          disabled={savingPrefs}
          className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium"
        >
          {savingPrefs ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Preferences</>}
        </Button>
      </motion.div>
    </div>
  )
}

// ─── Account Section ────────────────────────────────────────────────────────

function AccountTabContent({
  exporting, handleExport,
  vacationEnabled, setVacationEnabled,
  vacationSubject, setVacationSubject,
  vacationMessage, setVacationMessage,
  vacationStartDate, setVacationStartDate,
  vacationEndDate, setVacationEndDate,
  savingVacation, handleSaveVacation,
}: {
  exporting: boolean
  handleExport: (format: 'json' | 'csv') => void
  vacationEnabled: boolean
  setVacationEnabled: (v: boolean) => void
  vacationSubject: string
  setVacationSubject: (v: string) => void
  vacationMessage: string
  setVacationMessage: (v: string) => void
  vacationStartDate: string
  setVacationStartDate: (v: string) => void
  vacationEndDate: string
  setVacationEndDate: (v: string) => void
  savingVacation: boolean
  handleSaveVacation: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <h2 className="text-xl font-bold text-[#1F1F1F] dark:text-white mb-1">Account</h2>
        <p className="text-sm text-gray-500">Manage data export, vacation responder, and account settings</p>
      </motion.div>

      {/* Export Data */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Export Data</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Download Your Data</p>
                <p className="text-xs text-gray-500 mt-0.5">Export all your emails, contacts, folders, and settings</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleExport('json')}
                disabled={exporting}
                className="flex-1 h-10 rounded-xl"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={exporting}
                className="flex-1 h-10 rounded-xl"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

      {/* Vacation Responder */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Vacation Responder</h3>
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="p-4 sm:p-6 space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Vacation Auto-Reply</p>
                  <p className="text-xs text-gray-500">Automatically reply to emails while you&apos;re away</p>
                </div>
              </div>
              <Switch
                checked={vacationEnabled}
                onCheckedChange={setVacationEnabled}
                className="data-[state=checked]:bg-[#4285F4]"
              />
            </div>

            {vacationEnabled && (
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="space-y-1.5">
                  <Label htmlFor="vacationSubject" className="text-sm">Subject</Label>
                  <Input
                    id="vacationSubject"
                    value={vacationSubject}
                    onChange={(e) => setVacationSubject(e.target.value)}
                    placeholder="Out of Office: [Your Name]"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vacationMessage" className="text-sm">Message</Label>
                  <Textarea
                    id="vacationMessage"
                    value={vacationMessage}
                    onChange={(e) => setVacationMessage(e.target.value)}
                    placeholder="Hi, I'm currently out of the office and will respond when I return."
                    className="rounded-xl min-h-[100px] resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="vacationStart" className="text-sm">Start Date</Label>
                    <Input
                      id="vacationStart"
                      type="date"
                      value={vacationStartDate}
                      onChange={(e) => setVacationStartDate(e.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vacationEnd" className="text-sm">End Date</Label>
                    <Input
                      id="vacationEnd"
                      type="date"
                      value={vacationEndDate}
                      onChange={(e) => setVacationEndDate(e.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSaveVacation}
                  disabled={savingVacation}
                  className="w-full h-10 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium"
                >
                  {savingVacation ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Vacation Settings</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

      {/* Danger Zone */}
      <motion.div className="space-y-4" {...fadeInUp}>
        <h3 className="text-sm font-semibold text-[#EA4335] uppercase tracking-wider">Danger Zone</h3>
        <Card className="border-[#EA4335]/30 bg-[#EA4335]/5">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#EA4335]/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-[#EA4335]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Delete Account</p>
                <p className="text-xs text-gray-500 mt-0.5">Permanently delete your account and all associated data. This action cannot be undone.</p>
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
