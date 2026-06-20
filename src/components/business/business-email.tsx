'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Lock,
  ShieldCheck,
  Send,
  Inbox,
  Zap,
  Users,
  BarChart3,
  Sparkles,
  Clock,
  Reply,
  Tag,
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
    <div className="space-y-8">
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
      <div className="h-64 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
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
      className="rounded-2xl ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
    >
      <div className="p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#EA4335]/10 to-[#EA4335]/5 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-8 h-8 text-[#EA4335]" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          {config.title}
        </h3>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-5 leading-relaxed">
          {config.description}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-xs px-2.5 py-0.5">
            {status.replace('_', ' ')}
          </Badge>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Coming Soon State ─── */

function EmailComingSoon() {
  const featureCards = [
    {
      icon: <Inbox className="w-5 h-5" />,
      title: 'Shared Inbox',
      description: 'Manage emails collaboratively with your team. Assign, track, and resolve conversations together.',
      color: '#4285F4',
      gradient: 'from-[#4285F4]/8 to-transparent',
      ring: 'ring-[#4285F4]/10',
    },
    {
      icon: <Send className="w-5 h-5" />,
      title: 'Smart Compose',
      description: 'AI-powered email templates and suggestions to help you write better emails faster.',
      color: '#34A853',
      gradient: 'from-[#34A853]/8 to-transparent',
      ring: 'ring-[#34A853]/10',
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: 'Advanced Security',
      description: 'Enterprise-grade encryption, DKIM/SPF/DMARC, and compliance features built in.',
      color: '#FBBC04',
      gradient: 'from-[#FBBC04]/8 to-transparent',
      ring: 'ring-[#FBBC04]/10',
    },
    {
      icon: <Reply className="w-5 h-5" />,
      title: 'Threaded Replies',
      description: 'Keep conversations organized with threaded email views and smart grouping.',
      color: '#8AB4F8',
      gradient: 'from-[#8AB4F8]/8 to-transparent',
      ring: 'ring-[#8AB4F8]/10',
    },
    {
      icon: <Tag className="w-5 h-5" />,
      title: 'Smart Labels',
      description: 'Automatically categorize and label emails with customizable rules and filters.',
      color: '#F97316',
      gradient: 'from-[#F97316]/8 to-transparent',
      ring: 'ring-[#F97316]/10',
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: 'Email Analytics',
      description: 'Track response times, email volume, and team productivity metrics.',
      color: '#EC4899',
      gradient: 'from-[#EC4899]/8 to-transparent',
      ring: 'ring-[#EC4899]/10',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-2xl ring-1 ring-[#4285F4]/20 bg-gradient-to-r from-[#4285F4]/8 to-[#6366F1]/5 p-6"
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-[#4285F4]/5" />
        <div className="relative z-10 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#4285F4]/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-[#4285F4]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#4285F4]">Business Email is Coming Soon</h4>
            <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
              We&apos;re building a powerful business email experience with shared inboxes, 
              team collaboration, and advanced analytics. Stay tuned for launch updates!
            </p>
          </div>
        </div>
      </motion.div>

      {/* Feature Preview Cards */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">What&apos;s Coming</h3>
        <div className="grid grid-cols-3 gap-4">
          {featureCards.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + index * 0.05 }}
              className={`rounded-2xl ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} pointer-events-none`} />
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${feature.color}12`, color: feature.color }}>
                  {feature.icon}
                </div>
                <h4 className="text-[13px] font-semibold text-gray-900 dark:text-white">{feature.title}</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Placeholder Email Interface */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-2xl ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 bg-gray-50/50 dark:bg-gray-800/20">
          <Mail className="w-5 h-5 text-gray-400" />
          <span className="text-[13px] font-semibold text-gray-900 dark:text-white">Inbox</span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Preview</Badge>
        </div>
        <div className="p-16 text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            {/* Decorative rings */}
            <div className="absolute inset-0 rounded-full bg-[#4285F4]/5 animate-pulse" />
            <div className="absolute inset-3 rounded-full bg-[#4285F4]/8" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4285F4]/10 to-[#6366F1]/10 flex items-center justify-center">
                <Mail className="w-7 h-7 text-[#4285F4]" />
              </div>
            </div>
          </div>
          <p className="text-[13px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Your inbox will appear here
          </p>
          <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
            Once the feature launches, you&apos;ll be able to send and receive business emails from this interface with full team collaboration.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Coming soon &middot; Join the waitlist for early access</span>
          </div>
        </div>
      </motion.div>
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
    <div className="space-y-8">
      {/* ─── Page Header ─── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Business Email</h2>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
          Manage your business email communications
        </p>
      </div>

      {/* ─── Content ─── */}
      {isActive ? <EmailComingSoon /> : <EmailDisabledState status={profile?.subscriptionStatus || 'none'} />}
    </div>
  )
}