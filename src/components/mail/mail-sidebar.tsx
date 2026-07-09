'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, Star, Send, FileText, Trash2, Archive, Plus, Tag, X, Users, Clock, CalendarClock, ShieldAlert } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAppStore, type MailView, type Label } from '@/store/use-app-store'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
  },
}

const LABEL_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853',
  '#FF6D01', '#46BDC6', '#7B1FA2', '#E91E63',
]

export function MailSidebar() {
  const {
    user,
    currentFolder,
    currentFolderId,
    sidebarOpen,
    setSidebarOpen,
    setCurrentFolder,
    setComposeOpen,
    setContactsView,
    labels,
    setLabels,
    addLabel,
    removeLabel,
    setEmailLabels,
    emailLabelsMap,
    isAuthenticated,
  } = useAppStore()

  // Subscribe to emails for real-time counts
  const emailList = useAppStore((s) => s.emails)
  const inboxCount = emailList.filter((e) => e.folder === 'inbox' && !e.isRead).length
  const draftsCount = emailList.filter((e) => e.folder === 'drafts').length
  const archiveCount = emailList.filter((e) => e.isArchived).length

  const [showNewLabelForm, setShowNewLabelForm] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#4285F4')
  const [activeLabelFilter, setActiveLabelFilter] = useState<string | null>(null)

  const navItems: { view: MailView; label: string; icon: React.ElementType; count?: number }[] = [
    { view: 'inbox', label: 'Inbox', icon: Mail, count: inboxCount },
    { view: 'starred', label: 'Starred', icon: Star },
    { view: 'sent', label: 'Sent', icon: Send },
    { view: 'scheduled', label: 'Scheduled', icon: Clock },
    { view: 'snoozed', label: 'Snoozed', icon: CalendarClock },
    { view: 'drafts', label: 'Drafts', icon: FileText, count: draftsCount },
    { view: 'archive', label: 'Archive', icon: Archive, count: archiveCount },
    { view: 'trash', label: 'Trash', icon: Trash2 },
    { view: 'spam', label: 'Spam', icon: ShieldAlert },
  ]

  /* ─── Fetch labels ─── */
  const fetchLabels = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetch('/api/labels')
      const data = await res.json()
      if (data.success) {
        setLabels(data.data)
      }
    } catch {
      // silent
    }
  }, [isAuthenticated, setLabels])

  useEffect(() => {
    fetchLabels()
  }, [fetchLabels])

  /* ─── Fetch email labels for visible emails ─── */
  useEffect(() => {
    if (!isAuthenticated) return
    const emailIds = emailList.map((e) => e.id).filter((id) => !emailLabelsMap[id])
    if (emailIds.length === 0) return

    const controller = new AbortController()
    emailIds.slice(0, 10).forEach((emailId) => {
      fetch(`/api/emails/${emailId}/labels`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setEmailLabels(emailId, data.data)
          }
        })
        .catch(() => {})
    })

    return () => controller.abort()
  }, [isAuthenticated, emailList, emailLabelsMap, setEmailLabels])

  /* ─── Create label ─── */
  const handleCreateLabel = async () => {
    const name = newLabelName.trim()
    if (!name) return

    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newLabelColor }),
      })
      const data = await res.json()
      if (data.success) {
        addLabel(data.data)
        setNewLabelName('')
        setNewLabelColor('#4285F4')
        setShowNewLabelForm(false)
        toast.success('Label created')
      } else {
        toast.error(data.error || 'Failed to create label')
      }
    } catch {
      toast.error('Failed to create label')
    }
  }

  /* ─── Delete label ─── */
  const handleDeleteLabel = async (e: React.MouseEvent, labelId: string) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/labels/${labelId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        removeLabel(labelId)
        toast.success('Label deleted')
      }
    } catch {
      toast.error('Failed to delete label')
    }
  }

  /* ─── Filter by label ─── */
  const handleLabelClick = (labelId: string) => {
    if (activeLabelFilter === labelId) {
      setActiveLabelFilter(null)
      setCurrentFolder('inbox')
    } else {
      setActiveLabelFilter(labelId)
      // Filter emails client-side based on emailLabelsMap
      const labelEmails = emailList.filter((email) => {
        const emailLabels = emailLabelsMap[email.id] || []
        return emailLabels.some((l) => l.id === labelId)
      })
      useAppStore.getState().setSearchQuery('')
      useAppStore.getState().setSearchResults(labelEmails)
      useAppStore.getState().setCurrentFolder('search')
    }
    setSidebarOpen(false)
  }

  const handleNavClick = (view: MailView) => {
    // Clear search when switching folders
    useAppStore.getState().setSearchQuery('')
    useAppStore.getState().setSearchResults([])
    setActiveLabelFilter(null)
    setCurrentFolder(view)
    setSidebarOpen(false)
  }

  const sidebarContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Compose Button */}
      <div className="p-3 sm:p-4">
        <Button
          onClick={() => {
            setComposeOpen(true)
            setSidebarOpen(false)
          }}
          className="w-full h-10 sm:h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium gap-2 shadow-sm shadow-[#4285F4]/20 active:scale-[0.98] transition-transform"
        >
          <Plus className="w-4 h-4" />
          Compose
        </Button>
      </div>

      {/* Navigation Items */}
      <ScrollArea className="flex-1 px-2 pb-4">
        <motion.nav
          className="space-y-0.5"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          key={sidebarOpen ? 'sheet-open' : 'desktop'}
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentFolder === item.view && !currentFolderId && !activeLabelFilter
            return (
              <motion.button
                key={item.view}
                variants={itemVariants}
                onClick={() => handleNavClick(item.view)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 min-h-[44px] ${
                  isActive
                    ? 'bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]'
                    : 'text-[#1F1F1F] dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-[#4285F4]' : 'text-[#1F1F1F] dark:text-gray-300'
                  }`}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-[#4285F4] text-white'
                        : 'bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </motion.button>
            )
          })}

          {/* ─── Labels Section ─── */}
          {labels.length > 0 && (
            <div className="pt-4">
              <div className="flex items-center justify-between px-3 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Labels
                </span>
              </div>
              {labels.map((label) => {
                const isActive = activeLabelFilter === label.id
                const emailCount = Object.values(emailLabelsMap).flat().filter((l) => l.id === label.id).length
                return (
                  <motion.div
                    key={label.id}
                    variants={itemVariants}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLabelClick(label.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleLabelClick(label.id)
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-150 min-h-[44px] cursor-pointer group ${
                      isActive
                        ? 'bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]'
                        : 'text-[#1F1F1F] dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center shrink-0">
                      <span
                        className="w-3 h-3 rounded-full border border-white dark:border-gray-900 shadow-sm"
                        style={{ backgroundColor: label.color }}
                      />
                    </span>
                    <span className="flex-1 text-left truncate">{label.name}</span>
                    {emailCount > 0 && (
                      <span className="text-xs text-gray-400 tabular-nums">{emailCount}</span>
                    )}
                    <button
                      onClick={(e) => handleDeleteLabel(e, label.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all shrink-0"
                      aria-label={`Delete ${label.name} label`}
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.nav>

        {/* ─── Contacts ─── */}
        <motion.button
          variants={itemVariants}
          onClick={() => {
            setContactsView(true)
            setSidebarOpen(false)
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#1F1F1F] dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] mt-2"
        >
          <Users className="w-5 h-5 shrink-0 text-[#1F1F1F] dark:text-gray-300" />
          <span className="flex-1 text-left">Contacts</span>
        </motion.button>

        {/* ─── Create Label Section ─── */}
        <div className="mt-3 pb-4">
          <AnimatePresence>
            {showNewLabelForm ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-2.5">
                  <Input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateLabel()
                      if (e.key === 'Escape') setShowNewLabelForm(false)
                    }}
                    placeholder="Label name"
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    {LABEL_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewLabelColor(color)}
                        className={`w-5 h-5 rounded-full transition-transform ${
                          newLabelColor === color ? 'scale-125 ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-900' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateLabel}>
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewLabelForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                variants={itemVariants}
                onClick={() => setShowNewLabelForm(true)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#1F1F1F] dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px]"
              >
                <Tag className="w-5 h-5 shrink-0 text-[#1F1F1F] dark:text-gray-300" />
                <span className="flex-1 text-left">Create label</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight">EzyMail v1.0</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight mt-0.5">Made with ♥</p>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 lg:w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-col shrink-0 overflow-hidden">
        {sidebarContent}
      </aside>

      {/* Mobile Sheet Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          {sidebarContent}
        </SheetContent>
      </Sheet>
    </>
  )
}
