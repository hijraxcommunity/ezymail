import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user is a business account
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.accountType !== 'business') {
      return NextResponse.json({ error: 'Only business accounts can submit verification documents' }, { status: 403 });
    }

    const body = await request.json();
    const { documentUrls } = body;

    if (!documentUrls || !Array.isArray(documentUrls) || documentUrls.length === 0) {
      return NextResponse.json({ error: 'documentUrls must be a non-empty array of URLs' }, { status: 400 });
    }

    // Validate each URL
    const urlRegex = /^https?:\/\/.+/;
    for (const url of documentUrls) {
      if (typeof url !== 'string' || !urlRegex.test(url)) {
        return NextResponse.json({ error: 'Each document URL must be a valid HTTP(S) URL' }, { status: 400 });
      }
    }

    // Upsert verification record
    const verification = await db.businessVerification.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        documentUrls: JSON.stringify(documentUrls),
        status: 'pending',
      },
      update: {
        documentUrls: JSON.stringify(documentUrls),
        status: 'pending',
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        adminNotes: null,
      },
    });

    return NextResponse.json(
      {
        id: verification.id,
        status: verification.status,
        submittedAt: verification.submittedAt,
        message: 'Verification documents submitted successfully',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Submit verification error:', message);
    return NextResponse.json({ error: 'Failed to submit verification documents' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const verification = await db.businessVerification.findUnique({
      where: { userId: session.userId },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        adminNotes: true,
      },
    });

    if (!verification) {
      return NextResponse.json({ status: null, message: 'No verification submitted' });
    }

    return NextResponse.json({
      id: verification.id,
      status: verification.status,
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      adminNotes: verification.adminNotes,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get verification status error:', message);
    return NextResponse.json({ error: 'Failed to get verification status' }, { status: 500 });
  }
}