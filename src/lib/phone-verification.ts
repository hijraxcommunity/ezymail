/**
 * Server-only phone verification for REGISTRATION and PROFILE PHONE CHANGES
 * (WhatsApp OTP).
 *
 * Reuses the single OpenWA sender in @/lib/whatsapp/openwa.ts — this module
 * only owns the secure OTP lifecycle and the short-lived proof token that
 * the register/profile APIs require:
 *
 *   send:   normalize to E.164 -> rate/cooldown checks -> generate OTP with
 *           crypto.randomInt -> store ONLY its sha256 hash -> deliver via
 *           the existing OpenWA sender.
 *   verify: constant-shape hash check, 5 attempts max, one-time consumption,
 *           5-minute expiry -> on success issue a signed, purpose-scoped JWT
 *           bound to the exact E.164 number (10-minute validity, single use).
 *
 * The register/profile APIs later re-verify that JWT against the submitted
 * phone and consume it, so the frontend's "verified" state is never trusted.
 *
 * Storage is the shared PostgreSQL server-state store (D4, Batch 9 — see
 * src/lib/server-state.ts): TTL-bounded, hash-only, atomically consumed.
 * Before Batch 9 the OTP lives in a per-instance Map, which on serverless
 * meant a code minted on instance A could be unverifiable on instance B
 * (audit S-02) and the brute-force caps reset on every cold start. The
 * database-level unique constraint on User.phone remains the hard guarantee
 * against two accounts sharing one number. No OTP or phone value is ever
 * logged.
 */

import { createHash, randomInt } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtSecret } from '@/lib/auth';
import {
  storeOtpChallenge,
  clearOtpChallenge,
  checkOtpChallenge,
  otpAttemptsLeft,
  checkRateLimitWindow,
  consumeSingleUseToken,
  kvGet,
  kvSet,
} from '@/lib/server-state';

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

/**
 * Normalize a phone STRING that already carries its country code (the shape
 * the profile-change flow submits: "+93 700 123 456" or "+93700123456").
 * Accepts a single leading '+' plus 8..15 digits (ITU minimum is 8: 1-4 CC +
 * 6-14 national, with the shortest real ranges at 7-8 digits; we require the
 * same >=7-digit floor the candidate set applies). Returns null otherwise.
 */
export function normalizePhoneStringE164(raw: string): string | null {
  const s = (raw || '').trim();
  if (!/^\+[0-9\s-]{7,19}$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
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

/**
 * Tolerant equality between a phone the client submits and the one stored
 * on a legacy row: digits-only comparison, ignoring the leading '+' / trunk
 * zero and accepting a shared-suffix match for local vs international forms
 * (same normalization family as phoneMatches() in the forgot-password route,
 * which has matched legacy shapes in production since F-03). Used ONLY to
 * decide "the user did not actually change their phone" — a genuinely new
 * number always goes through the full OTP proof path.
 */
export function sameStoredPhone(a: string, b: string): boolean {
  const digitsOf = (s: string) => {
    let d = (s || '').replace(/\D/g, '');
    d = d.replace(/^0+/, ''); // trunk zero(s)
    return d;
  };
  const x = digitsOf(a);
  const y = digitsOf(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Local vs international forms share the national-number suffix
  // ("700123456" vs "93700123456") — the same tolerance phoneMatches uses.
  return x.length >= 7 && y.length >= 7 && (x.endsWith(y) || y.endsWith(x));
}

// ── OTP challenge store (shared PostgreSQL; hash-only) ───────────────────────

function otpHash(phoneE164: string, otp: string): string {
  // Salted with purpose + phone so a hash leaked from one context is useless
  // in another and a code cannot be moved between numbers.
  return createHash('sha256').update(`${otp}:${PURPOSE}:${phoneE164}`).digest('hex');
}

/** Store a fresh OTP for the number — replaces (invalidates) any previous one. */
export function storePhoneOtp(phoneE164: string, otp: string): Promise<void> {
  return storeOtpChallenge(PURPOSE, phoneE164, otpHash(phoneE164, otp), PHONE_OTP_TTL_SECONDS);
}

export function clearPhoneOtp(phoneE164: string): Promise<void> {
  return clearOtpChallenge(PURPOSE, phoneE164);
}

export type PhoneOtpCheckResult = 'ok' | 'missing' | 'expired' | 'locked' | 'invalid';

/**
 * Check a submitted code. 'ok' consumes the OTP (one-time use). Wrong codes
 * increment the attempt counter; the OTP is dropped once the cap is reached.
 * All branches are atomic conditional writes on the shared store, so a
 * replay of a correct code can never verify twice (see server-state).
 */
export function checkPhoneOtp(phoneE164: string, otp: string): Promise<PhoneOtpCheckResult> {
  return checkOtpChallenge(PURPOSE, phoneE164, otpHash(phoneE164, otp), PHONE_OTP_MAX_ATTEMPTS);
}

/** Attempts left before the pending OTP is dropped (for client messaging). */
export function phoneOtpAttemptsLeft(phoneE164: string): Promise<number> {
  return otpAttemptsLeft(PURPOSE, phoneE164, PHONE_OTP_MAX_ATTEMPTS);
}

// ── Rate limits / cooldowns (shared) ─────────────────────────────────────────

/** Seconds until the same number may be sent another code (0 = allowed now). */
export async function phoneResendWaitSeconds(phoneE164: string): Promise<number> {
  const last = await kvGet(`phone-cooldown:${phoneE164}`);
  if (!last) return 0;
  const lastMs = Number(last);
  if (!Number.isFinite(lastMs)) return 0;
  const elapsed = (Date.now() - lastMs) / 1000;
  return Math.max(Math.ceil(PHONE_OTP_RESEND_COOLDOWN_SECONDS - elapsed), 0);
}

/** Per-phone sliding-window send cap. True when the send is allowed. */
export function checkPhoneSendRate(phoneE164: string): Promise<boolean> {
  return checkRateLimitWindow(`phone-send:${phoneE164}`, PHONE_SEND_MAX_PER_WINDOW, PHONE_SEND_WINDOW_MS);
}

/** Per-IP sliding-window cap across all numbers. True when allowed. */
export function checkVerifyIpRate(ip: string): Promise<boolean> {
  return checkRateLimitWindow(`verify-ip:${ip}`, VERIFY_IP_MAX_PER_WINDOW, VERIFY_IP_WINDOW_MS);
}

/** Record a successful send: starts the resend cooldown. */
export function markPhoneOtpSent(phoneE164: string): Promise<void> {
  return kvSet(
    `phone-cooldown:${phoneE164}`,
    String(Date.now()),
    PHONE_OTP_RESEND_COOLDOWN_SECONDS * 1000
  );
}

// ── Proof token (signed; the register/profile APIs re-verify and consume it) ──

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
 * or profile change is submitting. Never trusts any frontend state — only
 * this signature.
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
 * Single-use enforcement for proof tokens. D4 (Batch 9): the guard is now a
 * unique row in the shared store (first consume wins, exact under
 * concurrency), closing the old best-effort per-instance map.
 */
export function consumePhoneVerificationToken(token: string): Promise<boolean> {
  return consumeSingleUseToken(token, PHONE_VERIFY_TOKEN_TTL_SECONDS);
}
