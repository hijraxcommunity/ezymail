import { db } from '@/lib/db'
import { GoogleAuth } from 'google-auth-library'

const FCM_V1_URL = 'https://fcm.googleapis.com/v1/projects/customer-database-88e9f/messages:send'

// Masked token for logs — never print a full FCM token
function maskTokenLocal(t: string): string {
  return t.length > 16 ? `${t.slice(0, 10)}…${t.slice(-4)}` : '***'
}

// ---------------------------------------------------------------------------
// Payload size guard — FCM v1 rejects any message whose serialized JSON is
// larger than 4096 bytes with HTTP 400 INVALID_ARGUMENT "Message is too
// large. The maximum is 4K (4096 bytes)."
//
// User avatars are stored in the database as Base64 data URLs
// (src/app/api/user/avatar/route.ts) and the real-email dispatch passes that
// string in as avatarUrl. A ~128x128 JPEG is 3-8 KB raw → 4-11 KB Base64,
// which 400'd EVERY real incoming email while the avatar-less diagnostic
// payload (POST /api/push/diag) stayed under the limit and returned 200 —
// exactly "test rings, real email silent".
//
// Guards (all inside buildFcmMessage, the single choke point for both paths):
//   - data: / inline Base64 avatars are DROPPED. They never rendered on
//     Android anyway (java.net.URL cannot open data: URIs → the Gmail-style
//     letter-avatar fallback already shows) and the web service worker never
//     reads data.avatar (it always renders /logo.png). Nothing visible
//     changes on either platform.
//   - remote http(s) avatar URLs are KEPT (EzyMailNotification.fetchBitmap
//     renders them) but must be ≤ 512 chars.
//   - sender name, subject, preview and sender email are whitespace-collapsed
//     and length-capped.
//   - a final measured fit loop sheds OPTIONAL content first (avatar →
//     preview → senderEmail → subject text) and never touches navigation
//     data (url / emailId / tag / title), so tapping the notification always
//     opens the correct email.
// ---------------------------------------------------------------------------
const FCM_MAX_MESSAGE_BYTES = 4096
const FCM_SAFE_MESSAGE_BYTES = 3584 // 12.5% headroom under the hard limit
// Production origin of the web app — used for the web push fallback
// notification icon and the fcmOptions.link tap target (FCM requires an
// absolute HTTPS URL; matches APP_BASE_URL in the email send routes).
const FCM_WEB_APP_URL = 'https://ezymail.vercel.app'
const MAX_SENDER_NAME_CHARS = 80
const MAX_SUBJECT_CHARS = 160
const MAX_PREVIEW_CHARS = 200
const MAX_AVATAR_URL_CHARS = 512
const MAX_SENDER_EMAIL_CHARS = 254

const payloadEncoder = new TextEncoder()

/** Serialized UTF-8 byte size of the outgoing FCM v1 JSON body. */
export function measureFcmMessageBytes(message: unknown): number {
  return payloadEncoder.encode(JSON.stringify(message)).length
}

function oneLine(value: string, maxChars: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

/** Only compact remote URLs may travel in the payload — never inline Base64. */
function safeAvatarUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return undefined
  if (trimmed.length > MAX_AVATAR_URL_CHARS) return undefined
  return trimmed
}

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
  /** The SENDING device's own FCM token (from localStorage via the compose
   *  client). Skipped at dispatch — this is the hard guarantee that the
   *  sender's phone/browser NEVER rings for an email it just sent, even when
   *  a stale row still ties that token to the recipient's account (token
   *  ownership drift: a device that once logged into account B keeps its row
   *  under B until it re-registers; the owner saw "A sends to B → the ring
   *  comes back to A"). Combined with the logout row deletion and the
   *  upsert-by-token re-registration this closes the wrong-device loop for
   *  good: the only token guaranteed to be the sender's own device is
   *  excluded by VALUE, no matter which account row it sits under. */
  skipFcmToken?: string
}

