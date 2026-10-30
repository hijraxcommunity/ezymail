'use client'

import { useState } from 'react'

/**
 * TEMPORARY diagnostic page (Task 78 — remove together with /api/push/diag
 * once the notification issue is resolved).
 *
 * 1. Device check   — runs IN THE WEBVIEW/BROWSER and reports the real
 *                     device state: Capacitor bridge, native permission,
 *                     login state, switch preference. This pinpoints WHERE
 *                     an Android registration dies without server logs.
 * 2. Register now   — explicit user action: asks the phone for permission,
 *                     registers with FCM and saves the token server-side
 *                     (idempotent upsert, same call the app's own flow uses).
 * 3. Check status   — env vars + saved tokens (server side).
 * 4. Send test      — one real notification per saved token, exact FCM
 *                     answers per token.
 */

const PAGE_VERSION = 'device-check-v3'

type Busy = 'none' | 'device' | 'register' | 'check' | 'test'

function mask(t: string): string {
  return t.length > 16 ? `${t.slice(0, 10)}…${t.slice(-4)}` : '***'
}

export default function DiagnosticPage() {
  const [output, setOutput] = useState('Press a button to run a check.')
  const [busy, setBusy] = useState<Busy>('none')

  // Runs in the page context — inside the APK this sees the native bridge,
  // on the desktop it sees the browser APIs. Read-only.
  async function deviceCheck() {
    setBusy('device')
    setOutput('Checking this device…')
    const out: Record<string, unknown> = { pageVersion: PAGE_VERSION }
    try {
      const { Capacitor } = await import('@capacitor/core')
      out.platform = Capacitor.getPlatform()
      out.isNativePlatform = Capacitor.isNativePlatform()
    } catch (e) {
      out.capacitorError = e instanceof Error ? e.message : String(e)
    }
    out.webNotificationApi =
      typeof window !== 'undefined' && 'Notification' in window
    if (out.isNativePlatform === true) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const perm = await PushNotifications.checkPermissions()
        out.nativePermission = perm.receive
      } catch (e) {
        out.nativePermissionError = e instanceof Error ? e.message : String(e)
      }
    } else if (out.webNotificationApi === true) {
      out.webPermission = Notification.permission
    }
    try {
      const res = await fetch('/api/user/profile')
      out.profileHttp = res.status
      if (res.ok) {
        const data = await res.json()
        const prefs = data.user?.preferences
        const parsed = typeof prefs === 'string' ? JSON.parse(prefs) : prefs
        out.desktopNotifPref =
          parsed && typeof parsed === 'object' && 'desktopNotif' in parsed
            ? (parsed as { desktopNotif: unknown }).desktopNotif
            : '(not set)'
      }
    } catch (e) {
      out.profileError = e instanceof Error ? e.message : String(e)
    }
    out.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : ''
    setOutput(JSON.stringify(out, null, 2))
    setBusy('none')
  }

  // Explicit user action: request the phone's permission, register with FCM
  // and save the token (idempotent upsert). Works even on this page — the
  // app-wide setup component only listens on the main page.
  async function registerDevice() {
    setBusy('register')
    setOutput('Asking the phone for permission and registering…')
    const out: Record<string, unknown> = { pageVersion: PAGE_VERSION }
    let fcmToken = ''
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const perm = await PushNotifications.requestPermissions()
      out.permission = perm.receive
      if (perm.receive !== 'granted') {
        out.hint = 'Permission refused — allow EzyMail in phone Settings → Apps → EzyMail → Notifications, then press again.'
      } else {
        let resolveReg!: (v: boolean) => void
        const registeredPromise = new Promise<boolean>((r) => { resolveReg = r })
        const okHPromise = PushNotifications.addListener('registration', (t) => {
          fcmToken = t.value
          resolveReg(true)
        })
        const errHPromise = PushNotifications.addListener('registrationError', (e) => {
          out.registrationError = JSON.stringify(e)
          resolveReg(false)
        })
        const timeout = setTimeout(() => resolveReg(false), 20000)
        PushNotifications.register()
        out.registered = await registeredPromise
        clearTimeout(timeout)
        try {
          ;(await okHPromise).remove()
          ;(await errHPromise).remove()
        } catch {
          /* listener cleanup is best-effort */
        }
        if (out.registered === true && fcmToken) {
          out.token = mask(fcmToken)
          try {
            const res = await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fcmToken,
                platform: 'android',
                deviceInfo: 'registered from diagnostic page',
              }),
            })
            out.savedHttp = res.status
            if (res.status === 401) out.hint = 'You are NOT logged in inside this app — login first, then press Register again.'
          } catch (e) {
            out.saveError = e instanceof Error ? e.message : String(e)
          }
        }
        if (out.registered === false && !out.registrationError) {
          out.hint = 'No answer from FCM in 20s — check the phone has internet and Google Play services.'
        }
      }
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e)
      out.hint = 'Native push plugin not available — open this page inside the EzyMail Android app.'
    }
    setOutput(JSON.stringify(out, null, 2))
    setBusy('none')
  }

  async function run(kind: 'check' | 'test') {
    setBusy(kind)
    setOutput(kind === 'check' ? 'Checking…' : 'Sending test notification…')
    try {
      const res = await fetch('/api/push/diag', {
        method: kind === 'check' ? 'GET' : 'POST',
      })
      const data = await res.json()
      setOutput(JSON.stringify(data, null, 2))
    } catch (err) {
      setOutput('Request failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy('none')
    }
  }

  const btn = (label: string, kind: Busy, action: () => void) => (
    <button
      onClick={action}
      disabled={busy !== 'none'}
      style={{ padding: '10px 14px', cursor: 'pointer' }}
    >
      {busy === kind ? '…' : label}
    </button>
  )

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 20 }}>EzyMail push diagnostic</h1>
      <p style={{ color: '#555', fontSize: 13 }}>
        Temporary page. On the PHONE: run 1, then 2, then 3, then 4. On the desktop: 3 and 4.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {btn('1. Device check', 'device', deviceCheck)}
        {btn('2. Register this device now', 'register', registerDevice)}
        {btn('3. Check status', 'check', () => run('check'))}
        {btn('4. Send test notification', 'test', () => run('test'))}
      </div>
      <pre
        style={{
          background: '#f6f6f6',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 16,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 12,
        }}
      >
        {output}
      </pre>
    </div>
  )
}
