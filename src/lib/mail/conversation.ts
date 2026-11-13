/**
 * Conversation lifecycle primitives — the single source of truth for how a
 * conversation is resolved, moved to Trash, restored, and permanently
 * deleted for ONE user's mailbox.
 *
 * WHY THIS EXISTS (owner report 2026-11-11, production data-integrity):
 *
 * The list renders ONE row per conversation, so "delete this email" must
 * move the WHOLE conversation. The previous DELETE only matched rows whose
 * `threadId` equals the clicked row's thread key — but legacy conversations
 * can carry FORKED keys: every reply once sent to a threadId=null message
 * (a legacy root or a SENT COPY) stamped its own key (threadId =
 * replyToId), so one visually-single conversation could hold several
 * different threadIds. Those forked members were never matched, stayed in
 * the Inbox while the rest moved to Trash, and the user ended up with the
 * conversation in BOTH folders — then re-deleting the remnant landed it in
 * Trash as a SECOND row ("trash shows the conversation separately").
 *
 * The same fork problem breaks Undo: undo/restore used a single-row
 * `PUT { folder }`, which restored only the clicked row and left its
 * siblings in Trash — the conversation existed in Inbox AND Trash at once.
 *
 * FIX: resolve the complete member set for the user's mailbox with a
 * bounded fixpoint over ALL the relations the schema actually carries
 * (threadId equality, threadId↔id claims, parentEmailId chains both ways,
 * and cross-mailbox copy twins for references that point at a row living
 * in another user's mailbox), then perform the move/restore/delete as ONE
 * transaction scoped to that explicit id set. Every operation is scoped to
 * `recipientEmail = userEmail` — other users' mailbox copies are never
 * touched.
 */

/** Loose transaction-client shape so tests can run against a separate
 *  generated client (SQLite harness) and routes can pass the real Prisma
 *  client or an interactive-transaction client without type friction. */
