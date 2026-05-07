import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/reports - List reports (admin only)
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

    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          email: {
            select: {
              id: true,
              subject: true,
              sender: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
              recipientEmail: true,
            },
          },
        },
      }),
      db.report.count({ where }),
    ]);

    return NextResponse.json({
      reports,
      total,
      page,
      limit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin reports error:', message);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}
