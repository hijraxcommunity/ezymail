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
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-lg w-32 animate-pulse" />
        </div>
        <div className="h-9 w-36 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-56 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-32 animate-pulse" />
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

  if (loading) return <CampaignsSkeleton />

  // ─── Campaign Detail View ───
  if (selectedCampaign) {
    return (
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setSelectedCampaign(null)}
          className="rounded-xl"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Campaigns
        </Button>

        {/* Campaign Header */}
        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCampaign.subject}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Created {new Date(selectedCampaign.createdAt).toLocaleDateString()} &middot;{' '}
            {selectedCampaign.recipientCount} recipients
          </p>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4 mt-5">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{selectedCampaign.recipientCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Recipients</div>
            </div>
            <div className="rounded-xl bg-[#4285F4]/5 p-3 text-center">
              <div className="text-2xl font-bold text-[#4285F4]">{selectedCampaign.openRate}%</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Open Rate</div>
            </div>
            <div className="rounded-xl bg-[#34A853]/5 p-3 text-center">
              <div className="text-2xl font-bold text-[#34A853]">{selectedCampaign.clickRate}%</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click Rate</div>
            </div>
            <div className="rounded-xl bg-[#FBBC05]/5 p-3 text-center">
              <div className="text-2xl font-bold text-[#FBBC05]">{selectedCampaign.openedCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Opens</div>
            </div>
          </div>
        </div>

        {/* Recipients Table */}
        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recipients</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 dark:border-gray-800">
                <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Customer</TableHead>
                <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</TableHead>
                <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Opened</TableHead>
                <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Clicked</TableHead>
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
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <TableCell className="text-sm font-medium text-gray-900 dark:text-white">
                      {r.customer.name || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                      {r.customer.email}
                    </TableCell>
                    <TableCell>
                      {r.openedAt ? (
                        <Badge className="bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-[10px] px-1.5 py-0">
                          <Eye className="w-3 h-3 mr-1" /> Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.clickedAt ? (
                        <Badge className="bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/20 text-[10px] px-1.5 py-0">
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
        </div>
      </div>
    )
  }

  // ─── Campaigns List View ───
  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Campaigns</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Button>
      </div>

      {/* ─── Create Campaign Form ─── */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Create New Campaign
              </h4>

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                  Subject
                </label>
                <Input
                  placeholder="Campaign subject line..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="rounded-xl"
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
                  className="rounded-xl resize-none"
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
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl max-h-48 overflow-y-auto custom-scrollbar">
                    {customers.map((customer) => (
                      <label
                        key={customer.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                          selectedRecipients.has(customer.id)
                            ? 'bg-[#4285F4]/5'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        } border-b border-gray-100 dark:border-gray-800 last:border-b-0`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRecipients.has(customer.id)}
                          onChange={() => toggleRecipient(customer.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#4285F4] focus:ring-[#4285F4]"
                        />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {customer.name || '—'}
                        </span>
                        <span className="text-xs text-gray-400">{customer.email}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <Users className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No customers yet. Add customers first.</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
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
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Campaigns Table ─── */}
      <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-800">
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Subject</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Recipients</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Opens</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Clicks</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Created</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length > 0 ? (
              campaigns.map((campaign, index) => (
                <motion.tr
                  key={campaign.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[240px]">
                        {campaign.subject}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {campaign.recipientCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                      <Eye className="w-3.5 h-3.5 text-[#4285F4]" />
                      {campaign.opens}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                      <MousePointerClick className="w-3.5 h-3.5 text-[#34A853]" />
                      {campaign.clicks}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewCampaign(campaign.id)}
                      className="h-7 text-[11px] rounded-lg"
                    >
                      View Details
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </TableCell>
                </motion.tr>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Megaphone className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No campaigns yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Create your first campaign to reach your customers
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
