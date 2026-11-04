// Production probe: prove the REAL incoming-email push payload size behavior
// against https://ezymail.vercel.app (old build = oversized / new build = slim).
//
// Mechanism (tripwire): sendPushNotification deletes DB token rows whose FCM
// send answers UNREGISTERED (404). A planted fake "probe" token therefore
// distinguishes:
//   - probe DELETED after the real email => FCM ACCEPTED the payload
//     (404: token evaluated + dead → cleanup ran; payload size/schema OK)
//   - probe SURVIVES after the real email => FCM REJECTED the payload
//     (400 INVALID_ARGUMENT — e.g. "Message is too large": tokens are never
//     evaluated, so no cleanup can run)
// Control: the DIAG button (avatar-less payload) records the fake token's
// HTTP status directly — 404 proves the token SHAPE is 404-able, so a
// "probe survives the real email" outcome can ONLY be payload rejection.
// (The diag route itself never deletes tokens; only sendPushNotification
// cleans up UNREGISTERED rows.)
//
// The SENDER (account A) uploads a real avatar first — avatars are stored as
// Base64 data URLs and the real-email dispatch puts them into the payload.
// Avatar size matters: a tiny image stays under 4096 bytes (accepted), a
// realistic one (photos → 4-11 KB base64) blows past the limit (rejected).
// Pass an image path as argv[2]; default is the app logo through the same
// sharp 128x128 JPEG pipeline as POST /api/user/avatar.
//
// Read-only for real users; creates only throwaway e2e accounts.
// Run: bun scripts/e2e-push-size-probe.mjs [avatarImagePath]

import { readFileSync } from 'node:fs'

const BASE = 'https://ezymail.vercel.app'
const AVATAR_PATH = process.argv[2] || 'public/logo.png'
const rand = Math.random().toString(36).slice(2, 8)
const A = { email: `e2e.size.a.${rand}@ezy.af`, password: 'Probe' + rand + 'A9', firstName: 'E2E', lastName: 'SenderAvatar' }
const B = { email: `e2e.size.b.${rand}@ezy.af`, password: 'Probe' + rand + 'B9', firstName: 'E2E', lastName: 'RecvAvatar' }

function fakeFcmToken(seed) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let s = 'd'
  for (let i = 0; i < 100; i++) s += chars[Math.floor(Math.random() * chars.length)]
  s += ':APA91bF'
  for (let i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '-' + seed
}

const cookies = {}
async function call(user, method, path, body, isForm) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(cookies[user.email] ? { Cookie: cookies[user.email] } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  if (setCookie.length) cookies[user.email] = setCookie.map((c) => c.split(';')[0]).join('; ')
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}

const out = { base: BASE, rand, steps: [] }
const log = (step) => { out.steps.push(step); console.log(JSON.stringify(step)) }

async function registerAndLogin(u) {
  let r = await call(u, 'POST', '/api/auth/register', { ...u, dateOfBirth: '1995-05-15' })
  log({ what: `register ${u.email}`, status: r.status, err: r.json?.error || null })
  if (r.status === 409) return
  r = await call(u, 'POST', '/api/auth/login', { email: u.email, password: u.password })
  log({ what: `login ${u.email}`, status: r.status, err: r.json?.error || null })
}

await registerAndLogin(A)
await registerAndLogin(B)

// B: Notifications switch ON (the gate real emails honor)
let r = await call(B, 'PUT', '/api/user/profile', { preferences: { desktopNotif: true, soundNotif: true } })
log({ what: 'B switch ON', status: r.status })

// ── CONTROL: diag records the fake token's FCM status directly (404 expected) ──
const probeCtrl = fakeFcmToken('CTRL')
r = await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeCtrl, platform: 'web', deviceInfo: 'e2e-size-ctrl' })
log({ what: 'B plant CONTROL probe', status: r.status })
r = await call(B, 'POST', '/api/push/diag')
const ctrlRows = r.json?.results?.map((x) => ({ platform: x.platform, httpStatus: x.httpStatus })) || []
const ctrlShapeOk = ctrlRows.every((x) => x.httpStatus === 404)
out.controlProbeShapeOk = ctrlShapeOk
log({ what: 'diag POST (control — token shape check, no cleanup here)', status: r.status, rows: ctrlRows, shapeOk: ctrlShapeOk })

// ── A uploads a real avatar (stored as Base64 data URL — the payload bomb) ──
const img = readFileSync(AVATAR_PATH)
const form = new FormData()
form.append('avatar', new Blob([img], { type: 'image/png' }), 'avatar.png')
r = await call(A, 'POST', '/api/user/avatar', form, true)
const avatarLen = r.json?.avatar ? r.json.avatar.length : 0
out.senderAvatarDataUrlChars = avatarLen
log({ what: 'A uploads avatar (' + AVATAR_PATH + ')', status: r.status, dataUrlChars: avatarLen })

// ── MAIN probes on both platforms, then a REAL email A → B ──
const probeAndroid = fakeFcmToken('AN71')
const probeWeb = fakeFcmToken('WE71')
r = await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeAndroid, platform: 'android', deviceInfo: 'e2e-size-main-android' })
log({ what: 'B plant MAIN android probe', status: r.status })
r = await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeWeb, platform: 'web', deviceInfo: 'e2e-size-main-web' })
log({ what: 'B plant MAIN web probe', status: r.status })

const t0 = Date.now()
r = await call(A, 'POST', '/api/emails', {
  to: B.email,
  subject: 'E2E push size probe ' + rand,
  body: 'Controlled test: real email from an account WITH an avatar.',
})
log({ what: 'REAL email A→B', status: r.status, ms: Date.now() - t0, emailId: r.json?.email?.id || null, err: r.json?.error || null })

await new Promise((s) => setTimeout(s, 15000))
r = await call(B, 'GET', '/api/push/diag')
const tokens = r.json?.tokens || []
const androidGone = !tokens.some((t) => t.token.includes('AN71'))
const webGone = !tokens.some((t) => t.token.includes('WE71'))
out.mainAndroidProbeDeleted = androidGone
out.mainWebProbeDeleted = webGone
out.remainingTokenCount = r.json?.tokenCount
log({ what: 'MAIN probes check after real email', androidDeleted: androidGone, webDeleted: webGone, remainingTokens: r.json?.tokenCount })

out.verdict =
  !out.controlProbeShapeOk
    ? 'PROBE INVALID: diag did not answer 404 for the fake token shape — experiment inconclusive.'
    : androidGone && webGone
      ? 'SIZE OK IN PRODUCTION: FCM ACCEPTED the real-email payload (probes deleted = 404 UNREGISTERED cleanup ran, meaning no 400 size/schema rejection).'
      : 'OVERSIZED PAYLOAD CONFIRMED: control token shape answered 404 on diag (small payload accepted), but the real-email probes SURVIVED — FCM rejected the real message with HTTP 400 (Message is too large).'

console.log('\nVERDICT: ' + out.verdict)
console.log(JSON.stringify({ controlProbeShapeOk: out.controlProbeShapeOk, mainAndroidProbeDeleted: out.mainAndroidProbeDeleted, mainWebProbeDeleted: out.mainWebProbeDeleted, senderAvatarDataUrlChars: out.senderAvatarDataUrlChars }, null, 2))
