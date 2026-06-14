'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface NavItem {
  id: BusinessView
  label: string
  icon: React.ReactNode
}

/* ─── Navigation Items ─── */

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'email', label: 'Email', icon: <Mail className="w-5 h-5" /> },
  { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" /> },
  { id: 'customers', label: 'Customers', icon: <UserPlus className="w-5 h-5" /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'verification', label: 'Verification', icon: <ShieldCheck className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
]

/* ─── Subscription Badge ─── */

function SubscriptionBadge({ status }: { status: string | null | undefined }) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#34A853]/10 text-[#34A853]">
          Active
        </span>
      )
    case 'trial':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FBBC04]/10 text-[#FBBC04]">
          Trial
        </span>
      )
    case 'expired':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EA4335]/10 text-[#EA4335]">
          Expired
        </span>
      )
    case 'pending_verification':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FBBC04]/10 text-[#FBBC04]">
          Pending
        </span>
      )
    default:
      return null
  }
}

/* ─── Subscription Banner ─── */

function SubscriptionBanner({ status, trialEnd }: { status: string | null; trialEnd: string | null }) {
  if (status === 'active') return null

  const bannerConfig: Record<string, { message: string; color: string; icon: React.ReactNode }> = {
    trial: {
      message: `Your trial period ends on ${trialEnd ? new Date(trialEnd).toLocaleDateString() : 'soon'}. Upgrade to keep all features.`,
      color: 'bg-[#FBBC04]/10 border-[#FBBC04]/30 text-[#FBBC05]',
      icon: <Clock className="w-4 h-4" />,
    },
    expired: {
      message: 'Your subscription has expired. Upgrade now to restore full access to all features.',
      color: 'bg-[#EA4335]/10 border-[#EA4335]/30 text-[#EA4335]',
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    pending_verification: {
      message: 'Your account is pending verification. Some features may be limited until verified.',
      color: 'bg-[#FBBC04]/10 border-[#FBBC04]/30 text-[#FBBC05]',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
  }

  const config = bannerConfig[status || '']
  if (!config) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm ${config.color}`}
    >
      {config.icon}
      <span className="flex-1">{config.message}</span>
    </motion.div>
  )
}

/* ─── Mobile Message ─── */

function MobileMessage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-sm"
      >
        <div className="w-20 h-20 rounded-2xl bg-[#4285F4]/10 flex items-center justify-center mx-auto mb-6">
          <Monitor className="w-10 h-10 text-[#4285F4]" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Desktop Required
        </h2>
        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
          The EzyMail Business Dashboard is designed for desktop use. 
          Please switch to a device with a screen width of at least 1024px for the best experience.
        </p>
      </motion.div>
    </div>
  )
}

/* ─── Main Business App ─── */

export function BusinessApp() {
  const { user, logout } = useAppStore()
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
    } catch (err) {
      console.error('Failed to fetch business profile:', err)
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const displayName = profile?.businessName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Business'
  const displayEmail = profile?.businessEmail || user?.email || ''
  const subscriptionStatus = profile?.subscriptionStatus || null

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* silent */
    }
    useAppStore.getState().logout()
    setLoggingOut(false)
  }

  function renderActivePage() {
    switch (activeView) {
      case 'dashboard':
        return <BusinessDashboard />
      case 'email':
        return <BusinessEmail />
      case 'team':
        return <BusinessTeam />
      case 'customers':
        return <BusinessCustomers />
      case 'campaigns':
        return <BusinessCampaigns />
      case 'analytics':
        return <BusinessAnalytics />
      case 'verification':
        return <BusinessVerification />
      case 'settings':
        return <BusinessSettings />
      default:
        return <BusinessDashboard />
    }
  }

  return (
    <>
      {/* ─── Mobile: Show message ─── */}
      <div className="lg:hidden">
        <MobileMessage />
      </div>

      {/* ─── Desktop: Full layout ─── */}
      <div className="hidden lg:flex fixed inset-0 z-50">
        {/* ─── Sidebar ─── */}
        <aside className="w-60 bg-gray-900 dark:bg-gray-950 flex flex-col h-full shrink-0">
          {/* Logo Area */}
          <div className="px-4 py-5 border-b border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#4285F4] flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-semibold text-white truncate">EzyMail</h1>
                <p className="text-[11px] text-gray-400 truncate">Business Portal</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 text-gray-500" />}
                </button>
              )
            })}
          </nav>

          {/* User Info */}
          <div className="px-3 pb-4 border-t border-gray-800 pt-4">
            {loadingProfile ? (
              <div className="space-y-2 px-1">
                <div className="h-3 bg-gray-800 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-800 rounded animate-pulse w-1/2" />
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#4285F4] flex items-center justify-center shrink-0">
                    {profile?.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={displayName}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-xs font-semibold">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{displayName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{displayEmail}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <SubscriptionBadge status={subscriptionStatus} />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ─── Main Content ─── */}
        <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden min-w-0">
          {/* ─── Top Header ─── */}
          <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                {navItems.find((item) => item.id === activeView)?.label || 'Dashboard'}
              </h2>
              {subscriptionStatus && (
                <SubscriptionBadge status={subscriptionStatus} />
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#4285F4] flex items-center justify-center">
                  {profile?.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={displayName}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-[10px] font-semibold">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 max-w-[160px] truncate">
                  {displayName}
                </span>
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl py-1"
                    >
                      {/* User Info Header */}
                      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {displayName}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">{displayEmail}</p>
                      </div>

                      {/* Menu Items */}
                      <button
                        onClick={() => {
                          setActiveView('settings')
                          setShowUserMenu(false)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>

                      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                      <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#EA4335] hover:bg-[#EA4335]/5 transition-colors"
                      >
                        {loggingOut ? (
                          <div className="w-4 h-4 border-2 border-[#EA4335] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <LogOut className="w-4 h-4" />
                        )}
                        Logout
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </header>

          {/* ─── Page Content ─── */}
          <div className="flex-1 overflow-y-auto">
            {/* Subscription Banner */}
            <div className="px-6 pt-4">
              <AnimatePresence>
                {subscriptionStatus && (
                  <SubscriptionBanner
                    status={subscriptionStatus}
                    trialEnd={profile?.trialEnd || null}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Content Area */}
            <div className="p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  {renderActivePage()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
