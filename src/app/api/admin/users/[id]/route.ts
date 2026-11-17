import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';

// GET /api/admin/users/[id] - Get user details
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

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        status: true,
        recoveryEmail: true,
        lastLogin: true,
        lastIp: true,
        createdAt: true,
        updatedAt: true,
        dateOfBirth: true,
        _count: {
          select: {
            sentEmails: true,
            receivedEmails: true,
            sessions: true,
            reports: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get recent emails
    const recentEmails = await db.email.findMany({
      where: {
        OR: [{ senderId: id }, { recipientEmail: user.email }],
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        folder: true,
        createdAt: true,
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ user, recentEmails });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin get user error:', message);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

// PUT /api/admin/users/[id] - Update user status
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
    const { status } = body;

    if (!status || !['active', 'suspended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Use "active" or "suspended".' }, { status: 400 });
    }

    // Check user exists
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent admin from suspending themselves
    if (id === session.userId && status === 'suspended') {
      return NextResponse.json({ error: 'Cannot suspend your own account' }, { status: 400 });
    }

    // F-45: admins cannot suspend other admins. Admin availability is a
    // whole-system dependency (the only actors who can undo a suspension),
    // so a suspension of an admin by an admin is a lock-out risk with no
    // legitimate flow. Admins recover their own accounts out-of-band.
    if (user.role === 'admin' && status === 'suspended') {
      return NextResponse.json({ error: 'Cannot suspend another administrator account' }, { status: 403 });
    }

    // Update user status. F-11: suspension must terminate the victim's
    // existing sessions in the same transaction — previously only the DB row
    // changed and the victim's live cookie kept working until its 30-day exp
    // (and the daily rotation kept sliding it). Reactivation later is safe:
    // the user simply logs in again, creating fresh rows.
    const [updatedUser] = await db.$transaction([
      db.user.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      }),
      db.session.deleteMany({ where: { userId: id } }),
    ]);

    // Log admin action
    const ip = getClientIp(request);
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: status === 'suspended' ? 'suspend_user' : 'activate_user',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({
          targetEmail: user.email,
          previousStatus: user.status,
          newStatus: status,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin update user error:', message);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - Delete user account
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

    // Check user exists
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent admin from deleting themselves
    if (id === session.userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // F-45: admins are never deleted through this route. Deleting an admin
    // would orphan their AdminLog rows (FK RESTRICT → raw 500) and remove an
    // actor who is the only one able to manage the system. Admin offboarding
    // happens out-of-band with the logs archived first.
    if (user.role === 'admin') {
      return NextResponse.json({ error: 'Cannot delete another administrator account' }, { status: 403 });
    }

    // F-31: business accounts must never hard-delete from this route — the
    // user.delete cascade would destroy their customers, campaigns and team
    // irreversibly, while the Business Accounts tab only soft-deletes. Route
    // them through the exact same soft-delete the business tab uses.
    if (user.accountType === 'business') {
      const [softDeleted] = await db.$transaction([
        db.user.update({
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
        }),
        // Suspension semantics (F-11): kill live sessions too.
        db.session.deleteMany({ where: { userId: id } }),
      ]);

      const ip = getClientIp(request);
      await db.adminLog.create({
        data: {
          adminId: session.userId,
          action: 'delete_business_account',
          targetType: 'business_account',
          targetId: id,
          details: JSON.stringify({
            targetEmail: user.email,
            note: 'soft-deleted via Users tab — routed to the business soft-delete',
          }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({
        success: true,
        softDeleted: true,
        user: softDeleted,
        message: 'Business account soft-deleted (deactivated) rather than destroyed — manage it from the Business Accounts tab.',
      });
    }

    // Log admin action before deletion
    const ip = getClientIp(request);
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'delete_user',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({
          targetEmail: user.email,
          targetName: `${user.firstName} ${user.lastName}`,
        }),
        ipAddress: ip,
      },
    });

    // Delete user (cascade will handle related records)
    await db.user.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin delete user error:', message);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
