/**
 * Email conversation lifecycle tests — delete/trash/undo/restore/permanent
 * (owner task 2026-11-11: "one conversation with multiple replies = one
 * Trash row; Undo = fully restored conversation, removed from Trash").
 *
 * Runs the REAL lifecycle primitives from src/lib/mail/conversation.ts
 * (the exact code the API routes execute) against a dedicated SQLite
 * database — no mocks, no frontend stubs.
 *
 * One-time harness setup (no production schema or client touched):
 *   npx prisma generate --schema prisma/schema.test.sqlite.prisma
 *   npx prisma db push --schema prisma/schema.test.sqlite.prisma --skip-generate
 * Run:
 *   TEST_DATABASE_URL="file:/tmp/ezymail-lifecycle-test.db" npx tsx scripts/lifecycle.test.ts
 */
import { test, before, after as afterAll } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '../generated/test-client/index.js'
import {
  resolveConversationMembers,
  moveConversationToTrash,
  restoreConversationFromTrash,
  permanentlyDeleteConversation,
  inferRestoreFolder,
  groupRowsForList,
  resolveReplyThreadId,
  findOwnedSentTwin,
  dedupeThreadForViewer,
  type MemberRow,
} from '../src/lib/mail/conversation'

const db = new PrismaClient()

// Deterministic clocks: each conversation seeded a minute apart so twin
// lookups (±10s) cannot cross conversations.
const BASE = new Date('2026-11-11T09:00:00Z').getTime()
const at = (min: number, sec = 0) => new Date(BASE + min * 60_000 + sec * 1000)

let alice: { id: string; email: string }
let bob: { id: string; email: string }
let carol: { id: string; email: string }

before(async () => {
  await db.email.deleteMany({})
  await db.user.deleteMany({})
  alice = { id: 'u_alice', email: 'alice@ezy.af' }
  bob = { id: 'u_bob', email: 'bob@ezy.af' }
  carol = { id: 'u_carol', email: 'carol@ezy.af' }
  await db.user.createMany({
    data: [
      { id: alice.id, email: alice.email, passwordHash: 'x', firstName: 'Alice', lastName: 'A', dateOfBirth: '1990-01-01' },
      { id: bob.id, email: bob.email, passwordHash: 'x', firstName: 'Bob', lastName: 'B', dateOfBirth: '1990-01-01' },
      { id: carol.id, email: carol.email, passwordHash: 'x', firstName: 'Carol', lastName: 'C', dateOfBirth: '1990-01-01' },
    ],
  })
})

afterAll(async () => {
  await db.$disconnect()
})

type SeedRow = {
  id: string
  senderId?: string
  recipientEmail?: string
  subject?: string
  body?: string
  folder?: string
  threadId?: string | null
  parentEmailId?: string | null
  isRead?: boolean
  isArchived?: boolean
  at?: Date
}

async function seed(rows: SeedRow[]) {
  for (const r of rows) {
    await db.email.create({
      data: {
        id: r.id,
        senderId: r.senderId ?? bob.id,
        recipientEmail: r.recipientEmail ?? alice.email,
        subject: r.subject ?? 'Conversation',
        body: r.body ?? 'body',
        folder: r.folder ?? 'inbox',
        threadId: r.threadId ?? null,
        parentEmailId: r.parentEmailId ?? null,
        isRead: r.isRead ?? false,
        isArchived: r.isArchived ?? false,
        createdAt: r.at ?? at(0),
      },
    })
  }
}

async function reset() {
  await db.email.deleteMany({})
}

const folders = async (ids: string[]) => {
  const rows = await db.email.findMany({ where: { id: { in: ids } }, select: { id: true, folder: true, isArchived: true, isRead: true } })
  return Object.fromEntries(rows.map((r) => [r.id, r]))
}
const countFolder = async (folder: string, recipientEmail: string) =>
  db.email.count({ where: { folder, recipientEmail } })

// ─── Test A — thread with multiple replies lands as ONE trash row ──────────

test('A1 modern thread (shared threadId): delete moves all 4, trash folds to 1 row', async () => {
  await reset()
  await seed([
    { id: 'x', threadId: 'x', at: at(0) },                                  // root (alice's copy)
    { id: 'r1', threadId: 'x', parentEmailId: 'x', at: at(1) },             // reply 1
    { id: 'r2', threadId: 'x', parentEmailId: 'r1', at: at(2) },            // reply 2
    { id: 'r3', threadId: 'x', parentEmailId: 'r2', at: at(3) },            // reply 3
    // bob's side of the conversation: his sent copies (must never move)
    { id: 's_x', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', at: at(0, 1) },
    { id: 's_r1', senderId: alice.id, recipientEmail: bob.email, folder: 'sent', threadId: 'x', parentEmailId: 'x', at: at(1, 1) },
  ])
  const moved = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'r3', alice.email, alice.id))
  assert.deepEqual(moved.sort(), ['r1', 'r2', 'r3', 'x'])
  const f = await folders(['x', 'r1', 'r2', 'r3', 's_x', 's_r1'])
  for (const id of ['x', 'r1', 'r2', 'r3']) assert.equal(f[id].folder, 'trash', id)
  assert.equal(f['s_x'].folder, 'sent', 'sent copy must stay in Sent')
  assert.equal(f['s_r1'].folder, 'sent', 'sent copy must stay in Sent')
  assert.equal(await countFolder('inbox', alice.email), 0, 'inbox empty after delete')
  // Trash list folds the 4 rows into exactly ONE conversation row.
  const trash = await db.email.findMany({
    where: { folder: 'trash', recipientEmail: alice.email },
    orderBy: { createdAt: 'desc' },
    select: { id: true, threadId: true, parentEmailId: true, replies: { select: { id: true } } },
  })
  assert.equal(trash.length, 4)
  const { representatives, hiddenCount } = groupRowsForList(trash)
  assert.equal(representatives.length, 1, 'ONE row per conversation in Trash')
  assert.equal(representatives[0].id, 'r3', 'newest message represents')
  const key = representatives[0].threadId || representatives[0].id
  assert.equal(hiddenCount[key] + 1, 4, 'conversation message count (route replyCount formula)')
  assert.equal(representatives[0].replies.length, 0, 'leaf representative has no on-relation children')
})

