import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { db } from './db';

/**
 * Thrown when the deployment is missing JWT_SECRET. Authentication fails
 * closed: there is deliberately NO fallback secret, because a predictable
 * default would let anyone forge valid session tokens. The error message
 * never contains the secret value itself.
 */
export class JwtSecretMissingError extends Error {
  constructor() {
    super(
      'JWT_SECRET environment variable is not configured. Authentication is unavailable until a strong secret is set in the deployment environment.'
    );
    this.name = 'JwtSecretMissingError';
  }
}

/**
 * Resolves the JWT signing secret at call time (not at module load) so a
 * missing configuration surfaces as a clear runtime error in the routes that
 * actually need it, instead of silently falling back to a predictable key.
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new JwtSecretMissingError();
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp: number;
}

/**
 * Session lifetime policy (sliding sessions):
 *
 * - A session token is valid for SESSION_MAX_AGE_SECONDS (30 days) from
 *   issuance, enforced both by the JWT `exp` claim and the cookie `maxAge`.
 * - While the user keeps using the app, getSession() silently re-issues a
 *   fresh 30-day token once the current one is older than
 *   SESSION_RENEWAL_THRESHOLD_SECONDS (24h). Active users therefore never
 *   get logged out, while a session that sees no activity for 30 days
 *   expires for good.
 * - F-07: the JWT signature alone is NO LONGER the authentication
 *   authority. getSession() additionally requires the presented token to
 *   match a live, unexpired Session row belonging to a non-suspended user
 *   (F-11). Every revocation surface — logout, revoke-one, revoke-all,
 *   password change, forgot-password reset, admin password reset and admin
 *   suspension — deletes or invalidates those rows and therefore truly
 *   terminates access instead of leaving the cookie valid until `exp`.
 *   Tokens that predate this change carry no row and fail closed (one
 *   re-login per device after deploy).
 */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_RENEWAL_THRESHOLD_SECONDS = 60 * 60 * 24; // renew after 1 day of token age
const SESSION_COOKIE_NAME = 'ezymail-session';

async function signSessionToken(user: { userId: string; email: string; role: string }): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    // Per-session unique id: iat has 1-second resolution, so two logins of
    // the same user within the same second would otherwise mint IDENTICAL
    // token strings and collide on Session.token (@unique) — a pre-existing
    // flaw the old best-effort row write silently masked. The jti makes
    // every issued token distinct (and is the natural binding id for
    // future session-row lookups).
    .setJti(randomUUID())
    // jose interprets a numeric input as an absolute UNIX-epoch timestamp in
    // seconds (verified against the installed version), so the 30-day window
    // must be added to "now" explicitly.
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS)
    .sign(getJwtSecret());
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  };
}

/**
 * Re-issues the session token when the current one is past the renewal
 * threshold, sliding the 30-day window forward. Runs at most once per day
 * per session. Any failure leaves the current token untouched and valid.
 */
async function rotateSessionIfDue(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  currentToken: string,
  session: SessionPayload
): Promise<void> {
  try {
    if (typeof session.iat !== 'number') return;
    const ageSeconds = Math.floor(Date.now() / 1000) - session.iat;
    if (ageSeconds <= SESSION_RENEWAL_THRESHOLD_SECONDS) return;

    const token = await signSessionToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
    });

    // F-07: rows first, cookie last. If the DB write fails, the OLD token
    // (which still has its live row) remains in the cookie and the user
    // stays logged in — a rotated cookie must never exist without its row.
    await db.session.deleteMany({ where: { token: currentToken } });
    await db.session.create({
      data: {
        userId: session.userId,
        token,
        ipAddress: '',
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      },
    });

    cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  } catch {
    // Renewal is best-effort: the current token stays valid until its exp.
  }
}

export async function createSession(user: { id: string; email: string; role: string }, ipAddress?: string) {
  const token = await signSessionToken({ userId: user.id, email: user.email, role: user.role });

  // F-07: the Session row is REQUIRED, not best-effort. getSession() binds
  // every presented cookie to a live row, so a cookie must never be issued
  // without one. A DB outage at login therefore fails the login (500) —
  // fail-closed instead of issuing a cookie that dies on the next request.
  await db.session.create({
    data: {
      userId: user.id,
      token,
      ipAddress: ipAddress || '',
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  // Fails loudly (throw) when JWT_SECRET is unconfigured so misconfiguration
  // is visible in server logs — but only for requests that actually carry a
  // session cookie, keeping anonymous traffic on the normal unauthenticated path.
  const secret = getJwtSecret();

  try {
    const { payload } = await jwtVerify(token, secret);
    const session = payload as unknown as SessionPayload;

    // F-07/F-11: signature alone proves nothing about revocation. The token
    // must still map to a live, unexpired Session row of a non-suspended
    // user. This turns logout, revoke-one, revoke-all, password change,
    // forgot-password reset, admin reset and suspension (all of which
    // delete rows) into REAL termination of access. One indexed lookup
    // (Session.token is @unique) per authenticated request.
    const row = await db.session.findFirst({
      where: {
        token,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: { user: { select: { status: true } } },
    });
    if (!row) return null;
    if (row.user.status === 'suspended') return null;

    await rotateSessionIfDue(cookieStore, token, session);
    return session;
  } catch {
    // Invalid/expired token, missing Session row, or a DB hiccup — all
    // fail closed (unauthenticated).
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    try {
      await db.session.deleteMany({ where: { token } });
    } catch {
      // Ignore DB write failure
    }
  }

  cookieStore.delete('ezymail-session');
}

/**
 * F-07: revoke every OTHER session of a user while keeping the caller's
 * current device logged in. Used by the password-change flow so a stolen
 * cookie on another device dies immediately ("all other devices sign out").
 */
export async function revokeOtherSessions(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  try {
    await db.session.deleteMany({
      where: currentToken
        ? { userId, token: { not: currentToken } }
        : { userId },
    });
  } catch {
    // The password change itself already succeeded; revocation is retried
    // on the next password change. Logged for ops visibility.
    console.error('revokeOtherSessions failed for user', userId);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}

export function generateEmailFromName(firstName: string, lastName: string): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
  return `${cleanFirst}.${cleanLast}@ezy.af`;
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  // Default 5 attempts / 15 min per IP. Env-overridable so load tests and
  // E2E harnesses (which all share one egress IP) are not throttled.
  const maxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5;
  const result = await checkRateLimitKey(`rate_limit:${ip}`, maxAttempts, 15 * 60 * 1000);
  return { allowed: result, remaining: result ? maxAttempts - 1 : 0 };
}

/**
 * F-32: generic fixed-window in-memory rate limiter (shared Map with the
 * login limiter). Residual limitation, documented in the audit: the window
 * state lives per server instance and resets on cold start, and callers
 * derive the key from client-controlled headers where noted. A
 * Redis/Upstash shared store or platform WAF is the complete fix and is
 * tracked separately — these per-route limits still stop single-instance
 * flooding and expensive-path abuse (bcrypt registrations, base64 uploads,
 * send spam).
 */
export async function checkRateLimitKey(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<boolean> {
  const globalForRateLimit = globalThis as unknown as {
    rateLimits: Map<string, { count: number; resetTime: number }>;
  };

  if (!globalForRateLimit.rateLimits) {
    globalForRateLimit.rateLimits = new Map();
  }

  const now = Date.now();
  const record = globalForRateLimit.rateLimits.get(key);

  if (!record || now > record.resetTime) {
    globalForRateLimit.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxAttempts) {
    return false;
  }

  record.count++;
  return true;
}
