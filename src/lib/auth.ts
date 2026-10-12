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
  exp: number;
}

export async function createSession(user: { id: string; email: string; role: string }, ipAddress?: string) {
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret());

  // Store session in database (non-blocking — cookie is set either way)
  try {
    await db.session.create({
      data: {
        userId: user.id,
        token,
        ipAddress: ipAddress || '',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  } catch {
    // Ignore DB write failure — JWT cookie is the primary auth mechanism
  }

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set('ezymail-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('ezymail-session')?.value;

  if (!token) return null;

  // Fails loudly (throw) when JWT_SECRET is unconfigured so misconfiguration
  // is visible in server logs — but only for requests that actually carry a
  // session cookie, keeping anonymous traffic on the normal unauthenticated path.
  const secret = getJwtSecret();

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ezymail-session')?.value;

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
