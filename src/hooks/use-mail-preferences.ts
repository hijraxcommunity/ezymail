'use client'

/**
 * F-57 (Batch 9): the four display preferences that used to persist without
 * any consumer now reach the mail list/detail through this hook.
 *
 * Transport: the settings panel writes the parsed values to sessionStorage
 * ("ezymail-mail-prefs") and dispatches a StorageEvent — the exact pattern
 * the notification switches already use for their live cache — so a save
 * applies immediately without a page reload. Defaults match the settings
 * panel's own defaults; a missing/corrupt cache falls back to them.
 *
 * Scope note (deliberate): `conversationView: false` changes the READING
 * presentation — thread badges are hidden in the list and a mail opens one
 * message at a time instead of the expanded thread. The list still pages
 * conversations server-side (the fold/poll machinery is intentionally left
 * untouched; it carries several owner-reported bug fixes). The settings
 * copy states this honestly.
 */

import { useEffect, useState } from 'react'

export interface MailPreferences {
  emailDensity: 'comfortable' | 'cozy' | 'compact'
  previewLines: 'none' | '1' | '2' | '3'
  conversationView: boolean
  dateFormat: '12h' | '24h'
}

export const MAIL_PREFS_CACHE_KEY = 'ezymail-mail-prefs'

export const DEFAULT_MAIL_PREFERENCES: MailPreferences = {
  emailDensity: 'comfortable',
  previewLines: '2',
  conversationView: true,
  dateFormat: '12h',
}

export function writeMailPreferences(prefs: MailPreferences): void {
  try {
    sessionStorage.setItem(MAIL_PREFS_CACHE_KEY, JSON.stringify(prefs))
    // Same-tab live update (StorageEvent alone only reaches OTHER tabs).
    window.dispatchEvent(new CustomEvent('ezymail-mail-prefs-changed'))
    window.dispatchEvent(new StorageEvent('storage', { key: MAIL_PREFS_CACHE_KEY }))
  } catch {
    // Private mode / quota — the app keeps the stored (server) values.
  }
}

function readMailPreferences(): MailPreferences {
  try {
    const raw = sessionStorage.getItem(MAIL_PREFS_CACHE_KEY)
    if (!raw) return DEFAULT_MAIL_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<MailPreferences>
    return {
      emailDensity: parsed.emailDensity === 'cozy' || parsed.emailDensity === 'compact'
        ? parsed.emailDensity
        : 'comfortable',
      previewLines: parsed.previewLines === 'none' || parsed.previewLines === '1' || parsed.previewLines === '3'
        ? parsed.previewLines
        : '2',
      conversationView: typeof parsed.conversationView === 'boolean' ? parsed.conversationView : true,
      dateFormat: parsed.dateFormat === '24h' ? '24h' : '12h',
    }
  } catch {
    return DEFAULT_MAIL_PREFERENCES
  }
}

export function useMailPreferences(): MailPreferences {
  // Lazy initial read: the first render already sees the cached values, so
  // the effect below only needs to keep the snapshot fresh across events
  // (no setState directly in the effect body).
  const [prefs, setPrefs] = useState<MailPreferences>(() => readMailPreferences())

  useEffect(() => {
    const refresh = () => setPrefs(readMailPreferences())
    window.addEventListener('storage', refresh)
    window.addEventListener('ezymail-mail-prefs-changed', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('ezymail-mail-prefs-changed', refresh)
    }
  }, [])

  return prefs
}