interface FcmTokenPayload {
  fcmToken: string
  senderName: string
  subject: string
  emailId: string
  senderEmail?: string
  avatarUrl?: string
  preview?: string
  /** True for Android-app tokens: the message is pure DATA — no
   *  android.notification block at all — so FCM never auto-posts its plain
   *  title/body notification and the app's native Gmail-style renderer
   *  (EzyMailMessagingService → EzyMailNotification) builds the rich one in
   *  BOTH foreground and background: BigTextStyle expandable preview, sender
   *  avatar, Archive / Mark-as-read / Reply buttons. With a display block
   *  present, FCM itself posts a plain notification when the app is in the
   *  background and onMessageReceived never fires — that is exactly the
   *  "not expandable, no avatar, no buttons" look the owner reported
   *  2026-11-05. data.title carries the bare sender name (Gmail style).
   *  Silence risk guard: the renderer wraps everything in try/catch and
   *  posts a plain fallback notification if the rich build ever fails. */
  androidDataOnly?: boolean
}

// Pure message builder (exported for regression tests).
//
// Web carries BOTH a notification block and data: the firebase-messaging
// service worker still intercepts the push when it is healthy (visible page
// → onMessage, hidden page → our sw.js onBackgroundMessage with the deep
// link — unchanged behavior), but when the SW handler is broken or stale
// (importScripts failure, an old cached SW in a tab that has not reloaded
// for days) Chrome now falls back to AUTO-DISPLAYING webpush.notification
// instead of showing nothing. Owner report 2026-11-08: Android (native
// renderer, no service worker involved) rings fine while the desktop
// browser stayed silent — the data-only design made the web delivery
// 100% dependent on the SW handler. fcmOptions.link keeps the tap deep
// link working on the auto-display path too. (The old 2026-10-27 failure
// of data-only was the previous APK lacking the renderer plus a channel
// that only existed after app start — both fixed since.) Android stays
// DATA-ONLY (androidDataOnly, since 2026-11-05): any android.notification
// block makes FCM auto-post a PLAIN notification when the app is
// backgrounded and suppresses onMessageReceived — the owner saw exactly
// that (no expand, no avatar, no buttons). The native renderer builds the
// Gmail-style notification everywhere. APNs keeps the classic alert
// payload (no iOS app exists yet).
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
  // Size-guarded inputs — collapse whitespace, cap lengths, drop inline Base64
  const safeSender = oneLine(senderName || 'Someone', MAX_SENDER_NAME_CHARS) || 'Someone'
  const safeSubject = oneLine(subject || '', MAX_SUBJECT_CHARS)
  const safePreview = preview ? oneLine(preview, MAX_PREVIEW_CHARS) : undefined
  const safeAvatar = safeAvatarUrl(avatarUrl)
  const safeSenderEmail =
    senderEmail && senderEmail.trim().length > 0 && senderEmail.length <= MAX_SENDER_EMAIL_CHARS
      ? oneLine(senderEmail, MAX_SENDER_EMAIL_CHARS)
      : undefined
  const body = safeSubject || '(No subject)'

  // Wire message assembly — parameterized so the fit loop below can rebuild
  // the exact same structure with progressively less OPTIONAL content.
  const assemble = (data: Record<string, string>, bodyText: string) => ({
    message: {
      token: fcmToken,
      data,
      webpush: {
        headers: { Urgency: 'high' },
        // Browser-level fallback (WebNotificationConfig): the healthy SW
        // handler renders its own notification and this is unused; a broken
        // / stale SW makes Chrome auto-display THIS instead of silence.
        // Only title/body/icon — fields verified against the FCM v1 docs.
        notification: {
          title: `New email from ${safeSender}`,
          body: bodyText,
          icon: `${FCM_WEB_APP_URL}/logo.png`,
        },
        // Opened on tap of the auto-displayed notification (HTTPS absolute
        // URL required by FCM). The healthy SW path ignores this — it uses
        // data.url through the notificationclick handler.
        fcmOptions: {
          link: emailId ? `${FCM_WEB_APP_URL}/?id=${emailId}` : FCM_WEB_APP_URL,
        },
      },
      android: androidDataOnly
        ? {
            // Data-only: FCM must NOT auto-post anything — the native
            // renderer builds the Gmail-style notification (see above).
            // High priority makes Android wake the app process even when
            // backgrounded/killed so onMessageReceived runs.
            priority: 'high' as const,
          }
        : {
            // Fallback branch for unknown platforms (see builder comment).
            // FCM v1 schema: priority lives on AndroidConfig ONLY —
            // AndroidNotification has no priority field (400 INVALID_ARGUMENT
            // in production 2026-10-22).
            priority: 'high' as const,
            notification: {
              title: `New email from ${safeSender}`,
              body: bodyText,
              defaultSound: true,
              defaultVibrateTimings: true,
              // Must be an in-app drawable resource name, not a URL.
              icon: 'ic_launcher',
              // Target the app's own "New email" channel (IMPORTANCE_HIGH).
              // Safe: EzyMailApp.onCreate calls ensureChannel() on EVERY
              // process start — including background FCM wake-ups.
              channelId: 'ezy-emails',
            },
          },
      apns: {
        payload: {
          aps: {
            alert: { title: `New email from ${safeSender}`, body: bodyText },
            sound: 'default',
            badge: 1,
          },
        },
      },
    },
  })

  const dataFields = (withPreview?: string, withAvatar?: string, withSenderEmail?: string) => {
    const data: Record<string, string> = {
      url: `/?id=${emailId}`,
      emailId,
      tag: `email-${emailId}`,
      // Web SW renders data.title verbatim → keep the classic wording there.
      // Android's native renderer wants the bare sender name (Gmail style).
      title: androidDataOnly ? safeSender : `New email from ${safeSender}`,
      body,
    }
    if (withPreview) data.preview = withPreview
    if (withSenderEmail) data.senderEmail = withSenderEmail
    if (withAvatar) data.avatar = withAvatar
    return data
  }

  // Fit-to-size loop: start with everything the notification UI can use, then
  // shed OPTIONAL content (avatar → preview 100 → preview 50 → senderEmail →
  // preview → subject text) until the serialized UTF-8 size is safely below
  // FCM's 4096-byte limit. Navigation data (url / emailId / tag / title) is
  // NEVER dropped or truncated — every variant keeps the exact deep link, so
  // tapping the notification always opens the correct email.
  const data = dataFields(safePreview, safeAvatar, safeSenderEmail)
  let bodyText = body
  const measure = () => measureFcmMessageBytes(assemble({ ...data }, bodyText))
  const reductions: Array<() => boolean> = [
    () => delete data.avatar, // inline Base64 or remote — optional either way
    () => (data.preview ? ((data.preview = data.preview.slice(0, 100)), true) : false),
    () => (data.preview ? ((data.preview = data.preview.slice(0, 50)), true) : false),
    () => delete data.senderEmail,
    () => delete data.preview,
    // Last resort (caps make this unreachable today): shrink the subject text
    () => {
      if (bodyText.length <= 40) return false
      bodyText = bodyText.slice(0, Math.max(40, Math.floor(bodyText.length / 2)))
      return true
    },
  ]
  let message = assemble({ ...data }, bodyText)
  for (const reduce of reductions) {
    if (measure() <= FCM_SAFE_MESSAGE_BYTES) break
    reduce()
    message = assemble({ ...data }, bodyText)
  }
  return message
}

