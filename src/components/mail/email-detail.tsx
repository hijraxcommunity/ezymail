'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Star, Archive, ArchiveRestore, Trash2, Reply, ReplyAll,
  Paperclip, Forward, FileText, Download, Tag, Check,
  Plus, X, Clock, CalendarDays, AlarmClockOff, ChevronDown, ChevronRight, ChevronUp
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmailDetailSkeleton } from '@/components/shared/loading-skeleton'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { useAppStore, type EmailWithSender, type Label } from '@/store/use-app-store'

/* ─── Helpers ─── */

function isImageFile(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)
}

function formatFileSize(bytes?: string | number) {
  if (!bytes) return ''
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (isNaN(n)) return bytes
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function getInitials(user: { firstName?: string; lastName?: string } | null | undefined, fallback = 'U') {
  if (!user) return fallback
  return `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase() || fallback
}

/* ─── Gmail-style Thread Message Card ─── */

function ThreadMessage({
  message,
  isExpanded,
  isLatest,
  onToggle,
}: {
  message: EmailWithSender
  isExpanded: boolean
  isLatest: boolean
  onToggle: () => void
}) {
  const initials = getInitials(message.sender)
  const name = message.sender
    ? `${message.sender.firstName} ${message.sender.lastName}`
    : 'Unknown'
  const emailAddr = message.sender?.email || ''
  const attachments: Array<{ name: string; url: string; size?: string | number }> = (() => {
    try { return message.attachments ? JSON.parse(message.attachments) : [] }
    catch { return [] }
  })()

  return (
    <div className={`rounded-lg border ${isLatest && isExpanded ? 'border-[#D3E3FD] dark:border-[#4285F4]/30 shadow-sm' : 'border-gray-200 dark:border-gray-800'} bg-white dark:bg-gray-950 overflow-hidden`}>
      {/* Header — always visible, clickable to expand/collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors text-left cursor-pointer"
      >
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarImage src={message.sender?.avatar || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F] dark:text-white truncate">{name}</span>
            <span className="text-xs text-gray-400 truncate">&lt;{emailAddr}&gt;</span>
          </div>
          {!isExpanded && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {message.body?.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').substring(0, 100) || '...'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 hidden sm:inline">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Body — only shown when expanded */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
              <div
                className="email-body prose prose-sm max-w-none text-[#1F1F1F] dark:text-gray-200 break-words
                  [&_a]:text-[#4285F4] [&_a]:underline [&_a:hover]:text-[#1a73e8]
                  [&_blockquote]:border-l-2 [&_blockquote]:border-[#D3E3FD] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-500
                  [&_img]:max-w-full [&_img]:rounded-lg
                  [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
                  [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:rounded [&_code]:px-1
                  [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
                  [&_table]:border-collapse [&_table]:w-full
                  [&_td]:border [&_td]:border-gray-200 [&_td]:dark:border-gray-700 [&_td]:p-2
                  [&_th]:border [&_th]:border-gray-200 [&_th]:dark:border-gray-700 [&_th]:bg-gray-50 [&_th]:dark:bg-gray-800 [&_th]:p-2"
                dangerouslySetInnerHTML={{ __html: message.bodyHtml || message.body?.replace(/\n/g, '<br>') || '<p>No content</p>' }}
              />
              {attachments.length > 0 && (
                <div className="mt-3"><AttachmentGallery attachments={attachments} /></div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Attachment Gallery ─── */

function AttachmentGallery({ attachments }: { attachments: Array<{ name: string; url: string; size?: string | number }> }) {
  const images = attachments.filter((a) => isImageFile(a.name))
  const docs = attachments.filter((a) => !isImageFile(a.name))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
          {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
        </span>
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((att, idx) => (
            <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
              className="group relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 aspect-square flex items-center justify-center">
              <img src={att.url} alt={att.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-white truncate">{att.name}</p>
              </div>
            </a>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {docs.map((att, idx) => (
            <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-[#4285F4]/30 hover:bg-[#D3E3FD]/30 dark:hover:bg-[#4285F4]/5 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-[#D3E3FD] dark:bg-[#4285F4]/20 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-[#4285F4]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-[#1F1F1F] dark:text-white group-hover:text-[#4285F4] transition-colors">{att.name}</p>
                {att.size && <p className="text-xs text-gray-500">{formatFileSize(att.size)}</p>}
              </div>
              <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Label Manager Popover ─── */

function LabelManager({ emailId }: { emailId: string }) {
  const { labels, emailLabelsMap, setEmailLabels, setLabels, addLabel } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#4285F4')
  const [isAdding, setIsAdding] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)

  const currentLabels = emailLabelsMap[emailId] || []
  const appliedIds = new Set(currentLabels.map((l) => l.id))

  const handleToggleLabel = async (label: Label) => {
    const isApplied = appliedIds.has(label.id)

    if (isApplied) {
      // Remove label from email
      setIsRemoving(label.id)
      try {
        const res = await fetch(`/api/emails/${emailId}/labels`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labelIds: [label.id] }),
        })
        const data = await res.json()
        if (data.success) {
          setEmailLabels(emailId, data.data)
        }
      } catch {
        toast.error('Failed to remove label')
      } finally {
        setIsRemoving(null)
      }
    } else {
      // Add label to email
      setIsAdding(label.id)
      try {
        const res = await fetch(`/api/emails/${emailId}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labelIds: [label.id] }),
        })
        const data = await res.json()
        if (data.success) {
          setEmailLabels(emailId, data.data)
        }
      } catch {
        toast.error('Failed to add label')
      } finally {
        setIsAdding(null)
      }
    }
  }

  const handleCreateLabel = async () => {
    const name = newName.trim()
    if (!name) return

    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      })
      const data = await res.json()
      if (data.success) {
        addLabel(data.data)
        setNewName('')
        setNewColor('#4285F4')
        setShowCreate(false)
        toast.success('Label created')
      } else {
        toast.error(data.error || 'Failed to create label')
      }
    } catch {
      toast.error('Failed to create label')
    }
  }

  return (
    <DropdownMenuContent align="end" className="w-56 p-0">
      <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Labels
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="max-h-48 overflow-y-auto">
        {labels.map((label) => {
          const isApplied = appliedIds.has(label.id)
          const isLoading = isAdding === label.id || isRemoving === label.id
          return (
            <DropdownMenuItem
              key={label.id}
              onClick={() => handleToggleLabel(label)}
              disabled={isLoading}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              ) : isApplied ? (
                <div
                  className="w-4 h-4 rounded-sm flex items-center justify-center shrink-0"
                  style={{ backgroundColor: label.color }}
                >
                  <Check className="w-3 h-3 text-white" />
                </div>
              ) : (
                <div
                  className="w-4 h-4 rounded-sm border-2 shrink-0"
                  style={{ borderColor: label.color }}
                />
              )}
              <span className="flex-1 text-sm truncate">{label.name}</span>
            </DropdownMenuItem>
          )
        })}
        {labels.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            No labels yet
          </div>
        )}
      </div>
      <DropdownMenuSeparator />
      <div className="p-2">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[#4285F4] hover:bg-[#D3E3FD]/50 dark:hover:bg-[#4285F4]/10 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create new label
          </button>
        ) : (
          <div className="space-y-2 p-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateLabel()
                if (e.key === 'Escape') setShowCreate(false)
              }}
              placeholder="Label name"
              className="h-7 text-xs"
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              {['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01', '#E91E63'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-4 h-4 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-1 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleCreateLabel}
                className="flex-1 text-xs text-[#4285F4] font-medium hover:bg-[#D3E3FD]/50 rounded-md py-1 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="text-xs text-gray-500 hover:bg-gray-100 rounded-md px-2 py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </DropdownMenuContent>
  )
}

