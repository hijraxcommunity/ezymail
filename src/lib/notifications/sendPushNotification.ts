import { db } from '@/lib/db'
import { GoogleAuth } from 'google-auth-library'

const FCM_V1_URL = 'https://fcm.googleapis.com/v1/projects/customer-database-88e9f/messages:send'

let authClient: GoogleAuth | null = null

function getAuthClient(): GoogleAuth | null {
  if (authClient) return authClient
  const creds = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!creds) return null
  try {
    const parsed = typeof creds === 'string' ? JSON.parse(creds) : creds
    authClient = new GoogleAuth({
      credentials: parsed,
      scopes: 'https://www.googleapis.com/auth/firebase.messaging',
    })
    return authClient
  } catch {
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

    if (subscriptions.length === 0) return

    const accessToken = await auth.getAccessToken()
    if (!accessToken) return

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
              url: '/',
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
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        })

        const result = await res.json()

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
      } catch {
        // Ignore individual send failures
      }
    })

    await Promise.allSettled(sendPromises)
  } catch {
    // Push notification failure should never block email sending
    console.warn('[Push] Failed to send push notification')
  }
}