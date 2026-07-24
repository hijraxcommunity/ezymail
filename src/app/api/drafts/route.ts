import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST /api/drafts - Create or update a draft
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { id, to, cc, bcc, subject, bodyHtml, body: emailBody } = body;

    if (id) {
      // Update existing draft
      const existing = await db.email.findUnique({
        where: { id },
        select: { id: true, senderId: true, folder: true, isDraft: true },
      });

      if (!existing || existing.senderId !== session.userId || !existing.isDraft) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      }

      const updated = await db.email.update({
        where: { id },
        data: {
          recipientEmail: (to || '').trim() || session.email,
          cc: cc || null,
          bcc: bcc || null,
          subject: (subject || '').trim() || '(No subject)',
          body: (emailBody || '').trim(),
          bodyHtml: bodyHtml || '',
        },
        include: {
          sender: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
        },
      });

      return NextResponse.json({ success: true, draft: formatDraft(updated) });
    }

    // Create new draft — only save if there's some content
    const html = bodyHtml || '';
    const text = (emailBody || '').trim();
    const hasContent = (to || '').trim() || (subject || '').trim() || text || html.replace(/<[^>]*>/g, '').trim();

    if (!hasContent) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const draft = await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail: (to || '').trim() || session.email,
        cc: cc || null,
        bcc: bcc || null,
        subject: (subject || '').trim() || '(No subject)',
        body: text,
        bodyHtml: html,
        folder: 'drafts',
        isDraft: true,
      },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    return NextResponse.json({ success: true, draft: formatDraft(draft) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Save draft error:', message);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}

function formatDraft(email: Record<string, unknown>) {
  return {
    id: email.id,
    recipientEmail: email.recipientEmail,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    body: email.body,
    bodyHtml: email.bodyHtml,
    folder: email.folder,
    isDraft: email.isDraft,
    createdAt: email.createdAt,
    sender: email.sender,
    recipient: email.recipient,
  };
}