'use client'

import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Lock, Shield, Bell, Sun, Pen, Globe, Filter,
  HelpCircle, Info, FileText, ChevronRight, LogOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/use-app-store'

interface ProfileMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface MenuItem {
  icon: React.ElementType
  label: string
  action: () => void
}

export function ProfileMenu({ open, onOpenChange }: ProfileMenuProps) {
  const { user, setSettingsView, setAdminView, logout } = useAppStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onOpenChange])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase()
    : 'U'

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      toast.success('Logged out')
      logout()
    } catch {
      toast.error('Failed to log out')
    }
    onOpenChange(false)
  }

  const closeAnd = (action: () => void) => () => {
    action()
    onOpenChange(false)
  }

  const settingsItems: MenuItem[] = [
    { icon: User, label: 'Profile', action: closeAnd(() => setSettingsView('profile')) },
    { icon: Lock, label: 'Password', action: closeAnd(() => setSettingsView('settings')) },
    { icon: Shield, label: 'Security', action: closeAnd(() => setSettingsView('settings')) },
    { icon: Bell, label: 'Notifications', action: closeAnd(() => setSettingsView('settings')) },
    { icon: Sun, label: 'Appearance', action: closeAnd(() => setSettingsView('settings')) },
    { icon: Pen, label: 'Signature', action: closeAnd(() => setSettingsView('settings')) },
    { icon: Globe, label: 'Language', action: closeAnd(() => setSettingsView('settings')) },
    { icon: Filter, label: 'Filters & Rules', action: closeAnd(() => setSettingsView('settings')) },
  ]

  const moreItems: MenuItem[] = [
    { icon: HelpCircle, label: 'Help & Support', action: closeAnd(() => {}) },
    { icon: Info, label: 'About EzyMail', action: closeAnd(() => {}) },
    { icon: FileText, label: 'Privacy Policy', action: closeAnd(() => {}) },
  ]

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50"
          style={{ pointerEvents: open ? 'auto' : 'none' }}
        >
          {/* Invisible backdrop to catch clicks */}
          <div className="absolute inset-0" />

          {/* Menu panel — anchored top-right */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-2 top-14 w-[280px] sm:w-[320px] bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg shadow-black/10 overflow-hidden"
            style={{ pointerEvents: 'auto' }}
          >
            {/* ── 1. Profile Card ── */}
            <button
              onClick={closeAnd(() => setSettingsView('profile'))}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="bg-[#D3E3FD] text-[#4285F4] text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.email}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            </button>

            <Separator />

            {/* ── 2. Settings Section ── */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Settings
              </p>
            </div>
            <div className="px-2 pb-1">
              {settingsItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left">
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>

            <Separator />

            {/* ── 3. More Section ── */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                More
              </p>
            </div>
            <div className="px-2 pb-1">
              {moreItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left">
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>

            {/* ── 4. Admin ── */}
            {user?.role === 'admin' && (
              <>
                <Separator />
                <div className="px-2 py-1">
                  <button
                    onClick={closeAnd(() => setAdminView('dashboard'))}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </span>
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 text-left">
                      Admin Panel
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                </div>
              </>
            )}

            <Separator />

            {/* ── 5. Sign Out ── */}
            <div className="px-2 py-2">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer transition-colors text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
