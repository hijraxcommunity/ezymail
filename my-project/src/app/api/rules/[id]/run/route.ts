import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

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
function evaluateCondition(email: { sender?: { email: string; firstName: string; lastName: string } | null; recipientEmail: string; subject: string; body: string; attachments: string | null }, condition: Condition): boolean {
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
async function executeAction(emailIds: string[], action: Action, userId: string): Promise<number> {
  if (emailIds.length === 0) return 0;

  switch (action.type) {
    case 'moveToFolder': {
      if (!action.value) return 0;
      const result = await db.email.updateMany({
        where: { id: { in: emailIds }, recipientEmail: userId },
        data: { folder: action.value },
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

    // Fetch all inbox emails for the user
    const inboxEmails = await db.email.findMany({
      where: {
        recipientEmail: session.email,
        folder: 'inbox',
      },
      include: {
        sender: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    // Evaluate each email against all conditions
    const matchingEmailIds: string[] = [];

    for (const email of inboxEmails) {
      const allMatch = conditions.every((condition) =>
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
