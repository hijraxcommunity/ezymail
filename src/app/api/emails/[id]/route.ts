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
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        // NOTE: `replies` / `parentEmail` includes were removed on purpose.
        // The conversation is rendered from `thread` below (which always contains
        // the opened email), so `email.replies` was only a never-triggered
        // fallback (guarded with `|| []` on the client) and `parentEmail` was
        // unused - both duplicated full rows incl. heavy attachment columns.
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
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
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

    // Strip inline base64 `data` from attachments in the response - keep
    // {name, url, size, type}. Every client consumer falls back to `url`
    // (/api/attachments serves the bytes with a 24h immutable cache).
    // Sending multi-MB data URLs here - duplicated again for the same email
    // inside `thread` - is what made opening emails slow.
    const slimAttachments = (raw?: string | null): string | null | undefined => {
      if (!raw) return raw;
      try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return raw;
        return JSON.stringify(list.map(({ data: _drop, ...rest }) => rest));
      } catch {
        return raw;
      }
    };
    email.attachments = slimAttachments(email.attachments);
    const slimThread = dedupedThread.map((msg) => ({
      ...msg,
      attachments: slimAttachments(msg.attachments),
    }));

    return NextResponse.json({ email, thread: slimThread });
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
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    // Archive follows the conversation: the list renders ONE row per
    // conversation (the newest message), so archiving only the clicked row
    // left the older messages unarchived in the inbox and the 15s poll
    // brought the conversation straight back (same class as the owner's
    // "delete comes back" report 2026-11-09). Scope: this user's own
    // received copies only — rows in other people's mailboxes and the
    // sender's sent copies (threadId=null, recipientEmail=other) are never
    // touched. isRead / isStarred stay per-message.
    if (typeof isArchived === 'boolean' && email.recipientEmail === session.email) {
      const threadKey = email.threadId || email.id;
      await db.email.updateMany({
        where: {
          recipientEmail: session.email,
          id: { not: id },
          OR: [{ threadId: threadKey }, { id: threadKey }],
        },
        data: { isArchived },
      });
    }

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

    // The list renders ONE row per conversation (the newest message), so
    // "delete this email" means the conversation the user sees. Trashing
    // only the clicked row left the older messages in the inbox and the
    // 15s poll brought them straight back — the owner's "when I delete the
    // email it comes back like nothing happened" report 2026-11-09, and the
    // same reason bulk select-all + delete kept leaving stragglers behind.
    // Scope guards: recipientEmail = session.email → only this user's own
    // received copies move; other people's mailboxes (senderId rows) and the
    // sender's sent copies (threadId=null, recipientEmail=other) are never
    // touched — a sent copy always collapses to the single row itself.
    const threadKey = email.threadId || email.id;

    // If already in trash, permanently delete — this user's conversation
    // copies that are ALREADY in trash. The folder='trash' scope guarantees
    // live mail is never destroyed from here.
    if (email.folder === 'trash') {
      await db.email.deleteMany({
        where: {
          folder: 'trash',
          OR: [
            { id },
            { recipientEmail: session.email, OR: [{ threadId: threadKey }, { id: threadKey }] },
          ],
        },
      });
      return NextResponse.json({ success: true, permanentlyDeleted: true });
    }

    // Otherwise, move to trash — the clicked row plus the rest of its
    // conversation (live folders only: trash/spam/drafts rows keep their
    // placement, so trashing one message can never empty the spam view or
    // destroy drafts)
    const updatedEmail = await db.email.update({
      where: { id },
      data: { folder: 'trash' },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    if (email.recipientEmail === session.email) {
      await db.email.updateMany({
        where: {
          recipientEmail: session.email,
          id: { not: id },
          folder: { notIn: ['trash', 'spam', 'drafts'] },
          OR: [{ threadId: threadKey }, { id: threadKey }],
        },
        data: { folder: 'trash' },
      });
    }

    return NextResponse.json({ success: true, email: updatedEmail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete email error:', message);
    return NextResponse.json({ error: 'Failed to delete email' }, { status: 500 });
  }
}
