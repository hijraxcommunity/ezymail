'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Sun, Moon, Menu, Mail, Settings, User, Shield, LogOut, X,
  Loader2, Clock, ArrowRight, Filter, Bookmark, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store/use-app-store'
import { AdvancedSearchDialog } from './advanced-search-dialog'

/* ─── Operator Parsing (client-side for highlighting) ─── */

interface ParsedToken {
  text: string
  type: 'operator' | 'value' | 'text'
}

function parseSearchTokens(query: string): ParsedToken[] {
  if (!query.trim()) return []

  const tokens: ParsedToken[] = []
  const regex = /(\w+:)(?:"([^"]*)"|([^\s]*))|([^\s]+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(query)) !== null) {
    if (match[1]) {
      // Operator match: from:, to:, subject:, etc.
      const opKey = match[1].toLowerCase()
      const isSearchOperator = ['from:', 'to:', 'subject:', 'has:', 'is:', 'before:', 'after:', 'body:'].includes(opKey)
      const value = match[2] !== undefined ? match[2] : match[3]
      tokens.push({ text: match[1], type: isSearchOperator ? 'operator' : 'text' })
      if (value) {
        tokens.push({ text: value, type: isSearchOperator ? 'value' : 'text' })
      }
    } else if (match[4]) {
      tokens.push({ text: match[4], type: 'text' })
    }
  }

  return tokens
}

/* ─── Search Suggestion Dropdown ─── */

