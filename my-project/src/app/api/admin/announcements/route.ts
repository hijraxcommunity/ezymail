import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const announcementSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(500, 'Subject too long'),
  body: z.string().min(1, 'Body is required'),
  userIds: z.array(z.string()).optional(),
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
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

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

    // Create emails for each recipient using a transaction
    const result = await db.$transaction(async (tx) => {
      // Create the emails
      const emails = await Promise.all(
        recipients.map((recipient) =>
          tx.email.create({
            data: {
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
            },
          })
        )
      );

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

      return emails.length;
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
