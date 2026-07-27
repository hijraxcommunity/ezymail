'use client'

import type React from 'react'
import { Mail, Star, Send, FileText, Trash2, Archive, Plus, Users, Clock, CalendarClock, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAppStore, type MailView } from '@/store/use-app-store'

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
    isAuthenticated,
  } = useAppStore()

  // Subscribe to emails for real-time counts
  const emailList = useAppStore((s) => s.emails)
  const inboxCount = emailList.filter((e) => e.folder === 'inbox' && !e.isRead).length
  const draftsCount = emailList.filter((e) => e.folder === 'drafts').length
  const archiveCount = emailList.filter((e) => e.isArchived).length

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

  const handleNavClick = (view: MailView) => {
    // Clear search when switching folders
    useAppStore.getState().setSearchQuery('')
    useAppStore.getState().setSearchResults([])
    setCurrentFolder(view)
    setSidebarOpen(false)
  }

  const sidebarContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Compose Button */}
      <div className="p-3 pb-2">
        <Button
          onClick={() => {
            setComposeOpen(true)
            setSidebarOpen(false)
          }}
          className="w-full h-9 sm:h-10 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium gap-2 shadow-sm shadow-[#4285F4]/20 active:scale-[0.98] transition-transform"
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
            const isActive = currentFolder === item.view && !currentFolderId
            return (
              <motion.button
                key={item.view}
                variants={itemVariants}
                onClick={() => handleNavClick(item.view)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-150 min-h-[40px] active:scale-[0.97] transition-transform ${
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

        </motion.nav>

        {/* ─── Contacts ─── */}
        <motion.button
          variants={itemVariants}
          onClick={() => {
            setContactsView(true)
            setSidebarOpen(false)
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#1F1F1F] dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[40px] mt-1"
        >
          <Users className="w-5 h-5 shrink-0 text-[#1F1F1F] dark:text-gray-300" />
          <span className="flex-1 text-left">Contacts</span>
        </motion.button>


      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight">EzyMail v1.0</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight mt-0.5">From HijraX</p>
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
          {/* Mobile-only Logo */}
          <div className="flex items-center gap-2.5 px-4 pt-5 pb-3">
            <img src="/logo.svg" alt="EzyMail" className="w-8 h-8 drop-shadow-sm shrink-0" />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[#4285F4]">Ezy</span><span className="text-[#1F1F1F] dark:text-white">Mail</span>
            </span>
          </div>
          {sidebarContent}
        </SheetContent>
      </Sheet>
    </>
  )
}
