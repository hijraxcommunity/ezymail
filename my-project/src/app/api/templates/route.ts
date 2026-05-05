import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

// GET /api/templates - List all templates for authenticated user
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const templates = await db.template.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('List templates error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST /api/templates - Create a new template
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200, 'Template name is too long'),
  subject: z.string().max(500, 'Subject is too long').default(''),
  body: z.string().default(''),
  bodyHtml: z.string().default(''),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const requestBody = await request.json();
    const parsed = createTemplateSchema.safeParse(requestBody);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstIssue?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { name, subject, body, bodyHtml } = parsed.data;

    const template = await db.template.create({
      data: {
        userId: session.userId,
        name: name.trim(),
        subject: subject.trim(),
        body,
        bodyHtml,
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Create template error:', message);
    return NextResponse.json({ success: false, error: 'Failed to create template' }, { status: 500 });
  }
}
