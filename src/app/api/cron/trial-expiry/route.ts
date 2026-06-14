import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
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