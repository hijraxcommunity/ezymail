import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomInt } from 'crypto';
import { db } from '@/lib/db';
import { hashPassword, getJwtSecret } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { sendWhatsAppOTP, OpenWAError } from '@/lib/whatsapp/openwa';
import {
  storeOtpChallenge,
  clearOtpChallenge,
  checkOtpChallenge,
  checkRateLimitWindow,
  consumeSingleUseToken,
} from '@/lib/server-state';


// Verification is only valid for 10 minutes after the number is confirmed
const RESET_TOKEN_TTL_SECONDS = 10 * 60;

// The WhatsApp OTP code lives exactly as long as the reset token would: 10 minutes
const OTP_TTL_SECONDS = 10 * 60;
// Brute-force protection: after this many wrong codes a pending OTP is dropped
const OTP_MAX_ATTEMPTS = 5;

// Recovery attempt cap per IP (D4, Batch 9): was a per-instance Map, now the
// shared fixed-window store — the cap survives cold starts and is enforced
// across all serverless instances. Env-overridable per the convention every
// other limiter in this codebase follows, so load tests and E2E harnesses
// (which share one egress IP) can raise it without code changes.
const RECOVERY_MAX_PER_WINDOW = Number(process.env.RECOVERY_RATE_LIMIT_MAX) || 8;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
async function checkForgotLimit(ip: string): Promise<boolean> {
  return checkRateLimitWindow(`forgot:${ip}`, RECOVERY_MAX_PER_WINDOW, RECOVERY_WINDOW_MS);
}

// Single-use enforcement: tokens already consumed cannot reset again
// (D4, Batch 9): the guard is now a unique row in the shared store — first
// consume wins under any concurrency, closing the old best-effort
// per-instance Map. Entries live at most as long as the token TTL (+margin).
async function markTokenUsed(token: string): Promise<boolean> {
  return consumeSingleUseToken(token, RESET_TOKEN_TTL_SECONDS);
}

// Never reveal which detail was wrong — one generic message for every failure
const GENERIC_ERROR = 'We could not verify your details. Check your email and WhatsApp number and try again.';

const OTP_SEND_FAILURE = 'Unable to send the verification code. Please try again later.';

// Pending password-recovery OTPs keyed by user id (D4, Batch 9): stored in
// the shared PostgreSQL server-state store — TTL-bounded, only the sha256
// hash of the code is kept, never the code itself, and the consume/attempt
// counters are atomic across instances. The salt keeps the hash bound to
// this user id exactly as before.
function recoveryOtpHash(userId: string, otp: string): string {
  return createHash('sha256').update(`${otp}:${userId}`).digest('hex');
}
function storeOtp(userId: string, otp: string): Promise<void> {
  // A new request replaces any previous code for the same account (the
  // composite-unique upsert inside the store).
  return storeOtpChallenge('password-recovery', userId, recoveryOtpHash(userId, otp), OTP_TTL_SECONDS);
}
function clearOtp(userId: string): Promise<void> {
  return clearOtpChallenge('password-recovery', userId);
}
type OtpCheckResult = 'ok' | 'missing' | 'expired' | 'locked' | 'invalid';
function checkOtp(userId: string, otp: string): Promise<OtpCheckResult> {
  return checkOtpChallenge('password-recovery', userId, recoveryOtpHash(userId, otp), OTP_MAX_ATTEMPTS);
}

