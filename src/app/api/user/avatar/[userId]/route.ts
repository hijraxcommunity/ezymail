import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/user/avatar/<userId> — public read of ONLY the avatar image.
//
// Why public (no session): the Android notification renderer
// (EzyMailNotification.fetchBitmap) and the web service worker fetch the
// sender avatar OUTSIDE any session, with no cookies and no auth headers.
// Gating this route by session would 404 every notification avatar and
// fall back to the letter avatar — the exact "only letter inside avatar"
// report. The response carries nothing but the stored 128x128 JPEG bytes
// (the same image the mail list already shows to any logged-in user).
//
// The DB stores the avatar as an inline Base64 data URL
// (POST /api/user/avatar). Returning it as real image bytes keeps the FCM
// payload a compact URL (see sendPushNotification.ts — inline Base64 is
// dropped by the 4096-byte guard) while the renderer still shows the real
// sender image.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    if (!userId || userId.length < 8 || userId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
      return new NextResponse(null, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    const match = user?.avatar?.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) {
      // No avatar stored → renderer falls back to the letter avatar.
      return new NextResponse(null, { status: 404 });
    }

    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': match[1].toLowerCase(),
        'Cache-Control': 'public, max-age=300',
        'Content-Length': String(bytes.length),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
