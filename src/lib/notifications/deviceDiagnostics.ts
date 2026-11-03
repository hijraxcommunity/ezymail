/**
 * Device-side push diagnostics — collected IN the browser/WebView so the
 * DEVICE itself reports its state (the server can only see its own rows).
 *
 * Used by the temporary /diagnostic page and by the "Run device diagnostics"
 * button in Settings → Notifications, which is the only way to surface this
 * from inside the Android app (the APK has no address bar to reach
 * /diagnostic directly).
 *
 * Read-only: no permission is requested, no token is created or deleted.
 */

export const DEVICE_DIAGNOSTICS_VERSION = 'device-check-v3'

export async function collectDeviceDiagnostics(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    pageVersion: DEVICE_DIAGNOSTICS_VERSION,
    time: new Date().toISOString(),
  }

  // Capacitor bridge — inside the APK this must say isNativePlatform: true.
  // If it says false, the native push plugin can never be reached.
  try {
    const { Capacitor } = await import('@capacitor/core')
    out.platform = Capacitor.getPlatform()
    out.isNativePlatform = Capacitor.isNativePlatform()
  } catch (e) {
    out.capacitorError = e instanceof Error ? e.message : String(e)
  }

  out.webNotificationApi = typeof window !== 'undefined' && 'Notification' in window

  if (out.isNativePlatform === true) {
    // Native permission WITHOUT prompting (checkPermissions never asks)
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

  // Login state + the account's notification switch (desktopNotif=false
  // blocks every auto registration path by design)
  try {
    const res = await fetch('/api/user/profile')
    out.profileHttp = res.status
    if (res.ok) {
      const data = await res.json()
      // Account identity — proves WHICH account this device is checking.
      // The owner ran diagnostics on two devices that turned out to be two
      // different accounts; without this field that is invisible in JSON.
      out.accountEmail = data.user?.email || '(unknown)'
      out.accountId = data.user?.id || '(unknown)'
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

  // Tokens saved on the server for this user, by platform — shows whether
  // an android row exists at all
  try {
    const res = await fetch('/api/push/diag')
    out.tokensHttp = res.status
    if (res.ok) {
      const data = await res.json()
      out.savedTokens = (data.tokens || []).map((t: { platform?: string }) => t.platform || 'unknown')
    }
  } catch (e) {
    out.tokensError = e instanceof Error ? e.message : String(e)
  }

  out.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : ''
  return out
}

function maskToken(t: string): string {
  return t.length > 16 ? `${t.slice(0, 10)}…${t.slice(-4)}` : '***'
}

interface TestSendRow {
  platform?: string
  httpStatus?: number
  fcmResponse?: {
    error?: {
      details?: Array<{ errorCode?: string }>
      message?: string
    }
  }
}

/**
 * FULL push test — the one-button version for inside the APK (the APK has no
 * address bar, so the /diagnostic page's Register/Test buttons were
 * unreachable from the phone — this replaces that whole round trip):
 *
 * 1. collects the read-only device state ("before"),
 * 2. requests permission and force-registers THIS device with FCM,
 * 3. saves the fresh token server-side (same upsert the app flow uses),
 * 4. test-sends to every saved token — the exact payload a real email sends,
 * 5. writes a plain-English `diagnosis` so the verdict needs no extra round:
 *    a BRAND-NEW token that is instantly "UNREGISTERED" proves the APK was
 *    built with a google-services.json from the wrong Firebase project,
 *    while an accepted send proves the old row was just a stale leftover.
 */
export async function runFullPushTest(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    test: 'full-push-test',
    time: new Date().toISOString(),
  }

  // 1) Device state BEFORE anything changes
  const before = await collectDeviceDiagnostics()
  out.before = before

  if (before.isNativePlatform !== true) {
    out.error = 'Not inside the EzyMail Android app.'
    out.hint = 'Open the EzyMail app → Settings → Notifications → Full push test.'
    return out
  }

  // 2) Permission + force registration
  let fcmToken = ''
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const perm = await PushNotifications.requestPermissions()
    out.permission = perm.receive
    if (perm.receive !== 'granted') {
      out.error = 'Notification permission is not granted.'
      out.hint = 'Phone Settings → Apps → EzyMail → Notifications → allow, then run this test again.'
      return out
    }

    let settle!: (ok: boolean) => void
    const registeredPromise = new Promise<boolean>((r) => { settle = r })
    let done = false
    const finish = (ok: boolean) => {
      if (!done) {
        done = true
        settle(ok)
      }
    }
    let regError: unknown = null
    const okHandle = PushNotifications.addListener('registration', (t) => {
      fcmToken = t.value
      finish(true)
    })
    const errHandle = PushNotifications.addListener('registrationError', (e) => {
      regError = e
      finish(false)
    })
    const timer = setTimeout(() => finish(false), 20000)
    PushNotifications.register()
    out.registered = await registeredPromise
    clearTimeout(timer)
    try { (await okHandle).remove() } catch { /* listener cleanup is best-effort */ }
    try { (await errHandle).remove() } catch { /* listener cleanup is best-effort */ }

    if (out.registered !== true || !fcmToken) {
      out.error = 'The phone did not return an FCM token.'
      out.registrationError = regError ? JSON.stringify(regError) : 'no answer from Google within 20s'
      out.hint = 'Check the phone has internet and Google Play services, then run again.'
      return out
    }
    out.token = maskToken(fcmToken)
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e)
    out.hint = 'Native push plugin not available — run this inside the EzyMail Android app.'
    return out
  }

  // 3) Save the fresh token
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken, platform: 'android', deviceInfo: 'full push test' }),
    })
    out.savedHttp = res.status
    if (res.status === 401) {
      out.error = 'You are NOT logged in inside this app.'
      out.hint = 'Login, then run this test again.'
      return out
    }
    if (!res.ok) {
      out.error = 'Could not save the token (HTTP ' + res.status + ').'
      return out
    }
  } catch (e) {
    out.error = 'Save failed: ' + (e instanceof Error ? e.message : String(e))
    return out
  }

  // 4) Test-send to every saved token — exactly what a real email sends
  try {
    const res = await fetch('/api/push/diag', { method: 'POST' })
    out.testSend = await res.json()
  } catch (e) {
    out.error = 'Test send failed: ' + (e instanceof Error ? e.message : String(e))
    return out
  }

  // 5) Verdict — read the android row from the test-send results
  const rows =
    (out.testSend as { results?: TestSendRow[] } | null | undefined)?.results || []
  const mine = rows.find((r) => r.platform === 'android')
  out.androidResult = mine ?? null
  if (!mine) {
    out.diagnosis = 'No android token in the send list — saving the token above did not work.'
  } else if (mine.httpStatus === 200) {
    out.diagnosis =
      'GOOD: Google accepted a real send to your brand-new android token. ' +
      'The old row was a leftover from a previous install. Real emails will now ring.'
  } else if (mine.httpStatus === 404) {
    out.diagnosis =
      'ROOT CAUSE FOUND: a brand-new android token is instantly "unregistered" — the APK was ' +
      'built with a google-services.json from the WRONG Firebase project. Fix: in the Firebase ' +
      'console open project customer-database-88e9f → Project settings → Your apps → Android app ' +
      'af.ezy.mail → download google-services.json, replace android/app/google-services.json, ' +
      'rebuild the APK.'
  } else {
    out.diagnosis =
      'Unexpected FCM answer for the new token (HTTP ' + mine.httpStatus + ') — send this whole JSON.'
  }

  // The one gate this test CANNOT bypass: real emails are skipped while the
  // account's Notifications switch is OFF on the server (sendPushNotification
  // honors it; this test does not). Surface it as the headline problem.
  if (before.desktopNotifPref === false) {
    out.switchWarning =
      'IMPORTANT: your Notifications switch is OFF on the server for this account. ' +
      'This test bypasses the switch, but REAL emails are silently skipped while it is OFF — ' +
      'that is exactly why the test rings and real emails never come. ' +
      'Fix: EzyMail → Settings → Notifications → turn the switch ON (you must see it stay on).'
    out.diagnosis = out.switchWarning
  }
  return out
}
