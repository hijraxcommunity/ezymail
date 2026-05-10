import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, dateOfBirth, password, email } = body;

    // Validate fields
    if (!firstName || !firstName.trim()) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }
    if (!lastName || !lastName.trim()) {
      return NextResponse.json({ error: 'Last name is required' }, { status: 400 });
    }
    if (!dateOfBirth) {
      return NextResponse.json({ error: 'Date of birth is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Must be an @ezy.af address
    if (!email.trim().toLowerCase().endsWith('@ezy.af')) {
      return NextResponse.json({ error: 'Email must end with @ezy.af' }, { status: 400 });
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

    // Validate age (must be 13+)
    const dob = new Date(dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 13) {
      return NextResponse.json(
        { error: 'You must be at least 13 years old to register' },
        { status: 400 }
      );
    }

    // Use email directly from user input
    const userEmail = email.trim().toLowerCase();

    // Check if email exists
    const existingUser = await db.user.findUnique({ where: { email: userEmail } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already taken. Please choose a different one.' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await db.user.create({
      data: {
        email: userEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth,
      },
    });

    // Create session
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await createSession(
      { id: user.id, email: user.email, role: user.role },
      typeof ip === 'string' ? ip.split(',')[0]?.trim() || '' : ''
    );

    // Send welcome email
    try {
      // Check if welcome system user exists
      let welcomeUser = await db.user.findUnique({
        where: { email: 'welcome@ezy.af' },
      });

      if (!welcomeUser) {
        welcomeUser = await db.user.create({
          data: {
            email: 'welcome@ezy.af',
            passwordHash: await hashPassword('system-welcome-' + Date.now()),
            firstName: 'EzyMail',
            lastName: 'Team',
            dateOfBirth: '2000-01-01',
            role: 'system',
          },
        });
      }

      await db.email.create({
        data: {
          senderId: welcomeUser.id,
          recipientEmail: user.email,
          subject: 'Welcome to EzyMail! 🎉',
          body: `Hi ${user.firstName},\n\nWelcome to EzyMail — your new home for fast, simple, and secure email.\n\nHere are a few things to get you started:\n\n• 📧 Send your first email to a friend\n• ⭐ Star important messages to find them quickly\n• 📁 Create custom folders to stay organized\n\nIf you have any questions, feel free to reach out. We're here to help!\n\nHappy emailing!\nThe EzyMail Team`,
          bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0;">Welcome to EzyMail! 🎉</h1>
  </div>
  <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; color: #374151;">Hi ${user.firstName},</p>
    <p style="font-size: 16px; color: #374151;">Welcome to EzyMail — your new home for fast, simple, and secure email.</p>
    <h3 style="color: #1f2937;">Here are a few things to get you started:</h3>
    <ul style="color: #374151; line-height: 2;">
      <li>📧 Send your first email to a friend</li>
      <li>⭐ Star important messages to find them quickly</li>
      <li>📁 Create custom folders to stay organized</li>
    </ul>
    <p style="font-size: 16px; color: #374151;">If you have any questions, feel free to reach out. We're here to help!</p>
    <p style="font-size: 16px; color: #374151;">Happy emailing!<br><strong>The EzyMail Team</strong></p>
  </div>
</div>`,
          folder: 'inbox',
        },
      });
    } catch {
      // Welcome email creation is not critical, log but don't fail
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          role: user.role,
          status: user.status,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Registration error:', message);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
