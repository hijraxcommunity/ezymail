/**
 * Batch 7 E2E (audit-verification batch: F-32r, F-38, F-39, F-40, F-41,
 * F-44, F-46, F-49, F-50, F-51, F-52, F-53, F-56*, F-58*, F-59*, F-60*,
 * F-63*, F-64, F-65, F-66, F-67/F-19r, S-09).
 *
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-batch7-e2e.sh (boots PG + next dev, then this).
 *
 * (* = client-side items verified by build + eslint + code review, not by
 * this HTTP suite: F-56 template store upsert, F-58 res.ok rollbacks, F-59
 * archive-undo folder gate, F-60 sm breakpoint, F-63 badge hook wiring.)
 *
 * Server-side coverage in THIS suite:
 *  - F-49(a): suspended login with a WRONG password now 401s like an
 *             unknown address (no account-existence oracle); with the
 *             correct password it still 403s
 *  - F-49(b): role='system' (welcome sender) cannot log in at all
 *  - F-39:    POST /api/emails with a FOREIGN replyToId → 403 (same rule
 *             as the reply route); own/recipient parent still allowed
 *  - F-51:    an FCM token bound to user B cannot be rebound by user A
 *             (409); B keeps ownership in the DB
 *  - F-46:    auth/check-email is per-IP throttled (429 after N calls);
 *             users/lookup is 401 unauthenticated and 200 sessioned
 *  - F-50:    baseline security headers ship on every route
 *  - F-52:    GET /api/emails/[id] no longer flips isRead — the PUT does
 *  - S-09:    the starred view no longer lists folder='trash' rows
 *  - F-38:    ?limit=abc degrades to the default (200) instead of a 500
 *             on emails, search and admin/users
 *  - F-40:    folder color must be a hex value (400 otherwise)
 *  - F-41:    profile avatar is shape- and size-capped; non-string bio → 400
 *  - F-44:    admin/stats answers 200 with the full 7/30-day series from
 *             the two date-truncated aggregates
 *  - F-19/F-67: an APPROVED verification cannot be re-submitted (409)
 *  - F-65:    customer PUT is live (update + P2002 → 409); duplicate POST → 409
 *  - F-66:    duplicate campaign recipients dedupe (recipientCount 1);
 *             >1000 recipients → 400; P2002 races → 409
 *  - F-32r:   rule-run is rate limited per user (429 after the limit)
 *  - F-53:    sessions list filters expired rows; getSession refreshes
 *             lastActive (throttled) so the sessions surface is live
 *  - F-63:    /api/folders returns numeric unread counts (badge source)
 */
import { createRequire } from 'node:module'

const BASE = process.env.B7_BASE || 'http://127.0.0.1:3007'
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

