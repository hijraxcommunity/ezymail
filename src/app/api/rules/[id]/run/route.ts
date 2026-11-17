import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, checkRateLimitKey } from '@/lib/auth';

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface Action {
  type: string;
  value?: string;
}

/**
 * Evaluate a single condition against an email.
 */
function evaluateCondition(email: { sender?: { email: string; firstName: string; lastName: string } | null; recipientEmail: string; subject: string; body: string; attachments?: string | null }, condition: Condition): boolean {
  const { field, operator, value } = condition;
  const lowerValue = value.toLowerCase();

  let fieldValue: string;

  switch (field) {
    case 'from': {
      if (!email.sender) return false;
      // Match against sender email or display name
      const senderName = `${email.sender.firstName} ${email.sender.lastName}`.toLowerCase();
      fieldValue = email.sender.email.toLowerCase();
      // Check if condition value matches email or name
      const matchesEmail = applyOperator(fieldValue, operator, lowerValue);
      const matchesName = applyOperator(senderName, operator, lowerValue);
      return matchesEmail || matchesName;
    }
    case 'to':
      fieldValue = email.recipientEmail.toLowerCase();
      return applyOperator(fieldValue, operator, lowerValue);
    case 'subject':
      fieldValue = email.subject.toLowerCase();
      return applyOperator(fieldValue, operator, lowerValue);
    case 'body':
      fieldValue = email.body.toLowerCase();
      return applyOperator(fieldValue, operator, lowerValue);
    case 'hasAttachment':
      // hasAttachment checks if the boolean-like value is "true" and email has attachments
      return lowerValue === 'true' ? !!email.attachments : !email.attachments;
    default:
      return false;
  }
}

/**
 * Apply a string operator.
 */
function applyOperator(fieldValue: string, operator: string, conditionValue: string): boolean {
  switch (operator) {
    case 'contains':
      return fieldValue.includes(conditionValue);
    case 'equals':
      return fieldValue === conditionValue;
    case 'startsWith':
      return fieldValue.startsWith(conditionValue);
    case 'endsWith':
      return fieldValue.endsWith(conditionValue);
    default:
      return false;
  }
}

/**
 * Execute a single action on a set of email IDs.
 */
// F-17: rule folder targets are restricted to the SAFE system folders. The
// UI used to offer every folder id (incl. 'starred'/'sent') and the runner
// stamped action.value verbatim — a row set to folder='starred' matches no
// view (Starred queries isStarred, not folder) and folder='sent' rows owned
// as recipient are invisible (Sent requires senderId): the mail vanished
// from EVERY folder permanently and only DB surgery recovered it. Each safe
// target below writes the EXACT representation its view queries, so a
// rule-moved mail is always browsable. Anything else is rejected upstream
// (400) and defensively ignored here.
const SAFE_RULE_FOLDER_WRITES: Record<string, Record<string, unknown>> = {
  inbox: { folder: 'inbox', isArchived: false },
  archive: { folder: 'inbox', isArchived: true },
  trash: { folder: 'trash', isArchived: false, snoozedUntil: null },
  spam: { folder: 'spam', isArchived: false, snoozedUntil: null },
};

function isSafeRuleFolder(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(SAFE_RULE_FOLDER_WRITES, value);
}

async function executeAction(emailIds: string[], action: Action, userId: string): Promise<number> {
  if (emailIds.length === 0) return 0;

  switch (action.type) {
    case 'moveToFolder': {
      if (!action.value || !isSafeRuleFolder(action.value)) return 0;
      const result = await db.email.updateMany({
        where: { id: { in: emailIds }, recipientEmail: userId },
        data: SAFE_RULE_FOLDER_WRITES[action.value],
      });
      return result.count;
    }
    case 'markAsRead': {
      const result = await db.email.updateMany({
        where: { id: { in: emailIds }, recipientEmail: userId },
        data: { isRead: true },
      });
      return result.count;
    }
    case 'star': {
      const result = await db.email.updateMany({
        where: { id: { in: emailIds }, recipientEmail: userId },
        data: { isStarred: true },
      });
      return result.count;
    }
    case 'delete': {
      const result = await db.email.updateMany({
        where: { id: { in: emailIds }, recipientEmail: userId },
        data: { folder: 'trash' },
      });
      return result.count;
    }
    case 'archive': {
      const result = await db.email.updateMany({
        where: { id: { in: emailIds }, recipientEmail: userId },
        data: { isArchived: true },
      });
      return result.count;
    }
    case 'forward': {
      // Forward action requires a recipient - we can't auto-forward here
      // Return 0 as this requires user interaction
      return 0;
    }
    default:
      return 0;
  }
}

