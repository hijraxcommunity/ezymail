'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Star, Archive, ArchiveRestore, Trash2, Reply, ReplyAll,
  Paperclip, Forward, FileText, Download, Check, Pencil,
  Plus, X, Clock, CalendarDays, AlarmClockOff, ChevronRight, ChevronUp,
  ChevronDown, Lock, Copy, Mail, MoreVertical, Flag, Sun, Sunset, Briefcase
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
import { useAppStore, type EmailWithSender } from '@/store/use-app-store'

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

/* ─── Strip quoted text from email HTML (Gmail-style thread) ─── */

/**
 * Detects and strips quoted content from email HTML.
 *
 * IMPORTANT: TipTap editor strips <div style="border-left:..."> wrappers,
 * so stored bodyHtml never has border-left divs. Instead the markers are
 * plain <p> tags:
 *   <p>On 8/10/2026, 5:30 PM, Name wrote:</p>
 *   <p>---------- Forwarded message ----------</p>
 *
 * We also handle raw HTML (border-left divs) for any legacy/external emails.
 * Returns { clean, quoted } so we can optionally show the quoted part.
 */
function stripQuotedHtml(html: string): { clean: string; quoted: string | null } {
  if (!html) return { clean: html, quoted: null }

  let quoteIndex = -1

  // Pattern A (TipTap output): <p>On [date], [name] wrote:</p>
  const onWrote = /<p>\s*On\s+[^<]*?wrote\s*:\s*<\/p>/i
  const m1 = onWrote.exec(html)
  if (m1 && m1.index > 0 && (quoteIndex === -1 || m1.index < quoteIndex)) {
    quoteIndex = m1.index
  }

  // Pattern B (TipTap output): <p>---------- Forwarded message ----------</p>
  const fwd = /<p>\s*-{5,}\s*Forwarded\s+message\s*-{5,}\s*<\/p>/i
  const m2 = fwd.exec(html)
  if (m2 && m2.index > 0 && (quoteIndex === -1 || m2.index < quoteIndex)) {
    quoteIndex = m2.index
  }

  // Pattern C (raw HTML): <div style="border-left:...">
  const divBorder = /<div\s[^>]*style="[^"]*border-left[^"]*"[^>]*>/i
  const m3 = divBorder.exec(html)
  if (m3 && m3.index > 0 && (quoteIndex === -1 || m3.index < quoteIndex)) {
    quoteIndex = m3.index
  }

  // Pattern D (raw text marker): -----Original Message-----
  const origMsg = /-{5,}\s*Original\s+Message\s*-{5,}/i
  const m4 = origMsg.exec(html)
  if (m4 && m4.index > 0 && (quoteIndex === -1 || m4.index < quoteIndex)) {
    quoteIndex = m4.index
  }

  if (quoteIndex > 0) {
    // Strip trailing empty <p>, <br>, whitespace before the quote block
    const before = html.substring(0, quoteIndex)
    const clean = before
      .replace(/(\s*(?:<p>\s*(?:<br\s*\/?>)?\s*<\/p>|<br\s*\/?>)\s*)+$/, '')
      .trim()
    if (clean.length > 0) {
      return { clean, quoted: html.substring(quoteIndex) }
    }
  }

  return { clean: html, quoted: null }
}

/** Strip quoted text from plain text body */
function stripQuotedText(text: string): string {
  if (!text) return text
  // Match "On [date], [name] wrote:" line and everything after
  const quoteMatch = text.match(/\nOn\s+.+\s+wrote:\s*[\s\S]*$/i)
  if (quoteMatch && quoteMatch.index !== undefined && quoteMatch.index > 0) {
    return text.substring(0, quoteMatch.index).trim() || text
  }
  // Match "-----Original Message-----" and everything after
  const origMatch = text.match(/\n[_\-]{5,}\s*Original\s+Message[_\-]{5,}[\s\S]*$/i)
  if (origMatch && origMatch.index !== undefined && origMatch.index > 0) {
    return text.substring(0, origMatch.index).trim() || text
  }
  return text
}