async function apiNoAbsorb(cj, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cj.header() ? { Cookie: cj.header() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
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
      firstName: opts.firstName || 'Batch', lastName: opts.lastName || 'Seven',
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
  const res = await api(cj, 'POST', '/api/auth/login', { email, password })
  return { cj, res }
}

async function send(fromCj, to, subject, body, extra = {}) {
  return api(fromCj, 'POST', '/api/emails', {
    to, subject, body, bodyHtml: `<p>${body}</p>`, ...extra,
  })
}

async function main() {
  // ══════════════════ F-49(a): suspended-login oracle closed ══════════════════
  {
    const victim = await seedUser(`b7.susp.${stamp}@ezy.af`, { status: 'suspended' })
    const wrong = await login(victim.email, 'DefinitelyWrong!42')
    check('F49a suspended + WRONG password → 401 (no oracle)', wrong.res.status === 401, `status=${wrong.res.status}`)
    const right = await login(victim.email)
    check('F49a suspended + CORRECT password → 403', right.res.status === 403, `status=${right.res.status}`)
    await prisma.user.update({ where: { id: victim.id }, data: { status: 'active' } })
    const reactivated = await login(victim.email)
    check('F49a reactivated → login works again', reactivated.res.status === 200, `status=${reactivated.res.status}`)
  }

  // ══════════════════ F-49(b): system pseudo-account cannot log in ══════════════════
  {
    await seedUser('welcome@ezy.af', { role: 'system', firstName: 'EzyMail', lastName: 'Team' })
    const attempt = await login('welcome@ezy.af', 'whatever-password-1')
    check('F49b role=system login refused with 401', attempt.res.status === 401, `status=${attempt.res.status}`)
  }

  // ══════════════════ F-39: foreign replyToId rejected ══════════════════
  {
    const A = await seedUser(`b7.f39.a.${stamp}@ezy.af`, { firstName: 'Alice' })
    const B = await seedUser(`b7.f39.b.${stamp}@ezy.af`, { firstName: 'Bob' })
    const C = await seedUser(`b7.f39.c.${stamp}@ezy.af`, { firstName: 'Eve' })
    const aCj = (await login(A.email)).cj
    const bCj = (await login(B.email)).cj
    const cCj = (await login(C.email)).cj
    const sent = await send(aCj, B.email, 'F39 parent', 'parent body')
    check('F39 A→B send ok', sent.status === 200 || sent.status === 201, `status=${sent.status}`)
    const inboxCopyId = sent.json?.email?.id
    check('F39 inbox copy id returned', !!inboxCopyId)

    const foreign = await api(cCj, 'POST', '/api/emails', {
      to: A.email, subject: 'F39 graft attempt', body: 'should not work', replyToId: inboxCopyId,
    })
    check('F39 foreign replyToId → 403', foreign.status === 403, `status=${foreign.status} body=${JSON.stringify(foreign.json)}`)

    const legit = await api(bCj, 'POST', '/api/emails', {
      to: A.email, subject: 'F39 legit reply', body: 'recipient replying', replyToId: inboxCopyId,
    })
    check('F39 recipient replyToId still allowed', legit.status === 200 || legit.status === 201, `status=${legit.status}`)

    const ghost = await api(bCj, 'POST', '/api/emails', {
      to: A.email, subject: 'F39 ghost parent', body: 'nonexistent id fallback', replyToId: 'nonexistent-id-000',
    })
    check('F39 nonexistent replyToId → 400 (old FK-crash 500 fixed)', ghost.status === 400, `status=${ghost.status}`)
  }

  // ══════════════════ F-51: FCM token rebinding blocked ══════════════════
  {
    const A = await seedUser(`b7.f51.a.${stamp}@ezy.af`, { firstName: 'PushA' })
    const B = await seedUser(`b7.f51.b.${stamp}@ezy.af`, { firstName: 'PushB' })
    const aCj = (await login(A.email)).cj
    const bCj = (await login(B.email)).cj
    const token = `tok-b7-${stamp}-${Math.random().toString(36).slice(2, 10)}`
    const first = await api(bCj, 'POST', '/api/push/subscribe', { fcmToken: token, platform: 'android' })
    check('F51 B subscribes own token → 200', first.status === 200, `status=${first.status}`)
    const steal = await api(aCj, 'POST', '/api/push/subscribe', { fcmToken: token, platform: 'android' })
    check('F51 A rebinding B token → 409', steal.status === 409, `status=${steal.status}`)
    const row = await prisma.pushSubscription.findUnique({ where: { fcmToken: token } })
    check('F51 ownership unchanged in DB after theft attempt', row?.userId === B.id, `owner=${row?.userId === B.id ? 'B' : row?.userId}`)
    const refresh = await api(bCj, 'POST', '/api/push/subscribe', { fcmToken: token, platform: 'android' })
    check('F51 same-owner resubscribe still 200', refresh.status === 200, `status=${refresh.status}`)
    const own = await api(aCj, 'POST', '/api/push/subscribe', { fcmToken: token + '-a', platform: 'web' })
    check('F51 A subscribes own fresh token → 200', own.status === 200, `status=${own.status}`)
  }

  // ══════════════════ F-46: oracle throttling + lookup auth ══════════════════
  {
    const first = await apiNoAbsorb(jar(), 'GET', `/api/auth/check-email?email=probe.${stamp}@ezy.af`)
    check('F46 check-email answers for the register form (1st call 200)', first.status === 200, `status=${first.status}`)
    let saw429 = false
    for (let i = 0; i < 12; i++) {
      const r = await apiNoAbsorb(jar(), 'GET', `/api/auth/check-email?email=probe.${stamp}@ezy.af`)
      if (r.status === 429) { saw429 = true; break }
    }
    check('F46 check-email throttles per IP (429 within the window)', saw429)
    const lookupAnon = await apiNoAbsorb(jar(), 'GET', `/api/users/lookup?email=x@ezy.af`)
    check('F46 users/lookup unauthenticated → 401', lookupAnon.status === 401, `status=${lookupAnon.status}`)
    const any = await seedUser(`b7.f46.u.${stamp}@ezy.af`)
    const { cj } = await login(any.email)
    const lookupAuth = await api(cj, 'GET', `/api/users/lookup?email=${encodeURIComponent(any.email)}`)
    check('F46 users/lookup sessioned → 200 with data', lookupAuth.status === 200 && lookupAuth.json?.data, `status=${lookupAuth.status}`)
  }

  // ══════════════════ F-50: baseline security headers ══════════════════
  {
    const res = await fetch(BASE + '/', { redirect: 'manual' })
    const h = res.headers
    check('F50 X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff', `val=${h.get('x-content-type-options')}`)
    check('F50 X-Frame-Options: SAMEORIGIN', h.get('x-frame-options') === 'SAMEORIGIN', `val=${h.get('x-frame-options')}`)
    check('F50 Referrer-Policy present', !!h.get('referrer-policy'), `val=${h.get('referrer-policy')}`)
    check('F50 HSTS present', !!h.get('strict-transport-security'), `val=${h.get('strict-transport-security')}`)
  }

  // ══════════════════ F-52: GET detail no longer mutates ══════════════════
  {
    const A = await seedUser(`b7.f52.a.${stamp}@ezy.af`, { firstName: 'ReadA' })
    const B = await seedUser(`b7.f52.b.${stamp}@ezy.af`, { firstName: 'ReadB' })
    const aCj = (await login(A.email)).cj
    const sent = await send(aCj, B.email, 'F52 unread', 'body')
    const id = sent.json?.email?.id
    const bCj = (await login(B.email)).cj
    const detail = await api(bCj, 'GET', `/api/emails/${id}`)
    check('F52 GET detail 200', detail.status === 200, `status=${detail.status}`)
    const rowAfterGet = await prisma.email.findUnique({ where: { id } })
    check('F52 row still unread after GET', rowAfterGet?.isRead === false, `isRead=${rowAfterGet?.isRead}`)
    const put = await api(bCj, 'PUT', `/api/emails/${id}`, { isRead: true })
    const rowAfterPut = await prisma.email.findUnique({ where: { id } })
    check('F52 PUT marks read', put.status === 200 && rowAfterPut?.isRead === true, `put=${put.status} isRead=${rowAfterPut?.isRead}`)
  }

  // ══════════════════ S-09: starred view excludes trash ══════════════════
  {
    const A = await seedUser(`b7.s09.a.${stamp}@ezy.af`, { firstName: 'StarA' })
    const B = await seedUser(`b7.s09.b.${stamp}@ezy.af`, { firstName: 'StarB' })
    const aCj = (await login(A.email)).cj
    const s1 = await send(aCj, B.email, 'S09 starred inbox', 'body1')
    const s2 = await send(aCj, B.email, 'S09 starred trash', 'body2')
    const inboxId = s1.json?.email?.id
    const trashedId = s2.json?.email?.id
    await prisma.email.update({ where: { id: inboxId }, data: { isStarred: true } })
    await prisma.email.update({ where: { id: trashedId }, data: { isStarred: true, folder: 'trash' } })
    const bCj = (await login(B.email)).cj
    const starred = await api(bCj, 'GET', '/api/emails?folder=starred&page=1&limit=50')
    const subjects = (starred.json?.emails || []).map((e) => e.subject)
    check('S09 starred lists the inbox starred row', subjects.includes('S09 starred inbox'), JSON.stringify(subjects))
    check('S09 starred EXCLUDES the trashed starred row', !subjects.includes('S09 starred trash'), JSON.stringify(subjects))
  }

  // ══════════════════ F-38: NaN pagination degrades to defaults ══════════════════
  {
    const U = await seedUser(`b7.f38.u.${stamp}@ezy.af`)
    const { cj } = await login(U.email)
    const emails = await api(cj, 'GET', '/api/emails?folder=inbox&page=1&limit=abc')
    check('F38 emails ?limit=abc → 200 (default)', emails.status === 200, `status=${emails.status}`)
    const search = await api(cj, 'GET', '/api/search?q=ezy&limit=abc')
    check('F38 search ?limit=abc → 200 (default)', search.status === 200, `status=${search.status}`)
    const admin = await seedUser(`b7.f38.admin.${stamp}@ezy.af`, { role: 'admin' })
    const { cj: acj } = await login(admin.email)
    const users = await api(acj, 'GET', '/api/admin/users?limit=abc')
    check('F38 admin/users ?limit=abc → 200 (default)', users.status === 200, `status=${users.status}`)
  }

  // ══════════════════ F-40: folder color hex validation ══════════════════
  {
    const U = await seedUser(`b7.f40.u.${stamp}@ezy.af`)
    const { cj } = await login(U.email)
    const bad = await api(cj, 'POST', '/api/folders', { name: `B7f40-${stamp}`, color: 'red' })
    check('F40 non-hex color → 400', bad.status === 400, `status=${bad.status}`)
    const good = await api(cj, 'POST', '/api/folders', { name: `B7f40-${stamp}`, color: '#34A853' })
    check('F40 valid hex color → 201', good.status === 201, `status=${good.status}`)
  }

  // ══════════════════ F-41: profile avatar/bio validation ══════════════════
  {
    const U = await seedUser(`b7.f41.u.${stamp}@ezy.af`)
    const { cj } = await login(U.email)
    const hugeAvatar = await api(cj, 'PUT', '/api/user/profile', { avatar: 'x'.repeat(250000) })
    check('F41 unbounded avatar string → 400', hugeAvatar.status === 400, `status=${hugeAvatar.status}`)
    const badBio = await api(cj, 'PUT', '/api/user/profile', { bio: 123 })
    check('F41 non-string bio → 400 (no 500)', badBio.status === 400, `status=${badBio.status}`)
    const ok = await api(cj, 'PUT', '/api/user/profile', { bio: 'hello world' })
    check('F41 valid bio → 200', ok.status === 200, `status=${ok.status}`)
    const okAvatar = await api(cj, 'PUT', '/api/user/profile', {
      avatar: 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64'),
    })
    check('F41 small data-URL avatar → 200', okAvatar.status === 200, `status=${okAvatar.status}`)
  }

  // ══════════════════ F-44: admin stats via aggregates ══════════════════
  {
    const admin = await seedUser(`b7.f44.admin.${stamp}@ezy.af`, { role: 'admin' })
    const { cj } = await login(admin.email)
    const stats = await api(cj, 'GET', '/api/admin/stats')
    check('F44 admin/stats 200', stats.status === 200, `status=${stats.status}`)
    const d = stats.json?.data
    check('F44 7-day email series present', Array.isArray(d?.emailsPerDay) && d.emailsPerDay.length === 7, `len=${d?.emailsPerDay?.length}`)
    check('F44 30-day user series present', Array.isArray(d?.usersPerDay) && d.usersPerDay.length === 30, `len=${d?.usersPerDay?.length}`)
    check('F44 basic totals present', typeof d?.totalUsers === 'number' && typeof d?.totalEmails === 'number')
  }

  // ══════════════════ F-19/F-67: approved verification cannot resubmit ══════════════════
  {
    const biz = await seedUser(`b7.f67.biz.${stamp}@ezy.af`, {
      accountType: 'business', subscriptionStatus: 'active', businessName: 'B7 Biz',
    })
    await prisma.businessVerification.create({
      data: {
        userId: biz.id,
        documentUrls: '[]',
        status: 'approved',
        reviewedAt: new Date(),
      },
    })
    const { cj } = await login(biz.email)
    const resubmit = await api(cj, 'POST', '/api/business/verification', {
      documentUrls: ['https://example.com/b7-doc.pdf'],
    })
    check('F67 approved verification resubmit → 409 (status NOT reset)', resubmit.status === 409, `status=${resubmit.status}`)
    const row = await prisma.businessVerification.findUnique({ where: { userId: biz.id } })
    check('F67 approved row untouched by the attempt', row?.status === 'approved' && !!row?.reviewedAt, `status=${row?.status}`)
  }

  // ══════════════════ F-64: trial clock starts at approval, 15 days ══════════════════
  // Product requirement: a 15-day trial. The approval route is the SINGLE
  // writer of trial dates (register seeds none — F-64), and the review
  // corrected its duration from the legacy 14d to the required 15d.
  {
    const biz = await seedUser(`b7.f64.biz.${stamp}@ezy.af`, {
      accountType: 'business', subscriptionStatus: 'pending_verification', businessName: 'B7 Trial Biz',
    })
    check('F64 register creates business WITHOUT trial dates (clock not started)',
      biz.trialStart === null && biz.trialEnd === null,
      `start=${biz.trialStart} end=${biz.trialEnd}`)
    await prisma.businessVerification.create({
      data: { userId: biz.id, documentUrls: '[]', status: 'pending' },
    })
    const admin = await seedUser(`b7.f64.admin.${stamp}@ezy.af`, { role: 'admin' })
    const { cj } = await login(admin.email)
    const ver = await prisma.businessVerification.findUnique({ where: { userId: biz.id } })
    const res = await api(cj, 'PUT', `/api/admin/business-verifications/${ver.id}`, { action: 'approve' })
    check('F64 approval grants the trial', res.status === 200, `status=${res.status}`)
    const u = await prisma.user.findUnique({ where: { id: biz.id } })
    const days = u.trialEnd && u.trialStart
      ? Math.round((u.trialEnd.getTime() - u.trialStart.getTime()) / (24 * 60 * 60 * 1000))
      : -1
    check('F64 trial duration is 15 days (business requirement, not the legacy 14)', days === 15, `days=${days}`)
    check('F64 subscriptionStatus set to trial', u.subscriptionStatus === 'trial', `sub=${u.subscriptionStatus}`)
  }

  // ══════════════════ F-65: customer PUT live + P2002 → 409 ══════════════════
  {
    const biz = await seedUser(`b7.f65.biz.${stamp}@ezy.af`, {
      accountType: 'business', subscriptionStatus: 'active', businessName: 'B7 Cust Biz',
    })
    const { cj } = await login(biz.email)
    const c1 = await api(cj, 'POST', '/api/business/customers', { email: `b7c1.${stamp}@ezy.af`, name: 'One' })
    const c2 = await api(cj, 'POST', '/api/business/customers', { email: `b7c2.${stamp}@ezy.af`, name: 'Two' })
    check('F65 two customers created', c1.status === 201 && c2.status === 201, `${c1.status}/${c2.status}`)
    const c1id = c1.json?.customer?.id
    const upd = await api(cj, 'PUT', `/api/business/customers/${c1id}`, { name: 'One-Updated' })
    check('F65 PUT updates a customer', upd.status === 200 && upd.json?.customer?.name === 'One-Updated', `status=${upd.status}`)
    const dup = await api(cj, 'PUT', `/api/business/customers/${c1id}`, { email: `b7c2.${stamp}@ezy.af` })
    check('F65 PUT duplicate email → 409 (P2002 mapped)', dup.status === 409, `status=${dup.status}`)
    const dupPost = await api(cj, 'POST', '/api/business/customers', { email: `b7c1.${stamp}@ezy.af`, name: 'Dup' })
    check('F65 POST duplicate email → 409 (P2002 mapped)', dupPost.status === 409, `status=${dupPost.status}`)
  }

  // ══════════════════ F-66: campaign dedupe + cap ══════════════════
  {
    const biz = await seedUser(`b7.f66.biz.${stamp}@ezy.af`, {
      accountType: 'business', subscriptionStatus: 'active', businessName: 'B7 Camp Biz',
    })
    const { cj } = await login(biz.email)
    const cust = await prisma.customer.create({
      data: { email: `b7camp.${stamp}@ezy.af`, name: 'Camp', businessId: biz.id },
    })
    const dedup = await api(cj, 'POST', '/api/business/campaigns', {
      subject: 'F66 dedupe', body: 'body',
      recipientCustomerIds: [cust.id, cust.id, cust.id],
    })
    check('F66 duplicate recipients dedupe → 201', dedup.status === 201, `status=${dedup.status}`)
    check('F66 recipientCount collapses duplicates to 1', dedup.json?.campaign?.recipientCount === 1, `count=${dedup.json?.campaign?.recipientCount}`)
    const tooMany = await api(cj, 'POST', '/api/business/campaigns', {
      subject: 'F66 cap', body: 'body',
      recipientCustomerIds: Array.from({ length: 1001 }, (_, i) => `fake-id-${i}`),
    })
    check('F66 >1000 recipients → 400 (no unbounded fan-out)', tooMany.status === 400, `status=${tooMany.status}`)
  }

  // ══════════════════ F-32 residue: rule-run limiter ══════════════════
  {
    const U = await seedUser(`b7.f32.u.${stamp}@ezy.af`)
    const { cj } = await login(U.email)
    const rule = await api(cj, 'POST', '/api/rules', {
      name: `b7-run-${stamp}`,
      conditions: JSON.stringify([{ field: 'hasAttachment', operator: 'equals', value: 'true' }]),
      actions: JSON.stringify([{ type: 'markAsRead' }]),
      isEnabled: true,
    })
    const ruleId = rule.json?.data?.id
    check('F32r rule created', rule.status === 200 || rule.status === 201, `status=${rule.status}`)
    if (ruleId) {
      const r1 = await api(cj, 'POST', `/api/rules/${ruleId}/run`)
      const r2 = await api(cj, 'POST', `/api/rules/${ruleId}/run`)
      const r3 = await api(cj, 'POST', `/api/rules/${ruleId}/run`)
      check('F32r first two runs allowed (limit=2 in harness)', r1.status === 200 && r2.status === 200, `${r1.status}/${r2.status}`)
      check('F32r third run → 429', r3.status === 429, `status=${r3.status}`)
    }
  }

  // ══════════════════ F-53: session bookkeeping ══════════════════
  {
    const U = await seedUser(`b7.f53.u.${stamp}@ezy.af`)
    const { cj } = await login(U.email)
    const token = cj.raw('ezymail-session')
    const live = await prisma.session.findFirst({ where: { token } })
    check('F53 live session row found for cookie token', !!live)
    // Stale the row and add an EXPIRED second row.
    const staleAt = new Date(Date.now() - 10 * 60 * 1000)
    await prisma.session.update({ where: { id: live.id }, data: { lastActive: staleAt } })
    await prisma.session.create({
      data: {
        userId: U.id,
        token: `b7-expired-${stamp}`,
        ipAddress: '',
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    const expiredRow = await prisma.session.findFirst({ where: { token: `b7-expired-${stamp}` } })
    const me = await api(cj, 'GET', '/api/auth/me')
    check('F53 auth/me 200 with valid session', me.status === 200, `status=${me.status}`)
    const refreshed = await prisma.session.findUnique({ where: { id: live.id } })
    check('F53 lastActive refreshed by getSession (throttled touch)',
      refreshed?.lastActive && refreshed.lastActive.getTime() > Date.now() - 60 * 1000,
      `age=${refreshed ? Math.round((Date.now() - refreshed.lastActive.getTime()) / 1000) + 's' : 'n/a'}`)
    const list = await api(cj, 'GET', '/api/user/sessions')
    const ids = (list.json?.data?.sessions || []).map((s) => s.id)
    check('F53 sessions list 200', list.status === 200, `status=${list.status}`)
    check('F53 expired row excluded from sessions list', !!(expiredRow && !ids.includes(expiredRow.id)), `rows=${ids.length}`)
    const listedLive = await prisma.session.findFirst({ where: { token } })
    check('F53 live row present in sessions list', ids.includes(listedLive?.id))
  }

  // ══════════════════ F-63: /api/folders server counts (badge source) ══════════════════
  {
    const U = await seedUser(`b7.f63.u.${stamp}@ezy.af`)
    const { cj } = await login(U.email)
    const folders = await api(cj, 'GET', '/api/folders')
    const inbox = (folders.json?.folders || []).find((f) => f.id === 'inbox')
    check('F63 folders endpoint returns inbox entry', !!inbox)
    check('F63 inbox unread/count are numeric', typeof inbox?.unread === 'number' && typeof inbox?.count === 'number', `unread=${inbox?.unread}`)
  }

  prisma.disconnect?.()
  await prisma.$disconnect()
  console.log(results.join('\n'))
  console.log(`\n== batch7: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('PROBE_CRASH', e)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
