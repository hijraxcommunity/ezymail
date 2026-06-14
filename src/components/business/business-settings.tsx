'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  Mail,
  Phone,
  Users,
  ShieldCheck,
  CreditCard,
  Clock,
  AlertTriangle,
  Loader2,
  Save,
  Upload,
  Trash2,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'

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

interface Verification {
  id: string
  status: string
  submittedAt: string | null
  reviewedAt: string | null
  adminNotes: string | null
}

/* ─── Subscription Badge ─── */

function SubscriptionStatusBadge({ status }: { status: string | null }) {
  const config: Record<string, { label: string; className: string }> = {
    active: {
      label: 'Active',
      className: 'bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20',
    },
    trial: {
      label: 'Trial',
      className: 'bg-[#FBBC05]/10 text-[#FBBC05] border-[#FBBC05]/20',
    },
    expired: {
      label: 'Expired',
      className: 'bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/20',
    },
    pending_verification: {
      label: 'Pending Verification',
      className: 'bg-[#FBBC05]/10 text-[#FBBC05] border-[#FBBC05]/20',
    },
  }

  const c = config[status || '']
  if (!c) {
    return <Badge variant="outline">None</Badge>
  }

  return (
    <Badge className={`${c.className} text-xs px-2.5 py-0.5 hover:opacity-90`}>
      {c.label}
    </Badge>
  )
}

/* ─── Verification Status Display ─── */

function VerificationStatus({ verification }: { verification: Verification | null }) {
  if (!verification) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <HelpCircle className="w-4 h-4" />
        No verification submitted
      </div>
    )
  }

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    pending: {
      icon: <Clock className="w-4 h-4 text-[#FBBC05]" />,
      color: 'text-[#FBBC05]',
      label: 'Pending Review',
    },
    approved: {
      icon: <CheckCircle className="w-4 h-4 text-[#34A853]" />,
      color: 'text-[#34A853]',
      label: 'Approved',
    },
    rejected: {
      icon: <XCircle className="w-4 h-4 text-[#EA4335]" />,
      color: 'text-[#EA4335]',
      label: 'Rejected',
    },
  }

  const config = statusConfig[verification.status] || statusConfig.pending

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {config.icon}
        <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
      </div>
      {verification.submittedAt && (
        <p className="text-xs text-gray-400">
          Submitted: {new Date(verification.submittedAt).toLocaleString()}
        </p>
      )}
      {verification.adminNotes && (
        <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">Admin Notes:</span> {verification.adminNotes}
          </p>
        </div>
      )}
    </div>
  )
}

/* ─── Loading Skeleton ─── */

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-48 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  )
}

/* ─── Main Component ─── */

