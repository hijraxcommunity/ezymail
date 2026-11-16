import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { getSession, checkRateLimitKey } from '@/lib/auth';
import { sanitizeAttachments } from '@/lib/attachment-sanitize';
import { sendPushNotification } from '@/lib/notifications/sendPushNotification';
import { buildConversationPage, resolveReplyThreadId } from '@/lib/mail/conversation';

// The conversation fold runs over the folder's WHOLE slim row set. Personal
// mailboxes sit far below this defensive cap; beyond it the oldest rows
// simply stop paginating (documented limitation, never a correctness risk —
// the cap only bounds how deep history pages can go).
const FOLD_SLIM_CAP = 5000;

// GET /api/emails - List emails
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const folder = searchParams.get('folder') || 'inbox';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search') || '';

    // Build where clause
    const where: Record<string, unknown> = {
      folder,
    };

    if (folder === 'sent') {
      where.senderId = session.userId;
    } else if (folder === 'drafts') {
      where.senderId = session.userId;
    } else {
      where.recipientEmail = session.email;
    }

    if (folder === 'starred') {
      delete where.folder;
      where.isStarred = true;
      where.recipientEmail = session.email;
    }

    if (folder === 'archive') {
      delete where.folder;
      where.isArchived = true;
      where.recipientEmail = session.email;
      // Rows already in Trash never belong in the Archive view: a trashed
      // row that kept isArchived=true (trash moves used not to clear it)
      // showed up here, and deleting it hit the DELETE route's trash
      // branch — a PERMANENT delete instead of "moves to Trash" (owner
      // report: "delete from Archive permanently deletes, does not go to
      // Trash"). Trash moves now also clear isArchived; the folder
      // exclusion covers existing rows without a migration.
      where.folder = { not: 'trash' };
    }

    // Archiving must actually hide mail from the inbox (the Archive view
    // lists isArchived rows). Without this exclusion the archived row kept
    // matching the inbox query and the 15s poll brought it straight back
    // after every archive — same class as the owner's "delete comes back"
    // report 2026-11-09. Scoped to the inbox exactly; starred/archive/
    // scheduled/snoozed branches above already replaced the where clause.
    if (folder === 'inbox') {
      where.isArchived = false;
    }

    if (folder === 'scheduled') {
      // F-03: the base clause set recipientEmail=session.email for this branch
      // (folder !== sent/drafts). ANDed with senderId below, the Scheduled
      // view could only ever show SELF-ADDRESSED mail — scheduling to a real
      // recipient left the view empty forever. Both copies of a scheduled
      // send carry senderId (the recipient's inbox copy lives in the
      // recipient's mailbox but is authored by the sender), so the view
      // pins folder='sent': exactly the sender's pending copy, never a
      // duplicate of the recipient's row.
      where.folder = 'sent';
      delete where.recipientEmail;
      where.senderId = session.userId;
      where.scheduledAt = { not: null };
      where.sentAt = null;
    }

    if (folder === 'snoozed') {
      delete where.folder;
      where.snoozedUntil = { not: null };
      where.OR = [
        { senderId: session.userId },
        { recipientEmail: session.email },
      ];
    }

    // Exclude snoozed emails from normal folders (unless viewing snoozed folder)
    if (folder !== 'snoozed') {
      where.snoozedUntil = null;
    }

    // Note: Replies (emails with parentEmailId) are now shown in the inbox list
    // so recipients can see them. They also appear inside the thread view
    // when opening the parent email.

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { sender: { firstName: { contains: search, mode: 'insensitive' } } },
        { sender: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // F-03: a scheduled email's INBOX copy is created immediately (folder=
    // 'inbox', sentAt=null, scheduledAt=<future>), and the inbox query had
    // NO scheduled filter — the recipient saw the mail before its send time
    // (owner-facing harm: mail arrives EARLY). Not-yet-dispatched mail is
    // now invisible to the recipient: only rows without a schedule, or whose
    // schedule has already passed, are listed. The dispatch cron flips
    // sentAt exactly when due; visibility here does not depend on it (a
    // due-but-not-yet-dispatched row is still shown, matching the audit
    // fix's "exclude scheduledAt-future rows" contract).
    if (folder === 'inbox') {
      const dueOr: Array<Record<string, unknown>> = [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ];
      if (where.OR) {
        // Merge with the search OR-group without losing either condition.
        where.AND = [{ OR: where.OR }, { OR: dueOr }];
        delete where.OR;
      } else {
        where.OR = dueOr;
      }
    }

    // ─── Conversation-level pagination ───
    // The old flow paged MESSAGES (skip/take on rows), then folded each
    // page separately: a conversation whose members straddled a page
    // boundary was split across two pages — two rows, two different counts,
    // and a message could appear as a hidden member on one page and as its
    // own row on the next. The fold now runs over the folder's WHOLE slim
    // row set (id + threadId + parentEmailId + createdAt only), and pages
    // are cut in CONVERSATION units: every page holds whole conversations,
    // counts are exact and stable across pages, and `total` drives the
    // client's has-more gate in conversation terms. Unchanged architecture:
    // same where-clause per folder, same full-row fetch for the page's
    // representatives, same response shape.
    const slimRows = await db.email.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: FOLD_SLIM_CAP,
      select: { id: true, threadId: true, parentEmailId: true, createdAt: true },
    });

    const { pageRepresentatives, hiddenCount, totalConversations } =
      buildConversationPage(slimRows, page, limit);

    const total = totalConversations;

    const repIds = pageRepresentatives.map((r) => r.id);
    const fullRows = repIds.length
      ? await db.email.findMany({
          where: { ...where, id: { in: repIds } },
          // Explicit select: the list must NOT fetch the heavy `attachments` column
          // (base64 data URLs, up to several MB per email). Pulling it on every
          // folder switch made navigation slow once real attachment emails exist.
          // The list response never included it; the detail endpoint still does.
          select: {
            id: true,
            senderId: true,
            recipientEmail: true,
            subject: true,
            body: true,
            bodyHtml: true,
            isRead: true,
            isStarred: true,
            isArchived: true,
            folder: true,
            parentEmailId: true,
            threadId: true,
            readAt: true,
            snoozedUntil: true,
            scheduledAt: true,
            sentAt: true,
            priority: true,
            createdAt: true,
            sender: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
            },
            recipient: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
            },
            replies: {
              select: { id: true },
            },
          },
        })
      : [];

    // Restore the exact conversation order the fold produced (the full-row
    // fetch returns raw createdAt order).
    const fullById = new Map(fullRows.map((e) => [e.id, e]));
    const representatives = pageRepresentatives
      .map((r) => fullById.get(r.id))
      .filter((e): e is (typeof fullRows)[number] => e !== undefined);

    // One row per conversation — the fold lives in
    // src/lib/mail/conversation.ts (shared with the lifecycle primitives so
    // the list, delete, undo and restore all reason over the SAME grouping
    // rules): equal threadId, parentEmailId chains, and the legacy
    // key-claim. `hiddenCount` now covers the WHOLE folder (the fold ran
    // over the folder's entire slim row set), so counts stay exact no
    // matter which page a conversation lands on.
    const threadCounts = hiddenCount;

    const formattedEmails = representatives.map((email) => ({
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
      threadId: email.threadId,
      readAt: email.readAt,
      snoozedUntil: email.snoozedUntil,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      priority: email.priority,
      createdAt: email.createdAt,
      sender: email.sender,
      recipient: email.recipient,
      // The conversation badge = every message of this conversation the
       // user can see in this folder (the visible row + the members folded
       // under it). The old value (the row's direct children) was almost
       // always 0 for the newest-row representative, so grouped
       // conversations showed no count at all.
      replyCount: (threadCounts[email.threadId || email.id] || 0) + 1,
      threadCount: (threadCounts[email.threadId || email.id] || 0) + 1,
    }));

    return NextResponse.json({
      emails: formattedEmails,
      total,
      page,
      limit,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List emails error:', message);
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}

// POST /api/emails - Send an email
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // F-32: per-user send throttle (env-overridable for tests/ops). Default
    // 30 sends / 15 min is far above normal usage while blocking mailbox
    // spam floods. Residual: in-memory per-instance — see auth.ts note.
    const SEND_RATE_LIMIT_MAX = Number(process.env.SEND_RATE_LIMIT_MAX) || 30;
    const sendAllowed = await checkRateLimitKey(
      `send:${session.userId}`,
      SEND_RATE_LIMIT_MAX,
      15 * 60 * 1000
    );
    if (!sendAllowed) {
      return NextResponse.json(
        { error: 'You are sending emails too quickly. Please wait a few minutes.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { to, cc, bcc, subject, body: emailBody, bodyHtml, replyToId, attachments, scheduledAt, priority, senderFcmToken } = body;

    // Validate fields
    if (!to || !String(to).trim()) {
      return NextResponse.json({ error: 'Recipient is required' }, { status: 400 });
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (!emailBody || !emailBody.trim()) {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
    }

    // F-01: the compose UI accumulates TO/CC/BCC chips into comma-joined
    // strings; the API used to treat the WHOLE string as one address, so
    // every multi-recipient send failed with 404 "Recipient not found" and
    // nothing was delivered. Split on commas/semicolons/whitespace,
    // normalize, and dedupe with a fixed precedence (to > cc > bcc): the
    // same address listed in two roles is delivered exactly once, in the
    // most visible role.
    const parseAddressList = (input: unknown): string[] => {
      if (typeof input !== 'string') return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of input.split(/[,;\s]+/)) {
        const addr = raw.trim().toLowerCase();
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        out.push(addr);
      }
      return out;
    };
    const toList = parseAddressList(to);
    const ccList = parseAddressList(cc).filter((a) => !toList.includes(a));
    const bccList = parseAddressList(bcc).filter(
      (a) => !toList.includes(a) && !ccList.includes(a)
    );

    if (toList.length === 0) {
      return NextResponse.json({ error: 'Recipient is required' }, { status: 400 });
    }

    // Bound the fan-out: the send is one transaction with one row per
    // recipient plus per-recipient notifications. 50 delivered copies is
    // far above any normal personal use while keeping the write bounded.
    const MAX_RECIPIENTS = 50;
    if (toList.length + ccList.length + bccList.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients. Up to ${MAX_RECIPIENTS} addresses can be delivered per email.` },
        { status: 400 }
      );
    }

    const allAddresses = [...toList, ...ccList, ...bccList];

    // Validate every address (F-01 applies the single-recipient rule to all).
    for (const addr of allAddresses) {
      if (!addr.endsWith('@ezy.af')) {
        return NextResponse.json(
          { error: 'EzyMail only supports sending to @ezy.af addresses' },
          { status: 400 }
        );
      }
    }

    // Resolve EVERY recipient up front: a send naming a missing or suspended
    // recipient fails before a single row is written (previously only the
    // one modeled recipient was checked).
    const recipientUsers = await db.user.findMany({
      where: { email: { in: allAddresses } },
      select: { id: true, email: true, status: true },
    });
    const userByEmail = new Map(recipientUsers.map((u) => [u.email, u]));
    const missingRecipient = allAddresses.find((addr) => !userByEmail.has(addr));
    if (missingRecipient) {
      return NextResponse.json(
        { error: `Recipient not found: ${missingRecipient}` },
        { status: 404 }
      );
    }
    const suspendedRecipient = allAddresses.find(
      (addr) => userByEmail.get(addr)?.status === 'suspended'
    );
    if (suspendedRecipient) {
      return NextResponse.json(
        { error: 'Cannot send email to a suspended account' },
        { status: 400 }
      );
    }

    // F-04: attachments are validated and rebuilt server-side — the client
    // array is never stored verbatim. Names are charset-restricted, URLs are
    // regenerated from the owner id + fresh UUID, data must be a strict
    // base64 data URL within the upload size limits, and active-content MIME
    // types (html/xhtml/svg) are rejected. On any violation the send fails
    // with 400 instead of persisting attacker-controlled metadata.
    const sanitized = sanitizeAttachments(attachments, session.userId);
    if (!sanitized.ok) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    const attachmentsJson = sanitized.value.length > 0
      ? JSON.stringify(sanitized.value)
      : null;

    const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
    const emailPriority = (priority === 'high' || priority === 'low') ? priority : 'normal';

    // F-02: cc/bcc persist on the rows (the columns already existed for
    // drafts). Visibility follows standard mail semantics:
    //  - To/CC copies carry the CC header, never the BCC list.
    //  - BCC copies carry the CC header but never the other BCC addresses.
    //  - Only the sender's SENT copy records the full BCC list.
    const ccHeader = ccList.length ? ccList.join(', ') : null;
    const bccHeaderPrivate = bccList.length ? bccList.join(', ') : null;

    const sentAtValue = isScheduled ? null : new Date();
    const scheduledAtValue = isScheduled ? new Date(scheduledAt) : null;

    // F-22 + F-01: the whole delivery is ONE transaction — every
    // per-recipient inbox copy, the threadId stamp and the sender's sent
    // copy commit together or not at all. The writes used to be three
    // independent statements, so a failure mid-send left a recipient copy
    // without its sent twin (or a reply without its sent copy) — a state
    // the conversation fold cannot pair.
    const { primaryInbox, inboxCopyIds } = await db.$transaction(async (tx) => {
      // Reply: inherit the parent's thread key via the shared resolution
      // (src/lib/mail/conversation.ts) — parent's threadId, else the
      // parentEmailId chain, else — when the parent is a SENT COPY (no
      // threadId, no parent chain by design) — the parent's inbox twin.
      // Resolved ONCE so every delivered copy shares the key and replies
      // from any recipient fold into the same conversation.
      let threadId: string | null = null;
      if (replyToId) {
        const parentEmail = await tx.email.findUnique({
          where: { id: replyToId },
          select: {
            id: true,
            threadId: true,
            parentEmailId: true,
            senderId: true,
            recipientEmail: true,
            body: true,
            createdAt: true,
            folder: true,
          },
        });
        threadId = parentEmail ? await resolveReplyThreadId(tx, parentEmail) : replyToId;
      }

      const baseRow = {
        senderId: session.userId,
        subject: subject.trim(),
        body: emailBody.trim(),
        bodyHtml: bodyHtml || '',
        attachments: attachmentsJson,
        parentEmailId: replyToId || null,
        sentAt: sentAtValue,
        scheduledAt: scheduledAtValue,
        priority: emailPriority,
      };
      const inboxInclude = {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      };

      // First TO recipient's copy anchors the thread for new mail; its id
      // becomes the shared key (same rule as before, unchanged).
      const first = await tx.email.create({
        data: { ...baseRow, recipientEmail: toList[0], cc: ccHeader, folder: 'inbox' },
        include: inboxInclude,
      });
      if (!threadId) threadId = first.id;
      await tx.email.update({ where: { id: first.id }, data: { threadId } });
      const copyIds: string[] = [first.id];

      // Remaining recipients each get their OWN inbox copy (one delivery
      // per recipient) with the shared thread key stamped directly.
      const restRecipients = [...toList.slice(1), ...ccList, ...bccList];
      for (const addr of restRecipients) {
        const row = await tx.email.create({
          data: { ...baseRow, recipientEmail: addr, cc: ccHeader, folder: 'inbox', threadId },
        });
        copyIds.push(row.id);
      }

      // Sender's sent copy — single row, full CC + private BCC record,
      // outside the reply thread by design (no parentEmailId/threadId).
      await tx.email.create({
        data: {
          ...baseRow,
          recipientEmail: toList[0],
          cc: ccHeader,
          bcc: bccHeaderPrivate,
          folder: 'sent',
        },
      });

      return { primaryInbox: first, inboxCopyIds: copyIds };
    });
    const inboxEmail = primaryInbox;

    // Push notifications for EVERY delivered recipient (after response —
    // guaranteed to run on serverless; a bare fire-and-forget promise can be
    // frozen/dropped). inboxCopyIds is aligned with allAddresses order, so
    // each recipient's notification deep-links to THEIR OWN copy.
    if (!isScheduled) {
      const sender = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      });
      const senderName = sender
        ? `${sender.firstName} ${sender.lastName}`
        : 'Someone';
      // Gmail-style notification preview: collapsed body text (~200 chars)
      const preview =
        emailBody.trim().replace(/\s+/g, ' ').slice(0, 200) || undefined;
      // Avatar as a compact remote URL, never inline Base64. The DB stores
      // the avatar as a data URL — that would blow FCM's 4096-byte limit, so
      // safeAvatarUrl() would drop it and the notification showed only the
      // letter-avatar fallback (owner report: "only letter inside avatar").
      // Serving the same bytes from the short /api/user/avatar/<id> URL keeps
      // the real sender image AND the payload small (remote URLs survive the
      // size guard up to 512 chars).
      const APP_BASE_URL = 'https://ezymail.vercel.app';
      const avatarUrl = sender?.avatar?.startsWith('http')
        ? sender.avatar
        : sender?.avatar?.startsWith('data:')
          ? `${APP_BASE_URL}/api/user/avatar/${sender.id}`
          : undefined;

      allAddresses.forEach((addr, i) => {
        const recipientUser = userByEmail.get(addr);
        const copyId = inboxCopyIds[i];
        if (!recipientUser || !copyId) return;
        after(() =>
          sendPushNotification({
            recipientUserId: recipientUser.id,
            senderName,
            subject: subject.trim(),
            emailId: copyId,
            senderEmail: sender?.email,
            avatarUrl,
            preview,
            // The SENDING device never rings for its own outgoing mail — even
            // when a stale token row still binds this device to the recipient's
            // account (the "notification comes back to A" wrong-device bug).
            skipFcmToken:
              typeof senderFcmToken === 'string' && senderFcmToken.length >= 32
                ? senderFcmToken
                : undefined,
          }).catch(() => {})
        );
      });
    }

    return NextResponse.json(
      {
        success: true,
        email: inboxEmail,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Send email error:', message);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
