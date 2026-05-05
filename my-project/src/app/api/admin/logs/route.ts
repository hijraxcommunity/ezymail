import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const logsQuerySchema = z.object({
  type: z.enum(['admin', 'login', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(200).default(''),
  userId: z.string().max(100).default(''),
});

// GET /api/admin/logs - List admin and system logs
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const parsed = logsQuerySchema.safeParse({
      type: searchParams.get('type') || 'all',
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
      search: searchParams.get('search') || '',
      userId: searchParams.get('userId') || '',
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { type, page, limit, search, userId } = parsed.data;
    const skip = (page - 1) * limit;

    interface LogEntry {
      id: string;
      type: string;
      action: string;
      adminName?: string | null;
      userEmail?: string | null;
      targetType?: string | null;
      targetId?: string | null;
      details?: string | null;
      ipAddress?: string | null;
      createdAt: Date;
    }

    const allLogs: LogEntry[] = [];

    // Fetch admin logs
    if (type === 'admin' || type === 'all') {
      const adminWhere: Record<string, unknown> = {};
      if (search) {
        adminWhere.action = { contains: search };
      }
      if (userId) {
        adminWhere.adminId = userId;
      }

      const adminLogs = await db.adminLog.findMany({
        where: adminWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      for (const log of adminLogs) {
        allLogs.push({
          id: log.id,
          type: 'admin',
          action: log.action,
          adminName: `${log.admin.firstName} ${log.admin.lastName}`,
          targetType: log.targetType,
          targetId: log.targetId,
          details: log.details,
          ipAddress: log.ipAddress,
          createdAt: log.createdAt,
        });
      }
    }

    // Fetch login logs
    if (type === 'login' || type === 'all') {
      const loginWhere: Record<string, unknown> = {};
      if (userId) {
        loginWhere.userId = userId;
      }

      // For search on login logs, filter by email or deviceType
      if (search) {
        loginWhere.OR = [
          { email: { contains: search } },
          { deviceType: { contains: search } },
        ];
      }

      const loginLogs = await db.loginLog.findMany({
        where: loginWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      for (const log of loginLogs) {
        allLogs.push({
          id: log.id,
          type: 'login',
          action: log.success ? 'login_success' : 'login_failed',
          userEmail: log.email,
          targetType: 'user',
          targetId: log.userId,
          details: JSON.stringify({
            userAgent: log.userAgent,
            deviceType: log.deviceType,
            location: log.location,
          }),
          ipAddress: log.ipAddress,
          createdAt: log.createdAt,
        });
      }
    }

    // Sort all logs by date descending
    allLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Calculate totals
    let adminTotal = 0;
    let loginTotal = 0;

    if (type === 'admin' || type === 'all') {
      const adminWhere: Record<string, unknown> = {};
      if (search) {
        adminWhere.action = { contains: search };
      }
      if (userId) {
        adminWhere.adminId = userId;
      }
      adminTotal = await db.adminLog.count({ where: adminWhere });
    }

    if (type === 'login' || type === 'all') {
      const loginWhere: Record<string, unknown> = {};
      if (userId) {
        loginWhere.userId = userId;
      }
      if (search) {
        loginWhere.OR = [
          { email: { contains: search } },
          { deviceType: { contains: search } },
        ];
      }
      loginTotal = await db.loginLog.count({ where: loginWhere });
    }

    const total = adminTotal + loginTotal;

    // Paginate the combined result
    const paginatedLogs = allLogs.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      data: {
        logs: paginatedLogs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts: {
          admin: adminTotal,
          login: loginTotal,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin logs error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch logs' }, { status: 500 });
  }
}
