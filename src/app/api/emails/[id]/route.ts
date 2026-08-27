import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/emails/[id] - Get single email
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const email = await db.email.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
            },
            recipient: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
            },
          },
        },
        parentEmail: {
          include: {
            sender: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check if the email belongs to the current user
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;

    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Mark as read if the user is the recipient and it hasn't been read
    if (isRecipient && !email.isRead) {
      await db.email.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
      email.isRead = true;
      email.readAt = new Date();
    }

    // Fetch full thread: find root threadId, then get all emails in that thread
    const threadId = email.threadId || email.id;
    const thread = await db.email.findMany({
      where: {
        AND: [
          {
            OR: [
              { threadId },
              { id: threadId },
            ],
          },
          {
            OR: [
              { senderId: session.userId },
              { recipientEmail: session.email },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    // Deduplicate thread: if the same sender sent two emails with the same body
    // within 5 seconds (inbox + sent copy), keep only the inbox copy
    const dedupedThread = thread.filter((msg, idx, arr) => {
      // Keep if no earlier message has the same sender+body+time
      const timeBucket = Math.floor(new Date(msg.createdAt).getTime() / 5000);
      const key = `${msg.senderId}:${msg.body?.slice(0, 200)}:${timeBucket}`;
      const firstIdx = arr.findIndex(m => {
        const tb = Math.floor(new Date(m.createdAt).getTime() / 5000);
        return `${m.senderId}:${m.body?.slice(0, 200)}:${tb}` === key;
      });
      return firstIdx === idx;
    });

    return NextResponse.json({ email, thread: dedupedThread });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get email error:', message);
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
  }
}

// PUT /api/emails/[id] - Update email
export async function PUT(
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
    const { isRead, isStarred, isArchived, folder } = body;

    // Find the email
    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized to update this email' }, { status: 403 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (typeof isRead === 'boolean') {
      updateData.isRead = isRead;
      updateData.readAt = isRead ? new Date() : null;
    }
    if (typeof isStarred === 'boolean') {
      updateData.isStarred = isStarred;
    }
    if (typeof isArchived === 'boolean') {
      updateData.isArchived = isArchived;
    }
    if (folder && typeof folder === 'string') {
      const allowedFolders = ['inbox', 'sent', 'drafts', 'trash', 'spam'];
      updateData.folder = allowedFolders.includes(folder) ? folder : email.folder;
    }

    const updatedEmail = await db.email.update({
      where: { id },
      data: updateData,
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    return NextResponse.json({ email: updatedEmail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update email error:', message);
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }
}

// DELETE /api/emails/[id] - Move to trash (or permanently delete if already in trash)
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

    // Find the email
    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized to delete this email' }, { status: 403 });
    }

    // If already in trash, permanently delete
    if (email.folder === 'trash') {
      await db.email.delete({ where: { id } });
      return NextResponse.json({ success: true, permanentlyDeleted: true });
    }

    // Otherwise, move to trash
    const updatedEmail = await db.email.update({
      where: { id },
      data: { folder: 'trash' },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    return NextResponse.json({ success: true, email: updatedEmail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete email error:', message);
    return NextResponse.json({ error: 'Failed to delete email' }, { status: 500 });
  }
}
