import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod/v4';

const querySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * Convert a value to safe CSV (escape quotes and wrap in quotes if needed)
 */
function csvEscape(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// GET /api/user/export - Export all user data
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.parse(params);
    const format = parsed.format;

    // Fetch all user data in parallel
    const [user, emails, contacts, folders, labels, templates] = await Promise.all([
      db.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          bio: true,
          dateOfBirth: true,
          phone: true,
          avatar: true,
          recoveryEmail: true,
          role: true,
          status: true,
          signature: true,
          preferences: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.email.findMany({
        where: {
          OR: [
            { senderId: session.userId },
            { recipientEmail: session.email },
          ],
        },
        select: {
          id: true,
          senderId: true,
          recipientEmail: true,
          subject: true,
          body: true,
          bodyHtml: true,
          attachments: true,
          isRead: true,
          isStarred: true,
          isArchived: true,
          folder: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.contact.findMany({
        where: { userId: session.userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          notes: true,
          isFavorite: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.folder.findMany({
        where: { userId: session.userId },
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          sortOrder: true,
          createdAt: true,
        },
        orderBy: { sortOrder: 'asc' },
      }),
      db.label.findMany({
        where: { userId: session.userId },
        select: {
          id: true,
          name: true,
          color: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.template.findMany({
        where: { userId: session.userId },
        select: {
          id: true,
          name: true,
          subject: true,
          body: true,
          bodyHtml: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          ...user,
          preferences: JSON.parse(user.preferences || '{}'),
        },
        emails,
        contacts,
        folders,
        labels,
        templates,
      };

      const jsonStr = JSON.stringify(exportData, null, 2);

      return new NextResponse(jsonStr, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="ezymail-export-${timestamp}.json"`,
        },
      });
    }

    // CSV format - export emails as CSV
    const csvHeaders = [
      'ID',
      'Folder',
      'Subject',
      'From',
      'To',
      'Body',
      'Attachments',
      'Is Read',
      'Is Starred',
      'Is Archived',
      'Created At',
    ];

    const csvRows = emails.map((email) => {
      return [
        csvEscape(email.id),
        csvEscape(email.folder),
        csvEscape(email.subject),
        csvEscape(email.senderId === session.userId ? user.email : ''),
        csvEscape(email.recipientEmail),
        csvEscape(email.body),
        csvEscape(email.attachments || ''),
        csvEscape(email.isRead),
        csvEscape(email.isStarred),
        csvEscape(email.isArchived),
        csvEscape(email.createdAt.toISOString()),
      ].join(',');
    });

    // Add contacts section
    const contactHeaders = ['Name', 'Email', 'Phone', 'Notes', 'Favorite', 'Created At'];
    const contactRows = contacts.map((c) => {
      return [
        csvEscape(c.name),
        csvEscape(c.email),
        csvEscape(c.phone || ''),
        csvEscape(c.notes),
        csvEscape(c.isFavorite),
        csvEscape(c.createdAt.toISOString()),
      ].join(',');
    });

    // Add folders section
    const folderHeaders = ['Name', 'Color', 'Icon', 'Sort Order', 'Created At'];
    const folderRows = folders.map((f) => {
      return [
        csvEscape(f.name),
        csvEscape(f.color),
        csvEscape(f.icon),
        csvEscape(f.sortOrder),
        csvEscape(f.createdAt.toISOString()),
      ].join(',');
    });

    const csvContent = [
      '# Emails',
      csvHeaders.join(','),
      ...csvRows,
      '',
      '# Contacts',
      contactHeaders.join(','),
      ...contactRows,
      '',
      '# Folders',
      folderHeaders.join(','),
      ...folderRows,
    ].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ezymail-export-${timestamp}.csv"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Export data error:', message);
    return NextResponse.json({ success: false, error: 'Failed to export data' }, { status: 500 });
  }
}
