import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const updateReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
});

// PUT /api/admin/reports/[id] - Resolve or dismiss a report
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateReportSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const report = await db.report.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!report) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }

    if (report.status !== 'pending') {
      return NextResponse.json({ success: false, error: `Report is already ${report.status}` }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

    const updated = await db.report.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: new Date(),
      },
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
          },
        },
      },
    });

    // Log the admin action
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: parsed.data.status === 'resolved' ? 'resolve_report' : 'dismiss_report',
        targetType: 'report',
        targetId: id,
        details: JSON.stringify({
          reportId: id,
          emailSubject: updated.email?.subject,
          reporterEmail: updated.reporter?.email,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin update report error:', message);
    return NextResponse.json({ success: false, error: 'Failed to update report' }, { status: 500 });
  }
}
