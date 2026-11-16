import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, verifyPassword, checkRateLimit, writeLoginLog } from '@/lib/auth';
import { verifyTOTPSingleUse } from '@/lib/totp';
import {
  getEnforcedSystemSettings,
  isMaintenanceMode,
  maintenanceMessage,
} from '@/lib/system-settings';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate fields
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Rate limiting
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rateLimitResult = await checkRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Find user
    const userAgent = request.headers.get('user-agent');
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      // F-09: LoginLog.userId is a required FK — attempts against unknown
      // addresses cannot be recorded (no migration in this batch).
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // F-14/F-16: soft-deleted accounts (business self-service deletion or the
    // trial-expiry cron) are terminated — login is refused outright.
    if (user.softDeletedAt) {
      await writeLoginLog({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false });
      return NextResponse.json({ error: 'This account has been deleted' }, { status: 403 });
    }

    // F-10: maintenance_mode now gates non-admin logins (admins retain
    // access to fix/monitor). Checked after the account exists so the
    // rejection is logged against the account.
    const systemSettings = await getEnforcedSystemSettings();
    if (user.role !== 'admin' && isMaintenanceMode(systemSettings)) {
      await writeLoginLog({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false });
      return NextResponse.json({ error: maintenanceMessage(systemSettings) }, { status: 503 });
    }

    // Check user status
    if (user.status === 'suspended') {
      await writeLoginLog({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false });
      return NextResponse.json({ error: 'Your account has been suspended' }, { status: 403 });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await writeLoginLog({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // F-06: two-factor authentication is now ENFORCED at login when the user
    // activated it (Settings > Security). Accepts a 6-digit TOTP or a
    // single-use backup code. Brute force is bounded by the login rate
    // limiter above (every POST consumes one attempt, including 2FA guesses).
    const twoFactor = await db.twoFactor.findFirst({ where: { userId: user.id } });
    if (twoFactor?.isEnabled) {
      const code = typeof body.twoFactorCode === 'string' ? body.twoFactorCode.trim() : '';
      if (!code) {
        return NextResponse.json(
          { error: 'Enter your two-factor authentication code.', code: 'TWO_FACTOR_REQUIRED' },
          { status: 401 }
        );
      }

      // F-48: single-use verification — the same TOTP code cannot be
      // replayed within its ±1 time-step window after a successful login.
      let twoFactorOk = verifyTOTPSingleUse(user.id, twoFactor.secret, code);
      if (!twoFactorOk) {
        // Backup codes are stored as a JSON array of codes; a used code is
        // consumed so it can never log in twice.
        let backupCodes: string[] = [];
        try {
          const parsed: unknown = JSON.parse(twoFactor.backupCodes || '[]');
          if (Array.isArray(parsed)) {
            backupCodes = parsed.filter((c): c is string => typeof c === 'string');
          }
        } catch {
          // Malformed list — treat as empty.
        }
        const idx = backupCodes.indexOf(code);
        if (idx >= 0) {
          twoFactorOk = true;
          const remaining = backupCodes.filter((_, i) => i !== idx);
          await db.twoFactor.update({
            where: { id: twoFactor.id },
            data: { backupCodes: JSON.stringify(remaining) },
          });
        }
      }

      if (!twoFactorOk) {
        await writeLoginLog({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false });
        return NextResponse.json(
          { error: 'Invalid two-factor authentication code.', code: 'TWO_FACTOR_INVALID' },
          { status: 401 }
        );
      }
    }

    // Update last login and IP (non-blocking — don't fail login if DB is readonly)
    try {
      await db.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          lastIp: ip,
        },
      });
    } catch {
      // Ignore — last login update is not critical
    }

    // Create session
    await createSession({ id: user.id, email: user.email, role: user.role }, ip);

    // F-09: successful attempt is recorded too — the login-history and admin
    // Logs surfaces need both sides of the story.
    await writeLoginLog({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: true });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        onboardingDone: user.onboardingDone,
        accountType: user.accountType,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Login error:', message);
    return NextResponse.json({ error: 'Failed to log in' }, { status: 500 });
  }
}
