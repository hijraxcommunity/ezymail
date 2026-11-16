import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requireActiveBusiness } from '@/lib/business-guard';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // F-16: business DATA routes require an active subscription — expired
    // businesses previously kept full analytics access forever.
    const guard = await requireActiveBusiness(session.userId);
    if (guard) return guard;

    // Run queries in parallel for performance
    const [
      sentEmailsResult,
      receivedEmailsResult,
      customerCountResult,
      campaignsResult,
      teamMemberCountResult,
      recentEmails,
    ] = await Promise.all([
      // Total emails sent
      db.email.count({
        where: { senderId: session.userId },
      }),
      // Total emails received
      db.email.count({
        where: { recipientEmail: session.email },
      }),
      // Total customers
      db.customer.count({
        where: { businessId: session.userId },
      }),
      // Campaign stats
      db.campaign.findMany({
        where: { businessId: session.userId },
        select: { opens: true, clicks: true },
      }),
      // Team member count
      db.teamMember.count({
        where: { businessId: session.userId },
      }),
      // Recent 10 emails (sent or received)
      db.email.findMany({
        where: {
          OR: [
            { senderId: session.userId },
            { recipientEmail: session.email },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          subject: true,
          senderId: true,
          recipientEmail: true,
          isRead: true,
          folder: true,
          createdAt: true,
        },
      }),
    ]);

    // Aggregate campaign stats
    const totalCampaigns = campaignsResult.length;
    const totalOpens = campaignsResult.reduce((sum, c) => sum + c.opens, 0);
    const totalClicks = campaignsResult.reduce((sum, c) => sum + c.clicks, 0);

    // Calculate total recipients for rate calculations
    const totalRecipients = await db.campaignRecipient.count({
      where: {
        campaign: { businessId: session.userId },
      },
    });

    const openRate = totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0;
    const clickRate = totalRecipients > 0 ? Math.round((totalClicks / totalRecipients) * 100) : 0;

    return NextResponse.json({
      analytics: {
        totalEmailsSent: sentEmailsResult,
        totalEmailsReceived: receivedEmailsResult,
        totalCustomers: customerCountResult,
        totalCampaigns,
        totalOpens,
        totalClicks,
        // F-21: the real campaign audience denominator. It was computed here
        // all along but never returned, so the UI charts fell back to
        // customer counts and an invented formula — authoritative-looking
        // numbers measuring the wrong thing. The engagement charts now read
        // opens/clicks against THIS value.
        totalRecipients,
        openRate,
        clickRate,
        teamMemberCount: teamMemberCountResult,
        recentActivity: recentEmails.map(e => ({
          id: e.id,
          subject: e.subject,
          type: e.senderId === session.userId ? 'sent' : 'received',
          isRead: e.isRead,
          folder: e.folder,
          createdAt: e.createdAt,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Business analytics error:', message);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}