'use client'

// ─── EzyMail new-email chime (desktop) ─────────────────────────────────────
// Shared by the polling hook (use-notifications) and the FCM foreground
// handler (push-notification-setup) so exactly ONE ping sounds per email,
// whichever surface detects it first. The old implementation created a fresh
// AudioContext on every call — under Chrome's autoplay policy that context
// can start "suspended" (no prior user activation) and the chime silently
// played into nothing. This module keeps ONE context, unlocks it on the
// first user gesture, retries the resume at play time, and reports exactly
// what happened via [MailSound] logs.
//
// Android's native renderer (APK) has its own notification sound and never
// imports this module — the APK's WebView behavior is unchanged.

const PREFS_KEY = 'ezymail-notif-prefs'
const DEDUPE_KEY = 'ezymail-mail-sound-ids'
const DEDUPE_TTL_MS = 2 * 60 * 1000
const DEDUPE_MAX = 10

let ctx: AudioContext | null = null
let gestureBound = false

function soundPrefEnabled(): boolean {
  try {
    const cached = sessionStorage.getItem(PREFS_KEY)
    if (cached) {
      const prefs = JSON.parse(cached) as { soundNotif?: boolean }
      return prefs?.soundNotif !== false
    }
  } catch { /* ignore */ }
  return true
}

function ensureContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) ctx = new Ctor()
    // Autoplay unlock: Chrome keeps a context suspended until the page has
    // user activation. Resume on the first gesture (any click/keypress) and
    // stop listening once it is running.
    if (!gestureBound) {
      gestureBound = true
      const unlock = () => {
        const c = ctx
        if (!c) return
        c.resume()
          .then(() => {
            if (c.state === 'running') {
              document.removeEventListener('pointerdown', unlock, true)
              document.removeEventListener('keydown', unlock, true)
              console.log('[MailSound] context unlocked by user gesture')
            }
          })
          .catch(() => { /* keep listening */ })
      }
      document.addEventListener('pointerdown', unlock, { capture: true })
      document.addEventListener('keydown', unlock, { capture: true })
    }
    return ctx
  } catch {
    return null
  }
}

function alreadyPinged(emailId: string): boolean {
  try {
    const raw = sessionStorage.getItem(DEDUPE_KEY)
    if (!raw) return false
    const list = JSON.parse(raw) as Array<{ id: string; at: number }>
    const now = Date.now()
    return list.some((e) => e.id === emailId && now - e.at < DEDUPE_TTL_MS)
  } catch {
    return false
  }
}

function rememberPing(emailId: string): void {
  try {
    const raw = sessionStorage.getItem(DEDUPE_KEY)
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; at: number }>) : []
    const now = Date.now()
    const next = [{ id: emailId, at: now }, ...list.filter((e) => now - e.at < DEDUPE_TTL_MS)]
    sessionStorage.setItem(DEDUPE_KEY, JSON.stringify(next.slice(0, DEDUPE_MAX)))
  } catch { /* ignore */ }
}

export type MailSoundResult = 'played' | 'duplicate' | 'pref-off' | 'blocked-by-autoplay' | 'unsupported'

/** Try to play the new-email chime for ONE email id (deduped). Fire-and-forget
 *  safe — never throws. Result is logged for the desktop diagnostic. */
export async function attemptMailSound(emailId: string): Promise<MailSoundResult> {
  if (!soundPrefEnabled()) {
    console.log('[MailSound] skipped — sound preference is off')
    return 'pref-off'
  }
  if (emailId && alreadyPinged(emailId)) {
    console.log('[MailSound] skipped — already sounded for this email')
    return 'duplicate'
  }

  const audio = ensureContext()
  if (!audio) {
    console.warn('[MailSound] unavailable — WebAudio not supported')
    return 'unsupported'
  }

  // Autoplay policy: a context created without user activation starts
  // suspended. Try to resume now (works when the page has sticky
  // activation); if it is still suspended, the chime would be silent.
  if (audio.state !== 'running') {
    try { await audio.resume() } catch { /* handled below */ }
  }
  if (audio.state !== 'running') {
    console.warn('[MailSound] blocked by autoplay policy — chime will work after the next user interaction')
    return 'blocked-by-autoplay'
  }

  try {
    // Same two-tone chime the app has always played (A5 → C#6, soft decay).
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.frequency.setValueAtTime(880, audio.currentTime)
    osc.frequency.setValueAtTime(1100, audio.currentTime + 0.1)
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.4)
    osc.start(audio.currentTime)
    osc.stop(audio.currentTime + 0.4)
  } catch (err) {
    console.warn('[MailSound] playback error', err instanceof Error ? err.message : String(err))
    return 'unsupported'
  }

  if (emailId) rememberPing(emailId)
  console.log('[MailSound] played', { emailId: emailId || '(unknown)' })
  return 'played'
}
