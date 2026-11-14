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
      select: {
        id: true,
        email: true,
        businessEmail: true,
        firstName: true,
        lastName: true,
        phone: true,
        businessName: true,
        accountType: true,
        employeeCount: true,
        subscriptionStatus: true,
        trialStart: true,
        trialEnd: true,
        createdAt: true,
        avatar: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    return NextResponse.json({ user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get business profile error:', message);
    return NextResponse.json({ error: 'Failed to get business profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify business account
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    const body = await request.json();
    const { businessName, phone, employeeCount } = body;

    const updateData: Record<string, string | null> = {};
    if (businessName !== undefined) {
      if (!businessName.trim()) {
        return NextResponse.json({ error: 'Business name cannot be empty' }, { status: 400 });
      }
      updateData.businessName = businessName.trim();
    }
    if (phone !== undefined) {
      updateData.phone = phone ? phone.trim() : null;
    }
    if (employeeCount !== undefined) {
      updateData.employeeCount = employeeCount ? String(employeeCount) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updatedUser = await db.user.update({
      where: { id: session.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        businessEmail: true,
        firstName: true,
        lastName: true,
        phone: true,
        businessName: true,
        accountType: true,
        employeeCount: true,
        subscriptionStatus: true,
        trialStart: true,
        trialEnd: true,
        avatar: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update business profile error:', message);
    return NextResponse.json({ error: 'Failed to update business profile' }, { status: 500 });
  }
}

// DELETE /api/business/profile - Self-service business account deletion.
// F-14: the Settings > Danger Zone flow has always called this method; the
// route never implemented it (Next.js answered 405 and the UI showed
// 'Failed to delete account' forever). Deletion is SOFT by design: the
// account and its data remain for audit/recovery, but access is terminated
// immediately (session rows revoked; login and getSession both refuse
// soft-deleted accounts) and the address enters the same 30-day reservation
// window the trial-expiry cron uses, after which it can be claimed again.
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    const now = new Date();
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          softDeletedAt: now,
          status: 'deleted',
          // Same 30-day address hold the trial-expiry cron grants; after the
          // window the address becomes registrable again (F-16 release).
          emailReservedUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
      // Terminate every session NOW — the current device logs out instantly.
      db.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Business account deleted. You have been signed out.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete business profile error:', message);
    return NextResponse.json({ error: 'Failed to delete business account' }, { status: 500 });
  }
}