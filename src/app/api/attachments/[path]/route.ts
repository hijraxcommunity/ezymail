import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// MIME type map for serving files with correct Content-Type
const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif', '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.csv': 'text/csv', '.html': 'text/html',
  '.json': 'application/json', '.xml': 'application/xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.aac': 'audio/aac', '.m4a': 'audio/mp4',
  '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed', '.gz': 'application/gzip', '.tar': 'application/x-tar',
};

// GET /api/attachments/[path] - Serve attachment files
// Looks up the attachment from the database and serves the base64 data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { path: filePath } = await params;

    // Prevent directory traversal
    const normalized = filePath.replace(/\\/g, '/').replace(/\.\./g, '');
    if (normalized.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Extract the attachment ID from the path (format: userId_hash.ext)
    const fileName = normalized.split('/').pop() || '';

    // Look for the attachment in the user's emails
    const emails = await db.email.findMany({
      where: {
        OR: [
          { senderId: session.userId },
          { recipientEmail: session.email },
        ],
        attachments: { not: null },
      },
      select: { attachments: true },
      take: 100,
    });

    // Search through email attachments for a matching file
    for (const email of emails) {
      if (!email.attachments) continue;
      try {
        const attachmentList = JSON.parse(email.attachments);
        if (!Array.isArray(attachmentList)) continue;

        const match = attachmentList.find(
          (a: { name?: string; url?: string; data?: string }) =>
            a.url?.includes(normalized) || a.name === fileName
        );

        if (match?.data) {
          // Attachment has base64 data embedded
          const base64Data = match.data.replace(/^data:[^;]+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const ext = '.' + (match.name?.split('.').pop() || 'bin').toLowerCase();
          const contentType = MIME_MAP[ext] || 'application/octet-stream';

          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(buffer.length),
              'Cache-Control': 'public, max-age=86400, immutable',
              'Content-Disposition': `inline; filename="${match.name || fileName}"`,
            },
          });
        }
      } catch {
        // Skip malformed JSON
        continue;
      }
    }

    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Serve attachment error:', message);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
