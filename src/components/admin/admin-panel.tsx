'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Mail, HardDrive, Activity, Search, Shield, FileText,
  Loader2, Ban, CheckCircle, Trash2, Eye, X, Server, Clock, Cpu, Wifi,
  Megaphone, Settings, ScrollText, KeyRound, UserCog, AlertTriangle,
  ChevronDown, Copy, RefreshCw, Filter, Globe, Zap, Database,
  Building2, ClipboardCheck
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'
import { useAppStore } from '@/store/use-app-store'

/* ─── Types ─── */

interface AdminStats {
  totalUsers: number
  activeUsers: number
  suspendedUsers: number
  systemUsers: number
  totalEmails: number
  emailsToday: number
  recentRegistrations: number
  pendingReports: number
  storageUsed: string
  emailsPerDay: { date: string; count: number }[]
  usersPerDay: { date: string; count: number }[]
  folderDistribution: { folder: string; count: number }[]
  activeNow: number
}

interface AdminUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  status: string
  lastLogin: string | null
  lastIp: string | null
  avatar: string | null
  createdAt: string
  _count: { sentEmails: number; receivedEmails: number }
}

interface ReportItem {
  id: string
  reason: string
  description: string | null
  status: string
  createdAt: string
  resolvedAt: string | null
  reporter: { id: string; email: string; firstName: string; lastName: string }
  email: {
    id: string
    subject: string
    sender: { id: string; email: string; firstName: string; lastName: string }
    recipientEmail: string
  }
}

interface LogEntry {
  id: string
  type: string
  action: string
  adminName?: string | null
  userEmail?: string | null
  targetType?: string | null
  targetId?: string | null
  details?: string | null
  ipAddress?: string | null
  createdAt: string
}

interface SettingsGroup {
  id: string
  settingKey: string
  settingValue: string | null
}

interface BusinessAccount {
  id: string
  email: string
  firstName: string
  lastName: string
  avatar: string | null
  status: string
  accountType: string
  businessName: string
  businessEmail: string
  employeeCount: string | null
  subscriptionStatus: string
  trialStart: string | null
  trialEnd: string | null
  createdAt: string
  businessVerification: { id: string; status: string; submittedAt: string; reviewedAt: string | null } | null
  _count: { teamMembersOwned: number; customers: number; campaigns: number }
}

interface BusinessVerification {
  id: string
  documentUrls: string
  status: string
  adminNotes: string | null
  submittedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  userId: string
  user: {
    id: string; email: string; firstName: string; lastName: string; avatar: string | null
    businessName: string; businessEmail: string; employeeCount: string | null; subscriptionStatus: string; createdAt: string
  }
  reviewedByUser: { id: string; email: string; firstName: string; lastName: string } | null
}

interface BusinessStats {
  totalBusinessAccounts: number
  subscriptionBreakdown: { pendingVerification: number; trial: number; active: number; expired: number }
  recentRegistrations: number
  totalCustomers: number
  totalCampaigns: number
  verificationsPendingReview: number
}

/* ─── Constants ─── */

const FOLDER_COLORS: Record<string, string> = {
  inbox: '#4285F4',
  sent: '#34A853',
  drafts: '#FBBC05',
  trash: '#EA4335',
  starred: '#9333EA',
  archive: '#6366F1',
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'white',
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  fontSize: '12px',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
}

const SETTINGS_LABELS: Record<string, string> = {
  app_name: 'App Name',
  support_email: 'Support Email',
  email_domain: 'Email Domain',
  registration_open: 'Open Registration',
  max_attachment_size: 'Max Attachment Size (bytes)',
  max_attachments_per_email: 'Max Attachments Per Email',
  storage_limit_per_user: 'Storage Limit Per User (bytes)',
  maintenance_mode: 'Maintenance Mode',
  maintenance_message: 'Maintenance Message',
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' as const },
}

/* ─── Main Component ─── */

export function AdminPanel() {
  const { setAdminView } = useAppStore()
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-950 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#4285F4]" />
            <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white">Admin Panel</h2>
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">v2.0</Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setAdminView(null)} className="h-9 w-9">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Users
            </TabsTrigger>
            <TabsTrigger value="business-accounts">
              <Building2 className="w-3.5 h-3.5 mr-1.5" />
              Business Accounts
            </TabsTrigger>
            <TabsTrigger value="business-verifications">
              <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" />
              Verifications
            </TabsTrigger>
            <TabsTrigger value="reports">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="logs">
              <ScrollText className="w-3.5 h-3.5 mr-1.5" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Settings
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <DashboardTab key="dashboard" />}
            {activeTab === 'users' && <UsersTab key="users" />}
            {activeTab === 'reports' && <ReportsTab key="reports" />}
            {activeTab === 'logs' && <LogsTab key="logs" />}
            {activeTab === 'business-accounts' && <BusinessAccountsTab key="business-accounts" />}
            {activeTab === 'business-verifications' && <BusinessVerificationsTab key="business-verifications" />}
            {activeTab === 'settings' && <SettingsTab key="settings" />}
          </AnimatePresence>
        </Tabs>
      </div>
    </div>
  )
}

