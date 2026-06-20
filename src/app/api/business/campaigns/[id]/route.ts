import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const campaign = await db.campaign.findUnique({
      where: { id },
      include: {
        recipients: {
          include: {
            customer: {
              select: { id: true, email: true, name: true },
            },
          },
        },
        _count: {
          select: { recipients: true },
        },
      },
    });

    if (!campaign || campaign.businessId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const openedCount = campaign.recipients.filter(r => r.openedAt !== null).length;
    const clickedCount = campaign.recipients.filter(r => r.clickedAt !== null).length;

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        subject: campaign.subject,
        body: campaign.body,
        bodyHtml: campaign.bodyHtml,
        sentAt: campaign.sentAt,
        opens: campaign.opens,
        clicks: campaign.clicks,
        recipientCount: campaign._count.recipients,
        openedCount,
        clickedCount,
        openRate: campaign._count.recipients > 0
          ? Math.round((openedCount / campaign._count.recipients) * 100)
          : 0,
        clickRate: campaign._count.recipients > 0
          ? Math.round((clickedCount / campaign._count.recipients) * 100)
          : 0,
        createdAt: campaign.createdAt,
        recipients: campaign.recipients.map(r => ({
          id: r.id,
          openedAt: r.openedAt,
          clickedAt: r.clickedAt,
          customer: r.customer,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get campaign error:', message);
    return NextResponse.json({ error: 'Failed to get campaign' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const campaign = await db.campaign.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!campaign || campaign.businessId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await db.campaign.delete({ where: { id } });

    return NextResponse.json({ message: 'Campaign deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete campaign error:', message);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}