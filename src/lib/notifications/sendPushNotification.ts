import { db } from '@/lib/db'
import { GoogleAuth } from 'google-auth-library'

const FCM_V1_URL = 'https://fcm.googleapis.com/v1/projects/customer-database-88e9f/messages:send'

let authClient: GoogleAuth | null = null

function getAuthClient(): GoogleAuth | null {
  if (authClient) return authClient
  const creds = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!creds) {
    console.error('[Push] FIREBASE_SERVICE_ACCOUNT_KEY env var is missing')
    return null
  }
  try {
    const parsed = typeof creds === 'string' ? JSON.parse(creds) : creds
    authClient = new GoogleAuth({
      credentials: parsed,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    return authClient
  } catch (err) {
    console.error('[Push] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err)
    return null
  }
}

interface PushPayload {
  recipientUserId: string
  senderName: string
  subject: string
  emailId: string
}

interface FcmTokenPayload {
  fcmToken: string
  senderName: string
  subject: string
  emailId: string
}

// Pure message builder (exported for regression tests).
//
// Web is DELIBERATELY data-only: with a top-level `notification` field the
// browser auto-displays the message and onBackgroundMessage never fires,
// so our sw.js click handler never sees data.url. Data-only guarantees
// sw.js shows the notification itself with data.url attached (deep link).
// Android/APNs get platform-specific display payloads so they render
// natively without the top-level notification.
export function buildFcmMessage({ fcmToken, senderName, subject, emailId }: FcmTokenPayload) {
  const title = `New email from ${senderName}`
  const body = subject || '(No subject)'
  return {
    message: {
      token: fcmToken,
      data: {
        url: `/?id=${emailId}`,
        emailId,
        tag: `email-${emailId}`,
        title,
        body,
      },
      webpush: {
        headers: { Urgency: 'high' },
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'ezy-emails',
          title,
          body,
          priority: 'high' as const,
          defaultSound: true,
          defaultVibrateTimings: true,
          icon: '/logo.png',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    },
  }
}

export async function sendPushNotification({
  recipientUserId,
  senderName,
  subject,
  emailId,
}: PushPayload): Promise<void> {
  const auth = getAuthClient()
  if (!auth) {
    console.warn('[Push] FIREBASE_SERVICE_ACCOUNT_KEY not configured, skipping push notification')
    return
  }

  try {
    // Respect the recipient's notification preferences (desktopNotif=false
    // disables new-email push; same pref the polling path honors)
    const recipient = await db.user.findUnique({
      where: { id: recipientUserId },
      select: { preferences: true },
    })
    if (recipient?.preferences) {
      try {
        const prefs =
          typeof recipient.preferences === 'string'
            ? JSON.parse(recipient.preferences)
            : recipient.preferences
        if (prefs && prefs.desktopNotif === false) {
          console.log('[Push] Skipped — recipient has desktop notifications disabled:', recipientUserId)
          return
        }
      } catch {
        // Malformed preferences — default to sending
      }
    }

    // Fetch all active FCM tokens for this user
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: recipientUserId },
      select: { fcmToken: true, platform: true },
    })

    if (subscriptions.length === 0) {
      console.log('[Push] No push subscriptions found for user:', recipientUserId)
      return
    }

    console.log('[Push] Sending to', subscriptions.length, 'token(s) for user:', recipientUserId)

    const accessToken = await auth.getAccessToken()
    if (!accessToken) {
      console.error('[Push] Failed to get access token from Google')
      return
    }

    const token = typeof accessToken === 'string' ? accessToken : (accessToken as { token?: string }).token
    if (!token) {
      console.error('[Push] Access token is empty')
      return
    }

    // Send to each token
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const message = buildFcmMessage({
          fcmToken: sub.fcmToken,
          senderName,
          subject,
          emailId,
        })

        const res = await fetch(FCM_V1_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        })

        const result = await res.json()

        if (!res.ok) {
          console.error('[Push] FCM API error:', res.status, JSON.stringify(result))
        } else {
          console.log('[Push] FCM success for token:', sub.fcmToken.substring(0, 20) + '...')
        }

        // Clean up invalid tokens
        if (result.error && (
          result.error.code === 'UNREGISTERED' ||
          result.error.code === 'INVALID_ARGUMENT' ||
          result.error.message?.includes('not registered') ||
          result.error.message?.includes('registration token')
        )) {
          await db.pushSubscription.deleteMany({
            where: { fcmToken: sub.fcmToken },
          }).catch(() => {})
        }
      } catch (err) {
        console.error('[Push] Send failed for token:', sub.fcmToken.substring(0, 20) + '...', err)
      }
    })

    await Promise.allSettled(sendPromises)
  } catch (err) {
    console.error('[Push] Failed to send push notification:', err)
  }
}