export interface MailTx {
  email: {
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface MemberRow {
  id: string;
  senderId: string;
  recipientEmail: string;
  folder: string;
  threadId: string | null;
  parentEmailId: string | null;
  isRead: boolean;
  isArchived: boolean;
  body: string;
  createdAt: Date;
}

const MEMBER_SELECT = {
  id: true,
  senderId: true,
  recipientEmail: true,
  folder: true,
  threadId: true,
  parentEmailId: true,
  isRead: true,
  isArchived: true,
  body: true,
  createdAt: true,
} as const;

const REF_FIELDS = { id: true, senderId: true, recipientEmail: true, body: true, createdAt: true, threadId: true, parentEmailId: true, folder: true } as const;

interface RefRow {
  id: string;
  senderId: string;
  recipientEmail: string;
  body: string | null;
  createdAt: Date;
  threadId: string | null;
  parentEmailId: string | null;
  folder: string;
}

const asRows = (v: unknown): MemberRow[] => v as MemberRow[];
const asRow = (v: unknown): MemberRow | null => (v as MemberRow) ?? null;
const asRef = (v: unknown): RefRow | null => (v as RefRow) ?? null;

/**
 * The inbox copy ("twin") of a sent-copy row: same sender, same recipient,
 * same exact body (both copies are written by the same POST with the same
 * trimmed body string — the same identity rule the thread-view dedup uses,
 * which buckets same-body-same-sender within 5s), created within ±10s.
 * Sent copies carry no parentEmailId/threadId by design, so the twin is the
 * only bridge from a sent-copy reference back into the recipient's thread.
 */
async function findInboxTwin(tx: MailTx, row: RefRow, userEmail: string): Promise<MemberRow | null> {
  const created = new Date(row.createdAt);
  const from = new Date(created.getTime() - 10_000);
  const to = new Date(created.getTime() + 10_000);
  const found = await tx.email.findMany({
    where: {
      // A twin is the OTHER copy of the same message — never the row itself.
      id: { not: row.id },
      senderId: row.senderId,
      recipientEmail: userEmail,
      folder: 'inbox',
      body: row.body ?? '',
      createdAt: { gte: from, lte: to },
    },
    select: MEMBER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return asRows(found)[0] ?? null;
}

/**
 * Resolve EVERY row of `userEmail`'s mailbox that belongs to the same
 * conversation as the anchor row. The anchor itself is always included
 * (even when it lives in the sent folder — a sent copy collapses to the
 * single row, exactly as before). Bounded fixpoint; conversations are
 * small so this converges in one or two passes.
 */
export async function resolveConversationMembers(
  tx: MailTx,
  anchorId: string,
  userEmail: string,
  userId: string
): Promise<MemberRow[]> {
  const anchor = asRow(await tx.email.findUnique({ where: { id: anchorId }, select: MEMBER_SELECT }));
  if (!anchor) return [];

  const members = new Map<string, MemberRow>();
  const add = (row: MemberRow) => members.set(row.id, row);
  add(anchor);

  // References seen so far that point OUTSIDE the mailbox — each needs one
  // twin lookup to bridge into the user's copy of that thread.
  const pendingRefs = new Set<string>();
  // Out-of-mailbox row ids whose inbox twin IS a member (e.g. a sent copy
  // the user's forked replies were anchored on). Any mailbox row referencing
  // such an id belongs to the conversation even though the referenced row
  // itself lives in another user's mailbox.
  const virtualKeys = new Set<string>();

  for (let pass = 0; pass < 8; pass++) {
    const ids = [...members.keys()];
    const threadIds = new Set<string>();
    const parentIds = new Set<string>();
    for (const m of members.values()) {
      if (m.threadId) threadIds.add(m.threadId);
      if (m.parentEmailId) parentIds.add(m.parentEmailId);
    }

    const found = asRows(
      await tx.email.findMany({
        where: {
          recipientEmail: userEmail,
          id: { notIn: ids },
          AND: [
            // The mailbox scope: this user's RECEIVED copies in any folder,
            // plus their own sent copies (self-addressed mail). Sent copies
            // OTHER users addressed to this user also carry
            // recipientEmail=userEmail but live in the SENDER's Sent folder —
            // they must never move because this user deleted their copy.
            {
              OR: [{ folder: { not: 'sent' } }, { senderId: userId }],
            },
            {
              OR: [
                { threadId: { in: [...threadIds] } },        // same thread key
                { threadId: { in: ids } },                   // reply keyed to a member id
                { id: { in: [...threadIds] } },              // root claimed by a member's key
                { parentEmailId: { in: ids } },              // child chain
                { id: { in: [...parentIds] } },              // parent chain
                { threadId: { in: [...virtualKeys] } },      // forked key → bridged sent copy
                { parentEmailId: { in: [...virtualKeys] } }, // forked parent → bridged sent copy
              ],
            },
          ],
        },
        select: MEMBER_SELECT,
      })
    );
    found.forEach(add);

    // References that point at rows not (yet) in the member set: if the
    // referenced row lives in ANOTHER mailbox (a sent copy), bridge through
    // its inbox twin; once the twin is a member the referenced id becomes a
    // virtual key that pulls in every forked row anchored on it.
    for (const m of members.values()) {
      if (m.threadId && !members.has(m.threadId) && !virtualKeys.has(m.threadId)) pendingRefs.add(m.threadId);
      if (m.parentEmailId && !members.has(m.parentEmailId) && !virtualKeys.has(m.parentEmailId)) pendingRefs.add(m.parentEmailId);
    }
    let progressed = found.length;
    for (const refId of [...pendingRefs]) {
      pendingRefs.delete(refId);
      if (members.has(refId) || virtualKeys.has(refId)) continue;
      const ref = asRef(await tx.email.findUnique({ where: { id: refId }, select: REF_FIELDS }));
      if (!ref) continue;
      const twin = await findInboxTwin(tx, ref, userEmail);
      if (!twin) continue;
      if (members.has(twin.id)) {
        virtualKeys.add(refId);
        progressed++;
      } else {
        add(twin);
        progressed++;
      }
    }

    if (progressed === 0) break;
  }

  // MAILBOX SCOPE — the hard boundary for every lifecycle operation built
  // on this member set. Resolution always includes the ANCHOR row, and the
  // endpoints' ownership check admits rows where the caller is the SENDER
  // — which is the recipient's inbox copy of their own outgoing message
  // (senderId=caller, recipientEmail=other), the very row the thread view
  // hands back as that message's representative. Without this filter,
  // deleting/undoing anchored on such an id moved or destroyed ANOTHER
  // USER'S row (owner report: deleting a conversation on one phone made
  // the messages vanish from the other user's mobile). The caller's
  // mailbox is exactly: their received copies (recipientEmail=userEmail,
  // any folder except sent) plus their OWN sent copies (senderId=userId,
  // folder='sent') — a sent copy still collapses to the single row, and a
  // foreign anchor only seeds the resolution without ever entering the
  // returned set.
  return [...members.values()].filter(
    (m) =>
      (m.recipientEmail === userEmail && m.folder !== 'sent') ||
      (m.senderId === userId && m.folder === 'sent')
  );
}

/** Folders a conversation move must never touch. */
const MOVE_EXCLUDED = new Set(['trash', 'spam', 'drafts']);

/**
 * Move the anchor's whole conversation to Trash — this user's mailbox
 * copies that still sit in a live folder. Rows already in trash/spam/drafts
 * keep their placement (preserved behavior: trashing one message can never
 * empty the spam view or destroy drafts); the anchor always moves.
 * Returns the ids that were moved.
 */
export async function moveConversationToTrash(
  tx: MailTx,
  anchorId: string,
  userEmail: string,
  userId: string
): Promise<string[]> {
  const members = await resolveConversationMembers(tx, anchorId, userEmail, userId);
  const moveIds = members
    .filter((m) => m.id === anchorId || !MOVE_EXCLUDED.has(m.folder))
    .map((m) => m.id);
  if (moveIds.length === 0) return [];
  await tx.email.updateMany({
    where: { id: { in: moveIds } },
    // isArchived cleared with the move: the Archive view lists isArchived
    // rows regardless of folder, so a trashed row that kept the flag kept
    // showing in Archive — and deleting it there hit the trash branch and
    // permanently deleted instead of going to Trash (owner report:
    // "delete from Archive permanently deletes, does not go to Trash").
    // Symmetric with restore, which also clears the flag.
    //
    // snoozedUntil cleared with the move (owner report 2026-11-13: "when I
    // delete the Spam page email it does not go to Trash"): EVERY folder
    // view except Snoozed filters snoozedUntil=null — including Trash — and
    // the snooze endpoint stamps the anchor wherever it lives (the detail
    // three-dot menu offers Snooze from the Spam page too, and rows are
    // deleted from the Snoozed page as well). A snoozed row moved to Trash
    // kept the flag and the trash query filtered it out: the mail WAS in
    // Trash but invisible in the Trash view — the deleted mail looked like
    // it never arrived. Deleting a snoozed email ends the snooze.
    data: { folder: 'trash', isArchived: false, snoozedUntil: null },
  });
  return moveIds;
}

/**
 * Permanently delete the anchor's conversation — ONLY the copies that are
 * actually in Trash right now. The folder='trash' scope is the hard guard
 * that live mail can never be destroyed from here, and rows the user
 * already restored (or moved to spam/drafts) are never touched.
 */
export async function permanentlyDeleteConversation(
  tx: MailTx,
  anchorId: string,
  userEmail: string,
  userId: string
): Promise<string[]> {
  const members = await resolveConversationMembers(tx, anchorId, userEmail, userId);
  const deleteIds = members.filter((m) => m.folder === 'trash').map((m) => m.id);
  if (deleteIds.length === 0) return [];
  await tx.email.deleteMany({ where: { id: { in: deleteIds }, folder: 'trash' } });
  return deleteIds;
}

/**
 * Where a trashed row goes back when the conversation is restored. Sent
 * copies (never stamped with threadId/parentEmailId, authored by this
 * user) return to Sent; every received copy returns to Inbox. Rows the
 * user has separately placed elsewhere (spam/drafts/already restored) are
 * not part of the restore set — the trash scope guarantees that.
 */
export function inferRestoreFolder(row: MemberRow, userId: string): 'inbox' | 'sent' {
  return row.senderId === userId && !row.threadId && !row.parentEmailId ? 'sent' : 'inbox';
}

/**
 * Undo-delete / Restore-from-Trash: bring the anchor's whole conversation
 * back out of Trash in one transaction. Each restored row goes to its own
 * original folder (inbox, or sent for the user's own sent copies) with
 * isArchived cleared — required for inbox visibility and the restore
 * behavior this app has always had. snoozedUntil is cleared with the same
 * visibility argument (a restored mail must be visible in the folder it
 * returns to; the inbox/sent views filter snoozedUntil=null, and a snooze
 * does not survive a delete+restore round-trip). Read/unread state is
 * untouched. Returns the ids that were restored.
 */
export async function restoreConversationFromTrash(
  tx: MailTx,
  anchorId: string,
  userEmail: string,
  userId: string
): Promise<string[]> {
  const members = await resolveConversationMembers(tx, anchorId, userEmail, userId);
  const trashed = members.filter((m) => m.folder === 'trash');
  if (trashed.length === 0) return [];
  for (const row of trashed) {
    await tx.email.updateMany({
      where: { id: row.id, folder: 'trash' },
      data: { folder: inferRestoreFolder(row, userId), isArchived: false, snoozedUntil: null },
    });
  }
  return trashed.map((m) => m.id);
}

// ─── List grouping: one row per conversation ────────────────────────────────

export interface GroupableRow {
  id: string;
  threadId: string | null;
  parentEmailId: string | null;
}

/**
 * Pure fold used by the list endpoints: collapse page rows into ONE row per
 * conversation, newest row represents the group. Groups form through
 *   1. equal non-null threadId,
 *   2. parentEmailId chains (parent on the same page),
 *   3. key-claim: a threadId=null row whose own id is another page row's
 *      threadId (the legacy-root rule — now part of the fold).
 * `hiddenCount[key]` counts the group members hidden under each
 * representative (key = rep.threadId || rep.id) so the UI can render
 * correct conversation message counts.
 */
export function groupRowsForList<T extends GroupableRow>(
  rows: T[]
): { representatives: T[]; hiddenCount: Record<string, number> } {
  const n = rows.length;
  const parentOf = new Array<number>(n);
  for (let i = 0; i < n; i++) parentOf[i] = i;
  const find = (x: number): number => {
    let root = x;
    while (parentOf[root] !== root) root = parentOf[root];
    while (parentOf[x] !== root) {
      const next = parentOf[x];
      parentOf[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    // Rows arrive newest-first: root each group at the newest member.
    if (ra < rb) parentOf[rb] = ra;
    else parentOf[ra] = rb;
  };

  const keyIndex = new Map<string, number>();
  rows.forEach((e, i) => {
    if (!e.threadId) return;
    const first = keyIndex.get(e.threadId);
    if (first === undefined) keyIndex.set(e.threadId, i);
    else union(first, i);
  });
  // id -> row index for the parent-chain lookups (O(1) instead of the old
  // O(n) findIndex inside an O(n) pass — the folder-wide fold now runs over
  // thousands of rows per request).
  const indexById = new Map<string, number>();
  rows.forEach((e, i) => indexById.set(e.id, i));
  rows.forEach((e, i) => {
    if (e.parentEmailId) {
      const p = indexById.get(e.parentEmailId);
      if (p !== undefined) union(p, i);
    }
    // Legacy null-key root claimed by a reply's threadId.
    if (!e.threadId) {
      const claimer = keyIndex.get(e.id);
      if (claimer !== undefined && claimer !== i) union(claimer, i);
    }
  });

  const seenGroups = new Set<number>();
  const representatives: T[] = [];
  const hiddenCount: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (seenGroups.has(root)) {
      const rep = rows[root];
      const key = rep.threadId || rep.id;
      hiddenCount[key] = (hiddenCount[key] || 0) + 1;
      continue;
    }
    seenGroups.add(root);
    representatives.push(rows[i]);
  }
  return { representatives, hiddenCount };
}

/**
 * Shared thread-key resolution for BOTH reply paths (POST /api/emails and
 * POST /api/emails/[id]/reply): inherit the parent's threadId, else walk
 * the parentEmailId chain, else — when the parent is a SENT COPY (no
 * threadId, no parent chain, by design) — bridge through the parent's
 * inbox twin so a reply sent from the Sent folder joins the SAME
 * conversation instead of forking a fresh key. The last-resort fallback is
 * the parent's own id, exactly as before.
 */
export async function resolveReplyThreadId(
  tx: MailTx,
  parent: { id: string; threadId: string | null; parentEmailId: string | null; senderId: string; recipientEmail: string; body: string | null; createdAt: Date; folder?: string },
  visited: Set<string> = new Set()
): Promise<string> {
  if (parent.threadId) return parent.threadId;
  // Cycle guard: pathological duplicate copies (identical body, both
  // threadId=null) must terminate at the plain fallback, not recurse.
  if (visited.has(parent.id)) return parent.id;
  visited.add(parent.id);

  // Walk the parentEmailId chain first (legacy roots / mid-thread rows).
  let rootId = parent.id;
  let walkId = parent.parentEmailId;
  let hops = 0;
  while (walkId && hops < 50) {
    const ancestor = (await tx.email.findUnique({
      where: { id: walkId },
      select: { id: true, threadId: true, parentEmailId: true },
    })) as { id: string; threadId: string | null; parentEmailId: string | null } | null;
    if (!ancestor) break;
    rootId = ancestor.id;
    if (ancestor.threadId) return ancestor.threadId;
    walkId = ancestor.parentEmailId;
    hops++;
  }

  // The parent carries no chain (a sent copy): bridge through its inbox
  // twin — the recipient's copy of the same message, which does belong to
  // the real thread.
  if (!parent.parentEmailId) {
    const twin = await findInboxTwin(tx, {
      id: parent.id,
      senderId: parent.senderId,
      recipientEmail: parent.recipientEmail,
      body: parent.body,
      createdAt: parent.createdAt,
      threadId: parent.threadId,
      parentEmailId: parent.parentEmailId,
      folder: parent.folder ?? 'sent',
    }, parent.recipientEmail);
    if (twin && !visited.has(twin.id)) {
      if (twin.threadId) return twin.threadId;
      // Legacy twin (null key): resolve through its own chain/root.
      return resolveReplyThreadId(tx, twin, visited);
    }
  }

  return rootId;
}

// ─── Conversation-level pagination ──────────────────────────────────────────

export interface SlimRow extends GroupableRow {
  createdAt: Date | string;
}

/**
 * Conversation-level page builder (owner task 2026-11-11, follow-up audit).
 *
 * The list used to page MESSAGES: a conversation whose members straddled a
 * page boundary was split — each page folded only the members it happened
 * to carry, so the same conversation could render as two rows on two pages
 * with two different message counts. This builder folds the folder's WHOLE
 * slim row set (id + threadId + parentEmailId + createdAt — a few bytes per
 * row) FIRST, then slices the resulting conversation list. Every page holds
 * whole conversations only, hidden counts are exact and stable across
 * pages, and `totalConversations` drives the client's has-more gate in
 * conversation terms.
 */
export function buildConversationPage<T extends SlimRow>(
  rows: T[],
  page: number,
  limit: number
): {
  pageRepresentatives: T[];
  hiddenCount: Record<string, number>;
  totalConversations: number;
} {
  const { representatives, hiddenCount } = groupRowsForList(rows);
  const start = (Math.max(1, page) - 1) * limit;
  return {
    pageRepresentatives: representatives.slice(start, start + limit),
    hiddenCount,
    totalConversations: representatives.length,
  };
}

/**
 * The viewer's OWN copy of a message whose fetched thread row lives in
 * another mailbox. Every send creates TWO rows — the recipient's inbox copy
 * (created first, carries the threadId) and the sender's sent copy (created
 * second, carries no key by design) — so a thread row with
 * recipientEmail != viewer is the other user's inbox copy of the viewer's
 * outgoing message, and the viewer's own copy is the sent twin: same
 * sender (the viewer), same addressee, same exact body, written by the
 * same POST within ±10s. Returns null when the row is already the
 * viewer's or no twin exists (legacy rows predating the twin creation
 * order, permanently-deleted copies).
 */
export async function findOwnedSentTwin(
  tx: MailTx,
  row: { id: string; senderId: string; recipientEmail: string; body: string | null; createdAt: Date },
  userEmail: string,
  userId: string
): Promise<MemberRow | null> {
  if (row.recipientEmail === userEmail) return null;
  const created = new Date(row.createdAt);
  const found = await tx.email.findMany({
    where: {
      id: { not: row.id },
      senderId: userId,
      recipientEmail: row.recipientEmail,
      folder: 'sent',
      body: row.body ?? '',
      createdAt: {
        gte: new Date(created.getTime() - 10_000),
        lte: new Date(created.getTime() + 10_000),
      },
    },
    select: MEMBER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return asRows(found)[0] ?? null;
}

export interface ThreadCopyRow {
  id: string;
  senderId: string;
  recipientEmail: string;
  folder: string;
  body: string | null;
  createdAt: Date | string;
}

/**
 * Conversation-view dedup with VIEWER-COPY PREFERENCE. The thread endpoint
 * fetches every threadId-carrying copy of the conversation — which spans
 * BOTH mailboxes: the viewer's own received copies AND the other user's
 * inbox copies of the viewer's outgoing messages. The old dedup kept the
 * first copy per message (the recipient's inbox copy — POST creates it
 * before the sent copy), so each side's conversation view was built on the
 * OTHER user's rows: when the other user deleted or permanently deleted
 * their copies, messages vanished from the viewer's thread (owner report:
 * deleting a conversation on one phone changed what the other phone
 * shows). Grouping is unchanged — same sender + same body prefix + same
 * 5s bucket, the identity rule this dedup has always used — but the kept
 * copy is now the VIEWER'S OWN (their inbox copy, or their sent copy via
 * findOwnedSentTwin) whenever one exists, so the conversation view is
 * assembled entirely from the viewer's mailbox and the other user's
 * delete/undo can no longer change it.
 */
export function dedupeThreadForViewer<T extends ThreadCopyRow>(
  rows: T[],
  userEmail: string,
  userId: string
): T[] {
  const isMine = (m: T) =>
    (m.recipientEmail === userEmail && m.folder === 'inbox') ||
    (m.senderId === userId && m.folder === 'sent');
  const bucketKey = (m: T) => {
    const tb = Math.floor(new Date(m.createdAt).getTime() / 5000);
    return `${m.senderId}:${m.body?.slice(0, 200) ?? ''}:${tb}`;
  };
  const picked = new Map<string, T>();
  for (const m of rows) {
    const key = bucketKey(m);
    const cur = picked.get(key);
    if (cur === undefined || (isMine(m) && !isMine(cur))) picked.set(key, m);
  }
  return rows.filter((m) => picked.get(bucketKey(m)) === m);
}

// ─── Legacy thread-key backfill (maintenance procedure) ─────────────────────

export interface BackfillDiff {
  id: string;
  mailbox: string;
  folder: string;
  from: string | null;
  to: string;
  groupSize: number;
}

/**
 * Pick the canonical thread key for one resolved conversation group.
 * Preference order keeps every future runtime resolution in agreement:
 *   (a) a key already shared by two or more members — the established key,
 *       zero-diff for modern conversations;
 *   (b) a key that IS one of the member rows' own ids — a legacy root the
 *       replies were keyed against;
 *   (c) the newest member's own key — what a reply from the visible row
 *       would inherit;
 *   (d) the parentEmailId chain root (oldest ancestor) — pure legacy chain.
 * Returns null only when nothing distinguishable exists (single member).
 */
export function pickCanonicalKey(members: MemberRow[]): string | null {
  const received = members.filter((m) => m.folder !== 'sent');
  const keyCounts = new Map<string, number>();
  for (const m of received) {
    if (!m.threadId) continue;
    keyCounts.set(m.threadId, (keyCounts.get(m.threadId) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 1;
  for (const [key, count] of keyCounts) {
    if (count >= 2 && count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best) return best;

  // (b) a key that IS one of the member rows' own id — the legacy root the
  // replies were keyed against (the root itself may still carry null).
  const memberIds = new Set(received.map((m) => m.id));
  for (const key of keyCounts.keys()) {
    if (memberIds.has(key)) return key;
  }
  const newest = [...received].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  for (const m of newest) {
    if (m.threadId) return m.threadId;
  }

  // (d) chain root: walk parentEmailId links inside the group.
  const byId = new Map(members.map((m) => [m.id, m]));
  const oldest = [...members].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  for (const m of oldest) {
    let cur: MemberRow | undefined = m;
    const seen = new Set<string>([m.id]);
    while (cur?.parentEmailId && byId.has(cur.parentEmailId) && !seen.has(cur.parentEmailId)) {
      seen.add(cur.parentEmailId);
      cur = byId.get(cur.parentEmailId);
    }
    return cur ? cur.id : null;
  }
  return received[0]?.id ?? null;
}

/**
 * Compute the re-keying plan for ONE user's mailbox. Walks every
 * conversation in the mailbox through the SAME runtime resolution the
 * delete/undo paths use (relation-based only — unrelated conversations can
 * never be pulled into one group), and emits a diff for each received copy
 * whose threadId differs from the group's canonical key. Sent copies are
 * never stamped (they carry no key by design) and rows are never created,
 * deleted, moved, or otherwise modified.
 *
 * Idempotent by construction: once every member carries the canonical key,
 * (a) selects it and the diff list comes back empty.
 */
export async function planMailboxBackfill(
  tx: MailTx,
  userEmail: string,
  userId: string
): Promise<BackfillDiff[]> {
  const rows = asRows(
    await tx.email.findMany({
      where: {
        recipientEmail: userEmail,
        OR: [{ folder: { not: 'sent' } }, { senderId: userId }],
        folder: { not: 'drafts' },
      },
      select: MEMBER_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  );
  if (rows.length === 0) return [];

  const diffs: BackfillDiff[] = [];
  const pool = new Map(rows.map((r) => [r.id, r]));
  while (pool.size > 0) {
    // Anchor on the newest unresolved row (what the user would click).
    const anchor = [...pool.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    const members = await resolveConversationMembers(tx, anchor.id, userEmail, userId);
    const stampable = members.filter((m) => m.folder !== 'sent' && pool.has(m.id));
    const canonical = pickCanonicalKey(members);
    if (canonical) {
      for (const m of stampable) {
        if (m.threadId !== canonical) {
          diffs.push({
            id: m.id,
            mailbox: userEmail,
            folder: m.folder,
            from: m.threadId,
            to: canonical,
            groupSize: members.length,
          });
        }
      }
    }
    for (const m of members) pool.delete(m.id);
    // Defense against pathological cycles: the anchor MUST leave the pool.
    pool.delete(anchor.id);
  }
  return diffs;
}

/**
 * Apply a backfill plan with compare-and-swap guards: each update matches
 * the row ONLY while its threadId still equals the planned `from` value, so
 * a concurrent runtime change (a new reply inheriting a key) can never be
 * clobbered. Returns the number of rows actually re-keyed. Re-running an
 * applied plan is a no-op (the CAS misses).
 */
export async function applyBackfill(tx: MailTx, diffs: BackfillDiff[]): Promise<number> {
  let changed = 0;
  for (const d of diffs) {
    const res = await tx.email.updateMany({
      where: { id: d.id, threadId: d.from },
      data: { threadId: d.to },
    });
    changed += res.count;
  }
  return changed;
}
