#!/usr/bin/env node
/**
 * Read-only PushSubscription count — SELECT/COUNT only, no writes.
 * Usage: DATABASE_URL="postgres://..." node scripts/push-sub-count.cjs
 * (Run wherever a valid Neon DATABASE_URL is available; never commit it.)
 */
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL env var required')
  process.exit(1)
}
const { Client } = require('pg')

async function main() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const total = await client.query('SELECT COUNT(*)::int AS n FROM "PushSubscription"')
  const byPlatform = await client.query(
    'SELECT platform, COUNT(*)::int AS n FROM "PushSubscription" GROUP BY platform ORDER BY n DESC'
  )
  const orphaned = await client.query(
    'SELECT COUNT(*)::int AS n FROM "PushSubscription" ps LEFT JOIN "User" u ON u.id = ps."userId" WHERE u.id IS NULL'
  )
  console.log('total subscriptions:', total.rows[0].n)
  console.log('by platform:', byPlatform.rows.map((r) => `${r.platform}=${r.n}`).join(', ') || '(none)')
  console.log('orphaned (user deleted):', orphaned.rows[0].n)
  await client.end()
}

main().catch((e) => {
  console.error('count failed:', e.message)
  process.exit(1)
})
