import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user || user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    const { id } = await params;

    const customer = await db.customer.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!customer || customer.businessId !== user.id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const body = await request.json();
    const { email, name, customFields } = body;

    const updateData: Record<string, string | null> = {};

    if (email !== undefined) {
      if (!email || !email.trim()) {
        return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
      }
      updateData.email = normalizedEmail;
    }

    if (name !== undefined) {
      updateData.name = name ? String(name).trim() : null;
    }

    if (customFields !== undefined) {
      if (typeof customFields !== 'object' || customFields === null || Array.isArray(customFields)) {
        return NextResponse.json({ error: 'customFields must be a JSON object' }, { status: 400 });
      }
      updateData.customFields = JSON.stringify(customFields);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await db.customer.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        customFields: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ customer: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Update customer error:', message);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, accountType: true },
    });

    if (!user || user.accountType !== 'business') {
      return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
    }

    const { id } = await params;

    const customer = await db.customer.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!customer || customer.businessId !== user.id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    await db.customer.delete({ where: { id } });

    return NextResponse.json({ message: 'Customer removed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Delete customer error:', message);
    return NextResponse.json({ error: 'Failed to remove customer' }, { status: 500 });
  }
}