/** Small component to show/hide quoted text */
function QuotedTextToggle({ quotedHtml }: { quotedHtml: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mt-2">
      {!show ? (
        <button
          type="button"
          onClick={() => setShow(true)}
          className="text-xs text-[#4285F4] hover:text-[#1a73e8] dark:text-[#8AB4F8] dark:hover:text-[#4285F4] cursor-pointer flex items-center gap-1"
        >
          <ChevronRight className="w-3 h-3" />
          Show quoted text
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="text-xs text-[#4285F4] hover:text-[#1a73e8] dark:text-[#8AB4F8] dark:hover:text-[#4285F4] cursor-pointer flex items-center gap-1 mb-1"
          >
            <ChevronDown className="w-3 h-3" />
            Hide quoted text
          </button>
          <div
            className="email-body prose prose-sm max-w-none text-[#1F1F1F] dark:text-gray-200 break-words
              [&_p]:my-0.5
              [&_a]:text-[#4285F4] [&_a]:underline [&_a:hover]:text-[#1a73e8]
              [&_blockquote]:border-l-2 [&_blockquote]:border-[#D3E3FD] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-500
              [&_img]:max-w-full [&_img]:rounded-lg
              [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
              [&_code]:text-xs [&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:rounded [&_code]:px-1
              [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
              [&_table]:border-collapse [&_table]:w-full
              [&_td]:border [&_td]:border-gray-200 [&_td]:dark:border-gray-700 [&_td]:p-2
              [&_th]:border [&_th]:border-gray-200 [&_th]:dark:border-gray-700 [&_th]:bg-gray-50 [&_th]:dark:bg-gray-800 [&_th]:p-2"
            dangerouslySetInnerHTML={{ __html: quotedHtml }}
          />
        </>
      )}
    </div>
  )
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

  // Strip quoted text for display
  const rawHtml = message.bodyHtml || message.body?.replace(/\n/g, '<br>') || '<p>No content</p>'
  const { clean: cleanHtml, quoted: quotedHtml } = stripQuotedHtml(rawHtml)
  const previewText = stripQuotedText(message.body?.replace(/<[^>]*>/g, '') || '').replace(/\n/g, ' ').substring(0, 120) || '...'

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
              {previewText}
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
                dangerouslySetInnerHTML={{ __html: cleanHtml || '<p>No content</p>' }}
              />
              {quotedHtml && <QuotedTextToggle quotedHtml={quotedHtml} />}
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
    currentFolder,
    setEditDraftEmail,
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
      setShowSnoozeModal(false)
      setShowCustomSnooze(false)
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

  const handleReportSpam = async () => {
    if (!email) return
    try {
      const res = await fetch(`/api/emails/${email.id}/report-spam`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        removeEmail(email.id)
        handleBack()
        toast.success('Reported as spam')
      } else {
        toast.error(json.error || 'Failed to report')
      }
    } catch {
      toast.error('Failed to report spam')
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

  /* ─── Edit Draft ─── */
  const handleEditDraft = useCallback(() => {
    if (!email) return
    setEditDraftEmail(email)
    setEmailDetailOpen(false)
    setSelectedEmailId(null)
  }, [email, setEditDraftEmail, setEmailDetailOpen, setSelectedEmailId])

  /* ─── Snooze ─── */
  const [showSnoozePopover, setShowSnoozePopover] = useState(false)
  const [snoozeDate, setSnoozeDate] = useState<Date | undefined>(undefined)
  const [snoozeHour, setSnoozeHour] = useState('9')
  const [snoozeMinute, setSnoozeMinute] = useState('00')
  const [snoozeAmPm, setSnoozeAmPm] = useState<'AM' | 'PM'>('AM')
  const [showCustomSnooze, setShowCustomSnooze] = useState(false)
  const [showSnoozeModal, setShowSnoozeModal] = useState(false)
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
  const getLaterThisWeek = () => {
    const d = new Date()
    const dayOfWeek = d.getDay()
    const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek)
    d.setDate(d.getDate() + daysUntilMon)
    d.setHours(8, 0, 0, 0)
    return d
  }
  const getThisWeekend = () => {
    const d = new Date()
    const dayOfWeek = d.getDay()
    const daysUntilSat = dayOfWeek === 0 ? 6 : (6 - dayOfWeek)
    d.setDate(d.getDate() + daysUntilSat)
    d.setHours(8, 0, 0, 0)
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
    const hr = parseInt(snoozeHour) || 0
    let hours = snoozeAmPm === 'PM' && hr !== 12 ? hr + 12 : snoozeAmPm === 'AM' && hr === 12 ? 0 : hr
    const minutes = parseInt(snoozeMinute) || 0
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

  // Use thread array if available (full conversation), otherwise fall back to email + replies
  const threadMessages = thread.length > 0 ? thread : [email, ...replies]
  const selectedId = email?.id

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-950 h-full pb-14 md:pb-0 md:border-l md:border-gray-100 md:dark:border-gray-800">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between pl-3 sm:pl-4 h-12 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="sr-only sm:not-sr-only text-sm text-gray-500 cursor-pointer select-none" onClick={handleBack}>
            Back
          </span>
        </div>
        <div className="flex items-center gap-0.5 ml-auto">
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
                    <DropdownMenuItem onClick={() => { setShowSnoozeModal(true) }} className="gap-2.5 cursor-pointer">
                      <Clock className="w-4 h-4" /> Snooze
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleReportSpam} className="gap-2.5 cursor-pointer">
                      <Flag className="w-4 h-4" /> Report
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} variant="destructive" className="gap-2.5 cursor-pointer">
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : currentFolder === 'drafts' ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#4285F4]" onClick={handleEditDraft}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Edit Draft</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-red-500" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete (#)</TooltipContent>
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
                    <DropdownMenuItem onClick={() => { setShowSnoozeModal(true) }} className="gap-2.5 cursor-pointer">
                      <Clock className="w-4 h-4" /> Snooze
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleArchive} className="gap-2.5 cursor-pointer">
                      <Archive className="w-4 h-4" /> Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleReportSpam} className="gap-2.5 cursor-pointer">
                      <Flag className="w-4 h-4" /> Report
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} variant="destructive" className="gap-2.5 cursor-pointer">
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto overscroll-contain gpu-scroll">
        <div className="px-3 sm:px-5 py-3">
          <h1 className="text-base sm:text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1 leading-tight">
            {email.subject || '(No subject)'}
          </h1>

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
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                      <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                        <Mail className="w-3 h-3 text-gray-500" />
                                      </div>
                                      <p className="text-sm text-gray-600 dark:text-gray-300 md:truncate max-md:[white-space:normal] max-md:[overflow-wrap:anywhere] max-md:[word-break:break-word] flex-1">{ccData.join(', ')}</p>
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
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                      <div className="w-6 h-6 rounded-full shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                        <Mail className="w-3 h-3 text-gray-500" />
                                      </div>
                                      <p className="text-sm text-gray-600 dark:text-gray-300 md:truncate max-md:[white-space:normal] max-md:[overflow-wrap:anywhere] max-md:[word-break:break-word] flex-1">{bccData.join(', ')}</p>
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
                        {(() => {
                          const rawHtml = msg.bodyHtml || msg.body?.replace(/\n/g, '<br>') || '<p>No content</p>'
                          const { clean: selectedCleanHtml, quoted: selectedQuotedHtml } = stripQuotedHtml(rawHtml)
                          return (
                            <>
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
                                  __html: selectedCleanHtml || '<p>No content</p>',
                                }}
                              />
                              {selectedQuotedHtml && <QuotedTextToggle quotedHtml={selectedQuotedHtml} />}
                            </>
                          )
                        })()}
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
            ) : currentFolder === 'drafts' ? (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium flex-1 max-w-[140px] text-[#4285F4] border-[#4285F4]/30 hover:bg-[#D3E3FD]/50"
                  onClick={handleEditDraft}
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm font-medium flex-1 max-w-[140px] text-red-500 border-red-200 hover:bg-red-50"
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

      {/* ─── Snooze Modal (Schedule-style) ─── */}
      <AnimatePresence>
        {showSnoozeModal && !showCustomSnooze && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={() => setShowSnoozeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 sm:p-5 w-[280px] sm:w-[320px] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSnooze(getLaterToday())}
                  className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Sunset className="w-5 h-5 text-[#FBBC05]" />
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Later today</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{format(getLaterToday(), 'd MMM, h:mm a')}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(getTomorrow())}
                  className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Sun className="w-5 h-5 text-[#FBBC05]" />
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Tomorrow</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{format(getTomorrow(), 'd MMM, h:mm a')}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(getLaterThisWeek())}
                  className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Briefcase className="w-5 h-5 text-[#FBBC05]" />
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Later this week</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{format(getLaterThisWeek(), 'd MMM, h:mm a')}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomSnooze(true)}
                  className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <CalendarDays className="w-5 h-5 text-[#FBBC05]" />
                  <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Pick date & time</p>
                </button>
              </div>
              <p className="text-center text-[11px] text-gray-400 mt-3">
                All times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snooze Custom date/time picker modal */}
      <AnimatePresence>
        {showSnoozeModal && showCustomSnooze && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={() => { setShowCustomSnooze(false); setShowSnoozeModal(false) }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 sm:p-5 w-[280px] sm:w-[320px] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Select date and time</p>
              <div className="[&_[data-slot=calendar]]:w-full [&_[data-slot=calendar]]:mx-auto [&_[data-slot=calendar]]:p-1.5" style={{ '--cell-size': '1.6rem' } as React.CSSProperties}>
                <Calendar
                  mode="single"
                  selected={snoozeDate}
                  onSelect={setSnoozeDate}
                  disabled={{ before: new Date() }}
                  classNames={{
                    root: 'w-full',
                    table: 'w-full border-collapse',
                    weekday: 'text-[10px] flex-1',
                    day: 'flex-1 p-0 aspect-square',
                    today: 'bg-[#D3E3FD] dark:bg-[#4285F4]/20 rounded-md data-[selected=true]:rounded-none',
                  }}
                  modifiersClassNames={{
                    selected: 'bg-[#4285F4] text-white rounded-md',
                    today: 'bg-[#D3E3FD] dark:bg-[#4285F4]/20 rounded-md',
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Time:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={snoozeHour}
                  onChange={(e) => setSnoozeHour(e.target.value.replace(/[^1-9]/g, '').slice(0, 2))}
                  placeholder="9"
                  className="w-10 h-8 text-center text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent text-gray-900 dark:text-white"
                />
                <span className="text-sm text-gray-400">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={snoozeMinute}
                  onChange={(e) => setSnoozeMinute(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder="00"
                  className="w-10 h-8 text-center text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent text-gray-900 dark:text-white"
                />
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={() => setSnoozeAmPm('AM')}
                    className={`px-2 h-8 text-[11px] font-medium transition-colors cursor-pointer ${snoozeAmPm === 'AM' ? 'bg-[#4285F4] text-white' : 'bg-transparent text-gray-500 dark:text-gray-400'}`}
                  >AM</button>
                  <button
                    type="button"
                    onClick={() => setSnoozeAmPm('PM')}
                    className={`px-2 h-8 text-[11px] font-medium transition-colors cursor-pointer ${snoozeAmPm === 'PM' ? 'bg-[#4285F4] text-white' : 'bg-transparent text-gray-500 dark:text-gray-400'}`}
                  >PM</button>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setShowCustomSnooze(false); setShowSnoozeModal(false) }}
                  className="h-8 px-3 text-xs font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                >Cancel</button>
                <button
                  type="button"
                  onClick={handleCustomSnooze}
                  disabled={!snoozeDate}
                  className="h-8 px-3 text-xs font-medium rounded-lg bg-[#4285F4] hover:bg-[#1a73e8] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Check className="w-3 h-3 inline mr-1 -mt-0.5" />
                  Snooze
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  )
}
