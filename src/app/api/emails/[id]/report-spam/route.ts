import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/emails/[id]/report-spam
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    // Check email exists and belongs to user
    const email = await db.email.findFirst({
      where: { id, recipientId: session.userId },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Create spam report
    await db.report.create({
      data: {
        reporterId: session.userId,
        emailId: id,
        reason: 'spam',
        status: 'pending',
      },
    });

    // Move email to spam folder
    await db.email.update({
      where: { id },
      data: { folder: 'spam' },
    });

    return NextResponse.json({ success: true, message: 'Email reported as spam' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Report spam error:', message);
    return NextResponse.json({ error: 'Failed to report spam' }, { status: 500 });
  }
}