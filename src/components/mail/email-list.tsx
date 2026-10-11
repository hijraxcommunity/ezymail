'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import {
  RefreshCw,
  Archive,
  Trash2,
  Mail,
  MailOpen,
  ArchiveRestore,
  X,
  Search,
  Clock,
  CalendarClock,
  Loader2,
} from 'lucide-react'
import { format, isToday, isYesterday, isAfter, startOfWeek } from 'date-fns'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/use-app-store'
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
import { EmailCard } from './email-card'
import { EmailListSkeleton } from '@/components/shared/loading-skeleton'
import { FolderEmptyState } from '@/components/shared/empty-state'

export function EmailList() {
  const {
    isAuthenticated,
    currentFolder,
    emails,
    searchResults,
    selectedEmailId,
    isLoading,
    currentPage,
    totalEmails,
    selectedEmailIds,
    searchQuery,
    searchTotal,
    searchOperators,
    settingsView,
    contactsView,
    adminView,
    setSelectedEmailId,
    setEmails,
    appendEmails,
    setIsLoading,
    setCurrentPage,
    setTotalEmails,
    selectAllEmails,
    clearSelection,
    toggleSelectEmail,
    deleteSelected,
    removeEmail,
    archiveSelected,
    markSelectedRead,
    setSearchQuery,
    setCurrentFolder,
    setSearchResults,
    setSearchTotal,
    setSearchOperators,
    scrollPositions,
    setScrollPosition,
  } = useAppStore()

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const touchStartY = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollSaveRafRef = useRef<number | null>(null)
  // Gmail-style infinite scroll: older messages auto-append as the user scrolls
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const isLoadingMoreRef = useRef(false) // guards the setPage → fetch gap
  const noMoreRef = useRef(false) // older history exhausted for this folder
  const maxPageLoadedRef = useRef(0) // highest page fetched for this folder
  const lastLoadErrorAtRef = useRef(0) // throttle auto-retries after a failure
  // Floating loader pill: stays visible for a minimum window so fast loads
  // and instantly-failing requests still give perceptible Gmail-style feedback
  const [showLoaderPill, setShowLoaderPill] = useState(false)
  const loaderHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevListLoadingRef = useRef(false)
  // Auto-recovery when a load-older fetch fails (flaky network): the same page
  // is retried after the backoff window so the list can never get stuck silent
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoRetriesRef = useRef(0)

  const fetchEmails = useCallback(async () => {
    if (!isAuthenticated) return
    if (currentFolder === 'search') {
      setIsLoading(false)
      return
    }
    // A new fetch cycle invalidates any pending load-more trigger
    isLoadingMoreRef.current = false
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current)
      autoRetryTimerRef.current = null
    }
    // Page 1 replaces the list (fresh view); deeper pages APPEND to it so
    // previously loaded messages (and the user's scroll position) are kept
    const append = currentPage > 1
    let failed = false
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('folder', currentFolder === 'folder' ? 'custom' : currentFolder)
      params.set('page', String(currentPage))
      params.set('limit', '20')
      const res = await fetch(`/api/emails?${params}`)
      const data = await res.json()
      if (res.ok) {
        if (append) {
          const added = appendEmails(data.emails || [])
          if (currentPage > maxPageLoadedRef.current) {
            maxPageLoadedRef.current = currentPage
            // A brand-new page that yielded nothing new means older history
            // is exhausted (server thread-grouping can shrink pages)
            if (added === 0) noMoreRef.current = true
          }
        } else {
          maxPageLoadedRef.current = 1
          noMoreRef.current = false
          setEmails(data.emails || [])
        }
        setTotalEmails(data.total || 0)
      } else {
        failed = true
        lastLoadErrorAtRef.current = Date.now()
      }
    } catch {
      failed = true
      lastLoadErrorAtRef.current = Date.now()
      toast.error('Failed to load emails')
    } finally {
      setIsLoading(false)
      if (append && failed) {
        // A failed load-older must not leave the list silently stuck: retry
        // the same page after the backoff window (bounded, so a permanently
        // broken folder cannot turn into a request storm)
        if (autoRetriesRef.current < 5) {
          autoRetriesRef.current += 1
          if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current)
          autoRetryTimerRef.current = setTimeout(() => {
            autoRetryTimerRef.current = null
            void fetchEmailsRef.current?.()
          }, 2500)
        }
      } else if (!failed) {
        autoRetriesRef.current = 0
      }
      if (!append) {
        // PRD 5.2: Restore scroll position (page-1 loads only — appends must
        // never move the viewport while the user is reading)
        const saved = scrollPositions[currentFolder]
        if (saved && saved > 0 && scrollContainerRef.current) {
          requestAnimationFrame(() => {
            scrollContainerRef.current?.scrollTo(0, saved)
          })
        }
      }
    }
  }, [
    isAuthenticated,
    currentFolder,
    currentPage,
    appendEmails,
    setEmails,
    setIsLoading,
    setTotalEmails,
  ])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])
  // Latest-ref handle so the auto-retry can re-run the current fetch cycle
  const fetchEmailsRef = useRef<(() => Promise<void>) | null>(null)
  fetchEmailsRef.current = fetchEmails

  // ─── Auto-refresh when navigating back from an opened email ──────────────
  // Refetches the list so newly arrived emails appear without a manual reload
  const prevSelectedRef = useRef(selectedEmailId)
  useEffect(() => {
    if (prevSelectedRef.current && !selectedEmailId) {
      fetchEmails()
    }
    prevSelectedRef.current = selectedEmailId
  }, [selectedEmailId, fetchEmails])

  // ─── Auto-refresh when returning from another in-app page ────────────────
  // Covers settings / contacts / admin panels: refetch when the overlay page
  // closes so newly arrived emails are visible without a manual reload
  const prevOverlayRef = useRef(false)
  useEffect(() => {
    const overlayOpen = Boolean(settingsView || contactsView || adminView)
    if (prevOverlayRef.current && !overlayOpen) {
      fetchEmails()
    }
    prevOverlayRef.current = overlayOpen
  }, [settingsView, contactsView, adminView, fetchEmails])

  // ─── Explicit refresh (button / pull-to-refresh) ──────────────────────
  // Reloads from the newest page like Gmail: pagination resets to page 1 and
  // the stale deep-scroll memory is cleared so the viewport is not yanked
  const refreshFromTop = async () => {
    if (currentFolder === 'search') return
    noMoreRef.current = false
    scrollContainerRef.current?.scrollTo(0, 0)
    if (currentPage !== 1) {
      setScrollPosition(currentFolder, 0)
      setCurrentPage(1) // effect refetches page 1 and replaces the list
    } else {
      await fetchEmails()
    }
  }

  // Pull-to-refresh touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = scrollContainerRef.current?.scrollTop || 0
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const scrollTop = scrollContainerRef.current?.scrollTop || 0
    if (scrollTop > 0) {
      touchStartY.current = null
      setPullDistance(0)
      return
    }
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.4, 100))
    }
  }

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(0)
      touchStartY.current = null
      await refreshFromTop()
      toast.success('Emails refreshed')
      setIsRefreshing(false)
    } else {
      setPullDistance(0)
      touchStartY.current = null
    }
  }

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setSearchTotal(0)
    setSearchOperators(null)
    setCurrentFolder('inbox')
  }

  // Compute display emails
  let displayEmails =
    currentFolder === 'search'
      ? searchResults
      : currentFolder === 'starred'
        ? emails.filter((e) => e.isStarred)
        : emails
  displayEmails = [...displayEmails].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const isSearch = currentFolder === 'search'
  const hasMore = !isSearch && !noMoreRef.current && currentPage * 20 < totalEmails
  const selectedCount = selectedEmailIds.size
  const allSelected =
    displayEmails.length > 0 &&
    displayEmails.every((e) => selectedEmailIds.has(e.id))

  // ─── Gmail-style infinite scroll ─────────────────────────────────────────
  // A sentinel below the last card auto-loads the next page shortly before
  // the user reaches the bottom, so older messages appear seamlessly
  useEffect(() => {
    const el = sentinelRef.current
    const root = scrollContainerRef.current
    if (!el || !root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (isLoading || isLoadingMoreRef.current) return
        if (!hasMore) return
        // Back off briefly after a failed load to avoid a request storm
        if (Date.now() - lastLoadErrorAtRef.current < 2000) return
        isLoadingMoreRef.current = true
        setCurrentPage(currentPage + 1)
      },
      { root, rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isLoading, currentPage, currentFolder, displayEmails.length, setCurrentPage])

  // ─── Floating loader pill visibility ─────────────────────────────────────
  // Shows while any list fetch runs over existing content (scroll appends,
  // folder loads, returning from an email, refresh) and remains up for a
  // short grace period afterwards so brief loads are still perceptible
  useEffect(() => {
    const loading = isLoading && emails.length > 0
    if (loading) {
      if (loaderHideTimerRef.current) {
        clearTimeout(loaderHideTimerRef.current)
        loaderHideTimerRef.current = null
      }
      setShowLoaderPill(true)
    } else if (prevListLoadingRef.current) {
      loaderHideTimerRef.current = setTimeout(() => {
        loaderHideTimerRef.current = null
        setShowLoaderPill(false)
      }, 800)
    }
    prevListLoadingRef.current = loading
  }, [isLoading, emails.length])

  // Clear pending loader/auto-retry timers when the list unmounts
  useEffect(
    () => () => {
      if (loaderHideTimerRef.current) clearTimeout(loaderHideTimerRef.current)
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current)
    },
    []
  )

  // Bulk actions
  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(false)
    const deleted = deleteSelected()
    try {
      await Promise.all(
        deleted.map((e) =>
          fetch(`/api/emails/${e.id}`, { method: 'DELETE' })
        )
      )
      toast.success(`${deleted.length} email${deleted.length > 1 ? 's' : ''} deleted`)
    } catch {
      toast.error('Failed to delete some emails')
    }
    setTotalEmails(totalEmails - deleted.length)
  }

  const handleBulkArchive = async () => {
    const archived = archiveSelected()
    try {
      await Promise.all(
        archived.map((e) =>
          fetch(`/api/emails/${e.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: true }),
          })
        )
      )
      toast.success(`${archived.length} email${archived.length > 1 ? 's' : ''} archived`)
    } catch {
      toast.error('Failed to archive some emails')
    }
    setTotalEmails(totalEmails - archived.length)
  }

  const handleBulkUnarchive = async () => {
    const ids = Array.from(selectedEmailIds)
    const selected = emails.filter((e) => ids.includes(e.id))
    selected.forEach((e) => {
      useAppStore.getState().updateEmail(e.id, { isArchived: false } as Partial<typeof e>)
    })
    clearSelection()
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/emails/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: false }),
          })
        )
      )
      toast.success(`${selected.length} email${selected.length > 1 ? 's' : ''} unarchived`)
    } catch {
      toast.error('Failed to unarchive some emails')
    }
    fetchEmails()
  }

  const handleBulkMarkRead = async (read: boolean) => {
    const ids = Array.from(selectedEmailIds)
    markSelectedRead(read)
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/emails/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isRead: read }),
          })
        )
      )
      toast.success(read ? 'Marked as read' : 'Marked as unread')
    } catch {
      toast.error('Failed to update some emails')
    }
  }

  const handleEmptySpam = async () => {
    try {
      await Promise.all(
        displayEmails.map((e) =>
          fetch(`/api/emails/${e.id}`, { method: 'DELETE' })
        )
      )
      displayEmails.forEach((e) => removeEmail(e.id))
      setTotalEmails(0)
      toast.success('All spam deleted')
    } catch {
      toast.error('Failed to delete spam')
    }
  }

  // Build operator badges for search header
  const operatorBadges = searchOperators
    ? Object.entries(searchOperators)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([key, value]) => ({ key, value: String(value) }))
    : []



  return (
    <div className="relative flex-1 flex flex-col min-w-0 h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-gray-100 dark:border-gray-800 shrink-0">
        {currentFolder === 'spam' ? (
          <div className="flex items-center justify-between w-full">
            <h2 className="text-sm font-semibold text-[#1F1F1F] dark:text-white capitalize">Spam</h2>
            {displayEmails.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 h-8 px-3"
                onClick={handleEmptySpam}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete all spam
              </Button>
            )}
          </div>
        ) : (
          <>
        <div className="flex items-center gap-2 min-w-0">
          {/* Select All checkbox */}
          {displayEmails.length > 0 && (
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => allSelected ? clearSelection() : selectAllEmails()}
              aria-label={allSelected ? 'Deselect all' : 'Select all'}
              className="size-4 shrink-0"
            />
          )}
          <h2 className="text-sm font-semibold text-[#1F1F1F] dark:text-white capitalize shrink-0">
            {selectedCount > 0
              ? `${selectedCount} of ${displayEmails.length} selected`
              : isSearch ? 'Search Results' : currentFolder === 'scheduled' ? 'Scheduled' : currentFolder === 'snoozed' ? 'Snoozed' : currentFolder}
          </h2>
          {!isLoading && displayEmails.length > 0 && (
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
              {isSearch ? searchTotal : displayEmails.length}
            </span>
          )}
        </div>
        {!isSearch ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={refreshFromTop}
            disabled={isLoading}
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            onClick={handleClearSearch}
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
        </>
        )}
      </div>

      {/* Search query banner */}
      <AnimatePresence>
        {isSearch && searchQuery && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-2">
                <Search className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1F1F1F] dark:text-white font-medium truncate">
                    &quot;{searchQuery}&quot;
                  </p>
                  {/* Operator badges */}
                  {operatorBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {operatorBadges.map(({ key, value }) => (
                        <Badge
                          key={key}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-5 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4] font-normal"
                        >
                          {key}:{value}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {searchTotal} result{searchTotal !== 1 ? 's' : ''} found
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-500 h-6 px-2 shrink-0"
                  onClick={handleClearSearch}
                >
                  Clear
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk action bar */}
      {currentFolder !== 'spam' && (
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <span className="text-sm font-medium text-[#1F1F1F] dark:text-white whitespace-nowrap">
                {selectedCount} selected
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  onClick={() => handleBulkMarkRead(true)}
                  title="Mark as read"
                >
                  <MailOpen className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  onClick={() => handleBulkMarkRead(false)}
                  title="Mark as unread"
                >
                  <Mail className="w-3.5 h-3.5" />
                </Button>
                {currentFolder === 'archive' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={handleBulkUnarchive}
                    title="Unarchive"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={handleBulkArchive}
                    title="Archive"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* Pull-to-refresh indicator */}
      <div
        className="overflow-hidden transition-all duration-200 ease-out flex items-center justify-center"
        style={{ height: pullDistance > 0 ? Math.max(pullDistance, 40) : 0 }}
      >
        {pullDistance > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw
              className={`w-4 h-4 ${
                pullDistance > 60 ? 'animate-spin' : ''
              }`}
            />
            <span className="text-xs">
              {pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain pb-16 md:pb-0 gpu-scroll"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onScroll={() => {
          // PRD 5.2: Save scroll position (throttled to avoid re-render flood on low-end devices)
          if (!scrollSaveRafRef.current) {
            scrollSaveRafRef.current = requestAnimationFrame(() => {
              scrollSaveRafRef.current = null
              if (scrollContainerRef.current) {
                const pos = scrollContainerRef.current.scrollTop
                if (pos > 10) setScrollPosition(currentFolder, pos)
              }
            })
          }
        }}
      >
        {isLoading && emails.length === 0 ? (
          <EmailListSkeleton />
        ) : displayEmails.length === 0 ? (
          <FolderEmptyState
            folder={isSearch ? 'search' : currentFolder}
            isSearch={isSearch}
            onClearSearch={isSearch ? handleClearSearch : undefined}
          />
        ) : (
          <div>
            {/* Date grouping */}
            {(() => {
              const groups: { label: string; emails: typeof displayEmails }[] = []
              let currentGroup = ''
              for (const email of displayEmails) {
                const date = new Date(email.createdAt)
                let group: string
                if (isToday(date)) group = 'Today'
                else if (isYesterday(date)) group = 'Yesterday'
                else if (isAfter(date, startOfWeek(new Date(), { weekStartsOn: 1 }))) group = 'This Week'
                else group = 'Earlier'
                if (group !== currentGroup) {
                  groups.push({ label: group, emails: [email] })
                  currentGroup = group
                } else {
                  groups[groups.length - 1].emails.push(email)
                }
              }
              let globalIndex = 0
              return groups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 sm:px-4 py-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {group.label}
                    </span>
                  </div>
                  {group.emails.map((email) => (
                    <div key={email.id} className="relative">
                      <EmailCard
                        email={email}
                        isSelected={selectedEmailId === email.id}
                        onSelect={() => setSelectedEmailId(email.id)}
                        index={globalIndex++}
                        currentFolder={currentFolder}
                      />
                      {/* Cancel scheduled button */}
                      {currentFolder === 'scheduled' && email.scheduledAt && (
                        <div className="absolute right-2 bottom-2 z-10">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeEmail(email.id)
                              fetch(`/api/emails/${email.id}`, { method: 'DELETE' })
                                .then(() => toast.success('Scheduled email cancelled'))
                                .catch(() => toast.error('Failed to cancel'))
                            }}
                            className="text-[10px] text-red-500 hover:text-red-600 hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            })()}
            {hasMore && (
              <div ref={sentinelRef} className="p-4 text-center">
                {typeof IntersectionObserver === 'undefined' ? (
                  // Manual fallback only for browsers without IntersectionObserver
                  <Button
                    variant="ghost"
                    onClick={() => {
                      isLoadingMoreRef.current = true
                      setCurrentPage(currentPage + 1)
                    }}
                    disabled={isLoading}
                    className="text-sm text-[#4285F4] hover:text-[#1a73e8]"
                  >
                    Load more emails
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gmail-style floating loader pill — visible anywhere in the list while
          messages are loading (the in-flow sentinel sits up to 600px below the
          viewport, so it could never be seen when loading). Rendered through
          showLoaderPill so it also survives fast/failed loads long enough to
          be seen, like the Gmail app's loading bubble */}
      {showLoaderPill && (
        <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <Loader2 className="h-4 w-4 animate-spin text-[#4285F4]" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Loading…</span>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} email{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the selected email{selectedCount > 1 ? 's' : ''} to trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
