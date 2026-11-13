/**
 * E2E (real HTTP against a real dev server + real Postgres): deleting an
 * email from the SPAM page must put it in TRASH — owner report 2026-11-13.
 * Drives the exact endpoints the client calls, in the exact order.
 */
const BASE = 'http://127.0.0.1:3005'
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
  return { status: res.status, json }
}

const stamp = Date.now().toString(36)
async function register(email) {
  const cj = jar()
  // Seed the user directly (registration needs a WhatsApp OTP gateway in this
  // build); the session itself still comes from the REAL login endpoint.
  const { writeFileSync } = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const seedPath = `/tmp/seed-user-${stamp}-${email[4]}.cjs`
  writeFileSync(seedPath, `
    const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client')
    const bcrypt = require('/home/z/my-project/node_modules/bcryptjs')
    const p = new PrismaClient()
    ;(async () => {
      const hash = bcrypt.hashSync('TestPass!123', 4)
      await p.user.upsert({
        where: { email: ${JSON.stringify(email)} },
        update: { passwordHash: hash },
        create: { id: 'u_${stamp}_${email.split(".")[1]}', email: ${JSON.stringify(email)}, passwordHash: hash, firstName: 'Spam', lastName: 'Tester', dateOfBirth: '1990-05-10' },
      })
      await p.$disconnect()
    })()
  `)
  execFileSync('node', [seedPath], { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, stdio: 'inherit' })
  const l = await api(cj, 'POST', '/api/auth/login', { email, password: 'TestPass!123' })
  if (l.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(l)}`)
  const me = await api(cj, 'GET', '/api/auth/me')
  if (me.status !== 200) throw new Error(`auth/me failed for ${email}`)
  return cj
}

const run = async () => {
  const A = await register(`spam.a.${stamp}@ezy.af`)
  const B = await register(`spam.b.${stamp}@ezy.af`)

  // ── S1: single mail → report spam → delete from spam page → in trash ──
  const send1 = await api(A, 'POST', '/api/emails', { to: `spam.b.${stamp}@ezy.af`, subject: 'S1 single spam', body: 'body one' })
  check('S0 send mail 1', send1.status === 200 || send1.status === 201, `status ${send1.status}`)

  const spamList0 = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
  const inSpam0 = (spamList0.json?.emails || []).some((e) => e.subject === 'S1 single spam')
  check('S1a mail NOT in spam before report', !inSpam0)

  const rep = await api(B, 'POST', `/api/emails/${send1.json.email.id}/report-spam`)
  check('S1b report-spam ok', rep.status === 200, `status ${rep.status}`)

  const spamList1 = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
  const spamRow = (spamList1.json?.emails || []).find((e) => e.subject === 'S1 single spam')
  check('S1c mail listed on spam page', !!spamRow)

  // THE OWNER ACTION: delete it from the spam page (exact client call)
  const del = await api(B, 'DELETE', `/api/emails/${spamRow.id}`)
  check('S1d DELETE from spam page ok', del.status === 200, `status ${del.status} body ${JSON.stringify(del.json)?.slice(0, 200)}`)
  check('S1e server returned movedIds incl. the row', Array.isArray(del.json?.movedIds) && del.json.movedIds.includes(spamRow.id), JSON.stringify(del.json?.movedIds))

  const trash1 = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=20')
  const inTrash = (trash1.json?.emails || []).some((e) => e.subject === 'S1 single spam')
  check('S1f MAIL IS IN TRASH after spam-page delete', inTrash, `trash rows: ${(trash1.json?.emails || []).map((e) => e.subject).join(' | ')}`)

  const spamAfter = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
  check('S1g mail gone from spam page', !(spamAfter.json?.emails || []).some((e) => e.subject === 'S1 single spam'))

  // S1h: the poll re-fetches trash (15s poll behavior) — row must stay
  const trashPoll = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=20')
  check('S1h trash stable on re-fetch (poll)', (trashPoll.json?.emails || []).some((e) => e.subject === 'S1 single spam'))

  // ── S2: conversation — root in B inbox, B replies, A replies back; B
  //      spam-flags A's second reply (a RECEIVED copy in the conversation)
  //      and deletes it from the spam page ──
  const send2 = await api(A, 'POST', '/api/emails', { to: `spam.b.${stamp}@ezy.af`, subject: 'S2 conv root', body: 'root body' })
  const rootId = send2.json.email.id
  const reply = await api(B, 'POST', `/api/emails/${rootId}/reply`, { body: 'reply from B' })
  check('S2a reply sent', reply.status === 200 || reply.status === 201, `status ${reply.status}`)
  // A replies back to the root — that write creates B's RECEIVED copy of the
  // second message in the thread (recipientEmail=B, folder=inbox).
  const replyBack = await api(A, 'POST', `/api/emails/${rootId}/reply`, { body: 'A replies back' })
  check('S2a2 A reply-back sent', replyBack.status === 200 || replyBack.status === 201, `status ${replyBack.status}`)

  // A's reply-back is a thread member: the inbox LIST folds conversations,
  // so pull the thread detail (GET /api/emails/[rootId]) and take the
  // RECEIVED (folder=inbox, recipientEmail=B) 'Re:' row that is not the root.
  const thread2 = await api(B, 'GET', `/api/emails/${rootId}`)
  check('S2b-thread thread fetch ok', thread2.status === 200 && Array.isArray(thread2.json?.thread), `status ${thread2.status}`)
  const bReplyRow = (thread2.json?.thread || []).find((e) => e.id !== rootId && e.folder === 'inbox' && (e.subject || '').startsWith('Re:'))
  check('S2b A-reply visible in B thread', !!bReplyRow, `thread: ${(thread2.json?.thread || []).map((e) => `${e.subject}|${e.folder}`).join(' ; ')}`)
  if (bReplyRow) {
    await api(B, 'POST', `/api/emails/${bReplyRow.id}/report-spam`)
    const spam2 = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
    const spamReplyRow = (spam2.json?.emails || []).find((e) => e.id === bReplyRow.id)
    check('S2c reply listed on spam page', !!spamReplyRow)
    const del2 = await api(B, 'DELETE', `/api/emails/${bReplyRow.id}`)
    check('S2d DELETE spam-page reply ok', del2.status === 200)
    const trash2 = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=50')
    const trashRows = (trash2.json?.emails || [])
    const trashSubs = trashRows.map((e) => e.subject)
    check('S2e spam-page reply IS in trash', trashSubs.some((s) => s && s.startsWith('Re:') && s.includes('S2 conv root')), `trash: ${trashSubs.join(' | ')}`)
  }

  // ── S3: bulk "Delete all spam" — every row must land in trash ──
  const s3ids = []
  for (let i = 0; i < 2; i++) {
    const s = await api(A, 'POST', '/api/emails', { to: `spam.b.${stamp}@ezy.af`, subject: `S3 bulk spam ${i}`, body: 'bulk' })
    await api(B, 'POST', `/api/emails/${s.json.email.id}/report-spam`)
    s3ids.push(s.json.email.id)
  }
  const spam3 = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
  const bulkRows = (spam3.json?.emails || []).filter((e) => (e.subject || '').startsWith('S3 bulk spam'))
  check('S3a both bulk mails on spam page', bulkRows.length === 2, `found ${bulkRows.length}`)
  for (const row of bulkRows) await api(B, 'DELETE', `/api/emails/${row.id}`)
  const trash3 = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=50')
  const trash3Subs = (trash3.json?.emails || []).map((e) => e.subject)
  const got0 = trash3Subs.includes('S3 bulk spam 0')
  const got1 = trash3Subs.includes('S3 bulk spam 1')
  check('S3b bulk mail 0 in trash', got0)
  check('S3c bulk mail 1 in trash', got1)

  // ── S4: undo of a spam-page delete (client sends restoreConversation) ──
  const send4 = await api(A, 'POST', '/api/emails', { to: `spam.b.${stamp}@ezy.af`, subject: 'S4 undo after spam delete', body: 'undo' })
  await api(B, 'POST', `/api/emails/${send4.json.email.id}/report-spam`)
  const spam4 = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
  const row4 = (spam4.json?.emails || []).find((e) => e.subject === 'S4 undo after spam delete')
  const del4 = await api(B, 'DELETE', `/api/emails/${row4.id}`)
  check('S4a spam delete ok', del4.status === 200 && Array.isArray(del4.json?.movedIds) && del4.json.movedIds.includes(row4.id))
  const undo4 = await api(B, 'PUT', `/api/emails/${row4.id}`, {
    folder: 'spam', isArchived: false, restoreConversation: true,
  })
  check('S4b undo (restoreConversation) ok', undo4.status === 200, `status ${undo4.status}`)
  const inbox4 = await api(B, 'GET', '/api/emails?folder=inbox&page=1&limit=20')
  const inboxSubs = (inbox4.json?.emails || []).map((e) => e.subject)
  const spam4b = await api(B, 'GET', '/api/emails?folder=spam&page=1&limit=20')
  const trash4 = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=50')
  const back = inboxSubs.includes('S4 undo after spam delete') || (spam4b.json?.emails || []).some((e) => e.subject === 'S4 undo after spam delete')
  check('S4c after undo the mail is visible again (inbox or spam), NOT only in trash', back, `inbox: ${inboxSubs.join(' | ')}`)
  check('S4d mail left trash after undo', !(trash4.json?.emails || []).some((e) => e.subject === 'S4 undo after spam delete'))

  // ── S5: the snooze hole (the actual root cause of "not in trash"):
  //      a mail that was ever SNOOZED (the snooze endpoint stamps the anchor
  //      wherever it lives) must land VISIBLY in Trash when deleted — every
  //      folder view except Snoozed filters snoozedUntil=null. ──
  const send5 = await api(A, 'POST', '/api/emails', { to: `spam.b.${stamp}@ezy.af`, subject: 'S5 snoozed then deleted', body: 'snooze hole' })
  const snoozeAt = new Date(Date.now() + 3600_000).toISOString()
  const snz = await api(B, 'POST', `/api/emails/${send5.json.email.id}/snooze`, { snoozeUntil: snoozeAt })
  check('S5a snooze ok', snz.status === 200, `status ${snz.status}`)
  // delete it from the SNOOZED page (snoozed view lists it; row delete = DELETE)
  const snoozedList = await api(B, 'GET', '/api/emails?folder=snoozed&page=1&limit=20')
  const snzRow = (snoozedList.json?.emails || []).find((e) => e.subject === 'S5 snoozed then deleted')
  check('S5b mail listed on snoozed page', !!snzRow)
  if (snzRow) {
    const del5 = await api(B, 'DELETE', `/api/emails/${snzRow.id}`)
    check('S5c delete from snoozed page ok', del5.status === 200)
    // THE OWNER'S CHECK: the trash view (same filters the client fetches)
    // must LIST it — snoozedUntil must have been cleared with the move.
    const trash5 = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=50')
    const trash5Row = (trash5.json?.emails || []).find((e) => e.subject === 'S5 snoozed then deleted')
    check('S5d deleted snoozed mail IS VISIBLE in trash (snoozedUntil cleared)', !!trash5Row && !trash5Row.snoozedUntil, JSON.stringify(trash5Row ? { snoozedUntil: trash5Row.snoozedUntil } : 'missing'))
  }

  // ── S6: spam-page delete of a mail that was snoozed while in spam
  //      (spam detail menu offers Snooze) — lands VISIBLY in Trash. ──
  const send6 = await api(A, 'POST', '/api/emails', { to: `spam.b.${stamp}@ezy.af`, subject: 'S6 spam+snoozed+deleted', body: 'spam snooze hole' })
  await api(B, 'POST', `/api/emails/${send6.json.email.id}/report-spam`)
  await api(B, 'POST', `/api/emails/${send6.json.email.id}/snooze`, { snoozeUntil: snoozeAt })
  // snoozed rows are hidden from the spam view (snoozedUntil filter); the
  // owner deletes it from the SNOOZED page — the mail they know from spam.
  const snoozedList6 = await api(B, 'GET', '/api/emails?folder=snoozed&page=1&limit=20')
  const snzRow6 = (snoozedList6.json?.emails || []).find((e) => e.subject === 'S6 spam+snoozed+deleted')
  check('S6a spam mail snoozed from spam page is on the snoozed page', !!snzRow6)
  if (snzRow6) {
    const del6 = await api(B, 'DELETE', `/api/emails/${snzRow6.id}`)
    check('S6b delete ok', del6.status === 200)
    const trash6 = await api(B, 'GET', '/api/emails?folder=trash&page=1&limit=50')
    const trash6Row = (trash6.json?.emails || []).find((e) => e.subject === 'S6 spam+snoozed+deleted')
    check('S6c the spam-known snoozed mail IS VISIBLE in trash', !!trash6Row && !trash6Row.snoozedUntil, JSON.stringify(trash6Row ? { snoozedUntil: trash6Row.snoozedUntil } : 'missing'))
    // and the undo round-trip must not swallow it either
    const undo6 = await api(B, 'PUT', `/api/emails/${snzRow6.id}`, { folder: 'inbox', isArchived: false, restoreConversation: true })
    check('S6d undo ok', undo6.status === 200)
    const inbox6 = await api(B, 'GET', '/api/emails?folder=inbox&page=1&limit=20')
    const back6 = (inbox6.json?.emails || []).some((e) => e.subject === 'S6 spam+snoozed+deleted')
    check('S6e after undo the mail is VISIBLE in inbox (snoozedUntil cleared by restore)', back6, `inbox: ${(inbox6.json?.emails || []).map((e) => e.subject).join(' | ')}`)
  }

  console.log(results.join('\n'))
  console.log(`\nTOTAL: ${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
}

run().catch((e) => { console.error('E2E CRASH', e); process.exit(1) })
