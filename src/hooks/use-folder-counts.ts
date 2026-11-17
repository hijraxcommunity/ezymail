'use client'

import { useEffect, useState } from 'react'

export interface FolderCountEntry {
  count: number
  unread: number
}

export type FolderCounts = Record<string, FolderCountEntry>

/**
 * F-63: sidebar and mobile-nav badges were derived from the ~20 rows
 * currently loaded in the store, so the Inbox unread badge visibly capped
 * at the loaded page and disagreed with reality on busy mailboxes.
 * /api/folders returns server-side totals; this hook refreshes them on
 * mount and every 60s (the 15s notification poll already keeps the mail
 * list itself fresh — counts move far less often than rows).
 *
 * Blind spots of the endpoint (documented, kept on row-derived fallbacks by
 * the consumers): starred is populated as 0, archive is a flag rather than
 * a folder value, and drafts are sender-scoped so the recipient-scoped
 * groupBy does not count them.
 */
export function useFolderCounts(): FolderCounts {
  const [counts, setCounts] = useState<FolderCounts>({})

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/folders')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data.folders)) return
        const next: FolderCounts = {}
        for (const f of data.folders) {
          next[f.id] = { count: f.count || 0, unread: f.unread || 0 }
        }
        setCounts(next)
      } catch {
        // Silent: the consumers keep their row-derived fallback values.
      }
    }
    load()
    const timer = setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return counts
}
