'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Mail,
  Users,
  UserPlus,
  Megaphone,
  Settings,
  Building2,
  AlertTriangle,
  Clock,
  X,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { useAppStore } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/* ─── Types ─── */

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
  id: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'email', label: 'Email', icon: <Mail className="w-5 h-5" /> },
  { id: 'team', label: 'Team', icon: <Users className="w-5 h-5" /> },
  { id: 'customers', label: 'Customers', icon: <UserPlus className="w-5 h-5" /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
]

/* ─── Subscription Badge Color ─── */

function getSubscriptionBadge(status: string | null | undefined) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-[10px] px-1.5 py-0 hover:bg-[#34A853]/20">
          Active
        </Badge>
      )
    case 'trial':
      return (
        <Badge className="bg-[#FBBC05]/10 text-[#FBBC05] border-[#FBBC05]/20 text-[10px] px-1.5 py-0 hover:bg-[#FBBC05]/20">
          Trial
        </Badge>
      )
    case 'expired':
      return (
        <Badge className="bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/20 text-[10px] px-1.5 py-0 hover:bg-[#EA4335]/20">
          Expired
        </Badge>
      )
    case 'pending_verification':
      return (
        <Badge className="bg-[#FBBC05]/10 text-[#FBBC05] border-[#FBBC05]/20 text-[10px] px-1.5 py-0 hover:bg-[#FBBC05]/20">
          Pending
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          None
        </Badge>
      )
  }
}

/* ─── Subscription Banner ─── */

function SubscriptionBanner({ status, trialEnd }: { status: string | null; trialEnd: string | null }) {
  if (status === 'active') return null

  const bannerConfig: Record<string, { message: string; color: string; icon: React.ReactNode }> = {
    trial: {
      message: `Your trial period ends on ${trialEnd ? new Date(trialEnd).toLocaleDateString() : 'soon'}. Upgrade to keep all features.`,
      color: 'bg-[#FBBC05]/10 border-[#FBBC05]/30 text-[#FBBC05]',
      icon: <Clock className="w-4 h-4" />,
    },
    expired: {
      message: 'Your subscription has expired. Upgrade now to restore full access to all features.',
      color: 'bg-[#EA4335]/10 border-[#EA4335]/30 text-[#EA4335]',
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    pending_verification: {
      message: 'Your account is pending verification. Some features may be limited until verified.',
      color: 'bg-[#FBBC05]/10 border-[#FBBC05]/30 text-[#FBBC05]',
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

/* ─── Props ─── */

interface BusinessLayoutProps {
  children: React.ReactNode
  activeTab: string
  onTabChange: (tab: string) => void
}

/* ─── Main Layout ─── */

export function BusinessLayout({ children, activeTab, onTabChange }: BusinessLayoutProps) {
  const { user } = useAppStore()
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
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
    }
    fetchProfile()
  }, [])

  const displayName = profile?.businessName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Business'
  const displayEmail = profile?.businessEmail || user?.email || ''
  const subscriptionStatus = profile?.subscriptionStatus || null

  return (
    <div className="fixed inset-0 z-50 flex min-w-[1024px]">
      {/* ─── Sidebar ─── */}
      <aside className="w-64 bg-gray-900 dark:bg-gray-900 flex flex-col h-full shrink-0">
        {/* Logo Area */}
        <div className="px-5 py-5 border-b border-gray-800">
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
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gray-800 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
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
            <div className="px-3 py-2.5 rounded-xl bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#4285F4] flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-gray-400 truncate">{displayEmail}</p>
                </div>
              </div>
              <div className="mt-2">
                {getSubscriptionBadge(subscriptionStatus)}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 bg-gray-50 dark:bg-gray-950 overflow-y-auto custom-scrollbar">
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

        {/* Page Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
