import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/business-verifications - List all business verifications with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    const [verifications, total] = await Promise.all([
      db.businessVerification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          documentUrls: true,
          status: true,
          adminNotes: true,
          submittedAt: true,
          reviewedAt: true,
          reviewedBy: true,
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatar: true,
              businessName: true,
              businessEmail: true,
              employeeCount: true,
              subscriptionStatus: true,
              createdAt: true,
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      db.businessVerification.count({ where }),
    ]);

    return NextResponse.json({
      verifications,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin list business verifications error:', message);
    return NextResponse.json({ error: 'Failed to fetch business verifications' }, { status: 500 });
  }
}