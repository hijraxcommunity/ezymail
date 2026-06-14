'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Users,
  Megaphone,
  Eye,
  MousePointerClick,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Clock,
  BarChart3,
  TrendingUp,
  Send,
  BarChart3 as BarChartIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'
import { Badge } from '@/components/ui/badge'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

/* ─── Types ─── */

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

/* ─── Color Palette ─── */

const COLORS = ['#4285F4', '#34A853', '#FBBC04', '#EA4335', '#8AB4F8', '#A8DAB5']

/* ─── Loading Skeleton ─── */

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-64 animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="h-80 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-80 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
  )
}

/* ─── Stat Cards Config ─── */

const statCards = [
  {
    key: 'totalEmailsSent' as const,
    label: 'Emails Sent',
    icon: <Send className="w-5 h-5" />,
    color: '#4285F4',
    bgColor: 'bg-[#4285F4]/10',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalEmailsReceived' as const,
    label: 'Emails Received',
    icon: <Mail className="w-5 h-5" />,
    color: '#34A853',
    bgColor: 'bg-[#34A853]/10',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalCustomers' as const,
    label: 'Customers',
    icon: <Users className="w-5 h-5" />,
    color: '#FBBC04',
    bgColor: 'bg-[#FBBC04]/10',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalCampaigns' as const,
    label: 'Campaigns',
    icon: <Megaphone className="w-5 h-5" />,
    color: '#EA4335',
    bgColor: 'bg-[#EA4335]/10',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalOpens' as const,
    label: 'Total Opens',
    icon: <Eye className="w-5 h-5" />,
    color: '#8AB4F8',
    bgColor: 'bg-[#8AB4F8]/10',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalClicks' as const,
    label: 'Total Clicks',
    icon: <MousePointerClick className="w-5 h-5" />,
    color: '#F97316',
    bgColor: 'bg-[#F97316]/10',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'openRate' as const,
    label: 'Open Rate',
    icon: <TrendingUp className="w-5 h-5" />,
    color: '#06B6D4',
    bgColor: 'bg-[#06B6D4]/10',
    format: (v: number) => `${v}%`,
  },
  {
    key: 'clickRate' as const,
    label: 'Click Rate',
    icon: <BarChart3 className="w-5 h-5" />,
    color: '#EC4899',
    bgColor: 'bg-[#EC4899]/10',
    format: (v: number) => `${v}%`,
  },
]

/* ─── Main Component ─── */

export function BusinessAnalytics() {
  const { user } = useAppStore()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/business/analytics')
        if (res.ok) {
          const data = await res.json()
          setAnalytics(data.analytics)
        } else {
          toast.error('Failed to load analytics')
        }
      } catch (err) {
        console.error('Failed to fetch analytics:', err)
        toast.error('Failed to load analytics data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) return <AnalyticsSkeleton />

  // Build chart data
  const campaignBarData = analytics && analytics.totalCampaigns > 0 ? [
    { name: 'Recipients', value: analytics.totalCustomers },
    { name: 'Opens', value: analytics.totalOpens },
    { name: 'Clicks', value: analytics.totalClicks },
  ] : []

  const engagementPieData = analytics ? [
    { name: 'Opens', value: analytics.totalOpens || 1 },
    { name: 'Clicks', value: analytics.totalClicks || 1 },
    { name: 'No Engagement', value: Math.max(0, (analytics.totalCustomers - analytics.totalOpens)) || 1 },
  ] : []

  const activityData = analytics?.recentActivity || []

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Detailed performance metrics and insights for your business email
        </p>
      </div>

      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const value = analytics?.[card.key] ?? 0
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
              className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                  <span style={{ color: card.color }}>{card.icon}</span>
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {card.format(value)}
                </span>
              </div>
              <span className="text-xs text-gray-400 mt-1 block">{card.label}</span>
            </motion.div>
          )
        })}
      </div>

      {/* ─── Charts ─── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Bar Chart: Campaign Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <BarChartIcon className="w-5 h-5 text-[#4285F4]" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Campaign Performance</h3>
          </div>
          {campaignBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={campaignBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {campaignBarData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-gray-400">No campaign data available yet</p>
            </div>
          )}
        </motion.div>

        {/* Pie Chart: Open/Click Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-[#34A853]" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Engagement Breakdown</h3>
          </div>
          {analytics && analytics.totalCustomers > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={engagementPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {engagementPieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-gray-500">{value}</span>}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '13px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-gray-400">No engagement data available yet</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Team Members</span>
            <Users className="w-4 h-4 text-[#4285F4]" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics?.teamMemberCount ?? 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">Active collaborators</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35 }}
          className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Open Rate</span>
            <Eye className="w-4 h-4 text-[#34A853]" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics?.openRate ?? 0}%
          </p>
          <p className="text-xs text-gray-400 mt-1">Average across campaigns</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Click Rate</span>
            <MousePointerClick className="w-4 h-4 text-[#FBBC04]" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics?.clickRate ?? 0}%
          </p>
          <p className="text-xs text-gray-400 mt-1">Average across campaigns</p>
        </motion.div>
      </div>

      {/* ─── Recent Activity Feed ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Your last 10 email interactions
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
          {activityData.length > 0 ? (
            activityData.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.type === 'sent'
                      ? 'bg-[#4285F4]/10'
                      : 'bg-[#34A853]/10'
                  }`}
                >
                  {item.type === 'sent' ? (
                    <ArrowUpRight className="w-4 h-4 text-[#4285F4]" />
                  ) : (
                    <ArrowDownLeft className="w-4 h-4 text-[#34A853]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm truncate ${
                      !item.isRead && item.type === 'received'
                        ? 'font-semibold text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {item.subject || '(No Subject)'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {item.type === 'sent' ? 'Sent' : 'Received'} &middot; {item.folder}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!item.isRead && item.type === 'received' && (
                    <Badge className="bg-[#4285F4] text-white text-[10px] px-1.5 py-0 hover:bg-[#4285F4]/90">
                      New
                    </Badge>
                  )}
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="px-6 py-12 text-center">
              <Mail className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No email activity yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Start sending emails to see activity here
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

/* ─── Helpers ─── */

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
