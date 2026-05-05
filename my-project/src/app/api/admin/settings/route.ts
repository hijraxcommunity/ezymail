import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const defaultSettings = [
  { key: 'app_name', value: 'EzyMail', category: 'general' },
  { key: 'support_email', value: 'support@ezy.af', category: 'general' },
  { key: 'email_domain', value: 'ezy.af', category: 'general' },
  { key: 'registration_open', value: 'true', category: 'general' },
  { key: 'max_attachment_size', value: '20971520', category: 'email' },
  { key: 'max_attachments_per_email', value: '10', category: 'email' },
  { key: 'storage_limit_per_user', value: '1073741824', category: 'email' },
  { key: 'maintenance_mode', value: 'false', category: 'system' },
  { key: 'maintenance_message', value: '', category: 'system' },
];

const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.string().max(5000)),
});

// Seed default settings if none exist
async function seedDefaultSettings() {
  const existingCount = await db.systemSettings.count();
  if (existingCount === 0) {
    await db.systemSettings.createMany({
      data: defaultSettings.map((s) => ({
        settingKey: s.key,
        settingValue: s.value,
        category: s.category,
      })),
    });
  }
}

// GET /api/admin/settings - Get all system settings grouped by category
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    // Ensure default settings exist
    await seedDefaultSettings();

    const settings = await db.systemSettings.findMany({
      orderBy: [{ category: 'asc' }, { settingKey: 'asc' }],
    });

    // Group by category
    const grouped: Record<string, { settingKey: string; settingValue: string | null; id: string }[]> = {};
    for (const setting of settings) {
      const cat = setting.category || 'uncategorized';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push({
        id: setting.id,
        settingKey: setting.settingKey,
        settingValue: setting.settingValue,
      });
    }

    // Also return flat key-value map for convenience
    const flat: Record<string, string | null> = {};
    for (const setting of settings) {
      flat[setting.settingKey] = setting.settingValue;
    }

    return NextResponse.json({
      success: true,
      data: {
        grouped,
        flat,
        categories: Object.keys(grouped),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin get settings error:', message);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT /api/admin/settings - Update system settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const { settings } = parsed.data;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

    // Upsert each setting
    const result = await db.$transaction(async (tx) => {
      const updatedKeys: string[] = [];

      for (const [key, value] of Object.entries(settings)) {
        // Find existing setting to get category
        const existing = await tx.systemSettings.findUnique({
          where: { settingKey: key },
        });

        await tx.systemSettings.upsert({
          where: { settingKey: key },
          update: { settingValue: value, updatedBy: session.userId },
          create: { settingKey: key, settingValue: value, category: existing?.category || 'general', updatedBy: session.userId },
        });

        updatedKeys.push(key);
      }

      // Log the action
      await tx.adminLog.create({
        data: {
          adminId: session.userId,
          action: 'update_settings',
          targetType: 'settings',
          details: JSON.stringify({
            updatedKeys,
            changes: settings,
          }),
          ipAddress: ip,
        },
      });

      return updatedKeys;
    });

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: result.length,
        updatedKeys: result,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Admin update settings error:', message);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
