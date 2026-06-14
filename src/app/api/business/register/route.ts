import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
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

    // Check businessEmail uniqueness (both email and businessEmail fields)
    const existingByEmail = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingByEmail) {
      return NextResponse.json(
        { error: 'This business email is already taken' },
        { status: 409 }
      );
    }

    const existingByBusinessEmail = await db.user.findUnique({ where: { businessEmail: normalizedEmail } });
    if (existingByBusinessEmail) {
      return NextResponse.json(
        { error: 'This business email is already taken' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Calculate trial dates
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    // Create user with business account type
    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        businessEmail: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: '1970-01-01', // Default for business accounts
        phone: phone ? phone.trim() : null,
        accountType: 'business',
        businessName: businessName.trim(),
        employeeCount: employeeCount || null,
        subscriptionStatus: 'pending_verification',
        trialStart: now,
        trialEnd,
      },
    });

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