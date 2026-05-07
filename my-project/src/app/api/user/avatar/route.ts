import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import sharp from 'sharp';

// POST /api/user/avatar - Upload avatar (stored as base64 in database)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Avatar file is required' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Process image with sharp (resize to 128x128)
    const processedBuffer = await sharp(buffer)
      .resize(128, 128, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Convert to base64 data URL (stored directly in database)
    const base64 = processedBuffer.toString('base64');
    const avatarDataUrl = `data:image/jpeg;base64,${base64}`;

    // Save avatar URL to user record
    await db.user.update({
      where: { id: session.userId },
      data: { avatar: avatarDataUrl },
    });

    return NextResponse.json({ avatar: avatarDataUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Upload avatar error:', message);
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
  }
}
