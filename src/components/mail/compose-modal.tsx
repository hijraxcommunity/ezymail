'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import ImageExtension from '@tiptap/extension-image'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Send, Paperclip, X, Bold, Italic, Strikethrough,
  Link, List, ListOrdered, Image as ImageIcon,
  Clock, Flag, FileText, MoreVertical, Check, CalendarDays, Trash2, Users,
  Sun, Sunset, Briefcase,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore, type Template } from '@/store/use-app-store'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024 // 50MB

interface PendingSendData {
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  replyToId?: string
  attachments?: Array<{ name: string; url: string; size: number; type: string; data?: string }>
  priority?: string
  scheduledAt?: string | null
  sentEmailId?: string
}

interface RestoreData {
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  showCc: boolean
  showBcc: boolean
  attachments: File[]
  priority: string
}

function ToolbarButton({
  active,
  onClick,
  disabled,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  title?: string
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onClick()
    },
    [onClick],
  )

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0 transition-colors cursor-pointer',
        'hover:bg-accent hover:text-accent-foreground',
        'active:scale-95',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        active && 'bg-accent text-accent-foreground'
      )}
      onMouseDown={handleMouseDown}
    >
      {children}
    </button>
  )
}

export function ComposeModal() {
  const { composeOpen, setComposeOpen, replyToEmail, replyMode, editDraftEmail, removeEmail, templates, setTemplates, setCurrentFolder } = useAppStore()

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof globalThis === 'undefined') return false
    return globalThis.innerWidth < 768
  })
  const [to, setTo] = useState('')
  const [toChips, setToChips] = useState<Array<{ email: string; name: string; avatar: string | null }>>([])
  const [toInput, setToInput] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<File[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [priority, setPriority] = useState<'normal' | 'high'>('normal')
  const [showSchedulePopover, setShowSchedulePopover] = useState(false)
  const [showTemplatesPopover, setShowTemplatesPopover] = useState(false)
  const [showCustomSchedule, setShowCustomSchedule] = useState(false)
  const [undoCountdown, setUndoCountdown] = useState(0)
  const [showContactsPicker, setShowContactsPicker] = useState(false)
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [contactSearch, setContactSearch] = useState('')

  // Fetch contacts when compose opens or picker opens
  useEffect(() => {
    fetch('/api/contacts')
      .then(res => res.json())
      .then(data => setContacts(data.data || []))
      .catch(() => setContacts([]))
  }, [composeOpen, showContactsPicker])

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const findContactByEmail = (email: string) => {
    const normalized = email.toLowerCase().trim()
    return contacts.find(c => c.email.toLowerCase() === normalized)
  }

  const addToChip = (email: string) => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || toChips.some(c => c.email === trimmed)) return
    const contact = findContactByEmail(trimmed)
    const name = contact?.name || ''
    const avatar = null
    const newChip = { email: trimmed, name, avatar }
    setToChips(prev => [...prev, newChip])
    setToInput('')
    // Update the raw to string
    setTo(prev => {
      const existing = prev.split(',').map(s => s.trim()).filter(Boolean)
      if (!existing.includes(trimmed)) {
        return [...existing, trimmed].join(', ')
      }
      return prev
    })
  }

  const removeToChip = (email: string) => {
    setToChips(prev => prev.filter(c => c.email !== email))
    setTo(prev => {
      const existing = prev.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      return existing.filter(e => e !== email.toLowerCase()).join(', ')
    })
  }

  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      const value = toInput.replace(',', '').trim()
      if (!value) return
      if (emailRegex.test(value)) {
        addToChip(value)
      }
    }
    if (e.key === 'Backspace' && toInput === '' && toChips.length > 0) {
      const last = toChips[toChips.length - 1]
      removeToChip(last.email)
    }
  }

  const handleToBlur = () => {
    const value = toInput.replace(',', '').trim()
    if (value && emailRegex.test(value)) {
      addToChip(value)
    }
  }

  const handleToPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text/plain')
    const parts = pasted.split(/[,;\s]+/).filter(Boolean)
    parts.forEach(part => {
      if (emailRegex.test(part)) {
        addToChip(part)
      } else {
        setToInput(prev => prev + (prev ? ' ' : '') + part)
      }
    })
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSendRef = useRef<PendingSendData | null>(null)
  const restoreDataRef = useRef<RestoreData | null>(null)
  const dragCounterRef = useRef(0)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isSendingRef = useRef(false)

  // TipTap Editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({}),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: 'Compose your email...',
      }),
      ImageExtension,
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[120px] px-4 py-3 text-sm',
      },
    },
  })

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(globalThis.innerWidth < 768)
    globalThis.addEventListener('resize', handleResize)
    return () => globalThis.removeEventListener('resize', handleResize)
  }, [])

  // Save/restore compose content
  useEffect(() => {
    if (!composeOpen) return
    const saved = localStorage.getItem('ezymail_compose')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        setTo(data.to || '')
        setCc(data.cc || '')
        setBcc(data.bcc || '')
        setSubject(data.subject || '')
        setAttachments([])
        setPriority((data.priority as 'normal' | 'high') || 'normal')
        setShowCc(!!data.showCc)
        setShowBcc(!!data.showBcc)
      } catch { /* ignore */ }
    }
  }, [composeOpen])

  // Clear saved compose when modal closes
  useEffect(() => {
    if (!composeOpen) {
      localStorage.removeItem('ezymail_compose')
      setToChips([])
      setToInput('')
      return
    }
  }, [composeOpen])

  // Save compose state periodically
  useEffect(() => {
    if (!composeOpen) return
    const interval = setInterval(() => {
      if (!composeOpen) return
      localStorage.setItem('ezymail_compose', JSON.stringify({
        to: to,
        cc, bcc, subject,
        html: editor?.getHTML() || '',
        showCc, showBcc, priority,
      }))
    }, 3000)
    return () => clearInterval(interval)
  }, [composeOpen, to, cc, bcc, subject, editor, showCc, showBcc, priority])

  // Auto-save drafts
  useEffect(() => {
    if (!composeOpen) return
    const interval = setInterval(() => {
      if (!composeOpen || !editDraftEmail || !subject && !editor?.getText().trim()) return
    }, 30000)
    return () => clearInterval(interval)
  }, [composeOpen, editDraftEmail, subject, editor])

  const handleClose = useCallback(() => {
    setComposeOpen(false)
  }, [setComposeOpen])

  // Reset editor when compose opens
  useEffect(() => {
    if (!composeOpen || !editor) return

    if (restoreDataRef.current) {
      const data = restoreDataRef.current
      restoreDataRef.current = null
      setTo(data.to)
      setToChips([])
      setToInput('')
      setCc(data.cc)
      setBcc(data.bcc)
      setSubject(data.subject)
      setShowCc(data.showCc)
      setShowBcc(data.showBcc)
      editor.commands.setContent(data.html)
      setAttachments(data.attachments || [])
      setPriority((data.priority as 'normal' | 'high') || 'normal')
      setErrors({})
      return
    }

    // Load draft content when editing a draft
    if (editDraftEmail) {
      const draftEmail = editDraftEmail.recipient?.email || ''
      setTo(draftEmail)
      if (draftEmail) {
        const contact = findContactByEmail(draftEmail)
        setToChips([{ email: draftEmail.toLowerCase(), name: contact?.name || '', avatar: null }])
      } else {
        setToChips([])
      }
      setToInput('')
      setSubject(editDraftEmail.subject || '')
      editor.commands.setContent(editDraftEmail.bodyHtml || editDraftEmail.body?.replace(/\n/g, '<br>') || '')
      setErrors({})
      return
    }

    if (replyToEmail && replyMode) {
      const senderEmail = replyToEmail.sender?.email || ''
      const senderName = replyToEmail.sender
        ? `${replyToEmail.sender.firstName} ${replyToEmail.sender.lastName}`
        : 'Unknown Sender'

      if (replyMode === 'forward') {
        setTo('')
        setToChips([])
        setToInput('')
        setSubject(replyToEmail.subject?.startsWith('Fwd: ')
          ? replyToEmail.subject
          : `Fwd: ${replyToEmail.subject || '(No subject)'}`)
        const fwdBody = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-top:16px;color:#555"><p>---------- Forwarded message ----------</p><p>From: ${senderName} &lt;${senderEmail}&gt;</p><p>Date: ${new Date(replyToEmail.createdAt).toLocaleString()}</p><p>Subject: ${replyToEmail.subject || '(No subject)'}</p><br>${replyToEmail.bodyHtml || replyToEmail.body?.replace(/\n/g, '<br>') || ''}</div>`
        editor.commands.setContent(fwdBody)
      } else {
        if (replyMode === 'reply') {
          setTo(senderEmail)
          const replyContact = findContactByEmail(senderEmail)
          setToChips([{ email: senderEmail.toLowerCase(), name: replyContact?.name || replyToEmail.sender ? `${replyToEmail.sender.firstName} ${replyToEmail.sender.lastName}` : '', avatar: replyToEmail.sender?.avatar || null }])
          setToInput('')
        } else {
          // Reply All: sender goes in To, recipient + CC go in CC
          const recipientEmail = replyToEmail.recipient?.email || ''
          const originalCc = (() => { try { const cc = (replyToEmail as unknown as Record<string, unknown>).cc; if (!cc) return []; if (typeof cc === 'string') return cc.split(',').map((e: string) => e.trim()).filter(Boolean); if (Array.isArray(cc)) return cc } catch { return [] } return [] })()
          const allCc = [recipientEmail, ...originalCc].filter(e => e && e !== senderEmail)
          const uniqueCc = [...new Set(allCc)]
          setTo(senderEmail)
          const replyAllContact = findContactByEmail(senderEmail)
          setToChips([{ email: senderEmail.toLowerCase(), name: replyAllContact?.name || replyToEmail.sender ? `${replyToEmail.sender.firstName} ${replyToEmail.sender.lastName}` : '', avatar: replyToEmail.sender?.avatar || null }])
          setToInput('')
          if (uniqueCc.length > 0) {
            setCc(uniqueCc.join(', '))
            setShowCc(true)
          }
        }
        const subject = replyToEmail.subject?.startsWith('Re: ')
          ? replyToEmail.subject
          : `Re: ${replyToEmail.subject || ''}`
        setSubject(subject)
        const quoteDate = new Date(replyToEmail.createdAt).toLocaleString()
        const quotedBody = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-top:16px;color:#555"><p>On ${quoteDate}, ${senderName} wrote:</p><br>${replyToEmail.bodyHtml || replyToEmail.body?.replace(/\n/g, '<br>') || ''}</div>`
        editor.commands.setContent(quotedBody)
      }
    } else if (replyToEmail) {
      const fallbackEmail = replyToEmail.sender?.email || ''
      setTo(fallbackEmail)
      if (fallbackEmail) {
        const fbContact = findContactByEmail(fallbackEmail)
        setToChips([{ email: fallbackEmail.toLowerCase(), name: fbContact?.name || replyToEmail.sender ? `${replyToEmail.sender.firstName} ${replyToEmail.sender.lastName}` : '', avatar: replyToEmail.sender?.avatar || null }])
      } else {
        setToChips([])
      }
      setToInput('')
      setSubject(`Re: ${replyToEmail.subject || ''}`)
      editor.commands.setContent('')
    } else {
      setTo('')
      setToChips([])
      setToInput('')
      setSubject('')
      editor.commands.setContent('')
    }
    setCc('')
    setBcc('')
    setShowCc(false)
    setShowBcc(false)
    setAttachments([])
    setPriority('normal')
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen, editor])

  const processRecipients = (value: string): string => {
    return value
      .split(',')
      .map(r => r.trim())
      .filter(Boolean)
      .map(r => {
        // Already a valid email address
        if (r.includes('@')) return r
        // Only auto-append @ezy.af for simple usernames (letters, numbers, dots, underscores, hyphens)
        // NOT for full names with spaces like "Muhammad Wasil Amiri"
        if (/^[a-zA-Z0-9._-]+$/.test(r)) return `${r}@ezy.af`
        // If it contains spaces or looks like a name, return as-is (will fail validation)
        return r
      })
      .join(', ')
  }

  const actuallySendEmail = useCallback(async (data: PendingSendData) => {
    try {
      const finalTo = processRecipients(data.to)
      const payload: Record<string, unknown> = {
        to: finalTo,
        subject: data.subject,
        body: data.html.replace(/<[^>]*>/g, ''),
        bodyHtml: data.html,
      }
      if (data.cc.trim()) payload.cc = processRecipients(data.cc)
      if (data.bcc.trim()) payload.bcc = processRecipients(data.bcc)
      if (data.replyToId) payload.replyToId = data.replyToId
      if (data.attachments && data.attachments.length > 0) {
        payload.attachments = data.attachments.map(a => ({ name: a.name, url: a.url, size: a.size, type: a.type, data: a.data }))
      }
      if (data.priority === 'high') payload.priority = 'high'
      if (data.scheduledAt) payload.scheduledAt = data.scheduledAt

      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json()
        toast.error(errData.error || 'Failed to send email')
      }
    } catch {
      toast.error('Failed to send email')
    }
  }, [])

  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    const pending = pendingSendRef.current
    if (!pending) return
    pendingSendRef.current = null
    setUndoCountdown(0)

    // If email was already sent (has sentEmailId), delete it
    if (pending.sentEmailId) {
      fetch(`/api/emails/${pending.sentEmailId}`, { method: 'DELETE' }).catch(() => {})
    }

    restoreDataRef.current = {
      to: pending.to,
      cc: pending.cc,
      bcc: pending.bcc,
      subject: pending.subject,
      html: pending.html,
      showCc: !!pending.cc.trim(),
      showBcc: !!pending.bcc.trim(),
      attachments: [],
      priority: pending.priority || 'normal',
    }

    // Re-open compose with restored data
    setComposeOpen(true)
    toast.success('Email unsent')
  }, [setComposeOpen])

  // Upload a single file
  const uploadSingleFile = async (file: File): Promise<{ name: string; url: string; size: number; type: string; data?: string } | null> => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`"${file.name}" exceeds 25MB limit`)
      return null
    }

    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
      return {
        name: file.name,
        url: `data:${file.type};base64,${base64}`,
        size: file.size,
        type: file.type,
        data: base64,
      }
    } catch {
      toast.error(`Failed to process "${file.name}"`)
      return null
    }
  }

  // Handle file selection (from button or drag-drop)
  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const totalNewSize = fileArray.reduce((sum, f) => sum + f.size, 0)
    const currentTotalSize = attachments.reduce((sum, f) => sum + f.size, 0)

    if (currentTotalSize + totalNewSize > MAX_TOTAL_SIZE) {
      toast.error('Total attachments cannot exceed 50MB')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    const newAttachments: File[] = []
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      if (file.size <= MAX_FILE_SIZE) {
        newAttachments.push(file)
      } else {
        toast.error(`"${file.name}" exceeds 25MB limit`)
      }
      setUploadProgress(Math.round(((i + 1) / fileArray.length) * 100))
    }

    setAttachments(prev => [...prev, ...newAttachments])
    setIsUploading(false)
    setUploadProgress(0)
  }

  const handleSend = async (scheduledAt?: string | null) => {
    if (isSendingRef.current) return
    isSendingRef.current = true

    try {
      const e: Record<string, string> = {}
      if (!to.trim()) e.to = 'Recipient is required'
      if (!subject.trim()) e.subject = 'Subject is required'
      const text = editor?.getText().trim()
      if (!text || text.length === 0) e.body = 'Message body is required'
      // Validate CC recipients if provided
      if (showCc && cc.trim()) {
        const ccList = cc.split(',').map(s => s.trim()).filter(Boolean)
        for (const addr of ccList) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
            e.cc = `Invalid CC address: ${addr}`
            break
          }
        }
      }
      // Validate BCC recipients if provided
      if (showBcc && bcc.trim()) {
        const bccList = bcc.split(',').map(s => s.trim()).filter(Boolean)
        for (const addr of bccList) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
            e.bcc = `Invalid BCC address: ${addr}`
            break
          }
        }
      }
      setErrors(e)
      if (Object.keys(e).length > 0) {
        isSendingRef.current = false
        return
      }

      const html = editor?.getHTML() || ''

      // Upload attachments
      const uploadedAttachments: Array<{ name: string; url: string; size: number; type: string; data?: string }> = []
      if (attachments.length > 0) {
        setIsUploading(true)
        for (let i = 0; i < attachments.length; i++) {
          const result = await uploadSingleFile(attachments[i])
          if (result) uploadedAttachments.push(result)
          setUploadProgress(Math.round(((i + 1) / attachments.length) * 100))
        }
        setIsUploading(false)
        setUploadProgress(0)
      }

      const finalTo = processRecipients(to)
      const pendingData: PendingSendData = {
        to: finalTo,
        cc: showCc ? cc.trim() : '',
        bcc: showBcc ? bcc.trim() : '',
        subject: subject.trim(),
        html,
        replyToId: replyToEmail?.id,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        priority,
        scheduledAt,
      }

      // If editing a draft, delete the old draft first
      if (editDraftEmail) {
        try { await fetch(`/api/emails/${editDraftEmail.id}`, { method: 'DELETE' }) } catch { /* ignore */ }
        removeEmail(editDraftEmail.id)
        setCurrentFolder('drafts')
      }

      // Close compose immediately for snappy UX
      setComposeOpen(false)
      localStorage.removeItem('ezymail_compose')

      if (scheduledAt) {
        // For scheduled emails, send immediately with scheduledAt
        await actuallySendEmail({ ...pendingData, scheduledAt })
        toast.success('Email scheduled successfully')
      } else {
        // Send immediately
        await actuallySendEmail(pendingData)
        toast.success('Email sent')
      }

      // Reset
      setTo('')
      setToChips([])
      setToInput('')
      setCc('')
      setBcc('')
      setSubject('')
      setAttachments([])
      setShowCc(false)
      setShowBcc(false)
      setPriority('normal')
      setErrors({})
    } catch {
      toast.error('Failed to send email')
    } finally {
      isSendingRef.current = false
    }
  }

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // Schedule helpers
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined)
  const [scheduleHour, setScheduleHour] = useState('9')
  const [scheduleMinute, setScheduleMinute] = useState('00')
  const [scheduleAmPm, setScheduleAmPm] = useState<'AM' | 'PM'>('AM')

  const getLaterToday = () => {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const later = new Date(now)
    if (h < 12) {
      later.setHours(12, 0, 0, 0)
    } else if (h < 17) {
      later.setHours(17, 0, 0, 0)
    } else {
      later.setHours(20, 0, 0, 0)
    }
    return later
  }

  const getTomorrowMorning = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(8, 0, 0, 0)
    return d
  }

  const getLaterThisWeek = () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilMon = day === 0 ? 1 : (8 - day)
    d.setDate(d.getDate() + daysUntilMon)
    d.setHours(8, 0, 0, 0)
    return d
  }

  const handleSchedule = (date: Date) => {
    handleSend(date.toISOString())
    setShowSchedulePopover(false)
    setShowCustomSchedule(false)
  }

  const handleCustomSchedule = () => {
    if (!scheduleDate) {
      toast.error('Please select a date')
      return
    }
    let hour = parseInt(scheduleHour)
    if (scheduleAmPm === 'PM' && hour !== 12) hour += 12
    if (scheduleAmPm === 'AM' && hour === 12) hour = 0
    const d = new Date(scheduleDate)
    d.setHours(hour, parseInt(scheduleMinute), 0, 0)
    if (d <= new Date()) {
      toast.error('Schedule time must be in the future')
      return
    }
    handleSend(d.toISOString())
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const totalAttachmentSize = attachments.reduce((sum, f) => sum + f.size, 0)

  const fadeInUp = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.15 },
  }

  // Template application
  const applyTemplate = (template: Template) => {
    if (template.subject) setSubject(template.subject)
    if (template.body) {
      editor?.commands.setContent(template.body)
    }
    setShowTemplatesPopover(false)
    toast.success(`Template "${template.name}" applied`)
  }

  if (!composeOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        key="compose-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'fixed inset-0 z-[100]',
          isMobile ? 'bg-black/40' : 'bg-black/30'
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose()
        }}
      >
        <motion.div
          key="compose-modal"
          initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 20 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className={cn(
            'bg-white dark:bg-[#1e1e1e] flex flex-col overflow-hidden',
            isMobile
              ? 'fixed inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl'
              : 'fixed bottom-4 right-4 w-[600px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50'
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-[#4285F4]/10 border-2 border-dashed border-[#4285F4] rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <Paperclip className="w-8 h-8 text-[#4285F4] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#4285F4]">Drop files here</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1F1F1F] dark:text-white truncate">
                {editDraftEmail ? 'Edit Draft' : replyToEmail ? `${replyMode === 'forward' ? 'Forward' : 'Reply'}${replyMode === 'replyAll' ? ' All' : ''}` : 'New Message'}
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                {/* Attachments indicator */}
                {attachments.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-[#D3E3FD] dark:bg-[#4285F4]/15 text-[#4285F4] gap-1">
                    <Paperclip className="w-2.5 h-2.5" />
                    {attachments.length}
                    {totalAttachmentSize > 0 && ` (${formatFileSize(totalAttachmentSize)})`}
                  </Badge>
                )}
                {/* Contacts Picker */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      aria-label="Contacts"
                    >
                      <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setShowContactsPicker(true)}>
                      <Users className="w-4 h-4 mr-2" />
                      Select from contacts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Contacts Picker - centered overlay */}
                <AnimatePresence>
                  {showContactsPicker && (
                    <motion.div
                      key="contacts-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                      onClick={(e) => {
                        if (e.target === e.currentTarget) setShowContactsPicker(false)
                      }}
                    >
                      <motion.div
                        key="contacts-modal"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                          <h3 className="text-sm font-semibold text-[#1F1F1F] dark:text-white">Contacts</h3>
                          <button
                            type="button"
                            onClick={() => { setShowContactsPicker(false); setContactSearch('') }}
                            className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                        <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                          <Input
                            placeholder="Search contacts..."
                            value={contactSearch}
                            onChange={(e) => setContactSearch(e.target.value)}
                            className="h-9 text-sm"
                            autoFocus
                          />
                        </div>
                        {/* Contact list */}
                        <div className="flex-1 overflow-y-auto">
                          {contacts.filter(c =>
                            !contactSearch ||
                            c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                            c.email.toLowerCase().includes(contactSearch.toLowerCase())
                          ).length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-6">No contacts found</p>
                          ) : (
                            contacts
                              .filter(c =>
                                !contactSearch ||
                                c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                                c.email.toLowerCase().includes(contactSearch.toLowerCase())
                              )
                              .map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    addToChip(c.email)
                                    setShowContactsPicker(false)
                                    setContactSearch('')
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer text-left"
                                >
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                                    {c.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-[#1F1F1F] dark:text-white truncate">{c.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{c.email}</p>
                                  </div>
                                  <div className="shrink-0">
                                    <div className="w-6 h-6 rounded-full bg-[#D3E3FD] dark:bg-[#4285F4]/20 flex items-center justify-center">
                                      <span className="text-[#4285F4] text-xs font-bold">+</span>
                                    </div>
                                  </div>
                                </button>
                              ))
                          )}
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700">
            {/* To */}
            <div className="flex items-center px-4 gap-2 min-h-[44px]">
              <span className="text-sm text-gray-500 shrink-0 w-8">To</span>
              <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                {toChips.map(chip => {
                  const initials = chip.name
                    ? chip.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    : chip.email[0].toUpperCase()
                  return (
                    <span
                      key={chip.email}
                      className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-full pl-0.5 pr-1 py-0.5 max-w-[240px] shrink-0"
                    >
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {initials}
                      </span>
                      <span className="text-sm text-[#1F1F1F] dark:text-white truncate max-w-[150px]">
                        {chip.name || chip.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeToChip(chip.email)}
                        className="w-5 h-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <X className="w-3 h-3 text-gray-500" />
                      </button>
                    </span>
                  )
                })}
                <input
                  type="text"
                  value={toInput}
                  onChange={e => setToInput(e.target.value)}
                  onKeyDown={handleToKeyDown}
                  onBlur={handleToBlur}
                  onPaste={handleToPaste}
                  placeholder={toChips.length === 0 ? 'recipient' : ''}
                  className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-[80px] bg-transparent outline-none"
                />
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCc(prev => !prev)}
                  className={cn(
                    'h-7 text-xs px-2 font-normal rounded-md transition-colors cursor-pointer',
                    showCc
                      ? 'text-[#4285F4] bg-[#4285F4]/10'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  CC
                </button>
                <button
                  type="button"
                  onClick={() => setShowBcc(prev => !prev)}
                  className={cn(
                    'h-7 text-xs px-2 font-normal rounded-md transition-colors cursor-pointer',
                    showBcc
                      ? 'text-[#4285F4] bg-[#4285F4]/10'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  BCC
                </button>
              </div>
            </div>
            {errors.to && <p className="text-xs text-red-500 px-4 pb-2">{errors.to}</p>}

            {/* CC */}
            {showCc && (
              <div className="border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center px-4 gap-2">
                  <span className="text-sm text-gray-500 shrink-0 w-8">CC</span>
                  <Input
                    value={cc}
                    onChange={e => {
                      setCc(e.target.value)
                      if (errors.cc) setErrors(prev => { const n = { ...prev }; delete n.cc; return n })
                    }}
                    placeholder="CC recipients (comma-separated)"
                    className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0"
                  />
                </div>
                {errors.cc && <p className="text-xs text-red-500 px-4 pb-2">{errors.cc}</p>}
              </div>
            )}

            {/* BCC */}
            {showBcc && (
              <div className="border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center px-4 gap-2">
                  <span className="text-sm text-gray-500 shrink-0 w-8">BCC</span>
                  <Input
                    value={bcc}
                    onChange={e => {
                      setBcc(e.target.value)
                      if (errors.bcc) setErrors(prev => { const n = { ...prev }; delete n.bcc; return n })
                    }}
                    placeholder="BCC recipients (comma-separated)"
                    className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0"
                  />
                </div>
                {errors.bcc && <p className="text-xs text-red-500 px-4 pb-2">{errors.bcc}</p>}
              </div>
            )}

            {/* Subject */}
            <div className="border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center px-4 gap-2">
                <Input
                  value={subject}
                  onChange={e => {
                    setSubject(e.target.value)
                    if (errors.subject) setErrors(prev => { const n = { ...prev }; delete n.subject; return n })
                  }}
                  placeholder="Subject"
                  className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1"
                />
              </div>
              {errors.subject && <p className="text-xs text-red-500 px-4 pb-2">{errors.subject}</p>}
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <EditorContent editor={editor} />

            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-1.5 text-xs group"
                    >
                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-[#1F1F1F] dark:text-white truncate max-w-[150px]">{file.name}</span>
                      <span className="text-gray-400 shrink-0">{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="w-4 h-4 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upload progress bar */}
          {isUploading && (
            <div className="shrink-0 h-1 bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full bg-[#4285F4] transition-all duration-200 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {/* Footer / Toolbar */}
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-700">
            {/* Formatting toolbar */}
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
              <ToolbarButton
                active={editor?.isActive('bold')}
                onClick={() => editor?.chain().focus().toggleBold().run()}
                disabled={!editor?.isEditable}
                title="Bold"
              >
                <Bold className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor?.isActive('italic')}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                disabled={!editor?.isEditable}
                title="Italic"
              >
                <Italic className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor?.isActive('strike')}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                disabled={!editor?.isEditable}
                title="Strikethrough"
              >
                <Strikethrough className="w-4 h-4" />
              </ToolbarButton>
              <Separator orientation="vertical" className="h-5 mx-1" />
              <ToolbarButton
                active={editor?.isActive('bulletList')}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                disabled={!editor?.isEditable}
                title="Bullet List"
              >
                <List className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                active={editor?.isActive('orderedList')}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                disabled={!editor?.isEditable}
                title="Numbered List"
              >
                <ListOrdered className="w-4 h-4" />
              </ToolbarButton>
              <Separator orientation="vertical" className="h-5 mx-1" />
              <ToolbarButton
                active={editor?.isActive('link')}
                onClick={() => {
                  const url = globalThis.prompt('Enter URL:')
                  if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
                }}
                disabled={!editor?.isEditable}
                title="Insert Link"
              >
                <Link className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  const url = globalThis.prompt('Enter image URL:')
                  if (url) editor?.chain().focus().setImage({ src: url }).run()
                }}
                disabled={!editor?.isEditable}
                title="Insert Image"
              >
                <ImageIcon className="w-4 h-4" />
              </ToolbarButton>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
              <div className="flex items-center gap-1.5">
                {/* Send button */}
                <Button
                  onClick={() => handleSend()}
                  disabled={isSendingRef.current || isUploading}
                  className="bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-full px-5 h-9 text-sm font-medium gap-1.5 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  {!isMobile && 'Send'}
                </Button>

                {/* Attachment button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="rounded-full h-9 w-9 p-0"
                  title="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />

                {/* Schedule button */}
                <Popover open={showSchedulePopover} onOpenChange={setShowSchedulePopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full h-9 w-9 p-0"
                      title="Schedule send"
                    >
                      <Clock className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    {/* Schedule options grid */}
                    {!showCustomSchedule ? (
                      <div className="p-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSchedule(getLaterToday())}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left cursor-pointer"
                          >
                            <Sun className="w-5 h-5 text-[#FBBC05]" />
                            <div>
                              <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Later today</p>
                              <p className="text-[11px] text-gray-400">
                                {format(getLaterToday(), 'h:mm a')}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSchedule(getTomorrowMorning())}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left cursor-pointer"
                          >
                            <Briefcase className="w-5 h-5 text-[#4285F4]" />
                            <div>
                              <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Tomorrow</p>
                              <p className="text-[11px] text-gray-400">8:00 AM</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSchedule(getLaterThisWeek())}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left cursor-pointer"
                          >
                            <Sunset className="w-5 h-5 text-[#EA4335]" />
                            <div>
                              <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Next week</p>
                              <p className="text-[11px] text-gray-400">Monday 8:00 AM</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCustomSchedule(true)}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left cursor-pointer"
                          >
                            <CalendarDays className="w-5 h-5 text-[#34A853]" />
                            <div>
                              <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Pick date</p>
                              <p className="text-[11px] text-gray-400">Choose custom date</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Custom date/time picker */
                      <div className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">Custom Schedule</p>
                          <button
                            type="button"
                            onClick={() => setShowCustomSchedule(false)}
                            className="text-xs text-[#4285F4] hover:underline cursor-pointer"
                          >
                            Back
                          </button>
                        </div>
                        <Calendar
                          mode="single"
                          selected={scheduleDate}
                          onSelect={setScheduleDate}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          className="rounded-xl border-0 p-0"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={scheduleHour}
                            onChange={e => setScheduleHour(String(Math.max(1, Math.min(12, parseInt(e.target.value) || 1))))}
                            className="w-14 h-9 text-center text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent"
                          />
                          <span className="text-gray-400">:</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={scheduleMinute}
                            onChange={e => setScheduleMinute(String(Math.max(0, Math.min(59, parseInt(e.target.value) || 0))).padStart(2, '0'))}
                            className="w-14 h-9 text-center text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent"
                          />
                          <select
                            value={scheduleAmPm}
                            onChange={e => setScheduleAmPm(e.target.value as 'AM' | 'PM')}
                            className="h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent px-2"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                          <Button
                            onClick={handleCustomSchedule}
                            size="sm"
                            className="ml-auto bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-lg h-9 text-sm"
                          >
                            Schedule
                          </Button>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Priority toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPriority(p => p === 'high' ? 'normal' : 'high')}
                  className={cn(
                    'rounded-full h-9 w-9 p-0',
                    priority === 'high' && 'text-[#EA4335]'
                  )}
                  title={priority === 'high' ? 'High priority (click to remove)' : 'Mark as high priority'}
                >
                  <Flag className="w-4 h-4" />
                </Button>

                {/* Templates */}
                {templates.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0" title="Templates">
                        <FileText className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {templates.map((t) => (
                        <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t)}>
                          {t.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* More options (mobile) */}
                {isMobile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="w-4 h-4 mr-2" />
                        Attach file
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowCc(p => !p)}>
                        <Users className="w-4 h-4 mr-2" />
                        {showCc ? 'Hide CC' : 'Show CC'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Undo bar */}
              <AnimatePresence>
                {undoCountdown > 0 && (
                  <motion.div
                    key="undo-bar"
                    {...fadeInUp}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-gray-500">Sent</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUndo}
                      className="text-[#4285F4] hover:text-[#3367D6] text-sm font-medium h-7 px-2 rounded-md"
                    >
                      Undo ({undoCountdown}s)
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Discard draft button */}
              {editDraftEmail && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (editDraftEmail) {
                      removeEmail(editDraftEmail.id)
                      setComposeOpen(false)
                      toast.success('Draft discarded')
                    }
                  }}
                  className="rounded-full h-8 px-2 text-gray-400 hover:text-[#EA4335] shrink-0"
                  title="Discard draft"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}