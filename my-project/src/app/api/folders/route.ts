import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// System folders that are always available
const SYSTEM_FOLDERS = [
  { id: 'inbox', name: 'Inbox', color: '#4285F4', isSystem: true, icon: 'inbox' },
  { id: 'sent', name: 'Sent', color: '#34A853', isSystem: true, icon: 'send' },
  { id: 'drafts', name: 'Drafts', color: '#FBBC04', isSystem: true, icon: 'file' },
  { id: 'starred', name: 'Starred', color: '#FBBC04', isSystem: true, icon: 'star' },
  { id: 'trash', name: 'Trash', color: '#EA4335', isSystem: true, icon: 'trash' },
  { id: 'spam', name: 'Spam', color: '#EA4335', isSystem: true, icon: 'alert' },
];

// GET /api/folders - Get all folders for the current user
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const customFolders = await db.folder.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'asc' },
    });

    // Count emails in each folder
    const emailCounts = await db.email.groupBy({
      by: ['folder'],
      where: {
        recipientEmail: session.email,
      },
      _count: {
        id: true,
      },
    });

    const sentCounts = await db.email.groupBy({
      by: ['folder'],
      where: {
        senderId: session.userId,
      },
      _count: {
        id: true,
      },
    });

    // Count unread emails
    const unreadCounts = await db.email.groupBy({
      by: ['folder'],
      where: {
        recipientEmail: session.email,
        isRead: false,
      },
      _count: {
        id: true,
      },
    });

    // Build folder list with counts
    const folders = [...SYSTEM_FOLDERS, ...customFolders.map((f) => ({ ...f, isSystem: false }))].map(
      (folder) => {
        let count = 0;
        let unread = 0;

        if (folder.id === 'sent') {
          const sent = sentCounts.find((c) => c.folder === 'sent');
          count = sent?._count.id || 0;
        } else if (folder.id === 'starred') {
          // Starred count from database
          count = 0; // Will be populated separately
        } else {
          const found = emailCounts.find((c) => c.folder === folder.id);
          count = found?._count.id || 0;
        }

        const unreadFound = unreadCounts.find((c) => c.folder === folder.id);
        unread = unreadFound?._count.id || 0;

        return {
          ...folder,
          count,
          unread,
        };
      }
    );

    return NextResponse.json({ folders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List folders error:', message);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

// POST /api/folders - Create a custom folder
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    // Check for reserved names
    const reservedNames = ['inbox', 'sent', 'drafts', 'starred', 'trash', 'spam', 'archive'];
    if (reservedNames.includes(name.trim().toLowerCase())) {
      return NextResponse.json(
        { error: 'Cannot use a reserved folder name' },
        { status: 400 }
      );
    }

    // Check for duplicate names
    const existingFolder = await db.folder.findFirst({
      where: {
        userId: session.userId,
        name: name.trim(),
      },
    });

    if (existingFolder) {
      return NextResponse.json({ error: 'Folder with this name already exists' }, { status: 409 });
    }

    const folder = await db.folder.create({
      data: {
        userId: session.userId,
        name: name.trim(),
        color: color || '#4285F4',
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create folder error:', message);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