export async function sendPushNotification({
  recipientUserId,
  senderName,
  subject,
  emailId,
  senderEmail,
  avatarUrl,
  preview,
  skipFcmToken,
}: PushPayload): Promise<void> {
  // Structured trace of the REAL incoming-email dispatch path (Vercel logs,
  // grep: [PushDispatch]). Every decision point logs one JSON line so a
  // silent skip is distinguishable from a failed send.
  const trace = (obj: Record<string, unknown>) =>
    console.log('[PushDispatch] ' + JSON.stringify(obj))
  trace({ step: 'start', recipientUserId, emailId })

  const auth = getAuthClient()
  if (!auth) {
    console.warn('[Push] FIREBASE_SERVICE_ACCOUNT_KEY not configured, skipping push notification')
    trace({ step: 'skip', reason: 'sender-env-missing', recipientUserId })
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
        const prefValue =
          prefs && typeof prefs === 'object' && 'desktopNotif' in prefs
            ? (prefs as { desktopNotif: unknown }).desktopNotif
            : '(not set)'
        trace({ step: 'prefs', recipientUserId, desktopNotif: prefValue })
        if (prefs && prefs.desktopNotif === false) {
          console.log('[Push] Skipped — recipient has desktop notifications disabled:', recipientUserId)
          trace({ step: 'skip', reason: 'switch-off', recipientUserId, desktopNotif: prefValue })
          return
        }
      } catch {
        // Malformed preferences — default to sending
      }
    }

    // Fetch all active FCM tokens for this user
    const allSubscriptions = await db.pushSubscription.findMany({
      where: { userId: recipientUserId },
      select: { fcmToken: true, platform: true },
    })

    // Never ring the SENDING device (wrong-device loop closure — see
    // PushPayload.skipFcmToken). Matched by token VALUE, so it works even
    // when a stale row still binds that token to the recipient's account.
    const subscriptions = skipFcmToken
      ? allSubscriptions.filter((s) => s.fcmToken !== skipFcmToken)
      : allSubscriptions
    if (skipFcmToken && subscriptions.length < allSubscriptions.length) {
      trace({
        step: 'skip-sender-device',
        recipientUserId,
        emailId,
        token: maskTokenLocal(skipFcmToken),
        removed: allSubscriptions.length - subscriptions.length,
      })
      // The skipped row is stale BY CONSTRUCTION: the token belongs to the
      // device that is sending right now (it reported it itself), so any row
      // binding it to the RECIPIENT's account survived an account switch
      // without cleanup and would ring this device for the recipient's mail
      // forever. Purge it — after this first send the row is gone and the
      // dispatch stays clean even if the sender device stops reporting.
      void db.pushSubscription
        .deleteMany({ where: { fcmToken: skipFcmToken } })
        .then((r) => {
          if (r.count > 0) {
            trace({ step: 'purge-sender-stale-row', recipientUserId, emailId, token: maskTokenLocal(skipFcmToken), purged: r.count })
          }
        })
        .catch(() => {})
    }

    if (subscriptions.length === 0) {
      console.log('[Push] No push subscriptions found for user:', recipientUserId)
      trace({ step: 'skip', reason: 'no-tokens', recipientUserId })
      return
    }

    console.log('[Push] Sending to', subscriptions.length, 'token(s) for user:', recipientUserId)
    trace({ step: 'dispatch', recipientUserId, tokenCount: subscriptions.length, platforms: subscriptions.map((s) => s.platform || 'unknown') })

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

        // Serialized UTF-8 size of exactly what we sent — the trace pairs it
        // with the FCM status so a size rejection is visible without guessing
        const payloadBytes = measureFcmMessageBytes(message)

        // Dead-token cleanup bookkeeping for the trace below
        const errDetails = Array.isArray(result.error?.details) ? result.error.details : []
        const fcmErrorCode = errDetails.map((d: { errorCode?: string }) => d?.errorCode).find(Boolean)
        const isUnregistered =
          result.error?.status === 'UNREGISTERED' ||
          fcmErrorCode === 'UNREGISTERED' ||
          /unregistered|Requested entity was not found/i.test(result.error?.message || '')

        if (!res.ok) {
          console.error('[Push] FCM API error:', res.status, JSON.stringify(result))
        } else {
          console.log('[Push] FCM success for token:', sub.fcmToken.substring(0, 20) + '...')
        }
        trace({
          step: 'fcm',
          recipientUserId,
          platform: sub.platform || 'unknown',
          token: maskTokenLocal(sub.fcmToken),
          payloadBytes,
          httpStatus: res.status,
          accepted: res.ok,
          errorType: res.ok ? undefined : (fcmErrorCode || result.error?.status || 'unknown'),
          // FCM's own rejection reason (e.g. "Message is too large. The
          // maximum is 4K (4096 bytes).") — capped, contains no user content
          fcmError:
            res.ok
              ? undefined
              : oneLine(String(result.error?.message || ''), 200) || undefined,
        })

        // Clean up dead tokens — ONLY true UNREGISTERED signals. NEVER delete
        // on INVALID_ARGUMENT: that means OUR payload was schema-invalid
        // (builder bug), not the token; deleting would wipe every row.
        // FCM v1 actually reports dead tokens as HTTP 404 with
        // "status": "NOT_FOUND", details[].errorCode "UNREGISTERED" and
        // message "Device unregistered." — the old check only matched
        // status==='UNREGISTERED', which never occurs, so dead tokens were
        // never purged and re-failed on every single send.
        if (result.error && isUnregistered) {
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
