import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  moveConversationToTrash,
  permanentlyDeleteConversation,
  restoreConversationFromTrash,
  findOwnedSentTwinsBatch,
  dedupeThreadForViewer,
} from '@/lib/mail/conversation';

// GET /api/emails/[id] - Get single email
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const email = await db.email.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        // NOTE: `replies` / `parentEmail` includes were removed on purpose.
        // The conversation is rendered from `thread` below (which always contains
        // the opened email), so `email.replies` was only a never-triggered
        // fallback (guarded with `|| []` on the client) and `parentEmail` was
        // unused - both duplicated full rows incl. heavy attachment columns.
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check if the email belongs to the current user
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;

    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // F-52: GET no longer mutates state. The old side-effect (auto
    // mark-as-read here) was the app's only state-changing GET — a residual
    // CSRF surface under the no-token, SameSite=Lax posture (a forced
    // top-level navigation could mark mail read). Clients mark read via the
    // explicit PUT { isRead: true } (the web detail view already does; the
    // Android notification actions always did).

    // Fetch full thread: find root threadId, then get all emails in that thread
    const threadId = email.threadId || email.id;
    const thread = await db.email.findMany({
      where: {
        AND: [
          {
            OR: [
              { threadId },
              { id: threadId },
            ],
          },
          {
            OR: [
              { senderId: session.userId },
              { recipientEmail: session.email },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    // Assemble the conversation from the VIEWER'S OWN copies. The thread
    // query returns every threadId-carrying copy of the conversation —
    // the viewer's received rows AND the other user's inbox copies of the
    // viewer's outgoing messages (matched via senderId). The old dedup
    // kept the FIRST copy per message, which is the recipient's inbox copy
    // (POST creates it before the sent copy) — so each side's conversation
    // view was built on the OTHER user's rows: deleting or permanently
    // deleting the conversation on one phone made messages vanish from the
    // thread on the other phone (owner report). For every foreign row, the
    // viewer's own sent twin (same POST wrote both copies) is pulled in,
    // and the dedup now prefers the viewer's copy per message — the thread
    // is built entirely from the viewer's mailbox, so the other user's
    // delete/undo can no longer change what it renders, and read-state no
    // longer leaks from another user's copy.
    const foreignRows = thread.filter((msg) => msg.recipientEmail !== session.email);
    // F-34: the twin resolution used to run up to 40 x (twin lookup + full
    // re-fetch) = up to 80 SEQUENTIAL queries per email open. The batch
    // helper answers every per-row twin match (same recipient, same body,
    // ±10s window, newest match, excluding the row itself — identical
    // semantics to the old per-row query) in ONE grouped query, and the
    // matched twins' full rows come back in a SECOND single query. The
    // assembled ownTwinRows keep the foreignRows order the old loop pushed.
    const twinByRowId = await findOwnedSentTwinsBatch(
      db as never,
      foreignRows,
      session.email,
      session.userId
    );
    const twinIds = [...new Set([...twinByRowId.values()].map((t) => t.id))];
    const twinFullRows = twinIds.length
      ? await db.email.findMany({
          where: { id: { in: twinIds } },
          include: {
            sender: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
            },
            recipient: {
              select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
            },
          },
        })
      : [];
    const twinFullById = new Map(twinFullRows.map((e) => [e.id, e]));
    const ownTwinRows: typeof thread = [];
    for (const msg of foreignRows) {
      const twin = twinByRowId.get(msg.id);
      if (!twin) continue;
      const full = twinFullById.get(twin.id);
      if (full) ownTwinRows.push(full);
    }
    const dedupedThread = dedupeThreadForViewer(
      [...thread, ...ownTwinRows],
      session.email,
      session.userId
    );

    // Chronological thread order (owner report 2026-11-22: a conversation
    // rendered its relative times as 23m / 1m / 26m / 3m mixed). Root cause:
    // the raw fetch is createdAt-asc, but the viewer's own sent twins are
    // resolved in a SEPARATE unordered query and appended to the array, and
    // dedupeThreadForViewer PRESERVES INPUT ORDER while preferring the
    // viewer's copy — so every outgoing message's kept row sat after all
    // incoming rows, in arbitrary twin-fetch order. Sort ONCE here, after
    // dedup: the detail view renders this array as-is (expanded and
    // collapsed messages share it, refresh re-renders it) and the
    // auto-expand "latest" pick reads thread[length-1], so this is the
    // single ordering point. Authoritative instant: sentAt — stamped
    // identically on every copy at delivery (null only until a scheduled
    // row dispatches), falling back to createdAt for legacy/external rows.
    // Equal timestamps resolve deterministically (createdAt, then id);
    // missing or unparseable values fall back safely instead of NaN.
    const orderKey = (m: { sentAt?: Date | string | null; createdAt?: Date | string | null }): number => {
      const sent = m.sentAt ? new Date(m.sentAt).getTime() : NaN;
      if (!Number.isNaN(sent)) return sent;
      const created = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
      return Number.isNaN(created) ? 0 : created;
    };
    dedupedThread.sort((a, b) => {
      const ta = orderKey(a);
      const tb = orderKey(b);
      if (ta !== tb) return ta - tb;
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
      if (ca !== cb) return (Number.isNaN(ca) ? 0 : ca) - (Number.isNaN(cb) ? 0 : cb);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // Strip inline base64 `data` from attachments in the response - keep
    // {name, url, size, type}. Every client consumer falls back to `url`
    // (/api/attachments serves the bytes with a 24h immutable cache).
    // Sending multi-MB data URLs here - duplicated again for the same email
    // inside `thread` - is what made opening emails slow.
    const slimAttachments = (raw: string | null): string | null => {
      if (!raw) return raw;
      try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return raw;
        return JSON.stringify(list.map(({ data: _drop, ...rest }) => rest));
      } catch {
        return raw;
      }
    };
    email.attachments = slimAttachments(email.attachments);
    const slimThread = dedupedThread.map((msg) => ({
      ...msg,
      attachments: slimAttachments(msg.attachments),
    }));

    // D2 (Batch 9): the caller's OWN labels on the opened row — chips and
    // the label menu in the detail view render from these. Scoped to the
    // session user exactly like the dedicated /api/emails/[id]/labels
    // endpoints, so pre-fix foreign rows are never surfaced.
    const myLabels = await db.emailLabel.findMany({
      where: { emailId: email.id, label: { userId: session.userId } },
      include: { label: { select: { id: true, name: true, color: true } } },
    });

    return NextResponse.json({
      email: {
        ...email,
        labels: myLabels.map((el) => el.label),
      },
      thread: slimThread,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Get email error:', message);
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
  }
}

// PUT /api/emails/[id] - Update email
export async function PUT(
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
    const { isRead, isStarred, isArchived, folder, restoreConversation } = body;

    // Find the email
    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized to update this email' }, { status: 403 });
    }

    // ─── Conversation-scoped restore (undo delete / Restore from Trash) ───
    // Undo used to be a single-row `PUT { folder }`: the clicked row went
    // back to the Inbox while its siblings stayed in Trash, so the
    // conversation existed in BOTH folders at once (owner report
    // 2026-11-11). The restore now resolves the same conversation member
    // set the delete moved and brings every trashed member back in ONE
    // transaction, each row to its own original folder (Inbox, or Sent for
    // the user's own sent copies). isArchived is cleared for inbox
    // visibility; isRead/isStarred are never touched here. Rows the user
    // has separately placed in spam/drafts (or already restored) are not
    // part of the trash-scoped restore set.
    if (restoreConversation === true) {
      const restoredIds = await db.$transaction((tx) =>
        restoreConversationFromTrash(tx, id, session.email, session.userId)
      );
      const updatedRow = await db.email.findUnique({
        where: { id },
        include: {
          sender: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
          },
        },
      });
      return NextResponse.json({
        email: updatedRow,
        restoredIds,
        restoredCount: restoredIds.length,
      });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (typeof isRead === 'boolean') {
      updateData.isRead = isRead;
      updateData.readAt = isRead ? new Date() : null;
    }
    if (typeof isStarred === 'boolean') {
      updateData.isStarred = isStarred;
    }
    if (typeof isArchived === 'boolean') {
      updateData.isArchived = isArchived;
    }
    if (folder && typeof folder === 'string') {
      const allowedFolders = ['inbox', 'sent', 'drafts', 'trash', 'spam'];
      updateData.folder = allowedFolders.includes(folder) ? folder : email.folder;
    }

    const updatedEmail = await db.email.update({
      where: { id },
      data: updateData,
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    // Archive follows the conversation: the list renders ONE row per
    // conversation (the newest message), so archiving only the clicked row
    // left the older messages unarchived in the inbox and the 15s poll
    // brought the conversation straight back (same class as the owner's
    // "delete comes back" report 2026-11-09). Scope: this user's own
    // received copies only — rows in other people's mailboxes and the
    // sender's sent copies (threadId=null, recipientEmail=other) are never
    // touched. isRead / isStarred stay per-message.
    if (typeof isArchived === 'boolean' && email.recipientEmail === session.email) {
      const threadKey = email.threadId || email.id;
      await db.email.updateMany({
        where: {
          recipientEmail: session.email,
          id: { not: id },
          OR: [{ threadId: threadKey }, { id: threadKey }],
        },
        data: { isArchived },
      });
    }

    return NextResponse.json({ email: updatedEmail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update email error:', message);
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }
}

// DELETE /api/emails/[id] - Move to trash (or permanently delete if already in trash)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    // Find the email
    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Check ownership
    const isSender = email.senderId === session.userId;
    const isRecipient = email.recipientEmail === session.email;
    if (!isSender && !isRecipient) {
      return NextResponse.json({ error: 'Not authorized to delete this email' }, { status: 403 });
    }

    // F-23: drafts are DISCARDED, not trashed. A draft row is owned by its
    // sender and often carries a REAL recipientEmail (the address being
    // composed to), which places it outside the caller's mailbox — the
    // conversation-scoped trash move below resolves members scoped to
    // recipientEmail=session.email, so it found no members and the draft
    // silently SURVIVED every delete (discarded drafts came back, and the
    // send-path draft cleanup left ghosts in Drafts). A discarded draft is
    // not trash material either — it never existed as mail. Sender-scoped
    // hard delete, mirroring how every mail client treats Discard.
    if (email.folder === 'drafts' && email.isDraft && isSender) {
      await db.email.delete({ where: { id } });
      return NextResponse.json({
        success: true,
        permanentlyDeleted: true,
        deletedIds: [id],
        deletedCount: 1,
      });
    }

    // The list renders ONE row per conversation (the newest message), so
    // "delete this email" means the conversation the user sees. Trashing
    // only the clicked row left the older messages in the inbox and the
    // 15s poll brought them straight back — the owner's "when I delete the
    // email it comes back like nothing happened" report 2026-11-09, and the
    // same reason bulk select-all + delete kept leaving stragglers behind.
    //
    // The conversation is resolved over EVERY relation the data model
    // carries (threadId equality, threadId↔id claims, parentEmailId chains,
    // cross-mailbox copy twins) — not just threadId equality. Legacy
    // conversations hold FORKED keys (replies once sent to a threadId=null
    // message stamped their own key), and the old threadKey-only match
    // left those members in the Inbox while the rest moved to Trash — the
    // conversation lived in BOTH folders and re-deleting the remnant
    // landed it in Trash as a second row (owner report 2026-11-11:
    // "trash shows the conversation separately"). Scope guards unchanged:
    // only this user's mailbox copies (recipientEmail = session.email) are
    // resolved; other people's mailboxes and sent copies addressed to
    // others are never touched — a sent copy collapses to the single row.

    // If already in trash, permanently delete — ONLY the copies that are
    // actually in trash right now. The folder='trash' scope inside the
    // helper guarantees live mail is never destroyed from here.
    if (email.folder === 'trash') {
      const deletedIds = await db.$transaction((tx) =>
        permanentlyDeleteConversation(tx, id, session.email, session.userId)
      );
      return NextResponse.json({
        success: true,
        permanentlyDeleted: true,
        deletedIds,
        deletedCount: deletedIds.length,
      });
    }

    // Otherwise, move to trash — the resolved conversation in ONE
    // transaction (live-folder members move; trash/spam/drafts rows keep
    // their placement, so trashing one message can never empty the spam
    // view or destroy drafts).
    const movedIds = await db.$transaction((tx) =>
      moveConversationToTrash(tx, id, session.email, session.userId)
    );

    const updatedEmail = await db.email.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true, bio: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      email: updatedEmail,
      movedIds,
      movedCount: movedIds.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete email error:', message);
    return NextResponse.json({ error: 'Failed to delete email' }, { status: 500 });
  }
}
