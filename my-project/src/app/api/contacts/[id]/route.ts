import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const updateContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name is too long').optional(),
  email: z.string().email('Invalid email format').max(320, 'Email is too long').optional(),
  phone: z.string().max(30, 'Phone is too long').optional(),
  notes: z.string().max(5000, 'Notes are too long').optional(),
  isFavorite: z.boolean().optional(),
});

// PUT /api/contacts/[id] - Update a contact
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
    const parsed = updateContactSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    // Find the contact and verify ownership
    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Contact not found' }, { status: 404 });
    }

    if (existing.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    // If email is being updated, check for duplicate
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.email !== undefined) {
      const normalizedEmail = parsed.data.email.toLowerCase().trim();
      if (normalizedEmail !== existing.email) {
        const duplicate = await db.contact.findUnique({
          where: { userId_email: { userId: session.userId, email: normalizedEmail } },
        });
        if (duplicate) {
          return NextResponse.json(
            { success: false, error: 'A contact with this email already exists' },
            { status: 409 }
          );
        }
      }
      updateData.email = normalizedEmail;
    }
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone?.trim() || '';
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes?.trim() || '';
    if (parsed.data.isFavorite !== undefined) updateData.isFavorite = parsed.data.isFavorite;

    const contact = await db.contact.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: contact });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update contact error:', message);
    return NextResponse.json({ success: false, error: 'Failed to update contact' }, { status: 500 });
  }
}

// DELETE /api/contacts/[id] - Delete a contact
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

    // Find the contact and verify ownership
    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Contact not found' }, { status: 404 });
    }

    if (existing.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    await db.contact.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete contact error:', message);
    return NextResponse.json({ success: false, error: 'Failed to delete contact' }, { status: 500 });
  }
}
