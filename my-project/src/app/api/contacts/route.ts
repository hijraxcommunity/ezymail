import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
  email: z.string().email('Invalid email format').max(320, 'Email is too long'),
  phone: z.string().max(30, 'Phone is too long').optional().default(''),
  notes: z.string().max(5000, 'Notes are too long').optional().default(''),
});

// GET /api/contacts - List all contacts for authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'name';
    const order = searchParams.get('order') || 'asc';
    const favorite = searchParams.get('favorite');

    // Build where clause
    const where: Record<string, unknown> = { userId: session.userId };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (favorite === 'true') {
      where.isFavorite = true;
    }

    // Validate sort fields
    const allowedSortFields = ['name', 'email', 'createdAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    const contacts = await db.contact.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
    });

    return NextResponse.json({ success: true, data: contacts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List contacts error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

// POST /api/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createContactSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { name, email, phone, notes } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate (userId + email unique)
    const existing = await db.contact.findUnique({
      where: { userId_email: { userId: session.userId, email: normalizedEmail } },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A contact with this email already exists' },
        { status: 409 }
      );
    }

    const contact = await db.contact.create({
      data: {
        userId: session.userId,
        name: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || '',
        notes: notes?.trim() || '',
      },
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create contact error:', message);
    return NextResponse.json({ success: false, error: 'Failed to create contact' }, { status: 500 });
  }
}
