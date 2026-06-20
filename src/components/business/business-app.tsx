'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Mail,
  Users,
  UserPlus,
  Megaphone,
  Settings,
  BarChart3,
  ShieldCheck,
  Building2,
  LogOut,
  ChevronRight,
  AlertTriangle,
  Clock,
  Monitor,
  PanelLeftClose,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'
import { BusinessDashboard } from './business-dashboard'
import { BusinessEmail } from './business-email'
import { BusinessTeam } from './business-team'
import { BusinessCustomers } from './business-customers'
import { BusinessCampaigns } from './business-campaigns'
import { BusinessAnalytics } from './business-analytics'
import { BusinessSettings } from './business-settings'
import { BusinessVerification } from './business-verification'

/* ─── Types ─── */

export type BusinessView =
  | 'dashboard'
  | 'email'
  | 'team'
  | 'customers'
  | 'campaigns'
  | 'analytics'
  | 'settings'
  | 'verification'

interface BusinessProfile {
  id: string
  email: string
  businessEmail: string | null
  firstName: string
  lastName: string
  phone: string | null
  businessName: string | null
  accountType: string
  employeeCount: string | null
  subscriptionStatus: string | null
  trialStart: string | null
  trialEnd: string | null
  createdAt: string
  avatar: string | null
}

/* ─── Navigation Items ─── */

const navItems: { id: BusinessView; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'customers', label: 'Customers', icon: UserPlus },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
]

/* ─── Subscription Badge ─── */

function SubscriptionBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null
  const config: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' },
    trial: { label: 'Trial', className: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
    expired: { label: 'Expired', className: 'bg-red-500/15 text-red-400 border border-red-500/20' },
    pending_verification: { label: 'Pending', className: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
  }
  const c = config[status]
  if (!c) return null
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.className}`}>
      {c.label}
    </span>
  )
}

/* ─── Subscription Banner ─── */

function SubscriptionBanner({ status, trialEnd }: { status: string | null; trialEnd: string | null }) {
  if (status === 'active') return null
  const configs: Record<string, { message: string; gradient: string; icon: React.ReactNode }> = {
    trial: {
      message: `Trial ends on ${trialEnd ? new Date(trialEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'soon'}. Upgrade to keep all features.`,
      gradient: 'bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/5',
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    },
    expired: {
      message: 'Your subscription has expired. Upgrade now to restore full access.',
      gradient: 'bg-gradient-to-r from-red-500/10 via-rose-500/10 to-red-500/5',
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
    },
    pending_verification: {
      message: 'Account pending verification. Some features may be limited.',
      gradient: 'bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/5',
      icon: <ShieldCheck className="w-4 h-4 text-amber-500" />,
    },
  }
  const config = configs[status || '']
  if (!config) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border border-amber-500/20 text-sm ${config.gradient}`}
    >
      {config.icon}
      <span className="flex-1 text-gray-700 dark:text-gray-200">{config.message}</span>
    </motion.div>
  )
}

/* ─── Mobile Message ─── */

function MobileMessage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50 p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#4285F4] to-[#6366F1] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#4285F4]/25">
          <Monitor className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Desktop Required</h2>
        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
          The EzyMail Business Dashboard is designed for desktop use.
          Please switch to a device with a screen width of at least 1024px.
        </p>
      </div>
    </div>
  )
}

/* ─── Main Business App ─── */

