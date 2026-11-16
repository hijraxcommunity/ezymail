/**
 * Batch 5 E2E (audit F-20/F-21/F-33/F-34/F-35/F-36/F-37/F-61/F-62).
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-batch5-e2e.sh (boots PG + next dev, then this).
 *
 * Server-side coverage:
 *  - F-34(a): the 15s-poll list ships PREVIEW slices — non-draft folders
 *             return body capped at 300 chars and bodyHtml '', while the
 *             drafts folder returns FULL body + bodyHtml (draft editing
 *             feeds the list row straight into the compose editor)
 *  - F-34(b): thread twin resolution stays behavior-identical after the
 *             batching — a forked conversation seeded with a foreign row +
 *             the viewer's sent twin renders the VIEWER'S copy once, the
 *             foreign copy deduped away
 *  - F-35:    rule runs evaluate hasAttachment in SQL (null vs not-null,
 *             matching the JS truthiness contract) and stay bounded; from/
 *             archive rules still match exactly the right rows
 *  - F-36:    export strips attachment base64 data (keeps metadata), drops
 *             bodyHtml, caps at 5000 with an exact truncation marker, and
 *             the CSV From column carries the row's REAL sender
 *  - F-21:    /api/business/analytics returns totalRecipients (the real
 *             campaign audience denominator)
 *  - F-20:    team invite API unchanged (still records rows; the honest-UI
 *             change is client-side)
 *  - F-62:    the scheduled-send API contract the client now awaits is
 *             unchanged (scheduledAt stored, sentAt null, Scheduled view)
 *
 * Client-side items (F-37 back-button wiring, F-61 forward carry, F-62
 * toast ordering, F-20/F-21 UI copy) are verified by build + eslint + code
 * review, not by this HTTP suite.
 */
import { createRequire } from 'node:module'

const BASE = process.env.B5_BASE || 'http://127.0.0.1:3006'
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

