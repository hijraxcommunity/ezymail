'use client'

import { useRef } from 'react'
import { Mail, Star, Plus, Send, Menu } from 'lucide-react'
import { useAppStore } from '@/store/use-app-store'

type NavItemId = 'inbox' | 'starred' | 'compose' | 'sent' | 'more'

interface NavItem {
  id: NavItemId
  label: string
  icon: React.ElementType
  isFab?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'inbox', label: 'Inbox', icon: Mail },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'compose', label: 'Compose', icon: Plus, isFab: true },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'more', label: 'More', icon: Menu },
]

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  const display = count > 99 ? '99+' : String(count)
  return (
    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 pointer-events-none">
      {display}
    </span>
  )
}

export function MobileNav() {
  const { currentFolder, setCurrentFolder, setComposeOpen, setSidebarOpen, emails } = useAppStore()
  const navRef = useRef<HTMLElement>(null)
  const inboxCount = emails.filter(e => e.folder === 'inbox' && !e.isRead).length

  const isActive = (id: NavItemId) => {
    if (id === 'compose') return false
    if (id === 'more') return false
    if (id === 'starred') return currentFolder === 'starred'
    return currentFolder === id
  }

  const handleClick = (item: NavItemId) => {
    // Clear search when switching to any folder
    useAppStore.getState().setSearchQuery('')
    useAppStore.getState().setSearchResults([])
    switch (item) {
      case 'inbox':
        setCurrentFolder('inbox')
        break
      case 'starred':
        setCurrentFolder('starred')
        break
      case 'compose':
        setComposeOpen(true)
        break
      case 'sent':
        setCurrentFolder('sent')
        break
      case 'more':
        setSidebarOpen(true)
        break
    }
  }

  return (
    <nav
      ref={navRef}
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
    >
      <div className="relative flex items-center justify-around px-1 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.id)

          if (item.isFab) {
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item.id)}
                className="flex flex-col items-center justify-center w-[56px] -mt-5 relative z-10 appearance-none [-webkit-appearance:none] outline-none focus:outline-none focus-visible:outline-none border-0 bg-transparent p-0"
                aria-label={item.label}
                style={{ boxShadow: 'none' }}
              >
                <div className="w-12 h-12 rounded-full bg-[#4285F4] flex items-center justify-center active:scale-95 transition-transform duration-150" style={{ boxShadow: 'none' }}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] mt-0.5 font-medium text-gray-400">
                  {item.label}
                </span>
              </button>
            )
          }

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className="flex flex-col items-center justify-center w-[56px] min-h-[44px] relative z-10 appearance-none [-webkit-appearance:none] outline-none focus:outline-none focus-visible:outline-none border-0 bg-transparent p-0"
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center w-11 h-7">
                <Icon
                  className={`w-5 h-5 transition-colors duration-200 ${
                    active ? 'text-[#4285F4]' : 'text-gray-400 dark:text-gray-500'
                  }`}
                />
                {item.id === 'inbox' && <Badge count={inboxCount} />}
              </div>
              <span
                className={`text-[10px] mt-0.5 font-medium transition-colors duration-200 ${
                  active ? 'text-[#4285F4]' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
