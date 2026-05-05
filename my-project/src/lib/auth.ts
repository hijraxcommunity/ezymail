import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ezymail-super-secret-key-change-in-production-2024'
);

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
    .sign(JWT_SECRET);

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

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
