import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email query parameter is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Must end with .ezy
    if (!normalizedEmail.endsWith('.ezy')) {
      return NextResponse.json({ error: 'Business email must end with .ezy' }, { status: 400 });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Check in both email and businessEmail fields
    const existingByEmail = await db.user.findUnique({ where: { email: normalizedEmail } });
    const existingByBusinessEmail = await db.user.findUnique({ where: { businessEmail: normalizedEmail } });

    const available = !existingByEmail && !existingByBusinessEmail;

    return NextResponse.json({ available });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Check business email error:', message);
    return NextResponse.json({ error: 'Failed to check email availability' }, { status: 500 });
  }
}