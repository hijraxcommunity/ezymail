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
  const [toChips, setToChips] = useState<Array<{ email: string; name: string; avatar?: string | null }>>([])
  const [toInput, setToInput] = useState('')
  const [cc, setCc] = useState('')
  const [ccChips, setCcChips] = useState<Array<{ email: string; name: string; avatar?: string | null }>>([])
  const [ccInput, setCcInput] = useState('')
  const [bcc, setBcc] = useState('')
  const [bccChips, setBccChips] = useState<Array<{ email: string; name: string; avatar?: string | null }>>([])
  const [bccInput, setBccInput] = useState('')
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
  const [scheduleHour, setScheduleHour] = useState('9')
  const [scheduleMinute, setScheduleMinute] = useState('00')
  const [scheduleAmPm, setScheduleAmPm] = useState<'AM' | 'PM'>('AM')
  const [showCustomSchedule, setShowCustomSchedule] = useState(false)
  const [undoCountdown, setUndoCountdown] = useState(0)
  const [showContactsPicker, setShowContactsPicker] = useState(false)
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; email: string; avatar?: string | null }>>([])
  const [contactSearch, setContactSearch] = useState('')

  // Fetch contacts when compose opens or picker opens
  useEffect(() => {
    fetch('/api/contacts')
      .then(res => res.json())
      .then(data => setContacts(data.data || []))
      .catch(() => setContacts([]))
  }, [composeOpen, showContactsPicker])

  // Pre-fill "to" from contacts panel
  const prefillRef = useRef<string | null>(null)
  useEffect(() => {
    if (composeOpen) {
      const prefill = sessionStorage.getItem('compose_prefill_to')
      if (prefill) {
        sessionStorage.removeItem('compose_prefill_to')
        prefillRef.current = prefill
      }
    }
  }, [composeOpen])
  useEffect(() => {
    if (prefillRef.current) {
      const email = prefillRef.current
      prefillRef.current = null
      // Use setTimeout to ensure contacts are loaded first
      const timer = setTimeout(() => {
        const trimmed = email.trim().toLowerCase()
        if (!toChips.some(c => c.email === trimmed)) {
          const contact = contacts.find(c => c.email.toLowerCase() === trimmed)
          if (contact) {
            setToChips(prev => [...prev, { email: trimmed, name: contact.name, avatar: contact.avatar || null }])
            setToInput('')
          } else {
            setToChips(prev => [...prev, { email: trimmed, name: '', avatar: null }])
            setToInput('')
          }
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [composeOpen, contacts])

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const findContactByEmail = (email: string) => {
    const n = email.toLowerCase().trim()
    return contacts.find(c => c.email.toLowerCase() === n)
  }

  const lookupUser = async (email: string): Promise<{ name: string; avatar: string | null } | null> => {
    try {
      const res = await fetch(`/api/users/lookup?email=${encodeURIComponent(email)}`)
      const json = await res.json()
      if (json.data) return { name: json.data.name, avatar: json.data.avatar }
    } catch { /* ignore */ }
    return null
  }

  const addToChip = async (email: string, type: 'to' | 'cc' | 'bcc') => {
    const trimmed = email.trim().toLowerCase()
    const chips = type === 'to' ? toChips : type === 'cc' ? ccChips : bccChips
    const setChips = type === 'to' ? setToChips : type === 'cc' ? setCcChips : setBccChips
    const setInput = type === 'to' ? setToInput : type === 'cc' ? setCcInput : setBccInput
    const setField = type === 'to' ? setTo : type === 'cc' ? setCc : setBcc

    if (!trimmed || chips.some(c => c.email === trimmed)) return

    // First check local contacts
    const contact = findContactByEmail(trimmed)
    if (contact) {
      setChips(prev => [...prev, { email: trimmed, name: (contact as { name: string; avatar?: string | null }).name || '', avatar: (contact as { avatar?: string | null })?.avatar || null }])
      setInput('')
      setField(prev => {
        const existing = prev.split(',').map(s => s.trim()).filter(Boolean)
        if (!existing.includes(trimmed)) return [...existing, trimmed].join(', ')
        return prev
      })
      return
    }

    // Then lookup registered user via API
    const user = await lookupUser(trimmed)
    setChips(prev => [...prev, { email: trimmed, name: user?.name || '', avatar: user?.avatar || null }])
    setInput('')
    setField(prev => {
      const existing = prev.split(',').map(s => s.trim()).filter(Boolean)
      if (!existing.includes(trimmed)) return [...existing, trimmed].join(', ')
      return prev
    })
  }

  const removeChip = (email: string, type: 'to' | 'cc' | 'bcc') => {
    const setChips = type === 'to' ? setToChips : type === 'cc' ? setCcChips : setBccChips
    const setField = type === 'to' ? setTo : type === 'cc' ? setCc : setBcc
    setChips(prev => prev.filter(c => c.email !== email))
    setField(prev => {
      const existing = prev.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      return existing.filter(e => e !== email.toLowerCase()).join(', ')
    })
  }

  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'to' | 'cc' | 'bcc') => {
    const input = type === 'to' ? toInput : type === 'cc' ? ccInput : bccInput
    const chips = type === 'to' ? toChips : type === 'cc' ? ccChips : bccChips
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      const v = input.replace(',', '').trim()
      if (v && emailRegex.test(v)) addToChip(v, type)
    }
    if (e.key === 'Backspace' && input === '' && chips.length > 0) {
      removeChip(chips[chips.length - 1].email, type)
    }
  }

  const handleChipBlur = (type: 'to' | 'cc' | 'bcc') => {
    const input = type === 'to' ? toInput : type === 'cc' ? ccInput : bccInput
    const v = input.replace(',', '').trim()
    if (v && emailRegex.test(v)) addToChip(v, type)
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
      setToChips([])
      setToInput('')
      setCc(data.cc)
      setCcChips([])
      setCcInput('')
      setBcc(data.bcc)
      setBccChips([])
      setBccInput('')
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
      setTo(editDraftEmail.recipient?.email || '')
      setToChips([])
      setToInput('')
      setCcChips([])
      setCcInput('')
      setBccChips([])
      setBccInput('')
      setSubject(editDraftEmail.subject || '')
      editor.commands.setContent(editDraftEmail.bodyHtml || editDraftEmail.body?.replace(/\n/g, '<br>') || '')
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
        setToChips([])
        setToInput('')
        setCcChips([])
        setCcInput('')
        setBccChips([])
        setBccInput('')
        setSubject(replyToEmail.subject?.startsWith('Fwd: ')
          ? replyToEmail.subject
          : `Fwd: ${replyToEmail.subject || '(No subject)'}`)
        const fwdBody = `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-top:16px;color:#555"><p>---------- Forwarded message ----------</p><p>From: ${senderName} &lt;${senderEmail}&gt;</p><p>Date: ${new Date(replyToEmail.createdAt).toLocaleString()}</p><p>Subject: ${replyToEmail.subject || '(No subject)'}</p><br>${replyToEmail.bodyHtml || replyToEmail.body?.replace(/\n/g, '<br>') || ''}</div>`
        editor.commands.setContent(fwdBody)
      } else {
        if (replyMode === 'reply') {
          setTo(senderEmail)
        } else {
          // Reply All: sender goes in To, recipient + CC go in CC
          const recipientEmail = replyToEmail.recipient?.email || ''
          // Parse CC from the original email if available
          const originalCc = (() => { try { const cc = (replyToEmail as unknown as Record<string, unknown>).cc; if (!cc) return []; if (typeof cc === 'string') return cc.split(',').map((e: string) => e.trim()).filter(Boolean); if (Array.isArray(cc)) return cc } catch { return [] } return [] })()
          // Build CC list: original recipient + original CC, excluding sender (that goes in To)
          const allCc = [recipientEmail, ...originalCc].filter(e => e && e !== senderEmail)
          const uniqueCc = [...new Set(allCc)]
          setTo(senderEmail)
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
      setTo(replyToEmail.sender?.email || '')
      setSubject(`Re: ${replyToEmail.subject || ''}`)
      editor.commands.setContent('')
    } else {
      setTo('')
      setToChips([])
      setToInput('')
      setCcChips([])
      setCcInput('')
      setBccChips([])
      setBccInput('')
      setSubject('')
      editor.commands.setContent('')
    }
    setCc('')
    setCcChips([])
    setCcInput('')
    setBcc('')
    setBccChips([])
    setBccInput('')
    setShowCc(false)
    setShowBcc(false)
    setAttachments([])
    setPriority('normal')
    setScheduleDate(undefined)
    setScheduleHour('9')
    setScheduleMinute('00')
    setScheduleAmPm('AM')
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
    if (editDraftEmail) {
      setCurrentFolder('drafts')
    }
    setComposeOpen(false)
  }, [editDraftEmail, setCurrentFolder, setComposeOpen])

  const handleDiscard = useCallback(() => {
    if (editDraftEmail) {
      removeEmail(editDraftEmail.id)
      fetch(`/api/emails/${editDraftEmail.id}`, { method: 'DELETE' }).catch(() => {})
      toast.success('Draft discarded')
    }
    setComposeOpen(false)
  }, [editDraftEmail, removeEmail, setComposeOpen])

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
    // Prevent double-send from double-click or rapid taps
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
        const ccParts = cc.split(',').map(r => r.trim()).filter(Boolean)
        for (const part of ccParts) {
          const processed = processRecipients(part)
          if (!processed.endsWith('@ezy.af')) {
            e.cc = `"${part}" is not a valid @ezy.af address`
            break
          }
        }
      }
      // Validate BCC recipients if provided
      if (showBcc && bcc.trim()) {
        const bccParts = bcc.split(',').map(r => r.trim()).filter(Boolean)
        for (const part of bccParts) {
          const processed = processRecipients(part)
          if (!processed.endsWith('@ezy.af')) {
            e.bcc = `"${part}" is not a valid @ezy.af address`
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
      const currentAttachments = attachments

      // Upload attachments FIRST
      let uploadedFiles: Array<{ name: string; url: string; size: number; type: string }> | undefined
      if (currentAttachments.length > 0) {
        setIsUploading(true)
        setUploadProgress(0)
        try {
          const result = await new Promise<Array<{ name: string; url: string; size: number; type: string; data: string }>>((resolve, reject) => {
            const formData = new FormData()
            currentAttachments.forEach(file => formData.append('files', file))
            const xhr = new XMLHttpRequest()
            xhr.open('POST', '/api/upload')
            xhr.withCredentials = true
            xhr.upload.addEventListener('progress', (ev) => {
              if (ev.lengthComputable) {
                setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
              }
            })
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText)
                  resolve(data.files)
                } catch {
                  reject(new Error('Invalid response from server'))
                }
              } else {
                try {
                  const err = JSON.parse(xhr.responseText)
                  reject(new Error(err.error || `Upload failed (status ${xhr.status})`))
                } catch {
                  reject(new Error(`Upload failed (status ${xhr.status})`))
                }
              }
            })
            xhr.addEventListener('error', () => reject(new Error('Network error — check your connection')))
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))
            xhr.timeout = 120000 // 2 minute timeout
            xhr.addEventListener('timeout', () => reject(new Error('Upload timed out — try a smaller file')))
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
        // Delete draft if editing one
        if (editDraftEmail) {
          fetch(`/api/emails/${editDraftEmail.id}`, { method: 'DELETE' }).catch(() => {})
        }
      } else {
        // Normal send with undo
        const sendResult = await actuallySendEmailWithResponse(data)
        if (sendResult?.emailId) {
          pendingSendRef.current = { ...data, sentEmailId: sendResult.emailId }
          // Delete draft if editing one
          if (editDraftEmail) {
            fetch(`/api/emails/${editDraftEmail.id}`, { method: 'DELETE' }).catch(() => {})
          }
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
    } finally {
      isSendingRef.current = false
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
        payload.attachments = data.attachments.map(a => ({ name: a.name, url: a.url, size: a.size, type: a.type, data: a.data }))
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

  const getTomorrowAfternoon = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(13, 0, 0, 0)
    return d
  }

  const getNextMonday = () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilMon = day === 0 ? 1 : (8 - day)
    d.setDate(d.getDate() + daysUntilMon)
    d.setHours(8, 0, 0, 0)
    return d
  }

  const handleQuickSchedule = (date: Date) => {
    handleSend(date)
  }

  const handleCustomSchedule = () => {
    if (!scheduleDate) return
    const hr = parseInt(scheduleHour) || 0
    let hours = scheduleAmPm === 'PM' && hr !== 12 ? hr + 12 : scheduleAmPm === 'AM' && hr === 12 ? 0 : hr
    const minutes = parseInt(scheduleMinute) || 0
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
                  {editDraftEmail ? 'Edit Draft' : replyMode === 'forward' ? 'Forward' : replyMode === 'replyAll' ? 'Reply All' : replyToEmail ? 'Reply' : 'New Message'}
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
                  <DropdownMenuContent align="end" className="w-52 z-[200]">
                    <DropdownMenuItem onClick={() => { setShowSchedulePopover(true) }} className="cursor-pointer gap-2">
                      <Clock className="w-4 h-4" />
                      Schedule
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setShowContactsPicker(true) }} className="cursor-pointer gap-2">
                      <Users className="w-4 h-4" />
                      Add from Contacts
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDiscard} className="cursor-pointer gap-2 text-red-500 hover:text-red-600 focus:text-red-600">
                      <Trash2 className="w-4 h-4" />
                      Discard
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
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 z-[200] flex items-center justify-center bg-black/40"
                      onClick={(e) => { if (e.target === e.currentTarget) { setShowContactsPicker(false); setContactSearch('') } }}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15, ease: 'easeOut' as const }}
                        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden w-[calc(100%-2rem)] max-w-sm max-h-[70vh]"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                          <h3 className="text-sm font-semibold text-[#1F1F1F] dark:text-white">Add from Contacts</h3>
                          <button
                            type="button"
                            onClick={() => { setShowContactsPicker(false); setContactSearch('') }}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                            aria-label="Close contacts"
                          >
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                        {/* Search */}
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
                                    addToChip(c.email, 'to')
                                    setShowContactsPicker(false)
                                    setContactSearch('')
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer text-left"
                                >
                                  {c.avatar ? (
                                    <img src={c.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                                      {c.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </div>
                                  )}
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
                        {chip.avatar ? (
                          <img
                            src={chip.avatar}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {initials}
                          </span>
                        )}
                        <span className="text-sm text-[#1F1F1F] dark:text-white truncate max-w-[150px]">
                          {chip.name || chip.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeChip(chip.email, 'to')}
                          className="w-5 h-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <X className="w-3 h-3 text-gray-500" />
                        </button>
                      </span>
                    )
                  })}
                  <Input
                    value={toInput}
                    onChange={e => setToInput(e.target.value)}
                    onKeyDown={e => handleChipKeyDown(e, 'to')}
                    onBlur={() => handleChipBlur('to')}
                    placeholder={toChips.length === 0 ? 'recipient' : ''}
                    className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-[80px] bg-transparent dark:bg-transparent"
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
                  <div className="flex items-center px-4 gap-2 min-h-[44px]">
                    <span className="text-sm text-gray-500 shrink-0 w-8">CC</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                      {ccChips.map(chip => {
                        const initials = chip.name
                          ? chip.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                          : chip.email[0].toUpperCase()
                        return (
                          <span
                            key={chip.email}
                            className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-full pl-0.5 pr-1 py-0.5 max-w-[240px] shrink-0"
                          >
                            {chip.avatar ? (
                              <img src={chip.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                {initials}
                              </span>
                            )}
                            <span className="text-sm text-[#1F1F1F] dark:text-white truncate max-w-[150px]">
                              {chip.name || chip.email}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeChip(chip.email, 'cc')}
                              className="w-5 h-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <X className="w-3 h-3 text-gray-500" />
                            </button>
                          </span>
                        )
                      })}
                      <Input
                        value={ccInput}
                        onChange={e => {
                          setCcInput(e.target.value)
                          if (errors.cc) setErrors(prev => { const n = { ...prev }; delete n.cc; return n })
                        }}
                        onKeyDown={e => handleChipKeyDown(e, 'cc')}
                        onBlur={() => handleChipBlur('cc')}
                        placeholder={ccChips.length === 0 ? 'CC recipients' : ''}
                        className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-[80px] bg-transparent dark:bg-transparent"
                      />
                    </div>
                  </div>
                  {errors.cc && <p className="text-xs text-red-500 px-4 pb-2">{errors.cc}</p>}
                </div>
              )}

              {/* BCC */}
              {showBcc && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center px-4 gap-2 min-h-[44px]">
                    <span className="text-sm text-gray-500 shrink-0 w-8">BCC</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                      {bccChips.map(chip => {
                        const initials = chip.name
                          ? chip.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                          : chip.email[0].toUpperCase()
                        return (
                          <span
                            key={chip.email}
                            className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-full pl-0.5 pr-1 py-0.5 max-w-[240px] shrink-0"
                          >
                            {chip.avatar ? (
                              <img src={chip.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                {initials}
                              </span>
                            )}
                            <span className="text-sm text-[#1F1F1F] dark:text-white truncate max-w-[150px]">
                              {chip.name || chip.email}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeChip(chip.email, 'bcc')}
                              className="w-5 h-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <X className="w-3 h-3 text-gray-500" />
                            </button>
                          </span>
                        )
                      })}
                      <Input
                        value={bccInput}
                        onChange={e => {
                          setBccInput(e.target.value)
                          if (errors.bcc) setErrors(prev => { const n = { ...prev }; delete n.bcc; return n })
                        }}
                        onKeyDown={e => handleChipKeyDown(e, 'bcc')}
                        onBlur={() => handleChipBlur('bcc')}
                        placeholder={bccChips.length === 0 ? 'BCC recipients' : ''}
                        className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-[80px] bg-transparent dark:bg-transparent"
                      />
                    </div>
                  </div>
                  {errors.bcc && <p className="text-xs text-red-500 px-4 pb-2">{errors.bcc}</p>}
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
                    className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm p-0 flex-1 min-w-0 bg-transparent dark:bg-transparent"
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
              <button
                type="button"
                disabled={!editor || isUploading}
                onClick={() => setShowSchedulePopover(true)}
                className="inline-flex items-center justify-center h-9 gap-1.5 text-sm font-medium text-[#4285F4] hover:bg-[#D3E3FD] dark:hover:bg-[#4285F4]/10 rounded-xl px-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Schedule</span>
              </button>

              {/* Schedule Send Modal */}
              <AnimatePresence>
                {showSchedulePopover && !showCustomSchedule && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
                    onClick={() => setShowSchedulePopover(false)}
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
                        {/* Tomorrow Morning */}
                        <button
                          type="button"
                          onClick={() => handleQuickSchedule(getTomorrowMorning())}
                          className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Sun className="w-5 h-5 text-[#FBBC05]" />
                          <div className="text-center">
                            <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Tomorrow morning</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{format(getTomorrowMorning(), 'd MMM, h:mm a')}</p>
                          </div>
                        </button>
                        {/* Tomorrow Afternoon */}
                        <button
                          type="button"
                          onClick={() => handleQuickSchedule(getTomorrowAfternoon())}
                          className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Sunset className="w-5 h-5 text-[#FBBC05]" />
                          <div className="text-center">
                            <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Tomorrow afternoon</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{format(getTomorrowAfternoon(), 'd MMM, h:mm a')}</p>
                          </div>
                        </button>
                        {/* Monday Morning */}
                        <button
                          type="button"
                          onClick={() => handleQuickSchedule(getNextMonday())}
                          className="flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Briefcase className="w-5 h-5 text-[#FBBC05]" />
                          <div className="text-center">
                            <p className="text-[13px] font-medium text-gray-900 dark:text-white leading-tight">Monday morning</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{format(getNextMonday(), 'd MMM, h:mm a')}</p>
                          </div>
                        </button>
                        {/* Pick date & time */}
                        <button
                          type="button"
                          onClick={() => setShowCustomSchedule(true)}
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

              {/* Custom date/time picker modal */}
              <AnimatePresence>
                {showSchedulePopover && showCustomSchedule && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
                    onClick={() => { setShowCustomSchedule(false); setShowSchedulePopover(false) }}
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
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
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
                          value={scheduleHour}
                          onChange={(e) => setScheduleHour(e.target.value.replace(/[^1-9]/g, '').slice(0, 2))}
                          placeholder="9"
                          className="w-10 h-8 text-center text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent text-gray-900 dark:text-white"
                        />
                        <span className="text-sm text-gray-400">:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={scheduleMinute}
                          onChange={(e) => setScheduleMinute(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                          placeholder="00"
                          className="w-10 h-8 text-center text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent text-gray-900 dark:text-white"
                        />
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                          <button
                            type="button"
                            onClick={() => setScheduleAmPm('AM')}
                            className={`px-2 h-8 text-[11px] font-medium transition-colors cursor-pointer ${scheduleAmPm === 'AM' ? 'bg-[#4285F4] text-white' : 'bg-transparent text-gray-500 dark:text-gray-400'}`}
                          >AM</button>
                          <button
                            type="button"
                            onClick={() => setScheduleAmPm('PM')}
                            className={`px-2 h-8 text-[11px] font-medium transition-colors cursor-pointer ${scheduleAmPm === 'PM' ? 'bg-[#4285F4] text-white' : 'bg-transparent text-gray-500 dark:text-gray-400'}`}
                          >PM</button>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => { setShowCustomSchedule(false); setShowSchedulePopover(false) }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-[#4285F4] hover:bg-[#1a73e8]"
                          onClick={handleCustomSchedule}
                          disabled={!scheduleDate}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Schedule send
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

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
