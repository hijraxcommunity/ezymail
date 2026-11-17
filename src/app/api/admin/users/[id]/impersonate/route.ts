import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { getSession, getJwtSecret, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { SignJWT, jwtVerify } from 'jose';

// F-08: impersonation used to be a client-side illusion — the route minted a
// real victim JWT + Session row but only returned the token in the JSON body,
// which the UI ignored. Every subsequent request still carried the ADMIN's
// cookie, so the mail UI showed the victim's name while every API call
// executed as the admin, and a live 1h victim token was left dangling in the
// response.
//
// The fix makes it a REAL session swap:
// - POST sets the session cookie server-side to a short-lived (1h) victim
//   JWT carrying an `imp` claim (the admin's id) inside the signed payload.
//   The raw token is no longer returned in the body — nothing usable dangles.
// - DELETE ends the impersonation: the victim session row is destroyed and
//   the cookie is restored to the admin's still-alive original session, so
//   "exit" returns to the admin without a second login.
// - The `imp` claim lets password/2FA mutation routes refuse actions taken
//   under a victim identity.

const IMPERSONATION_TTL_SECONDS = 60 * 60; // 1 hour

function impersonationCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: IMPERSONATION_TTL_SECONDS,
    path: '/',
  };
}

// POST /api/admin/users/[id]/impersonate - Become the target user for 1 hour
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }
    if (session.imp) {
      return NextResponse.json(
        { success: false, error: 'Cannot impersonate while already impersonating another user' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check target user exists
    const targetUser = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatar: true,
        bio: true,
        signature: true,
        preferences: true,
        onboardingDone: true,
        createdAt: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (targetUser.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Cannot impersonate an inactive user' }, { status: 400 });
    }

    // Review fix (F-08 hardening): never impersonate another administrator.
    // An impersonation session carries the target's role, so an admin target
    // would mint an admin-privileged session that passes every admin-route
    // role check while the AdminLog rows attribute those actions to the
    // VICTIM admin — exactly the action-misattribution class F-08 fixed.
    // Impersonation exists to support regular users; admins are managed
    // through named, logged admin actions instead.
    if (targetUser.role === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot impersonate another administrator account' },
        { status: 403 }
      );
    }

    const ip = getClientIp(request);

    // Short-lived victim JWT, tagged with the impersonating admin (`imp`).
    const token = await new SignJWT({
      userId: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      imp: session.userId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      // Numeric input is an absolute UNIX-epoch timestamp in seconds (same
      // convention as the core session signer in lib/auth.ts).
      .setExpirationTime(Math.floor(Date.now() / 1000) + IMPERSONATION_TTL_SECONDS)
      .sign(getJwtSecret());

    // Session row binds the cookie to a revocable identity (F-07 contract).
    await db.session.create({
      data: {
        userId: targetUser.id,
        token,
        ipAddress: ip,
        deviceName: 'Admin Impersonation Session',
        deviceType: 'admin_impersonation',
        expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000),
      },
    });

    // THE actual impersonation: the cookie now authenticates as the victim.
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, impersonationCookieOptions());

    // Log the impersonation action
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'impersonate_user',
        targetType: 'user',
        targetId: id,
        details: JSON.stringify({
          targetEmail: targetUser.email,
          targetName: `${targetUser.firstName} ${targetUser.lastName}`,
          adminEmail: session.email,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          ...targetUser,
          displayName: targetUser.firstName,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin impersonate error:', message);
    return NextResponse.json({ success: false, error: 'Failed to impersonate user' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id]/impersonate - Exit impersonation, restore admin
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!session.imp) {
      return NextResponse.json(
        { success: false, error: 'This session is not an impersonation session' },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    // Kill the victim session row (the signed `imp` claim identifies the
    // admin to restore — the URL id is not trusted).
    if (currentToken) {
      await db.session.deleteMany({ where: { token: currentToken } });
    }

    // Restore the admin's original session if it is still alive.
    const adminSession = await db.session.findFirst({
      where: { userId: session.imp, isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { lastActive: 'desc' },
    });

    let restored = false;
    if (adminSession) {
      try {
        const { payload } = await jwtVerify(adminSession.token, getJwtSecret());
        if (payload.userId === session.imp) {
          const maxAge = Math.max(
            60,
            Math.min(
              60 * 60 * 24 * 30,
              Math.floor((adminSession.expiresAt.getTime() - Date.now()) / 1000)
            )
          );
          cookieStore.set(SESSION_COOKIE_NAME, adminSession.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge,
            path: '/',
          });
          restored = true;
        }
      } catch {
        // Admin token no longer verifiable — fall through to restored=false.
      }
    }

    if (!restored) {
      cookieStore.delete(SESSION_COOKIE_NAME);
    }

    await db.adminLog.create({
      data: {
        adminId: session.imp,
        action: 'impersonation_exit',
        targetType: 'user',
        targetId: session.userId,
        details: JSON.stringify({
          exitedEmail: session.email,
          restoredAdminSession: restored,
        }),
        ipAddress: getClientIp(request),
      },
    });

    return NextResponse.json({ success: true, restored });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin impersonation exit error:', message);
    return NextResponse.json({ success: false, error: 'Failed to exit impersonation' }, { status: 500 });
  }
}
