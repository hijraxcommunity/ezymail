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
        status: campaign.status,
        scheduledFor: campaign.scheduledFor,
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

// D1 (Batch 9): draft editing, recipient management and honest scheduling.
//
// Lifecycle rules (enforced server-side, mirrored in the UI):
//   - Only "draft" campaigns are editable (content + recipients) and can be
//     scheduled; a "scheduled" campaign can only be un-scheduled back to
//     draft. "sent" is unreachable until a real outbound provider ships —
//     sentAt is NEVER written by this route, and opens/clicks are never
//     faked: a scheduled campaign simply waits and the UI says so.
//   - Content edits reuse the exact POST discipline: trimmed non-empty
//     subject/body, recipient dedupe + 1000 cap + ownership check (F-66),
//     P2002 → 409.
//   - Recipient replacement is transactional (delete + recreate inside one
//     $transaction) so an interrupted save can never leave a half-updated
//     audience.
//   - scheduledFor must parse and be in the future; scheduling stamps
//     status="scheduled". Un-scheduling clears the date and returns the
//     campaign to "draft".
export async function PUT(
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

    const existing = await db.campaign.findUnique({
      where: { id },
      select: { id: true, businessId: true, status: true },
    });

    if (!existing || existing.businessId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      subject,
      body: campaignBody,
      bodyHtml,
      recipientCustomerIds,
      action,
      scheduledFor,
    } = body;

    // ── State machine guards ──
    const wantsContentEdit =
      subject !== undefined || campaignBody !== undefined ||
      bodyHtml !== undefined || recipientCustomerIds !== undefined;
    const wantsSchedule = action === 'schedule';
    const wantsUnschedule = action === 'unschedule';

    if (!wantsContentEdit && !wantsSchedule && !wantsUnschedule) {
      return NextResponse.json(
        { error: 'Nothing to update: send content fields or action=schedule/unschedule' },
        { status: 400 }
      );
    }

    if (wantsSchedule && existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Only draft campaigns can be scheduled (this one is ${existing.status})` },
        { status: 400 }
      );
    }
    if (wantsContentEdit && existing.status !== 'draft') {
      return NextResponse.json(
        { error: `Only draft campaigns can be edited (this one is ${existing.status})` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    // ── Content edits (drafts only — guarded above) ──
    if (subject !== undefined) {
      if (typeof subject !== 'string' || !subject.trim()) {
        return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
      }
      updateData.subject = subject.trim();
    }
    if (campaignBody !== undefined) {
      if (typeof campaignBody !== 'string' || !campaignBody.trim()) {
        return NextResponse.json({ error: 'Body is required' }, { status: 400 });
      }
      updateData.body = campaignBody.trim();
    }
    if (bodyHtml !== undefined) {
      if (typeof bodyHtml !== 'string') {
        return NextResponse.json({ error: 'bodyHtml must be a string' }, { status: 400 });
      }
      updateData.bodyHtml = bodyHtml;
    }

    // ── Recipient replacement (drafts only, transactional below) ──
    let replacementCustomerIds: string[] | null = null;
    if (recipientCustomerIds !== undefined) {
      if (!Array.isArray(recipientCustomerIds) || recipientCustomerIds.length === 0) {
        return NextResponse.json(
          { error: 'recipientCustomerIds must be a non-empty array' },
          { status: 400 }
        );
      }
      const MAX_CAMPAIGN_RECIPIENTS = 1000;
      const deduped = [...new Set(recipientCustomerIds.map(String))];
      if (deduped.length > MAX_CAMPAIGN_RECIPIENTS) {
        return NextResponse.json(
          { error: `A campaign can target at most ${MAX_CAMPAIGN_RECIPIENTS} customers` },
          { status: 400 }
        );
      }
      const customers = await db.customer.findMany({
        where: { id: { in: deduped }, businessId: session.userId },
        select: { id: true },
      });
      const validIds = customers.map(c => c.id);
      const invalidIds = deduped.filter(cid => !validIds.includes(cid));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `${invalidIds.length} customer(s) not found or do not belong to your business` },
          { status: 400 }
        );
      }
      replacementCustomerIds = validIds;
    }

    // ── Scheduling transition ──
    if (wantsSchedule) {
      const when = scheduledFor ? new Date(scheduledFor) : null;
      if (!when || Number.isNaN(when.getTime())) {
        return NextResponse.json(
          { error: 'scheduledFor must be a valid date/time' },
          { status: 400 }
        );
      }
      if (when.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: 'Scheduled time must be in the future' },
          { status: 400 }
        );
      }
      // Honest by construction: this stamps the OWNER'S INTENT only. No
      // delivery happens — no outbound transport exists — and the UI must
      // keep saying so ("waits until an email provider is connected").
      updateData.status = 'scheduled';
      updateData.scheduledFor = when;
    }
    if (wantsUnschedule) {
      if (existing.status !== 'scheduled') {
        return NextResponse.json(
          { error: `Only scheduled campaigns can be un-scheduled (this one is ${existing.status})` },
          { status: 400 }
        );
      }
      updateData.status = 'draft';
      updateData.scheduledFor = null;
    }

    // ── Apply ──
    const updated = await db.$transaction(async (tx) => {
      if (replacementCustomerIds) {
        await tx.campaignRecipient.deleteMany({ where: { campaignId: id } });
        await tx.campaignRecipient.createMany({
          data: replacementCustomerIds.map(customerId => ({ campaignId: id, customerId })),
        });
      }
      return tx.campaign.update({
        where: { id },
        data: updateData,
        include: { _count: { select: { recipients: true } } },
      });
    });

    return NextResponse.json({
      campaign: {
        id: updated.id,
        subject: updated.subject,
        body: updated.body,
        bodyHtml: updated.bodyHtml,
        status: updated.status,
        scheduledFor: updated.scheduledFor,
        sentAt: updated.sentAt,
        opens: updated.opens,
        clicks: updated.clicks,
        recipientCount: updated._count.recipients,
        createdAt: updated.createdAt,
      },
    });
  } catch (error: unknown) {
    if (
      error && typeof error === 'object' && 'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Duplicate recipient in campaign' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update campaign error:', message);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
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