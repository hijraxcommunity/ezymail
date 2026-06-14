import { NextRequest, NextResponse } from 'next/server';
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

    const campaigns = await db.campaign.findMany({
      where: { businessId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { recipients: true },
        },
      },
    });

    const result = campaigns.map(c => ({
      id: c.id,
      subject: c.subject,
      body: c.body,
      bodyHtml: c.bodyHtml,
      sentAt: c.sentAt,
      opens: c.opens,
      clicks: c.clicks,
      recipientCount: c._count.recipients,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({ campaigns: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List campaigns error:', message);
    return NextResponse.json({ error: 'Failed to list campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { subject, body: campaignBody, bodyHtml, recipientCustomerIds } = body;

    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    if (!campaignBody || !campaignBody.trim()) {
      return NextResponse.json({ error: 'Body is required' }, { status: 400 });
    }

    if (!recipientCustomerIds || !Array.isArray(recipientCustomerIds) || recipientCustomerIds.length === 0) {
      return NextResponse.json({ error: 'recipientCustomerIds must be a non-empty array' }, { status: 400 });
    }

    // Verify all customers belong to this business
    const customers = await db.customer.findMany({
      where: {
        id: { in: recipientCustomerIds },
        businessId: user.id,
      },
      select: { id: true },
    });

    const validCustomerIds = customers.map(c => c.id);
    const invalidIds = recipientCustomerIds.filter((id: string) => !validCustomerIds.includes(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `${invalidIds.length} customer(s) not found or do not belong to your business` },
        { status: 400 }
      );
    }

    // Create campaign with recipients
    const campaign = await db.campaign.create({
      data: {
        businessId: user.id,
        subject: subject.trim(),
        body: campaignBody.trim(),
        bodyHtml: bodyHtml || '',
        recipients: {
          create: validCustomerIds.map(customerId => ({
            customerId,
          })),
        },
      },
      include: {
        _count: {
          select: { recipients: true },
        },
      },
    });

    return NextResponse.json(
      {
        campaign: {
          id: campaign.id,
          subject: campaign.subject,
          body: campaign.body,
          bodyHtml: campaign.bodyHtml,
          sentAt: campaign.sentAt,
          opens: campaign.opens,
          clicks: campaign.clicks,
          recipientCount: campaign._count.recipients,
          createdAt: campaign.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create campaign error:', message);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}