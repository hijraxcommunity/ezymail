import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, verifyPassword } from '@/lib/auth';
import { generateSecret, generateBackupCodes, buildOtpAuthUri, verifyTOTP } from '@/lib/totp';
import { z } from 'zod/v4';

const verifyBodySchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

const disableBodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// GET /api/user/2fa - Get 2FA status
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const twoFactor = await db.twoFactor.findFirst({
      where: { userId: session.userId },
      select: {
        isEnabled: true,
        verifiedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enabled: twoFactor?.isEnabled ?? false,
        verified: !!twoFactor?.verifiedAt,
        createdAt: twoFactor?.createdAt?.toISOString() ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get 2FA status error:', message);
    return NextResponse.json({ success: false, error: 'Failed to get 2FA status' }, { status: 500 });
  }
}

// POST /api/user/2fa - Enable 2FA (generates secret, returns QR code data)
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Check if 2FA is already enabled
    const existing = await db.twoFactor.findFirst({
      where: { userId: session.userId },
    });

    if (existing?.isEnabled) {
      return NextResponse.json(
        { success: false, error: '2FA is already enabled' },
        { status: 400 }
      );
    }

    // Generate new TOTP secret and backup codes
    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    const otpAuthUri = buildOtpAuthUri(session.email, secret);

    // Upsert the TwoFactor record
    await db.twoFactor.upsert({
      where: {
        id: existing?.id || '',
      },
      create: {
        userId: session.userId,
        secret,
        backupCodes: JSON.stringify(backupCodes),
        isEnabled: false,
      },
      update: {
        secret,
        backupCodes: JSON.stringify(backupCodes),
        isEnabled: false,
        verifiedAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        secret,
        otpAuthUri,
        backupCodes,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Enable 2FA error:', message);
    return NextResponse.json({ success: false, error: 'Failed to enable 2FA' }, { status: 500 });
  }
}

// PUT /api/user/2fa - Verify and activate 2FA
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = verifyBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { code } = parsed.data;

    // Find the TwoFactor record
    const twoFactor = await db.twoFactor.findFirst({
      where: { userId: session.userId },
    });

    if (!twoFactor) {
      return NextResponse.json(
        { success: false, error: '2FA not set up. Please generate a secret first.' },
        { status: 400 }
      );
    }

    if (twoFactor.isEnabled) {
      return NextResponse.json(
        { success: false, error: '2FA is already enabled' },
        { status: 400 }
      );
    }

    // Verify the TOTP code
    const isValid = verifyTOTP(twoFactor.secret, code);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Activate 2FA
    await db.twoFactor.update({
      where: { id: twoFactor.id },
      data: {
        isEnabled: true,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: { enabled: true },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Verify 2FA error:', message);
    return NextResponse.json({ success: false, error: 'Failed to verify 2FA' }, { status: 500 });
  }
}

// DELETE /api/user/2fa - Disable 2FA (requires password verification)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = disableBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { password } = parsed.data;

    // Verify user's current password
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Find and delete the TwoFactor record
    const twoFactor = await db.twoFactor.findFirst({
      where: { userId: session.userId },
    });

    if (!twoFactor) {
      return NextResponse.json(
        { success: false, error: '2FA is not enabled' },
        { status: 400 }
      );
    }

    await db.twoFactor.delete({
      where: { id: twoFactor.id },
    });

    return NextResponse.json({
      success: true,
      data: { enabled: false },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Disable 2FA error:', message);
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