/* ═══════════════════════════════════════════
   Main EmailDetail Component
   ═══════════════════════════════════════════ */

export function EmailDetail() {
  const {
    selectedEmailId,
    setEmailDetailOpen,
    setSelectedEmailId,
    removeEmail,
    updateEmail,
    setReplyToEmail,
    emailLabelsMap,
    setEmailLabels,
    currentFolder,
  } = useAppStore()

  const [email, setEmail] = useState<EmailWithSender | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  /* ─── Fetch email ─── */
  const fetchEmail = useCallback(async () => {
    if (!selectedEmailId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/emails/${selectedEmailId}`)
      const data = await res.json()
      if (res.ok) {
        setEmail(data.email)
        if (!data.email.isRead) {
          updateEmail(data.email.id, { isRead: true })
          fetch(`/api/emails/${selectedEmailId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isRead: true }),
          }).catch(() => {})
        }
      }
    } catch {
      toast.error('Failed to load email')
    } finally {
      setLoading(false)
    }
  }, [selectedEmailId, updateEmail])

  useEffect(() => {
    if (selectedEmailId) {
      fetchEmail()
    } else {
      setEmail(null)
    }
  }, [selectedEmailId, fetchEmail])

  // Auto-expand latest reply when email loads
  useEffect(() => {
    if (email?.replies && email.replies.length > 0) {
      const latestReplyId = email.replies[email.replies.length - 1].id
      setExpandedReplies(new Set([latestReplyId]))
    } else {
      setExpandedReplies(new Set())
    }
  }, [email?.id, email?.replies])

  const toggleReply = useCallback((replyId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(replyId)) {
        next.delete(replyId)
      } else {
        next.add(replyId)
      }
      return next
    })
  }, [])

  /* ─── Fetch email labels ─── */
  useEffect(() => {
    if (!selectedEmailId) return
    if (emailLabelsMap[selectedEmailId]) return

    fetch(`/api/emails/${selectedEmailId}/labels`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEmailLabels(selectedEmailId, data.data)
        }
      })
      .catch(() => {})
  }, [selectedEmailId, emailLabelsMap, setEmailLabels])

  /* ─── Back navigation ─── */
  const handleBack = useCallback(() => {
    setSelectedEmailId(null)
    setEmailDetailOpen(false)
  }, [setSelectedEmailId, setEmailDetailOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEmailId) {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedEmailId, handleBack])

  /* ─── Star toggle ─── */
  const handleStar = async () => {
    if (!email) return
    const v = !email.isStarred
    updateEmail(email.id, { isStarred: v })
    setEmail({ ...email, isStarred: v })
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: v }),
      })
    } catch {
      toast.error('Failed to update')
    }
  }

  /* ─── Archive ─── */
  const handleArchive = async () => {
    if (!email) return
    removeEmail(email.id)
    handleBack()
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      })
      toast.success('Email archived')
    } catch {
      toast.error('Failed to archive')
    }
  }

  /* ─── Delete ─── */
  const handleDelete = async () => {
    if (!email) return
    if (currentFolder === 'trash') {
      setShowDeleteConfirm(true)
      return
    }
    removeEmail(email.id)
    handleBack()
    try {
      await fetch(`/api/emails/${email.id}`, { method: 'DELETE' })
      toast.success('Email deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const confirmDelete = async () => {
    if (!email) return
    setShowDeleteConfirm(false)
    removeEmail(email.id)
    handleBack()
    try {
      await fetch(`/api/emails/${email.id}`, { method: 'DELETE' })
      toast.success('Email permanently deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  /* ─── Restore (trash → inbox) ─── */
  const handleRestore = async () => {
    if (!email) return
    removeEmail(email.id)
    handleBack()
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'inbox', isArchived: false }),
      })
      toast.success('Email restored to inbox')
    } catch {
      toast.error('Failed to restore')
    }
  }

  /* ─── Snooze ─── */
  const [showSnoozePopover, setShowSnoozePopover] = useState(false)
  const [snoozeDate, setSnoozeDate] = useState<Date | undefined>(undefined)
  const [snoozeTime, setSnoozeTime] = useState('09:00')
  const [showCustomSnooze, setShowCustomSnooze] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const getLaterToday = () => {
    const d = new Date()
    d.setHours(17, 0, 0, 0)
    if (d <= new Date()) d.setDate(d.getDate() + 1)
    return d
  }
  const getTomorrow = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }
  const getNextWeek = () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    d.setHours(9, 0, 0, 0)
    return d
  }

  const handleSnooze = async (date: Date) => {
    if (!email) return
    try {
      const res = await fetch(`/api/emails/${email.id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozeUntil: date.toISOString() }),
      })
      const data = await res.json()
      if (data.success) {
        removeEmail(email.id)
        handleBack()
        toast.success(`Snoozed until ${date.toLocaleString()}`)
      } else {
        toast.error(data.error || 'Failed to snooze')
      }
    } catch {
      toast.error('Failed to snooze')
    }
  }

  const handleCustomSnooze = () => {
    if (!snoozeDate) return
    const [hours, minutes] = snoozeTime.split(':').map(Number)
    const d = new Date(snoozeDate)
    d.setHours(hours, minutes, 0, 0)
    if (d <= new Date()) {
      toast.error('Please select a future date and time')
      return
    }
    handleSnooze(d)
  }

  /* ─── Unsnooze ─── */
  const handleUnsnooze = async () => {
    if (!email) return
    removeEmail(email.id)
    handleBack()
    try {
      await fetch(`/api/emails/${email.id}/snooze`, { method: 'DELETE' })
      toast.success('Email unsnoozed')
    } catch {
      toast.error('Failed to unsnooze')
    }
  }

  /* ─── Gmail-style Reply / Reply All / Forward — opens compose modal ─── */
  const handleReply = () => {
    if (!email) return
    setReplyToEmail({ ...email }, 'reply')
  }

  const handleReplyAll = () => {
    if (!email) return
    setReplyToEmail({ ...email }, 'replyAll')
  }

  const handleForward = () => {
    if (!email) return
    setReplyToEmail({ ...email }, 'forward')
  }

  /* ─── Empty state ─── */
  if (!selectedEmailId) {
    return (
      <div className="flex-1 hidden md:flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 h-full md:border-l md:border-gray-100 md:dark:border-gray-800">
        <div className="text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">Select an email</h3>
          <p className="text-sm text-gray-500">Choose an email to read</p>
        </div>
      </div>
    )
  }

  if (loading) return <EmailDetailSkeleton />
  if (!email) return null

  const senderName = email.sender
    ? `${email.sender.firstName} ${email.sender.lastName}`
    : email.recipientEmail
  const initials = getInitials(email.sender)
  const senderEmail = email.sender?.email || email.recipientEmail
  const attachments: Array<{ name: string; url: string; size?: string | number }> = (() => {
    try { return email.attachments ? JSON.parse(email.attachments) : [] }
    catch { return [] }
  })()
  const replies = email.replies || []
  const currentEmailLabels = emailLabelsMap[email.id] || []

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-950 h-full pb-14 md:pb-0 md:border-l md:border-gray-100 md:dark:border-gray-800">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="sr-only sm:not-sr-only text-sm text-gray-500 cursor-pointer select-none" onClick={handleBack}>
            Back
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            {currentFolder === 'trash' ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#4285F4]" onClick={handleRestore}>
                      <ArchiveRestore className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Restore</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-red-500" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete</TooltipContent>
                </Tooltip>
              </>
            ) : currentFolder === 'snoozed' ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#4285F4]" onClick={handleUnsnooze}>
                      <AlarmClockOff className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Unsnooze</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-red-500" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={`h-9 w-9 ${email.isStarred ? 'text-amber-500' : ''}`} onClick={handleStar}>
                      <Star className={`w-4 h-4 ${email.isStarred ? 'fill-amber-500' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{email.isStarred ? 'Unstar (s)' : 'Star (s)'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleArchive}>
                      <Archive className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Archive (e)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-red-500" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete (#)</TooltipContent>
                </Tooltip>
                {/* Snooze button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Popover open={showSnoozePopover} onOpenChange={setShowSnoozePopover}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-[#4285F4]">
                          <Clock className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-60 p-0" align="end" side="bottom">
                        <div className="px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Snooze</p>
                        </div>
                        <Separator />
                        <div className="p-1">
                          <button
                            type="button"
                            onClick={() => handleSnooze(getLaterToday())}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                          >
                            <Clock className="w-4 h-4 text-gray-400" />
                            <div className="text-left">
                              <p className="text-sm font-medium">Later Today</p>
                              <p className="text-xs text-gray-400">5:00 PM</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSnooze(getTomorrow())}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                          >
                            <Clock className="w-4 h-4 text-gray-400" />
                            <div className="text-left">
                              <p className="text-sm font-medium">Tomorrow</p>
                              <p className="text-xs text-gray-400">9:00 AM</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSnooze(getNextWeek())}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                          >
                            <CalendarDays className="w-4 h-4 text-gray-400" />
                            <div className="text-left">
                              <p className="text-sm font-medium">Next Week</p>
                              <p className="text-xs text-gray-400">7 days</p>
                            </div>
                          </button>
                          <Separator className="my-1" />
                          <button
                            type="button"
                            onClick={() => setShowCustomSnooze(true)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#4285F4] hover:bg-[#D3E3FD]/50 dark:hover:bg-[#4285F4]/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <CalendarDays className="w-4 h-4" />
                            <span className="text-sm font-medium">Pick date & time</span>
                          </button>
                        </div>
                        <AnimatePresence>
                          {showCustomSnooze && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <Separator />
                              <div className="p-3 space-y-3">
                                <Calendar
                                  mode="single"
                                  selected={snoozeDate}
                                  onSelect={setSnoozeDate}
                                  disabled={{ before: new Date() }}
                                  className="rounded-md border p-1"
                                  modifiersClassNames={{
                                    selected: 'bg-[#4285F4] text-white rounded-md',
                                    today: 'bg-[#D3E3FD] dark:bg-[#4285F4]/20 rounded-md',
                                  }}
                                />
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500 shrink-0">Time:</label>
                                  <Input
                                    type="time"
                                    value={snoozeTime}
                                    onChange={(e) => setSnoozeTime(e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs flex-1 bg-[#4285F4] hover:bg-[#1a73e8]"
                                    onClick={handleCustomSnooze}
                                    disabled={!snoozeDate}
                                  >
                                    <Check className="w-3 h-3 mr-1" />
                                    Snooze
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs"
                                    onClick={() => setShowCustomSnooze(false)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </PopoverContent>
                    </Popover>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Snooze (z)</TooltipContent>
                </Tooltip>

                {/* Labels dropdown */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-[#4285F4]">
                          <Tag className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <LabelManager emailId={email.id} />
                    </DropdownMenu>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Labels (l)</TooltipContent>
                </Tooltip>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-4 sm:p-6">
          <h1 className="text-lg sm:text-xl font-semibold text-[#1F1F1F] dark:text-white mb-2 leading-tight">
            {email.subject || '(No subject)'}
          </h1>

          {/* Label chips */}
          {currentEmailLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {currentEmailLabels.map((label) => (
                <Badge
                  key={label.id}
                  variant="secondary"
                  className="text-xs font-medium px-2 py-0.5 border-0 gap-1"
                  style={{
                    backgroundColor: `${label.color}18`,
                    color: label.color,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </Badge>
              ))}
            </div>
          )}

          {/* ─── Gmail-style Thread: Original Email + All Replies ─── */}
          <div className="space-y-3 mb-6">
            {/* Original email card */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={email.sender?.avatar || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#1F1F1F] dark:text-white truncate">{senderName}</span>
                      <span className="text-xs text-gray-400 truncate">&lt;{senderEmail}&gt;</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3">
                <div
                  className="email-body prose prose-sm max-w-none text-[#1F1F1F] dark:text-gray-200 break-words
                    [&_a]:text-[#4285F4] [&_a]:underline [&_a:hover]:text-[#1a73e8]
                    [&_blockquote]:border-l-2 [&_blockquote]:border-[#D3E3FD] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-500
                    [&_img]:max-w-full [&_img]:rounded-lg
                    [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
                    [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:rounded [&_code]:px-1
                    [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
                    [&_table]:border-collapse [&_table]:w-full
                    [&_td]:border [&_td]:border-gray-200 [&_td]:dark:border-gray-700 [&_td]:p-2
                    [&_th]:border [&_th]:border-gray-200 [&_th]:dark:border-gray-700 [&_th]:bg-gray-50 [&_th]:dark:bg-gray-800 [&_th]:p-2"
                  dangerouslySetInnerHTML={{
                    __html: email.bodyHtml || email.body?.replace(/\n/g, '<br>') || '<p>No content</p>',
                  }}
                />
                {attachments.length > 0 && (
                  <div className="mt-3"><AttachmentGallery attachments={attachments} /></div>
                )}
              </div>
            </div>

            {/* Reply cards — collapsible, newest at bottom, latest auto-expanded */}
            {replies.length > 0 && (
              <div className="space-y-2">
                {replies.map((reply) => (
                  <ThreadMessage
                    key={reply.id}
                    message={reply}
                    isExpanded={expandedReplies.has(reply.id)}
                    isLatest={replies.length > 0 && reply.id === replies[replies.length - 1].id}
                    onToggle={() => toggleReply(reply.id)}
                  />
                ))}
              </div>
            )}
          </div>
          {/* ─── Reply / Restore / Forward Bar (inside scrollable content) ─── */}
          <div className="border-t border-gray-200 dark:border-gray-800 px-3 sm:px-4 py-2.5 mt-2">
            {currentFolder === 'trash' ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium text-[#4285F4] border-[#4285F4]/30 hover:bg-[#D3E3FD]/50"
                  onClick={handleRestore}
                >
                  <ArchiveRestore className="w-4 h-4" />
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium text-red-500 border-red-200 hover:bg-red-50"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            ) : currentFolder === 'snoozed' ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium text-[#4285F4] border-[#4285F4]/30 hover:bg-[#D3E3FD]/50"
                  onClick={handleUnsnooze}
                >
                  <AlarmClockOff className="w-4 h-4" />
                  Unsnooze
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium text-red-500 border-red-200 hover:bg-red-50"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium flex-1 max-w-[140px]"
                  onClick={handleReply}
                >
                  <Reply className="w-4 h-4" />
                  Reply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium flex-1 max-w-[140px]"
                  onClick={handleReplyAll}
                >
                  <ReplyAll className="w-4 h-4" />
                  Reply All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium flex-1 max-w-[140px]"
                  onClick={handleForward}
                >
                  <Forward className="w-4 h-4" />
                  Forward
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete email?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This email will be permanently removed from Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
