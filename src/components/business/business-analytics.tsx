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
  Clock,
  BarChart3,
  TrendingUp,
  Send,
  BarChart3 as BarChartIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

/* ─── Tooltip Style ─── */

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: '12px',
  fontSize: '13px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

const tooltipStyleDark = {
  backgroundColor: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: '12px',
  fontSize: '13px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
}

/* ─── Loading Skeleton ─── */

function AnalyticsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="h-80 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-80 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
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
    gradient: 'from-[#4285F4]/10 to-[#4285F4]/5',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalEmailsReceived' as const,
    label: 'Emails Received',
    icon: <Mail className="w-5 h-5" />,
    color: '#34A853',
    gradient: 'from-[#34A853]/10 to-[#34A853]/5',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalCustomers' as const,
    label: 'Customers',
    icon: <Users className="w-5 h-5" />,
    color: '#FBBC04',
    gradient: 'from-[#FBBC04]/10 to-[#FBBC04]/5',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalCampaigns' as const,
    label: 'Campaigns',
    icon: <Megaphone className="w-5 h-5" />,
    color: '#EA4335',
    gradient: 'from-[#EA4335]/10 to-[#EA4335]/5',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalOpens' as const,
    label: 'Total Opens',
    icon: <Eye className="w-5 h-5" />,
    color: '#8AB4F8',
    gradient: 'from-[#8AB4F8]/10 to-[#8AB4F8]/5',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'totalClicks' as const,
    label: 'Total Clicks',
    icon: <MousePointerClick className="w-5 h-5" />,
    color: '#F97316',
    gradient: 'from-[#F97316]/10 to-[#F97316]/5',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'openRate' as const,
    label: 'Open Rate',
    icon: <TrendingUp className="w-5 h-5" />,
    color: '#06B6D4',
    gradient: 'from-[#06B6D4]/10 to-[#06B6D4]/5',
    format: (v: number) => `${v}%`,
  },
  {
    key: 'clickRate' as const,
    label: 'Click Rate',
    icon: <BarChart3 className="w-5 h-5" />,
    color: '#EC4899',
    gradient: 'from-[#EC4899]/10 to-[#EC4899]/5',
    format: (v: number) => `${v}%`,
  },
]

/* ─── Main Component ─── */

export function BusinessAnalytics() {
  const { user } = useAppStore()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | 'all'>('30d')

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
    <div className="space-y-8">
      {/* ─── Page Header + Date Filter ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Analytics</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
            Detailed performance metrics and insights
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-1">
          {([['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All Time']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveRange(key)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                activeRange === key
                  ? 'bg-[#4285F4] text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
              className={`relative rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} pointer-events-none`} />
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{card.label}</span>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.color}12`, color: card.color }}>
                    {card.icon}
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    {card.format(value)}
                  </span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ─── Summary Metric Cards ─── */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">Team Members</span>
            <Users className="w-4 h-4 text-[#4285F4]" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics?.teamMemberCount ?? 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Active collaborators</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">Open Rate</span>
            <Eye className="w-4 h-4 text-[#34A853]" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics?.openRate ?? 0}%
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Average across campaigns</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">Click Rate</span>
            <MousePointerClick className="w-4 h-4 text-[#FBBC04]" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics?.clickRate ?? 0}%
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Average across campaigns</p>
        </motion.div>
      </div>

      {/* ─── Charts ─── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Bar Chart: Campaign Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-6 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-6">
            <BarChartIcon className="w-5 h-5 text-[#4285F4]" />
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Campaign Performance</h3>
          </div>
          {campaignBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={campaignBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.02)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyleDark} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {campaignBarData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <BarChartIcon className="w-6 h-6 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-sm text-gray-400">No campaign data available yet</p>
              <p className="text-[11px] text-gray-400">Create campaigns to see performance data</p>
            </div>
          )}
        </motion.div>

        {/* Pie Chart: Open/Click Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-6 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-[#34A853]" />
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Engagement Breakdown</h3>
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
                <Tooltip contentStyle={tooltipStyleDark} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-sm text-gray-400">No engagement data available yet</p>
              <p className="text-[11px] text-gray-400">Send campaigns to track engagement</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ─── Recent Activity Feed (Timeline Style) ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 shadow-sm"
      >
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
          <p className="text-[13px] text-gray-400 mt-0.5">
            Your last 10 email interactions
          </p>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {activityData.length > 0 ? (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-800" />
              {activityData.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  className="relative flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                >
                  {/* Timeline dot */}
                  <div className="relative z-10">
                    <div
                      className={`w-[10px] h-[10px] rounded-full border-2 ${
                        item.type === 'sent'
                          ? 'border-[#4285F4] bg-white dark:bg-gray-900'
                          : 'border-[#34A853] bg-white dark:bg-gray-900'
                      }`}
                    />
                  </div>
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
                      className={`text-[13px] truncate ${
                        !item.isRead && item.type === 'received'
                          ? 'font-semibold text-gray-900 dark:text-white'
                          : 'text-gray-600 dark:text-gray-400'
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
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No email activity yet</p>
              <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
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