import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/business-accounts/[id] - Get single business account details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;

    const account = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        status: true,
        accountType: true,
        businessName: true,
        businessEmail: true,
        employeeCount: true,
        subscriptionStatus: true,
        trialStart: true,
        trialEnd: true,
        softDeletedAt: true,
        emailReservedUntil: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        businessVerification: {
          select: {
            id: true,
            documentUrls: true,
            status: true,
            adminNotes: true,
            submittedAt: true,
            reviewedAt: true,
            reviewedBy: true,
            reviewedByUser: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        teamMembersOwned: {
          select: {
            id: true,
            memberEmail: true,
            role: true,
            invitedAt: true,
            acceptedAt: true,
          },
        },
        _count: {
          select: {
            teamMembersOwned: true,
            customers: true,
            campaigns: true,
          },
        },
      },
    });

    if (!account || account.accountType !== 'business') {
      return NextResponse.json({ error: 'Business account not found' }, { status: 404 });
    }

    // Get recent campaigns for context
    const recentCampaigns = await db.campaign.findMany({
      where: { businessId: id },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        sentAt: true,
        opens: true,
        clicks: true,
        createdAt: true,
        _count: { select: { recipients: true } },
      },
    });

    return NextResponse.json({ account, recentCampaigns });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin get business account error:', message);
    return NextResponse.json({ error: 'Failed to fetch business account' }, { status: 500 });
  }
}

// PUT /api/admin/business-accounts/[id] - Update business account status/subscription
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { subscriptionStatus, businessName, employeeCount, status } = body;

    // Validate account exists and is a business account
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, accountType: true, subscriptionStatus: true, status: true, businessName: true, email: true, trialStart: true },
    });

    if (!existing || existing.accountType !== 'business') {
      return NextResponse.json({ error: 'Business account not found' }, { status: 404 });
    }

    // Validate subscriptionStatus if provided
    const validSubscriptionStatuses = ['pending_verification', 'trial', 'active', 'expired'];
    if (subscriptionStatus && !validSubscriptionStatuses.includes(subscriptionStatus)) {
      return NextResponse.json(
        { error: `Invalid subscriptionStatus. Must be one of: ${validSubscriptionStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate user status if provided
    const validStatuses = ['active', 'suspended'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (subscriptionStatus) updateData.subscriptionStatus = subscriptionStatus;
    if (businessName !== undefined) updateData.businessName = businessName;
    if (employeeCount !== undefined) updateData.employeeCount = employeeCount;
    if (status) updateData.status = status;

    // Auto-set trial dates when activating subscription
    if (subscriptionStatus === 'trial' && !existing.trialStart) {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial
      updateData.trialStart = now;
      updateData.trialEnd = trialEnd;
    }

    // Clear soft delete if activating
    if (status === 'active') {
      updateData.softDeletedAt = null;
    }

    const updatedAccount = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        accountType: true,
        businessName: true,
        businessEmail: true,
        employeeCount: true,
        subscriptionStatus: true,
        trialStart: true,
        trialEnd: true,
        softDeletedAt: true,
        updatedAt: true,
      },
    });

    // Log admin action
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'update_business_account',
        targetType: 'business_account',
        targetId: id,
        details: JSON.stringify({
          targetEmail: existing.email,
          changes: {
            ...(subscriptionStatus ? { subscriptionStatus: { from: existing.subscriptionStatus, to: subscriptionStatus } } : {}),
            ...(status ? { status: { from: existing.status, to: status } } : {}),
            ...(businessName !== undefined ? { businessName: { from: existing.businessName, to: businessName } } : {}),
          },
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({ account: updatedAccount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin update business account error:', message);
    return NextResponse.json({ error: 'Failed to update business account' }, { status: 500 });
  }
}

// DELETE /api/admin/business-accounts/[id] - Suspend/delete business account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;

    // Validate account exists and is a business account
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, accountType: true, status: true, email: true, businessName: true },
    });

    if (!existing || existing.accountType !== 'business') {
      return NextResponse.json({ error: 'Business account not found' }, { status: 404 });
    }

    // Soft-delete the business account (set softDeletedAt and suspend)
    const updatedAccount = await db.user.update({
      where: { id },
      data: {
        softDeletedAt: new Date(),
        status: 'suspended',
        subscriptionStatus: 'expired',
      },
      select: {
        id: true,
        email: true,
        status: true,
        subscriptionStatus: true,
        softDeletedAt: true,
      },
    });

    // Log admin action
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'delete_business_account',
        targetType: 'business_account',
        targetId: id,
        details: JSON.stringify({
          targetEmail: existing.email,
          businessName: existing.businessName,
          previousStatus: existing.status,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Business account suspended and soft-deleted',
      account: updatedAccount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin delete business account error:', message);
    return NextResponse.json({ error: 'Failed to delete business account' }, { status: 500 });
  }
}

// PATCH /api/admin/business-accounts/[id] - Specific actions: activate, suspend, expire
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const validActions = ['activate', 'suspend', 'expire'];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate account exists and is a business account
    const existing = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        accountType: true,
        status: true,
        subscriptionStatus: true,
        email: true,
        businessName: true,
        trialStart: true,
        trialEnd: true,
      },
    });

    if (!existing || existing.accountType !== 'business') {
      return NextResponse.json({ error: 'Business account not found' }, { status: 404 });
    }

    // Build update based on action
    const updateData: Record<string, unknown> = {};
    let logAction = '';

    switch (action) {
      case 'activate':
        updateData.status = 'active';
        updateData.subscriptionStatus = 'active';
        updateData.softDeletedAt = null;
        logAction = 'activate_business_account';
        break;
      case 'suspend':
        updateData.status = 'suspended';
        logAction = 'suspend_business_account';
        break;
      case 'expire':
        updateData.subscriptionStatus = 'expired';
        logAction = 'expire_business_account';
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updatedAccount = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        status: true,
        subscriptionStatus: true,
        softDeletedAt: true,
        updatedAt: true,
      },
    });

    // Log admin action
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: logAction,
        targetType: 'business_account',
        targetId: id,
        details: JSON.stringify({
          targetEmail: existing.email,
          businessName: existing.businessName,
          previousStatus: existing.status,
          previousSubscriptionStatus: existing.subscriptionStatus,
          action,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({ account: updatedAccount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin patch business account error:', message);
    return NextResponse.json({ error: 'Failed to perform action on business account' }, { status: 500 });
  }
}