function SearchSuggestions({
  query,
  recentSearches,
  savedSearches,
  onSelect,
  onSelectRecent,
  onSelectSaved,
  onClearRecent,
  isOpen,
  onClose,
}: {
  query: string
  recentSearches: string[]
  savedSearches: { id: string; name: string; query: string }[]
  onSelect: (q: string) => void
  onSelectRecent: (q: string) => void
  onSelectSaved: (saved: { id: string; name: string; query: string; from: string; to: string; subject: string; body: string; hasAttachment: boolean; isUnread: boolean; isStarred: boolean; before: string; after: string; folder: string; label: string }) => void
  onClearRecent: () => void
  isOpen: boolean
  onClose: () => void
}) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const showRecent = !query.trim() && recentSearches.length > 0
  const showSaved = !query.trim() && savedSearches.length > 0
  const showSearchFor = query.trim().length > 0

  return (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg shadow-black/5 overflow-hidden"
    >
      {/* Saved Searches */}
      {showSaved && (
        <div className="p-1.5">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Saved
            </span>
          </div>
          {savedSearches.slice(0, 5).map((saved) => (
            <div
              key={saved.id}
              role="option"
              aria-selected={false}
              onClick={() => onSelectSaved(saved as Parameters<typeof onSelectSaved>[0])}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <Bookmark className="w-3.5 h-3.5 text-[#4285F4] shrink-0" />
              <span className="text-sm text-[#1F1F1F] dark:text-gray-200 flex-1 truncate">
                {saved.name}
              </span>
              <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                {saved.query || 'Advanced'}
              </span>
            </div>
          ))}
        </div>
      )}

      {showSaved && showRecent && <Separator className="mx-2" />}

      {/* Recent Searches */}
      {showRecent && (
        <div className="p-1.5">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Recent
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClearRecent()
              }}
              className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex items-center gap-0.5"
            >
              <Trash2 className="w-2.5 h-2.5" />
              Clear
            </button>
          </div>
          {recentSearches.map((term) => (
            <div
              key={term}
              role="option"
              aria-selected={false}
              onClick={() => onSelectRecent(term)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-sm text-[#1F1F1F] dark:text-gray-200 flex-1 truncate">
                {term}
              </span>
              <ArrowRight className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}

      {/* Active search suggestion */}
      {showSearchFor && (
        <div className="p-1.5">
          <div
            role="option"
            aria-selected={false}
            onClick={() => onSelect(query.trim())}
            className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-[#1F1F1F] dark:text-gray-200 flex-1">
              Search for: <span className="font-medium">{query.trim()}</span>
            </span>
            <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              Enter ↵
            </span>
          </div>
          {/* Operator hint */}
          {query.includes(':') && (
            <div className="px-2 pb-1">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Operators: <code className="text-[#4285F4]">from:</code>{' '}
                <code className="text-[#4285F4]">to:</code>{' '}
                <code className="text-[#4285F4]">subject:</code>{' '}
                <code className="text-[#4285F4]">has:</code>{' '}
                <code className="text-[#4285F4]">is:</code>{' '}
                <code className="text-[#4285F4]">before:</code>{' '}
                <code className="text-[#4285F4]">after:</code>
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   Main MailHeader Component
   ═══════════════════════════════════════════ */

export function MailHeader() {
  const {
    user,
    sidebarOpen,
    setSidebarOpen,
    searchQuery,
    setSearchQuery,
    setSettingsView,
    setAdminView,
    logout,
    emails,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    savedSearches,
    removeSavedSearch,
  } = useAppStore()
  const { theme, setTheme } = useTheme()

  const [searchLoading, setSearchLoading] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const unreadCount = emails.filter((e) => !e.isRead).length

  // Parse tokens for operator highlighting
  const parsedTokens = useMemo(() => parseSearchTokens(searchQuery), [searchQuery])

  /* ─── Debounced search (500ms) ─── */
  const executeSearch = useCallback(
    async (q: string) => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        useAppStore.getState().setSearchResults(data.results || [])
        useAppStore.getState().setSearchTotal(data.total || 0)
        useAppStore.getState().setSearchOperators(data.operators || null)
        useAppStore.getState().setCurrentFolder('search')
        if (q.trim()) addRecentSearch(q.trim())
      } catch {
        toast.error('Search failed')
      } finally {
        setSearchLoading(false)
      }
    },
    [addRecentSearch],
  )

  // Execute saved search via POST
  const executeSavedSearch = useCallback(
    async (saved: { id: string; name: string; query: string; from: string; to: string; subject: string; body: string; hasAttachment: boolean; isUnread: boolean; isStarred: boolean; before: string; after: string; folder: string; label: string }) => {
      setSearchLoading(true)
      setSearchQuery(saved.name)
      setShowSuggestions(false)
      try {
        const payload: Record<string, unknown> = {
          query: saved.query,
          from: saved.from,
          to: saved.to,
          subject: saved.subject,
          body: saved.body,
          hasAttachment: saved.hasAttachment,
          isUnread: saved.isUnread,
          isStarred: saved.isStarred,
          before: saved.before,
          after: saved.after,
          folder: saved.folder,
          label: saved.label,
        }
        // Remove empty values
        Object.keys(payload).forEach((key) => {
          if (payload[key] === '' || payload[key] === false || payload[key] === null || payload[key] === undefined) {
            delete payload[key]
          }
        })

        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (res.ok) {
          useAppStore.getState().setSearchResults(data.results || [])
          useAppStore.getState().setSearchTotal(data.total || 0)
          useAppStore.getState().setSearchOperators(data.operators || null)
          useAppStore.getState().setCurrentFolder('search')
          addRecentSearch(saved.name)
        }
      } catch {
        toast.error('Search failed')
      } finally {
        setSearchLoading(false)
      }
    },
    [addRecentSearch, setSearchQuery],
  )

  // Auto-close search when query is cleared
  useEffect(() => {
    if (searchQuery.trim() === '' && useAppStore.getState().currentFolder === 'search') {
      useAppStore.getState().setCurrentFolder('inbox')
      useAppStore.getState().setSearchResults([])
      useAppStore.getState().setSearchTotal(0)
      useAppStore.getState().setSearchOperators(null)
    }
  }, [searchQuery])

  useEffect(() => {
    if (!searchQuery.trim()) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      executeSearch(searchQuery)
    }, 500)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery, executeSearch])

  /* ─── Search suggestion handlers ─── */
  const handleSelectRecent = (term: string) => {
    setSearchQuery(term)
    setShowSuggestions(false)
    searchInputRef.current?.blur()
  }

  const handleSelectSearchFor = (q: string) => {
    setSearchQuery(q)
    setShowSuggestions(false)
    searchInputRef.current?.blur()
  }

  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase()
    : 'U'

  // Determine if we should show the clear button
  const showClearBtn = searchQuery.length > 0

  return (
    <>
      <header className="h-12 sm:h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0 z-30">
        {/* ─── Left: Hamburger + Logo ─── */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-9 w-9"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-[#4285F4] flex items-center justify-center shrink-0">
              <Mail className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-base sm:text-lg font-bold hidden xs:block whitespace-nowrap">
              <span className="text-[#4285F4]">Ezy</span>
              <span className="text-[#34A853]">Mail</span>
            </span>
          </div>
        </div>

        {/* ─── Center: Search ─── */}
        <div className="flex-1 flex justify-center max-w-xl mx-auto min-w-0">
          <div className="relative w-full">
            {/* Highlighted input overlay */}
            {searchFocused && searchQuery.length > 0 && (
              <div className="absolute left-8 right-7 top-1/2 -translate-y-1/2 pointer-events-none flex items-center text-sm whitespace-nowrap overflow-hidden">
                {parsedTokens.map((token, i) => (
                  <span
                    key={i}
                    className={
                      token.type === 'operator'
                        ? 'text-[#4285F4] font-medium'
                        : token.type === 'value'
                          ? 'text-[#EA4335] font-medium'
                          : 'invisible'
                    }
                  >
                    {token.text}{' '}
                  </span>
                ))}
              </div>
            )}

            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                setSearchFocused(true)
                setShowSuggestions(true)
              }}
              onBlur={() => {
                setTimeout(() => {
                  setSearchFocused(false)
                  setShowSuggestions(false)
                }, 200)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  setShowSuggestions(false)
                  searchInputRef.current?.blur()
                }
                if (e.key === 'Escape') {
                  setShowSuggestions(false)
                  searchInputRef.current?.blur()
                }
              }}
              placeholder="Search... (e.g. from:sarah is:unread)"
              className="h-8 sm:h-9 rounded-full pl-8 pr-14 sm:pr-20 bg-gray-100 dark:bg-gray-900 border-0 focus-visible:ring-1 focus-visible:ring-[#4285F4]/30 text-sm"
              style={{ caretColor: '#4285F4' }}
            />

            {/* Clear button */}
            <AnimatePresence>
              {showClearBtn && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => {
                    setSearchQuery('')
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-10 sm:right-16 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
                >
                  <X className="w-3 h-3 text-gray-600 dark:text-gray-300" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Filter button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800"
              onClick={() => setAdvancedSearchOpen(true)}
              title="Advanced search"
            >
              <Filter className="w-3.5 h-3.5 text-gray-500" />
            </Button>


            {/* Loading spinner */}
            {searchLoading && (
              <Loader2 className="absolute right-10 sm:right-16 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
            )}

            {/* Search suggestions dropdown */}
            <AnimatePresence>
              {showSuggestions && (
                <SearchSuggestions
                  query={searchQuery}
                  recentSearches={recentSearches}
                  savedSearches={savedSearches}
                  onSelect={handleSelectSearchFor}
                  onSelectRecent={handleSelectRecent}
                  onSelectSaved={executeSavedSearch}
                  onClearRecent={clearRecentSearches}
                  isOpen={showSuggestions}
                  onClose={() => setShowSuggestions(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ─── Right: Theme Toggle + Profile ─── */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="w-4 h-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute w-4 h-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 relative">
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                  <AvatarImage src={user?.avatar || undefined} />
                  <AvatarFallback className="bg-[#D3E3FD] text-[#4285F4] text-[10px] sm:text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-950">
                    <span className="sr-only">{unreadCount} unread</span>
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {user?.firstName} {user?.lastName}
                    </p>
                    {unreadCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0 rounded-full">
                        {unreadCount} unread
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsView('profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettingsView('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              {user?.role === 'admin' && (
                <DropdownMenuItem onClick={() => setAdminView('dashboard')}>
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Panel
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' })
                  toast.success('Logged out')
                  logout()
                }}
                className="text-red-500"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Advanced Search Dialog */}
      <AdvancedSearchDialog
        open={advancedSearchOpen}
        onOpenChange={setAdvancedSearchOpen}
      />
    </>
  )
}
