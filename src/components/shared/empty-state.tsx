'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Inbox, Clock, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: React.ElementType
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  const isCelebration = Icon === 'celebration'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-20 text-center px-4"
    >
      {isCelebration ? (
        <div className="mb-4">
          <svg className="w-20 h-20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill="#E8F5E9" stroke="#4CAF50" strokeWidth="2" />
            <path d="M32 52L44 64L68 38" stroke="#4CAF50" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="22" cy="18" r="4" fill="#FBBC04" />
            <circle cx="78" cy="15" r="3" fill="#EA4335" />
            <circle cx="85" cy="30" r="3.5" fill="#4285F4" />
            <rect x="74" y="8" width="2" height="10" rx="1" fill="#FBBC04" />
            <rect x="82" y="22" width="2" height="9" rx="1" fill="#4285F4" />
            <rect x="15" y="12" width="2" height="8" rx="1" fill="#EA4335" />
            <rect x="88" y="18" width="1.5" height="6" rx="0.75" fill="#34A853" transform="rotate(30 88 18)" />
          </svg>
        </div>
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-3">
        {description}
      </p>
      {action && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </motion.div>
  )
}

/* ─── Folder-aware empty state messages ─── */

interface FolderEmptyStateProps {
  folder: string
  isSearch?: boolean
  onClearSearch?: () => void
}

export function FolderEmptyState({ folder, isSearch, onClearSearch }: FolderEmptyStateProps) {
  const messages: Record<string, { icon: React.ElementType | string; title: string; description: string }> = {
    inbox: {
      icon: 'celebration',
      title: "You're all caught up!",
      description: 'No new emails. Time to grab a coffee!',
    },
    starred: {
      icon: Inbox,
      title: 'No starred emails',
      description: 'Star important emails to find them here.',
    },
    sent: {
      icon: Inbox,
      title: 'No sent emails',
      description: 'No sent emails yet.',
    },
    drafts: {
      icon: Inbox,
      title: 'No drafts',
      description: 'No drafts. Drafts you save will appear here.',
    },
    trash: {
      icon: Inbox,
      title: 'Trash is empty',
      description: 'Trash is empty.',
    },
    archive: {
      icon: Inbox,
      title: 'No archived emails',
      description: 'No archived emails.',
    },
    search: {
      icon: Inbox,
      title: 'No results found',
      description: 'No results found. Try different search terms.',
    },
    scheduled: {
      icon: Clock,
      title: 'No scheduled emails',
      description: 'Your scheduled emails will appear here.',
    },
    snoozed: {
      icon: CalendarClock,
      title: 'No snoozed emails',
      description: 'Your snoozed emails will appear here.',
    },
  }

  const msg = messages[folder] || messages.inbox

  return (
    <EmptyState
      icon={msg.icon}
      title={msg.title}
      description={msg.description}
      action={isSearch && onClearSearch ? { label: 'Clear search', onClick: onClearSearch } : undefined}
    />
  )
}
