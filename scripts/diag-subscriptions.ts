// Task 85 — read-only subscription-state check.
// Prints COUNTS + masked values only. Never prints tokens or emails.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function mask(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : '***'
}

async function main() {
  let total: number
  try {
    total = await prisma.pushSubscription.count()
  } catch (e) {
    // Do NOT print the Prisma message (it embeds the connection string and
    // gets scrubbed mid-line anyway). Classify via DNS + TCP instead.
    const url = process.env.DATABASE_URL ?? ''
    let host = '', port = 5432
    try {
      const u = new URL(url)
      host = u.hostname
      port = Number(u.port) || 5432
    } catch { /* leave host empty */ }
    if (!host) {
      const raw = process.env.DATABASE_URL ?? ''
      let proto = '', hostLen = 0
      try { const u2 = new URL(raw); proto = u2.protocol; hostLen = u2.hostname.length } catch { proto = '(unparsable)' }
      console.log(
        'DB_CHECK_FAILED reason=host unparsable | envPresent=' + (raw.length > 0) +
        ' | length=' + raw.length + ' | protocol=' + proto + ' | hostLen=' + hostLen
      )
      return
    }
    const dns = await import('dns')
    const net = await import('net')
    dns.promises
      .lookup(host)
      .then((r) => {
        console.log('DNS: resolves ->', r.address)
        return new Promise<void>((resolve) => {
          const sock = net.createConnection({ host, port, timeout: 8000 })
          sock.on('connect', () => { console.log(`TCP: connect OK to ${host}:${port} -> DB HOST REACHABLE (auth or table issue)`) ; sock.destroy(); resolve() })
          sock.on('timeout', () => { console.log('TCP: TIMEOUT -> host unreachable'); sock.destroy(); resolve() })
          sock.on('error', (er: NodeJS.ErrnoException) => { console.log('TCP: ERROR', er.code ?? 'unknown'); resolve() })
        })
      })
      .catch((er: NodeJS.ErrnoException) => {
        console.log('DNS: FAIL ->', er.code ?? 'unknown', '(sandbox cannot reach the DB host)')
      })
    return
  }
  console.log('pushSubscription total rows:', total)

  const byPlatform = await prisma.pushSubscription.groupBy({
    by: ['platform'],
    _count: { _all: true },
  })
  for (const p of byPlatform) {
    console.log(`  platform=${p.platform || 'unknown'} count=${p._count._all}`)
  }

  const byUser = await prisma.pushSubscription.groupBy({
    by: ['userId'],
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 10,
  })
  console.log('users with tokens (masked):')
  for (const u of byUser) {
    console.log(
      `  user=${mask(u.userId)} tokens=${u._count._all} latest=${u._max.createdAt?.toISOString() ?? 'never'}`
    )
  }

  // Preferences of those users (desktopNotif) — masked, aggregate only
  for (const u of byUser.slice(0, 10)) {
    const user = await prisma.user.findUnique({
      where: { id: u.userId },
      select: { preferences: true },
    })
    let dn: unknown = 'unset'
    try {
      const p =
        typeof user?.preferences === 'string'
          ? JSON.parse(user!.preferences as string)
          : user?.preferences
      dn = p ? p.desktopNotif : 'unset'
    } catch {
      dn = 'malformed'
    }
    console.log(`  user=${mask(u.userId)} desktopNotif=${String(dn)}`)
  }
}

main()
  .catch((e) => {
    console.error('DB check failed:', e instanceof Error ? e.message.slice(0, 200) : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
