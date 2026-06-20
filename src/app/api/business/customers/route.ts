import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
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

    const customers = await db.customer.findMany({
      where: { businessId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        customFields: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ customers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List customers error:', message);
    return NextResponse.json({ error: 'Failed to list customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();

    // CSV import mode
    if (body.csv) {
      if (typeof body.csv !== 'string') {
        return NextResponse.json({ error: 'csv field must be a string' }, { status: 400 });
      }

      const lines = body.csv.trim().split('\n');
      if (lines.length < 2) {
        return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 });
      }

      // Parse header row
      const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

      const emailIndex = headers.indexOf('email');
      const nameIndex = headers.indexOf('name');
      if (emailIndex === -1) {
        return NextResponse.json({ error: 'CSV must have an "email" column' }, { status: 400 });
      }

      // Collect custom field headers (everything except email and name)
      const customFieldHeaders = headers.filter(h => h !== 'email' && h !== 'name');

      const customersToCreate: { email: string; name: string | null; customFields: string | null }[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        const email = values[emailIndex]?.trim().toLowerCase();

        if (!email) {
          errors.push(`Row ${i + 1}: missing email`);
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.push(`Row ${i + 1}: invalid email "${email}"`);
          continue;
        }

        const name = nameIndex !== -1 ? values[nameIndex]?.trim() || null : null;

        const customFieldsObj: Record<string, string> = {};
        for (const field of customFieldHeaders) {
          const fieldIndex = headers.indexOf(field);
          if (fieldIndex !== -1 && values[fieldIndex]) {
            customFieldsObj[field] = values[fieldIndex].trim();
          }
        }
        const customFields = Object.keys(customFieldsObj).length > 0
          ? JSON.stringify(customFieldsObj)
          : null;

        customersToCreate.push({ email, name, customFields });
      }

      if (customersToCreate.length === 0) {
        return NextResponse.json(
          { error: 'No valid rows found in CSV', details: errors },
          { status: 400 }
        );
      }

      // Bulk upsert using createMany (skip duplicates)
      const created = await db.customer.createMany({
        data: customersToCreate.map(c => ({
          businessId: user.id,
          email: c.email,
          name: c.name,
          customFields: c.customFields,
        })),
        skipDuplicates: true,
      });

      return NextResponse.json(
        {
          imported: created.count,
          total: customersToCreate.length,
          skipped: customersToCreate.length - created.count,
          errors: errors.length > 0 ? errors : undefined,
        },
        { status: 201 }
      );
    }

    // Single customer creation
    const { email, name, customFields } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    const customerData: { businessId: string; email: string; name?: string | null; customFields?: string | null } = {
      businessId: user.id,
      email: normalizedEmail,
    };

    if (name !== undefined) {
      customerData.name = name ? String(name).trim() : null;
    }

    if (customFields !== undefined) {
      if (typeof customFields !== 'object' || customFields === null || Array.isArray(customFields)) {
        return NextResponse.json({ error: 'customFields must be a JSON object' }, { status: 400 });
      }
      customerData.customFields = JSON.stringify(customFields);
    }

    const customer = await db.customer.create({ data: customerData });

    return NextResponse.json(
      {
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          customFields: customer.customFields,
          createdAt: customer.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Add customer error:', message);
    return NextResponse.json({ error: 'Failed to add customer' }, { status: 500 });
  }
}

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}