async function apiRaw(cj, path) {
  const res = await fetch(BASE + path, {
    headers: { ...(cj.header() ? { Cookie: cj.header() } : {}) },
    redirect: 'manual',
  })
  cj.absorb(res)
  const text = await res.text()
  return { status: res.status, text }
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
      firstName: opts.firstName || 'Batch', lastName: opts.lastName || 'Five',
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

// ════════════════════════════ F-34(a): list preview slices ════════════════════════════

async function testF34List() {
  const sender = await seedUser(`b5.list.from.${stamp}@ezy.af`, { firstName: 'List', lastName: 'Sender' })
  const recipient = await seedUser(`b5.list.to.${stamp}@ezy.af`, { firstName: 'List', lastName: 'Receiver' })

  const longBody = 'X'.repeat(1200) + ' TAIL-MARKER'
  const s1 = await login(sender.email)
  const sent = await send(s1.cj, recipient.email, 'F34 long body', longBody)
  check('F34a send for list test ok', sent.status === 200 || sent.status === 201, `status=${sent.status}`)

  const r1 = await login(recipient.email)
  const list = await api(r1.cj, 'GET', '/api/emails?folder=inbox&page=1&limit=20')
  check('F34a inbox list 200', list.status === 200, `status=${list.status}`)
  const row = (list.json?.emails || []).find((e) => e.subject === 'F34 long body')
  check('F34a row found in list', !!row)
  if (row) {
    check('F34a non-draft list body is preview-sliced (<=300)',
      typeof row.body === 'string' && row.body.length <= 300,
      `len=${(row.body || '').length}`)
    check('F34a non-draft list bodyHtml stripped', row.bodyHtml === '', `val=${JSON.stringify(row.bodyHtml)}`)
  }

  // The detail endpoint still returns the FULL body (preview only on list).
  const detail = await api(r1.cj, 'GET', `/api/emails/${row.id}`)
  check('F34a detail body NOT sliced', (detail.json?.email?.body || '').length === longBody.length,
    `len=${(detail.json?.email?.body || '').length}`)

  // Drafts folder: full body + full bodyHtml survive the list response,
  // because draft editing passes the LIST row into the compose editor.
  const draftBody = 'D'.repeat(1200) + ' DRAFT-TAIL'
  const draftHtml = `<div>${draftBody}</div>`
  const dr = await api(r1.cj, 'POST', '/api/drafts', {
    to: sender.email, subject: 'F34 draft', body: draftBody, bodyHtml: draftHtml,
  })
  check('F34a draft created', dr.status === 200 || dr.status === 201, `status=${dr.status}`)

  const dlist = await api(r1.cj, 'GET', '/api/emails?folder=drafts&page=1&limit=20')
  const drow = (dlist.json?.emails || []).find((e) => e.subject === 'F34 draft')
  check('F34a draft row found in drafts list', !!drow)
  if (drow) {
    check('F34a drafts list body FULL (not sliced)', drow.body === draftBody, `len=${(drow.body || '').length}`)
    check('F34a drafts list bodyHtml FULL', drow.bodyHtml === draftHtml,
      `len=${(drow.bodyHtml || '').length}`)
  }
}

// ════════════════════════════ F-34(b): batched twin parity ════════════════════════════

async function testF34Twins() {
  const viewer = await seedUser(`b5.twin.viewer.${stamp}@ezy.af`, { firstName: 'Twin', lastName: 'Viewer' })
  const other = await seedUser(`b5.twin.other.${stamp}@ezy.af`, { firstName: 'Twin', lastName: 'Other' })
  const now = Date.now()

  // Legacy FORKED conversation, seeded directly (the twin lookup exists for
  // exactly this shape — see src/lib/mail/conversation.ts):
  //   K  = thread key (the first inbox copy's id, stamped on replies)
  //   F  = the OTHER user's inbox copy of the viewer's outgoing message
  //        (senderId=viewer, recipientEmail=other, threadId=K) — FOREIGN row
  //        that the viewer's thread query picks up via senderId
  //   S  = the viewer's OWN sent copy (folder=sent, threadId=null, same
  //        body, written within ±10s) — the twin the batched lookup must
  //        pull in so the dedup prefers the viewer's copy
  //   R  = the other user's reply, viewer's inbox copy (recipientEmail=
  //        viewer, threadId=K) — the row the viewer OPENS
  const key = `k_${stamp}_${Math.random().toString(36).slice(2, 8)}`
  const msgBody = `twin-original-${stamp}`
  // Align BOTH copies INSIDE one 5s dedup bucket (bucketKey floors createdAt
  // to 5000ms): +100ms and +1100ms from the bucket start are guaranteed to
  // share a bucket, so the viewer-copy preference can actually collapse
  // F and S. (First run failed only because t0+3000ms straddled a boundary
  // — the dedup is unchanged code; the seed was unlucky.)
  const bucketStart = Math.floor((now - 60_000) / 5000) * 5000
  const t0 = new Date(bucketStart + 100)
  const F = await prisma.email.create({
    data: {
      senderId: viewer.id, recipientEmail: other.email, subject: 'Twin original',
      body: msgBody, bodyHtml: `<p>${msgBody}</p>`, folder: 'inbox',
      threadId: key, createdAt: t0, sentAt: t0,
    },
  })
  const S = await prisma.email.create({
    data: {
      senderId: viewer.id, recipientEmail: other.email, subject: 'Twin original',
      body: msgBody, bodyHtml: `<p>${msgBody}</p>`, folder: 'sent',
      threadId: null, createdAt: new Date(bucketStart + 1100), sentAt: t0,
    },
  })
  const R = await prisma.email.create({
    data: {
      senderId: other.id, recipientEmail: viewer.email, subject: 'Re: Twin original',
      body: `reply-${stamp}`, bodyHtml: `<p>reply-${stamp}</p>`, folder: 'inbox',
      threadId: key, createdAt: new Date(bucketStart + 21_000), isRead: true,
    },
  })

  const v = await login(viewer.email)
  const res = await api(v.cj, 'GET', `/api/emails/${R.id}`)
  check('F34b forked thread opens 200', res.status === 200, `status=${res.status}`)
  const thread = res.json?.thread || []
  const ids = thread.map((m) => m.id)
  check('F34b thread includes viewer reply R', ids.includes(R.id))
  check('F34b thread includes the viewer\'s OWN sent twin S (batched lookup pulled it in)',
    ids.includes(S.id), `thread=${ids.join(',')}`)
  check('F34b foreign inbox copy F deduped away (viewer-copy preference kept)',
    !ids.includes(F.id), `thread=${ids.join(',')}`)
  // The outgoing message appears EXACTLY once, and it is the viewer's copy.
  const outgoingRows = thread.filter((m) => m.body === msgBody)
  check('F34b outgoing message appears exactly once', outgoingRows.length === 1,
    `count=${outgoingRows.length}`)
  check('F34b kept row is the viewer\'s sent copy', outgoingRows[0]?.id === S.id && outgoingRows[0]?.folder === 'sent')
}

// ════════════════════════════ F-35: bounded rule run + SQL hasAttachment ════════════════════════════

async function testF35Rules() {
  const owner = await seedUser(`b5.rules.owner.${stamp}@ezy.af`, { firstName: 'Rule', lastName: 'Owner' })
  const sender1 = await seedUser(`b5.rules.s1.${stamp}@ezy.af`, { firstName: 'Honda', lastName: 'Mailbot' })
  const sender2 = await seedUser(`b5.rules.s2.${stamp}@ezy.af`, { firstName: 'Toyota', lastName: 'Mailbot' })

  const o = await login(owner.email)
  const s1 = await login(sender1.email)
  const s2 = await login(sender2.email)

  // Four inbox rows for owner: honda+attachment, honda, toyota, toyota+attachment
  const a1 = await send(s1.cj, owner.email, 'Honda Civic offer', 'honda civic body')
  const a2 = await send(s1.cj, owner.email, 'Honda CR-V recall', 'honda crv body')
  const a3 = await send(s2.cj, owner.email, 'Toyota Corolla', 'toyota corolla body')
  const a4 = await send(s2.cj, owner.email, 'Toyota RAV4', 'toyota rav4 body')
  const okSend = [a1, a2, a3, a4].every((r) => r.status === 200 || r.status === 201)
  check('F35 four inbox rows sent', okSend, a1.json?.error || '')

  // Stamp attachments on A1 and A4 directly (metadata with a data payload —
  // exactly what the old unbounded scan would have loaded into memory).
  const attJson = JSON.stringify([{ name: 'spec.pdf', url: `/api/attachments/o_${stamp}_spec.pdf`, size: 12345, type: 'application/pdf', data: 'data:application/pdf;base64,' + 'Q'.repeat(4000) }])
  for (const r of [a1, a4]) {
    const emailId = r.json?.email?.id
    if (emailId) await prisma.email.update({ where: { id: emailId }, data: { attachments: attJson } })
  }

  const mkRule = async (name, conditions, actions) => {
    const res = await api(o.cj, 'POST', '/api/rules', {
      name,
      conditions: JSON.stringify(conditions),
      actions: JSON.stringify(actions),
      isEnabled: true,
    })
    return { res, id: res.json?.data?.id }
  }

  // Rule 1: hasAttachment=true → markAsRead. SQL push must match A1 + A4
  // (attachments not null) and nothing else, WITHOUT loading blobs.
  const r1 = await mkRule('b5 has-att', [{ field: 'hasAttachment', operator: 'equals', value: 'true' }], [{ type: 'markAsRead' }])
  check('F35 hasAttachment=true rule created', r1.res.status === 200 || r1.res.status === 201, `status=${r1.res.status} err=${r1.res.json?.error}`)
  const run1 = await api(o.cj, 'POST', `/api/rules/${r1.id}/run`)
  check('F35 hasAttachment=true run ok', run1.status === 200, `status=${run1.status} err=${run1.json?.error}`)
  check('F35 hasAttachment=true matched exactly 2', run1.json?.data?.matchingEmails === 2,
    `data=${JSON.stringify(run1.json?.data)}`)

  // Rule 2: hasAttachment=false → star. Matches A2 + A3 (attachments null).
  const r2 = await mkRule('b5 no-att', [{ field: 'hasAttachment', operator: 'equals', value: 'false' }], [{ type: 'star' }])
  const run2 = await api(o.cj, 'POST', `/api/rules/${r2.id}/run`)
  check('F35 hasAttachment=false matched exactly 2', run2.json?.data?.matchingEmails === 2,
    `data=${JSON.stringify(run2.json?.data)}`)

  // Rule 3: from contains honda → moveToFolder archive (SQL push excluded
  // the attachment conditions; JS still evaluates the text conditions).
  const r3 = await mkRule('b5 honda archive', [{ field: 'from', operator: 'contains', value: 'honda' }], [{ type: 'moveToFolder', value: 'archive' }])
  const run3 = await api(o.cj, 'POST', `/api/rules/${r3.id}/run`)
  check('F35 from-contains rule matched exactly 2', run3.json?.data?.matchingEmails === 2,
    `data=${JSON.stringify(run3.json?.data)}`)

  // Verify the writes landed where they should (archive = folder inbox +
  // isArchived true; star + read flags set) — behavior unchanged by F-35.
  const rows = await prisma.email.findMany({
    where: { recipientEmail: owner.email, folder: 'inbox' },
    select: { subject: true, isArchived: true, isRead: true, isStarred: true, attachments: true },
  })
  const bySubject = Object.fromEntries(rows.map((r) => [r.subject, r]))
  check('F35 honda rows archived, toyota rows not',
    bySubject['Honda Civic offer']?.isArchived === true && bySubject['Honda CR-V recall']?.isArchived === true &&
    bySubject['Toyota Corolla']?.isArchived === false && bySubject['Toyota RAV4']?.isArchived === false)
  check('F35 attachment rows marked read',
    bySubject['Honda Civic offer']?.isRead === true && bySubject['Toyota RAV4']?.isRead === true)
  check('F35 non-attachment rows starred',
    bySubject['Honda CR-V recall']?.isStarred === true && bySubject['Toyota Corolla']?.isStarred === true)

  // Cleanup the created rules so repeat runs stay clean.
  for (const r of [r1, r2, r3]) {
    if (r.id) await api(o.cj, 'DELETE', `/api/rules/${r.id}`).catch(() => {})
  }
}

// ════════════════════════════ F-36: bounded export, blobs stripped, real From ════════════════════════════

async function testF36Export() {
  const user = await seedUser(`b5.exp.user.${stamp}@ezy.af`, { firstName: 'Export', lastName: 'User' })
  const penPal = await seedUser(`b5.exp.pen.${stamp}@ezy.af`, { firstName: 'Export', lastName: 'PenPal' })

  const u = await login(user.email)
  const p = await login(penPal.email)

  // user -> penPal (sent copy owned by user) and penPal -> user (received,
  // real sender = penPal). One row carries an attachment with base64 data.
  const sentMail = await send(u.cj, penPal.email, 'F36 sent', 'sent body export')
  const recvMail = await send(p.cj, user.email, 'F36 received', 'received body export')
  check('F36 exchange sent', [sentMail, recvMail].every((r) => r.status === 200 || r.status === 201))
  const attJson = JSON.stringify([{ name: 'blob.bin', url: `/api/attachments/x_${stamp}_blob.bin`, size: 99, type: 'application/octet-stream', data: 'data:application/octet-stream;base64,' + 'Z'.repeat(6000) }])
  // Stamp BOTH copies of the received message — penPal's sent copy and the
  // user's inbox copy share recipientEmail=user.email, so the user's
  // export (senderId OR recipientEmail) picks up both; update only ONE id
  // left the other null and rows.find() could land on either.
  await prisma.email.updateMany({
    where: { subject: 'F36 received', recipientEmail: user.email },
    data: { attachments: attJson },
  })

  const exp = await api(u.cj, 'GET', '/api/user/export?format=json')
  check('F36 json export 200', exp.status === 200, `status=${exp.status}`)
  const data = exp.json
  const emails = data?.emails || []
  check('F36 export has both rows', emails.length >= 2, `count=${emails.length}`)

  const withAtt = emails.find((e) => e.subject === 'F36 received' && e.folder === 'inbox')
  check('F36 attachment base64 data stripped from export', !!withAtt && !JSON.stringify(withAtt.attachments).includes('base64'),
    withAtt ? JSON.stringify(withAtt.attachments) : 'row missing')
  check('F36 attachment metadata kept', !!withAtt && Array.isArray(JSON.parse(withAtt.attachments || '[]')) &&
    (JSON.parse(withAtt.attachments || '[]')[0]?.name) === 'blob.bin')
  check('F36 bodyHtml omitted from export rows', emails.every((e) => !('bodyHtml' in e)))
  check('F36 truncation flag false for small mailbox', data?.emailsTruncated === false)

  const recvRow = emails.find((e) => e.subject === 'F36 received')
  const sentRow = emails.find((e) => e.subject === 'F36 sent')
  check('F36 received row senderEmail = REAL sender (penPal)',
    recvRow?.senderEmail === penPal.email, `val=${recvRow?.senderEmail}`)
  check('F36 sent row senderEmail = the exporting user',
    sentRow?.senderEmail === user.email, `val=${sentRow?.senderEmail}`)

  // CSV: the From column carries the row's real sender (was: own address
  // for sent rows, '' for received rows).
  const csv = await apiRaw(u.cj, '/api/user/export?format=csv')
  check('F36 csv export 200', csv.status === 200, `status=${csv.status}`)
  const lines = csv.text.split('\n')
  const emailSection = lines.slice(lines.indexOf('# Emails') + 2, lines.findIndex((l) => l === ''))
  const recvCsv = emailSection.find((l) => l.includes('F36 received'))
  const sentCsv = emailSection.find((l) => l.includes('F36 sent'))
  // From is the 4th column; rows are csv-escaped but these values are plain.
  const recvFrom = recvCsv?.split(',')[3]
  const sentFrom = sentCsv?.split(',')[3]
  check('F36 csv received From = penPal real sender', recvFrom === penPal.email, `val=${recvFrom}`)
  check('F36 csv sent From = exporting user', sentFrom === user.email, `val=${sentFrom}`)
  check('F36 csv contains no base64 blob', !csv.text.includes('base64'))
}

// ════════════════════════════ F-21: analytics returns totalRecipients ════════════════════════════

async function testF21Analytics() {
  const biz = await seedUser(`b5.biz.${stamp}@ezy.af`, {
    firstName: 'Biz', lastName: 'Owner', accountType: 'business', subscriptionStatus: 'trial',
  })

  const customer = await prisma.customer.create({
    data: { businessId: biz.id, email: `cust.${stamp}@example.com`, name: 'F21 Customer' },
  })
  const campaign = await prisma.campaign.create({
    data: { businessId: biz.id, subject: 'F21 campaign', body: 'x', bodyHtml: '<p>x</p>', opens: 1, clicks: 1, sentAt: new Date() },
  })
  const cust2 = await prisma.customer.create({
    data: { businessId: biz.id, email: `cust2.${stamp}@example.com`, name: 'F21 Customer 2' },
  })
  await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, customerId: customer.id } })
  await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, customerId: cust2.id } })

  const b = await login(biz.email)
  const res = await api(b.cj, 'GET', '/api/business/analytics')
  check('F21 analytics 200 for active business', res.status === 200, `status=${res.status}`)
  const a = res.json?.analytics
  check('F21 totalRecipients returned', typeof a?.totalRecipients === 'number', `val=${JSON.stringify(a?.totalRecipients)}`)
  check('F21 totalRecipients = real audience (2)', a?.totalRecipients === 2, `val=${a?.totalRecipients}`)
  check('F21 openRate still computed server-side', a?.openRate === 50, `val=${a?.openRate}`)
}

