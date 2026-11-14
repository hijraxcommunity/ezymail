/**
 * Batch 2 mail-flow E2E (audit F-01/F-02/F-03/F-17/F-22/F-23/F-24/F-25/F-26/F-27).
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-mail-e2e.sh  (boots PG + next dev, then this).
 *
 * Covers:
 *  - F-01: multi-recipient TO delivers one copy per recipient, shared
 *          thread key, exactly one sent copy (previously: 404, zero mail)
 *  - F-02: CC/BCC are delivered AND persisted (cc header on to/cc/bcc
 *          copies; bcc recorded only on the sender's sent copy)
 *  - F-01 dedupe/precedence + all-or-nothing on unknown recipients
 *  - F-03: scheduled mail invisible to the recipient until due; Scheduled
 *          view lists the sender's pending copy (non-self recipients too);
 *          CRON_SECRET dispatch flips sentAt exactly once; 401 without
 *          the secret
 *  - F-17: rule run to an unsafe folder target -> 400 and mail untouched;
 *          rule to 'archive' -> row lands in the browsable Archive view
 *  - F-27: attachment lookup is exact-URL-first — two attachments with the
 *          SAME name can no longer cross-deliver
 *  - F-23/F-24 server contract: drafts list + delete lifecycle (the client
 *          ref fixes are UI-side; the API side proves delete-on-send works)
 *  - Threading regression: a reply from a multi-recipient conversation
 *          still folds into the same thread for every participant
 */
import { writeFileSync } from 'node:fs'
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

async function rawGet(cj, path) {
  const res = await fetch(BASE + path, {
    method: 'GET',
    headers: { ...(cj.header() ? { Cookie: cj.header() } : {}) },
    redirect: 'manual',
  })
  return res
}

const stamp = Date.now().toString(36)
const prisma = new PrismaClient()
const bcrypt = require(PROJECT + '/node_modules/bcryptjs')