export function BusinessApp() {
  const { user } = useAppStore()
  const [activeView, setActiveView] = useState<BusinessView>('dashboard')
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/business/profile')
      if (res.ok) {
        const data = await res.json()
        setProfile(data.user)
      }
    } catch {
      /* silent */
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const displayName = profile?.businessName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Business'
  const displayEmail = profile?.businessEmail || user?.email || ''
  const subscriptionStatus = profile?.subscriptionStatus || null
  const initials = displayName.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase()

  async function handleLogout() {
    setLoggingOut(true)
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* silent */ }
    useAppStore.getState().logout()
  }

  return (
    <>
      <div className="lg:hidden"><MobileMessage /></div>

      <div className="hidden lg:flex fixed inset-0 z-50">
        {/* ─── Sidebar ─── */}
        <aside className="w-[260px] bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col h-full shrink-0 border-r border-gray-800/50">
          {/* Accent line */}
          <div className="h-0.5 bg-gradient-to-r from-[#4285F4] via-[#6366F1] to-transparent" />

          {/* Logo */}
          <div className="px-5 py-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4285F4] to-[#6366F1] flex items-center justify-center shadow-md shadow-[#4285F4]/20">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold text-white tracking-tight">EzyMail</h1>
                <p className="text-[11px] text-gray-500 font-medium">Business Portal</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = activeView === item.id
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  title={item.label}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-[#4285F4]/20 to-[#6366F1]/10 text-white shadow-sm shadow-[#4285F4]/5'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-[18px] h-[18px] transition-colors ${isActive ? 'text-[#8AB4F8]' : 'text-gray-500 group-hover:text-gray-400'}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />}
                </button>
              )
            })}
          </nav>

          {/* User Info */}
          <div className="px-3 pb-4 border-t border-gray-800/60 pt-4">
            {loadingProfile ? (
              <div className="space-y-2 px-2">
                <div className="h-3.5 bg-gray-800 rounded-full animate-pulse w-3/4" />
                <div className="h-3 bg-gray-800 rounded-full animate-pulse w-1/2" />
              </div>
            ) : (
              <div className="px-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4285F4] to-[#6366F1] flex items-center justify-center shrink-0 shadow-sm">
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt={displayName} className="w-9 h-9 rounded-xl object-cover" />
                    ) : (
                      <span className="text-white text-xs font-bold">{initials}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                    <p className="text-[11px] text-gray-500 truncate">{displayEmail}</p>
                  </div>
                </div>
                {subscriptionStatus && (
                  <div className="mt-2.5"><SubscriptionBadge status={subscriptionStatus} /></div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ─── Main Content ─── */}
        <main className="flex-1 flex flex-col bg-gray-50/50 dark:bg-[#0d0f13] overflow-hidden min-w-0">
          {/* ─── Header ─── */}
          <header className="h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800/60 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                {navItems.map((item) => {
                  if (item.id !== activeView) return null
                  const Icon = item.icon
                  return (
                    <React.Fragment key={item.id}>
                      <Icon className="w-4 h-4 text-[#4285F4]" />
                      <span className="font-semibold text-gray-900 dark:text-white">{item.label}</span>
                    </React.Fragment>
                  )
                })}
              </div>
              {subscriptionStatus && <SubscriptionBadge status={subscriptionStatus} />}
            </div>

            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4285F4] to-[#6366F1] flex items-center justify-center shadow-sm">
                  {profile?.avatar ? (
                    <img src={profile.avatar} alt={displayName} className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <span className="text-white text-[11px] font-bold">{initials}</span>
                  )}
                </div>
                <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{displayName}</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 -rotate-90" />
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 z-50 w-60 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700 shadow-xl shadow-black/5 py-2"
                    >
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{displayEmail}</p>
                      </div>
                      <div className="p-1.5">
                        <button
                          onClick={() => { setActiveView('settings'); setShowUserMenu(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </button>
                      </div>
                      <div className="border-t border-gray-100 dark:border-gray-800 mx-3" />
                      <div className="p-1.5">
                        <button
                          onClick={handleLogout}
                          disabled={loggingOut}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          {loggingOut ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <LogOut className="w-4 h-4" />}
                          {loggingOut ? 'Signing out...' : 'Sign Out'}
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </header>

          {/* ─── Content ─── */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 pt-5">
              <AnimatePresence>{subscriptionStatus && <SubscriptionBanner status={subscriptionStatus} trialEnd={profile?.trialEnd || null} />}</AnimatePresence>
            </div>
            <div className="px-6 pb-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {activeView === 'dashboard' && <BusinessDashboard />}
                  {activeView === 'email' && <BusinessEmail />}
                  {activeView === 'team' && <BusinessTeam />}
                  {activeView === 'customers' && <BusinessCustomers />}
                  {activeView === 'campaigns' && <BusinessCampaigns />}
                  {activeView === 'analytics' && <BusinessAnalytics />}
                  {activeView === 'verification' && <BusinessVerification />}
                  {activeView === 'settings' && <BusinessSettings />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
