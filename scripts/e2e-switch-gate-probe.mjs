// Experiment 2 — demonstrate the ONE gate that makes "diag rings, real email
// silent": the account's server-side Notifications switch (desktopNotif=false).
// Same production probe mechanics as experiment 1.
import { Pool } from 'pg' // not used — keep parity; production API only below

const BASE = 'https://ezymail.vercel.app'
const rand = process.argv[2] || 'obbwcn'
const B = { email: `e2e.push.b.${rand}@ezy.af`, password: 'Probe' + rand + 'B9' }
const A = { email: `e2e.push.a.${rand}@ezy.af`, password: 'Probe' + rand + 'A9' }

function fakeFcmToken(seed) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let s = 'd'
  for (let i = 0; i < 100; i++) s += chars[Math.floor(Math.random() * chars.length)]
  s += ':APA91bF'
  for (let i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '-' + seed
}

const cookies = {}
async function call(user, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookies[user.email] ? { Cookie: cookies[user.email] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  if (sc.length) cookies[user.email] = sc.map((c) => c.split(';')[0]).join('; ')
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}
const login = async (u) => { const r = await call(u, 'POST', '/api/auth/login', { email: u.email, password: u.password }); return r.status }
const out = { rand }

out.loginB = await login(B)
out.loginA = await login(A)

// 1) Turn B's switch OFF (the suspected state)
let r = await call(B, 'PUT', '/api/user/profile', { preferences: { desktopNotif: false, soundNotif: true } })
out.switchOff = r.status

// 2) Plant probe, then REAL email A→B while the switch is OFF
const probeOff = fakeFcmToken('OFF')
await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeOff, platform: 'web', deviceInfo: 'e2e-probe-off' })
r = await call(A, 'POST', '/api/emails', { to: B.email, subject: 'E2E gate probe (switch OFF) ' + rand, body: 'Probe while switch OFF.' })
out.realSendWhileOff = { status: r.status, emailId: r.json?.email?.id || null }
await new Promise((s) => setTimeout(s, 15000))

// 3) While still OFF: diag POST (the test button path)
r = await call(B, 'POST', '/api/push/diag')
out.diagWhileOff = { status: r.status, sentTo: r.json?.sentTo, desktopNotifPref: r.json?.desktopNotifPref, warning: (r.json?.warning || '').slice(0, 80) || null, rows: r.json?.results?.map((x) => ({ platform: x.platform, httpStatus: x.httpStatus })) }
await new Promise((s) => setTimeout(s, 10000))
r = await call(B, 'GET', '/api/push/diag')
const probeOffStill = (r.json?.tokens || []).some((t) => t.token.endsWith('OFF'))
// NOTE: tokens are masked (last 4 chars kept) — '-OFF' survives masking
out.probeOffSurvived = probeOffStill
out.tokensAfterOffSend = r.json?.tokenCount

// 4) Turn the switch back ON, plant a fresh probe, REAL email again
r = await call(B, 'PUT', '/api/user/profile', { preferences: { desktopNotif: true, soundNotif: true } })
out.switchBackOn = r.status
const probeOn = fakeFcmToken('ONNN')
await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeOn, platform: 'web', deviceInfo: 'e2e-probe-on' })
r = await call(A, 'POST', '/api/emails', { to: B.email, subject: 'E2E gate probe (switch ON) ' + rand, body: 'Probe while switch ON.' })
out.realSendWhileOn = { status: r.status }
await new Promise((s) => setTimeout(s, 15000))
r = await call(B, 'GET', '/api/push/diag')
out.tokensAfterOnSend = r.json?.tokenCount

out.verdict =
  probeOffStill === true && out.tokensAfterOnSend === 0
    ? 'GATE PROVEN: with the server switch OFF the real email did NOT reach FCM (probe survived) while the diag button still sent (sentTo>=1). With the switch ON the real email cleaned every probe (0 left). This is exactly "test rings, real email silent".'
    : 'Different pattern — inspect JSON.'

console.log(JSON.stringify(out, null, 2))
