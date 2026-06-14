import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/business-stats - Business analytics for admin dashboard
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalBusinessAccounts,
      pendingVerification,
      inTrial,
      activeSubscriptions,
      expiredSubscriptions,
      recentRegistrations,
      totalCustomers,
      totalCampaigns,
      verificationsPendingReview,
    ] = await Promise.all([
      // Total business accounts (not soft-deleted)
      db.user.count({
        where: {
          accountType: 'business',
          softDeletedAt: null,
        },
      }),
      // Breakdown: pending_verification
      db.user.count({
        where: {
          accountType: 'business',
          softDeletedAt: null,
          subscriptionStatus: 'pending_verification',
        },
      }),
      // Breakdown: trial
      db.user.count({
        where: {
          accountType: 'business',
          softDeletedAt: null,
          subscriptionStatus: 'trial',
        },
      }),
      // Breakdown: active
      db.user.count({
        where: {
          accountType: 'business',
          softDeletedAt: null,
          subscriptionStatus: 'active',
        },
      }),
      // Breakdown: expired
      db.user.count({
        where: {
          accountType: 'business',
          softDeletedAt: null,
          subscriptionStatus: 'expired',
        },
      }),
      // Recent registrations (last 30 days)
      db.user.count({
        where: {
          accountType: 'business',
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // Total customers across all businesses
      db.customer.count(),
      // Total campaigns sent
      db.campaign.count(),
      // Verification pending count
      db.businessVerification.count({
        where: { status: 'pending' },
      }),
    ]);

    return NextResponse.json({
      totalBusinessAccounts,
      subscriptionBreakdown: {
        pendingVerification,
        trial: inTrial,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
      },
      recentRegistrations,
      totalCustomers,
      totalCampaigns,
      verificationsPendingReview,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin business stats error:', message);
    return NextResponse.json({ error: 'Failed to fetch business stats' }, { status: 500 });
  }
}