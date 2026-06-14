'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Megaphone,
  Plus,
  Loader2,
  X,
  Eye,
  MousePointerClick,
  Users,
  Send,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Clock,
  Mail,
  CheckCircle,
  BarChart3,
  FileEdit,
  Zap,
  Target,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/* ─── Types ─── */

interface Campaign {
  id: string
  subject: string
  body: string
  bodyHtml: string
  sentAt: string | null
  opens: number
  clicks: number
  recipientCount: number
  createdAt: string
}

interface CampaignRecipient {
  id: string
  openedAt: string | null
  clickedAt: string | null
  customer: {
    id: string
    email: string
    name: string | null
  }
}

interface CampaignDetail extends Campaign {
  openedCount: number
  clickedCount: number
  openRate: number
  clickRate: number
  recipients: CampaignRecipient[]
}

interface CustomerOption {
  id: string
  email: string
  name: string | null
}

/* ─── Loading Skeleton ─── */

function CampaignsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl ring-1 ring-gray-200 dark:ring-gray-800">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-56 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main Component ─── */

export function BusinessCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create form state
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/business/campaigns')
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
      } else {
        toast.error('Failed to load campaigns')
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/business/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err)
    }
  }, [])

  useEffect(() => {
    fetchCampaigns()
    fetchCustomers()
  }, [fetchCampaigns, fetchCustomers])

  async function handleCreateCampaign() {
    if (!subject.trim()) {
      toast.error('Subject is required')
      return
    }
    if (!body.trim()) {
      toast.error('Body is required')
      return
    }
    if (selectedRecipients.size === 0) {
      toast.error('Select at least one recipient')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/business/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          recipientCustomerIds: Array.from(selectedRecipients),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`Campaign "${data.campaign.subject}" created`)
        setSubject('')
        setBody('')
        setSelectedRecipients(new Set())
        setShowCreateForm(false)
        fetchCampaigns()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create campaign')
      }
    } catch (err) {
      console.error('Failed to create campaign:', err)
      toast.error('Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  async function handleViewCampaign(id: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/business/campaigns/${id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedCampaign(data.campaign)
      } else {
        toast.error('Failed to load campaign details')
      }
    } catch (err) {
      console.error('Failed to fetch campaign detail:', err)
      toast.error('Failed to load campaign details')
    } finally {
      setLoadingDetail(false)
    }
  }

  function toggleRecipient(id: string) {
    setSelectedRecipients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllRecipients() {
    if (selectedRecipients.size === customers.length) {
      setSelectedRecipients(new Set())
    } else {
      setSelectedRecipients(new Set(customers.map((c) => c.id)))
    }
  }

  async function handleDeleteCampaign(id: string) {
    try {
      const res = await fetch(`/api/business/campaigns/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Campaign deleted')
        fetchCampaigns()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete campaign')
      }
    } catch (err) {
      console.error('Failed to delete campaign:', err)
      toast.error('Failed to delete campaign')
    }
  }

  // Stats
  const totalOpens = campaigns.reduce((sum, c) => sum + c.opens, 0)
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0)
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.recipientCount, 0)
  const avgOpenRate = totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0

  if (loading) return <CampaignsSkeleton />

  // ─── Campaign Detail View ───
  if (selectedCampaign) {
    return (
      <div className="space-y-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setSelectedCampaign(null)}
          className="rounded-xl text-[13px]"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Campaigns
        </Button>

        {/* Campaign Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4285F4]/10 to-[#6366F1]/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-[#4285F4]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{selectedCampaign.subject}</h2>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">
                Created {new Date(selectedCampaign.createdAt).toLocaleDateString()} &middot;{' '}
                {selectedCampaign.recipientCount} recipients
              </p>
            </div>
            <Badge className={selectedCampaign.sentAt ? 'bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-xs' : 'bg-[#FBBC04]/10 text-[#FBBC04] border-[#FBBC04]/20 text-xs'}>
              {selectedCampaign.sentAt ? 'Sent' : 'Draft'}
            </Badge>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="rounded-xl bg-gradient-to-br from-gray-50 to-transparent dark:from-gray-800/50 dark:to-transparent p-4 ring-1 ring-gray-200 dark:ring-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-[11px] text-gray-400 uppercase tracking-wider">Recipients</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{selectedCampaign.recipientCount}</div>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-[#4285F4]/5 to-transparent p-4 ring-1 ring-[#4285F4]/10">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-[#4285F4]" />
                <span className="text-[11px] text-gray-400 uppercase tracking-wider">Open Rate</span>
              </div>
              <div className="text-2xl font-bold text-[#4285F4]">{selectedCampaign.openRate}%</div>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-[#34A853]/5 to-transparent p-4 ring-1 ring-[#34A853]/10">
              <div className="flex items-center gap-2 mb-2">
                <MousePointerClick className="w-4 h-4 text-[#34A853]" />
                <span className="text-[11px] text-gray-400 uppercase tracking-wider">Click Rate</span>
              </div>
              <div className="text-2xl font-bold text-[#34A853]">{selectedCampaign.clickRate}%</div>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-[#FBBC04]/5 to-transparent p-4 ring-1 ring-[#FBBC04]/10">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-[#FBBC04]" />
                <span className="text-[11px] text-gray-400 uppercase tracking-wider">Total Opens</span>
              </div>
              <div className="text-2xl font-bold text-[#FBBC04]">{selectedCampaign.openedCount}</div>
            </div>
          </div>
        </motion.div>

        {/* Recipients Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recipients</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100 dark:border-gray-800">
                <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</TableHead>
                <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Opened</TableHead>
                <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Clicked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingDetail ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : selectedCampaign.recipients.length > 0 ? (
                selectedCampaign.recipients.map((r, index) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.02 }}
                    className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors border-l-2 border-l-transparent hover:border-l-[#4285F4]"
                  >
                    <TableCell className="text-[13px] font-medium text-gray-900 dark:text-white">
                      {r.customer.name || '—'}
                    </TableCell>
                    <TableCell className="text-[13px] text-gray-600 dark:text-gray-400">
                      {r.customer.email}
                    </TableCell>
                    <TableCell>
                      {r.openedAt ? (
                        <Badge className="bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-[10px] px-2 py-0.5">
                          <Eye className="w-3 h-3 mr-1" /> Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.clickedAt ? (
                        <Badge className="bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/20 text-[10px] px-2 py-0.5">
                          <MousePointerClick className="w-3 h-3 mr-1" /> Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </TableCell>
                  </motion.tr>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <p className="text-sm text-gray-500">No recipients</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </motion.div>
      </div>
    )
  }

  // ─── Campaigns List View ───
  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Campaigns</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="rounded-xl bg-gradient-to-r from-[#4285F4] to-[#4285F4]/90 hover:from-[#4285F4]/90 hover:to-[#4285F4]/80 text-white shadow-sm shadow-[#4285F4]/20"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Button>
      </div>

      {/* ─── Stats Summary Row (Compact Mini Cards) ─── */}
      <div className="grid grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Campaigns</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#EA4335]/10 to-[#EA4335]/5">
              <Megaphone className="w-4 h-4 text-[#EA4335]" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1.5">{campaigns.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">All time</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Opens</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5">
              <Eye className="w-4 h-4 text-[#4285F4]" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1.5">{totalOpens}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Across all campaigns</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Clicks</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#34A853]/10 to-[#34A853]/5">
              <MousePointerClick className="w-4 h-4 text-[#34A853]" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1.5">{totalClicks}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Link interactions</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Avg Open Rate</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#6366F1]/10 to-[#6366F1]/5">
              <TrendingUp className="w-4 h-4 text-[#6366F1]" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1.5">{avgOpenRate}%</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Average performance</p>
        </motion.div>
      </div>

      {/* ─── Create Campaign Modal ─── */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="rounded-2xl max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5 flex items-center justify-center">
                <FileEdit className="w-4 h-4 text-[#4285F4]" />
              </div>
              Create New Campaign
            </DialogTitle>
            <DialogDescription className="text-[13px] text-gray-500">
              Compose your campaign email and select recipients to send it to.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                Subject Line
              </label>
              <Input
                placeholder="Campaign subject line..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl dark:bg-gray-800"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                Email Body
              </label>
              <Textarea
                placeholder="Write your campaign message..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="rounded-xl resize-none dark:bg-gray-800"
              />
            </div>

            {/* Recipients */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Recipients ({selectedRecipients.size} selected)
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={selectAllRecipients}
                  className="text-[11px] h-6 rounded-lg"
                >
                  {selectedRecipients.size === customers.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              {customers.length > 0 ? (
                <div className="ring-1 ring-gray-200 dark:ring-gray-700 rounded-xl max-h-48 overflow-y-auto">
                  {customers.map((customer) => (
                    <label
                      key={customer.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        selectedRecipients.has(customer.id)
                          ? 'bg-[#4285F4]/5'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      } border-b border-gray-50 dark:border-gray-800 last:border-b-0`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRecipients.has(customer.id)}
                        onChange={() => toggleRecipient(customer.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                      />
                      <span className="text-[13px] text-gray-900 dark:text-white">
                        {customer.name || '—'}
                      </span>
                      <span className="text-[11px] text-gray-400">{customer.email}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl ring-1 ring-gray-200 dark:ring-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                  <Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-[13px] text-gray-500">No customers yet. Add customers first.</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateForm(false)
                setSubject('')
                setBody('')
                setSelectedRecipients(new Set())
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCampaign}
              disabled={creating || selectedRecipients.size === 0}
              className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Campaigns Table ─── */}
      <div className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Campaign</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recipients</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Performance</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length > 0 ? (
              campaigns.map((campaign, index) => {
                const openRate = campaign.recipientCount > 0 ? Math.round((campaign.opens / campaign.recipientCount) * 100) : 0
                return (
                  <motion.tr
                    key={campaign.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all duration-150 border-l-2 border-l-transparent hover:border-l-[#4285F4]"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5 flex items-center justify-center shrink-0">
                          <Megaphone className="w-4 h-4 text-[#4285F4]" />
                        </div>
                        <div>
                          <span className="text-[13px] font-medium text-gray-900 dark:text-white truncate block max-w-[220px]">
                            {campaign.subject}
                          </span>
                          {/* Open rate progress bar at bottom of row */}
                          <div className="mt-2 h-1 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#4285F4] to-[#6366F1] rounded-full" style={{ width: `${openRate}%` }} />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        campaign.sentAt
                          ? 'bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-[10px] px-2 py-0.5'
                          : 'bg-[#FBBC04]/10 text-[#FBBC04] border-[#FBBC04]/20 text-[10px] px-2 py-0.5'
                      }>
                        <Megaphone className="w-3 h-3 mr-1" />
                        {campaign.sentAt ? 'Sent' : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                        {campaign.recipientCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 min-w-[120px]">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5 text-[#4285F4]" />
                            <span className="text-[12px] text-gray-600 dark:text-gray-400">{campaign.opens}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MousePointerClick className="w-3.5 h-3.5 text-[#34A853]" />
                            <span className="text-[12px] text-gray-600 dark:text-gray-400">{campaign.clicks}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400">{openRate}% open rate</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] text-gray-500 dark:text-gray-400">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewCampaign(campaign.id)}
                          className="h-8 text-[11px] rounded-lg hover:bg-[#4285F4]/5"
                        >
                          View
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCampaign(campaign.id)}
                          className="h-8 text-[11px] rounded-lg hover:bg-[#EA4335]/5 text-gray-400 hover:text-[#EA4335]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50 flex items-center justify-center mb-4">
                      <BarChart3 className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="text-[15px] font-semibold text-gray-700 dark:text-gray-300">No campaigns yet</p>
                    <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1.5 max-w-sm text-center">
                      Create your first email campaign to reach your customers. Track opens, clicks, and engagement in real time.
                    </p>
                    <Button
                      onClick={() => setShowCreateForm(true)}
                      className="mt-4 rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
                    >
                      <Plus className="w-4 h-4" />
                      Create First Campaign
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}