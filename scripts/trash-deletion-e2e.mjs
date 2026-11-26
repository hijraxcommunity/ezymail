/**
 * Global email deletion + Trash management regression (owner spec:
 * "deleting an email from ANY mailbox page moves it to Trash", restore
 * returns the PREVIOUS mailbox state, permanent delete is explicit, drafts
 * restore as drafts, sent copies restore as sent, recipient copies are
 * never touched).
 *
 * ROOT CAUSES FIXED (this suite pins them):
 *  1. The trash view queried folder='trash' AND recipientEmail=session.email
 *     only — sent copies and drafts the user trashed were INVISIBLE (mail
 *     deleted from Sent/Drafts vanished from the mailbox entirely), while
 *     rows OTHER users trashed in their own mailboxes (a sent copy or draft
 *     addressed to this user) LEAKED IN.
 *  2. The lifecycle mailbox scope admitted no sender-side trash rows, so a
 *     trashed sent copy/draft was an orphan: restore and permanent delete
 *     resolved an empty member set and silently no-opped.
 *  3. Drafts were hard-deleted on the Drafts page (F-23 default stays for
 *     Discard/send-cleanup; ?trash=1 opts the Drafts page into Trash).
 *  4. No provenance marker existed — restore could not return a row to the
 *     folder it was deleted FROM (sent, drafts, spam, custom folders).
 *     Every trash move now stamps Email.trashedFrom; restore = literal undo.
 *
 * Real HTTP against a real dev server + real Postgres (embedded harness).
 * Runs with: bash scripts/run-trash-deletion-e2e.sh
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
  const id = `u_trash_${Math.random().toString(36).slice(2, 10)}`
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
  const aEmail = `trash.a.${stamp}@ezy.af`
  const bEmail = `trash.b.${stamp}@ezy.af`
  const Auser = await seedUser(aEmail, 'Alice', 'Trash')
  const Buser = await seedUser(bEmail, 'Ben', 'Trash')
  const A = await login(aEmail)
  const B = await login(bEmail)

  const send = async (from, to, subject, extraBody = {}) =>
    api(from, 'POST', '/api/emails', { to, subject, body: `body of ${subject}`, ...extraBody })
  const listFolder = async (cj, folder, extra = '') => {
    const r = await api(cj, 'GET', `/api/emails?folder=${folder}&page=1&limit=50${extra}`)
    return { status: r.status, emails: r.json?.emails || [], total: r.json?.total, json: r.json }
  }
  const sentCopyOf = async (userId, subject) =>
    prisma.email.findFirst({ where: { senderId: userId, folder: 'sent', subject }, orderBy: { createdAt: 'desc' } })
  const inboxCopyFor = async (email, subject) =>
    prisma.email.findFirst({ where: { recipientEmail: email, folder: 'inbox', subject }, orderBy: { createdAt: 'desc' } })

  // ────────────────────────────────────────────────────────────────────────
  // S1 — Inbox: delete → Trash (content + attachment preserved) → restore →
  //      re-delete → explicit permanent delete from Trash.
  // ────────────────────────────────────────────────────────────────────────
  const s1Subject = `S1 inbox delete ${stamp}`
  const s1 = await send(A, bEmail, s1Subject, {
    attachments: [{ name: 'notes.txt', type: 'text/plain', size: 11, data: 'data:text/plain;base64,dGVzdCBieXRlcw==' }],
  })
  check('S1 send with attachment -> 201', s1.status === 201, JSON.stringify(s1.json?.error || ''))
  const s1row = await inboxCopyFor(bEmail, s1Subject)
  check('S1 recipient inbox copy exists', !!s1row)

  const s1del = await api(B, 'DELETE', `/api/emails/${s1row.id}`)
  check('S1 delete from Inbox -> 200 with movedIds', s1del.status === 200 && (s1del.json?.movedIds || []).includes(s1row.id), JSON.stringify(s1del.json?.error || ''))
  check('S1 Inbox view no longer lists it', !(await listFolder(B, 'inbox')).emails.some((e) => e.id === s1row.id))
  const s1trash = await listFolder(B, 'trash')
  check('S1 Trash view lists the deleted mail', s1trash.emails.some((e) => e.id === s1row.id), `total=${s1trash.total}`)

  const s1detail = await api(B, 'GET', `/api/emails/${s1row.id}`)
  const s1email = s1detail.json?.email
  const s1atts = (() => { try { return JSON.parse(s1email?.attachments || '[]') } catch { return [] } })()
  check('S1 trashed row keeps subject/body/attachment', !!s1email && s1email.subject === s1Subject && (s1email.body || '').includes('body of') && s1atts.length === 1 && s1atts[0].name === 'notes.txt', JSON.stringify(s1atts))
  check('S1 trashed row stamped trashedFrom=inbox', s1email?.trashedFrom === 'inbox', String(s1email?.trashedFrom))

  const s1restore = await api(B, 'PUT', `/api/emails/${s1row.id}`, { restoreConversation: true, folder: 'inbox', isArchived: false })
  check('S1 restore -> 200 restoredCount>=1', s1restore.status === 200 && (s1restore.json?.restoredCount || 0) >= 1, JSON.stringify(s1restore.json?.error || ''))
  check('S1 restored back to Inbox view', (await listFolder(B, 'inbox')).emails.some((e) => e.id === s1row.id))
  check('S1 marker cleared after restore', (await api(B, 'GET', `/api/emails/${s1row.id}`)).json?.email?.trashedFrom === null)

  await api(B, 'DELETE', `/api/emails/${s1row.id}`) // back to Trash
  const s1purge = await api(B, 'DELETE', `/api/emails/${s1row.id}`) // now in Trash -> explicit permanent
  check('S1 second delete inside Trash permanently removes it', s1purge.status === 200 && s1purge.json?.permanentlyDeleted === true && (s1purge.json?.deletedCount || 0) >= 1, JSON.stringify(s1purge.json || {}))
  check('S1 row gone from database', (await prisma.email.findUnique({ where: { id: s1row.id } })) === null)

  // ────────────────────────────────────────────────────────────────────────
  // S2 — Sent: delete → Trash (was: vanished entirely) → restore returns the
  //      SENT classification (not Inbox) → permanent delete works (was: a
  //      silent no-op on the orphaned row).
  // ────────────────────────────────────────────────────────────────────────
  const s2Subject = `S2 sent delete ${stamp}`
  await send(A, bEmail, s2Subject)
  const s2sent = await sentCopyOf(Auser.id, s2Subject)
  check('S2 sender sent copy exists', !!s2sent)

  const s2del = await api(A, 'DELETE', `/api/emails/${s2sent.id}`)
  check('S2 delete from Sent -> 200', s2del.status === 200 && (s2del.json?.movedIds || []).includes(s2sent.id), JSON.stringify(s2del.json?.error || ''))
  check('S2 Sent view no longer lists it', !(await listFolder(A, 'sent')).emails.some((e) => e.id === s2sent.id))
  check('S2 Trash view LISTS the trashed sent copy (was invisible)', (await listFolder(A, 'trash')).emails.some((e) => e.id === s2sent.id))

  const s2restore = await api(A, 'PUT', `/api/emails/${s2sent.id}`, { restoreConversation: true, folder: 'inbox', isArchived: false })
  check('S2 restore -> 200', s2restore.status === 200, JSON.stringify(s2restore.json?.error || ''))
  check('S2 restored to SENT view (Sent classification preserved)', (await listFolder(A, 'sent')).emails.some((e) => e.id === s2sent.id))
  check('S2 restored row NOT in Inbox view', !(await listFolder(A, 'inbox')).emails.some((e) => e.id === s2sent.id))
  check('S2 restored row folder=sent in database', (await prisma.email.findUnique({ where: { id: s2sent.id } }))?.folder === 'sent')

  await api(A, 'DELETE', `/api/emails/${s2sent.id}`)
  const s2purge = await api(A, 'DELETE', `/api/emails/${s2sent.id}`)
  check('S2 permanent delete of trashed sent copy works (was a silent no-op)', s2purge.status === 200 && s2purge.json?.permanentlyDeleted === true && (s2purge.json?.deletedCount || 0) >= 1, JSON.stringify(s2purge.json || {}))
  check('S2 sent copy gone from database', (await prisma.email.findUnique({ where: { id: s2sent.id } })) === null)

  // ────────────────────────────────────────────────────────────────────────
  // S3 — Drafts page: delete → Trash (was: hard-deleted) → restore returns it
  //      AS A DRAFT (never sent, never converted) → permanent delete.
  // ────────────────────────────────────────────────────────────────────────
  const s3Subject = `S3 draft trash ${stamp}`
  const s3draft = await api(A, 'POST', '/api/drafts', { to: bEmail, subject: s3Subject, body: 'draft body content', bodyHtml: '<p>draft body content</p>' })
  const s3id = s3draft.json?.draft?.id
  check('S3 draft saved with id', s3draft.status === 200 && !!s3id, JSON.stringify(s3draft.json?.error || ''))
  check('S3 Drafts view lists the draft', (await listFolder(A, 'drafts')).emails.some((e) => e.id === s3id))

  const s3del = await api(A, 'DELETE', `/api/emails/${s3id}?trash=1`)
  check('S3 Drafts-page delete (?trash=1) -> 200 moved', s3del.status === 200 && (s3del.json?.movedIds || []).includes(s3id), JSON.stringify(s3del.json || {}))
  check('S3 Drafts view no longer lists it', !(await listFolder(A, 'drafts')).emails.some((e) => e.id === s3id))
  const s3trashRow = (await listFolder(A, 'trash')).emails.find((e) => e.id === s3id)
  check('S3 Trash view lists the trashed draft', !!s3trashRow)
  const s3detail = (await api(A, 'GET', `/api/emails/${s3id}`)).json?.email
  check('S3 trashed draft keeps content, isDraft=true, trashedFrom=drafts', !!s3detail && s3detail.isDraft === true && s3detail.trashedFrom === 'drafts' && (s3detail.body || '').includes('draft body content'), JSON.stringify({ isDraft: s3detail?.isDraft, trashedFrom: s3detail?.trashedFrom }))

  const s3restore = await api(A, 'PUT', `/api/emails/${s3id}`, { restoreConversation: true })
  check('S3 restore -> 200', s3restore.status === 200, JSON.stringify(s3restore.json?.error || ''))
  check('S3 Drafts view lists it again (restored AS a draft)', (await listFolder(A, 'drafts')).emails.some((e) => e.id === s3id))
  check('S3 restored draft NOT in Sent view (never converted into mail)', !(await listFolder(A, 'sent')).emails.some((e) => e.id === s3id))
  check('S3 no sent copy was created for the restored draft', (await prisma.email.findMany({ where: { senderId: Auser.id, folder: 'sent', subject: s3Subject } })).length === 0)

  await api(A, 'DELETE', `/api/emails/${s3id}?trash=1`)
  const s3purge = await api(A, 'DELETE', `/api/emails/${s3id}`)
  check('S3 permanent delete of trashed draft removes it', s3purge.status === 200 && (s3purge.json?.deletedCount || 0) >= 1, JSON.stringify(s3purge.json || {}))
  check('S3 draft row gone from database', (await prisma.email.findUnique({ where: { id: s3id } })) === null)

  // ────────────────────────────────────────────────────────────────────────
  // S4 — Compose Discard / send-path cleanup contract: plain DELETE on a
  //      draft HARD-deletes (ghost-draft contract F-23 unchanged).
  // ────────────────────────────────────────────────────────────────────────
  const s4 = await api(A, 'POST', '/api/drafts', { to: bEmail, subject: `S4 discard ${stamp}`, body: 'discard me' })
  const s4id = s4.json?.draft?.id
  const s4del = await api(A, 'DELETE', `/api/emails/${s4id}`)
  check('S4 plain DELETE on draft (Discard) hard-deletes', s4del.status === 200 && s4del.json?.permanentlyDeleted === true && (await prisma.email.findUnique({ where: { id: s4id } })) === null, JSON.stringify(s4del.json || {}))
  check('S4 discarded draft never enters Trash', !(await listFolder(A, 'trash')).emails.some((e) => e.id === s4id))

  // ────────────────────────────────────────────────────────────────────────
  // S5 — Starred: delete → Trash (row keeps its star), restore → Inbox.
  // ────────────────────────────────────────────────────────────────────────
  const s5Subject = `S5 starred delete ${stamp}`
  await send(A, bEmail, s5Subject)
  const s5row = await inboxCopyFor(bEmail, s5Subject)
  await api(B, 'PUT', `/api/emails/${s5row.id}`, { isStarred: true })
  check('S5 Starred view lists it', (await listFolder(B, 'starred')).emails.some((e) => e.id === s5row.id))
  await api(B, 'DELETE', `/api/emails/${s5row.id}`)
  check('S5 Starred view no longer lists it after delete', !(await listFolder(B, 'starred')).emails.some((e) => e.id === s5row.id))
  const s5trashRow = (await api(B, 'GET', `/api/emails/${s5row.id}`)).json?.email
  check('S5 Trash view lists it with the star preserved', s5trashRow?.folder === 'trash' && s5trashRow?.isStarred === true, JSON.stringify({ folder: s5trashRow?.folder, isStarred: s5trashRow?.isStarred }))
  await api(B, 'PUT', `/api/emails/${s5row.id}`, { restoreConversation: true })
  const s5back = (await api(B, 'GET', `/api/emails/${s5row.id}`)).json?.email
  check('S5 restore returns it to Inbox with star intact', s5back?.folder === 'inbox' && s5back?.isStarred === true, JSON.stringify({ folder: s5back?.folder, isStarred: s5back?.isStarred }))

  // ────────────────────────────────────────────────────────────────────────
  // S6 — Archive: delete MOVES TO TRASH (never a permanent delete), restore
  //      unarchives into Inbox.
  // ────────────────────────────────────────────────────────────────────────
  const s6Subject = `S6 archive delete ${stamp}`
  await send(A, bEmail, s6Subject)
  const s6row = await inboxCopyFor(bEmail, s6Subject)
  await api(B, 'PUT', `/api/emails/${s6row.id}`, { isArchived: true })
  check('S6 Archive view lists it', (await listFolder(B, 'archive')).emails.some((e) => e.id === s6row.id))
  const s6del = await api(B, 'DELETE', `/api/emails/${s6row.id}`)
  check('S6 delete from Archive is a MOVE (not permanent)', s6del.status === 200 && s6del.json?.permanentlyDeleted === undefined && (s6del.json?.movedIds || []).includes(s6row.id), JSON.stringify(s6del.json || {}))
  check('S6 Archive view no longer lists it', !(await listFolder(B, 'archive')).emails.some((e) => e.id === s6row.id))
  check('S6 Trash view lists it', (await listFolder(B, 'trash')).emails.some((e) => e.id === s6row.id))
  await api(B, 'PUT', `/api/emails/${s6row.id}`, { restoreConversation: true })
  const s6back = (await api(B, 'GET', `/api/emails/${s6row.id}`)).json?.email
  check('S6 restore unarchives to Inbox', s6back?.folder === 'inbox' && s6back?.isArchived === false, JSON.stringify({ folder: s6back?.folder, isArchived: s6back?.isArchived }))

  // ────────────────────────────────────────────────────────────────────────
  // S7 — Snoozed: delete → Trash with the snooze ENDED (the row must be
  //      VISIBLE in Trash, not filtered out by snoozedUntil), restore → Inbox.
  // ────────────────────────────────────────────────────────────────────────
  const s7Subject = `S7 snoozed delete ${stamp}`
  await send(A, bEmail, s7Subject)
  const s7row = await inboxCopyFor(bEmail, s7Subject)
  const s7snooze = await api(B, 'POST', `/api/emails/${s7row.id}/snooze`, { snoozeUntil: new Date(Date.now() + 3600_000).toISOString() })
  check('S7 snooze -> 200', s7snooze.status === 200, JSON.stringify(s7snooze.json?.error || ''))
  check('S7 Snoozed view lists it', (await listFolder(B, 'snoozed')).emails.some((e) => e.id === s7row.id))
  await api(B, 'DELETE', `/api/emails/${s7row.id}`)
  const s7trashRow = (await api(B, 'GET', `/api/emails/${s7row.id}`)).json?.email
  check('S7 Trash view lists it with snooze ended', s7trashRow?.folder === 'trash' && s7trashRow?.snoozedUntil === null, JSON.stringify({ folder: s7trashRow?.folder, snoozedUntil: s7trashRow?.snoozedUntil }))
  check('S7 Snoozed view no longer lists it', !(await listFolder(B, 'snoozed')).emails.some((e) => e.id === s7row.id))
  await api(B, 'PUT', `/api/emails/${s7row.id}`, { restoreConversation: true })
  check('S7 restore returns it to Inbox', ((await api(B, 'GET', `/api/emails/${s7row.id}`)).json?.email?.folder) === 'inbox')

  // ────────────────────────────────────────────────────────────────────────
  // S8 — Spam: delete → Trash (anchor always moves), restore returns it to
  //      Spam (literal undo of the delete).
  // ────────────────────────────────────────────────────────────────────────
  const s8Subject = `S8 spam delete ${stamp}`
  await send(A, bEmail, s8Subject)
  const s8row = await inboxCopyFor(bEmail, s8Subject)
  const s8spam = await api(B, 'POST', `/api/emails/${s8row.id}/report-spam`)
  check('S8 report-spam -> 200', s8spam.status === 200, JSON.stringify(s8spam.json?.error || ''))
  await api(B, 'DELETE', `/api/emails/${s8row.id}`)
  const s8trashRow = (await api(B, 'GET', `/api/emails/${s8row.id}`)).json?.email
  check('S8 Trash view lists the trashed spam row (trashedFrom=spam)', s8trashRow?.folder === 'trash' && s8trashRow?.trashedFrom === 'spam', JSON.stringify({ folder: s8trashRow?.folder, trashedFrom: s8trashRow?.trashedFrom }))
  await api(B, 'PUT', `/api/emails/${s8row.id}`, { restoreConversation: true })
  check('S8 restore returns it to Spam (previous folder)', ((await api(B, 'GET', `/api/emails/${s8row.id}`)).json?.email?.folder) === 'spam')

  // ────────────────────────────────────────────────────────────────────────
  // S9 — Conversation: deleting from Inbox moves the WHOLE thread for the
  //      deleting user's mailbox only; the sender's own sent copy is a
  //      SEPARATE row the delete never touches; restore returns the
  //      conversation; the sent copy is deleted independently into Trash.
  // ────────────────────────────────────────────────────────────────────────
  const s9Subject = `S9 conversation delete ${stamp}`
  const s9root = await send(A, bEmail, s9Subject)
  const s9rootB = s9root.json?.email // B's inbox copy (primary)
  const s9reply = await api(B, 'POST', `/api/emails/${s9rootB.id}/reply`, { body: `reply to ${s9Subject}` })
  check('S9 reply -> 201', s9reply.status === 201, JSON.stringify(s9reply.json?.error || ''))
  // A answers back — now B's mailbox holds TWO received copies of one thread
  // (the root and A's reply), the shape the conversation move exists for.
  const s9replyAcopy = await prisma.email.findFirst({ where: { recipientEmail: aEmail, folder: 'inbox', subject: `Re: ${s9Subject}` } })
  check("S9 A received B's reply copy", !!s9replyAcopy)
  const s9reply2 = await api(A, 'POST', `/api/emails/${s9replyAcopy.id}/reply`, { body: `answer from A ${s9Subject}` })
  check('S9 A reply -> 201', s9reply2.status === 201, JSON.stringify(s9reply2.json?.error || ''))
  const s9bReceived = await prisma.email.findMany({ where: { recipientEmail: bEmail, folder: 'inbox', subject: { in: [s9Subject, `Re: ${s9Subject}`] } } })
  check('S9 B mailbox holds 2 received copies of the thread', s9bReceived.length === 2, `got ${s9bReceived.length}`)
  const s9bSent = await sentCopyOf(Buser.id, `Re: ${s9Subject}`)
  check('S9 B has own sent copy of the reply', !!s9bSent)

  // Delete the conversation anchored on the newest representative.
  const s9anchor = s9bReceived.find((r) => r.subject === `Re: ${s9Subject}`) || s9bReceived[0]
  const s9del = await api(B, 'DELETE', `/api/emails/${s9anchor.id}`)
  const s9moved = s9del.json?.movedIds || []
  const s9bCopies = await prisma.email.findMany({ where: { id: { in: s9bReceived.map((r) => r.id) } } })
  check('S9 deleting the conversation moves EVERY mailbox copy to Trash', s9del.status === 200 && s9moved.length >= 2 && s9bCopies.every((r) => r.folder === 'trash' && r.trashedFrom === 'inbox'), `moved=${s9moved.length}`)
  check('S9 B sent copy NOT touched by the inbox delete', (await prisma.email.findUnique({ where: { id: s9bSent.id } }))?.folder === 'sent')
  check('S9 A mailbox untouched (reply inbox copy live, A sent copies live)', (await prisma.email.count({ where: { recipientEmail: aEmail, folder: 'inbox', subject: `Re: ${s9Subject}` } })) === 1 && (await prisma.email.count({ where: { senderId: Auser.id, folder: 'sent', subject: { in: [s9Subject, `Re: ${s9Subject}`] } } })) === 2, `inbox=${await prisma.email.count({ where: { recipientEmail: aEmail, folder: 'inbox', subject: `Re: ${s9Subject}` } })} sent=${await prisma.email.count({ where: { senderId: Auser.id, folder: 'sent', subject: { in: [s9Subject, `Re: ${s9Subject}`] } } })}`)
  check('S9 B Inbox view empty of the thread', !(await listFolder(B, 'inbox')).emails.some((e) => [s9Subject, `Re: ${s9Subject}`].includes(e.subject)))
  check('S9 Trash shows the conversation folded (>=1 row, both members trashed)', (await listFolder(B, 'trash')).emails.some((e) => [s9Subject, `Re: ${s9Subject}`].includes(e.subject)))

  const s9restore = await api(B, 'PUT', `/api/emails/${s9anchor.id}`, { restoreConversation: true })
  check('S9 restore brings the whole conversation back (restoredCount>=2)', s9restore.status === 200 && (s9restore.json?.restoredCount || 0) >= 2, `restored=${s9restore.json?.restoredCount}`)
  check('S9 restored rows are back in Inbox', (await prisma.email.count({ where: { recipientEmail: bEmail, folder: 'inbox', subject: { in: [s9Subject, `Re: ${s9Subject}`] } } })) === 2)

  const s9sentDel = await api(B, 'DELETE', `/api/emails/${s9bSent.id}`)
  const s9sentAfter = await prisma.email.findUnique({ where: { id: s9bSent.id } })
  check('S9 deleting own sent copy from Sent moves IT to Trash independently', s9sentDel.status === 200 && s9sentAfter?.folder === 'trash' && s9sentAfter?.trashedFrom === 'sent', JSON.stringify(s9sentDel.json?.error || ''))
  // Purge it again (trash branch = explicit permanent) so later scenarios
  // see a deterministic trash state.
  await api(B, 'DELETE', `/api/emails/${s9bSent.id}`)
  check('S9 trashed sent copy purged permanently', (await prisma.email.findUnique({ where: { id: s9bSent.id } })) === null)

  // ────────────────────────────────────────────────────────────────────────
  // S10 — Search results: delete moves to Trash; searching INSIDE Trash is
  //       still mailbox-scoped (the AND-merge keeps the scope + search OR
  //       group independent).
  // ────────────────────────────────────────────────────────────────────────
  const s10Subject = `S10 searchdelete ${stamp} zqxjkw`
  await send(A, bEmail, s10Subject)
  const s10row = await inboxCopyFor(bEmail, s10Subject)
  const s10search = await listFolder(B, 'inbox', `&search=zqxjkw`)
  check('S10 search results list the mail', s10search.emails.some((e) => e.id === s10row.id))
  await api(B, 'DELETE', `/api/emails/${s10row.id}`)
  check('S10 deleted-from-search mail sits in Trash', (await listFolder(B, 'trash')).emails.some((e) => e.id === s10row.id))
  const s10trashSearch = await listFolder(B, 'trash', `&search=zqxjkw`)
  check('S10 search inside Trash finds it (scope preserved under search)', s10trashSearch.emails.some((e) => e.id === s10row.id), `total=${s10trashSearch.total}`)
  // Restore it out of Trash so the S16 empty-trash count stays deterministic.
  await api(B, 'PUT', `/api/emails/${s10row.id}`, { restoreConversation: true })

  // ────────────────────────────────────────────────────────────────────────
  // S11 — Custom folders: delete from a custom-folder view moves to Trash;
  //       restore returns the row to the CUSTOM folder (the marker carries
  //       any folder name, not just the five system ones).
  // ────────────────────────────────────────────────────────────────────────
  const s11Folder = `Clients ${stamp}`
  const s11folderRes = await api(A, 'POST', '/api/folders', { name: s11Folder, color: '#4285F4' })
  check('S11 custom folder created', (s11folderRes.status === 200 || s11folderRes.status === 201) && !!s11folderRes.json?.folder?.id, `status=${s11folderRes.status} body=${JSON.stringify(s11folderRes.json).slice(0, 140)}`)
  const s11row = await prisma.email.create({
    data: { senderId: Buser.id, recipientEmail: aEmail, subject: `S11 custom-folder mail ${stamp}`, body: 'filed in custom folder', folder: s11Folder },
  })
  check('S11 custom-folder view lists the filed mail', (await listFolder(A, encodeURIComponent(s11Folder))).emails.some((e) => e.id === s11row.id))
  await api(A, 'DELETE', `/api/emails/${s11row.id}`)
  const s11trashRow = (await api(A, 'GET', `/api/emails/${s11row.id}`)).json?.email
  check('S11 delete from custom folder -> Trash (trashedFrom=custom name)', s11trashRow?.folder === 'trash' && s11trashRow?.trashedFrom === s11Folder, JSON.stringify({ folder: s11trashRow?.folder, trashedFrom: s11trashRow?.trashedFrom }))
  await api(A, 'PUT', `/api/emails/${s11row.id}`, { restoreConversation: true })
  check('S11 restore returns it to the CUSTOM folder', ((await api(A, 'GET', `/api/emails/${s11row.id}`)).json?.email?.folder) === s11Folder)

  // ────────────────────────────────────────────────────────────────────────
  // S12 — Labels: deleting from a label-filtered view moves to Trash.
  // ────────────────────────────────────────────────────────────────────────
  const s12label = await api(A, 'POST', '/api/labels', { name: `VIP ${stamp}`, color: '#4285F4' })
  const s12labelId = s12label.json?.label?.id || s12label.json?.data?.id || s12label.json?.id
  check('S12 label created', (s12label.status === 200 || s12label.status === 201) && !!s12labelId, `status=${s12label.status} body=${JSON.stringify(s12label.json).slice(0, 140)}`)
  const s12row = await inboxCopyFor(aEmail, `S12 label mail ${stamp}`) || null
  const s12seed = s12row || (await send(B, aEmail, `S12 label mail ${stamp}`)).json?.email
  await api(A, 'POST', `/api/emails/${s12seed.id}/labels`, { labelIds: [s12labelId] })
  check('S12 label-filtered inbox view lists the mail', (await listFolder(A, 'inbox', `&label=${s12labelId}`)).emails.some((e) => e.id === s12seed.id))
  await api(A, 'DELETE', `/api/emails/${s12seed.id}`)
  check('S12 delete from label view -> Trash', (await listFolder(A, 'trash')).emails.some((e) => e.id === s12seed.id))

  // ────────────────────────────────────────────────────────────────────────
  // S13/S20 — Cross-mailbox isolation: a sent copy the AUTHOR trashed must
  //           NEVER surface in the recipient's Trash (was: leaked in via
  //           recipientEmail), must not be restorable or destroyable by the
  //           recipient, and must not leak through a Trash search.
  // ────────────────────────────────────────────────────────────────────────
  const s13Subject = `S13 foreign sent ${stamp} zqxjkw`
  await send(A, bEmail, s13Subject)
  const s13sent = await sentCopyOf(Auser.id, s13Subject)
  await api(A, 'DELETE', `/api/emails/${s13sent.id}`) // A trashes their sent copy
  check('S13 author-side trashed sent copy NOT in recipient Trash view', !(await listFolder(B, 'trash')).emails.some((e) => e.id === s13sent.id))
  check('S13 Trash SEARCH cannot surface the foreign row either', !(await listFolder(B, 'trash', `&search=zqxjkw`)).emails.some((e) => e.id === s13sent.id))
  const s13bRestore = await api(B, 'PUT', `/api/emails/${s13sent.id}`, { restoreConversation: true })
  check('S13 recipient restore attempt is a no-op (restoredCount=0)', s13bRestore.status === 200 && (s13bRestore.json?.restoredCount || 0) === 0, `restored=${s13bRestore.json?.restoredCount}`)
  const s13bPurge = await api(B, 'DELETE', `/api/emails/${s13sent.id}`)
  check('S13 recipient permanent-delete attempt destroys NOTHING', s13bPurge.status === 200 && (s13bPurge.json?.deletedCount || 0) === 0, `deleted=${s13bPurge.json?.deletedCount}`)
  const s13row = await prisma.email.findUnique({ where: { id: s13sent.id } })
  check('S13 the row still exists, still in the AUTHOR trash only', !!s13row && s13row.folder === 'trash' && s13row.trashedFrom === 'sent')

  // ────────────────────────────────────────────────────────────────────────
  // S14 — Foreign DRAFT isolation: a draft B authored to A and trashed is
  //       invisible to A, un-restorable by A, restorable by B.
  // ────────────────────────────────────────────────────────────────────────
  const s14 = await api(B, 'POST', '/api/drafts', { to: aEmail, subject: `S14 foreign draft ${stamp}`, body: 'not yours' })
  const s14id = s14.json?.draft?.id
  await api(B, 'DELETE', `/api/emails/${s14id}?trash=1`)
  check('S14 author-side trashed draft NOT in recipient Trash view', !(await listFolder(A, 'trash')).emails.some((e) => e.id === s14id))
  const s14aRestore = await api(A, 'PUT', `/api/emails/${s14id}`, { restoreConversation: true })
  check('S14 recipient restore attempt on foreign draft is a no-op', s14aRestore.status === 200 && (s14aRestore.json?.restoredCount || 0) === 0)
  await api(B, 'PUT', `/api/emails/${s14id}`, { restoreConversation: true })
  check('S14 author restores their own draft back to Drafts', (await listFolder(B, 'drafts')).emails.some((e) => e.id === s14id))

  // ────────────────────────────────────────────────────────────────────────
  // S15 — Legacy rows (trashed before the marker existed, trashedFrom=null)
  //       stay visible in Trash and restore to Inbox via the fallback.
  // ────────────────────────────────────────────────────────────────────────
  const s15row = await prisma.email.create({
    data: { senderId: Auser.id, recipientEmail: bEmail, subject: `S15 legacy trashed ${stamp}`, body: 'trashed before the marker existed', folder: 'trash', trashedFrom: null, isDraft: false },
  })
  check('S15 legacy unmarked trash row is VISIBLE in Trash view', (await listFolder(B, 'trash')).emails.some((e) => e.id === s15row.id))
  await api(B, 'PUT', `/api/emails/${s15row.id}`, { restoreConversation: true })
  check('S15 legacy row restores to Inbox via the fallback', ((await api(B, 'GET', `/api/emails/${s15row.id}`)).json?.email?.folder) === 'inbox')

  // ────────────────────────────────────────────────────────────────────────
  // S16 — Empty Trash: permanently deletes EXACTLY the user's trash rows
  //       (received copies + own trashed sent copies + own trashed drafts),
  //       never live mail, never another user's trash rows.
  // ────────────────────────────────────────────────────────────────────────
  const s16a = await send(A, bEmail, `S16 received ${stamp}`)
  const s16recv = s16a.json?.email
  await api(B, 'DELETE', `/api/emails/${s16recv.id}`) // B's received copy -> trash
  const s16sentMail = await send(A, bEmail, `S16 sent ${stamp}`)
  const s16sentCopy = await sentCopyOf(Auser.id, `S16 sent ${stamp}`)
  await api(A, 'DELETE', `/api/emails/${s16sentCopy.id}`) // A's sent copy -> trash
  const s16draft = await api(B, 'POST', '/api/drafts', { to: aEmail, subject: `S16 draft ${stamp}`, body: 'empty me' })
  const s16draftId = s16draft.json?.draft?.id
  await api(B, 'DELETE', `/api/emails/${s16draftId}?trash=1`) // B's draft -> trash
  // B's OWN trashed sent copy — the third clause empty-trash must cover.
  await send(B, aEmail, `S16 bsent ${stamp}`)
  const s16bsent = await sentCopyOf(Buser.id, `S16 bsent ${stamp}`)
  await api(B, 'DELETE', `/api/emails/${s16bsent.id}`)
  check('S16 B own sent copy trashed before empty', (await prisma.email.findUnique({ where: { id: s16bsent.id } }))?.folder === 'trash')
  const s16live = (await send(A, bEmail, `S16 live ${stamp}`)).json?.email // stays LIVE in B inbox
  const s16foreign = s13sent // A-side trash row from S13 (author-trashed sent copy)

  const s16empty = await api(B, 'POST', '/api/emails/empty-trash')
  check('S16 empty-trash -> 200 with deletedCount=3 (received+sent+draft)', s16empty.status === 200 && s16empty.json?.deletedCount === 3, JSON.stringify(s16empty.json || {}))
  check('S16 trashed received copy gone', (await prisma.email.findUnique({ where: { id: s16recv.id } })) === null)
  check('S16 B trashed sent copy gone', (await prisma.email.findUnique({ where: { id: s16bsent.id } })) === null)
  check('S16 B live inbox mail untouched', (await prisma.email.findUnique({ where: { id: s16live.id } }))?.folder === 'inbox')
  check('S16 A trashed sent copy untouched (other user trash not emptied)', (await prisma.email.findUnique({ where: { id: s16foreign.id } }))?.folder === 'trash')
  check('S16 B trash view now empty of the emptied rows', !(await listFolder(B, 'trash')).emails.some((e) => [s16recv.id, s16draftId].includes(e.id)))
  const s16aPurge = await api(A, 'DELETE', `/api/emails/${s16sentCopy.id}`)
  check('S16 A can still purge their own trashed sent copy afterwards', s16aPurge.status === 200 && ((s16aPurge.json?.deletedCount || 0) >= 1 || s16aPurge.json?.permanentlyDeleted === true), JSON.stringify(s16aPurge.json || {}))

  // ────────────────────────────────────────────────────────────────────────
  // S17 — Rules engine: the 'delete' action moves matching mail to Trash
  //       WITH provenance + visibility flags (was: bare folder write that
  //       kept isArchived/snoozedUntil and never stamped origin).
  // ────────────────────────────────────────────────────────────────────────
  const s17token = `RULETRASH${stamp}`
  const s17r1 = await prisma.email.create({ data: { senderId: Auser.id, recipientEmail: bEmail, subject: `S17 rule ${s17token}`, body: 'rule one', folder: 'inbox' } })
  const s17r2 = await prisma.email.create({ data: { senderId: Auser.id, recipientEmail: bEmail, subject: `S17 rule two ${s17token}`, body: 'rule two', folder: 'inbox', isArchived: true } })
  const s17rule = await prisma.rule.create({
    data: {
      userId: Buser.id,
      name: `S17 rule ${stamp}`,
      conditions: JSON.stringify([{ field: 'subject', operator: 'contains', value: s17token }]),
      actions: JSON.stringify([{ type: 'delete' }]),
      isEnabled: true,
    },
  })
  const s17run = await api(B, 'POST', `/api/rules/${s17rule.id}/run`)
  check('S17 rule run -> 200', s17run.status === 200, JSON.stringify(s17run.json?.error || ''))
  const s17rows = await prisma.email.findMany({ where: { id: { in: [s17r1.id, s17r2.id] } } })
  check('S17 rule delete moved both rows to Trash with provenance + flags cleared', s17rows.every((r) => r.folder === 'trash' && r.trashedFrom === 'inbox' && r.isArchived === false && r.snoozedUntil === null), JSON.stringify(s17rows.map((r) => ({ f: r.folder, tf: r.trashedFrom, ar: r.isArchived }))))
  check('S17 Trash view lists rule-trashed mail', (await listFolder(B, 'trash')).emails.some((e) => e.id === s17r1.id))
  await api(B, 'PUT', `/api/emails/${s17r1.id}`, { restoreConversation: true })
  check('S17 rule-trashed mail restores to Inbox (where the rule found it)', ((await api(B, 'GET', `/api/emails/${s17r1.id}`)).json?.email?.folder) === 'inbox')

  // ────────────────────────────────────────────────────────────────────────
  // S18 — The generic PUT {folder:'trash'} path stamps provenance too, and
  //       moving OUT of trash clears it (marker can never lie).
  // ────────────────────────────────────────────────────────────────────────
  const s18 = await send(A, bEmail, `S18 putfolder ${stamp}`)
  const s18row = s18.json?.email
  await api(B, 'PUT', `/api/emails/${s18row.id}`, { folder: 'trash' })
  const s18trashed = (await api(B, 'GET', `/api/emails/${s18row.id}`)).json?.email
  check('S18 PUT folder=trash stamps trashedFrom=inbox', s18trashed?.folder === 'trash' && s18trashed?.trashedFrom === 'inbox', JSON.stringify({ folder: s18trashed?.folder, trashedFrom: s18trashed?.trashedFrom }))
  await api(B, 'PUT', `/api/emails/${s18row.id}`, { folder: 'inbox' })
  const s18back = (await api(B, 'GET', `/api/emails/${s18row.id}`)).json?.email
  check('S18 PUT folder out of trash clears the marker', s18back?.folder === 'inbox' && s18back?.trashedFrom === null, JSON.stringify({ folder: s18back?.folder, trashedFrom: s18back?.trashedFrom }))

  writeFileSync('/tmp/trash-e2e-results.json', JSON.stringify({ pass, fail, results }, null, 2))
  console.log(results.join('\n'))
  console.log(`\n== trash-deletion-e2e: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('SUITE ERROR:', err)
  process.exit(1)
})
