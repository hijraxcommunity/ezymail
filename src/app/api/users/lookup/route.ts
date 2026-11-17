import { NextRequest, NextResponse } from 'next/server';
import { getSession, checkRateLimitKey } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/users/lookup?email=xxx — Look up any registered user by email (returns name + avatar)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // F-46: directory-scrape throttle. The route stays session-gated and
    // deliberately answers contacts-style lookups, but an authenticated
    // script can no longer walk the whole user base unchecked.
    const allowed = await checkRateLimitKey(`user-lookup:${session.userId}`, Number(process.env.USER_LOOKUP_RATE_LIMIT_MAX) || 60, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const email = request.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { firstName: true, lastName: true, displayName: true, avatar: true },
    });

    if (!user) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        avatar: user.avatar || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('User lookup error:', message);
    return NextResponse.json({ error: 'Failed to lookup user' }, { status: 500 });
  }
}