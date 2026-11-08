/**
 * Server-only phone verification for REGISTRATION (WhatsApp OTP).
 *
 * Reuses the single OpenWA sender in @/lib/whatsapp/openwa.ts — this module
 * only owns the secure OTP lifecycle and the short-lived proof token that
 * the register APIs require:
 *
 *   send:   normalize to E.164 -> rate/cooldown checks -> generate OTP with
 *           crypto.randomInt -> store ONLY its sha256 hash -> deliver via
 *           the existing OpenWA sender.
 *   verify: constant-shape hash check, 5 attempts max, one-time consumption,
 *           5-minute expiry -> on success issue a signed, purpose-scoped JWT
 *           bound to the exact E.164 number (10-minute validity, single use).
 *
 * The register APIs later re-verify that JWT against the submitted phone and
 * consume it, so the frontend's "verified" state is never trusted.
 *
 * Storage is in-memory (same pattern as the password-recovery OTP store in
 * the forgot-password route): TTL-bounded, lazily cleaned, no OTP or phone
 * value is ever logged. On serverless the per-instance map still bounds the
 * worst case; the database-level unique constraint on User.phone is the hard
 * guarantee against two accounts sharing one number.
 */

import { createHash, randomInt } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtSecret } from '@/lib/auth';

// ── Policy (registration OTP) ────────────────────────────────────────────────
export const PHONE_OTP_TTL_SECONDS = 5 * 60; // 5-minute OTP expiry
export const PHONE_OTP_MAX_ATTEMPTS = 5; // wrong tries allowed per OTP
export const PHONE_OTP_RESEND_COOLDOWN_SECONDS = 60; // between two sends
export const PHONE_SEND_MAX_PER_WINDOW = 3; // sends per phone per window
export const PHONE_SEND_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const VERIFY_IP_MAX_PER_WINDOW = 10; // sends per IP per window
export const VERIFY_IP_WINDOW_MS = 15 * 60 * 1000;
export const PHONE_VERIFY_TOKEN_TTL_SECONDS = 10 * 60; // proof token validity

const PURPOSE = 'phone-verify';

// ── E.164 normalization ──────────────────────────────────────────────────────

/**
 * Normalize a country code + national number into E.164 ("+93700123456").
 * Digits-only input is assumed (the UI strips non-digits; the API re-checks).
 * A single leading trunk zero ("0700123456") is dropped per E.164, and the
 * combined length is validated against the ITU maximum (+15 digits total).
 * Returns null when the input cannot be a routable number.
 */
export function normalizePhoneE164(countryCode: string, national: string): string | null {
  const cc = (countryCode || '').replace(/\D/g, '');
  let nat = (national || '').replace(/\D/g, '');
  if (!cc || cc.length > 4) return null;
  if (nat.startsWith('0')) nat = nat.slice(1); // trunk prefix
  if (nat.length < 6 || nat.length > 14) return null;
  if (cc.length + nat.length > 15) return null; // E.164 max
  return `+${cc}${nat}`;
}

/** "93" + "700123456" variants of a stored phone — legacy rows may be local. */
export function phoneCandidateSet(countryCode: string, national: string): string[] {
  const cc = (countryCode || '').replace(/\D/g, '');
  const raw = (national || '').replace(/\D/g, '');
  const set = new Set<string>();
  const push = (s: string) => { if (s) set.add(s); };
  const e164 = normalizePhoneE164(cc, raw);
  if (e164) {
    push(e164); // "+93700123456"
    push(e164.slice(1)); // "93700123456"
  }
  push(`+${cc}${raw}`); // as typed, trunk zero kept
  push(`${cc}${raw}`);
  push(raw.replace(/^0/, '')); // bare national, trunk dropped
  return Array.from(set).filter((s) => s.replace(/\D/g, '').length >= 7);
}

/** Tolerant comparison used when re-checking legacy stored numbers. */
export function storedPhoneMatchesE164(stored: string, e164: string): boolean {
  const a = stored.replace(/\D/g, '');
  const b = e164.replace(/\D/g, '');
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 7 && b.length >= 7 && (a.endsWith(b) || b.endsWith(a));
}

// ── OTP store (in-memory, TTL-bounded, hash-only) ────────────────────────────

interface PendingOtp {
  hash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
}

const globalForPhoneOtp = globalThis as unknown as {
  phoneVerifyOtps: Map<string, PendingOtp>;
  phoneVerifyCooldowns: Map<string, number>; // phone -> last send epoch ms
  phoneSendCounts: Map<string, { count: number; resetAt: number }>; // phone
  phoneIpCounts: Map<string, { count: number; resetAt: number }>; // ip
  usedPhoneVerifyTokens: Map<string, number>; // sha256(token) -> exp epoch ms
};

for (const key of ['phoneVerifyOtps', 'phoneVerifyCooldowns', 'phoneSendCounts', 'phoneIpCounts', 'usedPhoneVerifyTokens']) {
  if (!(globalForPhoneOtp as Record<string, unknown>)[key]) {
    (globalForPhoneOtp as Record<string, unknown>)[key] = new Map();
  }
}

function otpHash(phoneE164: string, otp: string): string {
  // Salted with purpose + phone so a hash leaked from one context is useless
  // in another and a code cannot be moved between numbers.
  return createHash('sha256').update(`${otp}:${PURPOSE}:${phoneE164}`).digest('hex');
}

