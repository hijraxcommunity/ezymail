import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
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
 * - Rotation is strictly best-effort: if the cookie cannot be rewritten in
 *   the current execution context, or the auxiliary DB session row cannot
 *   be updated, the current token simply remains valid until its own `exp`.
 *   The JWT itself is the only authentication authority; DB rows exist for
 *   the sessions list and admin statistics.
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

    cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

    // Keep the auxiliary DB session rows consistent with the active cookie.
    try {
      await db.session.deleteMany({ where: { token: currentToken } });
      await db.session.create({
        data: {
          userId: session.userId,
          token,
          ipAddress: '',
          expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        },
      });
    } catch {
      // DB rows are auxiliary — cookie rotation above is what matters.
    }
  } catch {
    // Renewal is best-effort: the current token stays valid until its exp.
  }
}

export async function createSession(user: { id: string; email: string; role: string }, ipAddress?: string) {
  const token = await signSessionToken({ userId: user.id, email: user.email, role: user.role });

  // Store session in database (non-blocking — cookie is set either way)
  try {
    await db.session.create({
      data: {
        userId: user.id,
        token,
        ipAddress: ipAddress || '',
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      },
    });
  } catch {
    // Ignore DB write failure — JWT cookie is the primary auth mechanism
  }

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
    await rotateSessionIfDue(cookieStore, token, session);
    return session;
  } catch {
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
  // Simple in-memory rate limiting
  const key = `rate_limit:${ip}`;
  const globalForRateLimit = globalThis as unknown as {
    rateLimits: Map<string, { count: number; resetTime: number }>;
  };

  if (!globalForRateLimit.rateLimits) {
    globalForRateLimit.rateLimits = new Map();
  }

  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  const record = globalForRateLimit.rateLimits.get(key);

  if (!record || now > record.resetTime) {
    globalForRateLimit.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (record.count >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxAttempts - record.count };
}
