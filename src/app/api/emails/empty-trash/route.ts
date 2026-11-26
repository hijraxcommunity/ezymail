import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST /api/emails/empty-trash - Permanently delete EVERYTHING in the
// caller's Trash.
//
// Scope = EXACTLY the rows the Trash view lists (same three clauses), so
// "Empty Trash" can never destroy more than the user was shown:
//   1. their received copies in trash (never drafts, never author-side
//      trashed rows addressed to them),
//   2. their own sent copies they trashed (trashedFrom='sent'),
//   3. their own drafts they trashed (trashedFrom='drafts').
// The folder='trash' pin is the hard guard: live mail in any other folder
// is unreachable from here, and rows other users trashed in their own
// mailboxes (author-stamped rows addressed to this user) match no clause.
// Rows trashed before the trashedFrom marker existed (legacy received
// copies) are covered by the explicit null branch of clause 1; legacy
// sender-side orphans (unmarked sent copies/drafts in trash) match no
// clause and stay out of scope exactly as they stay out of the view.
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const result = await db.email.deleteMany({
      where: {
        folder: 'trash',
        OR: [
          {
            recipientEmail: session.email,
            isDraft: false,
            OR: [{ trashedFrom: null }, { trashedFrom: { notIn: ['sent', 'drafts'] } }],
          },
          { senderId: session.userId, trashedFrom: 'sent' },
          { senderId: session.userId, trashedFrom: 'drafts' },
        ],
      },
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Empty trash error:', message);
    return NextResponse.json({ error: 'Failed to empty trash' }, { status: 500 });
  }
}
