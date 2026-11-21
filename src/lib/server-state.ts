/**
 * D4 (Batch 9): shared server state on PostgreSQL.
 *
 * Every piece of server-side security state that used to live in
 * per-instance in-memory Maps — WhatsApp/password-recovery OTP challenges,
 * fixed-window rate limits, single-use token guards, small key/value
 * states (resend cooldowns, TOTP last-consumed steps) — is stored here via
 * Prisma. Rationale (audit S-02): on serverless the Maps were per Lambda
 * instance, so an OTP minted on instance A could be unverifiable on
 * instance B, and every brute-force cap reset on cold start (or scaled
 * into N independent per-instance caps under load). Durable rows are
 * shared across instances and survive restarts.
 *
 * Concurrency contract — every write is an ATOMIC conditional statement,
 * never a read-modify-write across round-trips:
 *
 *   - RateBucket : the caller bumps with `updateMany({ where: { key,
 *     windowEnd: { gt: now } } })` (atomic conditional increment) and only
 *     when no active window exists falls back to a single upsert that
 *     resets the row. The blocked decision reads the count that ALREADY
 *     includes the caller's own bump.
 *   - OtpChallenge: wrong-code attempts increment via a conditional
 *     `updateMany` bounded by `attempts < max` and `consumedAt: null`;
 *     success consumes via a conditional `updateMany({ consumedAt: null })`
 *     whose matched-count decides the ok/replay outcome. A fresh send
 *     REPLACES the (purpose, subject) row through the composite-unique
 *     upsert, invalidating any previous code.
 *   - UsedTokenGuard: first-insert-wins on the primary key; a replay is a
 *     P2002 and rejected. Rows are kept at most as long as the guarded
 *     artifact's own TTL — after that the underlying JWT is expired too.
 *   - KvState    : plain upsert for last-writer-wins values (resend
 *     cooldown); the TOTP step uses `kvClaimValue`, an atomic
 *     compare-and-set claim so exactly ONE concurrent request with the
 *     same code can ever succeed (see below).
 *
 * Expired rows are deleted opportunistically (throttled per process);
 * they are security-dead before cleanup runs because every read filters
 * on its expiry condition. All queries use the standard Prisma client so
 * the harnesses (embedded Postgres AND the SQLite lifecycle suite) can
 * exercise the same code paths.
 */

import { createHash } from 'crypto';
import { db } from '@/lib/db';

// ── Opportunistic cleanup (throttled per process) ────────────────────────────

const CLEANUP_MIN_INTERVAL_MS = 60 * 1000; // at most one sweep per minute per instance
const globalForCleanup = globalThis as unknown as { serverStateLastClean?: number };

function maybeCleanup(now: Date): void {
  const last = globalForCleanup.serverStateLastClean || 0;
  if (Date.now() - last < CLEANUP_MIN_INTERVAL_MS) return;
  globalForCleanup.serverStateLastClean = Date.now();
  // Fire-and-forget: cleanup failure must never affect the caller's result.
  void Promise.all([
    db.otpChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateBucket.deleteMany({ where: { windowEnd: { lt: now } } }),
    db.usedTokenGuard.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.kvState.deleteMany({ where: { AND: [{ expiresAt: { not: null } }, { expiresAt: { lt: now } }] } }),
  ]).catch(() => {});
}

// ── Fixed-window rate limiting ───────────────────────────────────────────────

/**
 * Fixed-window rate limit shared across all instances.
 *
 * Semantics match the in-memory limiter this replaces (F-32/F-43 family):
 * the first `maxAttempts` requests inside a window pass; the request that
 * would make the count exceed the cap is refused. The window restarts on
 * the first request after `windowMs` has passed.
 *
 * The bump-then-read ordering keeps the decision atomic per caller: the
 * caller's own increment is always included in the count it reads, so two
 * concurrent callers can never both see "the same" slot and both pass when
 * only one slot remains.
 */
