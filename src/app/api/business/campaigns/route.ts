import { NextRequest, NextResponse } from 'next/server';
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
    // businesses previously kept full access forever.
    const guard = await requireActiveBusiness(session.userId);
    if (guard) return guard;

    const campaigns = await db.campaign.findMany({
      where: { businessId: session.userId },
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

    // F-16: business DATA routes require an active subscription — expired
    // businesses previously kept full access forever.
    const guard = await requireActiveBusiness(session.userId);
    if (guard) return guard;

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

    // F-66: explicit input discipline. (1) A cap — an unbounded array used
    // to fan out into unbounded nested creates in ONE transaction; (2)
    // dedupe BEFORE the ownership check so duplicates are handled at the
    // input boundary instead of silently collapsed by the findMany (or, on
    // older paths, exploding as a P2002 on @@unique([campaignId, customerId]));
    // (3) any P2002 that still races through maps to 409 in the catch.
    const MAX_CAMPAIGN_RECIPIENTS = 1000;
    const dedupedCustomerIds = [...new Set(recipientCustomerIds.map(String))];
    if (dedupedCustomerIds.length > MAX_CAMPAIGN_RECIPIENTS) {
      return NextResponse.json(
        { error: `A campaign can target at most ${MAX_CAMPAIGN_RECIPIENTS} customers` },
        { status: 400 }
      );
    }

    // Verify all customers belong to this business
    const customers = await db.customer.findMany({
      where: {
        id: { in: dedupedCustomerIds },
        businessId: session.userId,
      },
      select: { id: true },
    });

    const validCustomerIds = customers.map(c => c.id);
    const invalidIds = dedupedCustomerIds.filter((id: string) => !validCustomerIds.includes(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `${invalidIds.length} customer(s) not found or do not belong to your business` },
        { status: 400 }
      );
    }

    // Create campaign with recipients
    const campaign = await db.campaign.create({
      data: {
        businessId: session.userId,
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
    // F-66: a raced duplicate on @@unique([campaignId, customerId]) is a
    // conflict, not a 500.
    if (
      error && typeof error === 'object' && 'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Duplicate recipient in campaign' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create campaign error:', message);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}