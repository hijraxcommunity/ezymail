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
    setSelectedEmailId,
    setEmails,
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

  const fetchEmails = useCallback(async () => {
    if (!isAuthenticated) return
    if (currentFolder === 'search') {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('folder', currentFolder === 'folder' ? 'custom' : currentFolder)
      params.set('page', String(currentPage))
      params.set('limit', '20')
      const res = await fetch(`/api/emails?${params}`)
      const data = await res.json()
      if (res.ok) {
        setEmails(data.emails || [])
        setTotalEmails(data.total || 0)
      }
    } catch {
      toast.error('Failed to load emails')
    } finally {
      setIsLoading(false)
      // PRD 5.2: Restore scroll position
      const saved = scrollPositions[currentFolder]
      if (saved && saved > 0 && scrollContainerRef.current) {
        requestAnimationFrame(() => {
          scrollContainerRef.current?.scrollTo(0, saved)
        })
      }
    }
  }, [
    isAuthenticated,
    currentFolder,
    currentPage,
    setEmails,
    setIsLoading,
    setTotalEmails,
  ])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

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
      await fetchEmails()
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
  const hasMore = isSearch ? false : currentPage * 20 < totalEmails
  const selectedCount = selectedEmailIds.size
  const allSelected =
    displayEmails.length > 0 &&
    displayEmails.every((e) => selectedEmailIds.has(e.id))

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
    <div className="flex-1 flex flex-col min-w-0 h-full">
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
            onClick={fetchEmails}
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
          // PRD 5.2: Save scroll position (debounced via rAF)
          if (scrollContainerRef.current) {
            const pos = scrollContainerRef.current.scrollTop
            if (pos > 10) setScrollPosition(currentFolder, pos)
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
              <div className="p-4 text-center">
                <Button
                  variant="ghost"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={isLoading}
                  className="text-sm text-[#4285F4] hover:text-[#1a73e8]"
                >
                  {isLoading ? 'Loading...' : 'Load more emails'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

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
