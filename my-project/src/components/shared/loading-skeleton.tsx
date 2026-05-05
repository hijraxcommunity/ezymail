'use client'

import { Skeleton } from '@/components/ui/skeleton'

/* ─── Email List Skeleton ─── */
export function EmailListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-0 p-2 animate-in fade-in duration-300">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
            <Skeleton className="h-4 w-48 rounded" />
            <Skeleton className="h-3 w-64 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Email Detail Skeleton ─── */
export function EmailDetailSkeleton() {
  return (
    <div className="flex-1 bg-white dark:bg-gray-950 h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-10 hidden sm:block" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-4">
          {/* Subject line */}
          <Skeleton className="h-6 w-3/4 max-w-md" />

          {/* Sender row */}
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-3 w-20" />
          </div>

          {/* Separator */}
          <Skeleton className="h-px w-full" />

          {/* Body lines */}
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>

      {/* Reply bar skeleton */}
      <div className="border-t border-gray-200 dark:border-gray-800 px-3 sm:px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/* ─── Contact List Skeleton ─── */
export function ContactListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1 p-2 animate-in fade-in duration-300">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-44 rounded" />
          </div>
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  )
}
