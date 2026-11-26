/**
 * Draft-ghost regression (owner report 2026-11-26: a message composed with
 * text + attachment, sent successfully, ALSO stayed in the Drafts page).
 *
 * ROOT CAUSE (client race, fixed in compose-modal.tsx): the send path reads
 * the draft anchor and deletes the auto-saved draft AFTER the attachment
 * upload + send window, but the 3s debounced autosave keeps running during
 * that window. A FIRST autosave (id=null) issued mid-upload can stall behind
 * the upload/send POSTs on a slow link and land after the cleanup already
 * read a null anchor - POST /api/drafts then creates a draft row nothing
 * ever deletes. The client fix freezes autosave on send-commit and awaits
 * the in-flight autosave before the cleanup deletes.
 *
 * This suite pins the SERVER contracts that fix relies on, over real HTTP:
 *   G1  autosave (POST /api/drafts id=null) creates a draft visible in Drafts
 *   G2  a send WITH a base64 attachment never writes drafts rows server-side
 *       (after send, before any client cleanup, Drafts holds exactly the
 *       pre-existing autosave row - nothing added)
 *   G3  the client cleanup (DELETE the draft id) empties Drafts - no ghost
 *   G4  POST /api/drafts with a DELETED draft id -> 404, no resurrection
 *   G5  a straggler id=null autosave AFTER the send DOES create a Drafts row
 *       (the exact race surface the client-side freeze must prevent)
 *   G6  the attachment payload survives sanitization intact on the sent copy
 * Runs with: bash scripts/run-draft-ghost-e2e.sh
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const BASE = 'http://127.0.0.1:3006'
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
  const id = `dgh_${Math.random().toString(36).slice(2, 10)}`
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

const draftIds = async (cj, subject) => {
  const res = await api(cj, 'GET', '/api/emails?folder=drafts&page=1&limit=50')
  const rows = (res.json?.emails || []).filter((r) => r.subject === subject)
  return { res, rows }
}

const run = async () => {
  const stamp = Date.now()
  const sEmail = `dgh.s.${stamp}@ezy.af`
  const rEmail = `dgh.r.${stamp}@ezy.af`
  await seedUser(sEmail, 'Sara', 'Ghost')
  await seedUser(rEmail, 'Ray', 'Ghost')
  const S = await login(sEmail)

  const subject = `Ghost ${stamp}`
  const bodyText = 'contract copy for the Kabul client'
  const html = '<p>contract copy for the Kabul client</p>'

  // ── G1: autosave #1 (id=null) creates a draft row visible in Drafts ──
  const auto1 = await api(S, 'POST', '/api/drafts', {
    id: null, to: rEmail, subject, body: bodyText, bodyHtml: html,
  })
  check('G1 autosave (id=null) -> 200 with draft id', auto1.status === 200 && !!auto1.json?.draft?.id, JSON.stringify(auto1.json?.error || ''))
  const draftId = auto1.json?.draft?.id
  const before = await draftIds(S, subject)
  check('G1 the autosave row is visible in Drafts (exactly one)', before.res.status === 200 && before.rows.length === 1, `got ${before.rows.length}`)

  // ── G2: send WITH a base64 attachment; the send path itself must not
  //       write drafts rows (after send, BEFORE any client cleanup) ──
  const pdfBytes = Buffer.from('%PDF-1.4\n% draft-ghost e2e attachment payload\n')
  const attachment = {
    name: 'contract.pdf',
    url: `/api/attachments/tmp_${stamp}_contract.pdf`,
    size: pdfBytes.length,
    type: 'application/pdf',
    data: `data:application/pdf;base64,${pdfBytes.toString('base64')}`,
  }
  const send = await api(S, 'POST', '/api/emails', {
    to: rEmail,
    subject,
    body: bodyText,
    bodyHtml: html,
    attachments: [attachment],
  })
  check('G2 send with attachment -> 201', send.status === 201, JSON.stringify(send.json?.error || ''))
  const sentCopyId = send.json?.email?.id
  check('G2 send returned the delivered inbox copy', !!sentCopyId)
  const afterSend = await draftIds(S, subject)
  check('G2 Drafts after send = exactly the pre-existing autosave row (send never writes drafts)', afterSend.res.status === 200 && afterSend.rows.length === 1 && afterSend.rows[0].id === draftId, `got ${afterSend.rows.length} rows`)
  const sentList = await api(S, 'GET', '/api/emails?folder=sent&page=1&limit=50')
  const sentRows = (sentList.json?.emails || []).filter((r) => r.subject === subject)
  check('G2 sent folder holds the sent copy', sentList.status === 200 && sentRows.length === 1, `got ${sentRows.length}`)

  // ── G3: the client cleanup (DELETE the autosave id) empties Drafts ──
  const del = await api(S, 'DELETE', `/api/emails/${draftId}`)
  check('G3 DELETE autosave draft -> permanentlyDeleted', del.status === 200 && del.json?.permanentlyDeleted === true, JSON.stringify(del.json?.error || ''))
  const afterCleanup = await draftIds(S, subject)
  check('G3 Drafts EMPTY after the cleanup (no ghost)', afterCleanup.res.status === 200 && afterCleanup.rows.length === 0, `got ${afterCleanup.rows.length}`)

  // ── G4: stale-id autosave against the DELETED draft -> 404, no row ──
  const stale = await api(S, 'POST', '/api/drafts', {
    id: draftId, to: rEmail, subject, body: bodyText, bodyHtml: html,
  })
  check('G4 POST /api/drafts with deleted id -> 404 (no resurrection)', stale.status === 404, `got ${stale.status}`)
  const afterStale = await draftIds(S, subject)
  check('G4 Drafts still empty after the stale-id attempt', afterStale.rows.length === 0, `got ${afterStale.rows.length}`)

  // ── G5: a straggler id=null autosave AFTER the send DOES create a row —
  //       the race surface the client-side freeze closes; the server cannot
  //       distinguish it from a legitimate new draft ──
  const straggler = await api(S, 'POST', '/api/drafts', {
    id: null, to: rEmail, subject, body: bodyText, bodyHtml: html,
  })
  check('G5 straggler id=null autosave -> 200 with NEW draft id', straggler.status === 200 && !!straggler.json?.draft?.id && straggler.json.draft.id !== draftId, JSON.stringify(straggler.json?.error || ''))
  const afterStraggler = await draftIds(S, subject)
  check('G5 the straggler row shows up in Drafts (this is the ghost)', afterStraggler.rows.length === 1, `got ${afterStraggler.rows.length}`)
  const del2 = await api(S, 'DELETE', `/api/emails/${straggler.json.draft.id}`)
  check('G5 straggler row removable via the same cleanup', del2.status === 200 && del2.json?.permanentlyDeleted === true)

  // ── G6: the attachment survived sanitization on the delivered copy ──
  const detail = await api(S, 'GET', `/api/emails/${sentCopyId}`)
  const atts = detail.json?.email?.attachments
  let attName = null
  try { attName = JSON.parse(atts || '[]')[0]?.name } catch {}
  check('G6 sent copy detail carries the sanitized attachment (data stripped)', detail.status === 200 && attName === 'contract.pdf', `atts=${atts ? atts.slice(0, 80) : 'null'}`)
  // The sender's thread holds the SENT twin (dedupeThreadForViewer prefers
  // the viewer's own copy), so scan the whole thread for the attachment.
  const threadHasAtt = (detail.json?.thread || []).some((m) => {
    try { return JSON.parse(m.attachments || '[]')[0]?.name === 'contract.pdf' } catch { return false }
  })
  check('G6 attachment metadata present on the thread message too', threadHasAtt, `thread=${(detail.json?.thread || []).length} rows`)

  writeFileSync('/tmp/draft-ghost-results.json', JSON.stringify({ pass, fail, results }, null, 2))
  console.log(results.join('\n'))
  console.log(`\n== draft-ghost-e2e: ${pass} passed, ${fail} failed ==`)
  process.exit(fail === 0 ? 0 : 1)
}

run().catch(async (err) => {
  console.error('SUITE ERROR:', err)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
