'use client'

import { useRef, useState, useCallback } from 'react'
import { Star, Paperclip, Archive, ArchiveRestore, Trash2, Clock, MessageSquare, Pencil } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAppStore, type EmailWithSender } from '@/store/use-app-store'

const SNAP_OPEN_PX = 100
const ELASTIC_FACTOR = 0.35 // Resistance beyond snap point — feels like rubber band
const VELOCITY_THRESHOLD = 400 // px/s — fast flick auto-completes
const MIN_DRAG_FOR_FAST = 40 // Minimum px for velocity-based trigger

/* ─── Motion timing constants (PRD 7.2) ─── */
export const TAP_MS = 120
export const NAV_MS = 250
export const SWIPE_RELEASE_MS = 180

function elasticDrag(dx: number, maxPx: number): number {
  // High resistance under 30% of threshold
  const threshold30 = maxPx * 0.3
  if (Math.abs(dx) <= threshold30) {
    return dx * 0.4 // High resistance in first 30%
  }
  // Smooth release after 30%
  const beyond30 = Math.abs(dx) - threshold30
  const remaining = maxPx - threshold30
  if (Math.abs(dx) <= maxPx) {
    return Math.sign(dx) * (threshold30 * 0.4 + beyond30)
  }
  // Elastic overshoot beyond 100%
  const overshoot = Math.abs(dx) - maxPx
  return Math.sign(dx) * (threshold30 * 0.4 + remaining + overshoot * ELASTIC_FACTOR)
}

/* ─── Haptic feedback layer (PRD 3.2) ─── */
function hapticLight() {
  try { navigator.vibrate?.(8) } catch {}
}
function hapticMedium() {
  try { navigator.vibrate?.(20) } catch {}
}
function hapticHeavy() {
  try { navigator.vibrate?.([30, 10, 30]) } catch {}
}

interface EmailCardProps {
  email: EmailWithSender
  isSelected: boolean
  onSelect: () => void
  index: number
  currentFolder?: string
}

