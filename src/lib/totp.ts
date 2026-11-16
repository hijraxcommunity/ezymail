import { createHmac, randomFillSync, randomInt } from 'crypto';

const TIME_STEP = 30; // seconds
const DIGITS = 6;

/**
 * Base32 decode a string (RFC 4648) - supports both upper and lowercase
 */
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = str.toUpperCase().replace(/[=]+$/, '');
  const bits: string[] = [];

  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits.push(val.toString(2).padStart(5, '0'));
  }

  const bitString = bits.join('');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bitString.length; i += 8) {
    bytes.push(parseInt(bitString.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random base32 secret (16 bytes = 26 characters)
 */
export function generateSecret(): string {
  const bytes = randomFillSync(Buffer.alloc(16));

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  const bits: string[] = [];
  for (const byte of bytes) {
    bits.push(byte.toString(2).padStart(8, '0'));
  }
  const bitString = bits.join('');
  for (let i = 0; i + 5 <= bitString.length; i += 5) {
    result += alphabet[parseInt(bitString.slice(i, i + 5), 2)];
  }

  // Pad to 26 characters (multiple of 8)
  while (result.length % 8 !== 0) {
    result += alphabet[randomInt(0, 32)];
  }

  return result;
}

/**
 * Generate a TOTP code from a base32 secret
 */
export function generateTOTP(secret: string): string {
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TIME_STEP);

  // Convert counter to 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(0, 0);
  counterBuf.writeUInt32BE(counter, 4);

  const hmac = createHmac('sha1', key);
  hmac.update(counterBuf);
  const digest = hmac.digest();

  // Dynamic truncation
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (code % Math.pow(10, DIGITS)).toString().padStart(DIGITS, '0');
}

/**
 * Verify a TOTP code against a secret
 * Allows 1 step before and after for clock drift
 */
export function verifyTOTP(secret: string, code: string): boolean {
  if (!code || code.length !== DIGITS) return false;

  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TIME_STEP);

  // Check current, previous, and next counter values
  for (const offset of [-1, 0, 1]) {
    const c = counter + offset;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(0, 0);
    counterBuf.writeUInt32BE(c, 4);

    const hmac = createHmac('sha1', key);
    hmac.update(counterBuf);
    const digest = hmac.digest();

    const off = digest[digest.length - 1] & 0x0f;
    const num =
      ((digest[off] & 0x7f) << 24) |
      ((digest[off + 1] & 0xff) << 16) |
      ((digest[off + 2] & 0xff) << 8) |
      (digest[off + 3] & 0xff);

    const expected = (num % Math.pow(10, DIGITS)).toString().padStart(DIGITS, '0');
    if (expected === code) return true;
  }

  return false;
}

/**
 * F-48: replay guard. verifyTOTP accepts the current ±1 time-step, so within
 * a 30-second window the SAME code verifies twice — an attacker who captures
 * a code (phished page, shoulder-surf, log leak) gets a free login while it
 * is still valid. This wrapper records the time-step each user last consumed
 * and refuses to accept the same step twice.
 *
 * Storage is in-memory, so on serverless each instance tracks independently
 * (the same accepted limitation as the other in-memory limiter state in this
 * codebase, see audit S-02). It still closes the same-instance replay, which
 * is the realistic case: the phished code is replayed within seconds.
 * Backup codes are unaffected — they are single-use by construction (the
 * login route consumes them from the stored list).
 */
const lastUsedStepByUser = new Map<string, number>();

export function verifyTOTPSingleUse(userId: string, secret: string, code: string): boolean {
  if (!code || code.length !== DIGITS) return false;

  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TIME_STEP);

  for (const offset of [-1, 0, 1]) {
    const c = counter + offset;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(0, 0);
    counterBuf.writeUInt32BE(c, 4);

    const hmac = createHmac('sha1', key);
    hmac.update(counterBuf);
    const digest = hmac.digest();

    const off = digest[digest.length - 1] & 0x0f;
    const num =
      ((digest[off] & 0x7f) << 24) |
      ((digest[off + 1] & 0xff) << 16) |
      ((digest[off + 2] & 0xff) << 8) |
      (digest[off + 3] & 0xff);

    const expected = (num % Math.pow(10, DIGITS)).toString().padStart(DIGITS, '0');
    if (expected === code) {
      // The code matches time-step c. If that step was already consumed by a
      // successful login, it is a replay — reject it.
      if (lastUsedStepByUser.get(userId) === c) return false;
      lastUsedStepByUser.set(userId, c);
      // Keep the map bounded: entries older than a few windows are useless.
      if (lastUsedStepByUser.size > 10000) {
        const cutoff = counter - 10;
        for (const [uid, step] of lastUsedStepByUser) {
          if (step < cutoff) lastUsedStepByUser.delete(uid);
        }
      }
      return true;
    }
  }

  return false;
}

/**
 * Generate 10 random 6-digit backup codes (F-48: CSPRNG — these grant
 * account access, so they must come from a cryptographic RNG, not
 * Math.random).
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(randomInt(100000, 1000000).toString());
  }
  return codes;
}

/**
 * Build an otpauth:// URI for TOTP
 */
export function buildOtpAuthUri(email: string, secret: string): string {
  const issuer = 'EzyMail';
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${TIME_STEP}`;
}