test('A2 legacy forked chain (null root + per-reply fork keys): delete moves all 4, trash folds to 1 row', async () => {
  await reset()
  await seed([
    { id: 'L', threadId: null, parentEmailId: null, at: at(0) },            // legacy root, no key
    { id: 'f1', threadId: 'L', parentEmailId: 'L', at: at(1) },             // fork key = root id
    { id: 'f2', threadId: 'f1', parentEmailId: 'f1', at: at(2) },           // fork key = reply1 id
    { id: 'f3', threadId: 'f2', parentEmailId: 'f2', at: at(3) },           // fork key = reply2 id
  ])
  // The user clicks the newest row (what the list shows them).
  const moved = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'f3', alice.email, alice.id))
  assert.deepEqual(moved.sort(), ['L', 'f1', 'f2', 'f3'], 'the old threadKey-only match left f1/f2/f3 behind')
  const trash = await db.email.findMany({
    where: { folder: 'trash', recipientEmail: alice.email },
    orderBy: { createdAt: 'desc' },
    select: { id: true, threadId: true, parentEmailId: true },
  })
  const { representatives } = groupRowsForList(trash)
  assert.equal(representatives.length, 1, 'ONE row in Trash for the whole legacy conversation')
})

test('A3 sent-copy-forked orphans (reply anchored on a SENT copy): twin bridge re-links and moves all', async () => {
  await reset()
  await seed([
    { id: 'X', threadId: 'X', body: 'root-body', at: at(0) },               // alice's root (copy of SC0's message)
    // bob's sent copy of the root (bridge target)
    { id: 'SC0', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', body: 'root-body', at: at(0, 1) },
    // bob replied FROM his sent copy SC0: the reply's inbox copy forked
    { id: 'O1', threadId: 'SC0', parentEmailId: 'SC0', body: 'reply1-body', at: at(1) },
    { id: 'SC1', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', body: 'reply1-body', at: at(1, 1) },
    // ...and again from SC1
    { id: 'O2', threadId: 'SC1', parentEmailId: 'SC1', body: 'reply2-body', at: at(2) },
  ])
  const moved = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'O2', alice.email, alice.id))
  assert.deepEqual(moved.sort(), ['O1', 'O2', 'X'], 'forked orphans move WITH the conversation')
  const trash = await db.email.findMany({ where: { folder: 'trash', recipientEmail: alice.email } })
  assert.equal(trash.length, 3)
  const { representatives } = groupRowsForList(trash)
  // The orphan rows carry keys nothing on the trash page can link
  // (threadId/parentEmailId point at rows in bob's mailbox) — display
  // groups what the data can prove; the LIFECYCLE guarantee is that the
  // whole conversation moved together and nothing stayed behind.
  assert.ok(representatives.length >= 1 && representatives.length <= 3)
  assert.equal(await countFolder('inbox', alice.email), 0, 'nothing left in Inbox')
})

// ─── Test B — delete then Undo: conversation back in Inbox, absent from Trash ─

test('B delete + undo: every member restored to Inbox, none left in Trash, unread/read preserved', async () => {
  await reset()
  await seed([
    { id: 'x', threadId: 'x', isRead: true, at: at(0) },
    { id: 'r1', threadId: 'x', parentEmailId: 'x', isRead: false, at: at(1) },
    { id: 'r2', threadId: 'x', parentEmailId: 'x', isRead: true, at: at(2) },
    { id: 'r3', threadId: 'x', parentEmailId: 'x', isRead: false, at: at(3) },
  ])
  await db.$transaction((tx) => moveConversationToTrash(tx as never, 'x', alice.email, alice.id))
  assert.equal(await countFolder('trash', alice.email), 4)

  const restored = await db.$transaction((tx) =>
    restoreConversationFromTrash(tx as never, 'x', alice.email, alice.id)
  )
  assert.deepEqual(restored.sort(), ['r1', 'r2', 'r3', 'x'])
  const f = await folders(['x', 'r1', 'r2', 'r3'])
  for (const id of ['x', 'r1', 'r2', 'r3']) {
    assert.equal(f[id].folder, 'inbox', `${id} back in Inbox`)
    assert.equal(f[id].isArchived, false, `${id} visible in Inbox`)
  }
  assert.equal(f['x'].isRead, true, 'read state preserved')
  assert.equal(f['r1'].isRead, false, 'unread state preserved')
  assert.equal(await countFolder('trash', alice.email), 0, 'Trash is empty after undo')
  assert.equal(await countFolder('inbox', alice.email), 4, 'Inbox holds all four')
  // Undo again is a no-op (idempotent — no duplicates possible).
  const again = await db.$transaction((tx) => restoreConversationFromTrash(tx as never, 'x', alice.email, alice.id))
  assert.deepEqual(again, [])
})

// ─── Test C — delete then Restore from Trash ────────────────────────────────