async function seedUser(email, first = 'Mail', last = 'Tester') {
  const id = `u_${stamp}_${email.split('@')[0].split('.').pop()}_${Math.random().toString(36).slice(2, 6)}`
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

async function listFolder(cj, folder, page = 1) {
  const r = await api(cj, 'GET', `/api/emails?folder=${folder}&page=${page}&limit=50`)
  return { status: r.status, emails: r.json?.emails || [], total: r.json?.total }
}

async function findInboxRow(cj, subjectPart) {
  const { emails } = await listFolder(cj, 'inbox')
  return emails.find((e) => (e.subject || '').includes(subjectPart)) || null
}

const PNG_A_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// Different bytes, same file NAME — the collision case for F-27.
const PNG_B_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const run = async () => {
  const aEmail = `mail.a.${stamp}@ezy.af`
  const cEmail = `mail.c.${stamp}@ezy.af`
  const dEmail = `mail.d.${stamp}@ezy.af`
  const eEmail = `mail.e.${stamp}@ezy.af`
  await seedUser(aEmail, 'Alice', 'A')
  await seedUser(cEmail, 'Carol', 'C')
  await seedUser(dEmail, 'Dave', 'D')
  await seedUser(eEmail, 'Eve', 'E')
  const A = await login(aEmail)
  const C = await login(cEmail)
  const D = await login(dEmail)
  const E = await login(eEmail)

  // ─── M1: F-01 multi-recipient TO ───
  const m1Subject = `M1 multi ${stamp}`
  const m1 = await api(A, 'POST', '/api/emails', {
    to: `${cEmail}, ${dEmail}`,
    subject: m1Subject,
    body: 'hello both',
  })
  check('M1 send to 2 recipients -> 201 (was 404 always)', m1.status === 201, JSON.stringify(m1.json?.error || ''))
  const m1c = await findInboxRow(C, m1Subject)
  const m1d = await findInboxRow(D, m1Subject)
  check('M1 recipient C got their own copy', !!m1c)
  check('M1 recipient D got their own copy', !!m1d)
  check('M1 both copies share ONE thread key', !!m1c && !!m1d && m1c.threadId && m1c.threadId === m1d.threadId)
  const m1sent = await listFolder(A, 'sent')
  const m1sentRows = m1sent.emails.filter((e) => (e.subject || '') === m1Subject)
  check('M1 sender has exactly ONE sent copy', m1sentRows.length === 1, `got ${m1sentRows.length}`)

  // ─── M2: F-02 CC/BCC delivered + persisted ───
  const m2Subject = `M2 ccbcc ${stamp}`
  const m2 = await api(A, 'POST', '/api/emails', {
    to: cEmail,
    cc: dEmail,
    bcc: eEmail,
    subject: m2Subject,
    body: 'hello everyone',
  })
  check('M2 send with cc+bcc -> 201', m2.status === 201, JSON.stringify(m2.json?.error || ''))
  const m2d = await findInboxRow(D, m2Subject)
  check('M2 CC recipient D received a copy', !!m2d)
  const m2e = await findInboxRow(E, m2Subject)
  check('M2 BCC recipient E received a copy', !!m2e)
  const m2cRow = m1c ? await prisma.email.findUnique({ where: { id: (await findInboxRow(C, m2Subject))?.id } }) : null
  const m2eRow = m2e ? await prisma.email.findUnique({ where: { id: m2e.id } }) : null
  const m2SentRow = await prisma.email.findFirst({ where: { senderId: (await prisma.user.findUnique({ where: { email: aEmail } })).id, folder: 'sent', subject: m2Subject } })
  check('M2 to-copy stores cc header, never bcc', !!m2cRow && (m2cRow.cc || '').includes(dEmail) && !m2cRow.bcc)
  check('M2 bcc-copy hides other bcc + stores cc', !!m2eRow && (m2eRow.cc || '').includes(dEmail) && !m2eRow.bcc)
  check('M2 sent copy records the private bcc list', !!m2SentRow && (m2SentRow.bcc || '').includes(eEmail))
  check('M2 cc/bcc copies share the thread key with the to-copy', !!m2cRow && !!m2eRow && m2cRow.threadId === m2eRow.threadId)

  // ─── M3: dedupe precedence + all-or-nothing on unknown recipient ───
  const m3Subject = `M3 dup404 ${stamp}`
  const m3 = await api(A, 'POST', '/api/emails', {
    to: `${cEmail}, ${cEmail}, nobody.${stamp}@ezy.af`,
    subject: m3Subject,
    body: 'should fail',
  })
  check('M3 unknown recipient -> 404', m3.status === 404, JSON.stringify(m3.json?.error || ''))
  const m3cRows = await prisma.email.count({ where: { recipientEmail: cEmail, subject: m3Subject } })
  check('M3 failed send wrote ZERO rows (all-or-nothing)', m3cRows === 0, `got ${m3cRows}`)
  const m3bSubject = `M3 overlap ${stamp}`
  const m3b = await api(A, 'POST', '/api/emails', {
    to: cEmail,
    bcc: cEmail,
    subject: m3bSubject,
    body: 'dedupe precedence',
  })
  const m3bRows = await prisma.email.count({ where: { recipientEmail: cEmail, subject: m3bSubject, folder: 'inbox' } })
  const m3bSent = await prisma.email.findFirst({ where: { senderId: m2SentRow.senderId, folder: 'sent', subject: m3bSubject } })
  check('M3 same address in to+bcc delivered ONCE', m3b.status === 201 && m3bRows === 1, `rows ${m3bRows}`)
  check('M3 precedence removes the duplicate from bcc', !!m3bSent && !m3bSent.bcc)

  // ─── S1-S3: F-03 scheduled ───
  const s1Subject = `S1 scheduled ${stamp}`
  const s1 = await api(A, 'POST', '/api/emails', {
    to: cEmail,
    subject: s1Subject,
    body: 'from the future',
    scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  })
  check('S1 scheduled send -> 201', s1.status === 201, JSON.stringify(s1.json?.error || ''))
  const s1cVisible = await findInboxRow(C, s1Subject)
  check('S1 recipient inbox does NOT list future-scheduled mail', !s1cVisible)
  const schedView = await listFolder(A, 'scheduled')
  const s1Pending = schedView.emails.filter((e) => (e.subject || '') === s1Subject)
  check('S1 Scheduled view lists the sender pending copy exactly once (non-self recipient)', s1Pending.length === 1, `got ${s1Pending.length}`)

  const noAuth = await fetch(`${BASE}/api/cron/dispatch-scheduled`, { method: 'GET', redirect: 'manual' })
  check('S2 dispatch without secret -> 401', noAuth.status === 401, `got ${noAuth.status}`)
  const badAuth = await fetch(`${BASE}/api/cron/dispatch-scheduled`, { method: 'GET', headers: { Authorization: 'Bearer wrong-secret' }, redirect: 'manual' })
  check('S2 dispatch with wrong secret -> 401', badAuth.status === 401, `got ${badAuth.status}`)

  // Rewind the schedule so it is due NOW, then dispatch.
  const s1RowsBefore = await prisma.email.findMany({ where: { subject: s1Subject } })
  await prisma.email.updateMany({ where: { subject: s1Subject, sentAt: null }, data: { scheduledAt: new Date(Date.now() - 60 * 1000) } })
  const disp = await fetch(`${BASE}/api/cron/dispatch-scheduled`, { method: 'GET', headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'e2e-cron-secret'}` }, redirect: 'manual' })
  const dispJson = await disp.json().catch(() => null)
  check('S3 authorized dispatch -> ok', disp.status === 200 && dispJson?.ok === true, JSON.stringify(dispJson))
  const s1RowsAfter = await prisma.email.findMany({ where: { subject: s1Subject } })
  check('S3 dispatch flipped sentAt on BOTH copies', s1RowsAfter.length === s1RowsBefore.length && s1RowsAfter.every((r) => r.sentAt !== null), `${s1RowsAfter.length} rows`)
  const s1cAfter = await findInboxRow(C, s1Subject)
  check('S3 due mail is now visible in recipient inbox', !!s1cAfter)
  const schedAfter = await listFolder(A, 'scheduled')
  check('S3 Scheduled view emptied after dispatch', !schedAfter.emails.some((e) => (e.subject || '') === s1Subject))
  const disp2 = await fetch(`${BASE}/api/cron/dispatch-scheduled`, { method: 'GET', headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'e2e-cron-secret'}` }, redirect: 'manual' })
  const disp2Json = await disp2.json().catch(() => null)
  check('S3 second dispatch is idempotent (0 dispatched)', disp2Json?.dispatched === 0, JSON.stringify(disp2Json))

  // ─── R1/R2: F-17 rules ───
  const rTarget = await api(A, 'POST', '/api/emails', {
    to: cEmail,
    subject: `R1 rule target ${stamp}`,
    body: 'rule bait',
  })
  const r1C = await findInboxRow(C, `R1 rule target ${stamp}`)
  check('R1 setup: rule bait mail in inbox', rTarget.status === 201 && !!r1C)
  const badRule = await api(C, 'POST', '/api/rules', {
    name: `bad rule ${stamp}`,
    conditions: JSON.stringify([{ field: 'subject', operator: 'contains', value: 'rule target' }]),
    actions: JSON.stringify([{ type: 'moveToFolder', value: 'starred' }]),
    isEnabled: true,
  })
  const badRuleId = badRule.json?.rule?.id || badRule.json?.data?.id || badRule.json?.id
  const runBad = await api(C, 'POST', `/api/rules/${badRuleId}/run`, {})
  check('R1 rule run to STARRED rejected with 400', runBad.status === 400, `got ${runBad.status} ${JSON.stringify(runBad.json?.error || '')}`)
  const r1After = await prisma.email.findUnique({ where: { id: r1C.id } })
  check('R1 rejected run left the mail untouched (folder=inbox)', r1After.folder === 'inbox')

  const goodRule = await api(C, 'POST', '/api/rules', {
    name: `archive rule ${stamp}`,
    conditions: JSON.stringify([{ field: 'subject', operator: 'contains', value: 'rule target' }]),
    actions: JSON.stringify([{ type: 'moveToFolder', value: 'archive' }]),
    isEnabled: true,
  })
  const goodRuleId = goodRule.json?.rule?.id || goodRule.json?.data?.id || goodRule.json?.id
  const runGood = await api(C, 'POST', `/api/rules/${goodRuleId}/run`, {})
  check('R2 rule run to ARCHIVE succeeds', runGood.status === 200, `got ${runGood.status}`)
  const r2After = await prisma.email.findUnique({ where: { id: r1C.id } })
  check('R2 row is in the browsable Archive representation', r2After.folder === 'inbox' && r2After.isArchived === true)
  const archView = await listFolder(C, 'archive')
  check('R2 mail visible in the Archive VIEW', archView.emails.some((e) => e.id === r1C.id))
  const inbView = await listFolder(C, 'inbox')
  check('R2 mail gone from the inbox view', !inbView.emails.some((e) => e.id === r1C.id))

  // ─── A1: F-27 exact-URL attachment lookup (same-name collision) ───
  const a1 = await api(A, 'POST', '/api/emails', {
    to: cEmail,
    subject: `A1 att one ${stamp}`,
    body: 'att one',
    attachments: [{ name: 'same.png', url: 'junk-url-from-client', size: 70, type: 'image/png', data: `data:image/png;base64,${PNG_A_B64}` }],
  })
  const a2 = await api(A, 'POST', '/api/emails', {
    to: cEmail,
    subject: `A1 att two ${stamp}`,
    body: 'att two',
    attachments: [{ name: 'same.png', url: 'junk-url-two', size: 70, type: 'image/png', data: `data:image/png;base64,${PNG_B_B64}` }],
  })
  check('A1 both same-name attachment sends -> 201', a1.status === 201 && a2.status === 201, `${a1.status}/${a2.status}`)
  const a1Row = await prisma.email.findFirst({ where: { recipientEmail: cEmail, subject: `A1 att one ${stamp}` } })
  const a2Row = await prisma.email.findFirst({ where: { recipientEmail: cEmail, subject: `A1 att two ${stamp}` } })
  const a1Att = JSON.parse(a1Row.attachments)[0]
  const a2Att = JSON.parse(a2Row.attachments)[0]
  check('A1 stored urls are unique and server-generated', a1Att.url !== a2Att.url && a1Att.url.startsWith('/api/attachments/'))
  const f1 = await rawGet(C, a1Att.url)
  const f1Buf = Buffer.from(await f1.arrayBuffer())
  const f2 = await rawGet(C, a2Att.url)
  const f2Buf = Buffer.from(await f2.arrayBuffer())
  check('A1 exact-url lookup serves the RIGHT bytes (no cross-delivery)', f1.status === 200 && f1Buf.equals(Buffer.from(PNG_A_B64, 'base64')), `status ${f1.status}`)
  check('A1 second same-name file serves ITS OWN bytes', f2.status === 200 && f2Buf.equals(Buffer.from(PNG_B_B64, 'base64')), `status ${f2.status}`)

  // ─── D1: F-23 server contract — drafts create/delete lifecycle ───
  const d1 = await api(A, 'POST', '/api/drafts', { to: cEmail, subject: `D1 draft ${stamp}`, body: 'draft body', bodyHtml: '<p>draft body</p>' })
  const draftId = d1.json?.draft?.id
  check('D1 draft created with id', d1.status === 200 && !!draftId, JSON.stringify(d1.json?.error || ''))
  const d1List1 = await listFolder(A, 'drafts')
  check('D1 drafts view lists the saved draft', d1List1.emails.some((e) => e.id === draftId))
  await api(A, 'DELETE', `/api/emails/${draftId}`)
  const d1List2 = await listFolder(A, 'drafts')
  check('D1 send-path delete removes the draft from Drafts (no ghost)', !d1List2.emails.some((e) => e.id === draftId))

  // ─── T1: threading regression — reply inside a multi-recipient thread ───
  const t1Reply = await api(C, 'POST', `/api/emails/${m1c.id}/reply`, { body: 'reply from C' })
  check('T1 reply from own multi-recipient copy -> 201', t1Reply.status === 201, JSON.stringify(t1Reply.json?.error || ''))
  const aInbox = await listFolder(A, 'inbox')
  const t1ReplyRow = aInbox.emails.find((e) => (e.subject || '').includes(m1Subject))
  check('T1 reply visible in sender inbox, same thread key', !!t1ReplyRow && t1ReplyRow.threadId === m1c.threadId)
  const cSentRows = await prisma.email.findMany({ where: { senderId: (await prisma.user.findUnique({ where: { email: cEmail } })).id, folder: 'sent', subject: `Re: ${m1Subject}` } })
  check('T1 replier sees their reply twin in their own Sent folder', cSentRows.length === 1, `got ${cSentRows.length}`)

  writeFileSync('/tmp/mail-e2e-results.json', JSON.stringify({ pass, fail, results }, null, 2))
  console.log(results.join('\n'))
  console.log(`\n== mail-flow-e2e: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('SUITE ERROR:', err)
  process.exit(1)
})
