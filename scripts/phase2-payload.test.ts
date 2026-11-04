/**
 * Payload unit tests — buildFcmMessage() regression battery.
 * Recreated after scripts/ sweep (2026-10-18). Spec per worklog Task 46:
 * web data-only, deep-link URL, platform payloads, empty-subject fallback, serializable.
 * Run: npx tsx scripts/phase2-payload.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFcmMessage,
  measureFcmMessageBytes,
} from '../src/lib/notifications/sendPushNotification'

const ARGS = { fcmToken: 'tok_test_123', senderName: 'Ali', subject: 'Salam', emailId: 'em_42' }

// Loose view of the wire payload — lets tests assert fields that are ABSENT
// (omitted properties don't exist on the builder's strict inferred type)
const wire = (v: unknown): Record<string, any> => v as Record<string, any>

test('web is data-only: no top-level notification field', () => {
  const msg = buildFcmMessage(ARGS)
  assert.equal(wire(msg.message).notification, undefined)
  assert.ok(msg.message.data && typeof msg.message.data === 'object')
})

test('deep-link URL targets /?id=<emailId>', () => {
  const msg = buildFcmMessage(ARGS)
  assert.equal(msg.message.data.url, '/?id=em_42')
  assert.equal(msg.message.data.emailId, 'em_42')
  assert.equal(msg.message.data.tag, 'email-em_42')
})

test('data carries display fields (title/body) for SW-rendered notification', () => {
  const msg = buildFcmMessage(ARGS)
  assert.equal(msg.message.data.title, 'New email from Ali')
  assert.equal(msg.message.data.body, 'Salam')
})

test('token is bound to the message', () => {
  const msg = buildFcmMessage(ARGS)
  assert.equal(msg.message.token, 'tok_test_123')
})

test('android data-only: NO android.notification block (native renderer posts the rich one)', () => {
  // Since 2026-11-05: any android.notification block makes FCM auto-post a
  // PLAIN notification in background and suppresses onMessageReceived — the
  // owner saw "not expandable, no avatar, no buttons". Android tokens are
  // pure data; the native renderer builds the Gmail-style notification in
  // foreground AND background (with a plain fallback if the rich build
  // throws, so it can never be silent again).
  const msg = buildFcmMessage({ ...ARGS, androidDataOnly: true })
  assert.equal(wire(msg.message.android).notification, undefined)
  assert.equal(msg.message.android.priority, 'high')
  assert.ok(msg.message.data && typeof msg.message.data === 'object')
})

test('unknown-platform fallback branch still carries a display notification', () => {
  // Belt-and-braces: tokens that are neither 'android' nor web get the
  // classic FCM-rendered display block so they are never silent.
  const msg = buildFcmMessage(ARGS)
  assert.equal(msg.message.android.priority, 'high')
  assert.equal(wire(msg.message.android.notification).title, 'New email from Ali')
  assert.equal(wire(msg.message.android.notification).body, 'Salam')
  // Regression lock (prod 400 INVALID_ARGUMENT 2026-10-22): FCM v1 AndroidNotification
  // has NO priority field — priority is AndroidConfig-level only
  assert.equal(wire(msg.message.android.notification).priority, undefined)
  // icon must be an in-app drawable resource name, never a URL
  assert.equal(wire(msg.message.android.notification).icon, 'ic_launcher')
  assert.equal(wire(msg.message.android.notification).channelId, 'ezy-emails')
})

test('android app token: data-only + bare sender title (Gmail style for the native renderer)', () => {
  const msg = buildFcmMessage({
    ...ARGS,
    senderEmail: 'ali@ezy.af',
    avatarUrl: 'https://ezymail.vercel.app/a.png',
    preview: 'Salam, how are you doing today my friend?',
    androidDataOnly: true,
  })
  // Pure data — FCM never auto-posts (renderer does, in any app state)
  assert.equal(wire(msg.message.android).notification, undefined)
  assert.equal(msg.message.android.priority, 'high')
  // Gmail style: sender name IS the title in data, subject is the text
  assert.equal(msg.message.data.title, 'Ali')
  assert.equal(msg.message.data.body, 'Salam')
  // Renderer inputs: expandable preview, avatar, deep link
  assert.equal(msg.message.data.preview, 'Salam, how are you doing today my friend?')
  assert.equal(msg.message.data.senderEmail, 'ali@ezy.af')
  assert.equal(msg.message.data.avatar, 'https://ezymail.vercel.app/a.png')
  assert.equal(msg.message.data.url, '/?id=em_42')
})

test('android app token omits optional fields when not provided', () => {
  const msg = buildFcmMessage({ ...ARGS, androidDataOnly: true })
  assert.equal(msg.message.data.preview, undefined)
  assert.equal(msg.message.data.senderEmail, undefined)
  assert.equal(msg.message.data.avatar, undefined)
  assert.equal(msg.message.data.title, 'Ali')
})

test('apns payload carries alert + sound + badge', () => {
  const msg = buildFcmMessage(ARGS)
  const aps = msg.message.apns.payload.aps
  assert.deepEqual(aps.alert, { title: 'New email from Ali', body: 'Salam' })
  assert.equal(aps.sound, 'default')
  assert.equal(aps.badge, 1)
})

test('empty subject falls back to (No subject)', () => {
  const msg = buildFcmMessage({ ...ARGS, subject: '' })
  assert.equal(msg.message.data.body, '(No subject)')
  assert.equal(msg.message.apns.payload.aps.alert.body, '(No subject)')
})

test('message is JSON-serializable (FCM v1 wire-safe)', () => {
  const msg = buildFcmMessage(ARGS)
  assert.deepEqual(JSON.parse(JSON.stringify(msg)), msg)
})

// ---------------------------------------------------------------------------
// Payload size guard — FCM v1 rejects messages > 4096 bytes with HTTP 400
// "Message is too large". Real-email dispatch passes the sender's avatar
// (stored in the DB as a Base64 data URL) as avatarUrl, which blew the limit
// on EVERY real email while the avatar-less diagnostic test kept working.
// ---------------------------------------------------------------------------

test('Base64 data-URL avatars never enter the payload (real-email 400 fix)', () => {
  const hugeAvatar = 'data:image/jpeg;base64,' + 'A'.repeat(200_000)
  const msg = buildFcmMessage({ ...ARGS, avatarUrl: hugeAvatar, preview: 'hello' })
  assert.equal(wire(msg.message.data).avatar, undefined)
  assert.ok(measureFcmMessageBytes(msg) <= 3584, 'payload must stay under the safe limit')
})

test('remote http(s) avatar URLs are kept for the Android native renderer', () => {
  const msg = buildFcmMessage({ ...ARGS, avatarUrl: 'https://cdn.ezy.af/a/1.png' })
  assert.equal(msg.message.data.avatar, 'https://cdn.ezy.af/a/1.png')
})

test('oversized remote avatar URLs are dropped too (512-char cap)', () => {
  const msg = buildFcmMessage({ ...ARGS, avatarUrl: 'https://cdn.ezy.af/' + 'x'.repeat(600) })
  assert.equal(wire(msg.message.data).avatar, undefined)
})

test('worst case (huge avatar + long subject + long preview) stays under the safe limit with navigation intact', () => {
  const hugeAvatar = 'data:image/jpeg;base64,' + 'A'.repeat(1_000_000)
  const longSubject = 'Salam kabir how are you doing today my good friend. '.repeat(200)
  const longPreview = 'Body text with some content. '.repeat(5000)
  const msg = buildFcmMessage({
    ...ARGS,
    avatarUrl: hugeAvatar,
    subject: longSubject,
    preview: longPreview,
    senderEmail: 'sender@ezy.af',
  })
  const bytes = measureFcmMessageBytes(msg)
  assert.ok(bytes <= 3584, `payload ${bytes} bytes must be <= 3584`)
  // navigation data never touched
  assert.equal(msg.message.data.url, '/?id=em_42')
  assert.equal(msg.message.data.emailId, 'em_42')
  assert.equal(msg.message.data.tag, 'email-em_42')
  assert.ok(msg.message.data.title.length > 0)
  assert.ok(msg.message.data.body.length > 0)
  assert.ok(msg.message.data.body.length <= 160, 'subject capped at 160 chars')
  // optional content was shed in a measurable order
  assert.equal(wire(msg.message.data).avatar, undefined)
})

test('short email keeps full preview + remote avatar (no unnecessary reduction)', () => {
  const msg = buildFcmMessage({
    ...ARGS,
    subject: 'Salam',
    preview: 'Short body',
    avatarUrl: 'https://cdn.ezy.af/a.png',
    senderEmail: 'a@ezy.af',
    androidDataOnly: true,
  })
  assert.equal(msg.message.data.preview, 'Short body')
  assert.equal(msg.message.data.avatar, 'https://cdn.ezy.af/a.png')
  assert.equal(msg.message.data.senderEmail, 'a@ezy.af')
  assert.ok(measureFcmMessageBytes(msg) <= 3584)
})

test('realistic avatar payload (128x128 JPEG data URL as stored by /api/user/avatar) is rejected from the wire', () => {
  // ~6 KB Base64 — typical sharp-resized avatar — previously pushed the real
  // email payload past 4096 bytes while diag (no avatar) stayed tiny
  const realAvatar = 'data:image/jpeg;base64,' + Buffer.from('x'.repeat(6000)).toString('base64')
  const msg = buildFcmMessage({ ...ARGS, avatarUrl: realAvatar })
  assert.equal(wire(msg.message.data).avatar, undefined)
  assert.ok(measureFcmMessageBytes(msg) <= 3584)
})

test('measureFcmMessageBytes counts UTF-8 bytes (not JS chars)', () => {
  const ascii = { a: 'abc' }
  assert.equal(measureFcmMessageBytes(ascii), Buffer.byteLength(JSON.stringify(ascii), 'utf8'))
  const unicode = { a: 'سلام' } // 4 Arabic letters = 8 UTF-8 bytes
  assert.equal(measureFcmMessageBytes(unicode), Buffer.byteLength(JSON.stringify(unicode), 'utf8'))
})

console.log('payload tests: all passed (incl. size-guard battery)')
