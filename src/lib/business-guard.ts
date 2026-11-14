import { NextResponse } from 'next/server';
import { db } from './db';

/**
 * F-16: business subscription state was modeled but never wired into
 * authorization — expired businesses kept full customers/campaigns/team/
 * analytics access forever, and the 30-day email reservation written by the
 * trial-expiry cron was honored by nothing. This module is the shared
 * enforcement layer:
 *
 * - requireActiveBusiness(): replaces the accountType-only check on the
 *   business DATA routes (customers, campaigns, team, analytics). Expired
 *   subscriptions get 403; profile and verification routes deliberately stay
 *   accessible so the business can still see its state (re-activation is an
 *   admin action, see F-19).
 * - reservationExpired()/releaseReservedBusinessEmail(): honor the 30-day
 *   reservation written by the cron. A soft-deleted business whose reservation
 *   window has passed no longer blocks its address: the stale row's unique
 *   email columns are rewritten (no schema change needed to free the
 *   @unique constraint) so a new business can claim the address.
 */

/** The reservation window mirrors the cron's 30-day emailReservedUntil. */
const RESERVATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function requireActiveBusiness(
  userId: string
): Promise<NextResponse | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, accountType: true, subscriptionStatus: true, softDeletedAt: true },
  });

  if (!user || user.accountType !== 'business') {
    return NextResponse.json({ error: 'Not a business account' }, { status: 403 });
  }
  if (user.softDeletedAt) {
    return NextResponse.json({ error: 'This account has been deleted' }, { status: 403 });
  }
  if (user.subscriptionStatus === 'expired') {
    return NextResponse.json(
      { error: 'Your business subscription has expired. Renew to regain access to this feature.' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * A soft-deleted business holds its address only until its reservation window
 * ends (emailReservedUntil written by the trial-expiry cron; null counts as
 * expired — the window is a grace period, not a permanent hold).
 */
export function reservationExpired(user: {
  softDeletedAt: Date | null;
  emailReservedUntil: Date | null;
}): boolean {
  if (!user.softDeletedAt) return false;
  return !user.emailReservedUntil || user.emailReservedUntil.getTime() <= Date.now();
}

/**
 * Free a released address: rewrite the stale soft-deleted row's matching
 * unique columns (email/businessEmail) to a per-row unique reserved value so
 * the @unique constraints allow a NEW account to claim the address. The
 * stale row itself is never deleted (its data stays for audit purposes).
 */
export async function releaseReservedBusinessEmail(email: string): Promise<void> {
  const stale = await db.user.findFirst({
    where: { OR: [{ email }, { businessEmail: email }], softDeletedAt: { not: null } },
    select: { id: true, email: true, businessEmail: true, softDeletedAt: true, emailReservedUntil: true },
  });
  if (!stale || !reservationExpired(stale)) return;

  // The row id (cuid) is unique, so the rewritten value can never collide.
  const freed = `released.${stale.id}@reserved.invalid`;
  const data: { email?: string; businessEmail?: string } = {};
  if (stale.email === email) data.email = freed;
  if (stale.businessEmail === email) data.businessEmail = freed;
  if (Object.keys(data).length > 0) {
    await db.user.update({ where: { id: stale.id }, data });
  }
}