export async function checkRateLimitWindow(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  maybeCleanup(now);

  // 1. Active window: atomic conditional increment (matched = we counted).
  const bumped = await db.rateBucket.updateMany({
    where: { key, windowEnd: { gt: now } },
    data: { count: { increment: 1 } },
  });

  if (bumped.count === 1) {
    const row = await db.rateBucket.findUnique({
      where: { key },
      select: { count: true },
    });
    // The bump already happened; if the bucket was somehow deleted between
    // the two statements (cleanup race), treat the request as the first of
    // a fresh window (allowed) rather than failing open or closed.
    return (row?.count ?? 1) <= maxAttempts;
  }

  // 2. No active window (missing or expired): reset-or-create in ONE upsert.
  //    Concurrent resetters converge: both set count=1 — the benign
  //    off-by-one-at-window-start race of every fixed-window limiter.
  await db.rateBucket.upsert({
    where: { key },
    create: { key, count: 1, windowEnd: new Date(Date.now() + windowMs) },
    update: { count: 1, windowEnd: new Date(Date.now() + windowMs) },
  });
  return true;
}

// ── OTP challenges ───────────────────────────────────────────────────────────

export type OtpCheckResult = 'ok' | 'missing' | 'expired' | 'locked' | 'invalid';

/**
 * Store a fresh OTP for (purpose, subject) — replaces any previous one via
 * the composite-unique upsert, so a newly requested code immediately
 * invalidates the old one everywhere. Only the hash is ever stored.
 */
export async function storeOtpChallenge(
  purpose: string,
  subject: string,
  codeHash: string,
  ttlSeconds: number
): Promise<void> {
  const now = new Date();
  maybeCleanup(now);
  await db.otpChallenge.upsert({
    where: { purpose_subject: { purpose, subject } },
    create: {
      purpose,
      subject,
      codeHash,
      attempts: 0,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    },
    update: {
      codeHash,
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    },
  });
}

export async function clearOtpChallenge(purpose: string, subject: string): Promise<void> {
  await db.otpChallenge.deleteMany({ where: { purpose, subject } });
}

/**
 * Check a submitted code against the salted hash. The outcome of every
 * branch is decided by an atomic conditional write:
 *
 *   missing/expired : no unconsumed live row (or we deleted it on sight)
 *   locked          : attempts already at/over the cap (row dropped)
 *   invalid         : wrong code, attempts incremented under the cap
 *   ok              : correct code AND this caller's conditional consume
 *                     matched — a concurrent second correct submission
 *                     matches zero rows and reports 'missing' (replay-safe)
 */
export async function checkOtpChallenge(
  purpose: string,
  subject: string,
  codeHash: string,
  maxAttempts: number
): Promise<OtpCheckResult> {
  const now = new Date();
  maybeCleanup(now);

  const row = await db.otpChallenge.findUnique({
    where: { purpose_subject: { purpose, subject } },
  });
  if (!row || row.consumedAt) return 'missing';

  if (row.expiresAt <= now) {
    await db.otpChallenge.deleteMany({ where: { purpose, subject } });
    return 'expired';
  }
  if (row.attempts >= maxAttempts) {
    await db.otpChallenge.deleteMany({ where: { purpose, subject } });
    return 'locked';
  }

  if (row.codeHash !== codeHash) {
    // Wrong code: bump attempts only while the row is still live and under
    // the cap (atomic conditional). If we matched zero rows the challenge
    // expired/hit the cap/consumed concurrently — re-read for the exact
    // verdict instead of guessing.
    const bumped = await db.otpChallenge.updateMany({
      where: { purpose, subject, consumedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count === 1) return 'invalid';
    const current = await db.otpChallenge.findUnique({
      where: { purpose_subject: { purpose, subject } },
    });
    if (!current || current.consumedAt) return 'missing';
    if (current.expiresAt <= now) return 'expired';
    return 'locked';
  }

  // Correct code: consume under the consumedAt: null guard. Matched = this
  // caller is the one-time winner.
  const consumed = await db.otpChallenge.updateMany({
    where: { purpose, subject, consumedAt: null },
    data: { consumedAt: now },
  });
  return consumed.count === 1 ? 'ok' : 'missing';
}

/** Attempts left before the pending OTP is dropped (for client messaging). */
export async function otpAttemptsLeft(
  purpose: string,
  subject: string,
  maxAttempts: number
): Promise<number> {
  const row = await db.otpChallenge.findUnique({
    where: { purpose_subject: { purpose, subject } },
    select: { attempts: true, consumedAt: true },
  });
  if (!row || row.consumedAt) return 0;
  return Math.max(maxAttempts - row.attempts, 0);
}

// ── Single-use token guards ──────────────────────────────────────────────────

/**
 * Consume a one-time bearer artifact (password-reset token, phone proof
 * token). Returns false when the SAME artifact was already consumed — the
 * unique primary key makes this exact under any concurrency; the winner of
 * two racing consumes is decided by the database, not by timing.
 */
export async function consumeSingleUseToken(token: string, ttlSeconds: number): Promise<boolean> {
  const now = new Date();
  maybeCleanup(now);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  try {
    await db.usedTokenGuard.create({
      data: {
        tokenHash,
        // Kept a little longer than the artifact's own validity so a replay
        // that races the expiry is still caught; after that the JWT itself
        // is expired and the row is cleanup garbage.
        expiresAt: new Date(now.getTime() + (ttlSeconds + 60) * 1000),
      },
    });
    return true;
  } catch (error: unknown) {
    // P2002 = the hash is already recorded → replay.
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return false;
    }
    throw error;
  }
}

// ── Small key/value states ───────────────────────────────────────────────────

/** Read a durable state value; null when absent or past its TTL. */
export async function kvGet(key: string): Promise<string | null> {
  const row = await db.kvState.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt <= new Date()) return null;
  return row.value;
}

