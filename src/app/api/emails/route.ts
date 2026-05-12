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

    // NOTE: We do NOT filter by parentEmailId = null anymore.
    // Thread grouping is done after fetching so replies are properly
    // nested under their parent thread in the list view.

    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { body: { contains: search } },
        { sender: { firstName: { contains: search } } },
        { sender: { lastName: { contains: search } } },
      ];
    }

    const [emails, totalRaw] = await Promise.all([
      db.email.findMany({
        where,
        skip,
        take: limit * 3, // Fetch extra to account for thread deduplication
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          replies: {
            select: { id: true, createdAt: true, sender: { select: { firstName: true, lastName: true } } },
          },
          parentEmail: {
            select: { id: true, subject: true, sender: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      db.email.count({ where: { ...where, parentEmailId: null } }),
    ]);

    // ─── Thread Grouping ────────────────────────────────────────────────
    // Group emails by their thread root (the earliest email without parentEmailId).
    // For each thread, keep the root email and attach reply metadata.
    const emailMap = new Map<string, typeof emails[0]>();
    for (const email of emails) {
      emailMap.set(email.id, email);
    }

    // Find thread root for each email (follow parentEmail chain)
    const threadRoots = new Map<string, string>(); // emailId -> rootId
    for (const email of emails) {
      let current: typeof emails[0] | undefined = email;
      const visited = new Set<string>();
      while (current?.parentEmailId && emailMap.has(current.parentEmailId) && !visited.has(current.parentEmailId)) {
        visited.add(current.parentEmailId);
        current = emailMap.get(current.parentEmailId);
      }
      const rootId = current?.parentEmailId && !emailMap.has(current.parentEmailId)
        ? current.id // Parent is outside current view — this email becomes the thread representative
        : (current?.id || email.id);
      threadRoots.set(email.id, rootId);
    }

    // Group by root and pick the best representative (latest email in thread)
    const threadGroups = new Map<string, typeof emails[0][]>();
    for (const email of emails) {
      const rootId = threadRoots.get(email.id) || email.id;
      if (!threadGroups.has(rootId)) threadGroups.set(rootId, []);
      threadGroups.get(rootId)!.push(email);
    }

    // Build final list: one representative per thread (the latest email)
    const seen = new Set<string>();
    const finalEmails: typeof emails = [];
    for (const email of emails) {
      const rootId = threadRoots.get(email.id) || email.id;
      if (seen.has(rootId)) continue;
      seen.add(rootId);

      const group = threadGroups.get(rootId) || [email];
      // Sort group by createdAt desc to get the latest
      group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const representative = group[0]; // Latest email is the representative

      // Calculate total reply count for this thread (all emails except root)
      const totalReplies = group.length - 1;
      // Also count replies stored in DB that might not be in this page
      const dbReplyCount = representative.replies?.length || 0;
      const replyCount = Math.max(totalReplies, dbReplyCount);

      // Get all unique senders in the thread for avatar stack
      const threadSenders = new Map<string, { firstName: string; lastName: string; avatar: string | null }>();
      for (const e of group) {
        if (e.sender) {
          threadSenders.set(e.sender.email, e.sender as { firstName: string; lastName: string; avatar: string | null });
        }
      }

      finalEmails.push({
        ...representative,
        _threadReplyCount: replyCount,
        _threadSenders: Array.from(threadSenders.values()),
        _isThreadRoot: rootId === representative.id,
      });
    }

    const formattedEmails = finalEmails.map((email) => ({
      id: email.id,
      senderId: email.senderId,
      recipientEmail: email.recipientEmail,
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
      replyCount: (email as unknown as Record<string, number>)._threadReplyCount || 0,
    }));

    return NextResponse.json({
      emails: formattedEmails,
      total: totalRaw,
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
    const { to, subject, body: emailBody, bodyHtml, replyToId, attachments, scheduledAt, priority } = body;

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

    // Create email in recipient's inbox
    const inboxEmail = await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail,
        subject: subject.trim(),
        body: emailBody.trim(),
        bodyHtml: bodyHtml || '',
        attachments: attachmentsJson,
        folder: 'inbox',
        parentEmailId: replyToId || null,
        sentAt: isScheduled ? null : new Date(),
        scheduledAt: isScheduled ? new Date(scheduledAt) : null,
        priority: emailPriority,
      },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    // Create email in sender's sent folder
    // The sent copy should NOT be part of the reply thread (no parentEmailId)
    // Only the inbox copy participates in the thread to avoid duplicates
    const sentEmail = await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail,
        subject: subject.trim(),
        body: emailBody.trim(),
        bodyHtml: bodyHtml || '',
        attachments: attachmentsJson,
        folder: 'sent',
        sentAt: isScheduled ? null : new Date(),
        scheduledAt: isScheduled ? new Date(scheduledAt) : null,
        priority: emailPriority,
      },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

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
