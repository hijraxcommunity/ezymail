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

  return [...members.values()];
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
    data: { folder: 'trash' },
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
 * behavior this app has always had. Read/unread state is untouched.
 * Returns the ids that were restored.
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
      data: { folder: inferRestoreFolder(row, userId), isArchived: false },
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
  rows.forEach((e, i) => {
    if (e.parentEmailId) {
      const p = rows.findIndex((r) => r.id === e.parentEmailId);
      if (p >= 0) union(p, i);
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