// ════════════════════════════ F-20: team invite API unchanged (regression) ════════════════════════════

async function testF20Team() {
  const biz = await seedUser(`b5.team.${stamp}@ezy.af`, {
    firstName: 'Team', lastName: 'Owner', accountType: 'business', subscriptionStatus: 'trial',
  })
  // TeamMember.memberEmail carries an FK to User.email (schema line 368) —
  // inviting a NON-registered address fails the constraint with 500. That
  // is PRE-EXISTING behavior this batch deliberately leaves untouched (the
  // register's F-20 remediation is honest labeling; the feature build is
  // deferred). Seed the teammate so the regression check exercises the
  // row-recording path itself.
  const teammate = await seedUser(`b5.teammate.${stamp}@ezy.af`, { firstName: 'Team', lastName: 'Mate' })
  const b = await login(biz.email)
  const inv = await api(b.cj, 'POST', '/api/business/team', {
    email: teammate.email, role: 'member',
  })
  check('F20 invite still recorded (201)', inv.status === 201, `status=${inv.status} err=${inv.json?.error}`)
  const list = await api(b.cj, 'GET', '/api/business/team')
  const found = (list.json?.teamMembers || []).find((m) => m.memberEmail === teammate.email)
  check('F20 invite listed with acceptedAt null', !!found && found.acceptedAt === null)
  // The honest-UI contract: nothing sets acceptedAt — verify the API still
  // exposes no acceptance mutation (PATCH on [id] must not accept).
  const patch = await api(b.cj, 'PATCH', `/api/business/team/${found?.id}`, { accepted: true })
  check('F20 no PATCH acceptance path (405 or 404)', patch.status === 405 || patch.status === 404, `status=${patch.status}`)
}

