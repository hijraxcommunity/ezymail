'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Mail, Users, Megaphone, Eye, MousePointerClick,
  ArrowUpRight, ArrowDownLeft, Send, TrendingUp,
  UserCheck, UserPlus, Sparkles, Clock, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

interface Analytics {
  totalEmailsSent: number
  totalEmailsReceived: number
  totalCustomers: number
  totalCampaigns: number
  totalOpens: number
  totalClicks: number
  openRate: number
  clickRate: number
  teamMemberCount: number
  recentActivity: RecentActivityItem[]
}

interface RecentActivityItem {
  id: string
  subject: string
  type: 'sent' | 'received'
  isRead: boolean
  folder: string
  createdAt: string
}

interface BusinessProfile {
  businessName: string | null
  email: string
  firstName: string
  lastName: string
}

const COLORS = ['#4285F4', '#34A853', '#FBBC04', '#EA4335', '#8AB4F8', '#F97316', '#EC4899', '#06B6D4']

const statCards = [
  { key: 'totalEmailsSent' as const, label: 'Emails Sent', icon: Send, color: '#4285F4', gradient: 'from-blue-500/10 to-blue-600/5' },
  { key: 'totalEmailsReceived' as const, label: 'Emails Received', icon: Mail, color: '#34A853', gradient: 'from-emerald-500/10 to-emerald-600/5' },
  { key: 'totalCustomers' as const, label: 'Total Customers', icon: Users, color: '#FBBC04', gradient: 'from-amber-500/10 to-amber-600/5' },
  { key: 'totalCampaigns' as const, label: 'Campaigns', icon: Megaphone, color: '#EA4335', gradient: 'from-red-500/10 to-red-600/5' },
  { key: 'openRate' as const, label: 'Open Rate', icon: Eye, color: '#8AB4F8', gradient: 'from-sky-500/10 to-sky-600/5', suffix: '%' },
  { key: 'clickRate' as const, label: 'Click Rate', icon: MousePointerClick, color: '#F97316', gradient: 'from-orange-500/10 to-orange-600/5', suffix: '%' },
  { key: 'totalOpens' as const, label: 'Total Opens', icon: Eye, color: '#06B6D4', gradient: 'from-cyan-500/10 to-cyan-600/5' },
  { key: 'teamMemberCount' as const, label: 'Team Members', icon: UserCheck, color: '#EC4899', gradient: 'from-pink-500/10 to-pink-600/5' },
]

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-32 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      <div className="grid grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-80 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export function BusinessDashboard() {
  const { user } = useAppStore()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [analyticsRes, profileRes] = await Promise.all([
          fetch('/api/business/analytics'),
          fetch('/api/business/profile'),
        ])
        if (analyticsRes.ok) { const d = await analyticsRes.json(); setAnalytics(d.analytics) }
        if (profileRes.ok) { const d = await profileRes.json(); setProfile(d.user) }
      } catch { console.error('Failed to fetch dashboard') } finally { setLoading(false) }
    }
    fetchData()
  }, [])

  const businessName = profile?.businessName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Business'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const emailChart = analytics ? [
    { name: 'Sent', value: analytics.totalEmailsSent },
    { name: 'Received', value: analytics.totalEmailsReceived },
    { name: 'Opens', value: analytics.totalOpens },
    { name: 'Clicks', value: analytics.totalClicks },
  ] : []

  const campaignChart = analytics ? [
    { name: 'Customers', value: analytics.totalCustomers },
    { name: 'Opens', value: analytics.totalOpens },
    { name: 'Clicks', value: analytics.totalClicks },
  ] : []

  const engagementPie = analytics ? [
    { name: 'Opened', value: analytics.totalOpens || 0 },
    { name: 'Clicked', value: analytics.totalClicks || 0 },
    { name: 'No Response', value: Math.max(0, analytics.totalCampaigns * 10 - analytics.totalOpens - analytics.totalClicks) || 0 },
  ] : []

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-8">
      {/* ─── Hero Welcome ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4285F4] via-[#5B6CF7] to-[#6366F1] p-8 text-white">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-white/80" />
            <span className="text-[13px] font-medium text-white/80">{today}</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Welcome back, {businessName}!</h2>
          <p className="text-sm text-white/70 mt-2 max-w-lg">Here&apos;s an overview of your business email performance and key metrics.</p>
          <div className="flex gap-6 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/10">
              <p className="text-2xl font-bold">{analytics?.totalEmailsSent ?? 0}</p>
              <p className="text-[11px] text-white/60 mt-0.5">Emails Sent</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/10">
              <p className="text-2xl font-bold">{analytics?.totalEmailsReceived ?? 0}</p>
              <p className="text-[11px] text-white/60 mt-0.5">Emails Received</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/10">
              <p className="text-2xl font-bold">{analytics?.totalCustomers ?? 0}</p>
              <p className="text-[11px] text-white/60 mt-0.5">Customers</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/10">
              <p className="text-2xl font-bold">{analytics?.totalCampaigns ?? 0}</p>
              <p className="text-[11px] text-white/60 mt-0.5">Campaigns</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-4 gap-5">
        {statCards.map((card, index) => {
          const value = analytics?.[card.key] ?? 0
          const Icon = card.icon
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className="group rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200/80 dark:ring-gray-800/80 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-default"
            >
              <div className="flex items-start justify-between">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </div>
                <Zap className="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mt-4">
                <span className="text-[28px] font-bold text-gray-900 dark:text-white leading-none">
                  {card.format ? card.format(value) : value.toLocaleString()}
                  {card.suffix && <span className="text-lg font-normal text-gray-400">{card.suffix}</span>}
                </span>
              </div>
              <span className="text-[12px] text-gray-500 dark:text-gray-400 mt-1.5 block font-medium">{card.label}</span>
            </motion.div>
          )
        })}
      </div>

      {/* ─── Charts ─── */}
      <div className="grid grid-cols-3 gap-5">
        {/* Email Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200/80 dark:ring-gray-800/80 p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-[#4285F4]" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Email Overview</h3>
          </div>
          {emailChart.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={emailChart} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28}>
                  {emailChart.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex flex-col items-center justify-center text-gray-400">
              <Mail className="w-10 h-10 mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">No email data yet</p>
            </div>
          )}
        </motion.div>

        {/* Campaign Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200/80 dark:ring-gray-800/80 p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-[#34A853]" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Campaign Performance</h3>
          </div>
          {campaignChart.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={campaignChart} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28}>
                  {campaignChart.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex flex-col items-center justify-center text-gray-400">
              <Megaphone className="w-10 h-10 mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">No campaign data yet</p>
            </div>
          )}
        </motion.div>

        {/* Engagement Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200/80 dark:ring-gray-800/80 p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Eye className="w-4 h-4 text-[#8AB4F8]" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Engagement</h3>
          </div>
          {(analytics?.totalOpens || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={engagementPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {engagementPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend verticalAlign="bottom" height={40} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#6b7280' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex flex-col items-center justify-center text-gray-400">
              <Eye className="w-10 h-10 mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">No engagement data yet</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ─── Recent Activity Timeline ─── */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200/80 dark:ring-gray-800/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-[#4285F4]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Your last 10 email interactions</p>
            </div>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/80">
          {analytics?.recentActivity && analytics.recentActivity.length > 0 ? (
            analytics.recentActivity.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
              >
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.type === 'sent' ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}>
                    {item.type === 'sent' ? <ArrowUpRight className="w-4 h-4 text-[#4285F4]" /> : <ArrowDownLeft className="w-4 h-4 text-[#34A853]" />}
                  </div>
                  {index < analytics.recentActivity.length - 1 && <div className="w-0.5 flex-1 min-h-[20px] bg-gray-200 dark:bg-gray-700 mt-1" />}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] truncate ${!item.isRead && item.type === 'received' ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                    {item.subject || '(No Subject)'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {item.type === 'sent' ? 'Sent' : 'Received'} &middot; {item.folder}
                  </p>
                </div>
                {/* Meta */}
                <div className="flex items-center gap-2 shrink-0">
                  {!item.isRead && item.type === 'received' && <Badge className="bg-[#4285F4] text-white text-[10px] px-2 py-0 hover:bg-[#4285F4]/90">New</Badge>}
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No email activity yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start sending emails to see activity here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
