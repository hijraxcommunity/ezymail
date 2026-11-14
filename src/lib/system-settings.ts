import { db } from './db';

/**
 * F-10: the admin SystemSettings surface was a dead store — six seeded keys
 * with no consumer anywhere in the codebase, so admins could toggle values
 * that changed nothing at runtime. This module makes the enforcement honest:
 *
 * - ENFORCED_SETTING_KEYS is the allowlist of settings the platform actually
 *   reads. The admin GET only surfaces these (keys that are not enforced are
 *   hidden until someone wires them up) and the admin PUT rejects anything
 *   outside the list instead of persisting arbitrary keys.
 * - registration_open gates new account registration (personal AND business).
 * - maintenance_mode (+ maintenance_message) blocks non-admin logins with a
 *   clear message; admins retain access. Gating login is the minimal honest
 *   enforcement — existing sessions are not force-expired by this toggle.
 */

export const ENFORCED_SETTING_KEYS = [
  'registration_open',
  'maintenance_mode',
  'maintenance_message',
] as const;

export type EnforcedSettingKey = (typeof ENFORCED_SETTING_KEYS)[number];

/** Read the enforced settings; missing rows read as null (callers default). */
export async function getEnforcedSystemSettings(): Promise<
  Record<EnforcedSettingKey, string | null>
> {
  const rows = await db.systemSettings.findMany({
    where: { settingKey: { in: [...ENFORCED_SETTING_KEYS] } },
    select: { settingKey: true, settingValue: true },
  });
  const map = {
    registration_open: null,
    maintenance_mode: null,
    maintenance_message: null,
  } as Record<EnforcedSettingKey, string | null>;
  for (const row of rows) {
    if ((ENFORCED_SETTING_KEYS as readonly string[]).includes(row.settingKey)) {
      map[row.settingKey as EnforcedSettingKey] = row.settingValue;
    }
  }
  return map;
}

/** Registration is open unless explicitly switched off ('false'). */
export function isRegistrationOpen(settings: {
  registration_open: string | null;
}): boolean {
  return settings.registration_open !== 'false';
}

/** Maintenance mode is only on when explicitly switched on ('true'). */
export function isMaintenanceMode(settings: {
  maintenance_mode: string | null;
}): boolean {
  return settings.maintenance_mode === 'true';
}

/** Message shown to users during maintenance (fallback kept generic). */
export function maintenanceMessage(settings: {
  maintenance_message: string | null;
}): string {
  const msg = (settings.maintenance_message || '').trim();
  return msg || 'EzyMail is temporarily under maintenance. Please try again later.';
}
