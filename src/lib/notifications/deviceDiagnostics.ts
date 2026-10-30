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