export function BusinessSettings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [verification, setVerification] = useState<Verification | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [editBusinessName, setEditBusinessName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmployeeCount, setEditEmployeeCount] = useState('')

  // Document upload
  const [docUrls, setDocUrls] = useState('')
  const [uploading, setUploading] = useState(false)

  // Delete account
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, verificationRes] = await Promise.all([
        fetch('/api/business/profile'),
        fetch('/api/business/verification'),
      ])

      if (profileRes.ok) {
        const data = await profileRes.json()
        setProfile(data.user)
        setEditBusinessName(data.user.businessName || '')
        setEditPhone(data.user.phone || '')
        setEditEmployeeCount(data.user.employeeCount || '')
      }

      if (verificationRes.ok) {
        const data = await verificationRes.json()
        if (data.id) {
          setVerification(data)
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings data:', err)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSaveProfile() {
    setSaving(true)
    try {
      const res = await fetch('/api/business/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: editBusinessName.trim() || null,
          phone: editPhone.trim() || null,
          employeeCount: editEmployeeCount.trim() || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setProfile(data.user)
        toast.success('Profile updated')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update profile')
      }
    } catch (err) {
      console.error('Failed to save profile:', err)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadDocuments() {
    const urls = docUrls.trim().split('\n').map((u) => u.trim()).filter(Boolean)
    if (urls.length === 0) {
      toast.error('Enter at least one document URL')
      return
    }

    setUploading(true)
    try {
      const res = await fetch('/api/business/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentUrls: urls }),
      })

      if (res.ok) {
        toast.success('Verification documents submitted')
        // Refresh verification status
        const verRes = await fetch('/api/business/verification')
        if (verRes.ok) {
          const data = await verRes.json()
          if (data.id) setVerification(data)
        }
        setDocUrls('')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to submit documents')
      }
    } catch (err) {
      console.error('Failed to upload documents:', err)
      toast.error('Failed to submit documents')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') {
      toast.error('Type DELETE to confirm')
      return
    }

    setDeleting(true)
    try {
      const res = await fetch('/api/business/profile', {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Business account deleted. Redirecting...')
        setTimeout(() => {
          window.location.href = '/'
        }, 2000)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete account')
      }
    } catch (err) {
      console.error('Failed to delete account:', err)
      toast.error('Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <SettingsSkeleton />

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your business profile and account settings
        </p>
      </div>

      {/* ─── Business Profile ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="w-5 h-5 text-[#4285F4]" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Business Profile</h3>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              Business Name
            </label>
            <Input
              value={editBusinessName}
              onChange={(e) => setEditBusinessName(e.target.value)}
              placeholder="Your Business Name"
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              Business Email
            </label>
            <Input
              value={profile?.businessEmail || profile?.email || ''}
              readOnly
              disabled
              className="rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Business email cannot be changed</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              Phone Number
            </label>
            <Input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              Employee Count
            </label>
            <Input
              type="number"
              value={editEmployeeCount}
              onChange={(e) => setEditEmployeeCount(e.target.value)}
              placeholder="e.g., 50"
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            onClick={handleSaveProfile}
            disabled={saving}
            className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </div>
      </motion.div>

      {/* ─── Verification Status ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="w-5 h-5 text-[#34A853]" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Verification Status</h3>
        </div>

        <div className="mb-4">
          <VerificationStatus verification={verification} />
        </div>

        <Separator className="my-4" />

        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            {verification ? 'Re-upload Documents' : 'Upload Verification Documents'}
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Enter document URLs (one per line). These will be reviewed by our team.
          </p>
          <textarea
            value={docUrls}
            onChange={(e) => setDocUrls(e.target.value)}
            placeholder={"https://example.com/document1.pdf\nhttps://example.com/document2.jpg"}
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4285F4]/30 focus:border-[#4285F4] resize-none"
          />
          <div className="mt-3">
            <Button
              onClick={handleUploadDocuments}
              disabled={uploading || !docUrls.trim()}
              className="rounded-xl bg-[#34A853] hover:bg-[#34A853]/90 text-white"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {verification ? 'Re-submit Documents' : 'Submit Documents'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ─── Subscription ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <CreditCard className="w-5 h-5 text-[#FBBC05]" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Subscription</h3>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
          <SubscriptionStatusBadge status={profile?.subscriptionStatus || null} />
        </div>

        {profile?.trialStart && profile?.trialEnd && (
          <div className="space-y-2 mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Trial Start:</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(profile.trialStart).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Trial End:</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(profile.trialEnd).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Account Created:</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(profile.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        {profile?.subscriptionStatus === 'expired' && (
          <div className="mt-4 p-3 rounded-lg bg-[#EA4335]/5 border border-[#EA4335]/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#EA4335]" />
              <p className="text-sm text-[#EA4335]">
                Your subscription has expired. Please contact support to renew.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ─── Danger Zone ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-xl shadow-sm border border-[#EA4335]/20 bg-white dark:bg-gray-900 p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-[#EA4335]" />
          <h3 className="text-lg font-semibold text-[#EA4335]">Danger Zone</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Permanently delete your business account and all associated data. This action cannot be undone.
        </p>
        <Button
          variant="destructive"
          onClick={() => setShowDeleteDialog(true)}
          className="rounded-xl"
        >
          <Trash2 className="w-4 h-4" />
          Delete Business Account
        </Button>
      </motion.div>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="rounded-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
              Delete Business Account
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
              This will permanently delete your business account, team members, customers, 
              campaigns, and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              Type <span className="font-bold text-[#EA4335]">DELETE</span> to confirm
            </label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="rounded-xl border-[#EA4335]/30 focus:ring-[#EA4335]/30"
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => { setShowDeleteDialog(false); setDeleteConfirm('') }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== 'DELETE' || deleting}
              className="rounded-xl"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