// ════════════════════════════ F-62: scheduled-send API contract unchanged ════════════════════════════

async function testF62Scheduled() {
  const sender = await seedUser(`b62.from.${stamp}@ezy.af`, { firstName: 'Sched', lastName: 'From' })
  const recipient = await seedUser(`b62.to.${stamp}@ezy.af`, { firstName: 'Sched', lastName: 'To' })
  const s = await login(sender.email)
  const future = new Date(Date.now() + 3600_000).toISOString()
  const res = await send(s.cj, recipient.email, 'F62 scheduled', 'scheduled body', { scheduledAt: future })
  check('F62 scheduled send 201', res.status === 200 || res.status === 201, `status=${res.status} err=${res.json?.error}`)
  const row = await prisma.email.findFirst({
    where: { senderId: sender.id, subject: 'F62 scheduled', folder: 'sent' },
    select: { scheduledAt: true, sentAt: true },
  })
  check('F62 scheduled row stored with sentAt null', !!row && row.scheduledAt !== null && row.sentAt === null,
    row ? `sentAt=${row.sentAt}` : 'row missing')
  const schedList = await api(s.cj, 'GET', '/api/emails?folder=scheduled&page=1&limit=20')
  check('F62 Scheduled view still lists it',
    (schedList.json?.emails || []).some((e) => e.subject === 'F62 scheduled'))
}

// ════════════════════════════ run ════════════════════════════

async function main() {
  try {
    await testF34List()
    await testF34Twins()
    await testF35Rules()
    await testF36Export()
    await testF21Analytics()
    await testF20Team()
    await testF62Scheduled()
  } catch (err) {
    check('suite completed without crash', false, err?.message || String(err))
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
  console.log('\n════════ Batch 5 E2E results ════════')
  for (const line of results) console.log(line)
  console.log(`════════ ${pass} passed, ${fail} failed ════════`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
