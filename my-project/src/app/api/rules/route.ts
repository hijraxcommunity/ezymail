import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

// Valid values for rule conditions and actions
const VALID_CONDITION_FIELDS = ['from', 'to', 'subject', 'body', 'hasAttachment'];
const VALID_CONDITION_OPERATORS = ['contains', 'equals', 'startsWith', 'endsWith'];
const VALID_ACTION_TYPES = ['moveToFolder', 'markAsRead', 'star', 'delete', 'archive', 'forward'];

// Schema for a single condition
const conditionSchema = z.object({
  field: z.string().refine((val) => VALID_CONDITION_FIELDS.includes(val), {
    message: `Invalid field. Must be one of: ${VALID_CONDITION_FIELDS.join(', ')}`,
  }),
  operator: z.string().refine((val) => VALID_CONDITION_OPERATORS.includes(val), {
    message: `Invalid operator. Must be one of: ${VALID_CONDITION_OPERATORS.join(', ')}`,
  }),
  value: z.string(),
});

// Schema for a single action
const actionSchema = z.object({
  type: z.string().refine((val) => VALID_ACTION_TYPES.includes(val), {
    message: `Invalid action type. Must be one of: ${VALID_ACTION_TYPES.join(', ')}`,
  }),
  value: z.string().optional(),
});

// GET /api/rules - List all rules for authenticated user
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const rules = await db.rule.findMany({
      where: { userId: session.userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ success: true, data: rules });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List rules error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch rules' }, { status: 500 });
  }
}

// POST /api/rules - Create a new rule
const createRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required').max(200, 'Rule name is too long'),
  conditions: z.string().refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }, { message: 'Conditions must be a non-empty JSON array' }),
  actions: z.string().refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }, { message: 'Actions must be a non-empty JSON array' }),
  isEnabled: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createRuleSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstIssue?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { name, conditions, actions, isEnabled } = parsed.data;

    // Validate conditions structure
    let conditionsArray: unknown[];
    try {
      conditionsArray = JSON.parse(conditions);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid conditions JSON' }, { status: 400 });
    }

    for (const cond of conditionsArray) {
      const result = conditionSchema.safeParse(cond);
      if (!result.success) {
        const issue = result.error.issues[0];
        return NextResponse.json(
          { success: false, error: `Invalid condition: ${issue?.message || 'unknown error'}` },
          { status: 400 }
        );
      }
    }

    // Validate actions structure
    let actionsArray: unknown[];
    try {
      actionsArray = JSON.parse(actions);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid actions JSON' }, { status: 400 });
    }

    for (const act of actionsArray) {
      const result = actionSchema.safeParse(act);
      if (!result.success) {
        const issue = result.error.issues[0];
        return NextResponse.json(
          { success: false, error: `Invalid action: ${issue?.message || 'unknown error'}` },
          { status: 400 }
        );
      }
    }

    // Get max sortOrder for the user
    const maxSortOrder = await db.rule.findFirst({
      where: { userId: session.userId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const rule = await db.rule.create({
      data: {
        userId: session.userId,
        name: name.trim(),
        conditions: JSON.stringify(conditionsArray),
        actions: JSON.stringify(actionsArray),
        isEnabled,
        sortOrder: (maxSortOrder?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create rule error:', message);
    return NextResponse.json({ success: false, error: 'Failed to create rule' }, { status: 500 });
  }
}
