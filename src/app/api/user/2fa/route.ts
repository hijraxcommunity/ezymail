import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, verifyPassword } from '@/lib/auth';
import { generateSecret, generateBackupCodes, buildOtpAuthUri, verifyTOTP } from '@/lib/totp';
import { z } from 'zod/v4';

const verifyBodySchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

// F-48: activation attempts are throttled per user — without this, the
// verify endpoint can be hammered with 6-digit guesses offline-style (the
// account is known, the rate is unbounded). 5 tries per 15 minutes, matching
// the in-memory limiter conventions used elsewhere in this codebase (see
// audit S-02 for the accepted per-instance limitation).
const TWO_FA_MAX_ATTEMPTS = 5;
const TWO_FA_WINDOW_MS = 15 * 60 * 1000;
const twoFaAttempts = new Map<string, { count: number; resetAt: number }>();

function consumeTwoFaAttempt(userId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = twoFaAttempts.get(userId);
  if (!entry || entry.resetAt <= now) {
    twoFaAttempts.set(userId, { count: 1, resetAt: now + TWO_FA_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > TWO_FA_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

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
    // F-08: 2FA mutations are refused under an impersonation session — the
    // signed `imp` claim marks it. An admin viewing as a user must never be
    // able to weaken or reset that user's second factor.
    if (session.imp) {
      return NextResponse.json(
        { success: false, error: '2FA changes are not available while impersonating a user' },
        { status: 403 }
      );
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
    if (session.imp) {
      return NextResponse.json(
        { success: false, error: '2FA changes are not available while impersonating a user' },
        { status: 403 }
      );
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

    // F-48: throttle verification attempts before any TOTP work.
    const attempt = consumeTwoFaAttempt(session.userId);
    if (!attempt.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many verification attempts. Try again in ${attempt.retryAfterSec} seconds.` },
        { status: 429, headers: { 'Retry-After': String(attempt.retryAfterSec) } }
      );
    }

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
    if (session.imp) {
      return NextResponse.json(
        { success: false, error: '2FA changes are not available while impersonating a user' },
        { status: 403 }
      );
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
