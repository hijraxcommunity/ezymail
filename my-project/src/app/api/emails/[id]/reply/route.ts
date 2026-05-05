import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// POST /api/emails/[id]/reply - Reply to an email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { body: replyBody, bodyHtml } = body;

    // Validate
    if (!replyBody || !replyBody.trim()) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }

    // Find the parent email
    const parentEmail = await db.email.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    if (!parentEmail) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = parentEmail.senderId === session.userId;
    const isRecipient = parentEmail.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized to reply to this email' }, { status: 403 });
    }

    // Determine reply recipient (reply goes to the other party)
    const replyRecipientEmail = isSender ? parentEmail.recipientEmail : parentEmail.sender.email;

    // Create reply email in the recipient's inbox
    const reply = await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail: replyRecipientEmail,
        subject: parentEmail.subject.startsWith('Re: ')
          ? parentEmail.subject
          : `Re: ${parentEmail.subject}`,
        body: replyBody.trim(),
        bodyHtml: bodyHtml || '',
        folder: 'inbox',
        parentEmailId: parentEmail.id,
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

    // Create a copy in the sender's sent folder
    await db.email.create({
      data: {
        senderId: session.userId,
        recipientEmail: replyRecipientEmail,
        subject: parentEmail.subject.startsWith('Re: ')
          ? parentEmail.subject
          : `Re: ${parentEmail.subject}`,
        body: replyBody.trim(),
        bodyHtml: bodyHtml || '',
        folder: 'sent',
        parentEmailId: parentEmail.id,
      },
    });

    return NextResponse.json({ success: true, email: reply }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Reply email error:', message);
    return NextResponse.json({ error: 'Failed to reply to email' }, { status: 500 });
  }
}
