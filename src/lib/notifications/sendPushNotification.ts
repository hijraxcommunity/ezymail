import { db } from '@/lib/db'

const FCM_API_URL = 'https://fcm.googleapis.com/fcm/send'

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
  const serverKey = process.env.FIREBASE_SERVER_KEY
  if (!serverKey) {
    console.warn('[Push] FIREBASE_SERVER_KEY not configured, skipping push notification')
    return
  }

  try {
    // Fetch all active FCM tokens for this user
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: recipientUserId },
      select: { fcmToken: true },
    })

    if (subscriptions.length === 0) return

    // Send to each token
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const res = await fetch(FCM_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `key=${serverKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: sub.fcmToken,
            notification: {
              title: `New email from ${senderName}`,
              body: subject || '(No subject)',
              icon: '/logo.png',
              badge: '/logo.png',
              sound: 'default',
            },
            data: {
              url: '/',
              emailId,
              tag: `email-${emailId}`,
            },
            android: {
              priority: 'high',
              notification: {
                channelId: 'ezy-emails',
                priority: 'high',
                defaultSound: true,
                defaultVibrateTimings: true,
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
            webpush: {
              notification: {
                icon: '/logo.png',
                badge: '/logo.png',
                vibrate: [200, 100, 200],
              },
            },
          }),
        })

        const result = await res.json()

        // Clean up invalid tokens
        if (result.error) {
          const errorCode = result.results?.[0]?.error
          if (
            errorCode === 'NotRegistered' ||
            errorCode === 'invalid_registration' ||
            result.error === 'NotRegistered'
          ) {
            await db.pushSubscription.deleteMany({
              where: { fcmToken: sub.fcmToken },
            }).catch(() => {})
          }
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
