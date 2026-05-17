import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendPushNotification } from '@/lib/notifications/sendPushNotification';

// GET /api/emails - List emails
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const folder = searchParams.get('folder') || 'inbox';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search') || '';
    const includeThreads = searchParams.get('includeThreads') === 'true';
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      folder,
    };

    if (folder === 'sent') {
      where.senderId = session.userId;
    } else {
      where.recipientEmail = session.email;
    }

    if (folder === 'starred') {
      delete where.folder;
      where.isStarred = true;
      where.recipientEmail = session.email;
    }

    if (folder === 'archive') {
      delete where.folder;
      where.isArchived = true;
      where.recipientEmail = session.email;
    }

    if (folder === 'scheduled') {
      delete where.folder;
      where.senderId = session.userId;
      where.scheduledAt = { not: null };
      where.sentAt = null;
    }

    if (folder === 'snoozed') {
      delete where.folder;
      where.snoozedUntil = { not: null };
      where.OR = [
        { senderId: session.userId },
        { recipientEmail: session.email },
      ];
    }

    // Exclude snoozed emails from normal folders (unless viewing snoozed folder)
    if (folder !== 'snoozed') {
      where.snoozedUntil = null;
    }

    // Filter out reply emails (with parentEmailId) from the sent folder list
    // Replies should only appear inside the thread view of the parent email
    // includeThreads=true is used by notification polling to detect new replies
    // In inbox: show replies so recipients can see them
    // In sent: hide replies (duplicates, only show parent sent copy)
    if (!includeThreads && !search) {
      if (folder === 'sent') {
        where.parentEmailId = null;
      }
    }

    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { body: { contains: search } },
        { sender: { firstName: { contains: search } } },
        { sender: { lastName: { contains: search } } },
      ];
    }

    const [emails, total] = await Promise.all([
      db.email.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          replies: {
            select: { id: true },
          },
        },
      }),
      db.email.count({ where }),
    ]);

    const formattedEmails = emails.map((email) => ({
      id: email.id,
      senderId: email.senderId,
      recipientEmail: email.recipientEmail,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml,
      isRead: email.isRead,
      isStarred: email.isStarred,
      isArchived: email.isArchived,
      folder: email.folder,
      parentEmailId: email.parentEmailId,
      readAt: email.readAt,
      snoozedUntil: email.snoozedUntil,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      priority: email.priority,
      createdAt: email.createdAt,
      sender: email.sender,
      recipient: email.recipient,
      replyCount: email.replies.length,
    }));

    return NextResponse.json({
      emails: formattedEmails,
      total,
      page,
      limit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List emails error:', message);
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}

// POST /api/emails - Send an email
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { to, cc, bcc, subject, body: emailBody, bodyHtml, replyToId, attachments, scheduledAt, priority } = body;

    // Validate fields
    if (!to || !to.trim()) {
      return NextResponse.json({ error: 'Recipient is required' }, { status: 400 });
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (!emailBody || !emailBody.trim()) {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
    }

    const recipientEmail = to.trim().toLowerCase();

    // Validate recipient is @ezy.af
    if (!recipientEmail.endsWith('@ezy.af')) {
      return NextResponse.json(
        { error: 'EzyMail only supports sending to @ezy.af addresses' },
        { status: 400 }
      );
    }

    // Check if recipient exists
    const recipient = await db.user.findUnique({
      where: { email: recipientEmail },
    });

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    // Check recipient status
    if (recipient.status === 'suspended') {
      return NextResponse.json(
        { error: 'Cannot send email to a suspended account' },
        { status: 400 }
      );
    }

    // Parse attachments - store as JSON string
    const attachmentsJson = attachments && Array.isArray(attachments) && attachments.length > 0
      ? JSON.stringify(attachments)
      : null;

    const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
    const emailPriority = (priority === 'high' || priority === 'low') ? priority : 'normal';

    // Parse CC and BCC recipients
    const ccEmails = cc
      ? cc.split(',').map((e: string) => e.trim().toLowerCase()).filter((e: string) => e.length > 0)
      : [];
    const bccEmails = bcc
      ? bcc.split(',').map((e: string) => e.trim().toLowerCase()).filter((e: string) => e.length > 0)
      : [];

    // Remove main recipient from CC/BCC lists (avoid duplicates)
    const cleanCc = ccEmails.filter((e: string) => e !== recipientEmail);
    const cleanBcc = bccEmails.filter((e: string) => e !== recipientEmail);

    // Validate CC recipients format
    for (const ccAddr of cleanCc) {
      if (!ccAddr.endsWith('@ezy.af')) {
        return NextResponse.json({ error: `CC recipient ${ccAddr} is not a valid @ezy.af address` }, { status: 400 });
      }
    }

    // Validate CC recipients exist
    for (const ccAddr of cleanCc) {
      const ccUser = await db.user.findUnique({ where: { email: ccAddr } });
      if (!ccUser) {
        return NextResponse.json({ error: `CC recipient ${ccAddr} does not have an EzyMail account` }, { status: 400 });
      }
      if (ccUser.status === 'suspended') {
        return NextResponse.json({ error: `CC recipient ${ccAddr} has a suspended account` }, { status: 400 });
      }
    }

    // Validate BCC recipients format
    for (const bccAddr of cleanBcc) {
      if (!bccAddr.endsWith('@ezy.af')) {
        return NextResponse.json({ error: `BCC recipient ${bccAddr} is not a valid @ezy.af address` }, { status: 400 });
      }
    }

    // Validate BCC recipients exist
    for (const bccAddr of cleanBcc) {
      const bccUser = await db.user.findUnique({ where: { email: bccAddr } });
      if (!bccUser) {
        return NextResponse.json({ error: `BCC recipient ${bccAddr} does not have an EzyMail account` }, { status: 400 });
      }
      if (bccUser.status === 'suspended') {
        return NextResponse.json({ error: `BCC recipient ${bccAddr} has a suspended account` }, { status: 400 });
      }
    }

    // Common email data
    const ccValue = cleanCc.length > 0 ? cleanCc.join(', ') : null;
    const bccValue = cleanBcc.length > 0 ? cleanBcc.join(', ') : null;

    const commonData = {
      senderId: session.userId,
      recipientEmail,
      cc: ccValue,
      bcc: bccValue,
      subject: subject.trim(),
      body: emailBody.trim(),
      bodyHtml: bodyHtml || '',
      attachments: attachmentsJson,
      sentAt: isScheduled ? null : new Date(),
      scheduledAt: isScheduled ? new Date(scheduledAt) : null,
      priority: emailPriority,
    };

    const includeOptions = {
      sender: {
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      },
      recipient: {
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      },
    };

    // Create email in main recipient's inbox
    const inboxEmail = await db.email.create({
      data: {
        ...commonData,
        folder: 'inbox',
        parentEmailId: replyToId || null,
      },
      include: includeOptions,
    });

    // Create email in sender's sent folder (no parentEmailId to avoid thread duplication)
    const sentEmail = await db.email.create({
      data: {
        ...commonData,
        folder: 'sent',
      },
      include: includeOptions,
    });

    // Create inbox copies for CC recipients
    for (const ccAddr of cleanCc) {
      const ccUser = await db.user.findUnique({ where: { email: ccAddr } });
      if (!ccUser || ccUser.status === 'suspended') continue;

      await db.email.create({
        data: {
          ...commonData,
          recipientEmail: ccAddr,
          folder: 'inbox',
          cc: null, // Hide CC list from CC recipients
          parentEmailId: replyToId || null,
        },
      });

      // Fire-and-forget push notification to CC recipient
      if (!isScheduled) {
        sendPushNotification({
          recipientUserId: ccUser.id,
          senderName: '', // will be filled below
          subject: `${subject.trim()} (CC)`,
          emailId: inboxEmail.id,
        }).catch(() => {});
      }
    }

    // Create inbox copies for BCC recipients (they don't see each other)
    for (const bccAddr of cleanBcc) {
      const bccUser = await db.user.findUnique({ where: { email: bccAddr } });
      if (!bccUser || bccUser.status === 'suspended') continue;

      // BCC recipients get their own copy WITHOUT cc or bcc fields visible
      await db.email.create({
        data: {
          ...commonData,
          recipientEmail: bccAddr,
          folder: 'inbox',
          cc: null, // Hide CC list from BCC recipients
          bcc: null, // Hide BCC list from BCC recipients
          parentEmailId: replyToId || null,
        },
      });

      // Fire-and-forget push notification to BCC recipient
      if (!isScheduled) {
        sendPushNotification({
          recipientUserId: bccUser.id,
          senderName: '',
          subject: `${subject.trim()} (BCC)`,
          emailId: inboxEmail.id,
        }).catch(() => {});
      }
    }

    // Send push notification to recipient (non-blocking, does not delay response)
    if (!isScheduled) {
      const sender = await db.user.findUnique({
        where: { id: session.userId },
        select: { firstName: true, lastName: true },
      });
      const senderName = sender
        ? `${sender.firstName} ${sender.lastName}`
        : 'Someone';

      // Fire-and-forget — don't await, don't block the email send response
      sendPushNotification({
        recipientUserId: recipient.id,
        senderName,
        subject: subject.trim(),
        emailId: inboxEmail.id,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        email: inboxEmail,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Send email error:', message);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
