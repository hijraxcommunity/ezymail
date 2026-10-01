/**
 * OpenWA WhatsApp provider — SERVER ONLY.
 *
 * Sends password-recovery OTP messages through the self-hosted OpenWA
 * (open-wa EASY API) instance. The API key lives exclusively in the
 * server-side environment (OPENWA_API_KEY) and is never exposed to the
 * browser, API responses or logs.
 *
 * Endpoint/request format per the gateway's own live OpenAPI spec
 * (/api/docs-json, OpenWA API v0.23.5 — full REST API with session-scoped
 * routes, NOT the EASY API flavor):
 *   POST {OPENWA_API_URL}/api/sessions/{sessionId}/messages/send-text
 *   headers: Content-Type: application/json, X-API-Key: <key>
 *   body:    { "chatId": "<number>@c.us", "text": "<message>" }
 *
 * A 2xx response means the gateway accepted the message for sending
 * (201 carries a messageId); WhatsApp delivery is asynchronous by design.
 *
 * The default URL assumes OpenWA runs on the same machine as this backend.
 * In production, set OPENWA_API_URL to the real OpenWA server URL and
 * OPENWA_SESSION_ID to the gateway session name (default: "default") — no
 * code change required.
 */

const DEFAULT_OPENWA_URL = 'http://localhost:2785';
const DEFAULT_OPENWA_SESSION = 'default';
const OPENWA_TIMEOUT_MS = 15_000;

/** Error type that never carries the API key or the OTP value. */
export class OpenWAError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OpenWAError';
    this.status = status;
  }
}

/**
 * Normalize the stored account phone (e.g. "+93700123456") into the OpenWA
 * chatId format ("93700123456@c.us").
 * Reuses the single phone number already stored on the account — this is
 * NOT a second phone-number system.
 */
function normalizeToChatId(phone: string): string {
  const digits = phone
    .replace(/\D/g, '')
    .replace(/^0{2}/, '') // international "00" prefix, if ever present
    .replace(/^0+/, ''); // local trunk prefix, if ever present
  if (!digits) {
    throw new OpenWAError('No usable phone number for WhatsApp delivery');
  }
  return `${digits}@c.us`;
}

/**
 * Send the password-recovery OTP to the account's WhatsApp number.
 * Throws OpenWAError on any failure; callers must map that to a generic
 * user-facing message. The OTP value is never logged here.
 */
export async function sendWhatsAppOTP(phoneNumber: string, otp: string): Promise<void> {
  const baseUrl = (process.env.OPENWA_API_URL || DEFAULT_OPENWA_URL).replace(/\/+$/, '');
  const apiKey = process.env.OPENWA_API_KEY;
  const sessionId = (process.env.OPENWA_SESSION_ID || DEFAULT_OPENWA_SESSION).replace(/\/+$/, '');

  if (!apiKey) {
    throw new OpenWAError('OpenWA API key is not configured');
  }

  const chatId = normalizeToChatId(phoneNumber);

  // Same user-facing meaning the recovery flow has always communicated.
  const message = [
    `Your EzyMail password recovery code is: ${otp}`,
    '',
    'This code expires in 10 minutes.',
    'Do not share this code with anyone.',
  ].join('\n');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ chatId, text: message }),
      signal: AbortSignal.timeout(OPENWA_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    // Network / timeout / DNS failure — details stay server-side.
    throw new OpenWAError('OpenWA is unreachable');
  }

  if (!response.ok) {
    // Capture the gateway's own error words (e.g. "Session not active") so the
    // Vercel log names the exact cause. Server logs only — the API route maps
    // this to a generic user-facing message. Truncated; contains no key/OTP.
    let detail = '';
    try {
      const raw = await response.text();
      detail = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
      detail = '';
    }
    throw new OpenWAError(
      `OpenWA request failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
      response.status
    );
  }

  // 2xx = the gateway accepted the message for sending (201 carries a
  // messageId). Delivery itself is asynchronous on WhatsApp's side — the
  // body is informational only, so nothing needs parsing here.
}
