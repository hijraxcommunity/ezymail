import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ezymail-super-secret-key-change-in-production-2024'
);

// Verification is only valid for 10 minutes after the number is confirmed
const RESET_TOKEN_TTL_SECONDS = 10 * 60;

// Simple in-memory rate limit for recovery attempts (per IP)
const globalForForgot = globalThis as unknown as {
  forgotPasswordLimits: Map<string, { count: number; resetTime: number }>;
};
if (!globalForForgot.forgotPasswordLimits) {
  globalForForgot.forgotPasswordLimits = new Map();
}
function checkForgotLimit(ip: string): boolean {
  const limits = globalForForgot.forgotPasswordLimits;
  const now = Date.now();
  const record = limits.get(ip);
  if (!record || now > record.resetTime) {
    limits.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (record.count >= 8) return false;
  record.count++;
  return true;
}

// Single-use enforcement: tokens already consumed cannot reset again.
// Entries live at most as long as the token TTL, then are dropped.
const globalForUsedTokens = globalThis as unknown as {
  usedResetTokens: Map<string, number>;
};
if (!globalForUsedTokens.usedResetTokens) {
  globalForUsedTokens.usedResetTokens = new Map();
}
function markTokenUsed(token: string): boolean {
  const used = globalForUsedTokens.usedResetTokens;
  const key = createHash('sha256').update(token).digest('hex');
  if (used.has(key)) return false;
  used.set(key, Date.now() + (RESET_TOKEN_TTL_SECONDS + 60) * 1000);
  // Lazy cleanup of expired entries
  if (used.size > 500) {
    const now = Date.now();
    for (const [k, exp] of used) if (exp < now) used.delete(k);
  }
  return true;
}

// Never reveal which detail was wrong — one generic message for every failure
const GENERIC_ERROR = 'We could not verify your details. Check your email and WhatsApp number and try again.';

// Compare two phone numbers tolerantly: digits only, with or without the
// country code / leading zero (e.g. +93 700 123 456 ≡ 93700123456 ≡ 0700123456)
function phoneMatches(registered: string, submitted: string): boolean {
  const a = registered.replace(/\D/g, '');
  const candidates = new Set<string>();
  const b = submitted.replace(/\D/g, '');
  candidates.add(b);
  if (b.startsWith('0')) candidates.add(b.replace(/^0+/, ''));
  for (const c of candidates) {
    if (!c) continue;
    if (c === a) return true;
    if (c.length >= 7 && (a.endsWith(c) || c.endsWith(a))) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    if (!checkForgotLimit(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });
    }

    const body = await request.json();
    const action = body?.action;

    // ── Step 1: verify the account's WhatsApp number ──
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

      // Short-lived, purpose-scoped token authorizing exactly one reset
      const resetToken = await new SignJWT({ purpose: 'password-reset', userId: user.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${RESET_TOKEN_TTL_SECONDS}s`)
        .sign(JWT_SECRET);

      const masked = user.phone.length > 6
        ? user.phone.slice(0, 3) + '****' + user.phone.slice(-3)
        : user.phone;

      return NextResponse.json({
        verified: true,
        resetToken,
        expiresIn: RESET_TOKEN_TTL_SECONDS,
        maskedPhone: masked,
      });
    }

    // ── Step 2: set the new password with the verified token ──
    if (action === 'reset') {
      const resetToken = typeof body.resetToken === 'string' ? body.resetToken : '';
      const password = typeof body.password === 'string' ? body.password : '';

      let userId: string;
      try {
        const { payload } = await jwtVerify(resetToken, JWT_SECRET);
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
      if (!markTokenUsed(resetToken)) {
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
