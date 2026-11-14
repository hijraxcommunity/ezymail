import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/admin/business-verifications/[id]/documents - Fetch the documents
// submitted with a verification. F-15: file documents are real content now —
// the admin reviews them by downloading from here (admin session required),
// instead of opening fabricated example.com links. File entries carry their
// base64 data URL; URL entries are returned as-is.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;

    const verification = await db.businessVerification.findUnique({
      where: { id },
      select: {
        id: true,
        documentUrls: true,
        user: {
          select: { email: true, businessName: true },
        },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    interface DocEntry {
      kind?: string;
      name?: string;
      type?: string;
      size?: number;
      url?: string;
      data?: string;
    }

    let entries: DocEntry[] = [];
    try {
      const parsed: unknown = JSON.parse(verification.documentUrls);
      if (Array.isArray(parsed)) {
        entries = parsed as DocEntry[];
      }
    } catch {
      entries = [];
    }

    const documents = entries.map((entry) => {
      // Legacy rows (pre-F-15): plain URL strings.
      if (typeof entry === 'string') {
        return { kind: 'url', name: String(entry).split('/').pop() || 'document', url: String(entry) };
      }
      if (entry.kind === 'file') {
        return {
          kind: 'file',
          name: entry.name || 'document',
          type: entry.type || 'application/octet-stream',
          size: entry.size || 0,
          dataUrl: entry.data || null, // served ONLY to admin sessions, on demand
        };
      }
      return { kind: 'url', name: entry.name || 'document', url: entry.url || '' };
    });

    return NextResponse.json({
      id: verification.id,
      businessName: verification.user.businessName,
      userEmail: verification.user.email,
      documents,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin verification documents error:', message);
    return NextResponse.json({ error: 'Failed to fetch verification documents' }, { status: 500 });
  }
}