// POST /api/rules/[id]/run - Run a specific rule on all inbox emails
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // F-32 residue: the run path scans up to 500 rows and bulk-updates per
    // click — the last expensive mail operation with no limiter (register,
    // upload and send were throttled earlier). 10 runs / 15 min per user:
    // far above any interactive use, well below scan-flood territory.
    const runAllowed = await checkRateLimitKey(`rule-run:${session.userId}`, Number(process.env.RULE_RUN_RATE_LIMIT_MAX) || 10, 15 * 60 * 1000);
    if (!runAllowed) {
      return NextResponse.json(
        { success: false, error: 'Too many rule runs. Please try again later.' },
        { status: 429 }
      );
    }

    const { id } = await params;

    // Find the rule
    const rule = await db.rule.findUnique({ where: { id } });
    if (!rule) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }

    // Check ownership
    if (rule.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized to run this rule' }, { status: 403 });
    }

    // Check if rule is enabled
    if (!rule.isEnabled) {
      return NextResponse.json({ success: false, error: 'Rule is disabled' }, { status: 400 });
    }

    // Parse conditions and actions
    let conditions: Condition[];
    let actions: Action[];

    try {
      conditions = JSON.parse(rule.conditions);
    } catch {
      return NextResponse.json({ success: false, error: 'Rule has invalid conditions' }, { status: 400 });
    }

    try {
      actions = JSON.parse(rule.actions);
    } catch {
      return NextResponse.json({ success: false, error: 'Rule has invalid actions' }, { status: 400 });
    }

    if (!Array.isArray(conditions) || conditions.length === 0) {
      return NextResponse.json({ success: false, error: 'Rule has no conditions' }, { status: 400 });
    }

    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json({ success: false, error: 'Rule has no actions' }, { status: 400 });
    }

    // F-17: reject unsafe folder targets LOUDLY instead of stamping a value
    // that matches no view (the mail became permanently invisible). Legacy
    // rules pointing at 'starred'/'sent'/custom ids surface here with a
    // clear message instead of destroying inbox mail on run.
    for (const action of actions) {
      if (
        action &&
        action.type === 'moveToFolder' &&
        (!action.value || !isSafeRuleFolder(action.value))
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid folder target: "${action.value || ''}". Rules can only move mail to Inbox, Archive, Spam or Trash. Edit the rule and pick one of those folders.`,
          },
          { status: 400 }
        );
      }
    }

    // F-35: the scan used to be `findMany` with NO take and a blanket
    // `include` — every inbox row's FULL body, bodyHtml AND base64
    // attachment blobs, all re-serialized into JS and evaluated per run.
    // One large mailbox made a single rule click slow/memory-heavy. Now:
    //
    // 1. `hasAttachment` conditions are pushed into the WHERE clause — the
    //    attachments column stores null (no files) or a JSON string (files
    //    present, verified: the send path writes null/JSON.stringify, never
    //    '' or '[]'), so `attachments: { not: null }` / `attachments: null`
    //    is EXACTLY the JS truthiness the old evaluator applied, without
    //    loading the blobs.
    // 2. The select is slim — only the fields evaluateCondition reads
    //    (bodyHtml and attachment payloads were dead weight here).
    // 3. The scan is bounded: newest RULE_SCAN_CAP inbox rows per run.
    //    totalInboxEmails reports the SCANNED count.
    const RULE_SCAN_CAP = 500;

    interface ScanCondition { field: string; operator: string; value: string }
    const attachmentFilters: Array<Record<string, unknown>> = [];
    const jsConditions: ScanCondition[] = [];
    for (const condition of conditions as ScanCondition[]) {
      if (condition && condition.field === 'hasAttachment') {
        // Same truthiness contract as evaluateCondition's hasAttachment case:
        // value 'true' ↔ attachments not null, anything else ↔ null.
        attachmentFilters.push(
          String(condition.value).toLowerCase() === 'true'
            ? { attachments: { not: null } }
            : { attachments: null }
        );
      } else {
        jsConditions.push(condition);
      }
    }

    const inboxEmails = await db.email.findMany({
      where: {
        recipientEmail: session.email,
        folder: 'inbox',
        ...(attachmentFilters.length > 0 ? { AND: attachmentFilters } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: RULE_SCAN_CAP,
      select: {
        id: true,
        recipientEmail: true,
        subject: true,
        body: true,
        sender: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    // Evaluate each email against the remaining (non-attachment) conditions
    const matchingEmailIds: string[] = [];

    for (const email of inboxEmails) {
      const allMatch = jsConditions.every((condition) =>
        evaluateCondition(email, condition)
      );

      if (allMatch) {
        matchingEmailIds.push(email.id);
      }
    }

    // Execute all actions on matching emails
    let totalAffected = 0;
    for (const action of actions) {
      const count = await executeAction(matchingEmailIds, action, session.email);
      totalAffected += count;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalInboxEmails: inboxEmails.length,
        matchingEmails: matchingEmailIds.length,
        actionsExecuted: actions.length,
        totalAffected,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Run rule error:', message);
    return NextResponse.json({ success: false, error: 'Failed to run rule' }, { status: 500 });
  }
}
