import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    return NextResponse.json({
      available: !user,
      email: normalizedEmail,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Check email error:', message);
    return NextResponse.json({ error: 'Failed to check email availability' }, { status: 500 });
  }
}
