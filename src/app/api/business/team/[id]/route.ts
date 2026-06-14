import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const teamMember = await db.teamMember.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!teamMember || teamMember.businessId !== user.id) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const body = await request.json();
    const { role } = body;

    if (!role || (role !== 'admin' && role !== 'member')) {
      return NextResponse.json({ error: 'Role must be "admin" or "member"' }, { status: 400 });
    }

    const updated = await db.teamMember.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        memberEmail: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
      },
    });

    return NextResponse.json({ teamMember: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update team member error:', message);
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const teamMember = await db.teamMember.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!teamMember || teamMember.businessId !== user.id) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    await db.teamMember.delete({ where: { id } });

    return NextResponse.json({ message: 'Team member removed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete team member error:', message);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}