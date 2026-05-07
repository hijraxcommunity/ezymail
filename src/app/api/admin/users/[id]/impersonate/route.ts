import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ezymail-super-secret-key-change-in-production-2024'
);

// POST /api/admin/users/[id]/impersonate - Create temporary session for target user
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

    // Check target user exists
    const targetUser = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatar: true,
        bio: true,
        signature: true,
        preferences: true,
        onboardingDone: true,
        createdAt: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (targetUser.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Cannot impersonate an inactive user' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

    // Create a new JWT token for the target user
    const token = await new SignJWT({
      userId: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h') // Short-lived: 1 hour for impersonation
      .sign(JWT_SECRET);

    // Create a Session record
    await db.session.create({
      data: {
        userId: targetUser.id,
        token,
        ipAddress: ip,
        deviceName: 'Admin Impersonation Session',
        deviceType: 'admin_impersonation',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Log the impersonation action
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'impersonate_user',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({
          targetEmail: targetUser.email,
          targetName: `${targetUser.firstName} ${targetUser.lastName}`,
          adminEmail: session.email,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          ...targetUser,
          displayName: targetUser.firstName,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin impersonate error:', message);
    return NextResponse.json({ success: false, error: 'Failed to impersonate user' }, { status: 500 });
  }
}
