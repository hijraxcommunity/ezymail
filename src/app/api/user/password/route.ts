import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, verifyPassword, hashPassword, revokeOtherSessions } from '@/lib/auth';

// PUT /api/user/password - Change password
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    // F-08: an impersonating admin must never be able to change the victim's
    // password (it would silently take over the account). The session's
    // signed `imp` claim marks impersonation.
    if (session.imp) {
      return NextResponse.json(
        { error: 'Password changes are not available while impersonating a user' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    }
    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }
    if (!/[a-z]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'Password must contain at least one lowercase letter' },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number' },
        { status: 400 }
      );
    }

    // Get current user
    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash new password and update
    const newHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: session.userId },
      data: { passwordHash: newHash },
    });

    // F-07: a credential change must terminate access granted by the old
    // credential. Every OTHER session of this user is revoked (their tokens
    // no longer map to a live row), while the device that performed the
    // change stays logged in.
    await revokeOtherSessions(session.userId);

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Change password error:', message);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
