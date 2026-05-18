import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

// POST /api/upload - Upload file attachments (stored as base64)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Validate total size
    let totalSize = 0;
    for (const file of files) {
      if (!(file instanceof File)) continue;
      totalSize += file.size;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: `Total file size cannot exceed ${MAX_TOTAL_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const uploadedFiles: Array<{ name: string; url: string; size: number; type: string; data: string }> = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
          { status: 400 }
        );
      }

      // Convert file to base64 directly (no image processing to avoid sharp dependency issues)
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mimeType = file.type || 'application/octet-stream';
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      // Generate unique attachment URL
      const uniqueId = randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const attachmentUrl = `/api/attachments/${session.userId}_${uniqueId}_${safeName}`;

      uploadedFiles.push({
        name: file.name,
        url: attachmentUrl,
        size: file.size,
        type: file.type,
        data: dataUrl,
      });
    }

    return NextResponse.json({ files: uploadedFiles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Upload error:', message);
    return NextResponse.json({ error: 'Upload failed: ' + message }, { status: 500 });
  }
}
