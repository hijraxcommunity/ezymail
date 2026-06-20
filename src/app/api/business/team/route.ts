import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify business account
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user || user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    const teamMembers = await db.teamMember.findMany({
      where: { businessId: user.id },
      orderBy: { invitedAt: 'desc' },
      select: {
        id: true,
        memberEmail: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
      },
    });

    return NextResponse.json({ teamMembers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List team members error:', message);
    return NextResponse.json({ error: 'Failed to list team members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify business account
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user || user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    const memberRole = role || 'member';
    if (memberRole !== 'admin' && memberRole !== 'member') {
      return NextResponse.json({ error: 'Role must be "admin" or "member"' }, { status: 400 });
    }

    // Check if already a team member
    const existing = await db.teamMember.findUnique({
      where: {
        businessId_memberEmail: {
          businessId: user.id,
          memberEmail: normalizedEmail,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'This email is already a team member' }, { status: 409 });
    }

    const teamMember = await db.teamMember.create({
      data: {
        businessId: user.id,
        memberEmail: normalizedEmail,
        role: memberRole,
      },
    });

    return NextResponse.json(
      {
        teamMember: {
          id: teamMember.id,
          memberEmail: teamMember.memberEmail,
          role: teamMember.role,
          invitedAt: teamMember.invitedAt,
          acceptedAt: teamMember.acceptedAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Invite team member error:', message);
    return NextResponse.json({ error: 'Failed to invite team member' }, { status: 500 });
  }
}