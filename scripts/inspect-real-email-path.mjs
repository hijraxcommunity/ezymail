// Read-only inspection of the REAL incoming-email → push path in production.
// Answers with data: did real recipients have tokens? was their switch OFF?
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
const q = (text, params) => pool.query(text, params)
const mask = (t) => (t && t.length > 14 ? t.slice(0, 10) + '…' + t.slice(-4) : t)
const out = {}

// 1) Real incoming emails of the last 7 days (inbox folder, actually sent)
const emails = await q(`
  SELECT e."id", e."recipientEmail", e."subject", e."createdAt", e."sentAt",
         u."email" AS "senderEmail"
  FROM "Email" e LEFT JOIN "User" u ON u."id" = e."senderId"
  WHERE e."folder" = 'inbox' AND e."sentAt" IS NOT NULL
    AND e."createdAt" > now() - interval '7 days'
  ORDER BY e."createdAt" DESC LIMIT 15`)
out.recentRealInboxEmails = emails.rows.map((r) => ({
  to: r.recipientEmail,
  from: r.senderEmail || '(unknown)',
  subject: (r.subject || '').slice(0, 40),
  at: r.createdAt,
}))

// 2) For each real recipient: switch state + saved tokens (the two gates)
const recips = [...new Set(emails.rows.map((r) => r.recipientEmail))]
for (const email of recips) {
  const u = await q(`SELECT "id","email","preferences","status" FROM "User" WHERE "email"=$1`, [email])
  if (!u.rows[0]) { out['recipient:' + email] = 'NO USER ROW'; continue }
  const user = u.rows[0]
  let prefs = null
  try { prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences } catch { prefs = '(unparsable)' }
  const toks = await q(
    `SELECT "platform","fcmToken","createdAt" FROM "PushSubscription" WHERE "userId"=$1 ORDER BY "createdAt" DESC`,
    [user.id])
  out['recipient:' + email] = {
    userId: user.id,
    accountStatus: user.status,
    switch_desktopNotif: prefs && typeof prefs === 'object' ? (prefs.desktopNotif !== undefined ? prefs.desktopNotif : '(not set)') : String(prefs),
    savedTokenCount: toks.rowCount,
    tokens: toks.rows.map((t) => ({ platform: t.platform, token: mask(t.fcmToken), savedAt: t.createdAt })),
  }
}

// 3) Global subscription state (context: do ANY live web/android rows exist?)
const g = await q(`SELECT "platform", count(*)::int AS n FROM "PushSubscription" GROUP BY "platform"`)
out.globalSubscriptionsByPlatform = g.rows
const recent = await q(`
  SELECT s."platform", s."createdAt", left(u."email", 4) || '***' AS owner
  FROM "PushSubscription" s LEFT JOIN "User" u ON u."id" = s."userId"
  ORDER BY s."createdAt" DESC LIMIT 8`)
out.newestTokens = recent.rows

console.log(JSON.stringify(out, null, 2))
await pool.end()
