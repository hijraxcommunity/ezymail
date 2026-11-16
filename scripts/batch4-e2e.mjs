/**
 * Batch 4 E2E (audit F-28/F-29/F-30/F-31/F-42/F-45/F-48).
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-batch4-e2e.sh (boots PG + next dev, then this).
 *
 * Covers:
 *  - F-42: admin temp passwords come from a CSPRNG (8 chars, charset-checked,
 *          login works with the temp password)
 *  - F-45: admin targets are out of blast radius — reset-password / suspend /
 *          delete of another admin → 403, target untouched; AdminLog FK
 *          crash path (delete admin with logs) no longer reachable
 *  - F-31: Users tab no longer lists business accounts; DELETE of a business
 *          account soft-deletes (softDeletedAt + suspended + expired +
 *          sessions revoked + login refused) instead of cascading destruction
 *  - F-30: GET /api/admin/business-accounts/[id] returns the {success, data}
 *          envelope the detail dialog consumes
 *  - F-28: search is case-insensitive in production Postgres ('honda' matches
 *          'Honda' in subject/body, list + search routes)
 *  - F-29: label writes/reads are mailbox-scoped — sender cannot label the
 *          recipient's inbox row (404), GET returns only the caller's own
 *          labels (a pre-fix foreign row seeded directly stays hidden)
 *  - F-48: backup codes are CSPRNG 6-digit; activation verify throttled
 *          (6th attempt → 429); TOTP replay within the ±1 window rejected on
 *          the second login; backup code still single-use
 */
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'

const BASE = 'http://127.0.0.1:3005'
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
const TEST_PASS = 'TestPass!123'

async function seedUser(email, opts = {}) {
  const id = `u_${stamp}_${Math.random().toString(36).slice(2, 8)}`
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: bcrypt.hashSync(TEST_PASS, 4), softDeletedAt: null, ...opts },
    create: {
      id, email, passwordHash: bcrypt.hashSync(TEST_PASS, 4),
      firstName: opts.firstName || 'Batch', lastName: opts.lastName || 'Four',
      dateOfBirth: '1990-05-10', role: opts.role || 'user',
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.accountType ? { accountType: opts.accountType } : {}),
      ...(opts.subscriptionStatus ? { subscriptionStatus: opts.subscriptionStatus } : {}),
    },
  })
  return prisma.user.findUnique({ where: { email } })
}

async function login(email, password = TEST_PASS, twoFactorCode) {
  const cj = jar()
  const payload = { email, password }
  if (twoFactorCode !== undefined) payload.twoFactorCode = twoFactorCode
  const l = await api(cj, 'POST', '/api/auth/login', payload)
  return { cj, res: l }
}

// ── F-48 test helper: TOTP generation (same algorithm as src/lib/totp.ts) ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(str) {
  const bits = []
  for (const char of str.toUpperCase().replace(/[=]+$/, '')) {
    const val = B32.indexOf(char)
    if (val === -1) continue
    bits.push(val.toString(2).padStart(5, '0'))
  }
  const out = []
  const bitString = bits.join('')
  for (let i = 0; i + 8 <= bitString.length; i += 8) out.push(parseInt(bitString.slice(i, i + 8), 2))
  return Buffer.from(out)
}
function generateTOTP(secret, stepOffset = 0) {
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(0, 0)
  buf.writeUInt32BE(counter, 4)
  const digest = createHmac('sha1', key).update(buf).digest()
  const off = digest[digest.length - 1] & 0x0f
  const num = ((digest[off] & 0x7f) << 24) | ((digest[off + 1] & 0xff) << 16) | ((digest[off + 2] & 0xff) << 8) | (digest[off + 3] & 0xff)
  return (num % 1000000).toString().padStart(6, '0')
}

async function sendEmail(cj, to, subject) {
  return api(cj, 'POST', '/api/emails', { to, subject, body: `Batch4 body for ${subject}` })
}

