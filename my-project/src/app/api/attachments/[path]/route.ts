import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

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

// GET /api/attachments/[path] - Serve uploaded files
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  try {
    // Auth check (lightweight — just verify session exists)
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

    const fullPath = join(process.cwd(), 'uploads', 'attachments', normalized);

    // Fallback to old public/ location for backward compatibility
    const oldPath = !existsSync(fullPath)
      ? join(process.cwd(), 'public', 'uploads', 'attachments', normalized)
      : fullPath;
    const servePath = existsSync(fullPath) ? fullPath : oldPath;

    if (!existsSync(servePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = await readFile(servePath);
    const fileStat = await stat(servePath);
    const ext = extname(normalized).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    // Cache for 1 day
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileStat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': `inline; filename="${normalized.split('/').pop()}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Serve attachment error:', message);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
