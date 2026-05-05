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

// PUT /api/rules/[id] - Update a rule
const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  conditions: z.string().refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }).optional(),
  actions: z.string().refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PUT(
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
      return NextResponse.json({ success: false, error: 'Not authorized to update this rule' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateRuleSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstIssue?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.isEnabled !== undefined) updateData.isEnabled = parsed.data.isEnabled;
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;

    if (parsed.data.conditions !== undefined) {
      let conditionsArray: unknown[];
      try {
        conditionsArray = JSON.parse(parsed.data.conditions);
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
      updateData.conditions = JSON.stringify(conditionsArray);
    }

    if (parsed.data.actions !== undefined) {
      let actionsArray: unknown[];
      try {
        actionsArray = JSON.parse(parsed.data.actions);
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
      updateData.actions = JSON.stringify(actionsArray);
    }

    const updated = await db.rule.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update rule error:', message);
    return NextResponse.json({ success: false, error: 'Failed to update rule' }, { status: 500 });
  }
}

// DELETE /api/rules/[id] - Delete a rule
export async function DELETE(
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
      return NextResponse.json({ success: false, error: 'Not authorized to delete this rule' }, { status: 403 });
    }

    await db.rule.delete({ where: { id } });

    return NextResponse.json({ success: true, data: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete rule error:', message);
    return NextResponse.json({ success: false, error: 'Failed to delete rule' }, { status: 500 });
  }
}