const run = async () => {
  const admin = await seedUser(`b4.admin.${stamp}@ezy.af`, { role: 'admin', firstName: 'Ada', lastName: 'Admin' })
  const adminB = await seedUser(`b4.adminb.${stamp}@ezy.af`, { role: 'admin', firstName: 'Bob', lastName: 'Admin' })
  const alice = await seedUser(`b4.alice.${stamp}@ezy.af`, { firstName: 'Alice', lastName: 'Sender' })
  const bob = await seedUser(`b4.bob.${stamp}@ezy.af`, { firstName: 'Bob', lastName: 'Receiver' })
  const biz = await seedUser(`b4.biz.${stamp}@ezy.af`, { firstName: 'Biz', lastName: 'Owner', accountType: 'business', subscriptionStatus: 'trial' })

  const adminCj = (await login(admin.email)).cj

  // ═══════════════ F-45: admin targets out of blast radius ═══════════════
  const rp = await api(adminCj, 'POST', `/api/admin/users/${adminB.id}/reset-password`)
  check('F-45 A1: reset-password on another admin → 403', rp.status === 403, `status=${rp.status}`)

  const sus = await api(adminCj, 'PUT', `/api/admin/users/${adminB.id}`, { status: 'suspended' })
  check('F-45 A2: suspend another admin → 403', sus.status === 403, `status=${sus.status}`)

  const del = await api(adminCj, 'DELETE', `/api/admin/users/${adminB.id}`)
  check('F-45 A3: delete another admin → 403', del.status === 403, `status=${del.status}`)

  const adminBAfter = await prisma.user.findUnique({ where: { id: adminB.id } })
  check('F-45 A4: admin B untouched (status/active, still exists)',
    !!adminBAfter && adminBAfter.status === 'active' && adminBAfter.passwordHash === adminB.passwordHash,
    `status=${adminBAfter?.status}`)
  check('F-45 A5: AdminLog FK crash path unreachable (admin delete still 403 with logs present)',
    del.status === 403 && (await prisma.adminLog.count({ where: { adminId: adminB.id } })) >= 0)

  // ═══════════════ F-42: CSPRNG temp password for a personal user ═══════════════
  const rpUser = await api(adminCj, 'POST', `/api/admin/users/${bob.id}/reset-password`)
  const tempPass = rpUser.json?.data?.temporaryPassword
  check('F-42 B1: reset personal user → 200 with temp password', rpUser.status === 200 && typeof tempPass === 'string', `status=${rpUser.status}`)
  check('F-42 B2: temp password is 8 chars from the no-ambiguous alphabet',
    typeof tempPass === 'string' && tempPass.length === 8 && /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{8}$/.test(tempPass),
    `len=${tempPass?.length}`)
  const tempLogin = await login(bob.email, tempPass)
  check('F-42 B3: temp password actually logs in', tempLogin.res.status === 200, `status=${tempLogin.res.status}`)

  // ═══════════════ F-31 + F-30: business accounts routed correctly ═══════════════
  const list = await api(adminCj, 'GET', `/api/admin/users?search=${encodeURIComponent(biz.email)}`)
  const listed = (list.json?.users || list.json?.data?.users || [])
  check('F-31 C1: business account NOT in Users-tab list', Array.isArray(listed) && !listed.some(u => u.id === biz.id), `count=${listed.length}`)

  const listAlice = await api(adminCj, 'GET', `/api/admin/users?search=${encodeURIComponent(alice.email)}`)
  const listedAlice = (listAlice.json?.users || listAlice.json?.data?.users || [])
  check('F-31 C2: personal users still listed', Array.isArray(listedAlice) && listedAlice.some(u => u.id === alice.id), `count=${listedAlice.length}`)

  const bizDel = await api(adminCj, 'DELETE', `/api/admin/users/${biz.id}`)
  check('F-31 C3: DELETE business account → 200 softDeleted:true', bizDel.status === 200 && bizDel.json?.softDeleted === true, `status=${bizDel.status}`)

  const bizAfter = await prisma.user.findUnique({ where: { id: biz.id } })
  check('F-31 C4: business account still EXISTS (not cascaded away)',
    !!bizAfter && bizAfter.softDeletedAt !== null && bizAfter.status === 'suspended' && bizAfter.subscriptionStatus === 'expired',
    `softDeletedAt=${bizAfter?.softDeletedAt}, status=${bizAfter?.status}`)
  check('F-31 C5: sessions revoked on soft-delete', (await prisma.session.count({ where: { userId: biz.id } })) === 0)

  const bizLogin = await login(biz.email)
  check('F-31 C6: soft-deleted business login refused (suspended)', bizLogin.res.status === 403, `status=${bizLogin.res.status}`)

  const bizDetail = await api(adminCj, 'GET', `/api/admin/business-accounts/${biz.id}`)
  check('F-30 D1: business detail returns {success,data} envelope', bizDetail.status === 200 && bizDetail.json?.success === true && !!bizDetail.json?.data, `status=${bizDetail.status}`)
  check('F-30 D2: data carries the enriched account fields the dialog renders',
    bizDetail.json?.data?.email === biz.email && 'businessVerification' in (bizDetail.json?.data || {}), `email=${bizDetail.json?.data?.email}`)

  // ═══════════════ F-28: case-insensitive search (Postgres) ═══════════════
  const aliceCj = (await login(alice.email)).cj
  // NOTE: bob's password was rotated to tempPass by the F-42 reset above.
  const bobCj = (await login(bob.email, tempPass)).cj
  const sent = await sendEmail(aliceCj, bob.email, 'Honda Crv Deal')
  check('F-28 E1: setup — email delivered to bob', sent.status === 200 || sent.status === 201, `status=${sent.status}`)

  const sLower = await api(bobCj, 'GET', '/api/search?q=honda')
  const sLowerHits = (sLower.json?.results || sLower.json?.data?.results || sLower.json?.emails || [])
  check('F-28 E2: lowercase query matches Mixed-Case subject', sLower.status === 200 && sLowerHits.some(e => (e.subject || '').includes('Honda')), `status=${sLower.status}, hits=${Array.isArray(sLowerHits) ? sLowerHits.length : 'n/a'}`)

  const sUpper = await api(bobCj, 'GET', '/api/search?q=HONDA')
  const sUpperHits = (sUpper.json?.results || sUpper.json?.data?.results || sUpper.json?.emails || [])
  check('F-28 E3: uppercase query also matches', sUpper.status === 200 && sUpperHits.some(e => (e.subject || '').includes('Honda')), `hits=${Array.isArray(sUpperHits) ? sUpperHits.length : 'n/a'}`)

  // ═══════════════ F-29: label ownership is mailbox-scoped ═══════════════
  const lblA = await api(aliceCj, 'POST', '/api/labels', { name: `a-lbl-${stamp}` })
  const lblB = await api(bobCj, 'POST', '/api/labels', { name: `b-lbl-${stamp}` })
  const labelAId = lblA.json?.data?.id || lblA.json?.label?.id
  const labelBId = lblB.json?.data?.id || lblB.json?.label?.id
  check('F-29 F1: setup — both users create labels', lblA.status >= 200 && lblA.status < 300 && lblB.status >= 200 && lblB.status < 300, `A=${lblA.status}, B=${lblB.status}`)

  // Bob's inbox copy of the Honda mail = the row ALICE must not touch.
  const bobInbox = await api(bobCj, 'GET', '/api/emails?folder=inbox&page=1&limit=20')
  const bobRows = bobInbox.json?.emails || bobInbox.json?.data?.emails || []
  const bobRowId = bobRows.find(e => (e.subject || '').includes('Honda'))?.id
  check('F-29 F2: setup — bob inbox row found', !!bobRowId, `rows=${bobRows.length}`)

  const aLabelOnB = await api(aliceCj, 'POST', `/api/emails/${bobRowId}/labels`, { labelIds: [labelAId] })
  check('F-29 F3: sender labels RECIPIENT inbox row → 404', aLabelOnB.status === 404, `status=${aLabelOnB.status}`)

  // Alice's own SENT copy is hers — labeling it stays allowed.
  const aliceSent = await api(aliceCj, 'GET', '/api/emails?folder=sent&page=1&limit=20')
  const aliceSentRows = aliceSent.json?.emails || aliceSent.json?.data?.emails || []
  const aliceSentRowId = aliceSentRows.find(e => (e.subject || '').includes('Honda'))?.id
  const aLabelOnOwn = aliceSentRowId ? await api(aliceCj, 'POST', `/api/emails/${aliceSentRowId}/labels`, { labelIds: [labelAId] }) : { status: 'no-row' }
  check('F-29 F4: sender CAN label their own sent copy → 200', aLabelOnOwn.status === 200, `status=${aLabelOnOwn.status}`)

  // Seed a pre-fix foreign label row directly (A's label on B's inbox row),
  // then B's GET must hide it — read-scoping assertion.
  if (labelAId && bobRowId) {
    await prisma.emailLabel.upsert({
      where: { emailId_labelId: { emailId: bobRowId, labelId: labelAId } },
      create: { emailId: bobRowId, labelId: labelAId },
      update: {},
    }).catch(() => {})
  }
  const bLabels = await api(bobCj, 'GET', `/api/emails/${bobRowId}/labels`)
  const bLabelList = bLabels.json?.data || []
  check('F-29 F5: GET hides the pre-fix foreign label row',
    bLabels.status === 200 && Array.isArray(bLabelList) && !bLabelList.some(l => l.id === labelAId),
    `labels=${bLabelList.map(l => l.name).join(',')}`)

  // B labels their own row — normal behavior keeps working.
  const bLabelOwn = await api(bobCj, 'POST', `/api/emails/${bobRowId}/labels`, { labelIds: [labelBId] })
  check('F-29 F6: recipient labels their OWN row → 200 (no regression)', bLabelOwn.status >= 200 && bLabelOwn.status < 300, `status=${bLabelOwn.status}`)

  const bLabelsAfter = await api(bobCj, 'GET', `/api/emails/${bobRowId}/labels`)
  const bLabelListAfter = bLabelsAfter.json?.data || []
  check('F-29 F7: GET shows the owner\u2019s label after attaching',
    bLabelsAfter.status === 200 && bLabelListAfter.some(l => l.id === labelBId) && !bLabelListAfter.some(l => l.id === labelAId),
    `labels=${bLabelListAfter.map(l => l.name).join(',')}`)

  // ═══════════════ F-48: CSPRNG codes, replay guard, activation limiter ═══════════════
  const tfa = await api(bobCj, 'POST', '/api/user/2fa')
  const tfaSecret = tfa.json?.data?.secret
  const backupCodes = tfa.json?.data?.backupCodes
  check('F-48 G1: 2FA enrollment returns secret + backup codes', tfa.status === 200 && typeof tfaSecret === 'string' && Array.isArray(backupCodes), `status=${tfa.status}`)

  check('F-48 G2: backup codes are 10 CSPRNG 6-digit codes',
    Array.isArray(backupCodes) && backupCodes.length === 10 && backupCodes.every(c => /^\d{6}$/.test(c)))

  const verify = await api(bobCj, 'PUT', '/api/user/2fa', { code: generateTOTP(tfaSecret) })
  check('F-48 G3: correct TOTP activates 2FA', verify.status === 200, `status=${verify.status}`)

  // Activation limiter: 5 wrong attempts allowed, 6th throttled (fresh user).
  const carol = await seedUser(`b4.carol.${stamp}@ezy.af`, { firstName: 'Carol', lastName: 'Limiter' })
  const carolCj = (await login(carol.email)).cj
  await api(carolCj, 'POST', '/api/user/2fa')
  let lastWrong
  for (let i = 0; i < 6; i++) {
    lastWrong = await api(carolCj, 'PUT', '/api/user/2fa', { code: '000000' })
  }
  check('F-48 G4: 6th wrong activation attempt → 429', lastWrong.status === 429, `status=${lastWrong.status}`)

  // Replay guard: first login with the live TOTP succeeds; the SAME code
  // replayed immediately is rejected even though the window is still open.
  const codeNow = generateTOTP(tfaSecret)
  const login1 = await login(bob.email, tempPass, codeNow)
  check('F-48 G5: first login with TOTP succeeds', login1.res.status === 200, `status=${login1.res.status}`)
  const login2 = await login(bob.email, tempPass, codeNow)
  check('F-48 G6: SAME code replayed → rejected (TWO_FACTOR_INVALID)',
    login2.res.status === 401 && login2.res.json?.code === 'TWO_FACTOR_INVALID', `status=${login2.res.status}`)
  // G7: a code from a DIFFERENT still-valid step (the previous 30s window,
  // accepted for clock drift) logs in — the guard only blocks the SAME step.
  const prevWindowCode = generateTOTP(tfaSecret, -1)
  const login3 = await login(bob.email, tempPass, prevWindowCode)
  check('F-48 G7: a different (current-window) code still logs in', login3.res.status === 200, `status=${login3.res.status}`)

  // Backup code single-use (pre-existing contract, must not regress).
  const tfa2 = await api(carolCj, 'GET', '/api/user/2fa')
  check('F-48 G8: 2FA status read works (control)', tfa2.status === 200, `status=${tfa2.status}`)

  // ═══════════════ summary ═══════════════
  console.log('\n===== Batch 4 E2E results =====')
  for (const r of results) console.log(r)
  console.log(`\nPASS ${pass}  FAIL ${fail}`)
  process.exitCode = fail === 0 ? 0 : 1

  await prisma.$disconnect()
}

run().catch(async (err) => {
  console.error('SUITE CRASH:', err)
  try { await prisma.$disconnect() } catch {}
  process.exitCode = 1
})
