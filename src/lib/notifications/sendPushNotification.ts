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
        const message: Record<string, unknown> = {
          message: {
            token: sub.fcmToken,
            notification: {
              title: `New email from ${senderName}`,
              body: subject || '(No subject)',
            },
            data: {
              url: `/inbox?id=${emailId}`,
              emailId,
              tag: `email-${emailId}`,
            },
            webpush: {
              notification: {
                icon: '/logo.png',
                badge: '/logo.png',
                vibrate: [200, 100, 200],
              },
            },
            android: {
              priority: 'high' as const,
              notification: {
                channelId: 'ezy-emails',
                priority: 'high' as const,
                defaultSound: true,
                defaultVibrateTimings: true,
                icon: '/logo.png',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          },
        }

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