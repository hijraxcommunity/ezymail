import { createHash, timingSafeEqual } from 'crypto';

/**
 * Shared Vercel Cron authorization (audit F-03 — the scheduled-dispatch cron
 * uses the same contract as trial-expiry).
 *
 * Vercel Cron automatically attaches `Authorization: Bearer <CRON_SECRET>` to
 * scheduled invocations when a project-level CRON_SECRET environment variable
 * is configured; any other caller must send the same header explicitly.
 *
 * Authorization is checked BEFORE any database access, and comparison is done
 * on SHA-256 digests so it is timing-safe and leaks no length information.
 * Fails closed: while CRON_SECRET is unset, no caller (including Vercel Cron
 * itself) is authorized.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.trim() === '') {
    return false;
  }

  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1];
  if (!provided) {
    return false;
  }

  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