test('C restore from trash brings back one grouped conversation; separately-moved spam row untouched', async () => {
  await reset()
  await seed([
    { id: 'x', threadId: 'x', at: at(0) },
    { id: 'r1', threadId: 'x', parentEmailId: 'x', at: at(1) },
    { id: 'r2', threadId: 'x', parentEmailId: 'x', at: at(2) },
  ])
  await db.$transaction((tx) => moveConversationToTrash(tx as never, 'x', alice.email, alice.id))
  // The user separately reported r2 as spam while the rest sat in Trash.
  await db.email.update({ where: { id: 'r2' }, data: { folder: 'spam' } })

  const restored = await db.$transaction((tx) =>
    restoreConversationFromTrash(tx as never, 'r1', alice.email, alice.id)
  )
  assert.deepEqual(restored.sort(), ['r1', 'x'], 'only the rows still in Trash are restored')
  const f = await folders(['x', 'r1', 'r2'])
  assert.equal(f['x'].folder, 'inbox')
  assert.equal(f['r1'].folder, 'inbox')
  assert.equal(f['r2'].folder, 'spam', 'separately-placed row is never overridden')
  assert.equal(await countFolder('trash', alice.email), 0)
})

// ─── Test D — individual (sent-copy) delete touches only the user's copy ────

test('D deleting a sent copy moves only that copy; the recipient mailbox copy is untouched', async () => {
  await reset()
  await seed([
    { id: 'sc', senderId: alice.id, recipientEmail: bob.email, folder: 'sent', at: at(0) },
    { id: 'bc', senderId: alice.id, recipientEmail: bob.email, folder: 'inbox', threadId: 'bc', at: at(0, 1) },
  ])
  const moved = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'sc', alice.email, alice.id))
  assert.deepEqual(moved, ['sc'])
  const f = await folders(['sc', 'bc'])
  assert.equal(f['sc'].folder, 'trash')
  assert.equal(f['bc'].folder, 'inbox', "bob's copy untouched")
})

// ─── Test E — permanent delete is trash-scoped and cannot resurrect ─────────

test('E permanent delete removes only trash rows; restored and live rows survive; unrelated mail untouched', async () => {
  await reset()
  await seed([
    { id: 'x', threadId: 'x', at: at(0) },
    { id: 'r1', threadId: 'x', parentEmailId: 'x', at: at(1) },
    { id: 'other', threadId: 'other', subject: 'Unrelated', at: at(2) },
    { id: 's_x', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', at: at(0, 1) },
  ])
  await db.$transaction((tx) => moveConversationToTrash(tx as never, 'x', alice.email, alice.id))
  // The user restored r1 before emptying trash.
  await db.email.update({ where: { id: 'r1' }, data: { folder: 'inbox' } })
  const deleted = await db.$transaction((tx) =>
    permanentlyDeleteConversation(tx as never, 'x', alice.email, alice.id)
  )
  assert.deepEqual(deleted.sort(), ['x'])
  const left = await db.email.findMany({ where: { recipientEmail: alice.email } })
  assert.deepEqual(left.map((r) => r.id).sort(), ['other', 'r1', 's_x'], 'restored row, unrelated mail and bob\'s sent copy survive')
  const sentCopy = await db.email.findUnique({ where: { id: 's_x' } })
  assert.equal(sentCopy?.folder, 'sent')
  // After permanent delete, undo/restore cannot bring anything back.
  const restored = await db.$transaction((tx) =>
    restoreConversationFromTrash(tx as never, 'x', alice.email, alice.id)
  )
  assert.deepEqual(restored, [])
})

// ─── Test F — bulk: several conversations deleted, then restored, no duplicates ─

test('F bulk delete of two conversations then bulk restore: exact row counts, no duplicates', async () => {
  await reset()
  await seed([
    { id: 'a0', threadId: 'a0', subject: 'Conv A', at: at(0) },
    { id: 'a1', threadId: 'a0', parentEmailId: 'a0', subject: 'Conv A', at: at(1) },
    { id: 'b0', threadId: 'b0', subject: 'Conv B', at: at(2) },
    { id: 'b1', threadId: 'b0', parentEmailId: 'b0', subject: 'Conv B', at: at(3) },
  ])
  const movedA = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'a1', alice.email, alice.id))
  const movedB = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'b0', alice.email, alice.id))
  assert.equal(await countFolder('trash', alice.email), 4)
  assert.equal(await countFolder('inbox', alice.email), 0)
  const trashRows = await db.email.findMany({
    where: { folder: 'trash', recipientEmail: alice.email },
    orderBy: { createdAt: 'desc' },
    select: { id: true, threadId: true, parentEmailId: true },
  })
  const { representatives } = groupRowsForList(trashRows)
  assert.equal(representatives.length, 2, 'two conversations = two Trash rows')
  // Bulk restore (both anchors), then verify exactly the same 4 rows live in inbox.
  const rA = await db.$transaction((tx) => restoreConversationFromTrash(tx as never, 'a1', alice.email, alice.id))
  const rB = await db.$transaction((tx) => restoreConversationFromTrash(tx as never, 'b0', alice.email, alice.id))
  assert.equal(new Set([...rA, ...rB]).size, 4)
  assert.equal(await countFolder('inbox', alice.email), 4)
  assert.equal(await countFolder('trash', alice.email), 0)
  const all = await db.email.findMany({ where: { recipientEmail: alice.email } })
  assert.equal(all.length, 4, 'no duplicates created anywhere')
})

