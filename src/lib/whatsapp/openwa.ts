/**
 * OpenWA WhatsApp provider — SERVER ONLY.
 *
 * Sends password-recovery OTP messages through the self-hosted OpenWA
 * (open-wa EASY API) instance. The API key lives exclusively in the
 * server-side environment (OPENWA_API_KEY) and is never exposed to the
 * browser, API responses or logs.
 *
 * Endpoint/request format per the official OpenWA EASY API documentation
 * (docs.openwa.dev — EASY API middleware):
 *   POST {OPENWA_API_URL}/sendText
 *   headers: Content-Type: application/json, X-API-Key: <key>
 *   body:    { "args": [ "<number>@c.us", "<message>" ] }
 *
 * The default URL assumes OpenWA runs on the same machine as this backend.
 * In production, set OPENWA_API_URL to the real OpenWA server URL — no code
 * change required.
 */

const DEFAULT_OPENWA_URL = 'http://localhost:2785';
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
 * chatId format documented by the EASY API ("93700123456@c.us").
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
    response = await fetch(`${baseUrl}/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ args: [chatId, message] }),
      signal: AbortSignal.timeout(OPENWA_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    // Network / timeout / DNS failure — details stay server-side.
    throw new OpenWAError('OpenWA is unreachable');
  }

  if (!response.ok) {
    throw new OpenWAError(`OpenWA request failed with status ${response.status}`, response.status);
  }

  // The EASY API sendText returns the message id string, or literal `false`
  // when WhatsApp refused the send. Treat `false` as a delivery failure.
  try {
    const result: unknown = await response.json();
    if (result === false) {
      throw new OpenWAError('OpenWA could not deliver the message');
    }
  } catch (error) {
    if (error instanceof OpenWAError) throw error;
    // Non-JSON 2xx body — accept the send, nothing sensitive to parse.
  }
}
