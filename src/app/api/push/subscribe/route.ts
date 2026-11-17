import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, checkRateLimitKey } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // F-46: the subscribe path mutates server state per call; throttle it
    // per session like the other expensive/authenticated paths.
    const allowed = await checkRateLimitKey(`push-subscribe:${session.userId}`, Number(process.env.PUSH_SUBSCRIBE_RATE_LIMIT_MAX) || 20, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json()
    const { fcmToken, deviceInfo, platform } = body

    if (!fcmToken || typeof fcmToken !== 'string') {
      return NextResponse.json({ error: 'FCM token is required' }, { status: 400 })
    }

    // F-51: the upsert used to be keyed on the token alone and its update
    // branch reassigned userId, so anyone who LEARNED another user's token
    // could silently steal (rebind) that subscription and the victim simply
    // stopped receiving pushes. Ownership is now explicit: a token already
    // bound to a different user is rejected instead of rebound.
    const existing = await db.pushSubscription.findUnique({ where: { fcmToken } });
    if (existing && existing.userId !== session.userId) {
      return NextResponse.json(
        { error: 'This device token is registered to another account.' },
        { status: 409 }
      );
    }

    if (existing) {
      // Same owner re-subscribing: refresh device metadata only.
      await db.pushSubscription.update({
        where: { fcmToken },
        data: {
          deviceInfo: deviceInfo || null,
          platform: platform || null,
        },
      });
    } else {
      await db.pushSubscription.create({
        data: {
          userId: session.userId,
          fcmToken,
          deviceInfo: deviceInfo || null,
          platform: platform || null,
        },
      });
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Push subscribe error:', message)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}
