import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST /api/emails/[id]/snooze - Snooze an email
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
    const body = await request.json();
    const { snoozeUntil } = body;

    if (!snoozeUntil) {
      return NextResponse.json({ error: 'snoozeUntil is required' }, { status: 400 });
    }

    const snoozeDate = new Date(snoozeUntil);
    if (isNaN(snoozeDate.getTime())) {
      return NextResponse.json({ error: 'Invalid snooze date' }, { status: 400 });
    }

    // Find the email
    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Set snooze and mark as unread
    const updatedEmail = await db.email.update({
      where: { id },
      data: {
        snoozedUntil: snoozeDate,
        isRead: false,
      },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    return NextResponse.json({ success: true, email: updatedEmail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Snooze email error:', message);
    return NextResponse.json({ error: 'Failed to snooze email' }, { status: 500 });
  }
}

// DELETE /api/emails/[id]/snooze - Un-snooze an email
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const updatedEmail = await db.email.update({
      where: { id },
      data: { snoozedUntil: null },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    return NextResponse.json({ success: true, email: updatedEmail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Unsnooze email error:', message);
    return NextResponse.json({ error: 'Failed to unsnooze email' }, { status: 500 });
  }
}
