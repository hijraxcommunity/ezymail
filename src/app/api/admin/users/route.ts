import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/users - List users (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status') || '';
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      role: 'user', // Don't show system users
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
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
          role: true,
          status: true,
          lastLogin: true,
          lastIp: true,
          createdAt: true,
          _count: {
            select: {
              sentEmails: true,
              receivedEmails: true,
            },
          },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      users,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin list users error:', message);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
