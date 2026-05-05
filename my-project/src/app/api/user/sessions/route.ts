import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * Parse User-Agent string to extract device info
 */
function parseUserAgent(ua: string | null): { deviceName: string; deviceType: string } {
  if (!ua) return { deviceName: 'Unknown', deviceType: 'unknown' };

  let deviceType = 'unknown';
  let deviceName = 'Unknown Device';

  // Detect device type
  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) {
    deviceType = 'mobile';
  } else if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) {
    deviceType = 'tablet';
  } else if (/Desktop|Windows|Macintosh|Linux|X11/.test(ua)) {
    deviceType = 'desktop';
  }

  // Detect OS
  if (/Windows NT 10/.test(ua)) {
    deviceName = 'Windows 10/11';
  } else if (/Windows NT 6\.3/.test(ua)) {
    deviceName = 'Windows 8.1';
  } else if (/Windows NT 6\.1/.test(ua)) {
    deviceName = 'Windows 7';
  } else if (/Windows/.test(ua)) {
    deviceName = 'Windows';
  } else if (/Mac OS X/.test(ua)) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    deviceName = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/iPhone OS ([\d_]+)/.test(ua)) {
    const match = ua.match(/iPhone OS ([\d_]+)/);
    deviceName = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/Android ([\d.]+)/.test(ua)) {
    const match = ua.match(/Android ([\d.]+)/);
    deviceName = match ? `Android ${match[1]}` : 'Android';
  } else if (/Linux/.test(ua)) {
    deviceName = 'Linux';
  }

  // Detect browser
  if (/Edg\//.test(ua)) {
    deviceName += ' (Edge)';
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    deviceName += ' (Chrome)';
  } else if (/Firefox\//.test(ua)) {
    deviceName += ' (Firefox)';
  } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
    deviceName += ' (Safari)';
  }

  return { deviceName, deviceType };
}

// GET /api/user/sessions - List all active sessions
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Get the current token from the cookie
    const token = request.cookies.get('ezymail-session')?.value || '';

    // Find all active sessions for the user
    const sessions = await db.session.findMany({
      where: {
        userId: session.userId,
        isActive: true,
      },
      orderBy: { lastActive: 'desc' },
    });

    const formattedSessions = sessions.map((s) => {
      const parsed = parseUserAgent(s.userAgent);
      return {
        id: s.id,
        deviceName: s.deviceName || parsed.deviceName,
        deviceType: s.deviceType || parsed.deviceType,
        ipAddress: s.ipAddress,
        location: s.location || null,
        lastActive: s.lastActive.toISOString(),
        isCurrent: s.token === token,
      };
    });

    return NextResponse.json({ success: true, data: { sessions: formattedSessions } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List sessions error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// DELETE /api/user/sessions - Revoke sessions
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const currentToken = request.cookies.get('ezymail-session')?.value || '';

    if (body.all) {
      // Revoke all sessions except current
      const result = await db.session.deleteMany({
        where: {
          userId: session.userId,
          isActive: true,
          token: { not: currentToken },
        },
      });

      return NextResponse.json({
        success: true,
        data: { revoked: result.count },
      });
    }

    if (body.sessionId) {
      // Revoke a specific session (but not the current one)
      const targetSession = await db.session.findUnique({
        where: { id: body.sessionId },
      });

      if (!targetSession || targetSession.userId !== session.userId) {
        return NextResponse.json(
          { success: false, error: 'Session not found' },
          { status: 404 }
        );
      }

      // Prevent revoking current session
      if (targetSession.token === currentToken) {
        return NextResponse.json(
          { success: false, error: 'Cannot revoke current session' },
          { status: 400 }
        );
      }

      await db.session.delete({ where: { id: body.sessionId } });

      return NextResponse.json({ success: true, data: { revoked: 1 } });
    }

    return NextResponse.json(
      { success: false, error: 'Provide either { all: true } or { sessionId: string }' },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Revoke sessions error:', message);
    return NextResponse.json({ success: false, error: 'Failed to revoke sessions' }, { status: 500 });
  }
}
