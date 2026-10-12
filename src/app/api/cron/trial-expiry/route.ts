import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';

/**
 * Vercel Cron automatically attaches `Authorization: Bearer <CRON_SECRET>` to
 * scheduled invocations when a project-level CRON_SECRET environment variable
 * is configured; any other caller must send the same header explicitly.
 *
 * Authorization is checked BEFORE any database access, and comparison is done
 * on SHA-256 digests so it is timing-safe and leaks no length information.
 * Fails closed: while CRON_SECRET is unset, no caller (including Vercel Cron
 * itself) is authorized.
 */
function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.trim() === '') {
    return false;
  }

  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1];
  if (!provided) {
    return false;
  }

  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // 1. Expire trials that have ended
    const expiredTrials = await db.user.updateMany({
      where: {
        subscriptionStatus: 'trial',
        trialEnd: { lt: now },
      },
      data: {
        subscriptionStatus: 'expired',
        emailReservedUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // +30 days
      },
    });

    // 2. Soft-delete expired accounts whose reservation period has ended
    const softDeleted = await db.user.updateMany({
      where: {
        subscriptionStatus: 'expired',
        emailReservedUntil: { lt: now },
        softDeletedAt: null,
      },
      data: {
        softDeletedAt: now,
      },
    });

    return NextResponse.json({
      expiredTrials: expiredTrials.count,
      softDeleted: softDeleted.count,
      processedAt: now.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Trial expiry cron error:', message);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}