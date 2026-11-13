/**
 * SCRATCH-DB DEMO SNAPSHOT — dumps the full User + Email tables (the fields
 * the backfill could conceivably touch, plus identity fields) as ordered
 * JSON. Two snapshots taken before/after a dry-run must be byte-identical;
 * any drift proves an unintended write.
 *
 * Usage: npx tsx scripts/backfill-demo-snapshot.ts /tmp/before.json
 */
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'

const db = new PrismaClient()

async function main() {
  const out = process.argv[2]
  if (!out) { console.error('usage: snapshot <outfile.json>'); process.exit(1) }

  const users = await db.user.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, email: true },
  })
  const emails = await db.email.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true, senderId: true, recipientEmail: true, subject: true, body: true,
      folder: true, threadId: true, parentEmailId: true, isRead: true,
      isStarred: true, isArchived: true, isDraft: true, priority: true, createdAt: true,
    },
  })
  writeFileSync(out, JSON.stringify({ users, emails }, null, 1))
  console.log(`SNAPSHOT ${out}: users=${users.length} emails=${emails.length}`)
  await db.$disconnect()
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