/** Write a durable state value; ttlMs null = keep indefinitely. */
export async function kvSet(key: string, value: string, ttlMs?: number | null): Promise<void> {
  const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
  await db.kvState.upsert({
    where: { key },
    create: { key, value, expiresAt },
    update: { value, expiresAt },
  });
}

/** True when the error is Prisma's unique-constraint violation (P2002). */
function isP2002(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Atomic compare-and-set CLAIM (Batch 9 remediation): returns true iff the
 * caller performed the transition "stored value != `value`" → "stored value
 * == `value`"; returns false iff the stored value was ALREADY exactly
 * `value` (i.e. someone else — possibly an entirely different instance —
 * claimed this exact value first).
 *
 * This is the TOTP replay primitive: `kvClaimValue('totp-step:<userId>',
 * String(step))` returns true exactly once per step, no matter how many
 * requests with the same code race across any number of instances or
 * process restarts, because the decision is made by ONE atomic conditional
 * statement against the shared row — never by a read-then-write across
 * round-trips.
 *
 * Mechanics (no multi-statement transaction needed; every branch is a
 * single atomic statement):
 *   1. `updateMany({ where: { key, value: { not: value } } })` — the
 *      claimant statement. matched-count 1 = we moved some OTHER value
 *      (or the row appeared between statements) to `value` and we win.
 *      matched-count 0 = either the row holds `value` already (replay)
 *      or the row is missing.
 *   2. If 0 matched: re-read. Row present ⇒ its value is exactly `value`
 *      (the where clause excluded everything else) ⇒ replay, false.
 *      Row missing ⇒ try `create`; the primary key is the tiebreaker —
 *      the loser of a racing create gets P2002 and re-enters step 1,
 *      where the conditional statement now decides cleanly.
 *
 * Two requests claiming DIFFERENT values both succeed (each performs its
 * own transition) — which is the intended semantics: the guard rejects
 * the same STEP twice, not progress. Two requests claiming the SAME value:
 * exactly one true, every other caller false, in every interleaving.
 * Bounded loop (3) for the vanishing create-race; fail-closed afterwards.
 */
export async function kvClaimValue(key: string, value: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const claimed = await db.kvState.updateMany({
      where: { key, value: { not: value } },
      data: { value },
    });
    if (claimed.count === 1) return true;

    const current = await db.kvState.findUnique({
      where: { key },
      select: { value: true },
    });
    if (current) return false; // stored value is exactly `value` ⇒ replay

    try {
      await db.kvState.create({ data: { key, value, expiresAt: null } });
      return true;
    } catch (error: unknown) {
      if (!isP2002(error)) throw error;
      // A concurrent creator won the row — loop: the conditional statement
      // above now decides the outcome atomically.
    }
  }
  // Pathological contention (never observed in practice): fail-closed.
  return false;
}
