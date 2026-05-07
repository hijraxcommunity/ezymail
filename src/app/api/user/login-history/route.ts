import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod/v4';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/user/login-history - List recent login attempts
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.parse(params);
    const page = parsed.page;
    const limit = parsed.limit;
    const skip = (page - 1) * limit;

    const [loginLogs, total] = await Promise.all([
      db.loginLog.findMany({
        where: { userId: session.userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.loginLog.count({
        where: { userId: session.userId },
      }),
    ]);

    const formattedLogs = loginLogs.map((log) => ({
      id: log.id,
      date: log.createdAt.toISOString(),
      ipAddress: log.ipAddress,
      userAgent: log.userAgent || null,
      deviceType: log.deviceType || null,
      location: log.location || null,
      success: log.success,
    }));

    return NextResponse.json({
      success: true,
      data: {
        logs: formattedLogs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Login history error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch login history' }, { status: 500 });
  }
}
