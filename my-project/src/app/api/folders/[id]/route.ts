import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// DELETE /api/folders/[id] - Delete a custom folder
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    // Find the folder
    const folder = await db.folder.findUnique({ where: { id } });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    // Check ownership
    if (folder.userId !== session.userId) {
      return NextResponse.json(
        { error: 'Not authorized to delete this folder' },
        { status: 403 }
      );
    }

    // Move any emails in this custom folder back to inbox
    await db.email.updateMany({
      where: {
        folder: folder.name,
        recipientEmail: session.email,
      },
      data: { folder: 'inbox' },
    });

    // Delete the folder
    await db.folder.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete folder error:', message);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
