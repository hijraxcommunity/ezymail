'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Upload,
  FileText,
  AlertTriangle,
  Loader2,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  ImageIcon,
  ArrowRight,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

/* ─── Types ─── */

interface Verification {
  id: string
  status: string
  submittedAt: string | null
  reviewedAt: string | null
  adminNotes: string | null
}

/* ─── Status Badge ─── */

function VerificationStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: {
      label: 'Pending Review',
      className: 'bg-[#FBBC04]/10 text-[#FBBC04] border-[#FBBC04]/20',
    },
    approved: {
      label: 'Approved',
      className: 'bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20',
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/20',
    },
  }

  const c = config[status]
  if (!c) {
    return <Badge variant="outline">Unknown</Badge>
  }

  return (
    <Badge className={`${c.className} text-xs px-3 py-1 hover:opacity-90`}>
      {c.label}
    </Badge>
  )
}

/* ─── Loading Skeleton ─── */

function VerificationSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-64 animate-pulse" />
      <div className="h-48 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      <div className="h-64 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
    </div>
  )
}

/* ─── Verification Flow Diagram ─── */

function VerificationFlow({ currentStatus }: { currentStatus: string | null }) {
  const steps = [
    {
      id: 'upload',
      label: 'Upload Documents',
      description: 'Submit documents',
      icon: <Upload className="w-5 h-5" />,
      color: '#4285F4',
    },
    {
      id: 'review',
      label: 'Under Review',
      description: 'Team reviews',
      icon: <Clock className="w-5 h-5" />,
      color: '#FBBC04',
    },
    {
      id: 'approved',
      label: 'Approved',
      description: 'Verified',
      icon: <CheckCircle className="w-5 h-5" />,
      color: '#34A853',
    },
  ]

  const currentStepIndex = currentStatus === 'approved' ? 2 : currentStatus === 'pending' ? 1 : currentStatus === 'rejected' ? -1 : 0

  return (
    <div className="flex items-center justify-center gap-0 py-4">
      {steps.map((step, index) => {
        const isActive = currentStatus === step.id || (step.id === 'upload' && !currentStatus)
        const isCompleted = index < currentStepIndex && currentStepIndex >= 0
        const isCurrent = index === currentStepIndex && currentStepIndex >= 0
        const isRejected = currentStatus === 'rejected'

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isRejected
                    ? 'bg-gray-100 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700'
                    : isCompleted
                    ? 'bg-[#34A853]/10 ring-1 ring-[#34A853]/30'
                    : isCurrent
                    ? 'ring-2 shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700'
                }`}
                style={
                  isCurrent && !isRejected
                    ? { boxShadow: `0 0 0 2px ${step.color}40, 0 4px 14px ${step.color}25`, backgroundColor: `${step.color}10` }
                    : {}
                }
              >
                <span style={{ color: isRejected ? '#9ca3af' : isCompleted ? '#34A853' : isCurrent ? step.color : '#9ca3af' }}>
                  {isCompleted ? <CheckCircle className="w-5 h-5" /> : step.icon}
                </span>
              </div>
              <span className={`text-[13px] font-semibold mt-2 ${isCurrent && !isRejected ? 'text-gray-900 dark:text-white' : isCompleted ? 'text-[#34A853]' : 'text-gray-400'}`}>
                {step.label}
              </span>
              <span className="text-[11px] text-gray-400 mt-0.5">{step.description}</span>
            </div>
            {index < steps.length - 1 && (
              <div className="mx-4 mb-5">
                <ArrowRight className={`w-5 h-5 ${isRejected ? 'text-gray-300 dark:text-gray-700' : index < currentStepIndex ? 'text-[#34A853]' : 'text-gray-300 dark:text-gray-700'}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Status Card ─── */

function StatusCard({ verification }: { verification: Verification | null }) {
  if (!verification) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-10 shadow-sm"
      >
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <HelpCircle className="w-8 h-8 text-gray-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">
              Not Submitted
            </h3>
            <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
              Your business has not been verified yet. Submit your business documents below to get started.
              Verification is required to access all business features.
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  const statusConfig: Record<string, {
    icon: React.ReactNode
    title: string
    description: string
    color: string
    bgColor: string
    gradient: string
    ringClass: string
    iconBg: string
  }> = {
    pending: {
      icon: <Clock className="w-8 h-8 text-[#FBBC04]" />,
      title: 'Under Review',
      description: 'Your documents have been submitted and are currently being reviewed by our team. This usually takes 1-3 business days.',
      color: 'text-[#FBBC04]',
      bgColor: 'bg-[#FBBC04]/10',
      gradient: 'from-[#FBBC04]/5 to-transparent',
      ringClass: 'ring-[#FBBC04]/30',
      iconBg: 'bg-gradient-to-br from-[#FBBC04]/10 to-[#FBBC04]/5',
    },
    approved: {
      icon: <ShieldCheck className="w-8 h-8 text-[#34A853]" />,
      title: 'Verified',
      description: 'Your business has been successfully verified. You now have access to all business features.',
      color: 'text-[#34A853]',
      bgColor: 'bg-[#34A853]/10',
      gradient: 'from-[#34A853]/5 to-transparent',
      ringClass: 'ring-[#34A853]/30',
      iconBg: 'bg-gradient-to-br from-[#34A853]/10 to-[#34A853]/5',
    },
    rejected: {
      icon: <XCircle className="w-8 h-8 text-[#EA4335]" />,
      title: 'Rejected',
      description: 'Your verification was rejected. Please review the admin notes below and re-submit your documents.',
      color: 'text-[#EA4335]',
      bgColor: 'bg-[#EA4335]/10',
      gradient: 'from-[#EA4335]/5 to-transparent',
      ringClass: 'ring-[#EA4335]/30',
      iconBg: 'bg-gradient-to-br from-[#EA4335]/10 to-[#EA4335]/5',
    },
  }

  const config = statusConfig[verification.status] || statusConfig.pending

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl ring-1 bg-gradient-to-r ${config.gradient} shadow-sm overflow-hidden ${config.ringClass} bg-white dark:bg-gray-900`}
      >
      <div className="p-10">
        <div className="flex items-start gap-5">
          <div className={`w-16 h-16 rounded-2xl ${config.iconBg} flex items-center justify-center shrink-0`}>
            {config.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className={`text-lg font-bold ${config.color}`}>
                {config.title}
              </h3>
              <VerificationStatusBadge status={verification.status} />
            </div>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
              {config.description}
            </p>

            <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
              {verification.submittedAt && (
                <span>Submitted: {new Date(verification.submittedAt).toLocaleString()}</span>
              )}
              {verification.reviewedAt && (
                <span>Reviewed: {new Date(verification.reviewedAt).toLocaleString()}</span>
              )}
            </div>

            {verification.adminNotes && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#FBBC04]/5 to-transparent ring-1 ring-[#FBBC04]/20 border-l-4 border-l-[#FBBC04]">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-[#FBBC04]" />
                  <span className="text-xs font-semibold text-[#FBBC04]">
                    Admin Notes
                  </span>
                </div>
                <p className="text-[13px] text-gray-600 dark:text-gray-400">
                  {verification.adminNotes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Upload Form ─── */

function UploadForm({
  verification,
  onSubmitted,
}: {
  verification: Verification | null
  onSubmitted: () => void
}) {
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file')
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newFiles = Array.from(files).map((file) => ({
      name: file.name,
      url: `https://example.com/${file.name}`, // Demo placeholder URL
    }))

    setUploadedFiles((prev) => [...prev, ...newFiles])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function addUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) {
      toast.error('Please enter a URL')
      return
    }

    try {
      new URL(trimmed)
    } catch {
      toast.error('Please enter a valid URL')
      return
    }

    const name = trimmed.split('/').pop() || 'document'
    setUploadedFiles((prev) => [...prev, { name, url: trimmed }])
    setUrlInput('')
  }

  async function handleSubmit() {
    if (uploadedFiles.length === 0) {
      toast.error('Please add at least one document')
      return
    }

    setUploading(true)
    try {
      const docUrls = uploadedFiles.map((f) => f.url)
      const res = await fetch('/api/business/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentUrls: docUrls }),
      })

      if (res.ok) {
        toast.success('Documents submitted for verification')
        setUploadedFiles([])
        onSubmitted()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to submit documents')
      }
    } catch (err) {
      console.error('Failed to submit documents:', err)
      toast.error('Failed to submit documents')
    } finally {
      setUploading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-6 shadow-sm"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5 flex items-center justify-center">
          <Upload className="w-5 h-5 text-[#4285F4]" />
        </div>
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">
          {verification ? 'Re-upload Documents' : 'Upload Documents'}
        </h3>
      </div>

      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
        Submit business verification documents such as business registration certificates, tax filings, or government-issued identification.
      </p>

      {/* Mode Toggle */}
      <div className="flex items-center gap-2 mb-5">
        <Button
          size="sm"
          variant={uploadMode === 'file' ? 'default' : 'outline'}
          onClick={() => setUploadMode('file')}
          className={`rounded-lg text-xs ${uploadMode === 'file' ? 'bg-[#4285F4] hover:bg-[#4285F4]/90 text-white' : ''}`}
        >
          <FileText className="w-3.5 h-3.5 mr-1" />
          Upload File
        </Button>
        <Button
          size="sm"
          variant={uploadMode === 'url' ? 'default' : 'outline'}
          onClick={() => setUploadMode('url')}
          className={`rounded-lg text-xs ${uploadMode === 'url' ? 'bg-[#4285F4] hover:bg-[#4285F4]/90 text-white' : ''}`}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
          Enter URL
        </Button>
      </div>

      {/* Upload Area - Dropzone Style */}
      {uploadMode === 'file' ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-10 text-center cursor-pointer hover:border-[#4285F4] hover:bg-[#4285F4]/[0.03] transition-all duration-200 group"
        >
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3 group-hover:bg-[#4285F4]/10 transition-colors">
            <ImageIcon className="w-7 h-7 text-gray-400 group-hover:text-[#4285F4] transition-colors" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Click to upload documents
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            PDF, JPG, PNG files accepted &middot; Max 10MB per file
          </p>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="https://example.com/document.pdf"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUrl()}
              className="w-full px-4 py-2.5 rounded-xl ring-1 ring-gray-200 dark:ring-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4285F4]/30 focus:border-[#4285F4]"
            />
          </div>
          <Button
            onClick={addUrl}
            size="sm"
            className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
          >
            Add
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.gif"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Uploaded Files List */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5"
          >
            <Separator className="my-4" />
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
              {uploadedFiles.length} document{uploadedFiles.length !== 1 ? 's' : ''} selected
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {uploadedFiles.map((file, index) => (
                <motion.div
                  key={`${file.name}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 ring-1 ring-gray-200 dark:ring-gray-700"
                >
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-[13px] text-gray-700 dark:text-gray-300 truncate flex-1">
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-gray-400 hover:text-[#EA4335] transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      {uploadedFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 flex items-center justify-between"
        >
          <p className="text-xs text-gray-400">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            Note: In this demo, files are stored as placeholder URLs
          </p>
          <Button
            onClick={handleSubmit}
            disabled={uploading}
            className="rounded-xl bg-[#34A853] hover:bg-[#34A853]/90 text-white"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            {verification ? 'Re-submit Documents' : 'Submit for Verification'}
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}

/* ─── Main Component ─── */

export function BusinessVerification() {
  const [verification, setVerification] = useState<Verification | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchVerification = useCallback(async () => {
    try {
      const res = await fetch('/api/business/verification')
      if (res.ok) {
        const data = await res.json()
        if (data.id) {
          setVerification(data)
        } else {
          setVerification(null)
        }
      }
    } catch (err) {
      console.error('Failed to fetch verification status:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVerification()
  }, [fetchVerification])

  if (loading) return <VerificationSkeleton />

  return (
    <div className="space-y-8">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Verification</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
            Manage your business verification status and documents
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchVerification}
          className="rounded-xl"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* ─── Verification Flow Diagram ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-8 shadow-sm"
      >
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white text-center mb-2">Verification Progress</h3>
        <VerificationFlow currentStatus={verification?.status || null} />
      </motion.div>

      {/* ─── Verification Status ─── */}
      <StatusCard verification={verification} />

      {/* ─── Upload Form ─── */}
      <UploadForm verification={verification} onSubmitted={fetchVerification} />

      {/* ─── Info Section ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="rounded-2xl ring-1 ring-[#4285F4]/20 bg-gradient-to-r from-[#4285F4]/5 to-transparent p-6 border border-[#4285F4]/10"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 flex items-center justify-center shrink-0 mt-0.5">
            <FolderOpen className="w-5 h-5 text-[#4285F4]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#4285F4] mb-1.5">What is Business Verification?</h4>
            <p className="text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed">
              Business verification helps us confirm your identity and business legitimacy. This process is required 
              to access premium features like business email, advanced campaign tools, and priority support. 
              The verification typically takes 1-3 business days after submission.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px] px-2.5 py-0.5">Business Registration</Badge>
              <Badge variant="outline" className="text-[10px] px-2.5 py-0.5">Tax Documents</Badge>
              <Badge variant="outline" className="text-[10px] px-2.5 py-0.5">Government ID</Badge>
              <Badge variant="outline" className="text-[10px] px-2.5 py-0.5">Utility Bill</Badge>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}