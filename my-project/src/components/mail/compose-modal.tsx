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
  Clock, Flag, FileText, MoreVertical, Check, CalendarDays,
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
  attachments?: Array<{ name: string; url: string; size: number; type: string }>
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
  const { composeOpen, setComposeOpen, replyToEmail, replyMode, templates, setTemplates } = useAppStore()

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof globalThis === 'undefined') return false
    return globalThis.innerWidth < 768
  })
  const [to, setTo] = useState('')
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
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined)
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [showCustomSchedule, setShowCustomSchedule] = useState(false)
  const [undoCountdown, setUndoCountdown] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSendRef = useRef<PendingSendData | null>(null)
  const restoreDataRef = useRef<RestoreData | null>(null)
  const dragCounterRef = useRef(0)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        placeholder: 'Write your message...',
      }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg',
        },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (updatedEditor.getText().trim().length > 0) {
        setErrors(prev => {
          const next = { ...prev }
          delete next.body
          return next
        })
      }
    },
  })

  // Mobile resize listener
  useEffect(() => {
    const handleResize = () => setIsMobile(globalThis.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fetch templates when compose opens
  useEffect(() => {
    if (!composeOpen) return
    if (templates.length > 0) return
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => {
        if (data.success) setTemplates(data.data)
      })
      .catch(() => {})
  }, [composeOpen, templates.length, setTemplates])

  // Reset editor when compose opens
  useEffect(() => {
    if (!composeOpen || !editor) return

    if (restoreDataRef.current) {
      const data = restoreDataRef.current
      restoreDataRef.current = null
      setTo(data.to)
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

    if (replyToEmail && replyMode) {
      // Always use the sender's actual email from the DB, never construct from name
      const senderEmail = replyToEmail.sender?.email || ''
      const senderName = replyToEmail.sender
        ? `${replyToEmail.sender.firstName} ${replyToEmail.sender.lastName}`
        : 'Unknown Sender'

      if (replyMode === 'forward') {
        setTo('')
        setSubject(replyToEmail.subject?.startsWith('Fwd: ')
          ? replyToEmail.subject
          : `Fwd: ${replyToEmail.subject || '(No subject)'}`)
        const fwdBody = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-top:16px;color:#555"><p>---------- Forwarded message ----------</p><p>From: ${senderName} &lt;${senderEmail}&gt;</p><p>Date: ${new Date(replyToEmail.createdAt).toLocaleString()}</p><p>Subject: ${replyToEmail.subject || '(No subject)'}</p><br>${replyToEmail.bodyHtml || replyToEmail.body?.replace(/\n/g, '<br>') || ''}</div>`
        editor.commands.setContent(fwdBody)
      } else {
        if (replyMode === 'reply') {
          setTo(senderEmail)
        } else {
          // Reply All: include sender + recipient
          const recipientEmail = replyToEmail.recipient?.email || ''
          setTo([senderEmail, recipientEmail].filter(Boolean).join(', '))
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
      setTo(replyToEmail.sender?.email || '')
      setSubject(`Re: ${replyToEmail.subject || ''}`)
      editor.commands.setContent('')
    } else {
      setTo('')
      setSubject('')
      editor.commands.setContent('')
    }
    setCc('')
    setBcc('')
    setShowCc(false)
    setShowBcc(false)
    setAttachments([])
    setPriority('normal')
    setScheduleDate(undefined)
    setScheduleTime('09:00')
    setShowCustomSchedule(false)
    setShowSchedulePopover(false)
    setShowTemplatesPopover(false)
    setErrors({})
  }, [composeOpen, editor, replyToEmail, replyMode])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [])

  const handleClose = useCallback(() => {
    setComposeOpen(false)
  }, [setComposeOpen])

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
        payload.attachments = data.attachments.map(a => ({ name: a.name, url: a.url, size: a.size, type: a.type }))
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
      attachments: attachments,
      priority: pending.priority || 'normal',
    }
    setComposeOpen(true)
    toast.success('Email draft restored')
  }, [setComposeOpen, attachments])

  const startUndoCountdown = useCallback(() => {
    setUndoCountdown(5)
    countdownTimerRef.current = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const handleSend = async (scheduledAtDate?: Date | null) => {
    const e: Record<string, string> = {}
    if (!to.trim()) e.to = 'Recipient is required'
    if (!subject.trim()) e.subject = 'Subject is required'
    const text = editor?.getText().trim()
    if (!text || text.length === 0) e.body = 'Message body is required'
    setErrors(e)
    if (Object.keys(e).length > 0) return

    const html = editor?.getHTML() || ''
    const currentAttachments = attachments

    // Upload attachments FIRST
    let uploadedFiles: Array<{ name: string; url: string; size: number; type: string }> | undefined
    if (currentAttachments.length > 0) {
      setIsUploading(true)
      setUploadProgress(0)
      try {
        const result = await new Promise<Array<{ name: string; url: string; size: number; type: string }>>((resolve, reject) => {
          const formData = new FormData()
          currentAttachments.forEach(file => formData.append('files', file))
          const xhr = new XMLHttpRequest()
          xhr.open('POST', '/api/upload')
          xhr.upload.addEventListener('progress', (ev) => {
            if (ev.lengthComputable) {
              setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
            }
          })
          xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
              const data = JSON.parse(xhr.responseText)
              resolve(data.files)
            } else {
              try {
                const err = JSON.parse(xhr.responseText)
                reject(new Error(err.error || 'Upload failed'))
              } catch {
                reject(new Error('Upload failed'))
              }
            }
          })
          xhr.addEventListener('error', () => reject(new Error('Network error')))
          xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))
          xhr.send(formData)
        })
        uploadedFiles = result
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to upload attachments')
        setIsUploading(false)
        setUploadProgress(0)
        return
      }
      setIsUploading(false)
      setUploadProgress(0)
    }

    const data: PendingSendData = {
      to, cc, bcc, subject, html,
      replyToId: replyToEmail?.id,
      attachments: uploadedFiles,
      priority,
      scheduledAt: scheduledAtDate ? scheduledAtDate.toISOString() : null,
    }
    pendingSendRef.current = data

    // Close compose modal
    setComposeOpen(false)
    setShowSchedulePopover(false)

    if (scheduledAtDate) {
      // Schedule send — send immediately to API (no undo)
      toast.success(`Email scheduled for ${format(scheduledAtDate, 'MMM d, yyyy h:mm a')}`)
      actuallySendEmail(data)
    } else {
      // Normal send with undo
      const sendResult = await actuallySendEmailWithResponse(data)
      if (sendResult?.emailId) {
        pendingSendRef.current = { ...data, sentEmailId: sendResult.emailId }
      }

      toast('Message sent.', {
        description: undoCountdown > 0 ? `Undo available (${undoCountdown}s)` : undefined,
        action: {
          label: 'Undo',
          onClick: handleUndo,
        },
        duration: 5000,
      })

      startUndoCountdown()

      undoTimerRef.current = setTimeout(() => {
        const payload = pendingSendRef.current
        if (!payload) return
        pendingSendRef.current = null
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        setUndoCountdown(0)
      }, 5000)
    }
  }

  const actuallySendEmailWithResponse = useCallback(async (data: PendingSendData) => {
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
        payload.attachments = data.attachments.map(a => ({ name: a.name, url: a.url, size: a.size, type: a.type }))
      }
      if (data.priority === 'high') payload.priority = 'high'
      payload.sentAt = new Date().toISOString()

      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json()
        toast.error(errData.error || 'Failed to send email')
        return null
      }

      const responseData = await res.json()
      return { emailId: responseData.email?.id }
    } catch {
      toast.error('Failed to send email')
      return null
    }
  }, [])

  const handleLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Enter URL:', previousUrl || '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const handleImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt('Enter image URL:')
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
  }, [editor])

  // Schedule send helpers
  const getLaterToday = () => {
    const d = new Date()
    d.setHours(17, 0, 0, 0)
    if (d <= new Date()) d.setDate(d.getDate() + 1)
    return d
  }

  const getTomorrowMorning = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }

  const getNextMonday = () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilMon = day === 0 ? 1 : (8 - day)
    d.setDate(d.getDate() + daysUntilMon)
    d.setHours(9, 0, 0, 0)
    return d
  }

  const handleQuickSchedule = (date: Date) => {
    handleSend(date)
  }

  const handleCustomSchedule = () => {
    if (!scheduleDate) return
    const [hours, minutes] = scheduleTime.split(':').map(Number)
    const d = new Date(scheduleDate)
    d.setHours(hours, minutes, 0, 0)
    if (d <= new Date()) {
      toast.error('Please select a future date and time')
      return
    }
    handleSend(d)
  }

  // Template handling
  const handleLoadTemplate = (template: Template) => {
    if (!editor) return
    if (template.subject) setSubject(template.subject)
    if (template.bodyHtml) {
      editor.commands.setContent(template.bodyHtml)
    } else if (template.body) {
      editor.commands.setContent(template.body.replace(/\n/g, '<br>'))
    }
    setShowTemplatesPopover(false)
    toast.success(`Template "${template.name}" loaded`)
  }

  const handleSaveAsTemplate = async () => {
    const html = editor?.getHTML() || ''
    const name = subject.trim() || 'Untitled Template'
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject: subject.trim(),
          body: html.replace(/<[^>]*>/g, ''),
          bodyHtml: html,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Template saved')
      } else {
        toast.error(data.error || 'Failed to save template')
      }
    } catch {
      toast.error('Failed to save template')
    }
  }

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files)
      const oversized = newFiles.filter(f => f.size > MAX_FILE_SIZE)
      if (oversized.length > 0) {
        toast.error(`${oversized.length} file(s) exceed the ${MAX_FILE_SIZE / 1024 / 1024}MB limit`)
        return
      }
      const currentTotal = attachments.reduce((sum, f) => sum + f.size, 0)
      const newTotal = currentTotal + newFiles.reduce((sum, f) => sum + f.size, 0)
      if (newTotal > MAX_TOTAL_SIZE) {
        toast.error(`Total attachments cannot exceed ${MAX_TOTAL_SIZE / 1024 / 1024}MB`)
        return
      }
      setAttachments(prev => [...prev, ...newFiles])
    }
  }, [attachments])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index))
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {composeOpen && (
        <motion.div
          key="compose-root"
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            initial={
              isMobile
                ? { opacity: 0, y: '100%' }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            animate={
              isMobile
                ? { opacity: 1, y: 0 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              isMobile
                ? { opacity: 0, y: '100%' }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={
              isMobile
                ? 'absolute inset-x-0 bottom-0 z-[1] h-[85vh] bg-white dark:bg-gray-900 rounded-t-2xl overflow-hidden shadow-2xl border-t border-gray-200 dark:border-gray-700 flex flex-col'
                : 'absolute top-[5vh] right-4 z-[1] w-[560px] max-w-[calc(100vw-2rem)] h-[80vh] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col'
            }
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                {priority === 'high' && (
                  <Badge variant="destructive" className="text-xs h-5 gap-1 px-1.5">
                    <Flag className="w-3 h-3" />
                    High Priority
                  </Badge>
                )}
                <h2 className="text-sm font-semibold text-[#1F1F1F] dark:text-white">
                  {replyMode === 'forward' ? 'Forward' : replyMode === 'replyAll' ? 'Reply All' : replyToEmail ? 'Reply' : 'New Message'}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {/* 3-dot menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      aria-label="More options"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handleSaveAsTemplate} className="cursor-pointer gap-2">
                      <FileText className="w-4 h-4" />
                      Save as Template
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

            {/* Fields */}
            <div className="shrink-0 border-b border-gray-200 dark:border-gray-700">
              {/* To */}
              <div className="flex items-center px-4 gap-2">
                <span className="text-sm text-gray-500 shrink-0 w-8">To</span>
                <Input
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="recipient"
                  className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0"
                />
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
                      onChange={e => setCc(e.target.value)}
                      placeholder="CC recipients (comma-separated)"
                      className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0"
                    />
                  </div>
                </div>
              )}

              {/* BCC */}
              {showBcc && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center px-4 gap-2">
                    <span className="text-sm text-gray-500 shrink-0 w-8">BCC</span>
                    <Input
                      value={bcc}
                      onChange={e => setBcc(e.target.value)}
                      placeholder="BCC recipients (comma-separated)"
                      className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0"
                    />
                  </div>
                </div>
              )}

              {/* Subject */}
              <div className="border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center px-4 gap-2">
                  <span className="text-sm text-gray-500 shrink-0 w-8">Sub</span>
                  <Input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Email subject"
                    className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0"
                  />
                </div>
                {errors.subject && <p className="text-xs text-red-500 px-4 pb-2">{errors.subject}</p>}
              </div>
            </div>

            {/* Rich text editor area */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 flex-wrap">
                <ToolbarButton
                  title="Bold"
                  active={editor?.isActive('bold')}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  disabled={!editor}
                >
                  <Bold className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Italic"
                  active={editor?.isActive('italic')}
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  disabled={!editor}
                >
                  <Italic className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Strikethrough"
                  active={editor?.isActive('strike')}
                  onClick={() => editor?.chain().focus().toggleStrike().run()}
                  disabled={!editor}
                >
                  <Strikethrough className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

                <ToolbarButton
                  title="Insert Link"
                  active={editor?.isActive('link')}
                  onClick={handleLink}
                  disabled={!editor}
                >
                  <Link className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Bullet List"
                  active={editor?.isActive('bulletList')}
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  disabled={!editor}
                >
                  <List className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Ordered List"
                  active={editor?.isActive('orderedList')}
                  onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                  disabled={!editor}
                >
                  <ListOrdered className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

                <ToolbarButton
                  title="Insert Image"
                  onClick={handleImage}
                  disabled={!editor}
                >
                  <ImageIcon className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

                {/* Templates button */}
                <Popover open={showTemplatesPopover} onOpenChange={setShowTemplatesPopover}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title="Templates"
                      className={cn(
                        'inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0 transition-colors cursor-pointer',
                        'hover:bg-accent hover:text-accent-foreground',
                        'active:scale-95',
                        showTemplatesPopover && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start" side="bottom">
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Templates</p>
                    </div>
                    <Separator />
                    <div className="max-h-48 overflow-y-auto">
                      {templates.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-gray-400">
                          No templates yet
                        </div>
                      ) : (
                        templates.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleLoadTemplate(t)}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0"
                          >
                            <p className="text-sm font-medium text-[#1F1F1F] dark:text-white truncate">{t.name}</p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {t.subject || 'No subject'}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Priority toggle */}
                <ToolbarButton
                  title={priority === 'high' ? 'High Priority (click to change)' : 'Set High Priority'}
                  active={priority === 'high'}
                  onClick={() => setPriority(prev => prev === 'high' ? 'normal' : 'high')}
                >
                  <Flag className="w-4 h-4" />
                </ToolbarButton>
              </div>

              {/* Editor */}
              <div className="flex-1 overflow-y-auto min-h-[120px] relative tiptap-editor-wrap">
                {editor ? (
                  <EditorContent editor={editor} />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    Loading editor...
                  </div>
                )}
              </div>

              {errors.body && <p className="text-xs text-red-500 px-4 pb-1">{errors.body}</p>}

              {/* Drag overlay */}
              {isDragging && (
                <div className="absolute inset-0 z-10 m-2 border-2 border-dashed border-[#4285F4] bg-[#4285F4]/5 rounded-lg flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <Paperclip className="w-8 h-8 mx-auto text-[#4285F4] mb-2" />
                    <p className="text-sm font-medium text-[#4285F4]">Drop files here</p>
                  </div>
                </div>
              )}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2 shrink-0 max-h-24 overflow-y-auto">
                {attachments.map((file, i) => (
                  <Badge key={i} variant="secondary" className="gap-1.5 pr-1">
                    <Paperclip className="w-3 h-3" />
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {(file.size / 1024).toFixed(0)}KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="inline-flex items-center justify-center h-4 w-4 ml-1 hover:text-red-500 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Footer */}
            <div
              className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 12px, 12px)' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.gz,.tar,.json,.xml,.html,.css,.js,.heic,.heif"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    const newFiles = Array.from(e.target.files)
                    const oversized = newFiles.filter(f => f.size > MAX_FILE_SIZE)
                    if (oversized.length > 0) {
                      toast.error(`${oversized.length} file(s) exceed the ${MAX_FILE_SIZE / 1024 / 1024}MB limit`)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                      return
                    }
                    const currentTotal = attachments.reduce((sum, f) => sum + f.size, 0)
                    const newTotal = currentTotal + newFiles.reduce((sum, f) => sum + f.size, 0)
                    if (newTotal > MAX_TOTAL_SIZE) {
                      toast.error(`Total attachments cannot exceed ${MAX_TOTAL_SIZE / 1024 / 1024}MB`)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                      return
                    }
                    setAttachments(prev => [...prev, ...newFiles])
                  }
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label="Attach file"
              >
                <Paperclip className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
              >
                Discard
              </button>

              {/* Schedule Send button */}
              <Popover open={showSchedulePopover} onOpenChange={setShowSchedulePopover}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={!editor || isUploading}
                    className="inline-flex items-center justify-center h-9 gap-1.5 text-sm font-medium text-[#4285F4] hover:bg-[#D3E3FD] dark:hover:bg-[#4285F4]/10 rounded-xl px-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden sm:inline">Schedule</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end" side="top">
                  <div className="px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Schedule Send</p>
                  </div>
                  <Separator />
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => handleQuickSchedule(getLaterToday())}
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
                      onClick={() => handleQuickSchedule(getTomorrowMorning())}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Tomorrow Morning</p>
                        <p className="text-xs text-gray-400">9:00 AM</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickSchedule(getNextMonday())}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Next Monday</p>
                        <p className="text-xs text-gray-400">9:00 AM</p>
                      </div>
                    </button>
                    <Separator className="my-1" />
                    <button
                      type="button"
                      onClick={() => setShowCustomSchedule(true)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#4285F4] hover:bg-[#D3E3FD]/50 dark:hover:bg-[#4285F4]/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <CalendarDays className="w-4 h-4" />
                      <span className="text-sm font-medium">Pick date & time</span>
                    </button>
                  </div>

                  {/* Custom date/time picker */}
                  <AnimatePresence>
                    {showCustomSchedule && (
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
                            selected={scheduleDate}
                            onSelect={setScheduleDate}
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
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-8 text-xs flex-1 bg-[#4285F4] hover:bg-[#1a73e8]"
                              onClick={handleCustomSchedule}
                              disabled={!scheduleDate}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Schedule
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => setShowCustomSchedule(false)}
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

              {/* Send button */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!editor || isUploading}
                className="inline-flex items-center justify-center h-9 bg-[#4285F4] hover:bg-[#1a73e8] active:bg-[#1557b0] text-white font-medium rounded-xl px-4 sm:px-5 shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <svg className="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {isUploading ? (uploadProgress > 0 ? `${uploadProgress}%` : 'Uploading...') : 'Send'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
