import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const updateLabelSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').optional(),
});

// PUT /api/labels/[id] - Update a specific label
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
    const body = await request.json();
    const parsed = updateLabelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Verify label exists and belongs to user
    const label = await db.label.findUnique({ where: { id } });
    if (!label) {
      return NextResponse.json({ success: false, error: 'Label not found' }, { status: 404 });
    }
    if (label.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    const updateData: Record<string, string> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.color !== undefined) updateData.color = parsed.data.color;

    // If name is being changed, check for duplicates
    if (parsed.data.name && parsed.data.name.toLowerCase() !== label.name.toLowerCase()) {
      const duplicate = await db.label.findFirst({
        where: {
          userId: session.userId,
          name: { equals: parsed.data.name },
          id: { not: id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: 'A label with this name already exists' },
          { status: 409 }
        );
      }
    }

    const updatedLabel = await db.label.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updatedLabel });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update label error:', message);
    return NextResponse.json({ success: false, error: 'Failed to update label' }, { status: 500 });
  }
}

// DELETE /api/labels/[id] - Delete a specific label
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

    // Verify label exists and belongs to user
    const label = await db.label.findUnique({ where: { id } });
    if (!label) {
      return NextResponse.json({ success: false, error: 'Label not found' }, { status: 404 });
    }
    if (label.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    // Delete label and its associations (cascade will handle EmailLabel)
    await db.label.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete label error:', message);
    return NextResponse.json({ success: false, error: 'Failed to delete label' }, { status: 500 });
  }
}
