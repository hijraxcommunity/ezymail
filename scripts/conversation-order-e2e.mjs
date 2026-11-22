/**
 * Conversation-order regression (owner report 2026-11-22: a thread rendered
 * its relative times as 23m / 1m / 26m / 3m mixed).
 *
 * ROOT CAUSE: GET /api/emails/[id] resolved the viewer's own sent twins in a
 * separate UNORDERED query and APPENDED them to the createdAt-ordered array
 * before dedupe — and dedupeThreadForViewer PRESERVES INPUT ORDER while
 * preferring the viewer's copy — so every outgoing message's kept row sat
 * AFTER all incoming rows, in arbitrary twin-fetch order. FIX: the deduped
 * thread is sorted ONCE by the authoritative instant (sentAt ?? createdAt,
 * ties by createdAt then id) at the single ordering point the detail view
 * renders.
 *
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-conversation-order-e2e.sh
 *
 * Covers the owner spec's ten scenarios:
 *  S1/S2  multiple replies at different times — oldest at top, newest at
 *         bottom, every reply in its chronological position
 *  S3     a NEW reply (real API POST) lands last without rearranging older rows
 *  S4     expanded/collapsed states share ONE ordered array (the client
 *         renders a single map over the API order and never re-sorts; the
 *         auto-expand "latest" pick reads thread[length-1] — asserted newest)
 *  S5     refreshing the conversation preserves the order (two GETs identical)
 *  S6     equal sentAt timestamps resolve deterministically (createdAt, then id)
 *  S7     incoming AND outgoing rows in one thread, verified from BOTH viewers
 *         (the sender's view exercises the twin-append path, the recipient's
 *         view the plain path)
 *  S8     missing timestamps (sentAt=null legacy rows) fall back to createdAt
 *         safely; Postgres DateTime columns are typed so a malformed value
 *         cannot be stored — the comparator additionally NaN-guards (0-bucket)
 *  S9     twin/quoted pairing never duplicates a logical thread message
 *  S10    inbox list surface untouched: rows present, createdAt-desc intact
 * Plus: a dispatched-scheduled row positions by sentAt (the dispatch instant),
 *       NOT by createdAt (the scheduling instant).
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const BASE = 'http://127.0.0.1:3005'
const PROJECT = '/home/z/my-project'
const require = createRequire(PROJECT + '/package.json')
const { PrismaClient } = require(PROJECT + '/node_modules/@prisma/client')
const bcrypt = require(PROJECT + '/node_modules/bcryptjs')

const prisma = new PrismaClient()

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

async function seedUser(email, first, last) {
  const id = `u_ord_${Math.random().toString(36).slice(2, 10)}`
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: bcrypt.hashSync('TestPass!123', 4) },
    create: { id, email, passwordHash: bcrypt.hashSync('TestPass!123', 4), firstName: first, lastName: last, dateOfBirth: '1990-05-10', role: 'user' },
  })
  return prisma.user.findUnique({ where: { email } })
}

async function login(email) {
  const cj = jar()
  const l = await api(cj, 'POST', '/api/auth/login', { email, password: 'TestPass!123' })
  if (l.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(l.json)}`)
  return cj
}

const run = async () => {
  const stamp = Date.now()
  const aEmail = `ord.a.${stamp}@ezy.af`
  const bEmail = `ord.b.${stamp}@ezy.af`
  const Auser = await seedUser(aEmail, 'Alice', 'Ord')
  const Buser = await seedUser(bEmail, 'Ben', 'Ord')
  const A = await login(aEmail)
  const B = await login(bEmail)

  const ago = (min) => new Date(Date.now() - min * 60 * 1000)
  const subject = `Ordering ${stamp}`
  const mkRow = (over) => prisma.email.create({ data: over })

  // ── Seed a realistic mixed thread. Row shapes mirror the real writer in
  //    POST /api/emails exactly: the anchor inbox copy self-stamps the
  //    thread key, reply inbox copies carry the key, sent copies carry NO
  //    key by design. Direct rows give timestamp control the API cannot. ──
  const m1in = await mkRow({ senderId: Auser.id, recipientEmail: bEmail, subject, body: 'root-26m', folder: 'inbox', sentAt: ago(26), createdAt: ago(26) })
  await prisma.email.update({ where: { id: m1in.id }, data: { threadId: m1in.id } })
  const m1sent = await mkRow({ senderId: Auser.id, recipientEmail: bEmail, subject, body: 'root-26m', folder: 'sent', sentAt: ago(26), createdAt: ago(26) })
  const m2in = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'reply-b-23m', folder: 'inbox', threadId: m1in.id, parentEmailId: m1in.id, sentAt: ago(23), createdAt: ago(23) })
  const m2sent = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'reply-b-23m', folder: 'sent', parentEmailId: m1in.id, sentAt: ago(23), createdAt: ago(23) })
  // S8: legacy row — sentAt never stamped (pre-sentAt-era data), createdAt only.
  const m7in = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'legacy-null-15m', folder: 'inbox', threadId: m1in.id, parentEmailId: m2in.id, sentAt: null, createdAt: ago(15) })
  const m7sent = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'legacy-null-15m', folder: 'sent', parentEmailId: m2in.id, sentAt: null, createdAt: ago(15) })
  const m3in = await mkRow({ senderId: Auser.id, recipientEmail: bEmail, subject, body: 'reply-a-3m', folder: 'inbox', threadId: m1in.id, parentEmailId: m2in.id, sentAt: ago(3), createdAt: ago(3) })
  const m3sent = await mkRow({ senderId: Auser.id, recipientEmail: bEmail, subject, body: 'reply-a-3m', folder: 'sent', parentEmailId: m2in.id, sentAt: ago(3), createdAt: ago(3) })
  // Dispatched-scheduled row: CREATED 10 min ago, actually DELIVERED 90s ago
  // (the dispatch cron stamps sentAt exactly when due). Authoritative
  // position = the delivery instant, not the scheduling instant.
  const m6in = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'sched-90s', folder: 'inbox', threadId: m1in.id, parentEmailId: m3in.id, sentAt: ago(1.5), createdAt: ago(10), scheduledAt: ago(10) })
  const m6sent = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'sched-90s', folder: 'sent', parentEmailId: m3in.id, sentAt: ago(1.5), createdAt: ago(10), scheduledAt: ago(10) })
  const m4in = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'reply-b-1m', folder: 'inbox', threadId: m1in.id, parentEmailId: m3in.id, sentAt: ago(1), createdAt: ago(1) })
  const m4sent = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'reply-b-1m', folder: 'sent', parentEmailId: m3in.id, sentAt: ago(1), createdAt: ago(1) })
  // S6: equal-timestamp pair — identical sentAt AND createdAt; only the
  // deterministic (createdAt, id) tie-break can order them.
  const eqT = new Date(Date.now() - 40 * 1000)
  const m5a = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'eq-alpha', folder: 'inbox', threadId: m1in.id, parentEmailId: m4in.id, sentAt: eqT, createdAt: eqT })
  const m5asent = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'eq-alpha', folder: 'sent', parentEmailId: m4in.id, sentAt: eqT, createdAt: eqT })
  const m5b = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'eq-beta', folder: 'inbox', threadId: m1in.id, parentEmailId: m4in.id, sentAt: eqT, createdAt: eqT })
  const m5bsent = await mkRow({ senderId: Buser.id, recipientEmail: aEmail, subject, body: 'eq-beta', folder: 'sent', parentEmailId: m4in.id, sentAt: eqT, createdAt: eqT })

  const HEAD = ['root-26m', 'reply-b-23m', 'legacy-null-15m', 'reply-a-3m', 'sched-90s', 'reply-b-1m']

  // ── S1/S2/S7/S8: the full mixed thread, oldest→newest, BOTH viewers.
  //    A opens their inbox copy of B's reply (sender's view = twin path);
  //    B opens the root anchor (recipient's view = plain path). ──
  const viewA = await api(A, 'GET', `/api/emails/${m2in.id}`)
  check('S7 A(sender-view) thread fetch -> 200', viewA.status === 200, JSON.stringify(viewA.json?.error || ''))
  const threadA = viewA.json?.thread || []
  const bodiesA = threadA.map((m) => m.body)
  check('S1/S2 A-view: oldest at top, newest at bottom, every reply in position', JSON.stringify(bodiesA.slice(0, 6)) === JSON.stringify(HEAD), bodiesA.join(' | '))
  const legacyRow = threadA.find((m) => m.body === 'legacy-null-15m')
  check('S8 legacy sentAt=null row present with null sentAt, ordered by createdAt', !!legacyRow && legacyRow.sentAt === null && bodiesA.indexOf('legacy-null-15m') === 2)
  const schedRow = threadA.find((m) => m.body === 'sched-90s')
  check('scheduled-dispatched row positions by sentAt (delivery instant), not createdAt', !!schedRow && bodiesA.indexOf('sched-90s') === 4)

  const viewB = await api(B, 'GET', `/api/emails/${m1in.id}`)
  check('S7 B(recipient-view) thread fetch -> 200', viewB.status === 200, JSON.stringify(viewB.json?.error || ''))
  const threadB = viewB.json?.thread || []
  const bodiesB = threadB.map((m) => m.body)
  check('S7 B-view mirrors the same chronological order', JSON.stringify(bodiesB.slice(0, 6)) === JSON.stringify(HEAD), bodiesB.join(' | '))

  // ── S9: twin/quoted pairing never duplicates a logical message ──
  const idsA = threadA.map((m) => m.id)
  check('S9 A-view: exactly 8 logical messages, all unique ids (sent/quoted copies folded)', threadA.length === 8 && new Set(idsA).size === 8, `got ${threadA.length} rows, ${new Set(idsA).size} unique`)
  const idsB = threadB.map((m) => m.id)
  check('S9 B-view: exactly 8 logical messages, all unique ids', threadB.length === 8 && new Set(idsB).size === 8, `got ${threadB.length} rows, ${new Set(idsB).size} unique`)

  // ── S4: auto-expand target (client expands thread[length-1]) is newest ──
  check('S4 auto-expand target (last array element) is the chronologically newest message', bodiesA[bodiesA.length - 1] === 'eq-alpha' || bodiesA[bodiesA.length - 1] === 'eq-beta', `last=${bodiesA[bodiesA.length - 1]}`)

  // ── S6: equal timestamps adjacent and id-ordered ──
  const iAlpha = bodiesA.indexOf('eq-alpha')
  const iBeta = bodiesA.indexOf('eq-beta')
  const idOrdered = (threadA[iAlpha].id < threadA[iBeta].id && iAlpha < iBeta) || (threadA[iBeta].id < threadA[iAlpha].id && iBeta < iAlpha)
  check('S6 equal-timestamp pair adjacent with deterministic (createdAt, id) order', Math.abs(iAlpha - iBeta) === 1 && idOrdered, `alpha@${iAlpha} beta@${iBeta}`)
  const monoA = threadA.every((m, i) => {
    if (i === 0) return true
    const prev = threadA[i - 1]
    const ti = new Date(m.sentAt ?? m.createdAt).getTime()
    const tp = new Date(prev.sentAt ?? prev.createdAt).getTime()
    if (ti !== tp) return ti >= tp
    return m.id >= prev.id
  })
  check('S6 whole array monotonic non-decreasing on (sentAt??createdAt, id)', monoA)

  // ── S5: refreshing the conversation preserves the order ──
  const viewA2 = await api(A, 'GET', `/api/emails/${m2in.id}`)
  const bodiesA2 = (viewA2.json?.thread || []).map((m) => m.body)
  check('S5 refresh: second fetch returns the identical order', JSON.stringify(bodiesA2) === JSON.stringify(bodiesA))
  const viewB2 = await api(B, 'GET', `/api/emails/${m1in.id}`)
  const bodiesB2 = (viewB2.json?.thread || []).map((m) => m.body)
  check('S5 refresh (B-view): identical order', JSON.stringify(bodiesB2) === JSON.stringify(bodiesB))

  // ── S3: a NEW reply (real API POST) lands last; older rows never move ──
  const rep = await api(A, 'POST', '/api/emails', { to: bEmail, subject, body: 'fresh-reply-now', replyToId: m4in.id })
  check('S3 real API reply -> 201', rep.status === 201, JSON.stringify(rep.json?.error || ''))
  const viewA3 = await api(A, 'GET', `/api/emails/${m2in.id}`)
  const bodiesA3 = (viewA3.json?.thread || []).map((m) => m.body)
  check('S3 A-view: the six seeded positions are byte-identical after the new reply', JSON.stringify(bodiesA3.slice(0, 6)) === JSON.stringify(HEAD), bodiesA3.join(' | '))
  check('S3 A-view: prior order unchanged AND the new reply appears at the bottom', bodiesA3.length === 9 && bodiesA3[bodiesA3.length - 1] === 'fresh-reply-now', `len=${bodiesA3.length} last=${bodiesA3[bodiesA3.length - 1]}`)
  const viewB3 = await api(B, 'GET', `/api/emails/${m1in.id}`)
  const bodiesB3 = (viewB3.json?.thread || []).map((m) => m.body)
  check('S3 B-view: new reply at the bottom, mirrored', bodiesB3[bodiesB3.length - 1] === 'fresh-reply-now' && JSON.stringify(bodiesB3.slice(0, 6)) === JSON.stringify(HEAD), bodiesB3.join(' | '))

  // ── S10: inbox list surface untouched — the list folds ONE row per
  //    conversation server-side, so the thread must surface as exactly ONE
  //    row, represented by the NEWEST member (last-message timestamp). ──
  const listA = await api(A, 'GET', '/api/emails?folder=inbox&page=1&limit=50')
  const rows = listA.json?.emails || []
  const convRows = rows.filter((r) => r.subject === subject)
  const newestMember = [m2in, m4in, m5a, m5b, m6in, m7in].reduce((a, b) => (new Date(b.createdAt).getTime() > new Date(a.createdAt).getTime() ? b : a))
  check('S10 inbox list -> 200', listA.status === 200, JSON.stringify(listA.json?.error || ''))
  check('S10 inbox list folds the thread into exactly ONE conversation row (preview surface unchanged)', convRows.length === 1, `got ${convRows.length}`)
  check('S10 the conversation row is the newest member (last-message timestamp correct)', convRows.length === 1 && convRows[0].id === newestMember.id, `row=${convRows[0]?.body || convRows[0]?.id} newest=${newestMember.body}`)
  const desc = rows.every((r, i) => i === 0 || new Date(rows[i - 1].createdAt).getTime() >= new Date(r.createdAt).getTime())
  check('S10 inbox list keeps createdAt-desc conversation ordering', desc)

  writeFileSync('/tmp/conversation-order-results.json', JSON.stringify({ pass, fail, results }, null, 2))
  console.log(results.join('\n'))
  console.log(`\n== conversation-order-e2e: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)

  // await prisma.$disconnect()
}

run().catch(async (err) => {
  console.error('SUITE ERROR:', err)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
