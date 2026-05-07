import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST /api/user/onboarding - Mark onboarding as complete
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await db.user.update({
      where: { id: session.userId },
      data: { onboardingDone: true },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Onboarding error:', message);
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
  }
}
