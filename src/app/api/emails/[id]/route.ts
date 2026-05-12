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
            recipient: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Cross-copy threading: if this email is a sent copy (no parentEmailId)
    // find the inbox copy that shares the same senderId, recipientEmail,
    // subject, and createdAt, then grab its replies too.
    if (!email.parentEmailId && email.folder === 'sent' && email.replies.length === 0) {
      const inboxCopy = await db.email.findFirst({
        where: {
          senderId: email.senderId,
          recipientEmail: email.recipientEmail,
          subject: email.subject,
          folder: 'inbox',
          createdAt: { gte: new Date(new Date(email.createdAt).getTime() - 5000), lte: new Date(new Date(email.createdAt).getTime() + 5000) },
        },
        include: {
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
        },
      });

      if (inboxCopy && inboxCopy.replies.length > 0) {
        // Attach the inbox copy's replies to this sent email for thread display
        (email as unknown as Record<string, unknown>).replies = inboxCopy.replies;
      }
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

    return NextResponse.json({ email });
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

// DELETE /api/emails/[id] - Move to trash
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

    // Move to trash
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
