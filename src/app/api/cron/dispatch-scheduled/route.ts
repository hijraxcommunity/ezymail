import { NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { sendPushNotification } from '@/lib/notifications/sendPushNotification';

/**
 * F-03: scheduled-email dispatcher — the missing delivery pipeline.
 *
 * POST /api/emails stores a scheduled send as rows with sentAt=null and
 * scheduledAt=<future> (the recipient's inbox copy + the sender's copy).
 * The recipient's inbox list hides not-yet-dispatched rows; this cron is
 * what flips them to delivered at (or after) the scheduled time:
 *
 *   1. Find every due copy (scheduledAt <= now, sentAt still null).
 *   2. Flip sentAt=now with ONE idempotent update — a second run (retry,
 *      overlapping cron hit) finds no rows and is a no-op, so delivery
 *      happens exactly once per row.
 *   3. Send the push notification for each dispatched INBOX copy (the
 *      sender's own scheduled copy only clears their Scheduled view).
 *
 * Auth: same CRON_SECRET contract as trial-expiry (see src/lib/cron-auth.ts).
 * Residual: two truly concurrent cron invocations could both read the same
 * due rows before either flips them and both send a push (at-least-once
 * notification, at-most-once delivery flip — Vercel Cron schedules do not
 * overlap in practice).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // 1. Due copies, bounded per invocation (the next cron tick handles any
    //    backlog; 200 sends ≈ the per-send fan-out this endpoint can push).
    const dueRows = await db.email.findMany({
      where: {
        scheduledAt: { lte: now },
        sentAt: null,
      },
      select: {
        id: true,
        senderId: true,
        recipientEmail: true,
        subject: true,
        body: true,
        folder: true,
        scheduledAt: true,
      },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    });

    if (dueRows.length === 0) {
      return NextResponse.json({ ok: true, dispatched: 0 });
    }

    // 2. Flip them delivered — one write, exactly-once semantics.
    await db.email.updateMany({
      where: { id: { in: dueRows.map((r) => r.id) } },
      data: { sentAt: now },
    });

    // 3. Push per dispatched inbox copy (recipient-facing rows only).
    const dispatchedInbox = dueRows.filter((r) => r.folder === 'inbox');
    for (const row of dispatchedInbox) {
      const recipientUser = await db.user.findUnique({
        where: { email: row.recipientEmail },
        select: { id: true },
      });
      if (!recipientUser) continue;
      const sender = await db.user.findUnique({
        where: { id: row.senderId },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      });
      const senderName = sender
        ? `${sender.firstName} ${sender.lastName}`
        : 'Someone';
      const preview = row.body.replace(/\s+/g, ' ').slice(0, 200) || undefined;
      const APP_BASE_URL = 'https://ezymail.vercel.app';
      const avatarUrl = sender?.avatar?.startsWith('http')
        ? sender.avatar
        : sender?.avatar?.startsWith('data:')
          ? `${APP_BASE_URL}/api/user/avatar/${sender.id}`
          : undefined;

      after(() =>
        sendPushNotification({
          recipientUserId: recipientUser.id,
          senderName,
          subject: row.subject,
          emailId: row.id,
          senderEmail: sender?.email,
          avatarUrl,
          preview,
        }).catch(() => {})
      );
    }

    return NextResponse.json({
      ok: true,
      dispatched: dueRows.length,
      notified: dispatchedInbox.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Dispatch scheduled error:', message);
    return NextResponse.json({ error: 'Failed to dispatch scheduled emails' }, { status: 500 });
  }
}
