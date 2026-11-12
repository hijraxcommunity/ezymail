/**
 * Legacy thread-key backfill — consolidates forked/orphaned conversation
 * keys so the one-row-per-conversation fold works on OLD data too.
 *
 * WHAT IT DOES
 * Walks each user's mailbox, resolves every conversation with the SAME
 * runtime logic the delete/undo paths use (relation-based only — threadId
 * equality, threadId↔id claims, parentEmailId chains, cross-mailbox
 * inbox-copy twins), picks one canonical thread key per conversation, and
 * re-keys the mailbox's received copies that carry a different key.
 *
 * WHAT IT NEVER DOES
 * - Never deletes or creates rows; never touches folder, sender, recipient,
 *   body, attachments, read/unread, starred or archived state.
 * - Never stamps SENT copies (they carry no key by design).
 * - Never merges unrelated conversations (grouping is relation-based only,
 *   with no subject/body heuristics).
 * - Never writes outside the resolved member ids of the user's own mailbox.
 *
 * IDEMPOTENT: once every member carries the canonical key the planner
 * returns zero diffs, so the script can be run repeatedly with no effect.
 * The apply step uses compare-and-swap guards (UPDATE ... WHERE
 * threadId = <planned-from>), so a concurrent runtime change (a new reply
 * inheriting a key) can never be clobbered.
 *
 * USAGE (dry-run is the DEFAULT — nothing is written without --apply):
 *   npx tsx scripts/backfill-thread-keys.ts                     # all mailboxes, dry-run
 *   npx tsx scripts/backfill-thread-keys.ts --mailbox=x@ezy.af  # one mailbox, dry-run
 *   npx tsx scripts/backfill-thread-keys.ts --mailbox=x@ezy.af --apply
 *
 * ⚠️ PRODUCTION: run the dry-run FIRST, review the plan, and only run
 * --apply with explicit owner authorization. The script never executes a
 * destructive operation; the only writes are UPDATE threadId CAS-guards.
 */
import { PrismaClient } from '@prisma/client'
import {
  planMailboxBackfill,
  applyBackfill,
  type BackfillDiff,
} from '../src/lib/mail/conversation'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const mailboxArg = args.find((a) => a.startsWith('--mailbox='))?.split('=')[1]

const db = new PrismaClient()

async function listMailboxes(): Promise<{ id: string; email: string }[]> {
  const users = await db.user.findMany({
    select: { id: true, email: true },
  })
  return users
}

async function run() {
  const users = await listMailboxes()
  const targets = mailboxArg ? users.filter((u) => u.email === mailboxArg.toLowerCase()) : users
  if (mailboxArg && targets.length === 0) {
    console.error(`mailbox not found: ${mailboxArg}`)
    process.exit(1)
  }

  console.log(
    `thread-key backfill — mode: ${APPLY ? 'APPLY' : 'DRY-RUN (nothing is written)'}, ` +
      `mailboxes: ${targets.length}`
  )

  let totalDiffs = 0
  let totalApplied = 0
  let touchedGroups = 0

  for (const user of targets) {
    const diffs = await planMailboxBackfill(db as never, user.email, user.id)
    const groups = new Set(diffs.map((d) => d.groupSize ? `${d.mailbox}:${d.groupSize}` : '')).size
    if (diffs.length === 0) continue
    touchedGroups += groups
    totalDiffs += diffs.length
    console.log(`\nmailbox ${user.email}: ${diffs.length} row(s) to re-key`)
    for (const d of diffs as BackfillDiff[]) {
      console.log(
        `  ${d.id} [folder=${d.folder}] threadId ${d.from ?? '(null)'} -> ${d.to} (group of ${d.groupSize})`
      )
    }
    if (APPLY) {
      const applied = await db.$transaction((tx) => applyBackfill(tx as never, diffs))
      totalApplied += applied
      console.log(`  applied: ${applied}`)
      // Post-apply verification: the plan must now be empty (idempotency).
      const recheck = await planMailboxBackfill(db as never, user.email, user.id)
      if (recheck.length > 0) {
        console.error(`  WARNING: ${recheck.length} diff(s) remain after apply — investigate`)
      } else {
        console.log('  verified: re-plan is empty (idempotent)')
      }
    }
  }

  console.log(
    `\ndone: ${totalDiffs} row(s) planned` +
      (APPLY ? `, ${totalApplied} re-keyed across ${targets.length} mailbox(es)` : ' — dry-run, nothing written')
  )
  await db.$disconnect()
}

run().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
