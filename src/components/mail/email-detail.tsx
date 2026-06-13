'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Star, Archive, ArchiveRestore, Trash2, Reply, ReplyAll,
  Paperclip, Forward, FileText, Download, Tag, Check,
  Plus, X, Clock, CalendarDays, AlarmClockOff, ChevronRight, ChevronUp,
  ChevronDown, Lock, Copy, Mail, MoreVertical, Flag
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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

/* ─── Gmail-style Thread Reply (flat, no box) ─── */

function ThreadMessage({
  message,
  isExpanded,
  onToggle,
}: {
  message: EmailWithSender
  isExpanded: boolean
  onToggle: () => void
}) {
  const initials = getInitials(message.sender)
  const name = message.sender
    ? `${message.sender.firstName} ${message.sender.lastName}`
    : 'Unknown'
  const attachments: Array<{ name: string; url: string; size?: string | number }> = (() => {
    try { return message.attachments ? JSON.parse(message.attachments) : [] }
    catch { return [] }
  })()

  return (
    <>
      {/* Clickable header row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 py-2 text-left cursor-pointer group"
      >
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarImage src={message.sender?.avatar || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#1F1F1F] dark:text-white truncate">{name}</span>
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
          {!isExpanded && (
            <p className="text-xs text-gray-500 truncate mt-0.5 ml-9">
              {message.body?.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').substring(0, 120) || '...'}
            </p>
          )}
        </div>
        <div className="shrink-0 text-gray-400">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-3">
              <div
                className="email-body prose prose-sm max-w-none text-[#1F1F1F] dark:text-gray-200 break-words
                  [&_p]:my-0.5 [&>*:first-child]:mt-0
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
    </>
  )
}

/* ─── Attachment Gallery ─── */

function AttachmentGallery({ attachments }: { attachments: Array<{ name: string; url: string; size?: string | number; data?: string }> }) {
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
            <a key={idx} href={att.data || att.url} target="_blank" rel="noopener noreferrer"
              className="group relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 aspect-square flex items-center justify-center">
              <img src={att.data || att.url} alt={att.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
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
            <a key={idx} href={att.data || att.url} target="_blank" rel="noopener noreferrer"
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
  const [thread, setThread] = useState<EmailWithSender[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [showInfoBox, setShowInfoBox] = useState(false)

  /* ─── Fetch email ─── */
  const fetchEmail = useCallback(async () => {
    if (!selectedEmailId) return
    setLoading(true)
    setShowInfoBox(false)
    try {
      const res = await fetch(`/api/emails/${selectedEmailId}`)
      const data = await res.json()
      if (res.ok) {
        setEmail(data.email)
        setThread(data.thread || [])
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
      setThread([])
    }
  }, [selectedEmailId, fetchEmail])

  // Auto-expand latest message in thread when email loads
  useEffect(() => {
    if (thread.length > 0) {
      const latestId = thread[thread.length - 1].id
      setExpandedReplies(new Set([latestId]))
    } else {
      setExpandedReplies(new Set())
    }
  }, [email?.id, thread])

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

  /* ─── Unarchive ─── */
  const handleUnarchive = async () => {
    if (!email) return
    removeEmail(email.id)
    handleBack()
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      })
      toast.success('Moved to inbox')
    } catch {
      toast.error('Failed to unarchive')
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

  const replies = email.replies || []
  const currentEmailLabels = emailLabelsMap[email.id] || []

  // Use thread array if available (full conversation), otherwise fall back to email + replies
  const threadMessages = thread.length > 0 ? thread : [email, ...replies]
  const selectedId = email?.id

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
            ) : currentFolder === 'archive' ? (
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
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#4285F4]" onClick={handleUnarchive}>
                      <ArchiveRestore className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Unarchive</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-red-500" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete (#)</TooltipContent>
                </Tooltip>
                {/* Three-dot menu - right side after trash */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={handleReply} className="gap-2.5 cursor-pointer">
                      <Reply className="w-4 h-4" /> Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleReplyAll} className="gap-2.5 cursor-pointer">
                      <ReplyAll className="w-4 h-4" /> Reply to all
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleForward} className="gap-2.5 cursor-pointer">
                      <Forward className="w-4 h-4" /> Forward
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 cursor-pointer">
                        <Clock className="w-4 h-4" /> Snooze
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        <DropdownMenuItem onClick={() => handleSnooze(getLaterToday())} className="gap-2.5 cursor-pointer">
                          <Clock className="w-4 h-4" /> Later Today
                          <span className="ml-auto text-xs text-gray-400">5:00 PM</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSnooze(getTomorrow())} className="gap-2.5 cursor-pointer">
                          <Clock className="w-4 h-4" /> Tomorrow
                          <span className="ml-auto text-xs text-gray-400">9:00 AM</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSnooze(getNextWeek())} className="gap-2.5 cursor-pointer">
                          <CalendarDays className="w-4 h-4" /> Next Week
                          <span className="ml-auto text-xs text-gray-400">7 days</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowCustomSnooze(true)} className="gap-2.5 cursor-pointer text-[#4285F4]">
                          <CalendarDays className="w-4 h-4" /> Pick date & time
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 cursor-pointer">
                        <Tag className="w-4 h-4" /> Label
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56 p-2">
                        <LabelManager emailId={email.id} />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toast.success('Email reported as spam')} className="gap-2.5 cursor-pointer">
                      <Flag className="w-4 h-4" /> Report
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} variant="destructive" className="gap-2.5 cursor-pointer">
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Hidden custom snooze popover for Pick date & time */}
                <Popover open={showCustomSnooze} onOpenChange={(open) => { if (!open) { setShowCustomSnooze(false); setShowSnoozePopover(false) } }}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-[#4285F4] opacity-0 pointer-events-none" tabIndex={-1}>
                      <CalendarDays className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="end" side="bottom">
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
                  </PopoverContent>
                </Popover>
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
                {/* Three-dot menu - right side after trash */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={handleReply} className="gap-2.5 cursor-pointer">
                      <Reply className="w-4 h-4" /> Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleReplyAll} className="gap-2.5 cursor-pointer">
                      <ReplyAll className="w-4 h-4" /> Reply to all
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleForward} className="gap-2.5 cursor-pointer">
                      <Forward className="w-4 h-4" /> Forward
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 cursor-pointer">
                        <Clock className="w-4 h-4" /> Snooze
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        <DropdownMenuItem onClick={() => handleSnooze(getLaterToday())} className="gap-2.5 cursor-pointer">
                          <Clock className="w-4 h-4" /> Later Today
                          <span className="ml-auto text-xs text-gray-400">5:00 PM</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSnooze(getTomorrow())} className="gap-2.5 cursor-pointer">
                          <Clock className="w-4 h-4" /> Tomorrow
                          <span className="ml-auto text-xs text-gray-400">9:00 AM</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSnooze(getNextWeek())} className="gap-2.5 cursor-pointer">
                          <CalendarDays className="w-4 h-4" /> Next Week
                          <span className="ml-auto text-xs text-gray-400">7 days</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowCustomSnooze(true)} className="gap-2.5 cursor-pointer text-[#4285F4]">
                          <CalendarDays className="w-4 h-4" /> Pick date & time
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 cursor-pointer">
                        <Tag className="w-4 h-4" /> Label
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56 p-2">
                        <LabelManager emailId={email.id} />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleArchive} className="gap-2.5 cursor-pointer">
                      <Archive className="w-4 h-4" /> Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.success('Email reported as spam')} className="gap-2.5 cursor-pointer">
                      <Flag className="w-4 h-4" /> Report
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} variant="destructive" className="gap-2.5 cursor-pointer">
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Hidden custom snooze popover for Pick date & time */}
                <Popover open={showCustomSnooze} onOpenChange={(open) => { if (!open) { setShowCustomSnooze(false); setShowSnoozePopover(false) } }}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-[#4285F4] opacity-0 pointer-events-none" tabIndex={-1}>
                      <CalendarDays className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="end" side="bottom">
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
                  </PopoverContent>
                </Popover>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-3 sm:px-5 py-3">
          <h1 className="text-base sm:text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1 leading-tight">
            {email.subject || '(No subject)'}
          </h1>

          {/* Label chips */}
          {currentEmailLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
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

          {/* ─── Thread: Full conversation (Gmail-style, flat) ─── */}
          <div className="mb-4">
            {threadMessages.map((msg, idx) => {
              const isSelected = msg.id === selectedId
              // The selected (current) email is always fully shown, others are collapsible
              const isExpanded = isSelected || expandedReplies.has(msg.id)

              return (
                <div key={msg.id}>
                  {idx > 0 && <div className="border-t border-gray-100 dark:border-gray-800" />}
                  {isSelected ? (
                    /* Selected email — always fully shown */
                    <div className="py-1">
                      <div className="flex items-center gap-2.5 mb-1">
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarImage src={msg.sender?.avatar || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-semibold">
                            {getInitials(msg.sender)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#1F1F1F] dark:text-white truncate">
                              {msg.sender ? `${msg.sender.firstName} ${msg.sender.lastName}` : 'Unknown'}
                            </span>
                            <button
                              onClick={() => setShowInfoBox(!showInfoBox)}
                              className="flex items-center gap-1 shrink-0 text-xs text-gray-500 hover:text-[#4285F4] dark:hover:text-[#8AB4F8] transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 px-1.5 py-0.5 cursor-pointer"
                            >
                              <span>to me</span>
                              <motion.span
                                animate={{ rotate: showInfoBox ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="w-3 h-3" />
                              </motion.span>
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                        </div>
                      </div>

                      {/* ─── Gmail-style inline info box ─── */}
                      <AnimatePresence>
                        {showInfoBox && (() => {
                          const senderEm = msg.sender?.email || msg.recipientEmail || ''
                          const recipEm = msg.recipient?.email || msg.recipientEmail || ''
                          const ccData: string[] = (() => { try { const cc = (msg as unknown as Record<string, unknown>).cc; if (!cc) return []; if (Array.isArray(cc)) return cc; if (typeof cc === 'string') return cc.split(',').map((e: string) => e.trim()).filter(Boolean) } catch { return [] } return [] })()
                          const bccData: string[] = (() => { try { const bcc = (msg as unknown as Record<string, unknown>).bcc; if (!bcc) return []; if (Array.isArray(bcc)) return bcc; if (typeof bcc === 'string') return bcc.split(',').map((e: string) => e.trim()).filter(Boolean) } catch { return [] } return [] })()

                          return (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="mx-10 rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900/80 p-3 sm:p-3.5 space-y-2.5 mb-2">
                                {/* From */}
                                <div className="flex items-start gap-3">
                                  <span className="text-xs font-medium text-gray-400 w-9 shrink-0 pt-0.5 text-right">From</span>
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                      <Mail className="w-3 h-3 text-gray-500" />
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate flex-1">{senderEm}</p>
                                    <button
                                      onClick={() => { navigator.clipboard.writeText(senderEm); toast.success('Email copied') }}
                                      className="shrink-0 p-1 rounded-md text-gray-400 hover:text-[#4285F4] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                      title="Copy email"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* To */}
                                <div className="flex items-start gap-3">
                                  <span className="text-xs font-medium text-gray-400 w-9 shrink-0 pt-0.5 text-right">To</span>
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                      <Mail className="w-3 h-3 text-gray-500" />
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate flex-1">{recipEm}</p>
                                    <button
                                      onClick={() => { navigator.clipboard.writeText(recipEm); toast.success('Email copied') }}
                                      className="shrink-0 p-1 rounded-md text-gray-400 hover:text-[#4285F4] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                      title="Copy email"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* CC */}
                                {ccData.length > 0 && (
                                  <div className="flex items-start gap-3">
                                    <span className="text-xs font-medium text-gray-400 w-9 shrink-0 pt-0.5 text-right">CC</span>
                                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                      <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                        <Mail className="w-3 h-3 text-gray-500" />
                                      </div>
                                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{ccData.join(', ')}</p>
                                      <button
                                        onClick={() => { navigator.clipboard.writeText(ccData.join(', ')); toast.success('CC emails copied') }}
                                        className="shrink-0 p-1 rounded-md text-gray-400 hover:text-[#4285F4] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                        title="Copy emails"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* BCC */}
                                {bccData.length > 0 && (
                                  <div className="flex items-start gap-3">
                                    <span className="text-xs font-medium text-gray-400 w-9 shrink-0 pt-0.5 text-right">BCC</span>
                                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                      <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                        <Mail className="w-3 h-3 text-gray-500" />
                                      </div>
                                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{bccData.join(', ')}</p>
                                      <button
                                        onClick={() => { navigator.clipboard.writeText(bccData.join(', ')); toast.success('BCC emails copied') }}
                                        className="shrink-0 p-1 rounded-md text-gray-400 hover:text-[#4285F4] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                                        title="Copy emails"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Date */}
                                <div className="flex items-start gap-3">
                                  <span className="text-xs font-medium text-gray-400 w-9 shrink-0 pt-0.5 text-right">Date</span>
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                      <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                      </svg>
                                    </div>
                                    <p className="text-sm text-[#1F1F1F] dark:text-white">{format(new Date(msg.createdAt), 'd MMM yyyy, h:mm a')}</p>
                                  </div>
                                </div>

                                {/* Encryption */}
                                <div className="flex items-start gap-3">
                                  <span className="text-xs font-medium text-gray-400 w-9 shrink-0 pt-0.5 text-right"></span>
                                  <div className="flex items-center gap-1.5">
                                    <Lock className="w-3 h-3 text-gray-400" />
                                    <span className="text-xs text-gray-500">Standard encryption (TLS).</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )
                        })()}
                      </AnimatePresence>

                      <div>
                        <div
                          className="email-body prose prose-sm max-w-none text-[#1F1F1F] dark:text-gray-200 break-words
                            [&_p]:my-0.5 [&>*:first-child]:mt-0
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
                            __html: msg.bodyHtml || msg.body?.replace(/\n/g, '<br>') || '<p>No content</p>',
                          }}
                        />
                        {(() => {
                          try {
                            const atts = msg.attachments ? JSON.parse(msg.attachments) : []
                            if (atts.length > 0) return <div className="mt-3"><AttachmentGallery attachments={atts} /></div>
                          } catch {}
                          return null
                        })()}
                      </div>
                    </div>
                  ) : (
                    /* Other thread messages — collapsible */
                    <ThreadMessage
                      message={msg}
                      isExpanded={isExpanded}
                      onToggle={() => toggleReply(msg.id)}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {/* ─── Reply / Restore / Forward Bar (inside scrollable content) ─── */}
          <div className="border-t border-gray-200 dark:border-gray-800 px-2 sm:px-4 py-2 mt-1">
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
            ) : currentFolder === 'archive' ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium text-[#4285F4] border-[#4285F4]/30 hover:bg-[#D3E3FD]/50"
                  onClick={handleUnarchive}
                >
                  <ArchiveRestore className="w-4 h-4" />
                  Unarchive
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