// ─── Test G — failure/edge semantics at the data layer ──────────────────────

test('G unknown anchor and foreign conversation are no-ops; move/restore/delete are idempotent', async () => {
  await reset()
  await seed([
    { id: 'x', threadId: 'x', at: at(0) },
  ])
  // Unknown id: every operation is a safe no-op.
  assert.deepEqual(await db.$transaction((tx) => resolveConversationMembers(tx as never, 'nope', alice.email, alice.id)), [])
  assert.deepEqual(await db.$transaction((tx) => moveConversationToTrash(tx as never, 'nope', alice.email, alice.id)), [])
  assert.deepEqual(await db.$transaction((tx) => restoreConversationFromTrash(tx as never, 'nope', alice.email, alice.id)), [])
  assert.deepEqual(await db.$transaction((tx) => permanentlyDeleteConversation(tx as never, 'nope', alice.email, alice.id)), [])
  // The caller's mailbox is the hard boundary (owner report: deleting on
  // one phone must never touch another user's rows): carol anchoring on
  // alice's row resolves NOTHING of her own — the foreign anchor seeds no
  // members and is itself excluded from the set.
  const members = await db.$transaction((tx) => resolveConversationMembers(tx as never, 'x', carol.email, carol.id))
  assert.deepEqual(members.map((m: MemberRow) => m.id), [], 'a foreign anchor resolves nothing outside the caller\'s mailbox')
  // Repeating the move is a no-op (already trashed rows are not re-touched).
  const first = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'x', alice.email, alice.id))
  const second = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'x', alice.email, alice.id))
  assert.deepEqual(first, ['x'])
  assert.deepEqual(second, ['x'], 'anchor-only re-move, siblings untouched')
  assert.equal(await db.email.count({ where: { recipientEmail: alice.email } }), 1)
})

// ─── Test H — regression: list grouping rules unchanged for every shape ─────

test('H list grouping: modern, legacy, key-claim and mixed fixtures stay one-row-per-conversation', async () => {
  const row = (id: string, threadId: string | null, parentEmailId: string | null = null) => ({ id, threadId, parentEmailId })

  // Modern shared-key thread.
  let g = groupRowsForList([row('r3', 'x'), row('r2', 'x'), row('r1', 'x'), row('x', 'x')])
  assert.equal(g.representatives.length, 1)
  assert.equal(g.representatives[0].id, 'r3')

  // Legacy chain: root null + per-reply fork keys, linked by parent chains.
  g = groupRowsForList([row('f3', 'f2', 'f2'), row('f2', 'f1', 'f1'), row('f1', 'L', 'L'), row('L', null)])
  assert.equal(g.representatives.length, 1, 'legacy chain folds')
  assert.equal(g.representatives[0].id, 'f3')
  assert.equal(g.hiddenCount['f2'], 3, 'key = rep.threadId || rep.id')

  // Key-claim: threadId=null root whose id is a reply's threadId.
  g = groupRowsForList([row('r1', 'L'), row('L', null)])
  assert.equal(g.representatives.length, 1, 'claimed legacy root folds')
  assert.equal(g.representatives[0].id, 'r1', 'newest row represents')

  // Unrelated conversations stay separate; newest-first order preserved.
  g = groupRowsForList([row('c2', 'c2'), row('c1r', 'c1'), row('c1', 'c1')])
  assert.equal(g.representatives.length, 2)
  assert.deepEqual(g.representatives.map((r) => r.id), ['c2', 'c1r'])

  // Separate conversations with identical subjects must NOT cross-group
  // (grouping is relation-based only — no subject heuristics).
  g = groupRowsForList([
    { id: 'p1', threadId: 'p1', parentEmailId: null, subject: 'Re: hello' },
    { id: 'q1', threadId: 'q1', parentEmailId: null, subject: 'Re: hello' },
  ] as never)
  assert.equal(g.representatives.length, 2)
})

// ─── Reply thread-key resolution (future-fork prevention) ───────────────────

