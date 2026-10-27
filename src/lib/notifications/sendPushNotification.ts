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
  senderEmail?: string
  avatarUrl?: string
  preview?: string
}

interface FcmTokenPayload {
  fcmToken: string
  senderName: string
  subject: string
  emailId: string
  senderEmail?: string
  avatarUrl?: string
  preview?: string
  /** True for Android-app tokens: data.title carries the bare sender name
   *  (Gmail style) instead of "New email from ...". The display notification
   *  block below is ALWAYS sent — data-only messages silently vanish on any
   *  APK without the native Gmail-style renderer (owner-reported: after the
   *  expandable-notification change, phones stopped showing notifications
   *  entirely). Reliability first: FCM displays it, and the app's renderer
   *  upgrades the look when it can. */
  androidDataOnly?: boolean
}

// Pure message builder (exported for regression tests).
//
// Web is DELIBERATELY data-only: with a top-level `notification` field the
// browser auto-displays the message and onBackgroundMessage never fires,
// so our sw.js click handler never sees data.url. Data-only guarantees
// sw.js shows the notification itself with data.url attached (deep link).
// Android gets BOTH the data payload AND a display notification — pure
// data-only messages are dropped silently by every APK that lacks the
// native Gmail-style renderer (regression the owner reported: no
// notifications at all after the expandable-notification change). No
// channelId here: a channel that does not exist on the device makes
// Android 8+ silently DROP the notification, and the channel is only
// created by the native renderer in the app process. Omitting it lets FCM
// use the always-present default channel, so the notification shows on
// every APK. APNs keeps the classic alert payload (no iOS app exists yet).
export function buildFcmMessage({
  fcmToken,
  senderName,
  subject,
  emailId,
  senderEmail,
  avatarUrl,
  preview,
  androidDataOnly,
}: FcmTokenPayload) {
  const body = subject || '(No subject)'
  const data: Record<string, string> = {
    url: `/?id=${emailId}`,
    emailId,
    tag: `email-${emailId}`,
    // Web SW renders data.title verbatim → keep the classic wording there.
    // Android's native renderer wants the bare sender name (Gmail style).
    title: androidDataOnly ? senderName : `New email from ${senderName}`,
    body,
  }
  if (preview) data.preview = preview
  if (senderEmail) data.senderEmail = senderEmail
  if (avatarUrl) data.avatar = avatarUrl
  return {
    message: {
      token: fcmToken,
      data,
      webpush: {
        headers: { Urgency: 'high' },
      },
      android: {
        // FCM v1 schema: priority lives on AndroidConfig ONLY —
        // AndroidNotification has no priority field (400 INVALID_ARGUMENT
        // in production 2026-10-22). Display block always present so the
        // notification shows on every APK (see builder comment above).
        priority: 'high' as const,
        notification: {
          title: `New email from ${senderName}`,
          body,
          defaultSound: true,
          defaultVibrateTimings: true,
          // Must be an in-app drawable resource name, not a URL.
          // Deliberately NO channelId — see builder comment above.
          icon: 'ic_launcher',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: `New email from ${senderName}`, body },
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
  senderEmail,
  avatarUrl,
  preview,
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
          senderEmail,
          avatarUrl,
          preview,
          androidDataOnly: sub.platform === 'android',
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

        // Clean up dead tokens — ONLY true UNREGISTERED signals. NEVER delete
        // on INVALID_ARGUMENT: that means OUR payload was schema-invalid
        // (builder bug), not the token; deleting would wipe every row.
        if (result.error && (
          result.error.status === 'UNREGISTERED' ||
          result.error.message?.includes('Requested entity was not found')
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
