import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendPushNotification } from '@/lib/notifications/sendPushNotification';
import { resolveReplyThreadId } from '@/lib/mail/conversation';

// POST /api/emails/[id]/reply - Reply to an email
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
    const { body: replyBody, bodyHtml, senderFcmToken } = body;

    // Validate
    if (!replyBody || !replyBody.trim()) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }

    // Find the parent email
    const parentEmail = await db.email.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    if (!parentEmail) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = parentEmail.senderId === session.userId;
    const isRecipient = parentEmail.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized to reply to this email' }, { status: 403 });
    }

    // Determine reply recipient (reply goes to the other party)
    const replyRecipientEmail = isSender ? parentEmail.recipientEmail : parentEmail.sender.email;

    // Determine threadId: inherit the parent's key via the shared
    // resolution (parent's threadId → parentEmailId chain → sent-copy
    // inbox-twin bridge). Replying from a SENT copy used to fork a fresh
    // key (threadId = sent-copy id) that nothing could ever link back into
    // the recipient's conversation — the same fork shape that later made
    // Trash show one conversation as several rows. Same rule as
    // POST /api/emails, so both reply paths can never fork again.
    const threadId = await resolveReplyThreadId(db, {
      id: parentEmail.id,
      threadId: parentEmail.threadId,
      parentEmailId: parentEmail.parentEmailId,
      senderId: parentEmail.senderId,
      recipientEmail: parentEmail.recipientEmail,
      body: parentEmail.body,
      createdAt: parentEmail.createdAt,
      folder: parentEmail.folder,
    });

    // Create reply email in the recipient's inbox
    const reply = await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail: replyRecipientEmail,
        subject: parentEmail.subject.startsWith('Re: ')
          ? parentEmail.subject
          : `Re: ${parentEmail.subject}`,
        body: replyBody.trim(),
        bodyHtml: bodyHtml || '',
        folder: 'inbox',
        parentEmailId: parentEmail.id,
        threadId,
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

    // Create a copy in the sender's sent folder (no parentEmailId to avoid duplicate in thread)
    await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail: replyRecipientEmail,
        subject: parentEmail.subject.startsWith('Re: ')
          ? parentEmail.subject
          : `Re: ${parentEmail.subject}`,
        body: replyBody.trim(),
        bodyHtml: bodyHtml || '',
        folder: 'sent',
      },
    });

    // Push notification to the reply recipient (after response — guaranteed
    // to run on serverless). Mirrors the compose path; send failures never
    // affect the reply itself. Recipient may not resolve to a user (e.g.
    // deleted account) — skip push silently in that case.
    const replyRecipientUser = await db.user.findUnique({
      where: { email: replyRecipientEmail },
      select: { id: true },
    });
    if (replyRecipientUser) {
      const senderUser = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      });
      const senderName = senderUser
        ? `${senderUser.firstName} ${senderUser.lastName}`
        : 'Someone';
      // Mirror the compose path: real sender avatar via the compact public
      // URL (the DB data URL would be dropped by the FCM size guard) and the
      // collapsed body preview for the expandable notification. Without
      // these the reply card always showed the letter avatar and no preview.
      const APP_BASE_URL = 'https://ezymail.vercel.app';
      const avatarUrl = senderUser?.avatar?.startsWith('http')
        ? senderUser.avatar
        : senderUser?.avatar?.startsWith('data:')
          ? `${APP_BASE_URL}/api/user/avatar/${senderUser.id}`
          : undefined;
      const preview = replyBody.trim().replace(/\s+/g, ' ').slice(0, 200) || undefined;

      after(() =>
        sendPushNotification({
          recipientUserId: replyRecipientUser.id,
          senderName,
          subject: reply.subject,
          emailId: reply.id,
          senderEmail: senderUser?.email,
          avatarUrl,
          preview,
          // Same wrong-device guard as the compose path: the sending device
          // is skipped by token value even if a stale row binds it to the
          // recipient's account.
          skipFcmToken:
            typeof senderFcmToken === 'string' && senderFcmToken.length >= 32
              ? senderFcmToken
              : undefined,
        }).catch(() => {})
      );
    }

    return NextResponse.json({ success: true, email: reply }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Reply email error:', message);
    return NextResponse.json({ error: 'Failed to reply to email' }, { status: 500 });
  }
}
