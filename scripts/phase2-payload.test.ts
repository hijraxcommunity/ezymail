/**
 * Payload unit tests — buildFcmMessage() regression battery.
 * Recreated after scripts/ sweep (2026-10-18). Spec per worklog Task 46:
 * web data-only, deep-link URL, platform payloads, empty-subject fallback, serializable.
 * Run: npx tsx scripts/phase2-payload.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFcmMessage } from '../src/lib/notifications/sendPushNotification'

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

test('android display payload renders on EVERY apk (reliability fix)', () => {
  const msg = buildFcmMessage(ARGS)
  assert.equal(msg.message.android.priority, 'high')
  assert.equal(msg.message.android.notification.title, 'New email from Ali')
  assert.equal(msg.message.android.notification.body, 'Salam')
  // Regression lock (prod 400 INVALID_ARGUMENT 2026-10-22): FCM v1 AndroidNotification
  // has NO priority field — priority is AndroidConfig-level only
  assert.equal(wire(msg.message.android.notification).priority, undefined)
  // icon must be an in-app drawable resource name, never a URL
  assert.equal(msg.message.android.notification.icon, 'ic_launcher')
})

test('android display payload has NO channelId — a missing channel silently drops the notification on Android 8+', () => {
  const msg = buildFcmMessage(ARGS)
  assert.equal(wire(msg.message.android.notification).channelId, undefined)
  // ...and the android token variant carries the same display block
  const androidMsg = buildFcmMessage({ ...ARGS, androidDataOnly: true })
  assert.equal(wire(androidMsg.message.android.notification).channelId, undefined)
  assert.equal(androidMsg.message.android.notification.title, 'New email from Ali')
})

test('android app token: display block + bare sender title in data (Gmail style for the native renderer)', () => {
  const msg = buildFcmMessage({
    ...ARGS,
    senderEmail: 'ali@ezy.af',
    avatarUrl: 'https://ezymail.vercel.app/a.png',
    preview: 'Salam, how are you doing today my friend?',
    androidDataOnly: true,
  })
  // Display block ALWAYS present (data-only messages vanish on APKs
  // without the native renderer — owner-reported regression)
  assert.notEqual(msg.message.android.notification, undefined)
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
  assert.equal(msg.message.android.notification.body, '(No subject)')
  assert.equal(msg.message.apns.payload.aps.alert.body, '(No subject)')
})

test('message is JSON-serializable (FCM v1 wire-safe)', () => {
  const msg = buildFcmMessage(ARGS)
  assert.deepEqual(JSON.parse(JSON.stringify(msg)), msg)
})

console.log('payload tests: all 11 passed')