export function EmailCard({ email, isSelected, onSelect, index, currentFolder }: EmailCardProps) {
  const { updateEmail, removeEmail, multiSelectMode, selectedEmailIds, toggleSelectEmail, setUndoAction, setEditDraftEmail, setSelectedEmailId, setEmailDetailOpen } = useAppStore()
  const isArchive = currentFolder === 'archive'
  const isDrafts = currentFolder === 'drafts'

  /* ─── Swipe state ─── */
  const swipeX = useMotionValue(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const [swipeOpenDir, setSwipeOpenDir] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchStartTime = useRef(0)
  const isSwiping = useRef(false)
  const isVertical = useRef(false)

  const backgroundOpacity = useTransform(swipeX, [-120, 0, 120], [1, 0, 1])

  const resetSwipe = useCallback(() => {
    animate(swipeX, 0, { type: 'spring', stiffness: 500, damping: 35 })
    setSwipeOpenDir(null)
  }, [swipeX])

  const animateOffScreen = useCallback((direction: 'left' | 'right') => {
    const target = direction === 'left' ? -window.innerWidth : window.innerWidth
    animate(swipeX, target, {
      duration: 0.3,
      ease: 'easeIn',
      onComplete: () => {
        animate(swipeX, 0, { duration: 0 })
      },
    })
  }, [swipeX])

  const doArchive = useCallback(() => {
    if (!email) return
    hapticMedium() // PRD 3.2: medium impact on swipe action
    setUndoAction({ id: email.id, type: 'archive', email, timestamp: Date.now() })
    removeEmail(email.id)
    animateOffScreen('right')
    fetch(`/api/emails/${email.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: true }),
    }).catch(() => {})
  }, [email, removeEmail, animateOffScreen, setUndoAction])

  const doUnarchive = useCallback(() => {
    if (!email) return
    hapticMedium()
    setUndoAction({ id: email.id, type: 'archive', email, timestamp: Date.now() })
    removeEmail(email.id)
    animateOffScreen('left')
    fetch(`/api/emails/${email.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: false }),
    }).then(() => toast.success('Moved to inbox')).catch(() => {})
  }, [email, removeEmail, animateOffScreen, setUndoAction])

  const doDelete = useCallback(() => {
    if (!email) return
    hapticHeavy() // PRD 3.2: heavy impact on delete
    setUndoAction({ id: email.id, type: 'delete', email, timestamp: Date.now() })
    removeEmail(email.id)
    animateOffScreen('right')
    fetch(`/api/emails/${email.id}`, { method: 'DELETE' }).catch(() => {})
  }, [email, removeEmail, animateOffScreen, setUndoAction])

  const doEditDraft = useCallback(() => {
    if (!email) return
    resetSwipe()
    setEditDraftEmail(email)
  }, [email, setEditDraftEmail, resetSwipe])

  /* Touch handlers for swipe */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
    touchStartTime.current = Date.now()
    isSwiping.current = false
    isVertical.current = false
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartX.current
    const dy = touch.clientY - touchStartY.current

    // Lock direction after 10px
    if (!isSwiping.current && !isVertical.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        isSwiping.current = true
      } else if (Math.abs(dy) > 10) {
        isVertical.current = true
        return
      }
    }
    if (isVertical.current || !isSwiping.current) return

    // If swipe is already open, only allow closing
    if (swipeOpenDir === 'left' && dx < 0) return
    if (swipeOpenDir === 'right' && dx > 0) return

    e.preventDefault()
    swipeX.set(elasticDrag(dx, SNAP_OPEN_PX))
  }, [swipeX, swipeOpenDir])

  const onTouchEnd = useCallback(() => {
    if (!isSwiping.current) return
    const currentX = swipeX.get()

    // PRD 3.3: Predictive touch — calculate velocity
    const elapsed = (Date.now() - touchStartTime.current) / 1000 || 0.016
    const velocity = Math.abs(currentX) / elapsed
    const isFastFlick = velocity > VELOCITY_THRESHOLD && Math.abs(currentX) > MIN_DRAG_FOR_FAST

    // PRD 3.1: Velocity-based auto-complete
    if (isFastFlick) {
      if (currentX > 0) {
        hapticMedium()
        animate(swipeX, SNAP_OPEN_PX, { type: 'spring', stiffness: 500, damping: 35, duration: SWIPE_RELEASE_MS / 1000 })
        setSwipeOpenDir('right')
      } else {
        hapticMedium()
        animate(swipeX, -SNAP_OPEN_PX, { type: 'spring', stiffness: 500, damping: 35, duration: SWIPE_RELEASE_MS / 1000 })
        setSwipeOpenDir('left')
      }
    } else if (currentX > SNAP_OPEN_PX) {
      hapticMedium()
      animate(swipeX, SNAP_OPEN_PX, { type: 'spring', stiffness: 500, damping: 35, duration: SWIPE_RELEASE_MS / 1000 })
      setSwipeOpenDir('right')
    } else if (currentX < -SNAP_OPEN_PX) {
      hapticMedium()
      animate(swipeX, -SNAP_OPEN_PX, { type: 'spring', stiffness: 500, damping: 35, duration: SWIPE_RELEASE_MS / 1000 })
      setSwipeOpenDir('left')
    } else {
      resetSwipe()
    }
    isSwiping.current = false
  }, [swipeX, resetSwipe])

  const handleCardClick = useCallback(() => {
    if (swipeOpenDir) {
      resetSwipe()
      return
    }
    hapticLight() // PRD 3.2: light impact on tap
    onSelect()
  }, [swipeOpenDir, resetSwipe, onSelect])

  /* ─── Email data ─── */
  const isSent = email.folder === 'sent'
  // For sent emails, show the recipient; for others, show the sender
  const contactPerson = isSent
    ? (email.recipient || null)
    : email.sender
  const contactName = contactPerson
    ? `${contactPerson.firstName} ${contactPerson.lastName}`
    : (isSent ? email.recipientEmail : email.sender?.email || email.recipientEmail)
  const initials = contactPerson
    ? `${contactPerson.firstName?.charAt(0) || ''}${contactPerson.lastName?.charAt(0) || ''}`.toUpperCase()
    : 'U'
  const timeAgo = formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })
  const snippet = email.body
    ?.substring(0, 100)
    .replace(/<[^>]*>/g, '')
    .replace(/\n/g, ' ') || ''

  const isChecked = selectedEmailIds.has(email.id)

  const handleStar = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    const newValue = !email.isStarred
    updateEmail(email.id, { isStarred: newValue })
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: newValue }),
      })
      toast.success(newValue ? 'Starred' : 'Unstarred')
    } catch {
      updateEmail(email.id, { isStarred: !newValue })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: index * 0.03,
        ease: 'easeOut' as const,
      }}
    >
      {/* Mobile swipe wrapper */}
      <div className="relative overflow-hidden md:hidden">
        {/* Left swipe background: Edit (drafts), Unarchive (archive), or Archive (other/inbox) */}
        <motion.div
          style={{ opacity: backgroundOpacity }}
          className="absolute inset-y-0 left-0 right-1/2 z-[5] flex items-center justify-start pl-5 bg-[#4285F4]"
          onClick={(e) => {
            e.stopPropagation()
            isDrafts ? doEditDraft() : isArchive ? doUnarchive() : doArchive()
          }}
        >
          <div className="flex items-center gap-2 text-white">
            {isDrafts ? <Pencil className="w-5 h-5" /> : isArchive ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
            <span className="text-sm font-semibold">{isDrafts ? 'Edit' : isArchive ? 'Unarchive' : 'Archive'}</span>
          </div>
        </motion.div>

        {/* Right swipe background: Delete (drafts), Delete (archive), or Delete (other/inbox) */}
        <motion.div
          style={{ opacity: backgroundOpacity }}
          className="absolute inset-y-0 left-1/2 right-0 z-[5] flex items-center justify-end pr-5 bg-[#EA4335]"
          onClick={(e) => {
            e.stopPropagation()
            isDrafts ? doDelete() : isArchive ? doDelete() : doDelete()
          }}
        >
          <div className="flex items-center gap-2 text-white">
            <span className="text-sm font-semibold">{isDrafts ? 'Delete' : isArchive ? 'Delete' : 'Delete'}</span>
            <Trash2 className="w-5 h-5" />
          </div>
        </motion.div>

        {/* Swipeable card */}
        <motion.div
          ref={cardRef}
          style={{ x: swipeX }}
          className="relative z-10 bg-white dark:bg-gray-950"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleCardClick()
              }
            }}
            className={`group w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left transition-all duration-150 cursor-pointer relative active:scale-[0.97] select-none ${
              isSelected
                ? 'bg-blue-50 dark:bg-blue-950/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900'
            } ${!email.isRead ? 'bg-blue-50/50 dark:bg-blue-950/10' : ''}`}
          >
            {/* Unread indicator - blue left border */}
            {!email.isRead && (
              <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#4285F4]" />
            )}

            {/* Checkbox */}
            <div
              role="checkbox"
              aria-checked={isChecked}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                toggleSelectEmail(email.id)
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleSelectEmail(email.id)
                }
              }}
              className={`shrink-0 items-center justify-center relative z-10 cursor-pointer ${multiSelectMode ? 'flex' : 'hidden md:flex'}`}
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label={`Select email from ${contactName}`}
            >
              <div
                className={`flex items-center justify-center size-4 rounded-[4px] border transition-colors ${
                  isChecked
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input dark:bg-input/30'
                }`}
              >
                {isChecked && (
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>
            </div>

            {/* Avatar — PRD 11: lazy load */}
            <Avatar className="w-10 h-10 shrink-0">
              <AvatarImage src={contactPerson?.avatar || undefined} loading="lazy" />
              <AvatarFallback
                className={`text-white text-xs font-semibold ${
                  contactPerson
                    ? 'bg-gradient-to-br from-[#4285F4] to-[#34A853]'
                    : 'bg-gradient-to-br from-gray-400 to-gray-500'
                }`}
              >
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span
                  className={`text-[15px] truncate ${
                    !email.isRead
                      ? 'font-bold text-[#1F1F1F] dark:text-white'
                      : 'text-[#444746] dark:text-gray-300'
                  }`}
                >
                  {contactName}
                </span>
                <span className={`text-xs whitespace-nowrap shrink-0 ${email.scheduledAt ? 'text-[#4285F4] font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  {email.scheduledAt ? format(new Date(email.scheduledAt), 'MMM d, h:mm a') : timeAgo}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className={`text-[13px] truncate flex-1 ${!email.isRead ? 'font-semibold text-[#1F1F1F] dark:text-white' : 'text-[#444746] dark:text-gray-300'}`}>
                  {email.subject || '(No subject)'}
                </p>
                {email.replyCount > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#4285F4] bg-[#D3E3FD] dark:bg-[#4285F4]/15 dark:text-[#60a5fa] rounded-full px-1.5 py-0.5 leading-none">
                    <MessageSquare className="w-2.5 h-2.5" />
                    {email.replyCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate flex-1">
                  {snippet}
                </p>
                {email.attachments && (
                  <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                )}
              </div>
              {email.snoozedUntil && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 mt-0.5">
                  {format(new Date(email.snoozedUntil), 'MMM d, h:mm a')}
                </Badge>
              )}
            </div>

            {/* Star toggle - mobile — PRD 10: 44px touch target */}
            <button
              onClick={handleStar}
              className={`shrink-0 p-2.5 rounded-full transition-colors ${
                email.isStarred
                  ? 'text-amber-500'
                  : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'
              }`}
              aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
            >
              <Star className={`w-4 h-4 ${email.isStarred ? 'fill-amber-500' : ''}`} />
            </button>

          </div>
        </motion.div>
      </div>

      {/* Desktop card (no swipe) */}
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        className={`hidden md:flex group w-full items-center gap-3 px-3 sm:px-4 py-3 text-left transition-all duration-150 cursor-pointer relative active:scale-[0.97] select-none ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/30'
            : 'hover:bg-gray-50 dark:hover:bg-gray-900'
        } ${!email.isRead ? 'bg-blue-50/50 dark:bg-blue-950/10' : ''}`}
      >
        {/* Unread indicator */}
        {!email.isRead && (
          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#4285F4]" />
        )}

        {/* Checkbox */}
        <div
          role="checkbox"
          aria-checked={isChecked}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            toggleSelectEmail(email.id)
          }}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              toggleSelectEmail(email.id)
            }
          }}
          className="shrink-0 flex items-center justify-center relative z-10 cursor-pointer"
          style={{ minWidth: 36, minHeight: 44 }}
          aria-label={`Select email from ${contactName}`}
        >
          <div
            className={`flex items-center justify-center size-4 rounded-[4px] border transition-colors ${
              isChecked
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-input dark:bg-input/30'
            }`}
          >
            {isChecked && (
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </div>
        </div>

        {/* Avatar — PRD 11: lazy load */}
        <Avatar className="w-10 h-10 shrink-0">
          <AvatarImage src={contactPerson?.avatar || undefined} loading="lazy" />
          <AvatarFallback
            className={`text-white text-xs font-semibold ${
              contactPerson
                ? 'bg-gradient-to-br from-[#4285F4] to-[#34A853]'
                : 'bg-gradient-to-br from-gray-400 to-gray-500'
            }`}
          >
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span
              className={`text-[15px] truncate ${
                !email.isRead
                  ? 'font-bold text-[#1F1F1F] dark:text-white'
                  : 'text-[#444746] dark:text-gray-300'
              }`}
            >
              {contactName}
            </span>
            <span className={`text-xs whitespace-nowrap shrink-0 ${email.scheduledAt ? 'text-[#4285F4] font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {email.scheduledAt ? format(new Date(email.scheduledAt), 'MMM d, h:mm a') : timeAgo}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className={`text-[13px] truncate flex-1 ${!email.isRead ? 'font-semibold text-[#1F1F1F] dark:text-white' : 'text-[#444746] dark:text-gray-300'}`}>
              {email.subject || '(No subject)'}
            </p>
            {email.replyCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#4285F4] bg-[#D3E3FD] dark:bg-[#4285F4]/15 dark:text-[#60a5fa] rounded-full px-1.5 py-0.5 leading-none">
                <MessageSquare className="w-2.5 h-2.5" />
                {email.replyCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate flex-1">
              {snippet}
            </p>
            {email.attachments && (
              <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            )}
          </div>
          {email.snoozedUntil && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 mt-0.5">
              {format(new Date(email.snoozedUntil), 'MMM d, h:mm a')}
            </Badge>
          )}
        </div>

        {/* Star toggle - desktop */}
        <button
          onClick={handleStar}
          className={`shrink-0 p-2.5 rounded-full transition-colors ${
            email.isStarred
              ? 'text-amber-500'
              : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'
          }`}
          aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
        >
          <Star className={`w-4 h-4 ${email.isStarred ? 'fill-amber-500' : ''}`} />
        </button>

      </div>
    </motion.div>
  )
}