/* ─── Dashboard Tab ─── */

function DashboardTab() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [bStats, setBStats] = useState<BusinessStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverTime, setServerTime] = useState(new Date())

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/stats')
      const json = await res.json()
      if (json.success && json.data) {
        setStats(json.data)
      }
    } catch {
      toast.error('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const fetchBusinessStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/business-stats')
      const json = await res.json()
      if (json.success && json.data) {
        setBStats(json.data)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchBusinessStats()
  }, [fetchBusinessStats])

  useEffect(() => {
    const interval = setInterval(() => setServerTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const emailsChartData = (stats?.emailsPerDay || []).map((d) => ({
    ...d,
    day: new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' }),
  }))

  const folderPieData = (stats?.folderDistribution || []).map((d) => ({
    name: d.folder.charAt(0).toUpperCase() + d.folder.slice(1),
    value: d.count,
    color: FOLDER_COLORS[d.folder.toLowerCase()] || '#6B7280',
  }))

  const usersLineData = (stats?.usersPerDay || []).map((d) => ({
    ...d,
    shortDate: d.date.slice(5), // MM-DD
  }))

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users, gradient: 'from-blue-500/10 to-blue-600/5', iconBg: 'bg-[#4285F4]' },
    { label: 'Active Now', value: stats?.activeNow ?? 0, icon: Zap, gradient: 'from-green-500/10 to-green-600/5', iconBg: 'bg-[#34A853]' },
    { label: 'Emails Sent', value: stats?.totalEmails ?? 0, icon: Mail, gradient: 'from-yellow-500/10 to-yellow-600/5', iconBg: 'bg-[#FBBC05]' },
    { label: 'Storage Used', value: stats?.storageUsed ?? '0 MB', icon: HardDrive, gradient: 'from-red-500/10 to-red-600/5', iconBg: 'bg-[#EA4335]' },
    { label: 'Pending Reports', value: stats?.pendingReports ?? 0, icon: FileText, gradient: 'from-orange-500/10 to-orange-600/5', iconBg: 'bg-[#F97316]' },
    { label: 'New (7d)', value: stats?.recentRegistrations ?? 0, icon: Activity, gradient: 'from-purple-500/10 to-purple-600/5', iconBg: 'bg-[#9333EA]' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div key={card.label} {...fadeInUp} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-sm relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} pointer-events-none`} />
                <CardContent className="p-3.5 relative">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-500 truncate">{card.label}</p>
                      <span className="text-lg font-bold text-[#1F1F1F] dark:text-white leading-tight">
                        {loading ? <Skeleton className="h-5 w-14 inline-block" /> : card.value}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Business Stats */}
      <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Business Accounts', value: bStats?.totalBusinessAccounts ?? 0, icon: Building2, gradient: 'from-teal-500/10 to-teal-600/5', iconBg: 'bg-teal-600' },
            { label: 'Pending Verifications', value: bStats?.verificationsPendingReview ?? 0, icon: ClipboardCheck, gradient: 'from-yellow-500/10 to-yellow-600/5', iconBg: 'bg-[#FBBC05]' },
            { label: 'Active Subscriptions', value: bStats?.subscriptionBreakdown?.active ?? 0, icon: CheckCircle, gradient: 'from-green-500/10 to-green-600/5', iconBg: 'bg-[#34A853]' },
            { label: 'Trial Accounts', value: bStats?.subscriptionBreakdown?.trial ?? 0, icon: Clock, gradient: 'from-blue-500/10 to-blue-600/5', iconBg: 'bg-[#4285F4]' },
          ].map((card, i) => {
            const Icon = card.icon
            return (
              <Card key={card.label} className="border-0 shadow-sm relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} pointer-events-none`} />
                <CardContent className="p-3.5 relative">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-500 truncate">{card.label}</p>
                      <span className="text-lg font-bold text-[#1F1F1F] dark:text-white leading-tight">
                        {loading ? <Skeleton className="h-5 w-14 inline-block" /> : card.value}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </motion.div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart - Emails per day */}
        <motion.div {...fadeInUp} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-[#1F1F1F] dark:text-white">
                    Emails per Day
                  </CardTitle>
                  <p className="text-xs text-gray-500">Last 7 days</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchStats}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-56">
                {loading ? (
                  <Skeleton className="h-full w-full rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={emailsChartData} barSize={28}>
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(66,133,244,0.08)' }} />
                      <Bar dataKey="count" fill="#4285F4" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Line chart - Users per day */}
        <motion.div {...fadeInUp} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-sm font-semibold text-[#1F1F1F] dark:text-white">
                  User Registrations
                </CardTitle>
                <p className="text-xs text-gray-500">Last 30 days</p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-56">
                {loading ? (
                  <Skeleton className="h-full w-full rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usersLineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="shortDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} interval={6} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="count" stroke="#34A853" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#34A853' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts row 2 + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <motion.div {...fadeInUp} transition={{ delay: 0.25 }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#1F1F1F] dark:text-white">
                Folder Distribution
              </CardTitle>
              <p className="text-xs text-gray-500">Emails by folder</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-48 flex items-center">
                {loading ? (
                  <Skeleton className="h-full w-full rounded-lg" />
                ) : folderPieData.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center w-full">No emails yet</p>
                ) : (
                  <>
                    <div className="w-1/2 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={folderPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={72}
                            paddingAngle={3}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {folderPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-1/2 space-y-2.5 pl-2">
                      {folderPieData.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.name}</span>
                            <span className="text-xs font-semibold text-[#1F1F1F] dark:text-white">{item.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* System Status */}
        <motion.div {...fadeInUp} transition={{ delay: 0.3 }}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1F1F1F] dark:text-white">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-green-50 dark:bg-green-950/30">
                  <div className="w-8 h-8 rounded-lg bg-[#34A853]/10 flex items-center justify-center">
                    <Server className="w-4 h-4 text-[#34A853]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Server</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#34A853] animate-pulse" />
                      <p className="text-xs font-semibold text-[#34A853]">Online</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30">
                  <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-[#4285F4]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Time</p>
                    <p className="text-xs font-semibold text-[#1F1F1F] dark:text-white tabular-nums">
                      {serverTime.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30">
                  <div className="w-8 h-8 rounded-lg bg-[#FBBC05]/10 flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-[#FBBC05]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">CPU</p>
                    <p className="text-xs font-semibold text-[#1F1F1F] dark:text-white">12.4%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Wifi className="w-4 h-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Uptime</p>
                    <p className="text-xs font-semibold text-[#1F1F1F] dark:text-white">99.9%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div {...fadeInUp} transition={{ delay: 0.35 }}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1F1F1F] dark:text-white">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Emails Today', value: stats?.emailsToday ?? 0, icon: Mail, color: 'text-[#4285F4]' },
                  { label: 'Suspended Users', value: stats?.suspendedUsers ?? 0, icon: Ban, color: 'text-[#EA4335]' },
                  { label: 'System Users', value: stats?.systemUsers ?? 0, icon: Database, color: 'text-purple-500' },
                  { label: 'Active Sessions', value: stats?.activeNow ?? 0, icon: Globe, color: 'text-[#34A853]' },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${item.color}`} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
                      </div>
                      <span className="text-sm font-semibold text-[#1F1F1F] dark:text-white">
                        {loading ? <Skeleton className="h-4 w-8 inline-block" /> : item.value}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ─── Users Tab ─── */

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // View details dialog
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Reset password dialog
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
  const [tempPassword, setTempPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  // Impersonation confirm
  const [impersonating, setImpersonating] = useState(false)

  // Announcement dialog
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [annSubject, setAnnSubject] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annTarget, setAnnTarget] = useState<'all' | 'selected'>('all')
  const [annSelectedIds, setAnnSelectedIds] = useState<string[]>([])
  const [sendingAnn, setSendingAnn] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json()
      setUsers(data.users || [])
      setTotalPages(data.totalPages || 1)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleUserAction = async (userId: string, action: string, status?: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        toast.success(`User ${action}d`)
        fetchUsers()
      }
    } catch {
      toast.error(`Failed to ${action} user`)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('User deleted')
        fetchUsers()
      }
    } catch {
      toast.error('Failed to delete user')
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return
    setResettingPassword(true)
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setTempPassword(data.data.temporaryPassword)
        toast.success('Password reset successfully')
      } else {
        toast.error(data.error || 'Failed to reset password')
      }
    } catch {
      toast.error('Failed to reset password')
    } finally {
      setResettingPassword(false)
    }
  }

  const handleImpersonate = async (user: AdminUser) => {
    if (!confirm(`Impersonate ${user.firstName} ${user.lastName}? You will be logged in as this user.`)) return
    setImpersonating(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/impersonate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        // Set the impersonated user in the store and close admin panel
        const store = useAppStore.getState()
        store.setUser({
          id: data.data.user.id,
          email: data.data.user.email,
          firstName: data.data.user.firstName,
          lastName: data.data.user.lastName,
          avatar: data.data.user.avatar,
          role: data.data.user.role,
          status: data.data.user.status,
          onboardingDone: data.data.user.onboardingDone,
        })
        store.setAdminView(null)
        toast.success(`Now impersonating ${data.data.user.firstName} ${data.data.user.lastName}`)
      } else {
        toast.error(data.error || 'Failed to impersonate')
      }
    } catch {
      toast.error('Failed to impersonate user')
    } finally {
      setImpersonating(false)
    }
  }

  const handleSendAnnouncement = async () => {
    if (!annSubject.trim() || !annBody.trim()) {
      toast.error('Subject and body are required')
      return
    }
    setSendingAnn(true)
    try {
      const body: { subject: string; body: string; userIds?: string[] } = {
        subject: annSubject,
        body: annBody,
      }
      if (annTarget === 'selected' && annSelectedIds.length > 0) {
        body.userIds = annSelectedIds
      }
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Announcement sent to ${data.data.sentCount} users`)
        setAnnouncementOpen(false)
        setAnnSubject('')
        setAnnBody('')
        setAnnSelectedIds([])
      } else {
        toast.error(data.error || 'Failed to send announcement')
      }
    } catch {
      toast.error('Failed to send announcement')
    } finally {
      setSendingAnn(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search users..."
            className="h-10 pl-9 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1) }}>
          <SelectTrigger className="w-36 h-10 rounded-xl">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          onClick={() => setAnnouncementOpen(true)}
        >
          <Megaphone className="w-4 h-4 mr-1.5" />
          Send Announcement
        </Button>
      </div>

      {/* Users table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Emails</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Last Login</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Joined</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-8 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-[#D3E3FD] text-[#4285F4] text-xs font-semibold">
                                {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                              <p className="text-xs text-gray-500 truncate">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={user.status === 'active' ? 'default' : 'destructive'}
                            className={
                              user.status === 'active'
                                ? 'bg-[#E6F4EA] text-[#34A853] border-[#34A853]/20'
                                : 'bg-[#FCE8E6] text-[#EA4335] border-[#EA4335]/20'
                            }
                          >
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">
                          {user._count.sentEmails + user._count.receivedEmails}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-gray-500">
                          {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View Details" onClick={() => { setSelectedUser(user); setDetailsOpen(true) }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Impersonate" onClick={() => handleImpersonate(user)} disabled={impersonating}>
                              {impersonating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset Password" onClick={() => { setSelectedUser(user); setTempPassword(''); setResetPasswordOpen(true) }}>
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            {user.status === 'active' ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-[#EA4335]" title="Suspend" onClick={() => handleUserAction(user.id, 'suspend', 'suspended')}>
                                <Ban className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-[#34A853]" title="Activate" onClick={() => handleUserAction(user.id, 'activate', 'active')}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#EA4335]" title="Delete" onClick={() => handleDeleteUser(user.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 text-xs">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-[#D3E3FD] text-[#4285F4] text-lg font-semibold">
                    {selectedUser.firstName?.charAt(0)}{selectedUser.lastName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedUser.firstName} {selectedUser.lastName}</p>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <Badge className={selectedUser.status === 'active' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#FCE8E6] text-[#EA4335]'}>
                    {selectedUser.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Role</p>
                  <p className="font-medium capitalize">{selectedUser.role}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Emails</p>
                  <p className="font-medium">{selectedUser._count.sentEmails + selectedUser._count.receivedEmails}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sent / Received</p>
                  <p className="font-medium">{selectedUser._count.sentEmails} / {selectedUser._count.receivedEmails}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Login</p>
                  <p className="font-medium">{selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : 'Never'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last IP</p>
                  <p className="font-medium">{selectedUser.lastIp || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Joined</p>
                  <p className="font-medium">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={(open) => { if (!open) { setResetPasswordOpen(false); setTempPassword('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Reset password for <strong>{selectedUser.firstName} {selectedUser.lastName}</strong> ({selectedUser.email})?
                This will invalidate all existing sessions.
              </p>
              {tempPassword ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-600 mb-1">Temporary Password:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-mono font-bold text-amber-700 dark:text-amber-400">{tempPassword}</code>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                      navigator.clipboard.writeText(tempPassword)
                      toast.success('Copied to clipboard')
                    }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">
                    Make sure to copy this password. It won&apos;t be shown again.
                  </p>
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleResetPassword}
                  disabled={resettingPassword}
                >
                  {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                  {resettingPassword ? 'Resetting...' : 'Generate New Password'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Announcement Dialog */}
      <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">Target Audience</Label>
              <Select value={annTarget} onValueChange={(v: string) => setAnnTarget(v as 'all' | 'selected')}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active Users</SelectItem>
                  <SelectItem value="selected">Selected Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Subject</Label>
              <Input
                value={annSubject}
                onChange={(e) => setAnnSubject(e.target.value)}
                placeholder="Announcement subject..."
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Message</Label>
              <Textarea
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder="Write your announcement message..."
                className="min-h-[120px] rounded-xl resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAnnouncementOpen(false)}>Cancel</Button>
              <Button onClick={handleSendAnnouncement} disabled={sendingAnn || !annSubject.trim() || !annBody.trim()}>
                {sendingAnn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Megaphone className="w-4 h-4 mr-2" />}
                {sendingAnn ? 'Sending...' : 'Send Announcement'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

/* ─── Reports Tab ─── */

function ReportsTab() {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/reports?${params}`)
      const data = await res.json()
      setReports(data.reports || [])
      setTotalPages(Math.ceil((data.total || 0) / 20))
    } catch {
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleResolveReport = async (reportId: string, action: 'resolved' | 'dismissed') => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Report ${action}`)
        fetchReports()
      } else {
        toast.error(data.error || 'Failed to update report')
      }
    } catch {
      toast.error('Failed to update report')
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{status}</Badge>
      case 'resolved':
        return <Badge className="bg-[#E6F4EA] text-[#34A853] border-[#34A853]/20">{status}</Badge>
      case 'dismissed':
        return <Badge className="bg-gray-100 text-gray-500 border-gray-200">{status}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1) }}>
          <SelectTrigger className="w-40 h-10 rounded-xl">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reports</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={fetchReports}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Reports table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableHead className="text-xs">Reporter</TableHead>
                    <TableHead className="text-xs">Email Subject</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Date</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">No reports found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{report.reporter.firstName} {report.reporter.lastName}</p>
                            <p className="text-xs text-gray-500 truncate">{report.reporter.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm truncate max-w-[200px]">{report.email.subject || '(No subject)'}</p>
                          <p className="text-xs text-gray-500 truncate">by {report.email.sender.firstName} {report.email.sender.lastName}</p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{report.reason}</span>
                        </TableCell>
                        <TableCell>{statusBadge(report.status)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {report.status === 'pending' && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-[#34A853]"
                                onClick={() => handleResolveReport(report.id, 'resolved')}
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Resolve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-gray-500"
                                onClick={() => handleResolveReport(report.id, 'dismissed')}
                              >
                                <Ban className="w-3.5 h-3.5 mr-1" />
                                Dismiss
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 text-xs">Next</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── System Logs Tab ─── */

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [logType, setLogType] = useState('all')
  const [search, setSearch] = useState('')
  const searchRef = useRef('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('type', logType)
      params.set('page', String(page))
      params.set('limit', '50')
      if (searchRef.current) params.set('search', searchRef.current)
      const res = await fetch(`/api/admin/logs?${params}`)
      const data = await res.json()
      if (data.success && data.data) {
        setLogs(data.data.logs || [])
        setTotalPages(data.data.totalPages || 1)
      }
    } catch {
      toast.error('Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [page, logType])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = () => {
    searchRef.current = search
    setPage(1)
    // small delay to let state update
    setTimeout(() => fetchLogs(), 50)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const formatDetails = (details: string | null | undefined) => {
    if (!details) return null
    try {
      const parsed = JSON.parse(details)
      if (parsed.targetEmail) return parsed.targetEmail
      if (parsed.userAgent) return parsed.deviceType || parsed.userAgent?.slice(0, 40)
      if (parsed.emailSubject) return parsed.emailSubject
      if (parsed.recipientCount) return `${parsed.recipientCount} recipients`
      return null
    } catch {
      return details.slice(0, 50)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search logs..."
            className="h-10 pl-9 rounded-xl"
          />
        </div>
        <Button variant="outline" className="h-10 rounded-xl" onClick={handleSearch}>
          <Search className="w-4 h-4 mr-1.5" />
          Search
        </Button>
        <Select value={logType} onValueChange={(val) => { setLogType(val); setPage(1) }}>
          <SelectTrigger className="w-40 h-10 rounded-xl">
            <SelectValue placeholder="Log type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Logs</SelectItem>
            <SelectItem value="admin">Admin Actions</SelectItem>
            <SelectItem value="login">Login Logs</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={fetchLogs}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Logs table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Admin / User</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Target / Details</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <ScrollText className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">No logs found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            log.type === 'admin'
                              ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800'
                              : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                          }>
                            {log.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.adminName || log.userEmail || 'System'}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatAction(log.action)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500 max-w-[200px] truncate">
                          {formatDetails(log.details) || log.targetType || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-gray-500 font-mono">
                          {log.ipAddress || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 text-xs">Next</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ─── Settings Tab ─── */

function SettingsTab() {
  const [grouped, setGrouped] = useState<Record<string, SettingsGroup[]>>({})
  const [flat, setFlat] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const editedRef = useRef<Record<string, string>>({})

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.success && data.data) {
        setGrouped(data.data.grouped || {})
        setFlat(data.data.flat || {})
        editedRef.current = {}
        setDirty(false)
      }
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleChange = (key: string, value: string) => {
    editedRef.current[key] = value
    setFlat((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: editedRef.current }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Saved ${data.data.updatedCount} settings`)
        editedRef.current = {}
        setDirty(false)
      } else {
        toast.error(data.error || 'Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const categoryIcons: Record<string, React.ReactNode> = {
    general: <Globe className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    system: <Server className="w-4 h-4" />,
  }

  const categoryLabels: Record<string, string> = {
    general: 'General',
    email: 'Email',
    system: 'System',
  }

  const categories = Object.keys(grouped)

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Save bar */}
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400">You have unsaved changes</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchSettings}>
              Discard
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
              Save Changes
            </Button>
          </div>
        </motion.div>
      )}

      {/* Settings grouped by category */}
      {categories.map((cat) => (
        <motion.div key={cat} {...fadeInUp}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
                  {categoryIcons[cat] || <Settings className="w-4 h-4" />}
                </div>
                <CardTitle className="text-sm font-semibold text-[#1F1F1F] dark:text-white">
                  {categoryLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(grouped[cat] || []).map((setting) => {
                const isBool = setting.settingValue === 'true' || setting.settingValue === 'false'
                const isLongField = setting.settingKey === 'maintenance_message'
                const label = SETTINGS_LABELS[setting.settingKey] || setting.settingKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

                if (isBool) {
                  return (
                    <div key={setting.settingKey} className="flex items-center justify-between py-1">
                      <Label className="text-sm">{label}</Label>
                      <Switch
                        checked={flat[setting.settingKey] === 'true'}
                        onCheckedChange={(checked) => handleChange(setting.settingKey, String(checked))}
                      />
                    </div>
                  )
                }

                if (setting.settingKey === 'maintenance_mode' && flat[setting.settingKey] === 'true') {
                  return (
                    <div key={setting.settingKey}>
                      <div className="flex items-center justify-between py-1">
                        <Label className="text-sm">{label}</Label>
                        <Switch
                          checked
                          onCheckedChange={(checked) => handleChange(setting.settingKey, String(checked))}
                        />
                      </div>
                      {flat['maintenance_message'] !== undefined && (
                        <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                          <Label className="text-xs text-amber-600 block mb-1.5">Maintenance Message</Label>
                          <Textarea
                            value={flat['maintenance_message'] || ''}
                            onChange={(e) => handleChange('maintenance_message', e.target.value)}
                            placeholder="Message shown to users during maintenance..."
                            className="min-h-[60px] rounded-lg text-sm resize-none"
                          />
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={setting.settingKey}>
                    <Label className="text-xs text-gray-500 block mb-1.5">{label}</Label>
                    {isLongField ? (
                      <Textarea
                        value={flat[setting.settingKey] || ''}
                        onChange={(e) => handleChange(setting.settingKey, e.target.value)}
                        className="rounded-xl resize-none text-sm"
                        rows={3}
                      />
                    ) : (
                      <Input
                        value={flat[setting.settingKey] || ''}
                        onChange={(e) => handleChange(setting.settingKey, e.target.value)}
                        className="h-10 rounded-xl"
                      />
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ─── Business Accounts Tab ─── */

function BusinessAccountsTab() {
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [subFilter, setSubFilter] = useState('all')

  // View details dialog
  const [selectedAccount, setSelectedAccount] = useState<BusinessAccount | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('subscriptionStatus', subFilter)
      params.set('page', String(page))
      params.set('limit', '20')
      const res = await fetch(`/api/admin/business-accounts?${params}`)
      const data = await res.json()
      setAccounts(data.accounts || [])
      setTotalPages(data.totalPages || 1)
    } catch {
      toast.error('Failed to load business accounts')
    } finally {
      setLoading(false)
    }
  }, [page, subFilter])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const handleViewDetails = async (account: BusinessAccount) => {
    setSelectedAccount(account)
    setDetailsOpen(true)
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/admin/business-accounts/${account.id}`)
      const data = await res.json()
      if (data.success && data.data) {
        setSelectedAccount(data.data)
      }
    } catch {
      toast.error('Failed to load account details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleAction = async (accountId: string, action: string) => {
    try {
      const res = await fetch(`/api/admin/business-accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Account ${action}d successfully`)
        fetchAccounts()
      } else {
        toast.error(data.error || `Failed to ${action} account`)
      }
    } catch {
      toast.error(`Failed to ${action} account`)
    }
  }

  const handleDelete = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this business account?')) return
    try {
      const res = await fetch(`/api/admin/business-accounts/${accountId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Business account deleted')
        fetchAccounts()
      } else {
        toast.error(data.error || 'Failed to delete account')
      }
    } catch {
      toast.error('Failed to delete account')
    }
  }

  const subBadge = (status: string) => {
    switch (status) {
      case 'pending_verification':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800">{status.replace('_', ' ')}</Badge>
      case 'trial':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">Trial</Badge>
      case 'active':
        return <Badge className="bg-[#E6F4EA] text-[#34A853] border-[#34A853]/20">Active</Badge>
      case 'expired':
        return <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-800">Expired</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={subFilter} onValueChange={(val) => { setSubFilter(val); setPage(1) }}>
          <SelectTrigger className="w-48 h-10 rounded-xl">
            <SelectValue placeholder="Subscription Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_verification">Pending Verification</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={fetchAccounts}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableHead className="text-xs">Business Name</TableHead>
                    <TableHead className="text-xs">Business Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Subscription</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Team</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Customers</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Campaigns</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Created</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">No business accounts found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((acct) => (
                      <TableRow key={acct.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{acct.businessName}</p>
                              <p className="text-xs text-gray-500 truncate">{acct.firstName} {acct.lastName}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{acct.businessEmail}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={acct.status === 'active' ? 'default' : 'destructive'}
                            className={acct.status === 'active' ? 'bg-[#E6F4EA] text-[#34A853] border-[#34A853]/20' : 'bg-[#FCE8E6] text-[#EA4335] border-[#EA4335]/20'}
                          >
                            {acct.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{subBadge(acct.subscriptionStatus)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">{acct._count.teamMembersOwned}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">{acct._count.customers}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-gray-500">{acct._count.campaigns}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">{new Date(acct.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View Details" onClick={() => handleViewDetails(acct)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {acct.status !== 'active' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-[#34A853]" title="Activate" onClick={() => handleAction(acct.id, 'activate')}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {acct.status === 'active' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-[#EA4335]" title="Suspend" onClick={() => handleAction(acct.id, 'suspend')}>
                                <Ban className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#EA4335]" title="Delete" onClick={() => handleDelete(acct.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 text-xs">Next</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Business Account Details</DialogTitle>
          </DialogHeader>
          {detailsLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-36" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16" /><Skeleton className="h-16" />
                <Skeleton className="h-16" /><Skeleton className="h-16" />
              </div>
            </div>
          ) : selectedAccount && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="font-semibold">{selectedAccount.businessName}</p>
                  <p className="text-sm text-gray-500">{selectedAccount.businessEmail}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Account Status</p>
                  <Badge className={selectedAccount.status === 'active' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#FCE8E6] text-[#EA4335]'}>
                    {selectedAccount.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Subscription</p>
                  {subBadge(selectedAccount.subscriptionStatus)}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Owner</p>
                  <p className="font-medium">{selectedAccount.firstName} {selectedAccount.lastName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Owner Email</p>
                  <p className="font-medium text-xs">{selectedAccount.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Employees</p>
                  <p className="font-medium">{selectedAccount.employeeCount || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Team Members</p>
                  <p className="font-medium">{selectedAccount._count.teamMembersOwned}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Customers</p>
                  <p className="font-medium">{selectedAccount._count.customers}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Campaigns</p>
                  <p className="font-medium">{selectedAccount._count.campaigns}</p>
                </div>
                {selectedAccount.trialStart && (
                  <div>
                    <p className="text-xs text-gray-500">Trial Period</p>
                    <p className="font-medium text-xs">{new Date(selectedAccount.trialStart).toLocaleDateString()} – {selectedAccount.trialEnd ? new Date(selectedAccount.trialEnd).toLocaleDateString() : 'N/A'}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="font-medium">{new Date(selectedAccount.createdAt).toLocaleDateString()}</p>
                </div>
                {selectedAccount.businessVerification && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500">Verification Status</p>
                      <Badge
                        className={
                          selectedAccount.businessVerification.status === 'approved'
                            ? 'bg-[#E6F4EA] text-[#34A853] border-[#34A853]/20'
                            : selectedAccount.businessVerification.status === 'rejected'
                            ? 'bg-[#FCE8E6] text-[#EA4335] border-[#EA4335]/20'
                            : 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800'
                        }
                      >
                        {selectedAccount.businessVerification.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Submitted</p>
                      <p className="font-medium">{new Date(selectedAccount.businessVerification.submittedAt).toLocaleDateString()}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

/* ─── Business Verifications Tab ─── */

function BusinessVerificationsTab() {
  const [verifications, setVerifications] = useState<BusinessVerification[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')

  // View documents dialog
  const [selectedV, setSelectedV] = useState<BusinessVerification | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)

  // Review dialog (approve/reject)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchVerifications = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', '20')
      const res = await fetch(`/api/admin/business-verifications?${params}`)
      const data = await res.json()
      setVerifications(data.verifications || [])
      setTotalPages(data.totalPages || 1)
    } catch {
      toast.error('Failed to load verifications')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchVerifications()
  }, [fetchVerifications])

  const openReviewDialog = (v: BusinessVerification, action: 'approve' | 'reject') => {
    setSelectedV(v)
    setReviewAction(action)
    setReviewNotes('')
    setReviewOpen(true)
  }

  const handleSubmitReview = async () => {
    if (!selectedV) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/business-verifications/${selectedV.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reviewAction, adminNotes: reviewNotes }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Verification ${reviewAction}d successfully`)
        setReviewOpen(false)
        fetchVerifications()
      } else {
        toast.error(data.error || `Failed to ${reviewAction} verification`)
      }
    } catch {
      toast.error(`Failed to ${reviewAction} verification`)
    } finally {
      setSubmitting(false)
    }
  }

  const parseDocUrls = (urlsStr: string): string[] => {
    try {
      const parsed = JSON.parse(urlsStr)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800">Pending</Badge>
      case 'approved':
        return <Badge className="bg-[#E6F4EA] text-[#34A853] border-[#34A853]/20">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-[#FCE8E6] text-[#EA4335] border-[#EA4335]/20">Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1) }}>
          <SelectTrigger className="w-40 h-10 rounded-xl">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Verifications</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={fetchVerifications}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableHead className="text-xs">Business Name</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Submitted</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Reviewed By</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                      </TableRow>
                    ))
                  ) : verifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <ClipboardCheck className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">No verifications found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    verifications.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{v.user?.businessName || `${v.user?.firstName} ${v.user?.lastName}`}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{v.user?.email}</p>
                        </TableCell>
                        <TableCell>{statusBadge(v.status)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">
                          {new Date(v.submittedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-gray-500">
                          {v.reviewedByUser
                            ? `${v.reviewedByUser.firstName} ${v.reviewedByUser.lastName}`
                            : '—'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSelectedV(v); setDocsOpen(true) }}>
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Docs
                            </Button>
                            {v.status === 'pending' && (
                              <>
                                <Button variant="ghost" size="sm" className="h-8 text-xs text-[#34A853]" onClick={() => openReviewDialog(v, 'approve')}>
                                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 text-xs text-[#EA4335]" onClick={() => openReviewDialog(v, 'reject')}>
                                  <Ban className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 text-xs">Next</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Documents Dialog */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verification Documents</DialogTitle>
          </DialogHeader>
          {selectedV && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{selectedV.user?.businessName}</p>
                <p className="text-xs text-gray-500">{selectedV.user?.email}</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">Documents</p>
                {parseDocUrls(selectedV.documentUrls).length === 0 ? (
                  <p className="text-sm text-gray-400">No documents uploaded</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {parseDocUrls(selectedV.documentUrls).map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm text-[#4285F4] hover:underline truncate"
                      >
                        Document {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {selectedV.adminNotes && (
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                  <p className="text-xs text-gray-500 mb-1">Admin Notes</p>
                  <p className="text-sm">{selectedV.adminNotes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewAction === 'approve' ? 'Approve' : 'Reject'} Verification</DialogTitle>
          </DialogHeader>
          {selectedV && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {reviewAction === 'approve'
                  ? `Approve verification for ${selectedV.user?.businessName}?`
                  : `Reject verification for ${selectedV.user?.businessName}?`
                }
              </p>
              <div>
                <Label className="text-xs mb-1.5 block">Admin Notes (optional)</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={reviewAction === 'reject' ? 'Reason for rejection...' : 'Any notes...'}
                  className="min-h-[80px] rounded-xl resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
                <Button
                  className={reviewAction === 'approve' ? 'bg-[#34A853] hover:bg-[#34A853]/90' : 'bg-[#EA4335] hover:bg-[#EA4335]/90'}
                  onClick={handleSubmitReview}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {reviewAction === 'approve' ? 'Approve' : 'Reject'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
