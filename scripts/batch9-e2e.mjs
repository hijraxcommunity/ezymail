/**
 * Batch 9 E2E suite — owner decisions D1/D2/D4 + F-41 phone-change parity.
 *
 * Scope (all against one embedded-Postgres next dev):
 *  - D4: the fixed-window rate limiter reads AND WRITES the shared
 *        PostgreSQL store (a 429 leaves a RateBucket row; mutating that row
 *        from "another instance" immediately changes API behavior — the old
 *        per-instance Map could never do either). Recovery OTPs live in
 *        OtpChallenge: wrong-code attempts accumulate to the cap (locked),
 *        a fresh correct verify issues a reset token, and the token's
 *        single-use guard rejects the replay (UsedTokenGuard). TOTP
 *        single-use steps persist in KvState (replay of the SAME code
 *        fails, the next step succeeds).
 *  - F-41: a profile phone CHANGE demands a signed, number-bound
 *        `phone-verify` proof token and consumes it exactly once; an
 *        unchanged phone still saves without a token; the unique-phone
 *        P2002 surfaces as 409.
 *  - D1: campaign lifecycle — create draft, edit content + REPLACE the
 *        recipient set (transactional), schedule stamps intent
 *        (status=scheduled, scheduledFor future-checked, sentAt stays
 *        null), un-schedule returns to draft, scheduled campaigns are
 *        frozen for edits, 1000-recipient cap and ownership 404/403 hold,
 *        opens/clicks stay structurally zero.
 *  - D2: labels API surface for the new UI — create, assign/unassign on an
 *        own mailbox row, the `?label=` list filter (own labels only; a
 *        foreign label id filters to nothing instead of leaking), labels
 *        riding on list and detail responses, label delete cascades.
 *
 * Notes:
 *  - WhatsApp delivery (OpenWA) is NOT available in the sandbox, so OTP
 *    SEND paths are exercised at the store level: the suite seeds an
 *    OtpChallenge row with the exact hash the route computes
 *    (sha256(`${otp}:${userId}`)) and drives the verify-otp/reset actions.
 *  - The F-41 positive path needs a valid proof token: the suite signs one
 *    with the harness JWT_SECRET (jose) bound to the exact E.164 — same
 *    contract verify-phone issues after a real WhatsApp verification.
 *  - TOTP remediation proofs: T5 = 8 simultaneous same-code logins with
 *    EXACTLY one success (atomic compare-and-set); phase 2 (run by the
 *    runner script) restarts the app and boots a second instance on :3008
 *    against the same DB, then batch9-e2e-phase2.mjs verifies the consumed
 *    step is refused on BOTH instances and fresh steps still work.
 */
import { createRequire } from 'node:module'
import { createHash, createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { SignJWT } from 'jose'

const BASE = process.env.B9_BASE || 'http://127.0.0.1:3007'
const PROJECT = '/home/z/my-project'
const require = createRequire(PROJECT + '/package.json')
const { PrismaClient } = require(PROJECT + '/node_modules/@prisma/client')

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

const stamp = Date.now().toString(36)
const prisma = new PrismaClient()
const bcrypt = require(PROJECT + '/node_modules/bcryptjs')
// Per-run random harness password (Batch 9 remediation: no literal
// credential in the release diff). Seeded users authenticate only against
// the throwaway embedded-PG test database; the password travels to phase 2
// via /tmp/b9-totp-state.json.
const TEST_PASS =
  process.env.B9_TEST_PASS ||
  require('node:crypto').randomBytes(16).toString('hex') + '!Aa1'
const JWT_SECRET = process.env.JWT_SECRET || 'b9-e2e-test-secret'

async function seedUser(email, opts = {}) {
  const id = `u_${stamp}_${Math.random().toString(36).slice(2, 8)}`
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: bcrypt.hashSync(TEST_PASS, 4), softDeletedAt: null, ...opts },
    create: {
      id, email, passwordHash: bcrypt.hashSync(TEST_PASS, 4),
      firstName: opts.firstName || 'Batch', lastName: opts.lastName || 'Nine',
      dateOfBirth: '1995-05-05',
      role: opts.role || 'user',
      status: 'active',
      onboardingDone: true,
      accountType: opts.accountType || 'personal',
      subscriptionStatus: opts.subscriptionStatus ?? null,
      phone: opts.phone ?? null,
    },
  })
  return prisma.user.findUnique({ where: { email } })
}

