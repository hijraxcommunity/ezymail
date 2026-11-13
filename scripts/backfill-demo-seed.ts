/**
 * SCRATCH-DB DEMO SEED for scripts/backfill-thread-keys.ts — never touches
 * production. Populates the embedded PostgreSQL (127.0.0.1:5433/ezymail_test)
 * with the exact legacy-fork topologies proven in scripts/lifecycle.test.ts
 * (BF1 forked chain, BF2 sent-copy orphans via twin bridge, BF3 unrelated
 * conversations with identical subjects, a modern zero-diff conversation)
 * plus isolation traps:
 *   - bob's SENT copies addressed to alice (must never be stamped)
 *   - alice's SENT copy addressed to bob (outside bob's plan scope)
 *   - a drafts row inside alice's forked conversation (never re-keyed)
 *   - a second user's received rows (never appear in another mailbox's plan)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = new Date('2026-11-11T09:00:00Z').getTime()
const at = (min: number, sec = 0) => new Date(BASE + min * 60_000 + sec * 1000)

async function main() {
  await db.email.deleteMany({})
  await db.user.deleteMany({})

  const alice = { id: 'u_alice', email: 'alice@ezy.af' }
  const bob = { id: 'u_bob', email: 'bob@ezy.af' }
  const carol = { id: 'u_carol', email: 'carol@ezy.af' }
  await db.user.createMany({
    data: [
      { id: alice.id, email: alice.email, passwordHash: 'x', firstName: 'Alice', lastName: 'A', dateOfBirth: '1990-01-01' },
      { id: bob.id, email: bob.email, passwordHash: 'x', firstName: 'Bob', lastName: 'B', dateOfBirth: '1990-01-01' },
      { id: carol.id, email: carol.email, passwordHash: 'x', firstName: 'Carol', lastName: 'C', dateOfBirth: '1990-01-01' },
    ],
  })

  const mk = (r: {
    id: string; senderId?: string; recipientEmail?: string; subject?: string; body?: string;
    folder?: string; threadId?: string | null; parentEmailId?: string | null; isRead?: boolean; at: Date
  }) => db.email.create({
    data: {
      id: r.id,
      senderId: r.senderId ?? bob.id,
      recipientEmail: r.recipientEmail ?? alice.email,
      subject: r.subject ?? 'Demo',
      body: r.body ?? 'b',
      folder: r.folder ?? 'inbox',
      threadId: r.threadId ?? null,
      parentEmailId: r.parentEmailId ?? null,
      isRead: r.isRead ?? false,
      createdAt: r.at,
    },
  })

  // BF1 — legacy forked chain in alice's inbox (canonical = self-keyed root L)
  await mk({ id: 'L', threadId: null, parentEmailId: null, isRead: true, at: at(0) })
  await mk({ id: 'f1', threadId: 'L', parentEmailId: 'L', at: at(1) })
  await mk({ id: 'f2', threadId: 'f1', parentEmailId: 'f1', at: at(2) })
  await mk({ id: 'f3', threadId: 'f2', parentEmailId: 'f2', at: at(3) })
  // drafts row inside the same conversation — plan excludes drafts entirely
  await mk({ id: 'd1', folder: 'drafts', threadId: 'L', parentEmailId: 'L', at: at(3, 30) })

  // BF2 — sent-copy-forked orphans bridged through the inbox twin
  await mk({ id: 'X', threadId: 'X', body: 'root-body', at: at(10) })
  await mk({ id: 'SC0', folder: 'sent', body: 'root-body', at: at(10, 1) })
  await mk({ id: 'O1', threadId: 'SC0', parentEmailId: 'SC0', body: 'reply1-body', at: at(11) })
  await mk({ id: 'SC1', folder: 'sent', body: 'reply1-body', at: at(11, 1) })
  await mk({ id: 'O2', threadId: 'SC1', parentEmailId: 'SC1', body: 'reply2-body', at: at(12) })

  // BF3 — modern zero-diff conversation + two UNRELATED legacy conversations
  // with the same subject (must never merge)
  await mk({ id: 'm0', threadId: 'm0', subject: 'Modern', at: at(20) })
  await mk({ id: 'm1', threadId: 'm0', parentEmailId: 'm0', subject: 'Modern', at: at(21) })
  await mk({ id: 'u1a', threadId: null, parentEmailId: null, subject: 'Same subject', at: at(22) })
  await mk({ id: 'u1b', threadId: 'u1a', parentEmailId: 'u1a', subject: 'Same subject', at: at(23) })
  await mk({ id: 'u2a', threadId: null, parentEmailId: null, subject: 'Same subject', at: at(24) })
  await mk({ id: 'u2b', threadId: 'u2a', parentEmailId: 'u2a', subject: 'Same subject', at: at(25) })

  // alice's own sent copy to bob — outside bob's plan scope entirely
  await mk({ id: 'sa1', senderId: alice.id, recipientEmail: bob.email, folder: 'sent', threadId: null, parentEmailId: null, at: at(30) })
  // bob's own received legacy fork (canonical = rb0) + bob's sent copies to
  // alice (SC0/SC1 above already carry recipientEmail=alice; they must never
  // be stamped even though they sit in bob's Sent folder)
  await mk({ id: 'rb0', recipientEmail: bob.email, threadId: null, parentEmailId: null, subject: 'To Bob', at: at(40) })
  await mk({ id: 'rb1', recipientEmail: bob.email, threadId: 'rb0', parentEmailId: 'rb0', subject: 'To Bob', at: at(41) })
  // carol: empty mailbox — must print nothing
  void carol

  const counts = await db.email.groupBy({ by: ['recipientEmail'], _count: true })
  console.log('SEEDED:', counts.map((c) => `${c.recipientEmail}=${c._count}`).join(', '))
  await db.$disconnect()
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
