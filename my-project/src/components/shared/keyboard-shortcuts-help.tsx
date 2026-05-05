'use client'

import { Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Shortcut {
  keys: string
  description: string
}

interface ShortcutCategory {
  title: string
  shortcuts: Shortcut[]
}

const shortcutCategories: ShortcutCategory[] = [
  {
    title: 'Go to',
    shortcuts: [
      { keys: 'g i', description: 'Inbox' },
      { keys: 'g s', description: 'Starred' },
      { keys: 'g d', description: 'Drafts' },
      { keys: 'g t', description: 'Trash' },
    ],
  },
  {
    title: 'Email Actions',
    shortcuts: [
      { keys: 'c', description: 'Compose' },
      { keys: 'r', description: 'Reply' },
      { keys: 'a', description: 'Reply All' },
      { keys: 'f', description: 'Forward' },
      { keys: 'e', description: 'Archive' },
      { keys: '#', description: 'Delete' },
      { keys: 'u', description: 'Mark Unread' },
      { keys: 's', description: 'Star' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'j', description: 'Next email' },
      { keys: 'k', description: 'Previous email' },
      { keys: 'o', description: 'Open' },
      { keys: 'Esc', description: 'Close / Back' },
    ],
  },
  {
    title: 'Other',
    shortcuts: [
      { keys: '/', description: 'Focus Search' },
      { keys: '?', description: 'Show Shortcuts' },
    ],
  },
]

function Kbd({ children }: { children: string }) {
  const parts = children.split(' ')

  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, idx) => (
        <span key={idx}>
          {idx > 0 && <span className="text-[10px] text-gray-400 mx-0.5">+</span>}
          <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono font-medium text-gray-700 dark:text-gray-300 shadow-sm">
            {part}
          </kbd>
        </span>
      ))}
    </span>
  )
}

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="w-4 h-4 text-[#4285F4]" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto space-y-5">
          {shortcutCategories.map((category) => (
            <div key={category.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                {category.title}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {shortcut.description}
                    </span>
                    <Kbd>{shortcut.keys}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
