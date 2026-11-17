import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimitKey } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { reservationExpired } from '@/lib/business-guard';

export async function GET(request: NextRequest) {
  try {
    // F-46: same per-IP throttle as the personal check-email route — this
    // was an unauthenticated, unthrottled .ezy-availability oracle.
    const allowed = await checkRateLimitKey(
      `check-email:${getClientIp(request)}`,
      Number(process.env.CHECK_EMAIL_RATE_LIMIT_MAX) || 30,
      15 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email query parameter is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Must end with .ezy
    if (!normalizedEmail.endsWith('.ezy')) {
      return NextResponse.json({ error: 'Business email must end with .ezy' }, { status: 400 });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Check in both email and businessEmail fields. F-16: a soft-deleted
    // business whose 30-day reservation window has passed no longer holds the
    // address — it reads as available (register performs the actual release).
    const existingByEmail = await db.user.findUnique({ where: { email: normalizedEmail } });
    const existingByBusinessEmail = await db.user.findUnique({ where: { businessEmail: normalizedEmail } });

    const emailTaken = existingByEmail && !reservationExpired(existingByEmail);
    const businessEmailTaken = existingByBusinessEmail && !reservationExpired(existingByBusinessEmail);

    const available = !emailTaken && !businessEmailTaken;

    return NextResponse.json({ available });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Check business email error:', message);
    return NextResponse.json({ error: 'Failed to check email availability' }, { status: 500 });
  }
}