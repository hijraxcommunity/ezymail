import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

// PUT /api/templates/[id] - Update a template
const updateTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200, 'Template name is too long').optional(),
  subject: z.string().max(500, 'Subject is too long').optional(),
  body: z.string().optional(),
  bodyHtml: z.string().optional(),
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

    // Find the template
    const template = await db.template.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Check ownership
    if (template.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized to update this template' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstIssue?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.subject !== undefined) updateData.subject = parsed.data.subject.trim();
    if (parsed.data.body !== undefined) updateData.body = parsed.data.body;
    if (parsed.data.bodyHtml !== undefined) updateData.bodyHtml = parsed.data.bodyHtml;

    const updated = await db.template.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update template error:', message);
    return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 });
  }
}

// DELETE /api/templates/[id] - Delete a template
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

    // Find the template
    const template = await db.template.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Check ownership
    if (template.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized to delete this template' }, { status: 403 });
    }

    await db.template.delete({ where: { id } });

    return NextResponse.json({ success: true, data: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete template error:', message);
    return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 });
  }
}
