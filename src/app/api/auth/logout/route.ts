import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Delete THIS device's push token row BEFORE the session is destroyed.
    //
    // The old cleanup ran from the client AFTER the logout request — by then
    // the session cookie was gone, /api/push/unsubscribe answered 401 and the
    // token row SURVIVED under the account that had just logged out. A device
    // that switched accounts kept ringing for the previous account's mail
    // (owner report 2026-11-05: "the notification come back to A" when A sent
    // to B — A's phone still owned B's token row from an earlier login).
    //
    // Matched by token ALONE (not userId): the stale row can carry a userId
    // from any previous account on this device. Only impact of abuse is
    // stopping pushes for one device until it re-registers — FCM tokens are
    // opaque 140+ char secrets and this is the standard sign-out pattern.
    try {
      const body = await request.json();
      const fcmToken = body?.fcmToken;
      if (typeof fcmToken === 'string' && fcmToken.length >= 32) {
        await db.pushSubscription.deleteMany({
          where: { fcmToken },
        });
      }
    } catch {
      // No/invalid body — plain logout, token cleanup skipped.
    }

    await destroySession();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Logout error:', message);
    return NextResponse.json({ error: 'Failed to log out' }, { status: 500 });
  }
}
