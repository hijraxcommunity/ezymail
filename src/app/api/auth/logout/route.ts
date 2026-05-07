import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Logout error:', message);
    return NextResponse.json({ error: 'Failed to log out' }, { status: 500 });
  }
}
