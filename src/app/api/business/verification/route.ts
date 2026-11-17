import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// F-15: the file mode never uploaded anything — the client fabricated
// 'https://example.com/<filename>' strings and the API accepted any http(s)
// URL, so the verification gate (which unlocks trials) could be satisfied
// with garbage. The API now accepts REAL document content:
//   documents: [{ name, type, size, data }] — base64 data URLs, validated
//   server-side (type allowlist, per-file and total size caps).
//   documentUrls: external https links the submitter chose (link mode, kept).
// Totals are bounded by the deployment platform's ~4.5MB request-body limit
// (3MB raw -> ~4MB base64), the same constraint the attachment pipeline has.
const MAX_DOCUMENTS = 3;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // 3MB across all files
const ALLOWED_DOC_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

interface StoredDocument {
  kind: 'file' | 'url';
  name: string;
  type?: string;
  size?: number;
  url?: string;
  data?: string; // base64 data URL — files only; stripped from list payloads
}

function docTypeAllowed(name: string, type: string): string | null {
  const normalized = (type || '').toLowerCase();
  if (ALLOWED_DOC_TYPES[normalized]) return normalized;
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user is a business account
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.accountType !== 'business') {
      return NextResponse.json({ error: 'Only business accounts can submit verification documents' }, { status: 403 });
    }

    const body = await request.json();
    const { documentUrls, documents } = body;

    const stored: StoredDocument[] = [];

    // ── Link mode (external URLs the submitter chose; admin opens them) ──
    if (documentUrls !== undefined) {
      if (!Array.isArray(documentUrls)) {
        return NextResponse.json({ error: 'documentUrls must be an array of URLs' }, { status: 400 });
      }
      const urlRegex = /^https:\/\/.+/;
      for (const url of documentUrls) {
        if (typeof url !== 'string' || !urlRegex.test(url) || url.length > 2000) {
          return NextResponse.json(
            { error: 'Each document URL must be a valid HTTPS URL (max 2000 chars)' },
            { status: 400 }
          );
        }
        stored.push({ kind: 'url', name: url.split('/').pop() || 'document', url });
      }
    }

    // ── File mode (real content, validated server-side) ──
    if (documents !== undefined) {
      if (!Array.isArray(documents)) {
        return NextResponse.json({ error: 'documents must be an array' }, { status: 400 });
      }
      if (documents.length > MAX_DOCUMENTS) {
        return NextResponse.json(
          { error: `You can submit up to ${MAX_DOCUMENTS} files per submission` },
          { status: 400 }
        );
      }
      let totalBytes = 0;
      for (const doc of documents) {
        const name = typeof doc?.name === 'string' ? doc.name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').slice(0, 200) : '';
        const data = typeof doc?.data === 'string' ? doc.data : '';
        const declaredType = typeof doc?.type === 'string' ? doc.type : '';

        if (!name) {
          return NextResponse.json({ error: 'Each document needs a file name' }, { status: 400 });
        }
        const type = docTypeAllowed(name, declaredType);
        if (!type) {
          return NextResponse.json(
            { error: `File "${name}" is not supported. Accepted types: PDF, JPG, PNG.` },
            { status: 400 }
          );
        }
        const dataMatch = /^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
        if (!dataMatch) {
          return NextResponse.json(
            { error: `File "${name}" did not arrive as valid base64 content` },
            { status: 400 }
          );
        }
        const bytes = Buffer.from(dataMatch[2], 'base64');
        if (bytes.length === 0) {
          return NextResponse.json({ error: `File "${name}" is empty` }, { status: 400 });
        }
        if (bytes.length > MAX_FILE_BYTES) {
          return NextResponse.json(
            { error: `File "${name}" exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB per-file limit` },
            { status: 400 }
          );
        }
        totalBytes += bytes.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          return NextResponse.json(
            { error: `Total document size cannot exceed ${MAX_TOTAL_BYTES / (1024 * 1024)}MB` },
            { status: 400 }
          );
        }
        stored.push({
          kind: 'file',
          name,
          type,
          size: bytes.length,
          data: `data:${type};base64,${bytes.toString('base64')}`,
        });
      }
    }

    if (stored.length === 0) {
      return NextResponse.json(
        { error: 'Provide at least one document (files or URLs)' },
        { status: 400 }
      );
    }

    // F-19/F-67: the update branch used to unconditionally reset the record
    // to pending, clearing reviewedAt/reviewedBy/adminNotes — an already
    // APPROVED business could flip its displayed status back to 'Under
    // Review' forever (and, combined with an admin reset of
    // subscriptionStatus, feed the F-19 unlimited-trial loop whose approve
    // side was closed in an earlier batch). Resubmission is now only valid
    // while the record is NOT approved — a rejected business may re-submit
    // (real-world fix-and-retry), an approved one may not.
    const existingVerification = await db.businessVerification.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (existingVerification?.status === 'approved') {
      return NextResponse.json(
        { error: 'Your verification has already been approved. No further submissions are needed.' },
        { status: 409 }
      );
    }

    // Upsert verification record (documentUrls column stores the structured
    // list: file entries carry their content, URL entries the external link)
    const verification = await db.businessVerification.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        documentUrls: JSON.stringify(stored),
        status: 'pending',
      },
      update: {
        documentUrls: JSON.stringify(stored),
        status: 'pending',
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        adminNotes: null,
      },
    });

    return NextResponse.json(
      {
        id: verification.id,
        status: verification.status,
        submittedAt: verification.submittedAt,
        message: 'Verification documents submitted successfully',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Submit verification error:', message);
    return NextResponse.json({ error: 'Failed to submit verification documents' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const verification = await db.businessVerification.findUnique({
      where: { userId: session.userId },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        adminNotes: true,
      },
    });

    if (!verification) {
      return NextResponse.json({ status: null, message: 'No verification submitted' });
    }

    return NextResponse.json({
      id: verification.id,
      status: verification.status,
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      adminNotes: verification.adminNotes,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get verification status error:', message);
    return NextResponse.json({ error: 'Failed to get verification status' }, { status: 500 });
  }
}