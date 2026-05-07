import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Prisma } from '@prisma/client';

// ─── Operator parsing ───

interface ParsedOperators {
  from: string;
  to: string;
  subject: string;
  body: string;
  hasAttachment: boolean | null;
  isUnread: boolean | null;
  isStarred: boolean | null;
  before: string | null;
  after: string | null;
  generalQuery: string;
}

function parseSearchOperators(query: string): ParsedOperators {
  const result: ParsedOperators = {
    from: '',
    to: '',
    subject: '',
    body: '',
    hasAttachment: null,
    isUnread: null,
    isStarred: null,
    before: null,
    after: null,
    generalQuery: '',
  };

  // Split by spaces but respect quoted strings
  const tokens: string[] = [];
  const regex = /(?:[^\s"]+|"[^"]*")/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    tokens.push(match[0]);
  }

  const generalTokens: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (lower.startsWith('from:')) {
      result.from = token.slice(5).replace(/^"|"$/g, '').trim();
    } else if (lower.startsWith('to:')) {
      result.to = token.slice(3).replace(/^"|"$/g, '').trim();
    } else if (lower.startsWith('subject:')) {
      result.subject = token.slice(8).replace(/^"|"$/g, '').trim();
    } else if (lower.startsWith('has:attachment')) {
      result.hasAttachment = true;
    } else if (lower.startsWith('has:')) {
      const val = token.slice(4).trim();
      if (val === 'attachment') result.hasAttachment = true;
    } else if (lower.startsWith('is:unread')) {
      result.isUnread = true;
    } else if (lower.startsWith('is:read')) {
      result.isUnread = false;
    } else if (lower.startsWith('is:starred')) {
      result.isStarred = true;
    } else if (lower === 'is:unstarred') {
      result.isStarred = false;
    } else if (lower.startsWith('is:')) {
      const val = token.slice(3).trim();
      if (val === 'unread') result.isUnread = true;
      if (val === 'read') result.isUnread = false;
      if (val === 'starred') result.isStarred = true;
      if (val === 'unstarred') result.isStarred = false;
    } else if (lower.startsWith('before:')) {
      result.before = token.slice(7).replace(/^"|"$/g, '').trim();
    } else if (lower.startsWith('after:')) {
      result.after = token.slice(6).replace(/^"|"$/g, '').trim();
    } else {
      generalTokens.push(token.replace(/^"|"$/g, ''));
    }
  }

  result.generalQuery = generalTokens.join(' ').trim();
  return result;
}

function buildWhereClause(ops: ParsedOperators, userId: string, email: string): Prisma.EmailWhereInput {
  const conditions: Prisma.EmailWhereInput[] = [];

  // Base condition: user is sender or recipient
  conditions.push({
    OR: [
      { senderId: userId },
      { recipientEmail: email },
    ],
  });

  // General text search (subject, body, sender name)
  if (ops.generalQuery) {
    conditions.push({
      OR: [
        { subject: { contains: ops.generalQuery } },
        { body: { contains: ops.generalQuery } },
        { sender: { firstName: { contains: ops.generalQuery } } },
        { sender: { lastName: { contains: ops.generalQuery } } },
      ],
    });
  }

  // From filter
  if (ops.from) {
    conditions.push({
      OR: [
        { sender: { email: { contains: ops.from } } },
        { sender: { firstName: { contains: ops.from } } },
        { sender: { lastName: { contains: ops.from } } },
      ],
    });
  }

  // To filter
  if (ops.to) {
    conditions.push({
      OR: [
        { recipientEmail: { contains: ops.to } },
        { recipient: { email: { contains: ops.to } } },
        { recipient: { firstName: { contains: ops.to } } },
        { recipient: { lastName: { contains: ops.to } } },
      ],
    });
  }

  // Subject filter
  if (ops.subject) {
    conditions.push({
      subject: { contains: ops.subject },
    });
  }

  // Body filter
  if (ops.body) {
    conditions.push({
      OR: [
        { body: { contains: ops.body } },
        { bodyHtml: { contains: ops.body } },
      ],
    });
  }

  // Has attachment
  if (ops.hasAttachment === true) {
    conditions.push({
      attachments: { not: null },
    });
  }

  // Is unread / read
  if (ops.isUnread === true) {
    conditions.push({ isRead: false });
  } else if (ops.isUnread === false) {
    conditions.push({ isRead: true });
  }

  // Is starred / unstarred
  if (ops.isStarred === true) {
    conditions.push({ isStarred: true });
  } else if (ops.isStarred === false) {
    conditions.push({ isStarred: false });
  }

  // Before date
  if (ops.before) {
    const date = new Date(ops.before);
    if (!isNaN(date.getTime())) {
      conditions.push({ createdAt: { lt: date } });
    }
  }

  // After date
  if (ops.after) {
    const date = new Date(ops.after);
    if (!isNaN(date.getTime())) {
      conditions.push({ createdAt: { gt: date } });
    }
  }

  return { AND: conditions };
}

