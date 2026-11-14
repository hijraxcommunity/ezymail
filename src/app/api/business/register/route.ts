import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, hashPassword } from '@/lib/auth';
import {
  getEnforcedSystemSettings,
  isRegistrationOpen,
} from '@/lib/system-settings';
import {
  reservationExpired,
  releaseReservedBusinessEmail,
} from '@/lib/business-guard';
import {
  normalizePhoneE164,
  verifyPhoneVerificationToken,
  consumePhoneVerificationToken,
} from '@/lib/phone-verification';

export async function POST(request: NextRequest) {
  try {
    // F-10: honor the registration_open toggle for business accounts too —
    // an instance with registration closed must not accept new businesses.
    const systemSettings = await getEnforcedSystemSettings();
    if (!isRegistrationOpen(systemSettings)) {
      return NextResponse.json(
        { error: 'Registration is currently closed. Please try again later.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { businessName, firstName, lastName, businessEmail, phone, employeeCount, password } = body;

    // Validate required fields
    if (!businessName || !businessName.trim()) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
    }
    if (!firstName || !firstName.trim()) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }
    if (!lastName || !lastName.trim()) {
      return NextResponse.json({ error: 'Last name is required' }, { status: 400 });
    }
    if (!businessEmail || !businessEmail.trim()) {
      return NextResponse.json({ error: 'Business email is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Validate business email format (must end with .ezy)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = businessEmail.trim().toLowerCase();

    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    if (!normalizedEmail.endsWith('.ezy')) {
      return NextResponse.json({ error: 'Business email must end with .ezy' }, { status: 400 });
    }

    // Phone stays OPTIONAL for business accounts, but when a number is given
    // it must have been verified via /api/auth/verify-phone (WhatsApp OTP
    // through the existing OpenWA sender). The signed proof token must bind
    // to exactly the number submitted — frontend state is never trusted.
    const phoneCountryCode = typeof body.phoneCountryCode === 'string' ? body.phoneCountryCode.replace(/\D/g, '') : '';
    const phoneNumber = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    const phoneVerifyToken = typeof body.phoneVerifyToken === 'string' ? body.phoneVerifyToken.trim() : '';
    let normalizedPhone: string | null = null;
    if (phoneCountryCode || phoneNumber) {
      normalizedPhone = normalizePhoneE164(phoneCountryCode, phoneNumber);
      if (!normalizedPhone) {
        return NextResponse.json(
          { error: 'Please enter a valid WhatsApp number with its country code' },
          { status: 400 }
        );
      }
      if (!phoneVerifyToken) {
        return NextResponse.json(
          { error: 'Please verify your WhatsApp number before creating your account' },
          { status: 400 }
        );
      }
      if (!(await verifyPhoneVerificationToken(phoneVerifyToken, normalizedPhone))) {
        return NextResponse.json(
          { error: 'This number verification is invalid or expired. Please verify your WhatsApp number again' },
          { status: 400 }
        );
      }
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one lowercase letter' },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number' },
        { status: 400 }
      );
    }

    // Check businessEmail uniqueness (both email and businessEmail fields).
    // F-16: a soft-deleted business holds its address only during the 30-day
    // reservation window written by the trial-expiry cron — once that window
    // has passed, the address is released (the stale row's unique columns are
    // rewritten) and a NEW business can claim it. Before this fix the
    // uniqueness lookup matched soft-deleted rows forever, so reserved
    // addresses were silently unregistrable.
    const existingByEmail = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingByEmail) {
      if (!reservationExpired(existingByEmail)) {
        return NextResponse.json(
          { error: 'This business email is already taken' },
          { status: 409 }
        );
      }
      await releaseReservedBusinessEmail(normalizedEmail);
    }

    const existingByBusinessEmail = await db.user.findUnique({ where: { businessEmail: normalizedEmail } });
    if (existingByBusinessEmail) {
      if (!reservationExpired(existingByBusinessEmail)) {
        return NextResponse.json(
          { error: 'This business email is already taken' },
          { status: 409 }
        );
      }
      await releaseReservedBusinessEmail(normalizedEmail);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // One-time proof consumption BEFORE create: a verification token can
    // create exactly one account, even under concurrent replays.
    if (normalizedPhone && !consumePhoneVerificationToken(phoneVerifyToken)) {
      return NextResponse.json(
        { error: 'This verification was already used. Please verify your WhatsApp number again' },
        { status: 400 }
      );
    }

    // Calculate trial dates
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    // Create user with business account type
    let user;
    try {
      user = await db.user.create({
        data: {
          email: normalizedEmail,
          businessEmail: normalizedEmail,
          passwordHash,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: '1970-01-01', // Default for business accounts
          phone: normalizedPhone,
          accountType: 'business',
          businessName: businessName.trim(),
          employeeCount: employeeCount || null,
          subscriptionStatus: 'pending_verification',
          trialStart: now,
          trialEnd,
        },
      });
    } catch (err) {
      if (
        err && typeof err === 'object' && 'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        // Two registrations racing for a released address (or a phone
        // collision) — the DB-level unique constraints are the final word.
        return NextResponse.json(
          { error: 'This business email is already taken' },
          { status: 409 }
        );
      }
      throw err;
    }

    // Create session
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await createSession(
      { id: user.id, email: user.email, role: user.role },
      typeof ip === 'string' ? ip.split(',')[0]?.trim() || '' : ''
    );

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          businessEmail: user.businessEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          businessName: user.businessName,
          accountType: user.accountType,
          subscriptionStatus: user.subscriptionStatus,
          trialStart: user.trialStart,
          trialEnd: user.trialEnd,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Business registration error:', message);
    return NextResponse.json({ error: 'Failed to create business account' }, { status: 500 });
  }
}