import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// GET /api/admin/stats - Get admin dashboard stats with real chart data
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- Basic stats ---
    const [
      totalUsers,
      activeUsers,
      totalEmails,
      emailsToday,
      suspendedUsers,
      systemUsers,
    ] = await Promise.all([
      db.user.count({ where: { role: 'user' } }),
      db.user.count({ where: { role: 'user', status: 'active' } }),
      db.email.count(),
      db.email.count({ where: { createdAt: { gte: today } } }),
      db.user.count({ where: { role: 'user', status: 'suspended' } }),
      db.user.count({ where: { role: 'system' } }),
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentRegistrations = await db.user.count({
      where: { role: 'user', createdAt: { gte: sevenDaysAgo } },
    });

    // Estimate storage: count emails * ~5KB average
    const estimatedStorageKB = totalEmails * 5;
    const storageUsed = estimatedStorageKB >= 1024 * 1024
      ? `${(estimatedStorageKB / 1024 / 1024).toFixed(1)} GB`
      : `${(estimatedStorageKB / 1024).toFixed(1)} MB`;

    const pendingReports = await db.report.count({
      where: { status: 'pending' },
    });

    // --- Chart data: emails per day (last 7 days) ---
    // F-44: the old loop ran one db.email.count per day (7 sequential
    // round-trips), and users-per-day ran 30 more — 37+ queries on EVERY
    // dashboard mount. Two date-truncated GROUP BY queries (raw SQL; both
    // the production Neon database and every embedded-PG harness are
    // Postgres — no test harness exercises this route on SQLite) produce
    // the same series in one round-trip each; JS zero-fills empty days.
    const dayMs = 24 * 60 * 60 * 1000;
    const emailWindowStart = new Date(today.getTime() - 6 * dayMs);
    const userWindowStart = new Date(today.getTime() - 29 * dayMs);

    const emailDayRows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "Email"
      WHERE "createdAt" >= ${emailWindowStart}
      GROUP BY 1 ORDER BY 1
    `;
    const userDayRows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "createdAt" >= ${userWindowStart}
      GROUP BY 1 ORDER BY 1
    `;

    const emailDayCounts = new Map(emailDayRows.map((r) => [formatDate(new Date(r.day)), Number(r.count)]));
    const userDayCounts = new Map(userDayRows.map((r) => [formatDate(new Date(r.day)), Number(r.count)]));

    const emailsPerDay: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today.getTime() - i * dayMs);
      emailsPerDay.push({ date: formatDate(day), count: emailDayCounts.get(formatDate(day)) || 0 });
    }

    // --- Chart data: users per day (last 30 days) ---
    const usersPerDay: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today.getTime() - i * dayMs);
      usersPerDay.push({ date: formatDate(day), count: userDayCounts.get(formatDate(day)) || 0 });
    }

    // --- Chart data: folder distribution (count emails per folder for all users) ---
    const folderRaw = await db.email.groupBy({
      by: ['folder'],
      _count: { id: true },
    });

    const folderDistribution: { folder: string; count: number }[] = folderRaw.map((f) => ({
      folder: f.folder,
      count: f._count.id,
    }));

    // --- Active now: sessions active within last 5 minutes ---
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeNow = await db.session.count({
      where: {
        isActive: true,
        lastActive: { gte: fiveMinutesAgo },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        // Basic stats
        totalUsers,
        activeUsers,
        suspendedUsers,
        systemUsers,
        totalEmails,
        emailsToday,
        recentRegistrations,
        pendingReports,
        storageUsed,

        // Chart data
        emailsPerDay,
        usersPerDay,
        folderDistribution,
        activeNow,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin stats error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
