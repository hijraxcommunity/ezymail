// Controlled experiment against PRODUCTION (ezymail.vercel.app).
//
// Goal: prove/disprove that a REAL incoming email executes the push trigger.
// Mechanism: sendPushNotification deletes DB rows whose FCM send answers
// UNREGISTERED. A planted fake "probe" token therefore acts as a tripwire:
//   - probe DELETED  => the real-email path DID call FCM (trigger works)
//   - probe SURVIVES => the real-email path never reached FCM (gate in code)
// Control run: same probe mechanics against the DIAG button (known working)
// to validate that the probe token shape triggers the 404-cleanup path.
//
// Read-only for real users; creates only throwaway e2e accounts.

const BASE = 'https://ezymail.vercel.app'
const rand = Math.random().toString(36).slice(2, 8)
const A = { email: `e2e.push.a.${rand}@ezy.af`, password: 'Probe' + rand + 'A9', firstName: 'E2E', lastName: 'SenderA' }
const B = { email: `e2e.push.b.${rand}@ezy.af`, password: 'Probe' + rand + 'B9', firstName: 'E2E', lastName: 'RecvB' }

function fakeFcmToken(seed) {
  // Realistic FCM token shape: ~150 chars, [A-Za-z0-9:_-], contains ':APA91bF'
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let s = 'd'
  for (let i = 0; i < 100; i++) s += chars[Math.floor(Math.random() * chars.length)]
  s += ':APA91bF'
  for (let i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '(' + seed + ')'.replace('(', '') // seed suffix for identification
}

const cookies = {}
async function call(user, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookies[user.email] ? { Cookie: cookies[user.email] } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  if (setCookie.length) {
    cookies[user.email] = setCookie.map((c) => c.split(';')[0]).join('; ')
  }
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, json }
}

const out = { step: [], base: BASE, rand }

async function registerAndLogin(u) {
  let r = await call(u, 'POST', '/api/auth/register', { ...u, dateOfBirth: '1995-05-15' })
  out.step.push({ what: `register ${u.email}`, status: r.status, err: r.json?.error || null })
  if (r.status === 409) return // already exists from a previous run
  r = await call(u, 'POST', '/api/auth/login', { email: u.email, password: u.password })
  out.step.push({ what: `login ${u.email}`, status: r.status, err: r.json?.error || null })
}

await registerAndLogin(A)
await registerAndLogin(B)

// B: explicitly turn the Notifications switch ON (the gate real emails honor)
let r = await call(B, 'PUT', '/api/user/profile', { preferences: { desktopNotif: true, soundNotif: true } })
out.step.push({ what: 'B switch ON (PUT profile)', status: r.status, err: r.json?.error || null })

// ── CONTROL: diag button must delete the probe (validates probe mechanics) ──
const probeCtrl = fakeFcmToken('CTRL')
r = await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeCtrl, platform: 'web', deviceInfo: 'e2e-control-probe' })
out.step.push({ what: 'B plant CONTROL probe', status: r.status })
r = await call(B, 'POST', '/api/push/diag')
out.controlDiagSend = { status: r.status, sentTo: r.json?.sentTo, desktopNotifPref: r.json?.desktopNotifPref, rows: r.json?.results?.map((x) => ({ platform: x.platform, httpStatus: x.httpStatus })) }
await new Promise((s) => setTimeout(s, 10000))
r = await call(B, 'GET', '/api/push/diag')
const ctrlGone = !(r.json?.tokens || []).some((t) => t.token.includes('CTRL'))
out.controlProbeDeleted = ctrlGone
out.controlDiagGet = { status: r.status, tokenCount: r.json?.tokenCount, desktopNotifPrefViaGet: r.json?.tokens?.length }

// ── TEST: REAL email A → B with the MAIN probe planted ──
const probeMain = fakeFcmToken('MAIN')
r = await call(B, 'POST', '/api/push/subscribe', { fcmToken: probeMain, platform: 'web', deviceInfo: 'e2e-main-probe' })
out.step.push({ what: 'B plant MAIN probe', status: r.status })

const t0 = Date.now()
r = await call(A, 'POST', '/api/emails', { to: B.email, subject: 'E2E push path probe ' + rand, body: 'Controlled test of the real incoming-email push trigger.' })
out.realEmailSend = { status: r.status, ms: Date.now() - t0, err: r.json?.error || null, emailId: r.json?.email?.id || null }

await new Promise((s) => setTimeout(s, 15000))
r = await call(B, 'GET', '/api/push/diag')
const mainGone = !(r.json?.tokens || []).some((t) => t.token.includes('MAIN'))
out.mainProbeDeleted = mainGone
out.finalDiagGet = { status: r.status, tokenCount: r.json?.tokenCount, tokens: r.json?.tokens }

out.verdict =
  out.controlProbeDeleted === true && out.mainProbeDeleted === true
    ? 'TRIGGER WORKS: the real email reached FCM through sendPushNotification (probe deleted by the UNREGISTERED cleanup). The failure must be recipient-side state (switch/tokens) or device display.'
    : out.controlProbeDeleted === true && out.mainProbeDeleted === false
      ? 'TRIGGER BROKEN: diag deletes the probe but the real email does NOT — the real path never reached FCM. Gate is between email commit and dispatch.'
      : out.controlProbeDeleted === false
        ? 'PROBE INVALID: even diag did not delete the control probe (FCM answered 400, not 404). Experiment inconclusive — need a different probe shape.'
        : 'UNEXPECTED COMBINATION — inspect JSON.'

console.log(JSON.stringify(out, null, 2))
