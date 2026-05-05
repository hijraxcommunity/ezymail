import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

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

    // Update user status
    const updatedUser = await db.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    // Log admin action
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
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

    // Log admin action before deletion
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
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