function cleanExpired<V>(map: Map<string, V>, now: number, pick: (v: V) => number): void {
  if (map.size < 500) return;
  for (const [k, v] of map) if (pick(v) < now) map.delete(k);
}

/** Store a fresh OTP for the number — replaces (invalidates) any previous one. */
export function storePhoneOtp(phoneE164: string, otp: string): void {
  const otps = globalForPhoneOtp.phoneVerifyOtps;
  otps.set(phoneE164, {
    hash: otpHash(phoneE164, otp),
    expiresAt: Date.now() + PHONE_OTP_TTL_SECONDS * 1000,
    attempts: 0,
    consumed: false,
  });
  cleanExpired(otps, Date.now(), (v) => v.expiresAt);
}

export function clearPhoneOtp(phoneE164: string): void {
  globalForPhoneOtp.phoneVerifyOtps.delete(phoneE164);
}

export type PhoneOtpCheckResult = 'ok' | 'missing' | 'expired' | 'locked' | 'invalid';

/**
 * Check a submitted code. 'ok' consumes the OTP (one-time use). Wrong codes
 * increment the attempt counter; the OTP is dropped once the cap is reached.
 */
export function checkPhoneOtp(phoneE164: string, otp: string): PhoneOtpCheckResult {
  const rec = globalForPhoneOtp.phoneVerifyOtps.get(phoneE164);
  if (!rec || rec.consumed) return 'missing';
  if (Date.now() > rec.expiresAt) {
    clearPhoneOtp(phoneE164);
    return 'expired';
  }
  if (rec.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
    clearPhoneOtp(phoneE164);
    return 'locked';
  }
  if (otpHash(phoneE164, otp) !== rec.hash) {
    rec.attempts++;
    return 'invalid';
  }
  rec.consumed = true;
  return 'ok';
}

/** Attempts left before the pending OTP is dropped (for client messaging). */
export function phoneOtpAttemptsLeft(phoneE164: string): number {
  const rec = globalForPhoneOtp.phoneVerifyOtps.get(phoneE164);
  if (!rec || rec.consumed) return 0;
  return Math.max(PHONE_OTP_MAX_ATTEMPTS - rec.attempts, 0);
}

// ── Rate limits / cooldowns ──────────────────────────────────────────────────

/** Seconds until the same number may be sent another code (0 = allowed now). */
export function phoneResendWaitSeconds(phoneE164: string): number {
  const last = globalForPhoneOtp.phoneVerifyCooldowns.get(phoneE164) || 0;
  const elapsed = (Date.now() - last) / 1000;
  return Math.max(Math.ceil(PHONE_OTP_RESEND_COOLDOWN_SECONDS - elapsed), 0);
}

/** Per-phone sliding-window send cap. True when the send is allowed. */
export function checkPhoneSendRate(phoneE164: string): boolean {
  const counts = globalForPhoneOtp.phoneSendCounts;
  const now = Date.now();
  const rec = counts.get(phoneE164);
  if (!rec || now > rec.resetAt) {
    counts.set(phoneE164, { count: 1, resetAt: now + PHONE_SEND_WINDOW_MS });
    return true;
  }
  if (rec.count >= PHONE_SEND_MAX_PER_WINDOW) return false;
  rec.count++;
  return true;
}

/** Per-IP sliding-window cap across all numbers. True when allowed. */
export function checkVerifyIpRate(ip: string): boolean {
  const counts = globalForPhoneOtp.phoneIpCounts;
  const now = Date.now();
  const rec = counts.get(ip);
  if (!rec || now > rec.resetAt) {
    counts.set(ip, { count: 1, resetAt: now + VERIFY_IP_WINDOW_MS });
    return true;
  }
  if (rec.count >= VERIFY_IP_MAX_PER_WINDOW) return false;
  rec.count++;
  return true;
}

/** Record a successful send: starts the resend cooldown. */
export function markPhoneOtpSent(phoneE164: string): void {
  globalForPhoneOtp.phoneVerifyCooldowns.set(phoneE164, Date.now());
  cleanExpired(globalForPhoneOtp.phoneSendCounts, Date.now(), (v) => v.resetAt);
  cleanExpired(globalForPhoneOtp.phoneIpCounts, Date.now(), (v) => v.resetAt);
}

// ── Proof token (signed; the register APIs re-verify and consume it) ─────────

/** Issue the short-lived, purpose-scoped proof for a verified number. */
export async function signPhoneVerificationToken(phoneE164: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, phone: phoneE164 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PHONE_VERIFY_TOKEN_TTL_SECONDS)
    .sign(getJwtSecret());
}

/**
 * Verify the proof token binds to the exact E.164 number the registration
 * is submitting. Never trusts any frontend state — only this signature.
 */
export async function verifyPhoneVerificationToken(
  token: string,
  phoneE164: string
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload.purpose === PURPOSE && payload.phone === phoneE164;
  } catch {
    return false;
  }
}

/**
 * Single-use enforcement for proof tokens (best-effort across serverless
 * instances; strict within one). Entries live at most as long as the token
 * TTL, then are dropped.
 */
export function consumePhoneVerificationToken(token: string): boolean {
  const used = globalForPhoneOtp.usedPhoneVerifyTokens;
  const key = createHash('sha256').update(token).digest('hex');
  const now = Date.now();
  if (used.has(key)) return false;
  used.set(key, now + (PHONE_VERIFY_TOKEN_TTL_SECONDS + 60) * 1000);
  cleanExpired(used, now, (v) => v);
  return true;
}
