/**
 * Batch 1 security E2E (audit F-04/F-05/F-06/F-07/F-11/F-18/F-32).
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-auth-e2e.sh  (boots PG + next dev, then this).
 *
 * Covers:
 *  - F-06: 2FA enforced at login (TOTP + single-use backup codes)
 *  - F-07: session revocation is real (logout, forged/expired tokens,
 *          password change kills other sessions)
 *  - F-11: suspension kills sessions; suspended login rejected
 *  - F-04: attachment metadata sanitized server-side; html/svg rejected;
 *          oversize rejected
 *  - F-05: attachment serving egress policy (no inline html; nosniff;
 *          private cache; safe types still inline)
 *  - F-32: rate limits on register / send / upload (env-tuned for the run)
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'

const BASE = 'http://127.0.0.1:3005'
const PROJECT = '/home/z/my-project'
const require = createRequire(PROJECT + '/package.json')
const { PrismaClient } = require(PROJECT + '/node_modules/@prisma/client')
const { SignJWT } = require(PROJECT + '/node_modules/jose')
const JWT_SECRET = process.env.JWT_SECRET || 'e2e-auth-test-secret'

let pass = 0, fail = 0
const results = []
function check(name, cond, extra) {
  if (cond) { pass++; results.push(`PASS ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

function jar() {
  const cookies = new Map()
  return {
    header() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
    absorb(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : []
      for (const c of raw) {
        const [pair] = c.split(';')
        const idx = pair.indexOf('=')
        cookies.set(pair.slice(0, idx), pair.slice(idx + 1))
      }
    },
    raw(name) { return cookies.get(name) || '' },
  }
}

async function api(cj, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cj.header() ? { Cookie: cj.header() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  cj.absorb(res)
  const json = await res.json().catch(() => null)
  return { status: res.status, json, headers: res.headers }
}

async function rawFetch(cj, method, path, body, contentType) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(contentType ? { 'Content-Type': contentType } : {}), ...(cj.header() ? { Cookie: cj.header() } : {}) },
    body: body === undefined ? undefined : body,
    redirect: 'manual',
  })
  return res
}

const stamp = Date.now().toString(36)
const prisma = new PrismaClient()

async function seedUser(email, role = 'user') {
  const id = `u_${stamp}_${email.split('.')[1] || email.length}`
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: require(PROJECT + '/node_modules/bcryptjs').hashSync('TestPass!123', 4), role },
    create: { id, email, passwordHash: require(PROJECT + '/node_modules/bcryptjs').hashSync('TestPass!123', 4), firstName: 'Auth', lastName: 'Tester', dateOfBirth: '1990-05-10', role },
  })
  return prisma.user.findUnique({ where: { email } })
}

async function login(email) {
  const cj = jar()
  const l = await api(cj, 'POST', '/api/auth/login', { email, password: 'TestPass!123' })
  if (l.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(l.json)}`)
  return cj
}

// TOTP identical to src/lib/totp.ts (SHA-1, 6 digits, ±1 window irrelevant here)
function totpNow(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = secret.toUpperCase().replace(/[=]+$/, '')
  const bits = []
  for (const ch of clean) {
    const val = alphabet.indexOf(ch)
    if (val === -1) continue
    bits.push(val.toString(2).padStart(5, '0'))
  }
  const bitString = bits.join('')
  const bytes = []
  for (let i = 0; i + 8 <= bitString.length; i += 8) bytes.push(parseInt(bitString.slice(i, i + 8), 2))
  const key = Buffer.from(bytes)
  const counter = Math.floor(Date.now() / 1000 / 30)
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeUInt32BE(0, 0)
  counterBuf.writeUInt32BE(counter, 4)
  const digest = createHmac('sha1', key).update(counterBuf).digest()
  const off = digest[digest.length - 1] & 0x0f
  const num = ((digest[off] & 0x7f) << 24) | ((digest[off + 1] & 0xff) << 16) | ((digest[off + 2] & 0xff) << 8) | digest[off + 3]
  return (num % 1000000).toString().padStart(6, '0')
}

async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(JWT_SECRET))
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const HTML_B64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64')

const run = async () => {
  const A = await seedUser(`auth.a.${stamp}@ezy.af`)
  const B = await seedUser(`auth.b.${stamp}@ezy.af`)
  const C = await seedUser(`auth.c.${stamp}@ezy.af`)
  const D = await seedUser(`auth.d.${stamp}@ezy.af`)
  const E = await seedUser(`auth.e.${stamp}@ezy.af`)
  const F = await seedUser(`auth.f.${stamp}@ezy.af`)
  await seedUser(`auth.admin.${stamp}@ezy.af`, 'admin')

  // ── F-07 baseline: login → logout really kills the session ──
  const cjA = await login(A.email)
  const meA = await api(cjA, 'GET', '/api/auth/me')
  check('A1 login + me works (baseline)', meA.status === 200 && meA.json?.user?.email === A.email, `status ${meA.status}`)
  const out = await api(cjA, 'POST', '/api/auth/logout')
  const meA2 = await api(cjA, 'GET', '/api/auth/me')
  check('A2 F-07: logout revokes the cookie (me → 401)', out.status === 200 && meA2.status === 401, `logout ${out.status}, me ${meA2.status}`)
  const cjA2 = await login(A.email)
  check('A3 re-login works (fresh session row)', (await api(cjA2, 'GET', '/api/auth/me')).status === 200)

  // send one mail A → B for later attachment work
  const send0 = await api(cjA2, 'POST', '/api/emails', { to: B.email, subject: 'base send', body: 'hello' })
  check('A4 baseline send A→B', send0.status === 200 || send0.status === 201, `status ${send0.status}`)

  // ── F-06: 2FA enforced at login ──
  const cjB = await login(B.email)
  const en = await api(cjB, 'POST', '/api/user/2fa')
  const secret = en.json?.data?.secret
  const backupCodes = en.json?.data?.backupCodes
  check('T1 2FA setup returns secret + 10 backup codes', !!secret && Array.isArray(backupCodes) && backupCodes.length === 10)
  const act = await api(cjB, 'PUT', '/api/user/2fa', { code: totpNow(secret) })
  check('T2 2FA activation with valid TOTP', act.status === 200 && act.json?.data?.enabled === true, JSON.stringify(act.json)?.slice(0, 120))

  await api(cjB, 'POST', '/api/auth/logout')
  const noCode = await api(jar(), 'POST', '/api/auth/login', { email: B.email, password: 'TestPass!123' })
  check('T3 F-06: 2FA login without code → 401 TWO_FACTOR_REQUIRED', noCode.status === 401 && noCode.json?.code === 'TWO_FACTOR_REQUIRED', JSON.stringify(noCode.json)?.slice(0, 120))
  const badCode = await api(jar(), 'POST', '/api/auth/login', { email: B.email, password: 'TestPass!123', twoFactorCode: '000000' })
  check('T4 F-06: wrong code → 401 TWO_FACTOR_INVALID', badCode.status === 401 && badCode.json?.code === 'TWO_FACTOR_INVALID')
  const goodCode = jar()
  const good = await api(goodCode, 'POST', '/api/auth/login', { email: B.email, password: 'TestPass!123', twoFactorCode: totpNow(secret) })
  check('T5 F-06: valid TOTP → login 200', good.status === 200, `status ${good.status}`)

  await api(goodCode, 'POST', '/api/auth/logout')
  const bk1 = await api(jar(), 'POST', '/api/auth/login', { email: B.email, password: 'TestPass!123', twoFactorCode: backupCodes[0] })
  check('T6 F-06: backup code #1 logs in', bk1.status === 200)
  await api(jar(), 'POST', '/api/auth/logout').catch(() => {})
  const bk1again = await api(jar(), 'POST', '/api/auth/login', { email: B.email, password: 'TestPass!123', twoFactorCode: backupCodes[0] })
  check('T7 F-06: same backup code REJECTED (single-use)', bk1again.status === 401 && bk1again.json?.code === 'TWO_FACTOR_INVALID')
  const bk2 = await api(jar(), 'POST', '/api/auth/login', { email: B.email, password: 'TestPass!123', twoFactorCode: backupCodes[1] })
  check('T8 F-06: different backup code still works', bk2.status === 200)

  // ── F-07: token binding — forged / expired rows fail closed ──
  const forged = await signToken({ userId: A.id, email: A.email, role: 'user' })
  const cjForged = jar()
  cjForged.absorb(new Response(null, { headers: { 'set-cookie': `ezymail-session=${forged}; Path=/` } }))
  const forgedMe = await api(cjForged, 'GET', '/api/auth/me')
  check('R1 F-07: valid-signature JWT with NO session row → 401', forgedMe.status === 401, `status ${forgedMe.status}`)

  const expiredToken = await signToken({ userId: A.id, email: A.email, role: 'user' })
  await prisma.session.create({
    data: { userId: A.id, token: expiredToken, ipAddress: '', expiresAt: new Date(Date.now() - 1000) },
  })
  const cjExp = jar()
  cjExp.absorb(new Response(null, { headers: { 'set-cookie': `ezymail-session=${expiredToken}; Path=/` } }))
  const expMe = await api(cjExp, 'GET', '/api/auth/me')
  check('R2 F-07: token with EXPIRED session row → 401', expMe.status === 401, `status ${expMe.status}`)

  // ── F-07: password change revokes OTHER sessions, keeps current ──
  const cjC1 = await login(C.email)
  const cjC2 = await login(C.email)
  const pw = await api(cjC1, 'PUT', '/api/user/password', { currentPassword: 'TestPass!123', newPassword: 'NewPass!456' })
  const c2Me = await api(cjC2, 'GET', '/api/auth/me')
  const c1Me = await api(cjC1, 'GET', '/api/auth/me')
  check('R3 F-07: password change kills OTHER session', pw.status === 200 && c2Me.status === 401, `pw ${pw.status}, other-session me ${c2Me.status}`)
  check('R4 F-07: password change KEEPS current session', c1Me.status === 200, `status ${c1Me.status}`)

  // ── F-11: suspension kills sessions + blocks login ──
  const cjAdmin = await login(`auth.admin.${stamp}@ezy.af`)
  const cjD = await login(D.email)
  check('S1 victim session works before suspension', (await api(cjD, 'GET', '/api/auth/me')).status === 200)
  const sus = await api(cjAdmin, 'PUT', `/api/admin/users/${D.id}`, { status: 'suspended' })
  const dMe = await api(cjD, 'GET', '/api/auth/me')
  check('S2 F-11: suspend → existing session dead (me → 401)', sus.status === 200 && dMe.status === 401, `suspend ${sus.status}, me ${dMe.status}`)
  const dLogin = await api(jar(), 'POST', '/api/auth/login', { email: D.email, password: 'TestPass!123' })
  check('S3 F-11: suspended login → 403', dLogin.status === 403)
  await api(cjAdmin, 'PUT', `/api/admin/users/${D.id}`, { status: 'active' })
  const dLogin2 = await api(jar(), 'POST', '/api/auth/login', { email: D.email, password: 'TestPass!123' })
  check('S4 F-11: reactivate → login works again', dLogin2.status === 200)

  // ── F-05: attachment serving egress policy ──
  // legacy row (bypasses the new send validation) with an active-content type
  const evilUrl = `/api/attachments/${A.id}_legacy01_evil.html`
  await prisma.email.create({
    data: {
      senderId: A.id,
      recipientEmail: B.email,
      subject: 'legacy evil attachment',
      body: 'x',
      folder: 'inbox',
      attachments: JSON.stringify([{ name: 'evil.html', url: evilUrl, size: 40, type: 'text/html', data: `data:text/html;base64,${HTML_B64}` }]),
    },
  })
  const evilRes = await rawFetch(cjA2, 'GET', evilUrl)
  const evilBody = await evilRes.text().catch(() => '')
  check('X1 F-05: legacy .html served as octet-stream (not text/html)', evilRes.status === 200 && (evilRes.headers.get('content-type') || '') === 'application/octet-stream', `ct ${evilRes.headers.get('content-type')}`)
  check('X2 F-05: legacy .html forced to attachment + nosniff + private cache',
    (evilRes.headers.get('content-disposition') || '').startsWith('attachment') &&
    evilRes.headers.get('x-content-type-options') === 'nosniff' &&
    (evilRes.headers.get('cache-control') || '').startsWith('private'),
    `cd ${evilRes.headers.get('content-disposition')}, cto ${evilRes.headers.get('x-content-type-options')}, cc ${evilRes.headers.get('cache-control')}`)
  check('X3 F-05: body is the raw bytes, rendered inert', evilBody.includes('<html>') && !evilRes.headers.get('content-type')?.includes('text/html'))

  // legit png sent through the API → inline allowed, metadata regenerated
  const pngSend = await api(cjA2, 'POST', '/api/emails', {
    to: B.email, subject: 'png attach', body: 'see attachment',
    attachments: [{ name: 'pic.png', url: 'SHOULD_BE_IGNORED', size: 999999, type: 'text/html', data: `data:image/png;base64,${PNG_B64}` }],
  })
  check('X4 F-04: send with junk url/type accepted (sanitized, not trusted)', pngSend.status === 200 || pngSend.status === 201, `status ${pngSend.status} ${JSON.stringify(pngSend.json)?.slice(0, 120)}`)
  const pngId = pngSend.json?.email?.id
  const detail = await api(cjA2, 'GET', `/api/emails/${pngId}`)
  // detail route slim-serializes attachments as a JSON STRING (data stripped)
  let att0 = null
  try {
    const list = JSON.parse(detail.json?.email?.attachments || '[]')
    att0 = Array.isArray(list) ? list[0] : null
  } catch { att0 = null }
  const urlPattern = new RegExp(`^/api/attachments/${A.id}_[0-9a-f-]{36}_pic\\.png$`)
  check('X5 F-04: stored url is server-regenerated, injection discarded', !!att0 && urlPattern.test(att0.url || ''), `url ${att0?.url}`)
  check('X6 F-04: stored type derived from data URL (image/png), name intact', att0?.type === 'image/png' && att0?.name === 'pic.png', `type ${att0?.type}, name ${att0?.name}`)
  const pngRes = await rawFetch(cjA2, 'GET', att0.url)
  check('X7 F-05: safe png stays inline image/png + nosniff + private cache',
    pngRes.status === 200 && (pngRes.headers.get('content-type') || '') === 'image/png' &&
    (pngRes.headers.get('content-disposition') || '').startsWith('inline') &&
    pngRes.headers.get('x-content-type-options') === 'nosniff' &&
    (pngRes.headers.get('cache-control') || '').startsWith('private'),
    `ct ${pngRes.headers.get('content-type')}`)

  // html attachment rejected at ENTRY now
  const htmlSend = await api(cjA2, 'POST', '/api/emails', {
    to: B.email, subject: 'html attach', body: 'x',
    attachments: [{ name: 'page.html', url: '/x', size: 40, type: 'text/html', data: `data:text/html;base64,${HTML_B64}` }],
  })
  check('X8 F-04: text/html attachment REJECTED at send (400)', htmlSend.status === 400, `status ${htmlSend.status} ${JSON.stringify(htmlSend.json)?.slice(0, 120)}`)
  const svgSend = await api(cjA2, 'POST', '/api/emails', {
    to: B.email, subject: 'svg attach', body: 'x',
    attachments: [{ name: 'vec.svg', url: '/x', size: 40, type: 'image/svg+xml', data: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}` }],
  })
  check('X9 F-04: image/svg+xml attachment REJECTED at send (400)', svgSend.status === 400, `status ${svgSend.status}`)

  // oversize rejected (>3MB decoded) — fresh user F so the send-budget
  // limiter (max 4/user in this harness) is not exhausted by earlier A sends
  const cjF = await login(F.email)
  const bigB64 = Buffer.alloc(4 * 1024 * 1024 + 10).toString('base64')
  const bigSend = await api(cjF, 'POST', '/api/emails', {
    to: B.email, subject: 'big attach', body: 'x',
    attachments: [{ name: 'big.bin', url: '/x', size: 4 * 1024 * 1024, type: 'application/octet-stream', data: `data:application/octet-stream;base64,${bigB64}` }],
  })
  check('X10 F-04: oversize attachment rejected (400)', bigSend.status === 400, `status ${bigSend.status} ${JSON.stringify(bigSend.json)?.slice(0, 120)}`)

  // ── F-32: rate limits (env-tuned in the runner: register 3 / send 4 / upload 3) ──
  let m1 = 429
  for (let i = 0; i < 5; i++) {
    const r = await api(jar(), 'POST', '/api/auth/register', { firstName: 'R', lastName: 'T', password: 'TestPass!123', email: `auth.r${i}.${stamp}@ezy.af`, dateOfBirth: '1990-01-01', phoneCountryCode: '93', phone: '700000001', phoneVerifyToken: 'invalid-token' })
    if (r.status === 429) { m1 = i; break }
  }
  check('M1 F-32: register throttled after 3 attempts/IP (429 seen)', m1 === 3, `first 429 at attempt index ${m1}`)

  const cjE = await login(E.email)
  let send429 = false
  for (let i = 0; i < 5; i++) {
    const r = await api(cjE, 'POST', '/api/emails', { to: A.email, subject: `flood ${i}`, body: 'x' })
    if (r.status === 429) { send429 = i === 4; break }
  }
  check('M2 F-32: send throttled after 4 sends/user (5th → 429)', send429)

  let upload429 = false
  for (let i = 0; i < 4; i++) {
    const fd = new FormData()
    fd.append('files', new Blob([Buffer.from('hello')], { type: 'text/plain' }), `u${i}.txt`)
    const res = await rawFetch(cjA2, 'POST', '/api/upload', fd)
    if (res.status === 429) { upload429 = i === 3; break }
  }
  check('M3 F-32: upload throttled after 3 uploads/user (4th → 429)', upload429)

  await prisma.$disconnect()
  console.log(results.join('\n'))
  console.log(`\n== auth-security-e2e: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1) })
