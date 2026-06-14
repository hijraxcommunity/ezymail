import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user || user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

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
        where: { senderId: user.id },
      }),
      // Total emails received
      db.email.count({
        where: { recipientEmail: user.email },
      }),
      // Total customers
      db.customer.count({
        where: { businessId: user.id },
      }),
      // Campaign stats
      db.campaign.findMany({
        where: { businessId: user.id },
        select: { opens: true, clicks: true },
      }),
      // Team member count
      db.teamMember.count({
        where: { businessId: user.id },
      }),
      // Recent 10 emails (sent or received)
      db.email.findMany({
        where: {
          OR: [
            { senderId: user.id },
            { recipientEmail: user.email },
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
        campaign: { businessId: user.id },
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
        openRate,
        clickRate,
        teamMemberCount: teamMemberCountResult,
        recentActivity: recentEmails.map(e => ({
          id: e.id,
          subject: e.subject,
          type: e.senderId === user.id ? 'sent' : 'received',
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