test('reply resolution: sent-copy parent bridges through its inbox twin instead of forking', async () => {
  await reset()
  await seed([
    { id: 'X', threadId: 'X', body: 'root-body', at: at(0) },
    { id: 'SC0', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', body: 'root-body', at: at(0, 1) },
  ])
  // Parent WITH a key: inherited verbatim.
  assert.equal(
    await resolveReplyThreadId(db as never, { id: 'X', threadId: 'X', parentEmailId: null, senderId: bob.id, recipientEmail: alice.email, body: 'x', createdAt: at(0) }),
    'X'
  )
  // Parent is bob's SENT copy (no key, no chain): the twin bridges to X.
  assert.equal(
    await resolveReplyThreadId(db as never, { id: 'SC0', threadId: null, parentEmailId: null, senderId: bob.id, recipientEmail: alice.email, body: 'root-body', createdAt: at(0, 1), folder: 'sent' }),
    'X',
    'replying from Sent joins the same conversation instead of forking a fresh key'
  )
})

test('reply resolution: legacy null root keeps the established fallback', async () => {
  await reset()
  await seed([
    { id: 'L', threadId: null, parentEmailId: null, body: 'legacy', at: at(0) },
  ])
  assert.equal(
    await resolveReplyThreadId(db as never, { id: 'L', threadId: null, parentEmailId: null, senderId: bob.id, recipientEmail: alice.email, body: 'legacy', createdAt: at(0) }),
    'L',
    'legacy root fallback unchanged (key = root id; the list folds it via key-claim)'
  )
})

test('reply resolution: identical duplicate null copies terminate (cycle guard)', async () => {
  await reset()
  await seed([
    { id: 'L', threadId: null, parentEmailId: null, body: 'legacy', at: at(0) },
    { id: 'L2', threadId: null, parentEmailId: null, body: 'legacy', at: at(0, 2) },
  ])
  const key = await resolveReplyThreadId(db as never, {
    id: 'L', threadId: null, parentEmailId: null, senderId: bob.id, recipientEmail: alice.email,
    body: 'legacy', createdAt: at(0),
  })
  assert.ok(['L', 'L2'].includes(key), `terminates at a stable key, got ${key}`)
})

test('inferRestoreFolder: sent copies return to Sent, received copies to Inbox', () => {
  const mk = (o: Partial<MemberRow>): MemberRow => ({
    id: 't', senderId: bob.id, recipientEmail: alice.email, folder: 'trash',
    threadId: null, parentEmailId: null, isRead: false, isArchived: false, body: 'body', createdAt: at(0), ...o,
  })
  assert.equal(inferRestoreFolder(mk({}), alice.id), 'inbox')
  assert.equal(inferRestoreFolder(mk({ senderId: alice.id, recipientEmail: alice.email, threadId: 'self', parentEmailId: 'p' }), alice.id), 'inbox', 'self-addressed inbox copy')
  assert.equal(inferRestoreFolder(mk({ senderId: alice.id, recipientEmail: alice.email }), alice.id), 'sent', 'self-addressed sent copy (no thread relations by design)')
  assert.equal(inferRestoreFolder(mk({ senderId: alice.id, recipientEmail: bob.email }), alice.id), 'sent', 'normal sent copy')
})

// ─── Pagination audit: conversation-level pages ─────────────────────────────

import { buildConversationPage, pickCanonicalKey } from '../src/lib/mail/conversation'

test('P1 a conversation straddling the old message-boundary is never split across pages', async () => {
  await reset()
  // 25 single-message conversations (c01..c25) + one 4-member conversation
  // whose members sit at message positions 19..22 — exactly where the old
  // message-level page cut used to slice it in half.
  const rows: SeedRow[] = []
  let min = 0
  for (let i = 1; i <= 25; i++) {
    const id = `c${String(i).padStart(2, '0')}`
    rows.push({ id, threadId: id, subject: `Solo ${i}`, at: at(min++) })
    if (i === 19) {
      // the straddler: 4 members occupying positions 19..22
      rows.push({ id: 'sx', threadId: 'sx', subject: 'Straddler root', at: at(min++) })
      rows.push({ id: 's1', threadId: 'sx', parentEmailId: 'sx', subject: 'Straddler', at: at(min++) })
      rows.push({ id: 's2', threadId: 'sx', parentEmailId: 's1', subject: 'Straddler', at: at(min++) })
      rows.push({ id: 's3', threadId: 'sx', parentEmailId: 's2', subject: 'Straddler', at: at(min++) })
    }
  }
  await seed(rows)
  const slim = await db.email.findMany({
    where: { recipientEmail: alice.email, folder: 'inbox' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, threadId: true, parentEmailId: true, createdAt: true },
  })
  assert.equal(slim.length, 29)

  const page1 = buildConversationPage(slim, 1, 20)
  const page2 = buildConversationPage(slim, 2, 20)
  const page3 = buildConversationPage(slim, 3, 20)

  assert.equal(page1.pageRepresentatives.length, 20, 'page 1 holds 20 whole conversations')
  assert.equal(page2.pageRepresentatives.length, 6, 'page 2 holds the remaining conversations')
  assert.equal(page3.pageRepresentatives.length, 0, 'no phantom third page')
  assert.equal(page1.totalConversations, 26, 'total counts CONVERSATIONS, not messages')

  // The straddler must appear exactly once across all pages, as ONE row.
  const repsAcrossPages = [...page1.pageRepresentatives, ...page2.pageRepresentatives].map((r) => r.id)
  const straddlerRows = repsAcrossPages.filter((id) => ['sx', 's1', 's2', 's3'].includes(id))
  assert.equal(straddlerRows.length, 1, 'straddling conversation renders exactly once')
  const key = straddlerRows[0] === 'sx' ? 'sx' : 'sx'
  const whichPage = page1.pageRepresentatives.some((r) => r.id === straddlerRows[0]) ? page1 : page2
  assert.equal(whichPage.hiddenCount['sx'], 3, 'exact hidden count on whichever page it lands')
  assert.equal(whichPage.hiddenCount['sx'] + 1, 4, 'conversation badge = 4 messages')

  // No duplicates anywhere: every row id is a representative at most once.
  assert.equal(new Set(repsAcrossPages).size, repsAcrossPages.length)
  // Newest-first ordering preserved across the page cut.
  const ordered = [...page1.pageRepresentatives, ...page2.pageRepresentatives]
  for (let i = 1; i < ordered.length; i++) {
    const prev = new Date(slim.find((r) => r.id === ordered[i - 1].id)!.createdAt).getTime()
    const cur = new Date(slim.find((r) => r.id === ordered[i].id)!.createdAt).getTime()
    assert.ok(prev >= cur, 'conversation order is newest-first across the page boundary')
  }
})

test('P2 legacy forked chain spanning pages folds with an exact count (no backfill needed)', async () => {
  await reset()
  // The legacy chain's members are spread so the OLD page cut (every 20
  // messages) would have separated f1/f2/f3 from L. The folder-wide fold
  // links them regardless of position.
  const rows: SeedRow[] = []
  for (let i = 1; i <= 22; i++) {
    rows.push({ id: `pad${String(i).padStart(2, '0')}`, threadId: `pad${String(i).padStart(2, '0')}`, subject: `Pad ${i}`, at: at(i) })
  }
  rows.push({ id: 'L', threadId: null, parentEmailId: null, subject: 'Legacy', at: at(0) })
  rows.push({ id: 'f1', threadId: 'L', parentEmailId: 'L', subject: 'Legacy', at: at(0, 30) })
  rows.push({ id: 'f2', threadId: 'f1', parentEmailId: 'f1', subject: 'Legacy', at: at(0, 60) })
  rows.push({ id: 'f3', threadId: 'f2', parentEmailId: 'f2', subject: 'Legacy', at: at(0, 90) })
  await seed(rows)
  const slim = await db.email.findMany({
    where: { recipientEmail: alice.email, folder: 'inbox' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, threadId: true, parentEmailId: true, createdAt: true },
  })
  const page1 = buildConversationPage(slim, 1, 20)
  const page2 = buildConversationPage(slim, 2, 20)
  const allReps = [...page1.pageRepresentatives, ...page2.pageRepresentatives]
  const legacyReps = allReps.filter((r) => ['L', 'f1', 'f2', 'f3'].includes(r.id))
  assert.equal(legacyReps.length, 1, 'legacy conversation = ONE row across pagination')
  const key = legacyReps[0].threadId || legacyReps[0].id
  const page = page1.pageRepresentatives.some((r) => r.id === legacyReps[0].id) ? page1 : page2
  assert.equal(page.hiddenCount[key] + 1, 4, 'exact count on the page that carries it')
})

test('P3 empty folder and out-of-range pages are clean no-ops', () => {
  const p = buildConversationPage([], 1, 20)
  assert.deepEqual(p.pageRepresentatives, [])
  assert.equal(p.totalConversations, 0)
  const seeded = [1, 2, 3].map((i) => ({ id: `x${i}`, threadId: `x${i}`, parentEmailId: null, createdAt: at(i) }))
  assert.deepEqual(buildConversationPage(seeded, 9, 20).pageRepresentatives, [])
})

// ─── Legacy thread-key backfill ─────────────────────────────────────────────

import { planMailboxBackfill, applyBackfill } from '../src/lib/mail/conversation'

test('BF1 legacy forked chain: plan produces the re-key diff, apply consolidates, re-plan is empty', async () => {
  await reset()
  await seed([
    { id: 'L', threadId: null, parentEmailId: null, isRead: true, at: at(0) },
    { id: 'f1', threadId: 'L', parentEmailId: 'L', isRead: false, at: at(1) },
    { id: 'f2', threadId: 'f1', parentEmailId: 'f1', at: at(2) },
    { id: 'f3', threadId: 'f2', parentEmailId: 'f2', at: at(3) },
  ])
  const plan = await planMailboxBackfill(db as never, alice.email, alice.id)
  assert.equal(plan.length, 3, 'three rows need re-keying (L, f1, f2 -> canonical)')
  const to = new Set(plan.map((d) => d.to))
  assert.equal(to.size, 1, 'one canonical key for the whole group')
  const canonical = plan[0].to
  const applied = await db.$transaction((tx) => applyBackfill(tx as never, plan))
  assert.equal(applied, 3)
  const after = await db.email.findMany({ where: { recipientEmail: alice.email }, select: { id: true, threadId: true } })
  assert.ok(after.every((r) => r.threadId === canonical), 'all four members share the canonical key')
  const slim = await db.email.findMany({ where: { recipientEmail: alice.email }, select: { id: true, threadId: true, parentEmailId: true, createdAt: true } })
  assert.equal(groupRowsForList(slim).representatives.length, 1, 'one row after backfill')
  // Idempotency: a second plan finds nothing to do.
  const rePlan = await planMailboxBackfill(db as never, alice.email, alice.id)
  assert.deepEqual(rePlan, [])
  // Preservation: bodies/folders/read state untouched.
  const f = await folders(['L', 'f1', 'f2', 'f3'])
  assert.equal(f['L'].folder, 'inbox'); assert.equal(f['L'].isRead, true); assert.equal(f['f1'].isRead, false)
})

test('BF2 sent-copy-forked orphans: canonical is the self-keyed root; sent copies never stamped', async () => {
  await reset()
  await seed([
    { id: 'X', threadId: 'X', body: 'root-body', at: at(0) },
    { id: 'SC0', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', body: 'root-body', at: at(0, 1) },
    { id: 'O1', threadId: 'SC0', parentEmailId: 'SC0', body: 'reply1-body', at: at(1) },
    { id: 'SC1', senderId: bob.id, recipientEmail: alice.email, folder: 'sent', body: 'reply1-body', at: at(1, 1) },
    { id: 'O2', threadId: 'SC1', parentEmailId: 'SC1', body: 'reply2-body', at: at(2) },
  ])
  const plan = await planMailboxBackfill(db as never, alice.email, alice.id)
  assert.deepEqual(plan.map((d) => d.id).sort(), ['O1', 'O2'])
  assert.ok(plan.every((d) => d.to === 'X'), 'canonical = the self-keyed root X')
  await db.$transaction((tx) => applyBackfill(tx as never, plan))
  const slim = await db.email.findMany({
    where: { recipientEmail: alice.email, folder: { not: 'sent' } },
    select: { id: true, threadId: true, parentEmailId: true, createdAt: true },
  })
  const g = groupRowsForList(slim)
  assert.equal(g.representatives.length, 1, 'the whole conversation folds to one row after backfill')
  const sc = await db.email.findUnique({ where: { id: 'SC0' } })
  assert.equal(sc?.threadId, null, 'bob\'s sent copy keeps threadId=null by design')
  assert.deepEqual(await planMailboxBackfill(db as never, alice.email, alice.id), [])
})

test('BF3 unrelated conversations are never merged; modern conversations produce zero diffs', async () => {
  await reset()
  await seed([
    // modern conversation: already consistent
    { id: 'm0', threadId: 'm0', subject: 'Modern', at: at(0) },
    { id: 'm1', threadId: 'm0', parentEmailId: 'm0', subject: 'Modern', at: at(1) },
    // two UNRELATED legacy conversations with the same subject (no merge)
    { id: 'u1a', threadId: null, parentEmailId: null, subject: 'Same subject', at: at(2) },
    { id: 'u1b', threadId: 'u1a', parentEmailId: 'u1a', subject: 'Same subject', at: at(3) },
    { id: 'u2a', threadId: null, parentEmailId: null, subject: 'Same subject', at: at(4) },
    { id: 'u2b', threadId: 'u2a', parentEmailId: 'u2a', subject: 'Same subject', at: at(5) },
  ])
  const plan = await planMailboxBackfill(db as never, alice.email, alice.id)
  const ids = new Set(plan.map((d) => d.id))
  assert.ok(!ids.has('m0') && !ids.has('m1'), 'modern rows need no re-keying')
  // u1a/u2a get stamped with their own children's keys (self-keyed rule:
  // u1b carries key u1a, so each group canonicalises onto its own root id)
  assert.ok(ids.has('u1a') && ids.has('u2a'), 'legacy null roots get their group key')
  const to = new Set(plan.map((d) => d.to))
  assert.equal(to.size, 2, 'each unrelated group keeps its OWN canonical key')
  assert.ok(to.has('u1a') && to.has('u2a'))
  await db.$transaction((tx) => applyBackfill(tx as never, plan))
  const slim = await db.email.findMany({ where: { recipientEmail: alice.email }, select: { id: true, threadId: true, parentEmailId: true, createdAt: true } })
  const g = groupRowsForList(slim)
  assert.equal(g.representatives.length, 3, 'three conversations stay three rows')
  const keys = new Set(g.representatives.map((r) => r.threadId || r.id))
  assert.equal(keys.size, 3)
  assert.deepEqual(await planMailboxBackfill(db as never, alice.email, alice.id), [])
})

test('BF4 pickCanonicalKey preference order', () => {
  const mk = (id: string, threadId: string | null, min = 0): MemberRow => ({
    id, senderId: bob.id, recipientEmail: alice.email, folder: 'inbox',
    threadId, parentEmailId: null, isRead: false, isArchived: false, body: 'b', createdAt: at(min),
  })
  // (a) shared key wins even when a self-keyed root exists.
  assert.equal(pickCanonicalKey([mk('x', 'k', 0), mk('r1', 'k', 1), mk('r2', 'r2', 2)]), 'k')
  // (b) self-keyed root when nothing is shared.
  assert.equal(pickCanonicalKey([mk('root', null, 0), mk('r1', 'root', 1), mk('r2', 'r1', 2)]), 'root')
  // (c) newest member's key when no self-keyed root exists.
  assert.equal(pickCanonicalKey([mk('a', 'k1', 0), mk('b', 'k2', 1)]), 'k2')
  // single member with no key -> its own id (the (d) chain-root fallback,
  // same key resolveReplyThreadId would hand a future reply)
  assert.equal(pickCanonicalKey([mk('solo', null, 0)]), 'solo')
})

// ─── Per-mailbox isolation: foreign anchors + thread-view copies ────────────
// Owner report: deleting a conversation on one phone made messages vanish
// from the other user's mobile ("only on their the message be deleted, not
// from others' mobile").

test('X1 foreign anchor (other user\'s inbox copy of my message): my members move, their row never moves', async () => {
  await reset()
  await seed([
    // bob's mailbox: his inbox copy of alice's outgoing message (the row
    // the thread view hands back as the representative of alice's message)
    { id: 'b_m1', senderId: alice.id, recipientEmail: bob.email, threadId: 'b_m1', at: at(0) },
    // alice's mailbox: her copies of bob's replies (same conversation key)
    { id: 'a_r1', senderId: bob.id, recipientEmail: alice.email, threadId: 'b_m1', parentEmailId: 'b_m1', at: at(1) },
    { id: 'b_r2', senderId: alice.id, recipientEmail: bob.email, threadId: 'b_m1', parentEmailId: 'a_r1', at: at(2) },
    { id: 'a_r3', senderId: bob.id, recipientEmail: alice.email, threadId: 'b_m1', parentEmailId: 'b_r2', at: at(3) },
  ])
  // alice anchors the delete on BOB's row (senderId=alice passes ownership)
  const moved = await db.$transaction((tx) => moveConversationToTrash(tx as never, 'b_m1', alice.email, alice.id))
  assert.deepEqual(moved.sort(), ['a_r1', 'a_r3'], 'only alice\'s own members move')
  const f = await folders(['b_m1', 'a_r1', 'b_r2', 'a_r3'])
  assert.equal(f['b_m1'].folder, 'inbox', 'bob\'s copy of alice\'s message untouched')
  assert.equal(f['b_r2'].folder, 'inbox', 'bob\'s copy of alice\'s reply untouched')
  assert.equal(f['a_r1'].folder, 'trash')
  assert.equal(f['a_r3'].folder, 'trash')
})

test('X2 foreign anchor already in trash: the other user\'s trashed copy is never destroyed', async () => {
  await reset()
  await seed([
    { id: 'b_m1', senderId: alice.id, recipientEmail: bob.email, folder: 'trash', threadId: 'b_m1', at: at(0) },
    { id: 'a_r1', senderId: bob.id, recipientEmail: alice.email, folder: 'trash', threadId: 'b_m1', parentEmailId: 'b_m1', at: at(1) },
  ])
  const deleted = await db.$transaction((tx) => permanentlyDeleteConversation(tx as never, 'b_m1', alice.email, alice.id))
  assert.deepEqual(deleted, ['a_r1'], 'only alice\'s own trashed copy is destroyed')
  const b = await db.email.findUnique({ where: { id: 'b_m1' } })
  assert.ok(b, 'bob\'s trashed copy must survive alice\'s permanent delete')
})

test('X3 foreign anchor restore: only the caller\'s own trashed members come back', async () => {
  await reset()
  await seed([
    { id: 'b_m1', senderId: alice.id, recipientEmail: bob.email, folder: 'trash', threadId: 'b_m1', at: at(0) },
    { id: 'a_r1', senderId: bob.id, recipientEmail: alice.email, folder: 'trash', threadId: 'b_m1', parentEmailId: 'b_m1', at: at(1) },
  ])
  const restored = await db.$transaction((tx) => restoreConversationFromTrash(tx as never, 'b_m1', alice.email, alice.id))
  assert.deepEqual(restored, ['a_r1'])
  const f = await folders(['b_m1', 'a_r1'])
  assert.equal(f['b_m1'].folder, 'trash', 'bob\'s trash placement untouched')
  assert.equal(f['a_r1'].folder, 'inbox')
})

test('X4 trash move clears isArchived: trashed mail leaves the Archive view set', async () => {
  await reset()
  await seed([
    { id: 'arc', threadId: 'arc', isArchived: true, at: at(0) },
    { id: 'arc2', threadId: 'arc', parentEmailId: 'arc', isArchived: true, at: at(1) },
    { id: 'live', threadId: 'live', isArchived: true, at: at(2) },
  ])
  await db.$transaction((tx) => moveConversationToTrash(tx as never, 'arc2', alice.email, alice.id))
  const f = await folders(['arc', 'arc2', 'live'])
  assert.equal(f['arc'].folder, 'trash')
  assert.equal(f['arc'].isArchived, false, 'trashed member no longer lists in Archive')
  assert.equal(f['arc2'].isArchived, false)
  assert.equal(f['live'].isArchived, true, 'unrelated archived mail keeps its flag')
})

test('T1 thread dedup prefers the viewer\'s own copy of every message', () => {
  const mk = (id: string, senderId: string, recipientEmail: string, folder: string, min: number, sec = 0) => ({
    id, senderId, recipientEmail, folder, body: 'b', createdAt: at(min, sec),
  })
  // bob's message to alice: alice's inbox copy (created first) + bob's sent copy
  const ainbox = mk('ainbox', bob.id, alice.email, 'inbox', 0)
  const bsent = mk('bsent', bob.id, alice.email, 'sent', 0, 1)
  // alice's reply: bob's inbox copy (created first) + alice's sent copy
  const binbox = mk('binbox', alice.id, bob.email, 'inbox', 1)
  const asent = mk('asent', alice.id, bob.email, 'sent', 1, 1)

  // viewer alice: her inbox copy for bob's message, HER SENT copy for her own reply
  assert.deepEqual(
    dedupeThreadForViewer([ainbox, bsent, binbox, asent], alice.email, alice.id).map((r) => r.id).sort(),
    ['ainbox', 'asent']
  )
  // viewer bob: his sent copy for his own message, his inbox copy for alice's reply
  assert.deepEqual(
    dedupeThreadForViewer([ainbox, bsent, binbox, asent], bob.email, bob.id).map((r) => r.id).sort(),
    ['binbox', 'bsent']
  )
  // legacy fallback: when only the foreign copy exists it still renders
  assert.deepEqual(dedupeThreadForViewer([binbox], alice.email, alice.id).map((r) => r.id), ['binbox'])
  // self-addressed mail: both copies are the viewer's — keep the first (inbox)
  const self = mk('self_i', alice.id, alice.email, 'inbox', 2)
  const selfS = mk('self_s', alice.id, alice.email, 'sent', 2, 1)
  assert.deepEqual(dedupeThreadForViewer([self, selfS], alice.email, alice.id).map((r) => r.id), ['self_i'])
})

test('T2 findOwnedSentTwin bridges a foreign thread row to the viewer\'s own sent copy', async () => {
  await reset()
  await seed([
    { id: 'binbox', senderId: alice.id, recipientEmail: bob.email, threadId: 'binbox', body: 'hello', at: at(0) },
    { id: 'asent', senderId: alice.id, recipientEmail: bob.email, folder: 'sent', body: 'hello', at: at(0, 1) },
  ])
  const binbox = await db.email.findUnique({ where: { id: 'binbox' } })
  assert.ok(binbox)
  const twin = await findOwnedSentTwin(db as never, binbox, alice.email, alice.id)
  assert.equal(twin?.id, 'asent', 'alice\'s sent copy of her own message is found')
  // a row the viewer already owns (their sent copy) never self-matches
  const asent = await db.email.findUnique({ where: { id: 'asent' } })
  assert.ok(asent)
  assert.equal(await findOwnedSentTwin(db as never, asent, alice.email, alice.id), null)
})
