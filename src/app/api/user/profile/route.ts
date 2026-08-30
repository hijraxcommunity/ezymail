import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/user/profile - Get current user profile
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        bio: true,
        phone: true,
        dateOfBirth: true,
        recoveryEmail: true,
        role: true,
        status: true,
        signature: true,
        preferences: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get email counts
    const [inboxCount, sentCount, unreadCount] = await Promise.all([
      db.email.count({
        where: { recipientEmail: session.email, folder: 'inbox' },
      }),
      db.email.count({
        where: { senderId: session.userId, folder: 'sent' },
      }),
      db.email.count({
        where: { recipientEmail: session.email, folder: 'inbox', isRead: false },
      }),
    ]);

    return NextResponse.json({
      user,
      stats: {
        inboxCount,
        sentCount,
        unreadCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get profile error:', message);
    return NextResponse.json({ error: 'Failed to get profile' }, { status: 500 });
  }
}

// PUT /api/user/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      firstName,
      lastName,
      displayName,
      avatar,
      bio,
      phone,
      dateOfBirth,
      signature,
      preferences,
    } = body;

    const updateData: Record<string, string> = {};
    if (firstName !== undefined) {
      if (!firstName.trim()) {
        return NextResponse.json({ error: 'First name cannot be empty' }, { status: 400 });
      }
      updateData.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (!lastName.trim()) {
        return NextResponse.json({ error: 'Last name cannot be empty' }, { status: 400 });
      }
      updateData.lastName = lastName.trim();
    }
    if (displayName !== undefined) {
      updateData.displayName = displayName ? displayName.trim() : null;
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }
    if (bio !== undefined) {
      updateData.bio = bio.slice(0, 60);
    }
    if (phone !== undefined) {
      updateData.phone = phone;
    }
    if (dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth;
    }
    if (signature !== undefined) {
      updateData.signature = signature;
    }
    if (preferences !== undefined) {
      updateData.preferences = typeof preferences === 'string' ? preferences : JSON.stringify(preferences);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id: session.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        bio: true,
        phone: true,
        dateOfBirth: true,
        recoveryEmail: true,
        role: true,
        status: true,
        signature: true,
        preferences: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update profile error:', message);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
