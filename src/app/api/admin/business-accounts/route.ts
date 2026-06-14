import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/business-accounts - List all business accounts
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const subscriptionStatus = searchParams.get('subscriptionStatus') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // Build where clause - always filter for business accounts only
    const where: Record<string, unknown> = {
      accountType: 'business',
      softDeletedAt: null,
    };

    if (subscriptionStatus && subscriptionStatus !== 'all') {
      where.subscriptionStatus = subscriptionStatus;
    }

    const [accounts, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          status: true,
          accountType: true,
          businessName: true,
          businessEmail: true,
          employeeCount: true,
          subscriptionStatus: true,
          trialStart: true,
          trialEnd: true,
          createdAt: true,
          updatedAt: true,
          businessVerification: {
            select: {
              id: true,
              status: true,
              submittedAt: true,
              reviewedAt: true,
            },
          },
          _count: {
            select: {
              teamMembersOwned: true,
              customers: true,
              campaigns: true,
            },
          },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      accounts,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin list business accounts error:', message);
    return NextResponse.json({ error: 'Failed to fetch business accounts' }, { status: 500 });
  }
}