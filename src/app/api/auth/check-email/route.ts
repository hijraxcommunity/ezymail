import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimitKey } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';

export async function GET(request: NextRequest) {
  try {
    // F-46: this used to be an unauthenticated, unthrottled account-
    // existence oracle (registered-vs-available for ANY address). The
    // register form legitimately needs it, so the fix is a per-IP throttle,
    // not removal — enumeration scripts now hit the wall after 30 probes
    // per 15 minutes.
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
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    return NextResponse.json({
      available: !user,
      email: normalizedEmail,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Check email error:', message);
    return NextResponse.json({ error: 'Failed to check email availability' }, { status: 500 });
  }
}
