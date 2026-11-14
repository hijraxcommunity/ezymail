import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

// F-05: only a safe allowlist may render INLINE in the browser. Everything
// else — html/xhtml, svg/xml, office docs, archives, executables, unknown
// types — is served as opaque binary with `Content-Disposition: attachment`,
// so attacker-supplied content can never execute on the app origin (the
// previous map happily served `.html` as text/html and `.svg` as
// image/svg+xml, both inline). The attachment viewer's PDF preview keeps
// working because application/pdf stays inline (browser PDF sandbox).
const SAFE_INLINE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
};

// Attachment names were historically free-form, so the header value must be
// scrubbed before interpolation (new uploads/sends are charset-restricted
// upstream; this protects legacy rows).
function safeHeaderFilename(name: string | undefined, fallback: string): string {
  const raw = (name || fallback).replace(/[\r\n"';\\]/g, '_').slice(0, 255);
  return raw || 'attachment';
}

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

    // F-27: the old lookup pulled the FULL attachments JSON (with embedded
    // base64 blobs) of up to 100 unordered emails on every request and
    // matched with `url.includes(path) || name === fileName` — slow (tens of
    // MBs parsed per click) and nondeterministic: two attachments sharing a
    // name prefix could mis-deliver the WRONG file. Now: the candidate set
    // is filtered by the database to rows whose JSON contains the requested
    // path (ownership still scoped here), and the match is EXACT-URL-FIRST —
    // the stored url equals the requested path — with the name match kept
    // only as a last-resort fallback for legacy rows that never carried a
    // url. Deterministic, one small candidate fetch instead of 100 blobs.
    const emails = await db.email.findMany({
      where: {
        OR: [
          { senderId: session.userId },
          { recipientEmail: session.email },
        ],
        attachments: { contains: fileName },
      },
      select: { attachments: true },
      take: 25,
    });

    // Search through email attachments for a matching file
    let urlMatch: { name?: string; url?: string; data?: string } | null = null;
    let nameMatch: { name?: string; url?: string; data?: string } | null = null;
    for (const email of emails) {
      if (!email.attachments) continue;
      try {
        const attachmentList = JSON.parse(email.attachments);
        if (!Array.isArray(attachmentList)) continue;

        for (const a of attachmentList) {
          // The route param is the path SUFFIX (userId_uuid_name) while the
          // stored url carries the /api/attachments/ prefix — the old
          // includes() bridged that loosely (prefix collisions could
          // mis-deliver). endsWith on the FULL suffix is exact for unique
          // uuid-bearing paths and still covers legacy bare-suffix rows.
          if (!urlMatch && typeof a?.url === 'string' && a.url.endsWith(normalized) && a.data) {
            urlMatch = a;
          } else if (!nameMatch && a?.name === fileName && a.data) {
            nameMatch = a;
          }
          if (urlMatch) break;
        }
      } catch {
        // Skip malformed JSON
        continue;
      }
      if (urlMatch) break;
    }
    const match = urlMatch || nameMatch;

    if (match?.data) {
      // Attachment has base64 data embedded
      const base64Data = match.data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = '.' + (match.name?.split('.').pop() || '').toLowerCase();
      const inlineMime = SAFE_INLINE_MIME[ext];
      const contentType = inlineMime || 'application/octet-stream';
      const filename = safeHeaderFilename(match.name, fileName);
      const disposition = inlineMime ? 'inline' : 'attachment';

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.length),
          // F-05/F-47: authenticated user content must never be shared-
          // cacheable; proxies/CDNs could otherwise serve one user's
          // attachment bytes to another without re-auth.
          'Cache-Control': 'private, max-age=86400',
          'Content-Disposition': `${disposition}; filename="${filename}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Serve attachment error:', message);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
