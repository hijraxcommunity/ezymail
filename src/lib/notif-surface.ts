'use client'

// ─── Notification-surface registry (FCM dead-man switch, 2026-11-10) ───────
// When the web FCM subscription is active ('ezymail-push-active'), the
// polling hook suppresses its own browser notification because FCM owns the
// popup surfaces. If the FCM message never actually lands (dead token,
// server-side skip, service-worker breakage, FCM outage), that suppression
// was a PERMANENT silent drop with no recovery — the owner's "still I do
// not receive notification" report 2026-11-10.
//
// The poll therefore re-checks, a few seconds after detecting new mail,
// whether FCM really surfaced each email:
//   - rememberNotifSurface(emailId): written by the FCM onMessage handler
//     the moment it posts the foreground OS popup.
//   - wasNotifSurfaced(emailId): read by the poll's delayed fallback.
//   - swTrayHasEmail(emailId): the service-worker background notification
//     (posted while the tab was hidden) is visible to the page ONLY through
//     getNotifications() — sessionStorage cannot see it.
//
// If neither has the email, the poll shows the browser notification itself.
// Per-email identity (not a "last FCM message" timestamp) is what keeps a
// HEALTHY FCM from ever double-popping: its popup for THIS email lands
// within ~1-3s, well before the poll's delayed check runs.

const SURFACE_KEY = 'ezymail-notif-surface-ids'
const SURFACE_TTL_MS = 2 * 60 * 1000
const SURFACE_MAX = 20

export function rememberNotifSurface(emailId: string): void {
  if (!emailId) return
  try {
    const raw = sessionStorage.getItem(SURFACE_KEY)
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; at: number }>) : []
    const now = Date.now()
    const next = [
      { id: emailId, at: now },
      ...list.filter((e) => now - e.at < SURFACE_TTL_MS && e.id !== emailId),
    ]
    sessionStorage.setItem(SURFACE_KEY, JSON.stringify(next.slice(0, SURFACE_MAX)))
  } catch { /* ignore */ }
}

export function wasNotifSurfaced(emailId: string): boolean {
  if (!emailId) return false
  try {
    const raw = sessionStorage.getItem(SURFACE_KEY)
    if (!raw) return false
    const list = JSON.parse(raw) as Array<{ id: string; at: number }>
    const now = Date.now()
    return list.some((e) => e.id === emailId && now - e.at < SURFACE_TTL_MS)
  } catch {
    return false
  }
}

export async function swTrayHasEmail(emailId: string): Promise<boolean> {
  if (!emailId || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    const tray = await reg.getNotifications({ tag: `email-${emailId}` })
    return tray.length > 0
  } catch {
    return false
  }
}
