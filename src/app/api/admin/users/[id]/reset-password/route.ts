import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Generate a random temporary password (8 characters)
function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  // Ensure at least one uppercase, one lowercase, one digit
  password += 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 22)];
  password += 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 23)];
  password += '23456789'[Math.floor(Math.random() * 8)];

  // Fill remaining 5 chars randomly
  for (let i = 0; i < 5; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  // Shuffle the password
  const arr = password.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

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
