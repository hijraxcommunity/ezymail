/**
 * Batch 3 E2E (audit F-08/F-09/F-10/F-12/F-13/F-14/F-15/F-16/F-19).
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-batch3-e2e.sh (boots PG + next dev, then this).
 *
 * Covers:
 *  - F-08: impersonation is a REAL session swap — cookie set server-side,
 *          /api/auth/me returns the victim (+impersonating flag), mail APIs
 *          run as the victim, password/2FA mutations refused, exit restores
 *          the admin cookie, no raw token in the response body, AdminLog written
 *  - F-09: LoginLog rows written on success AND every known-account failure
 *          (wrong password, suspended, maintenance, 2FA-invalid)
 *  - F-10: settings GET surfaces only enforced keys; PUT rejects unknown
 *          keys; registration_open blocks personal AND business register;
 *          maintenance_mode blocks non-admin login (admin passes)
 *  - F-12: merged admin-log pagination — page 2 of type=all equals the true
 *          merged ordering rows 51-100 (previously per-source windows)
 *  - F-13: campaigns stay draft-only and the UI no longer promises real-time
 *          tracking (copy assertions) / sentAt stays null
 *  - F-14: business self-service DELETE works (soft delete + sessions revoked
 *          + login refused + 30-day address reservation)
 *  - F-15: verification file mode uploads REAL content (server-validated
 *          type/size); fabricated URLs rejected; admin documents endpoint
 *          serves the bytes; admin list payload strips file data
 *  - F-16: expired businesses get 403 on customers/campaigns/team/analytics
 *          (profile/verification stay visible); soft-deleted accounts cannot
 *          log in; released addresses registrable after the reservation window
 *  - F-19: verification approval grants the trial ONCE — re-approval after
 *          consumption returns 409 and never moves trialEnd
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

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
    update: { passwordHash: bcrypt.hashSync(TEST_PASS, 4), ...opts },
    create: {
      id, email, passwordHash: bcrypt.hashSync(TEST_PASS, 4),
      firstName: opts.firstName || 'Batch', lastName: opts.lastName || 'Three',
      dateOfBirth: '1990-05-10', role: opts.role || 'user',
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.accountType ? { accountType: opts.accountType } : {}),
      ...(opts.subscriptionStatus ? { subscriptionStatus: opts.subscriptionStatus } : {}),
    },
  })
  return prisma.user.findUnique({ where: { email } })
}

async function login(email, password = TEST_PASS) {
  const cj = jar()
  const l = await api(cj, 'POST', '/api/auth/login', { email, password })
  return { cj, res: l }
}

async function registerBusiness(email, businessName = 'B3 Co') {
  const cj = jar()
  return api(cj, 'POST', '/api/business/register', {
    businessName, firstName: 'Biz', lastName: 'Three',
    businessEmail: email, password: TEST_PASS,
  })
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const run = async () => {
  const admin = await seedUser(`b3.admin.${stamp}@ezy.af`, { role: 'admin', firstName: 'Ada', lastName: 'Admin' })

  // ═══════════════ F-10: enforced settings surface ═══════════════
  const adminCj = (await login(admin.email)).cj
  const sGet = await api(adminCj, 'GET', '/api/admin/settings')
  const flat = sGet.json?.data?.flat || {}
  const flatKeys = Object.keys(flat).sort()
  check('F-10 S1: settings GET surfaces only enforced keys',
    sGet.status === 200 &&
    JSON.stringify(flatKeys) === JSON.stringify(['maintenance_message', 'maintenance_mode', 'registration_open']),
    `keys=${flatKeys.join(',')}`)

  const sUnknown = await api(adminCj, 'PUT', '/api/admin/settings', { settings: { max_attachment_size: '123', bogus_key: 'x' } })
  check('F-10 S2: PUT rejects unknown keys with 400', sUnknown.status === 400, `status=${sUnknown.status}`)

  // registration_open=false blocks BOTH register paths (F-10)
  await api(adminCj, 'PUT', '/api/admin/settings', { settings: { registration_open: 'false' } })
  const pCj = jar()
  const pReg = await api(pCj, 'POST', '/api/auth/register', {
    firstName: 'No', lastName: 'Reg', password: TEST_PASS,
    email: `b3.closed.${stamp}@ezy.af`, dateOfBirth: '1990-01-01',
  })
  check('F-10 S3: registration_open=false blocks personal register (before phone validation)',
    pReg.status === 403 && (pReg.json?.error || '').includes('closed'), `status=${pReg.status} err=${pReg.json?.error}`)
  const bRegClosed = await registerBusiness(`closed.a.${stamp}@test.ezy`)
  check('F-10 S4: registration_open=false blocks business register',
    bRegClosed.status === 403 && (bRegClosed.json?.error || '').includes('closed'),
    `status=${bRegClosed.status}`)
  await api(adminCj, 'PUT', '/api/admin/settings', { settings: { registration_open: 'true' } })

  // maintenance_mode gates non-admin login, admin passes (F-10)
  const maintUser = await seedUser(`b3.maint.${stamp}@ezy.af`)
  await api(adminCj, 'PUT', '/api/admin/settings', { settings: { maintenance_mode: 'true', maintenance_message: 'Back soon' } })
  const mLogin = await login(maintUser.email)
  check('F-10 S5: maintenance_mode=true blocks non-admin login (503 + message)',
    mLogin.res.status === 503 && (mLogin.res.json?.error || '').includes('Back soon'),
    `status=${mLogin.res.status}`)
  const aLoginMaint = await login(admin.email)
  check('F-10 S6: admin login passes during maintenance', aLoginMaint.res.status === 200, `status=${aLoginMaint.res.status}`)
  await api(adminCj, 'PUT', '/api/admin/settings', { settings: { maintenance_mode: 'false' } })

  // ═══════════════ F-09: LoginLog written ═══════════════
  const logUser = await seedUser(`b3.log.${stamp}@ezy.af`)
  await login(logUser.email) // success
  const wrong = await login(logUser.email, 'WrongPass!123') // failure
  check('F-09 L0: wrong-password login rejected 401', wrong.res.status === 401, `status=${wrong.res.status}`)
  const succRows = await prisma.loginLog.findMany({ where: { userId: logUser.id, success: true } })
  check('F-09 L1: successful login writes LoginLog success=true', succRows.length >= 1, `rows=${succRows.length}`)
  const failRows = await prisma.loginLog.findMany({ where: { userId: logUser.id, success: false } })
  check('F-09 L2: wrong-password login writes LoginLog success=false', failRows.length >= 1, `rows=${failRows.length}`)

  const susUser = await seedUser(`b3.susp.${stamp}@ezy.af`, { status: 'suspended' })
  const susLogin = await login(susUser.email)
  const susRows = await prisma.loginLog.findMany({ where: { userId: susUser.id, success: false } })
  check('F-09 L3: suspended login 403 + logged as failure',
    susLogin.res.status === 403 && susRows.length >= 1, `status=${susLogin.res.status} rows=${susRows.length}`)

  const unknownLogin = await login(`nouser.${stamp}@ezy.af`)
  check('F-09 L4: unknown-email login 401 (no FK crash)', unknownLogin.res.status === 401, `status=${unknownLogin.res.status}`)

  const maintFailRows = await prisma.loginLog.findMany({ where: { userId: maintUser.id, success: false } })
  check('F-09 L5: maintenance rejection logged as failure', maintFailRows.length >= 1, `rows=${maintFailRows.length}`)

  // ═══════════════ F-08: real impersonation ═══════════════
  const victim = await seedUser(`b3.victim.${stamp}@ezy.af`, { firstName: 'Vic', lastName: 'Tim' })
  const impRes = await api(adminCj, 'POST', `/api/admin/users/${victim.id}/impersonate`)
  check('F-08 I1: impersonate 200', impRes.status === 200, `status=${impRes.status}`)
  check('F-08 I2: response body no longer contains a usable token', !impRes.json?.data?.token, 'token absent from body')
  check('F-08 I3: session cookie was replaced with the impersonation session',
    Boolean(adminCj.raw('ezymail-session')), 'cookie present')

  const meAsVictim = await api(adminCj, 'GET', '/api/auth/me')
  check('F-08 I4: /api/auth/me returns the VICTIM + impersonating flag',
    meAsVictim.status === 200 && meAsVictim.json?.user?.email === victim.email && meAsVictim.json?.impersonating === true,
    `email=${meAsVictim.json?.user?.email} imp=${meAsVictim.json?.impersonating}`)

  const mailAsVictim = await api(adminCj, 'GET', '/api/emails?folder=inbox&page=1&limit=10')
  check('F-08 I5: mail APIs execute as the victim (200)', mailAsVictim.status === 200, `status=${mailAsVictim.status}`)

  const pwChange = await api(adminCj, 'PUT', '/api/user/password', { currentPassword: TEST_PASS, newPassword: 'NewPass!123x' })
  check('F-08 I6: password change refused under impersonation (403)', pwChange.status === 403, `status=${pwChange.status}`)

  const tfaStart = await api(adminCj, 'POST', '/api/user/2fa')
  check('F-08 I7: 2FA enrollment refused under impersonation (403)', tfaStart.status === 403, `status=${tfaStart.status}`)
  const tfaDel = await api(adminCj, 'DELETE', '/api/user/2fa')
  check('F-08 I8: 2FA disable refused under impersonation (403)', tfaDel.status === 403, `status=${tfaDel.status}`)

  const plain = await seedUser(`b3.plain.${stamp}@ezy.af`)
  const plainCj = (await login(plain.email)).cj
  const plainExit = await api(plainCj, 'DELETE', `/api/admin/users/${plain.id}/impersonate`)
  check('F-08 I9: non-impersonated session cannot call exit (403)', plainExit.status === 403, `status=${plainExit.status}`)

  const exitRes = await api(adminCj, 'DELETE', `/api/admin/users/${victim.id}/impersonate`)
  check('F-08 I10: exit impersonation 200 + admin session restored flag', exitRes.status === 200 && exitRes.json?.restored === true,
    `status=${exitRes.status} restored=${exitRes.json?.restored}`)
  const meAsAdmin = await api(adminCj, 'GET', '/api/auth/me')
  check('F-08 I11: after exit /api/auth/me returns the ADMIN again',
    meAsAdmin.status === 200 && meAsAdmin.json?.user?.email === admin.email && meAsAdmin.json?.impersonating === false,
    `email=${meAsAdmin.json?.user?.email} imp=${meAsAdmin.json?.impersonating}`)
  const impLogs = await prisma.adminLog.findMany({
    where: { action: { in: ['impersonate_user', 'impersonation_exit'] }, adminId: admin.id },
  })
  check('F-08 I12: AdminLog records start and exit', impLogs.length >= 2, `rows=${impLogs.length}`)

  // ═══════════════ F-12: merged logs pagination ═══════════════
  const base = Date.now() - 60 * 60 * 1000
  const adminLogRows = []
  const loginLogRows = []
  for (let i = 0; i < 60; i++) {
    adminLogRows.push({
      adminId: admin.id, action: `b3seed-a-${i}`, targetType: 'seed',
      createdAt: new Date(base + i * 120000), // even steps
    })
    loginLogRows.push({
      userId: logUser.id, email: logUser.email, ipAddress: '127.0.0.1',
      deviceType: 'b3seed', success: i % 2 === 0,
      createdAt: new Date(base + i * 120000 + 60000), // interleaved between admin rows
    })
  }
  await prisma.adminLog.createMany({ data: adminLogRows })
  await prisma.loginLog.createMany({ data: loginLogRows })

  const page2 = await api(adminCj, 'GET', '/api/admin/logs?type=all&page=2&limit=50&search=b3seed')
  // Recompute expected from DB (row ids are generated server-side)
  const seededAdmin = await prisma.adminLog.findMany({ where: { action: { contains: 'b3seed' } } })
  const seededLogin = await prisma.loginLog.findMany({ where: { deviceType: { contains: 'b3seed' } } })
  const merged = [
    ...seededAdmin.map((r) => ({ type: 'admin', id: r.id, createdAt: r.createdAt.getTime() })),
    ...seededLogin.map((r) => ({ type: 'login', id: r.id, createdAt: r.createdAt.getTime() })),
  ].sort((x, y) => y.createdAt - x.createdAt)
  const expectedSlice = merged.slice(50, 100).map((r) => `${r.type}:${r.id}`)
  const gotSlice = (page2.json?.data?.logs || []).map((r) => `${r.type}:${r.id}`)
  check('F-12 P1: type=all page 2 equals merged ordering rows 51-100',
    JSON.stringify(gotSlice) === JSON.stringify(expectedSlice),
    `got ${gotSlice.length} rows; match=${JSON.stringify(gotSlice) === JSON.stringify(expectedSlice)}`)
  check('F-12 P2: counts + totalPages correct for filtered view',
    page2.json?.data?.counts?.admin === 60 && page2.json?.data?.counts?.login === 60 && page2.json?.data?.totalPages === 3,
    `admin=${page2.json?.data?.counts?.admin} login=${page2.json?.data?.counts?.login} tp=${page2.json?.data?.totalPages}`)
  // Cross-page integrity: no duplicates/skips across pages 1..3
  const page1 = await api(adminCj, 'GET', '/api/admin/logs?type=all&page=1&limit=50&search=b3seed')
  const page3 = await api(adminCj, 'GET', '/api/admin/logs?type=all&page=3&limit=50&search=b3seed')
  const allIds = [
    ...((page1.json?.data?.logs) || []).map((r) => `${r.type}:${r.id}`),
    ...gotSlice,
    ...((page3.json?.data?.logs) || []).map((r) => `${r.type}:${r.id}`),
  ]
  check('F-12 P3: pages 1..3 partition ALL filtered logs without duplicates or skips',
    allIds.length === merged.length && new Set(allIds).size === merged.length &&
    JSON.stringify([...allIds].sort()) === JSON.stringify([...merged.map((r) => `${r.type}:${r.id}`)].sort()),
    `collected=${allIds.length} expected=${merged.length}`)

  // ═══════════════ Business fixture for F-13/14/15/16/19 ═══════════════
  const b1Email = `biz.one.${stamp}@test.ezy`
  const b1Reg = await registerBusiness(b1Email, 'One Inc')
  check('B1: business #1 registered (pending_verification)', b1Reg.status === 201, `status=${b1Reg.status}`)
  const b1 = await prisma.user.findUnique({ where: { email: b1Email } })

  // ═══════════════ F-13: draft-only campaigns ═══════════════
  const src = readFileSync(`${PROJECT}/src/components/business/business-campaigns.tsx`, 'utf8')
  check('F-13 C1: no more real-time tracking promise', !src.includes('in real time'), "'in real time' removed")
  check('F-13 C2: draft-only copy present', src.includes('not available yet') && src.includes('Save as Draft'), 'copy updated')
  const b1Cj = (await login(b1Email)).cj
  await prisma.customer.create({ data: { businessId: b1.id, email: `cust.${stamp}@example.com`, name: 'Cust One' } })
  const cust = await prisma.customer.findFirst({ where: { businessId: b1.id } })
  const campRes = await api(b1Cj, 'POST', '/api/business/campaigns', {
    subject: 'B3 draft campaign', body: 'hello', recipientCustomerIds: [cust.id],
  })
  check('F-13 C3: campaign create leaves sentAt null (draft) and API unchanged',
    campRes.status === 201 && campRes.json?.campaign?.sentAt === null, `status=${campRes.status}`)

  // ═══════════════ F-14: self-service business deletion ═══════════════
  const delRes = await api(b1Cj, 'DELETE', '/api/business/profile')
  check('F-14 D1: DELETE /api/business/profile succeeds (was 405)', delRes.status === 200, `status=${delRes.status}`)
  const b1Sessions = await prisma.session.count({ where: { userId: b1.id } })
  check('F-14 D2: all sessions revoked on deletion', b1Sessions === 0, `sessions=${b1Sessions}`)
  const b1Me = await api(b1Cj, 'GET', '/api/auth/me')
  check('F-14 D3: old cookie dead immediately (getSession rejects soft-deleted)', b1Me.status === 401, `status=${b1Me.status}`)
  const b1Relogin = await login(b1Email)
  check('F-14 D4: soft-deleted business cannot log in', b1Relogin.res.status === 403 && (b1Relogin.res.json?.error || '').includes('deleted'),
    `status=${b1Relogin.res.status}`)
  const b1Fresh = await prisma.user.findUnique({ where: { email: b1Email } })
  check('F-14 D5: deletion stamps softDeletedAt + 30-day reservation',
    Boolean(b1Fresh.softDeletedAt) && Boolean(b1Fresh.emailReservedUntil) && b1Fresh.emailReservedUntil > new Date(),
    'reserved 30d')
  const b1ReReg = await registerBusiness(b1Email, 'Squatter')
  check('F-14 D6: address still held during the reservation window (409)', b1ReReg.status === 409, `status=${b1ReReg.status}`)
  const b1Avail = await api(jar(), 'GET', `/api/business/check-email?email=${encodeURIComponent(b1Email)}`)
  check('F-16 R1: check-email reports unavailable during reservation', b1Avail.json?.available === false, `avail=${b1Avail.json?.available}`)

  // ═══════════════ F-15: real verification documents ═══════════════
  const b2Email = `biz.two.${stamp}@test.ezy`
  const b2Reg = await registerBusiness(b2Email, 'Two GmbH')
  check('B2: business #2 registered', b2Reg.status === 201, `status=${b2Reg.status}`)
  const b2 = await prisma.user.findUnique({ where: { email: b2Email } })
  const b2Cj = (await login(b2Email)).cj

  const badType = await api(b2Cj, 'POST', '/api/business/verification', {
    documents: [{ name: 'evil.exe', type: 'application/octet-stream', size: 10, data: 'data:application/octet-stream;base64,AAA' }],
  })
  check('F-15 V1: disallowed document type rejected (400)', badType.status === 400, `status=${badType.status}`)
  const badProto = await api(b2Cj, 'POST', '/api/business/verification', {
    documents: [{ name: 'cert.pdf', type: 'application/pdf', size: 10, data: 'not-a-data-url' }],
  })
  check('F-15 V2: fabricated/broken base64 payload rejected (400)', badProto.status === 400, `status=${badProto.status}`)

  const goodDocs = await api(b2Cj, 'POST', '/api/business/verification', {
    documents: [{ name: 'cert.png', type: 'image/png', size: 70, data: `data:image/png;base64,${PNG_B64}` }],
    documentUrls: ['https://example.com/registration.pdf'],
  })
  check('F-15 V3: real file + link submission accepted (201)', goodDocs.status === 201, `status=${goodDocs.status}`)

  const docsAsAdmin = await api(adminCj, 'GET', `/api/admin/business-verifications/${goodDocs.json.id}/documents`)
  const docsList = docsAsAdmin.json?.documents || []
  check('F-15 V4: admin documents endpoint returns file bytes + url entries',
    docsAsAdmin.status === 200 &&
    docsList.some((d) => d.kind === 'file' && d.dataUrl && d.dataUrl.startsWith('data:image/png;base64,')) &&
    docsList.some((d) => d.kind === 'url' && d.url === 'https://example.com/registration.pdf'),
    `entries=${docsList.length}`)
  const docsAsBiz = await api(b2Cj, 'GET', `/api/admin/business-verifications/${goodDocs.json.id}/documents`)
  check('F-15 V5: documents endpoint admin-only (403 for the business itself)', docsAsBiz.status === 403, `status=${docsAsBiz.status}`)

  const adminList = await api(adminCj, 'GET', '/api/admin/business-verifications?limit=50')
  const row = (adminList.json?.verifications || []).find((v) => v.id === goodDocs.json.id)
  let stripped = true
  try {
    const parsed = JSON.parse(row?.documentUrls || '[]')
    stripped = parsed.every((e) => e.kind !== 'file' || !('data' in e))
  } catch { stripped = false }
  check('F-15 V6: admin LIST payload strips file content (light rows)', stripped && Boolean(row), `rowFound=${Boolean(row)}`)

  // ═══════════════ F-16: subscription enforcement ═══════════════
  await prisma.user.update({ where: { id: b2.id }, data: { subscriptionStatus: 'expired' } })
  const cust403 = await api(b2Cj, 'GET', '/api/business/customers')
  const camp403 = await api(b2Cj, 'POST', '/api/business/campaigns', { subject: 'x', body: 'y', recipientCustomerIds: [] })
  const team403 = await api(b2Cj, 'GET', '/api/business/team')
  const analytics403 = await api(b2Cj, 'GET', '/api/business/analytics')
  const prof200 = await api(b2Cj, 'GET', '/api/business/profile')
  const verif200 = await api(b2Cj, 'GET', '/api/business/verification')
  check('F-16 G1: expired business blocked from customers (403)',
    cust403.status === 403 && (cust403.json?.error || '').includes('expired'), `status=${cust403.status}`)
  check('F-16 G2: expired business blocked from campaigns POST (403)',
    camp403.status === 403 && (camp403.json?.error || '').includes('expired'), `status=${camp403.status}`)
  check('F-16 G3: expired business blocked from team (403)',
    team403.status === 403 && (team403.json?.error || '').includes('expired'), `status=${team403.status}`)
  check('F-16 G4: expired business blocked from analytics (403)',
    analytics403.status === 403 && (analytics403.json?.error || '').includes('expired'), `status=${analytics403.status}`)
  check('F-16 G5: profile still visible to expired business (200)', prof200.status === 200, `status=${prof200.status}`)
  check('F-16 G6: verification status still visible (200)', verif200.status === 200, `status=${verif200.status}`)

  // Reservation release after the window passes (F-16, covers F-14 D6 squatter)
  await prisma.user.update({
    where: { id: b1.id },
    data: { emailReservedUntil: new Date(Date.now() - 60000) }, // window elapsed
  })
  const b1AvailAfter = await api(jar(), 'GET', `/api/business/check-email?email=${encodeURIComponent(b1Email)}`)
  check('F-16 R2: check-email reports available after the window', b1AvailAfter.json?.available === true, `avail=${b1AvailAfter.json?.available}`)
  const b1NewReg = await registerBusiness(b1Email, 'Successor Ltd')
  check('F-16 R3: released address registrable by a NEW business', b1NewReg.status === 201, `status=${b1NewReg.status}`)
  const stale = await prisma.user.findFirst({ where: { id: b1.id } })
  check('F-16 R4: stale row freed without deletion (unique columns rewritten, data kept)',
    stale.email !== b1Email && stale.businessEmail !== b1Email && stale.softDeletedAt !== null, `newEmail=${stale.email}`)

  // ═══════════════ F-19: trial granted once ═══════════════
  const b3Email = `biz.three.${stamp}@test.ezy`
  await registerBusiness(b3Email, 'Three LLC')
  const b3 = await prisma.user.findUnique({ where: { email: b3Email } })
  const b3Cj = (await login(b3Email)).cj
  const b3Submit = await api(b3Cj, 'POST', '/api/business/verification', {
    documents: [{ name: 'license.png', type: 'image/png', size: 70, data: `data:image/png;base64,${PNG_B64}` }],
  })
  check('F-19 T1: first verification submission accepted', b3Submit.status === 201, `status=${b3Submit.status}`)
  const b3Approve = await api(adminCj, 'PUT', `/api/admin/business-verifications/${b3Submit.json.id}`, {
    action: 'approve', adminNotes: 'ok',
  })
  const b3After = await prisma.user.findUnique({ where: { email: b3Email } })
  check('F-19 T2: first approval starts the trial', b3Approve.status === 200 && b3After.subscriptionStatus === 'trial',
    `status=${b3Approve.status} sub=${b3After.subscriptionStatus}`)
  const trialEndBefore = b3After.trialEnd

  const b3Resubmit = await api(b3Cj, 'POST', '/api/business/verification', {
    documents: [{ name: 'license2.png', type: 'image/png', size: 70, data: `data:image/png;base64,${PNG_B64}` }],
  })
  check('F-19 T3: resubmission resets the row to pending', b3Resubmit.status === 201, `status=${b3Resubmit.status}`)
  const b3Approve2 = await api(adminCj, 'PUT', `/api/admin/business-verifications/${b3Submit.json.id}`, { action: 'approve' })
  const b3After2 = await prisma.user.findUnique({ where: { email: b3Email } })
  check('F-19 T4: second approval refused 409 — trial never restarts',
    b3Approve2.status === 409 && b3After2.trialEnd.getTime() === trialEndBefore.getTime() && b3After2.subscriptionStatus === 'trial',
    `status=${b3Approve2.status} trialEndUnchanged=${b3After2.trialEnd.getTime() === trialEndBefore.getTime()}`)

  // approve on 'active' and 'expired' businesses (resubmit makes the row pending again)
  await prisma.user.update({ where: { id: b3.id }, data: { subscriptionStatus: 'active' } })
  await api(b3Cj, 'POST', '/api/business/verification', { documentUrls: ['https://example.com/again.pdf'] })
  const approveActive = await api(adminCj, 'PUT', `/api/admin/business-verifications/${b3Submit.json.id}`, { action: 'approve' })
  check('F-19 T5: approval refused on an ACTIVE subscription (409)', approveActive.status === 409, `status=${approveActive.status}`)
  await prisma.user.update({ where: { id: b3.id }, data: { subscriptionStatus: 'expired' } })
  await api(b3Cj, 'POST', '/api/business/verification', { documentUrls: ['https://example.com/again2.pdf'] })
  const approveExpired = await api(adminCj, 'PUT', `/api/admin/business-verifications/${b3Submit.json.id}`, { action: 'approve' })
  check('F-19 T6: approval refused on an EXPIRED (trial-consumed) business (409)', approveExpired.status === 409, `status=${approveExpired.status}`)

  // Report
  console.log('\n════════ Batch 3 E2E results ════════')
  for (const r of results) console.log(r)
  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`)
  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

run().catch(async (err) => {
  console.error('SUITE CRASH:', err)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
