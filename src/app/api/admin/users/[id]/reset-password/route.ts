import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';

// Generate a random temporary password (8 characters).
// F-42: this value grants account access, so every draw comes from a
// cryptographic RNG (crypto.randomInt), never Math.random — the old
// non-CSPRNG draws were predictable within same-process bursts.
function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  // Ensure at least one uppercase, one lowercase, one digit
  password += 'ABCDEFGHJKMNPQRSTUVWXYZ'[randomInt(0, 22)];
  password += 'abcdefghjkmnpqrstuvwxyz'[randomInt(0, 23)];
  password += '23456789'[randomInt(0, 8)];

  // Fill remaining 5 chars randomly
  for (let i = 0; i < 5; i++) {
    password += chars[randomInt(0, chars.length)];
  }

  // Shuffle the password
  const arr = password.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.join('');
}

// POST /api/admin/users/[id]/reset-password - Reset user's password
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;

    // Check user exists
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // F-45: administrators are outside this route's blast radius. Admin A
    // resetting admin B's password would hand A a credential for B's account
    // (and B would never know); admins recover their own access through the
    // standard forgot-password flow instead.
    if (user.role === 'admin') {
      return NextResponse.json(
        { success: false, error: "Cannot reset another administrator's password" },
        { status: 403 }
      );
    }

    const ip = getClientIp(request);

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Hash the password
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    // Update user's password
    await db.user.update({
      where: { id },
      data: { passwordHash: hashedPassword },
    });

    // Invalidate all existing sessions for this user
    await db.session.deleteMany({
      where: { userId: id },
    });

    // Log the action
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'reset_user_password',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({
          targetEmail: user.email,
          targetName: `${user.firstName} ${user.lastName}`,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        temporaryPassword,
        message: `Password for ${user.email} has been reset. All existing sessions have been invalidated.`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin reset password error:', message);
    return NextResponse.json({ success: false, error: 'Failed to reset password' }, { status: 500 });
  }
}
