import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { z } from 'zod';

const announcementSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(500, 'Subject too long'),
  body: z.string().min(1, 'Body is required'),
  // S-08: the selection was unbounded (client-controlled array) — cap the
  // explicit selection so one request can never fan out without bound.
  userIds: z.array(z.string()).max(1000, 'Too many recipients selected (max 1000 per announcement)').optional(),
});

// POST /api/admin/announcements - Send announcement email to all users or selected users
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = announcementSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const { subject, body: emailBody, userIds } = parsed.data;
    const ip = getClientIp(request);

    // Determine recipients
    let recipients: { id: string; email: string }[];

    if (userIds && userIds.length > 0) {
      // Send to selected users
      const users = await db.user.findMany({
        where: {
          id: { in: userIds },
          status: 'active',
        },
        select: { id: true, email: true },
      });
      recipients = users;
    } else {
      // Send to all active users
      const users = await db.user.findMany({
        where: {
          status: 'active',
        },
        select: { id: true, email: true },
      });
      recipients = users;
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid recipients found' },
        { status: 400 }
      );
    }

    // S-08: hard cap on the fan-out (env-overridable). The "all active
    // users" branch used to be unbounded, and every recipient meant one
    // INSERT round-trip inside one long transaction — on a large user base
    // that transaction could time out while holding row locks.
    const maxRecipients = Number(process.env.ANNOUNCEMENT_MAX_RECIPIENTS) || 5000;
    if (recipients.length > maxRecipients) {
      return NextResponse.json(
        { success: false, error: `Announcement recipient cap exceeded (${maxRecipients}). Split the announcement into smaller batches.` },
        { status: 400 }
      );
    }

    // Create emails for each recipient using a transaction. S-08: one bulk
    // createMany INSERT (single statement) instead of N sequential
    // round-trips — same rows, same atomic AdminLog pairing, but the
    // transaction stays short regardless of recipient count.
    const result = await db.$transaction(async (tx) => {
      // Create the emails
      const created = await tx.email.createMany({
        data: recipients.map((recipient) => ({
          senderId: session.userId,
          recipientEmail: recipient.email,
          subject,
          body: emailBody,
          bodyHtml: emailBody,
          isRead: false,
          isStarred: false,
          isArchived: false,
          isDraft: false,
          folder: 'inbox',
          sentAt: new Date(),
        })),
      });

      // Log the action
      await tx.adminLog.create({
        data: {
          adminId: session.userId,
          action: 'send_announcement',
          targetType: 'announcement',
          details: JSON.stringify({
            subject,
            recipientCount: recipients.length,
            recipientIds: userIds || 'all_active',
          }),
          ipAddress: ip,
        },
      });

      return created.count;
    });

    return NextResponse.json({
      success: true,
      data: {
        sentCount: result,
        recipientCount: recipients.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin announcements error:', message);
    return NextResponse.json({ success: false, error: 'Failed to send announcement' }, { status: 500 });
  }
}
