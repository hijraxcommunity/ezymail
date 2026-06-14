'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Lock,
  ShieldCheck,
  Loader2,
  Send,
  Inbox,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'
import { Badge } from '@/components/ui/badge'

/* ─── Types ─── */

interface BusinessProfile {
  subscriptionStatus: string | null
  businessName: string | null
  businessEmail: string | null
}

/* ─── Loading Skeleton ─── */

function EmailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
      <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
    </div>
  )
}

/* ─── Disabled State ─── */

function EmailDisabledState({ status }: { status: string }) {
  const messageMap: Record<string, { title: string; description: string }> = {
    expired: {
      title: 'Subscription Expired',
      description: 'Your subscription has expired. Please renew to send and receive business emails.',
    },
    pending_verification: {
      title: 'Verification Pending',
      description: 'Your business account is pending verification. Email access will be available once verified.',
    },
    trial: {
      title: 'Trial Period',
      description: 'You are currently on a trial. Some advanced email features may be limited.',
    },
  }

  const config = messageMap[status] || {
    title: 'Subscription Required',
    description: 'Subscribe to a plan to send and receive business emails.',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
    >
      <div className="p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#EA4335]/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-[#EA4335]" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {config.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
          {config.description}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-xs px-2 py-0.5">
            {status.replace('_', ' ')}
          </Badge>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Coming Soon State ─── */

function EmailComingSoon() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Info Banner */}
      <div className="rounded-xl shadow-sm border border-[#4285F4]/20 bg-[#4285F4]/5 p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-4 h-4 text-[#4285F4]" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-[#4285F4]">Business Email is Coming Soon</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            We&apos;re building a powerful business email experience with shared inboxes, 
            team collaboration, and advanced analytics. Stay tuned!
          </p>
        </div>
      </div>

      {/* Feature Preview Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 flex items-center justify-center mb-3">
            <Inbox className="w-5 h-5 text-[#4285F4]" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Shared Inbox</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Manage emails collaboratively with your team
          </p>
        </div>
        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-[#34A853]/10 flex items-center justify-center mb-3">
            <Send className="w-5 h-5 text-[#34A853]" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Smart Compose</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            AI-powered email templates and suggestions
          </p>
        </div>
        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-[#FBBC05]/10 flex items-center justify-center mb-3">
            <ShieldCheck className="w-5 h-5 text-[#FBBC05]" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Advanced Security</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Enterprise-grade encryption and compliance
          </p>
        </div>
      </div>

      {/* Placeholder Email Interface */}
      <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <Mail className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">Inbox</span>
          <Badge variant="secondary" className="text-[10px]">Preview</Badge>
        </div>
        <div className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your inbox will appear here once the feature launches
          </p>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Main Component ─── */

export function BusinessEmail() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/business/profile')
        if (res.ok) {
          const data = await res.json()
          setProfile(data.user)
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  if (loading) return <EmailSkeleton />

  const isActive = profile?.subscriptionStatus === 'active'

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Business Email</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your business email communications
        </p>
      </div>

      {/* ─── Content ─── */}
      {isActive ? <EmailComingSoon /> : <EmailDisabledState status={profile?.subscriptionStatus || 'none'} />}
    </div>
  )
}