// ─── GET /api/search - Search emails with operator support ───
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // Parse operators from the query string
    const ops = parseSearchOperators(query.trim());
    const whereClause = buildWhereClause(ops, session.userId, session.email);

    const [emails, total] = await Promise.all([
      db.email.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          replies: {
            select: { id: true },
          },
        },
      }),
      db.email.count({ where: whereClause }),
    ]);

    const results = emails.map((email) => ({
      id: email.id,
      senderId: email.senderId,
      recipientEmail: email.recipientEmail,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml,
      isRead: email.isRead,
      isStarred: email.isStarred,
      isArchived: email.isArchived,
      folder: email.folder,
      parentEmailId: email.parentEmailId,
      readAt: email.readAt,
      createdAt: email.createdAt,
      sender: email.sender,
      recipient: email.recipient,
      replyCount: email.replies.length,
    }));

    return NextResponse.json({
      results,
      total,
      query: query.trim(),
      page,
      limit,
      operators: {
        from: ops.from || undefined,
        to: ops.to || undefined,
        subject: ops.subject || undefined,
        hasAttachment: ops.hasAttachment ?? undefined,
        isUnread: ops.isUnread ?? undefined,
        isStarred: ops.isStarred ?? undefined,
        before: ops.before || undefined,
        after: ops.after || undefined,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Search error:', message);
    return NextResponse.json({ error: 'Failed to search emails' }, { status: 500 });
  }
}

// ─── POST /api/search - Advanced search ───
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();

    const {
      from = '',
      to = '',
      subject = '',
      body: bodyQuery = '',
      hasAttachment,
      isUnread,
      isStarred,
      before = '',
      after = '',
      folder = '',
      label = '',
      query = '',
    } = body;

    // Build operators: if there's a query string, parse it first, then overlay POST body fields
    let ops = query ? parseSearchOperators(query) : {
      from: '',
      to: '',
      subject: '',
      body: '',
      hasAttachment: null,
      isUnread: null,
      isStarred: null,
      before: null,
      after: null,
      generalQuery: '',
    };

    // POST body fields override parsed operators
    if (from) ops.from = from;
    if (to) ops.to = to;
    if (subject) ops.subject = subject;
    if (bodyQuery) ops.body = bodyQuery;
    if (hasAttachment !== undefined && hasAttachment !== null) ops.hasAttachment = hasAttachment;
    if (isUnread !== undefined && isUnread !== null) ops.isUnread = isUnread;
    if (isStarred !== undefined && isStarred !== null) ops.isStarred = isStarred;
    if (before) ops.before = before;
    if (after) ops.after = after;

    const whereClause = buildWhereClause(ops, session.userId, session.email);

    // Add folder filter
    if (folder) {
      (whereClause.AND as Prisma.EmailWhereInput[]).push({ folder });
    }

    // Add label filter
    if (label) {
      (whereClause.AND as Prisma.EmailWhereInput[]).push({
        emailLabels: {
          some: {
            label: {
              name: { contains: label },
              userId: session.userId,
            },
          },
        },
      });
    }

    const page = Math.max(1, parseInt(body.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(body.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      db.email.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
          },
          replies: {
            select: { id: true },
          },
        },
      }),
      db.email.count({ where: whereClause }),
    ]);

    const results = emails.map((email) => ({
      id: email.id,
      senderId: email.senderId,
      recipientEmail: email.recipientEmail,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml,
      isRead: email.isRead,
      isStarred: email.isStarred,
      isArchived: email.isArchived,
      folder: email.folder,
      parentEmailId: email.parentEmailId,
      readAt: email.readAt,
      createdAt: email.createdAt,
      sender: email.sender,
      recipient: email.recipient,
      replyCount: email.replies.length,
    }));

    return NextResponse.json({
      results,
      total,
      query: query.trim() || 'Advanced Search',
      page,
      limit,
      operators: {
        from: ops.from || undefined,
        to: ops.to || undefined,
        subject: ops.subject || undefined,
        body: ops.body || undefined,
        hasAttachment: ops.hasAttachment ?? undefined,
        isUnread: ops.isUnread ?? undefined,
        isStarred: ops.isStarred ?? undefined,
        before: ops.before || undefined,
        after: ops.after || undefined,
        folder: folder || undefined,
        label: label || undefined,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Advanced search error:', message);
    return NextResponse.json({ error: 'Failed to search emails' }, { status: 500 });
  }
}