// Compare two phone numbers tolerantly: digits only, with or without the
// country code / leading zero (e.g. +93 700 123 456 ≡ 93700123456 ≡ 0700123456).
// BOTH sides are normalized so a Settings-saved local number (0700…) also
// matches when the same number is typed with its country code (93700…).
function phoneMatches(registered: string, submitted: string): boolean {
  const variants = (raw: string): Set<string> => {
    const digits = raw.replace(/\D/g, '');
    const set = new Set<string>([digits]);
    if (digits.startsWith('0')) set.add(digits.replace(/^0+/, ''));
    return set;
  };
  const saved = variants(registered);
  const typed = variants(submitted);
  for (const x of typed) {
    if (!x) continue;
    for (const y of saved) {
      if (!y) continue;
      if (x === y) return true;
      if (x.length >= 7 && (y.endsWith(x) || x.endsWith(y))) return true;
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkForgotLimit(ip))) {
      return NextResponse.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
    }

    const body = await request.json();
    const action = body?.action;

    // ── Step 1: verify the account's WhatsApp number, then send an OTP ──
    if (action === 'verify') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const phone = typeof body.phone === 'string' ? body.phone : '';

      if (!email || !phone.replace(/\D/g, '')) {
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
      }

      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.phone || !phoneMatches(user.phone, phone)) {
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
      }

      const masked = user.phone.length > 6
        ? user.phone.slice(0, 3) + '****' + user.phone.slice(-3)
        : user.phone;

      // Generate a 6-digit code, store only its hash, deliver it via OpenWA
      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await storeOtp(user.id, otp);
      try {
        await sendWhatsAppOTP(user.phone, otp);
      } catch (error: unknown) {
        // Nothing verifiable exists for the user until a code is delivered
        await clearOtp(user.id);
        // Log the failure class only — never the OTP, the API key or internals
        console.error(
          'WhatsApp OTP delivery failed:',
          error instanceof Error ? error.message : 'unknown error'
        );
        // Coarse failure class (UNREACHABLE / AUTH / SESSION_NOT_FOUND / …) —
        // lets the owner diagnose instantly from the network tab without
        // leaking the key, the OTP or the gateway's raw error text.
        const reason = error instanceof OpenWAError ? error.reason : 'SEND_REJECTED';
        return NextResponse.json({ error: OTP_SEND_FAILURE, reason }, { status: 503 });
      }

      return NextResponse.json({
        otpSent: true,
        maskedPhone: masked,
        expiresIn: OTP_TTL_SECONDS,
      });
    }

    // ── Step 2: verify the 6-digit code received on WhatsApp ──
    if (action === 'verify-otp') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const otp = typeof body.otp === 'string' ? body.otp.replace(/\D/g, '') : '';

      if (!email || otp.length !== 6) {
        return NextResponse.json({ error: 'Enter the 6-digit code from your WhatsApp message.' }, { status: 400 });
      }

      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) {
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
      }

      const result = await checkOtp(user.id, otp);
      if (result === 'expired' || result === 'missing') {
        return NextResponse.json({ error: 'This code has expired. Please request a new one.' }, { status: 400 });
      }
      if (result === 'locked') {
        return NextResponse.json({ error: 'Too many incorrect attempts. Please request a new code.' }, { status: 429 });
      }
      if (result === 'invalid') {
        return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
      }

      // Exact same short-lived, purpose-scoped, single-use token as before —
      // the only difference is that it is now issued AFTER the code check.
      const resetToken = await new SignJWT({ purpose: 'password-reset', userId: user.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${RESET_TOKEN_TTL_SECONDS}s`)
        .sign(getJwtSecret());

      return NextResponse.json({
        verified: true,
        resetToken,
        expiresIn: RESET_TOKEN_TTL_SECONDS,
      });
    }

    // ── Step 3: set the new password with the verified token ──
    if (action === 'reset') {
      const resetToken = typeof body.resetToken === 'string' ? body.resetToken : '';
      const password = typeof body.password === 'string' ? body.password : '';

      let userId: string;
      // Resolve the secret outside the inner try: a missing JWT_SECRET is a
      // server misconfiguration and must surface as a 500 (caught by the outer
      // handler), not as the user-facing "verification expired" message.
      const secret = getJwtSecret();
      try {
        const { payload } = await jwtVerify(resetToken, secret);
        if (payload.purpose !== 'password-reset' || typeof payload.userId !== 'string') {
          return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
        }
        userId = payload.userId;
      } catch {
        return NextResponse.json({ error: 'Verification expired. Please verify your WhatsApp number again.' }, { status: 400 });
      }

      // Same strength rules as registration
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return NextResponse.json({
          error: 'Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number',
        }, { status: 400 });
      }

      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
      }

      // Enforce single use BEFORE applying the new password
      if (!(await markTokenUsed(resetToken))) {
        return NextResponse.json({ error: 'This verification was already used. Please verify your WhatsApp number again.' }, { status: 400 });
      }

      const passwordHash = await hashPassword(password);
      await db.user.update({ where: { id: user.id }, data: { passwordHash } });

      // A reset invalidates every existing session (all devices sign in again)
      try {
        await db.session.deleteMany({ where: { userId: user.id } });
      } catch {
        // Session cleanup is best-effort
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Forgot password error:', message);
    return NextResponse.json({ error: 'Failed to process your request' }, { status: 500 });
  }
}
