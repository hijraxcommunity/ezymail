import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { buildFcmMessage } from '@/lib/notifications/sendPushNotification'
import { GoogleAuth } from 'google-auth-library'

/**
 * TEMPORARY diagnostic endpoint (remove after the notification issue is
 * resolved — Task 78).
 *
 * GET  /api/push/diag
 *   → reports whether the sender env vars exist on the server and lists the
 *     logged-in user's stored FCM tokens (masked).
 *
 * POST /api/push/diag
 *   → test-sends one data-only message to EACH of the logged-in user's tokens
 *     and returns the exact FCM v1 HTTP status + response body per token, so
 *     the failing step (env var / auth / token / delivery) is visible without
 *     Vercel logs. No tokens are created or deleted here.
 */

const FCM_V1_URL =
  'https://fcm.googleapis.com/v1/projects/customer-database-88e9f/messages:send'

function maskToken(t: string): string {
  return t.length > 16 ? `${t.slice(0, 10)}…${t.slice(-4)}` : '***'
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const subs = await db.pushSubscription.findMany({
      where: { userId: session.userId },
      select: { fcmToken: true, platform: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    const vapid = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    return NextResponse.json({
      diagnostic: 'v1',
      senderConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
      vapidConfigured: Boolean(vapid && vapid.length > 20),
      tokenCount: subs.length,
      tokens: subs.map((s) => ({
        token: maskToken(s.fcmToken),
        platform: s.platform || 'unknown',
        createdAt: s.createdAt,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'diagnostic failed' },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Read the account's Notifications switch exactly the way a REAL email
    // does (sendPushNotification skips every send while desktopNotif is
    // false). This test deliberately does NOT honor the switch — but the
    // response must SHOW it, otherwise "test rings, real email silent" is
    // impossible to explain from the JSON alone.
    let desktopNotifPref: unknown = '(not set)'
    try {
      const u = await db.user.findUnique({
        where: { id: session.userId },
        select: { preferences: true },
      })
      const prefs = u?.preferences
      const parsed = typeof prefs === 'string' ? JSON.parse(prefs) : prefs
      if (parsed && typeof parsed === 'object' && 'desktopNotif' in parsed) {
        desktopNotifPref = (parsed as { desktopNotif: unknown }).desktopNotif
      }
    } catch { /* preference read is best-effort — never block the test */ }

    const creds = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!creds) {
      return NextResponse.json(
        { step: 'sender-env', error: 'FIREBASE_SERVICE_ACCOUNT_KEY is missing on the server' },
        { status: 500 }
      )
    }

    const parsed = typeof creds === 'string' ? JSON.parse(creds) : creds

    const auth = new GoogleAuth({
      credentials: parsed,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    const accessToken = await auth.getAccessToken()
    const token =
      typeof accessToken === 'string'
        ? accessToken
        : (accessToken as { token?: string }).token
    if (!token) {
      return NextResponse.json(
        { step: 'google-auth', error: 'Could not obtain Google access token' },
        { status: 500 }
      )
    }

    const subs = await db.pushSubscription.findMany({
      where: { userId: session.userId },
      select: { fcmToken: true, platform: true },
    })

    if (subs.length === 0) {
      return NextResponse.json({
        step: 'database',
        desktopNotifPref,
        ...(desktopNotifPref === false
          ? { warning: 'Your Notifications switch is OFF on the server. While it is OFF, no device re-registers, so no token can come back. Turn the switch ON in Settings → Notifications first.' }
          : {}),
        error:
          'No FCM tokens saved for your user — devices never subscribed. Open the app, login, allow notifications, then check GET /api/push/diag.',
      })
    }

    const results = []
    for (const s of subs) {
      const message = buildFcmMessage({
        fcmToken: s.fcmToken,
        senderName: 'EzyMail Diagnostic',
        subject: 'Test notification — if you can read this, delivery works',
        emailId: 'diagnostic',
        androidDataOnly: s.platform === 'android',
      })

      const res = await fetch(FCM_V1_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })
      const body = await res.json().catch(() => ({}))
      results.push({
        token: maskToken(s.fcmToken),
        platform: s.platform || 'unknown',
        httpStatus: res.status,
        fcmResponse: body,
      })
    }

    return NextResponse.json({
      step: 'fcm-send',
      sentTo: results.length,
      desktopNotifPref,
      ...(desktopNotifPref === false
        ? {
            warning:
              'Your Notifications switch is OFF on the server. This test bypasses the switch, but REAL emails are silently skipped while it is OFF — that is exactly "test rings, real email never comes". Turn the switch ON in Settings → Notifications (it must say it saved).',
          }
        : {}),
      results,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'diagnostic failed' },
      { status: 500 }
    )
  }
}
