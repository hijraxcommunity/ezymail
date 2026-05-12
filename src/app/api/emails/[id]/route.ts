import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/emails/[id] - Get single email with full thread chain
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

    // Check ownership
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // ─── Build full thread chain ───
    // Walk up the parent chain to find all ancestors
    const ancestors: typeof email[] = [];
    let currentParent = email.parentEmail;
    const visitedIds = new Set<string>();

    while (currentParent && !visitedIds.has(currentParent.id)) {
      visitedIds.add(currentParent.id);
      // Fetch this ancestor's replies too (they might contain siblings)
      const ancestorWithEmails = await db.email.findUnique({
        where: { id: currentParent.id },
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
      if (ancestorWithEmails) {
        ancestors.unshift(ancestorWithEmails); // Add to beginning (oldest first)
        currentParent = ancestorWithEmails.parentEmail;
      } else {
        break;
      }
    }

    // Build thread: ancestors + current email + replies
    // Collect all unique message IDs to avoid duplicates
    const threadMap = new Map<string, typeof email>();

    // Add ancestors
    for (const ancestor of ancestors) {
      threadMap.set(ancestor.id, ancestor);
      // Also add the ancestor's replies (siblings of our email)
      if (ancestor.replies) {
        for (const reply of ancestor.replies) {
          threadMap.set(reply.id, reply as unknown as typeof email);
        }
      }
    }

    // Add current email
    threadMap.set(email.id, email);

    // Add current email's replies (descendants)
    if (email.replies) {
      for (const reply of email.replies) {
        threadMap.set(reply.id, reply as unknown as typeof email);
      }
    }

    // Sort by createdAt ascending
    const thread = Array.from(threadMap.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Cross-copy threading for sent emails (keep existing logic)
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
        (email as unknown as Record<string, unknown>).replies = inboxCopy.replies;
      }
    }

    // Mark as read
    if (isRecipient && !email.isRead) {
      await db.email.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
      email.isRead = true;
      email.readAt = new Date();
    }

    return NextResponse.json({ email, thread });
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