async function login(email) {
  const cj = jar()
  const r = await api(cj, 'POST', '/api/auth/login', { email, password: TEST_PASS })
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`)
  return cj
}

// ── TOTP (RFC 6238, mirrors src/lib/totp.ts) ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(str) {
  const bits = []
  for (const char of str.toUpperCase().replace(/[=]+$/, '')) {
    const val = B32.indexOf(char)
    if (val === -1) continue
    bits.push(val.toString(2).padStart(5, '0'))
  }
  const bytes = []
  const bitString = bits.join('')
  for (let i = 0; i + 8 <= bitString.length; i += 8) bytes.push(parseInt(bitString.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totpAt(secret, counter) {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(0, 0)
  buf.writeUInt32BE(counter, 4)
  const digest = createHmac('sha1', key).update(buf).digest()
  const off = digest[digest.length - 1] & 0x0f
  const num = ((digest[off] & 0x7f) << 24) | ((digest[off + 1] & 0xff) << 16) | ((digest[off + 2] & 0xff) << 8) | (digest[off + 3] & 0xff)
  return (num % 1_000_000).toString().padStart(6, '0')
}
function currentStep() { return Math.floor(Date.now() / 1000 / 30) }

// ── F-41 proof token (same contract verify-phone mints) ──
async function signPhoneProof(e164) {
  return new SignJWT({ purpose: 'phone-verify', phone: e164 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(new TextEncoder().encode(JWT_SECRET))
}

async function seedEmail(fromUser, toEmail, subject) {
  return prisma.email.create({
    data: {
      senderId: fromUser.id,
      recipientEmail: toEmail,
      subject,
      body: 'batch9 label fixture',
      folder: 'inbox',
      sentAt: new Date(),
    },
  })
}

// ═══════════════════════════════════════════════════════════════════
async function main() {
  // ── Fixtures ──
  const personal = await seedUser(`b9.personal.${stamp}@ezy.af`, { firstName: 'Nine', lastName: 'Personal', phone: '+93700000001' })
  const other = await seedUser(`b9.other.${stamp}@ezy.af`, { firstName: 'Nine', lastName: 'Other', phone: '+93800000002' })
  const business = await seedUser(`b9.biz.${stamp}@ezy.af`, {
    firstName: 'Nine', lastName: 'Business',
    accountType: 'business', subscriptionStatus: 'active',
  })
  const outsider = await seedUser(`b9.out.${stamp}@ezy.af`, {
    firstName: 'Nine', lastName: 'Outsider',
    accountType: 'business', subscriptionStatus: 'active',
  })

  const c1 = await prisma.customer.create({ data: { businessId: business.id, email: `c1.${stamp}@cust.af`, name: 'Customer One' } })
  const c2 = await prisma.customer.create({ data: { businessId: business.id, email: `c2.${stamp}@cust.af`, name: 'Customer Two' } })
  const c3 = await prisma.customer.create({ data: { businessId: business.id, email: `c3.${stamp}@cust.af`, name: 'Customer Three' } })
  const foreignCustomer = await prisma.customer.create({ data: { businessId: outsider.id, email: `fx.${stamp}@cust.af`, name: 'Foreign' } })

  let personalCj = await login(personal.email)
  const otherCj = await login(other.email)
  const bizCj = await login(business.email)
  const outCj = await login(outsider.email)

  // ═══ D4: shared rate-limit store ═══
  // user-lookup is env-tuned to 3/window in the runner.
  for (let i = 0; i < 3; i++) {
    await api(personalCj, 'GET', `/api/users/lookup?email=probe${i}.${stamp}@ezy.af`)
  }
  const blocked = await api(personalCj, 'GET', `/api/users/lookup?email=probe4.${stamp}@ezy.af`)
  check('D4 L1: shared limiter returns 429 at the cap (user-lookup 3/window)', blocked.status === 429, `status ${blocked.status}`)

  const bucketKey = `user-lookup:${personal.id}`
  const bucket = await prisma.rateBucket.findUnique({ where: { key: bucketKey } })
  check('D4 L2: the 429 left a RateBucket row in PostgreSQL', Boolean(bucket) && bucket.count >= 3,
    bucket ? `count ${bucket.count}, windowEnd ${bucket.windowEnd.toISOString()}` : 'row missing')

  // Simulate a SECOND server instance mutating the same bucket: the very
  // next request must observe the change (impossible with per-instance Maps).
  await prisma.rateBucket.update({ where: { key: bucketKey }, data: { count: 0 } })
  const afterReset = await api(personalCj, 'GET', `/api/users/lookup?email=probe5.${stamp}@ezy.af`)
  check('D4 L3: state mutated directly in PG is honored by the API (shared, not per-instance)', afterReset.status === 200, `status ${afterReset.status}`)
  await prisma.rateBucket.delete({ where: { key: bucketKey } }).catch(() => {})

  // A DIFFERENT user's bucket must be independent (key scoping).
  const otherLookup = await api(otherCj, 'GET', `/api/users/lookup?email=probe1.${stamp}@ezy.af`)
  check('D4 L4: another principal is unaffected by the first bucket', otherLookup.status === 200, `status ${otherLookup.status}`)

  // ═══ D4: recovery OTP store + single-use reset-token guard ═══
  const recoveryCode = '654321'
  const otpHash = createHash('sha256').update(`${recoveryCode}:${personal.id}`).digest('hex')
  await prisma.otpChallenge.upsert({
    where: { purpose_subject: { purpose: 'password-recovery', subject: personal.id } },
    create: { purpose: 'password-recovery', subject: personal.id, codeHash: otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    update: { codeHash: otpHash, attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  })

  for (let i = 0; i < 5; i++) {
    await api(jar(), 'POST', '/api/auth/forgot-password', { action: 'verify-otp', email: personal.email, otp: '000000' })
  }
  const lockedOut = await api(jar(), 'POST', '/api/auth/forgot-password', { action: 'verify-otp', email: personal.email, otp: '000000' })
  check('D4 O1: wrong-code attempts accumulate to the cap across the shared store (locked 429)', lockedOut.status === 429, `status ${lockedOut.status}`)
  const challengeAfterLock = await prisma.otpChallenge.findUnique({ where: { purpose_subject: { purpose: 'password-recovery', subject: personal.id } } })
  check('D4 O2: a locked challenge is dropped (row deleted)', challengeAfterLock === null)

  // Fresh challenge with the CORRECT code → reset token; replay → refused.
  await prisma.otpChallenge.upsert({
    where: { purpose_subject: { purpose: 'password-recovery', subject: personal.id } },
    create: { purpose: 'password-recovery', subject: personal.id, codeHash: otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    update: { codeHash: otpHash, attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  })
  const otpOk = await api(jar(), 'POST', '/api/auth/forgot-password', { action: 'verify-otp', email: personal.email, otp: recoveryCode })
  check('D4 O3: correct code verifies and issues the reset token', otpOk.status === 200 && Boolean(otpOk.json?.resetToken), `status ${otpOk.status}`)
  const consumedRow = await prisma.otpChallenge.findUnique({ where: { purpose_subject: { purpose: 'password-recovery', subject: personal.id } } })
  check('D4 O4: the challenge is consumed on success (consumedAt set)', Boolean(consumedRow?.consumedAt))

  const usedOnce = await api(personalCj, 'POST', '/api/auth/forgot-password', {
    action: 'reset', resetToken: otpOk.json.resetToken, password: 'NewPass!9xK',
  })
  check('D4 O5: reset with the token succeeds exactly once', usedOnce.status === 200, `status ${usedOnce.status}`)
  const replay = await api(otherCj, 'POST', '/api/auth/forgot-password', {
    action: 'reset', resetToken: otpOk.json.resetToken, password: 'Replay!9xK2',
  })
  check('D4 O6: replaying the SAME reset token is refused (single-use guard)', replay.status === 400, `status ${replay.status}`)
  const guardRow = await prisma.usedTokenGuard.findFirst({ where: { tokenHash: createHash('sha256').update(otpOk.json.resetToken).digest('hex') } })
  check('D4 O7: the consumed token is recorded in UsedTokenGuard', Boolean(guardRow))
  // restore the seeded password for later tests
  await prisma.user.update({ where: { id: personal.id }, data: { passwordHash: bcrypt.hashSync(TEST_PASS, 4) } })
  // D4 O5's reset action revoked every session of this user (correct
  // behavior) — mint a fresh one for the remaining F-41/D2 blocks.
  personalCj = await login(personal.email)

  // ═══ D4: TOTP single-use step in the shared store ═══
  // Per-run random base32 TOTP secret (130 bits; Batch 9 remediation: no
  // literal test vector in the release diff). The suite seeds the 2FA row
  // with it and computes codes with the same value; phase 2 receives it via
  // /tmp/b9-totp-state.json.
  const totpSecret = Array.from(
    require('node:crypto').randomBytes(26),
    (b) => B32[b % 32]
  ).join('')
  const existing2fa = await prisma.twoFactor.findFirst({ where: { userId: other.id } })
  if (existing2fa) {
    await prisma.twoFactor.update({
      where: { id: existing2fa.id },
      data: { secret: totpSecret, isEnabled: true, verifiedAt: new Date(), backupCodes: '[]' },
    })
  } else {
    await prisma.twoFactor.create({
      data: { userId: other.id, secret: totpSecret, isEnabled: true, verifiedAt: new Date(), backupCodes: '[]' },
    })
  }
  const step = currentStep()
  const code = totpAt(totpSecret, step)
  const totpLogin = await api(jar(), 'POST', '/api/auth/login', { email: other.email, password: TEST_PASS, twoFactorCode: code })
  check('D4 T1: TOTP login with a current-window code succeeds', totpLogin.status === 200, `status ${totpLogin.status}`)
  const stepRow = await prisma.kvState.findUnique({ where: { key: `totp-step:${other.id}` } })
  const consumedStepMatch = stepRow && [step - 1, step, step + 1].includes(Number(stepRow.value))
  check('D4 T2: the consumed time-step persisted in KvState', Boolean(consumedStepMatch), stepRow ? `stored ${stepRow.value}` : 'row missing')
  const replayLogin = await api(jar(), 'POST', '/api/auth/login', { email: other.email, password: TEST_PASS, twoFactorCode: code })
  check('D4 T3: replaying the SAME TOTP code is refused', replayLogin.status === 401, `status ${replayLogin.status}`)
  const nextCode = totpAt(totpSecret, step + 1)
  const nextLogin = await api(jar(), 'POST', '/api/auth/login', { email: other.email, password: TEST_PASS, twoFactorCode: nextCode })
  check('D4 T4: the NEXT time-step still verifies', nextLogin.status === 200, `status ${nextLogin.status}`)

  // ── Batch 9 REMEDIATION: the replay guard must be a genuine atomic,
  // forward-only claim. T5 fires 8 SIMULTANEOUS logins (same password,
  // same code, independent sessions) and demands EXACTLY one success —
  // the old read-then-write guard could let two through; a single
  // conditional `updateMany` cannot, in any interleaving. The claim is
  // also FORWARD-ONLY: a step equal to or older than the newest consumed
  // one is refused outright (phase-2 R6 demonstrates the step-regression
  // replay this closes). Inside the ±1 window around the stored step
  // there is NO claimable newer step, so T5 waits (bounded) until the
  // counter passes the stored step — read from KvState, not guessed from
  // local arithmetic — and bursts on the NEXT step: unconsumed, strictly
  // newer, and still inside {c, c+1} at landing even if the boundary
  // rolls mid-burst.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const storedStepNum = async () => {
    const row = await prisma.kvState.findUnique({ where: { key: `totp-step:${other.id}` } })
    return row ? Number(row.value) : null
  }
  const storedBeforeBurst = await storedStepNum()
  const t5Deadline = Date.now() + 45000
  while (currentStep() <= (storedBeforeBurst ?? step + 1) && Date.now() < t5Deadline) await sleep(500)
  const burstStep = currentStep() + 1
  const burstCode = totpAt(totpSecret, burstStep)
  const BURST = 8
  const burst = await Promise.all(
    Array.from({ length: BURST }, () =>
      api(jar(), 'POST', '/api/auth/login', { email: other.email, password: TEST_PASS, twoFactorCode: burstCode })
    )
  )
  const burstOk = burst.filter((r) => r.status === 200).length
  const burstRejected = burst.filter((r) => r.status === 401).length
  check(`D4 T5: ${BURST} SIMULTANEOUS same-code logins yield EXACTLY 1 success`, burstOk === 1 && burstRejected === BURST - 1,
    `${burstOk} ok / ${burstRejected} x 401 (burstStep ${burstStep}, stored ${await storedStepNum()}, counter ${currentStep()}, statuses: ${burst.map((r) => r.status).join(',')})`)
  const burstReplay = await api(jar(), 'POST', '/api/auth/login', { email: other.email, password: TEST_PASS, twoFactorCode: burstCode })
  check('D4 T6: the same code is still refused after the concurrent burst', burstReplay.status === 401, `status ${burstReplay.status}`)
  // T7: pick an unconsumed step within the CURRENT ±1 window that is also
  // strictly NEWER than the ACTUAL stored step (read from KvState — the
  // forward-only claim refuses anything older; that refusal is R6's
  // proof, not a failure) and prove the guard blocks replays, not
  // progress. If the whole window is burned, wait one boundary (45 s).
  const consumedSteps = new Set([step, step + 1, burstStep])
  const newestStored = (await storedStepNum()) ?? Math.max(step + 1, burstStep)
  const t7Now = currentStep()
  let t7Step = [t7Now + 1, t7Now, t7Now - 1].find((s) => !consumedSteps.has(s) && s > newestStored)
  if (t7Step === undefined) {
    const t7Deadline = Date.now() + 45000
    let c = currentStep()
    while (c <= newestStored && Date.now() < t7Deadline) { await sleep(500); c = currentStep() }
    t7Step = c
  }
  const afterBurst = totpAt(totpSecret, t7Step)
  const afterBurstLogin = await api(jar(), 'POST', '/api/auth/login', { email: other.email, password: TEST_PASS, twoFactorCode: afterBurst })
  check('D4 T7: a NEWER step still verifies after the burst (guard blocks replays, not progress)', afterBurstLogin.status === 200, `status ${afterBurstLogin.status}, step ${t7Step}, stored ${newestStored}`)

  // Hand the restart / cross-instance phase the exact consumed step + code.
  // run-batch9-e2e.sh phase 2 restarts the app and boots a SECOND instance
  // on :3008 against the same database, then batch9-e2e-phase2.mjs proves
  // the consumed step survives BOTH.
  writeFileSync('/tmp/b9-totp-state.json', JSON.stringify({
    email: other.email,
    password: TEST_PASS,
    secret: totpSecret,
    lastUsedStep: t7Step,
    lastCode: afterBurst,
    userId: other.id,
  }))

  // ═══ F-41: profile phone change requires + consumes the proof ═══
  const noToken = await api(personalCj, 'PUT', '/api/user/profile', { phone: '+93700123456' })
  check('F41 P1: a changed phone WITHOUT a proof token is refused 400', noToken.status === 400, `status ${noToken.status}`)
  const badToken = await api(personalCj, 'PUT', '/api/user/profile', { phone: '+93700123456', phoneVerificationToken: 'garbage' })
  check('F41 P2: a token that does not verify/bind is refused 400', badToken.status === 400, `status ${badToken.status}`)
  const unchanged = await api(personalCj, 'PUT', '/api/user/profile', { phone: '+93700000001', firstName: 'Nine' })
  check('F41 P3: the UNCHANGED number still saves without a token (tolerant compare)', unchanged.status === 200, `status ${unchanged.status}`)

  const goodToken = await signPhoneProof('+93700123456')
  const changed = await api(personalCj, 'PUT', '/api/user/profile', { phone: '+93700123456', phoneVerificationToken: goodToken })
  check('F41 P4: a valid proof stores the E.164 number', changed.status === 200 && changed.json?.user?.phone === '+93700123456',
    changed.json?.user ? `stored ${changed.json.user.phone}` : `status ${changed.status}`)
  const replayToken = await api(personalCj, 'PUT', '/api/user/profile', { phone: '+93700123457', phoneVerificationToken: goodToken })
  check('F41 P5: the SAME proof cannot change the phone twice (consumed)', replayToken.status === 400, `status ${replayToken.status}`)
  const guard2 = await prisma.usedTokenGuard.findFirst({ where: { tokenHash: createHash('sha256').update(goodToken).digest('hex') } })
  check('F41 P6: the consumed proof is recorded in UsedTokenGuard', Boolean(guard2))

  // P2002 → 409 on a number another account already holds
  const dupToken = await signPhoneProof('+93800000002')
  const duplicatePhone = await api(personalCj, 'PUT', '/api/user/profile', { phone: '+93800000002', phoneVerificationToken: dupToken })
  check('F41 P7: a phone already owned by another account maps to 409 (P2002)', duplicatePhone.status === 409, `status ${duplicatePhone.status}`)

  // ═══ D1: honest campaign lifecycle ═══
  const createRes = await api(bizCj, 'POST', '/api/business/campaigns', {
    subject: 'Launch bulletin', body: 'Hello from the shop', recipientCustomerIds: [c1.id, c2.id],
  })
  const campaign = createRes.json?.campaign
  check('D1 C1: create lands as an editable draft', createRes.status === 201 && campaign?.status === 'draft' && campaign?.sentAt === null,
    campaign ? `status ${createRes.status}, campaign status ${campaign.status}` : `status ${createRes.status}`)

  const editRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, {
    subject: 'Launch bulletin v2', body: 'Refined copy',
  })
  check('D1 C2: draft content is editable (PUT)', editRes.status === 200 && editRes.json?.campaign?.subject === 'Launch bulletin v2', `status ${editRes.status}`)

  const swapRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, {
    recipientCustomerIds: [c1.id, c3.id],
  })
  check('D1 C3: recipient set is replaceable (count 2)', swapRes.status === 200 && swapRes.json?.campaign?.recipientCount === 2, `count ${swapRes.json?.campaign?.recipientCount}`)

  const detailAfterSwap = await api(bizCj, 'GET', `/api/business/campaigns/${campaign.id}`)
  const memberIds = (detailAfterSwap.json?.campaign?.recipients || []).map((r) => r.customer.id).sort()
  check('D1 C4: the audience matches exactly the replacement set', String(memberIds) === String([c1.id, c3.id].sort()), memberIds.join(','))

  const pastRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, {
    action: 'schedule', scheduledFor: new Date(Date.now() - 60_000).toISOString(),
  })
  check('D1 C5: a PAST schedule time is refused 400', pastRes.status === 400, `status ${pastRes.status}`)

  const schedRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, {
    action: 'schedule', scheduledFor: new Date(Date.now() + 2 * 3600_000).toISOString(),
  })
  check('D1 C6: scheduling stamps intent (status=scheduled, future scheduledFor)', schedRes.status === 200 && schedRes.json?.campaign?.status === 'scheduled' && Boolean(schedRes.json?.campaign?.scheduledFor), `status ${schedRes.status}`)
  const scheduledRow = await prisma.campaign.findUnique({ where: { id: campaign.id } })
  check('D1 C7: sentAt stays NULL after scheduling (nothing pretends to deliver)', scheduledRow.sentAt === null && scheduledRow.opens === 0 && scheduledRow.clicks === 0,
    `sentAt ${scheduledRow.sentAt}, opens ${scheduledRow.opens}, clicks ${scheduledRow.clicks}`)

  const editWhileScheduled = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, { subject: 'nope' })
  check('D1 C8: a scheduled campaign is frozen for content edits (400)', editWhileScheduled.status === 400, `status ${editWhileScheduled.status}`)

  const unschedRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, { action: 'unschedule' })
  check('D1 C9: un-scheduling returns the campaign to draft', unschedRes.status === 200 && unschedRes.json?.campaign?.status === 'draft' && unschedRes.json?.campaign?.scheduledFor === null, `status ${unschedRes.status}`)

  const capRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, {
    recipientCustomerIds: Array.from({ length: 1001 }, (_, i) => `cust_${i}`),
  })
  check('D1 C10: the 1000-recipient cap holds on the edit path (400)', capRes.status === 400, `status ${capRes.status}`)

  const foreignCustomerRes = await api(bizCj, 'PUT', `/api/business/campaigns/${campaign.id}`, {
    recipientCustomerIds: [foreignCustomer.id],
  })
  check('D1 C11: another business\u2019s customer is refused (ownership)', foreignCustomerRes.status === 400, `status ${foreignCustomerRes.status}`)

  const foreignCampaign = await api(outCj, 'PUT', `/api/business/campaigns/${campaign.id}`, { subject: 'hijack' })
  check('D1 C12: another business gets 404 on a foreign campaign', foreignCampaign.status === 404, `status ${foreignCampaign.status}`)

  const personalEdit = await api(personalCj, 'PUT', `/api/business/campaigns/${campaign.id}`, { subject: 'nope' })
  check('D1 C13: a personal account is refused on business campaigns (403)', personalEdit.status === 403, `status ${personalEdit.status}`)

  // ═══ D2: labels — the secured surface the new UI rides on ═══
  const mkLabel = await api(personalCj, 'POST', '/api/labels', { name: 'Batch9 Priority', color: '#4285F4' })
  const ownLabel = mkLabel.json?.data
  check('D2 B1: label create returns the row (201)', mkLabel.status === 201 && Boolean(ownLabel?.id), `status ${mkLabel.status}`)
  const foreignLabel = await api(otherCj, 'POST', '/api/labels', { name: 'Other label', color: '#34A853' })
  const foreignLabelRow = foreignLabel.json?.data

  const mail1 = await seedEmail(other, personal.email, 'batch9 label target')
  const listPlain = await api(personalCj, 'GET', '/api/emails?folder=inbox&page=1&limit=20')
  const plainRow = (listPlain.json?.emails || []).find((e) => e.id === mail1.id)
  check('D2 B2: list rows carry a labels array (empty before assignment)', Boolean(plainRow) && Array.isArray(plainRow.labels) && plainRow.labels.length === 0, 'labels field present')

  const assign = await api(personalCj, 'POST', `/api/emails/${mail1.id}/labels`, { labelIds: [ownLabel.id] })
  check('D2 B3: assigning an OWN label to an own mailbox row succeeds', assign.status === 200, `status ${assign.status}`)

  const detailRow = await api(personalCj, 'GET', `/api/emails/${mail1.id}`)
  check('D2 B4: the detail response carries the assigned label', detailRow.status === 200 && (detailRow.json?.email?.labels || []).some((l) => l.id === ownLabel.id), 'labels on detail')

  const filtered = await api(personalCj, 'GET', `/api/emails?folder=inbox&page=1&limit=20&label=${ownLabel.id}`)
  const filteredIds = (filtered.json?.emails || []).map((e) => e.id)
  check('D2 B5: ?label=<own> returns exactly the labeled mail', filteredIds.includes(mail1.id), `rows ${filteredIds.length}`)

  const unassigned = await api(personalCj, 'GET', `/api/emails?folder=inbox&page=1&limit=20&label=${foreignLabelRow.id}`)
  check('D2 B6: a FOREIGN label id filters to nothing (no leak)', unassigned.status === 200 && (unassigned.json?.emails || []).length === 0, `rows ${(unassigned.json?.emails || []).length}`)

  const foreignAssign = await api(otherCj, 'POST', `/api/emails/${mail1.id}/labels`, { labelIds: [ownLabel.id] })
  const otherSeesMail = foreignAssign.status !== 200
  check('D2 B7: another user cannot label MY mailbox row (404 on foreign row)', otherSeesMail, `status ${foreignAssign.status}`)

  const unassign = await api(personalCj, 'DELETE', `/api/emails/${mail1.id}/labels`, { labelIds: [ownLabel.id] })
  const afterUnassign = await api(personalCj, 'GET', `/api/emails?folder=inbox&page=1&limit=20&label=${ownLabel.id}`)
  check('D2 B8: unassigning empties the label filter result', unassign.status === 200 && (afterUnassign.json?.emails || []).length === 0, 'filter now empty')

  const rename = await api(personalCj, 'PUT', `/api/labels/${ownLabel.id}`, { name: 'Batch9 Renamed' })
  check('D2 B9: rename works (PUT /api/labels/[id])', rename.status === 200 && rename.json?.data?.name === 'Batch9 Renamed', `status ${rename.status}`)

  const delLabel = await api(personalCj, 'DELETE', `/api/labels/${ownLabel.id}`)
  const labelsAfter = await api(personalCj, 'GET', '/api/labels')
  check('D2 B10: label delete removes it from the palette', delLabel.status === 200 && !(labelsAfter.json?.data || []).some((l) => l.id === ownLabel.id), 'palette updated')

  // ── Summary ──
  console.log('\n===== Batch 9 E2E results =====')
  for (const line of results) console.log(line)
  console.log(`\nTOTAL: ${pass} pass, ${fail} fail`)
  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error('SUITE CRASH:', err)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
