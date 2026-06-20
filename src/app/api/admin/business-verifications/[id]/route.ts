import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// PUT /api/admin/business-verifications/[id] - Approve or reject verification
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, adminNotes } = body;

    const validActions = ['approve', 'reject'];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Find the verification record
    const verification = await db.businessVerification.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            businessName: true,
            subscriptionStatus: true,
          },
        },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    if (verification.status !== 'pending') {
      return NextResponse.json(
        { error: `Verification already ${verification.status}. Cannot ${action}.` },
        { status: 400 }
      );
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const now = new Date();

    if (action === 'approve') {
      // Approve verification: set status and start user trial
      await db.$transaction([
        db.businessVerification.update({
          where: { id },
          data: {
            status: 'approved',
            adminNotes: adminNotes || null,
            reviewedAt: now,
            reviewedBy: session.userId,
          },
        }),
        db.user.update({
          where: { id: verification.userId },
          data: {
            subscriptionStatus: 'trial',
            trialStart: now,
            trialEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
          },
        }),
      ]);

      // Log admin action
      await db.adminLog.create({
        data: {
          adminId: session.userId,
          action: 'approve_business_verification',
          targetType: 'business_verification',
          targetId: id,
          details: JSON.stringify({
            verificationId: id,
            userId: verification.userId,
            userEmail: verification.user.email,
            businessName: verification.user.businessName,
            adminNotes: adminNotes || null,
          }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Business verification approved. Trial period started.',
      });
    }

    // Reject verification: set status so user can re-upload
    await db.businessVerification.update({
      where: { id },
      data: {
        status: 'rejected',
        adminNotes: adminNotes || null,
        reviewedAt: now,
        reviewedBy: session.userId,
      },
    });

    // Log admin action
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        action: 'reject_business_verification',
        targetType: 'business_verification',
        targetId: id,
        details: JSON.stringify({
          verificationId: id,
          userId: verification.userId,
          userEmail: verification.user.email,
          businessName: verification.user.businessName,
          adminNotes: adminNotes || null,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Business verification rejected. User can re-upload documents.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin review business verification error:', message);
    return NextResponse.json({ error: 'Failed to review business verification' }, { status: 500 });
  }
}