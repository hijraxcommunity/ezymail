import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  verifyPhoneVerificationToken,
  consumePhoneVerificationToken,
  normalizePhoneStringE164,
  sameStoredPhone,
} from '@/lib/phone-verification';

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
      phoneVerificationToken,
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
      // F-41: the avatar used to be any unbounded string straight into the
      // DB (bloat vector; consumers are regex-gated so no XSS, but a multi-
      // MB "avatar" would sit in the user row forever). Real uploads are
      // either the server-rewritten /api/user/avatar/... URL or a small
      // data: image — enforce both the shape and a sane ceiling.
      const AVATAR_DATA_URL = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
      const AVATAR_URL = /^\/api\/user\/avatar\/[A-Za-z0-9._-]+$|^https?:\/\/[^\s"'<>]+$/;
      const avatarOk =
        typeof avatar === 'string' &&
        avatar.length <= 200000 &&
        (AVATAR_DATA_URL.test(avatar) || AVATAR_URL.test(avatar));
      if (!avatarOk) {
        return NextResponse.json(
          { error: 'Invalid avatar: expected an image URL or a small image data URL' },
          { status: 400 }
        );
      }
      updateData.avatar = avatar;
    }
    if (bio !== undefined) {
      // F-41: bio.slice assumed a string — a non-string crashed with a
      // TypeError and surfaced as a generic 500.
      if (typeof bio !== 'string') {
        return NextResponse.json({ error: 'Bio must be a string' }, { status: 400 });
      }
      updateData.bio = bio.slice(0, 60);
    }
    if (phone !== undefined) {
      // F-41 parity (Batch 9): registration demands a signed WhatsApp OTP
      // proof for the INITIAL phone; a profile phone CHANGE now demands the
      // same proof. Three cases:
      //
      //   1. Same number as stored (tolerant digits comparison — a legacy
      //      local row "0700…" matches its international form): no change,
      //      no proof required, nothing written.
      //   2. Genuinely new number: the client must have completed the
      //      verify-phone WhatsApp flow for THAT number and submit the
      //      server-issued proof token. The submitted phone must be the
      //      exact E.164 the proof binds to; the token is verified AND
      //      consumed (one proof = one stored change, replay fails).
      //   3. No/unusable proof: 400 with the reason, the stored number
      //      stays untouched.
      if (typeof phone !== 'string' || !/^\+?[0-9\s-]{6,20}$/.test(phone)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }

      const current = await db.user.findUnique({
        where: { id: session.userId },
        select: { phone: true },
      });

      const unchanged =
        current?.phone ? sameStoredPhone(current.phone, phone) : false;

      if (!unchanged) {
        const e164 = normalizePhoneStringE164(phone);
        if (!e164) {
          return NextResponse.json(
            {
              error:
                'Verify the new number on WhatsApp first — the change must be submitted as the verified international number (e.g. +93700123456)',
            },
            { status: 400 }
          );
        }
        if (typeof phoneVerificationToken !== 'string' || !phoneVerificationToken) {
          return NextResponse.json(
            { error: 'Verify the new number on WhatsApp before saving it' },
            { status: 400 }
          );
        }
        // Signature + binding first, single-use consumption second — the
        // same order and semantics the register APIs enforce (a token
        // changes the phone exactly once, even under concurrent replays).
        if (!(await verifyPhoneVerificationToken(phoneVerificationToken, e164))) {
          return NextResponse.json(
            { error: 'This verification does not match the submitted number or has expired — verify the number again' },
            { status: 400 }
          );
        }
        if (!(await consumePhoneVerificationToken(phoneVerificationToken))) {
          return NextResponse.json(
            { error: 'This verification was already used — verify the number again' },
            { status: 400 }
          );
        }
        updateData.phone = e164;
      }
    }
    if (dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth;
    }
    if (signature !== undefined) {
      updateData.signature = signature;
    }
    if (preferences !== undefined) {
      // MERGE with the stored preferences instead of replacing the object.
      // Replace semantics let ANY stale or partial write (second device, an
      // old Save button, a tab opened before a toggle) silently flip the
      // Notifications switch back to false — the exact "toggle does not
      // persist" report. With merge, keys a caller does not send keep their
      // stored value, so only the toggle can move desktopNotif.
      const current = await db.user.findUnique({
        where: { id: session.userId },
        select: { preferences: true },
      });
      let existing: Record<string, unknown> = {};
      try {
        existing =
          typeof current?.preferences === 'string'
            ? JSON.parse(current.preferences)
            : current?.preferences || {};
      } catch {
        existing = {};
      }
      let incoming: Record<string, unknown> | null = null;
      if (typeof preferences === 'string') {
        try { incoming = JSON.parse(preferences); } catch { incoming = null; }
      } else if (preferences && typeof preferences === 'object') {
        incoming = preferences;
      }
      if (!incoming || typeof incoming !== 'object') {
        return NextResponse.json({ error: 'Invalid preferences payload' }, { status: 400 });
      }
      updateData.preferences = JSON.stringify({ ...existing, ...incoming });
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
    // Phone now carries a database-level unique constraint (WhatsApp OTP
    // verified numbers). Surface a friendly conflict instead of a 500 when
    // a user tries to save a number another account already holds.
    if (
      error && typeof error === 'object' && 'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'This phone number is already used by another account' },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update profile error:', message);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
