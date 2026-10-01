/**
 * OpenWA WhatsApp provider — SERVER ONLY.
 *
 * Sends password-recovery OTP messages through the self-hosted OpenWA
 * instance. The API key lives exclusively in the server-side environment
 * (OPENWA_API_KEY) and is never exposed to the browser, API responses or
 * logs.
 *
 * Endpoint/request format per the gateway's own live OpenAPI spec
 * (/api/docs-json, OpenWA API v0.23.5 — full REST API with session-scoped
 * routes):
 *   POST {OPENWA_API_URL}/api/sessions/{sessionId}/messages/send-text
 *   headers: Content-Type: application/json, X-API-Key: <key>
 *   body:    { "chatId": "<number>@c.us", "text": "<message>" }
 *
 * A 2xx response means the gateway accepted the message for sending
 * (201 carries a messageId); WhatsApp delivery is asynchronous by design.
 *
 * Resilience behaviour (so one wrong env value can never silently break
 * delivery again):
 *  - Every env value is trimmed, so a pasted trailing space/newline in
 *    Vercel env vars cannot corrupt the URL, key or session name.
 *  - Local-format phone numbers (leading trunk zero, e.g. "0700123456")
 *    are completed with the default country code (93, override with
 *    OPENWA_DEFAULT_COUNTRY_CODE) so the chatId is routable — a bare
 *    "700123456@c.us" is not.
 *  - If OPENWA_SESSION_ID is unset, the gateway is asked for its sessions
 *    and a running one is used automatically. If the configured session
 *    404s, the gateway is asked once and the send is retried on the
 *    discovered running session.
 *  - Every failure carries a coarse public reason (UNREACHABLE / AUTH /
 *    SESSION_NOT_FOUND / SEND_REJECTED / NOT_CONFIGURED) so the caller can
 *    surface the failure CLASS without leaking the key, the OTP or the
 *    gateway's raw error text.
 */

const DEFAULT_OPENWA_URL = 'http://localhost:2785';
const DEFAULT_COUNTRY_CODE = '93';
const OPENWA_TIMEOUT_MS = 15_000;

/** Coarse failure classes safe to expose to the client. */
export type OpenWAFailureReason =
  | 'NOT_CONFIGURED' // missing API key (or unusable phone)
  | 'UNREACHABLE' // DNS / network / timeout — tunnel down or wrong URL
  | 'AUTH' // gateway rejected the API key (401/403)
  | 'SESSION_NOT_FOUND' // session name wrong / not running (404)
  | 'SEND_REJECTED'; // any other gateway rejection

/** Error type that never carries the API key or the OTP value. */
export class OpenWAError extends Error {
  public readonly status?: number;
  public readonly reason: OpenWAFailureReason;

  constructor(message: string, reason: OpenWAFailureReason, status?: number) {
    super(message);
    this.name = 'OpenWAError';
    this.status = status;
    this.reason = reason;
  }
}

function classifyStatus(status: number): OpenWAFailureReason {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'SESSION_NOT_FOUND';
  return 'SEND_REJECTED';
}

/** Gateway error body → single-line, truncated detail (no key/OTP inside). */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    return '';
  }
}

interface GatewaySession {
  id?: unknown;
  state?: unknown;
  status?: unknown;
  ready?: unknown;
}

function isRunningSession(session: GatewaySession): boolean {
  return session.state === 'running' || session.status === 'connected' || session.ready === true;
}

/** Ask the gateway which sessions exist (OpenWA v0.23.5: GET /api/sessions). */
async function listSessions(baseUrl: string, apiKey: string): Promise<GatewaySession[]> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/sessions`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(OPENWA_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new OpenWAError('OpenWA is unreachable', 'UNREACHABLE');
  }
  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new OpenWAError(
      `OpenWA session list failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
      classifyStatus(response.status),
      response.status
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new OpenWAError('OpenWA session list returned a non-JSON body', 'SESSION_NOT_FOUND');
  }
  if (!Array.isArray(data)) {
    throw new OpenWAError('OpenWA session list returned an unexpected shape', 'SESSION_NOT_FOUND');
  }
  return data as GatewaySession[];
}

async function discoverSessionId(baseUrl: string, apiKey: string): Promise<string> {
  const sessions = await listSessions(baseUrl, apiKey);
  const picked = sessions.find(isRunningSession) ?? sessions.find((s) => typeof s.id === 'string');
  if (!picked || typeof picked.id !== 'string' || !picked.id) {
    throw new OpenWAError(
      'No usable session found on the OpenWA gateway (is the WhatsApp session running?)',
      'SESSION_NOT_FOUND'
    );
  }
  return picked.id;
}

/**
 * Normalize a stored phone number into the OpenWA chatId format
 * ("93700123456@c.us"). Local-format numbers (leading trunk zero, e.g.
 * "0700123456") get the default country code prefix, because WhatsApp
 * cannot route a country-code-less chatId. Already-international numbers
 * pass through untouched.
 */
export function normalizeToChatId(phone: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  let digits = phone.replace(/\D/g, '').replace(/^0{2}/, ''); // "00" intl prefix, if ever present
  const isLocalTrunk = digits.startsWith('0');
  digits = digits.replace(/^0+/, ''); // local trunk prefix
  if (!digits) {
    throw new OpenWAError('No usable phone number for WhatsApp delivery', 'NOT_CONFIGURED');
  }
  if (countryCode && isLocalTrunk && !digits.startsWith(countryCode)) {
    digits = countryCode + digits;
  } else if (countryCode && !isLocalTrunk && digits.length <= 10 && !digits.startsWith(countryCode)) {
    // Bare subscriber number without trunk zero ("700123456") — same treatment.
    digits = countryCode + digits;
  }
  return `${digits}@c.us`;
}

/**
 * Send the password-recovery OTP to the account's WhatsApp number.
 * Throws OpenWAError (with a coarse .reason) on any failure; callers must
 * map that to a generic user-facing message. The OTP value is never logged
 * here.
 */
export async function sendWhatsAppOTP(phoneNumber: string, otp: string): Promise<void> {
  // .trim() so a pasted trailing space/newline in an env var cannot corrupt values
  const baseUrl = (process.env.OPENWA_API_URL || DEFAULT_OPENWA_URL).trim().replace(/\/+$/, '');
  const apiKey = process.env.OPENWA_API_KEY?.trim() || undefined;
  const configuredSession = process.env.OPENWA_SESSION_ID?.trim().replace(/\/+$/, '') || undefined;
  const countryCode = (process.env.OPENWA_DEFAULT_COUNTRY_CODE || DEFAULT_COUNTRY_CODE).trim().replace(/\D/g, '');

  if (!apiKey) {
    throw new OpenWAError('OpenWA API key is not configured', 'NOT_CONFIGURED');
  }

  const chatId = normalizeToChatId(phoneNumber, countryCode);

  // Same user-facing meaning the recovery flow has always communicated.
  const message = [
    `Your EzyMail password recovery code is: ${otp}`,
    '',
    'This code expires in 10 minutes.',
    'Do not share this code with anyone.',
  ].join('\n');

  const send = async (sessionId: string): Promise<Response> =>
    fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ chatId, text: message }),
      signal: AbortSignal.timeout(OPENWA_TIMEOUT_MS),
      cache: 'no-store',
    });

  // Resolve which session to use: the configured one, or auto-discovery.
  const sessionId = configuredSession ?? (await discoverSessionId(baseUrl, apiKey));

  let response: Response;
  try {
    response = await send(sessionId);
  } catch {
    // Network / timeout / DNS failure — details stay server-side.
    throw new OpenWAError('OpenWA is unreachable', 'UNREACHABLE');
  }

  if (!response.ok) {
    const detail = await readErrorBody(response);

    // 404 = the configured session name is wrong/stale on this gateway.
    // Ask the gateway once for a running session and retry there.
    if (response.status === 404) {
      const discovered = await discoverSessionId(baseUrl, apiKey).catch(() => null);
      if (discovered && discovered !== sessionId) {
        let retry: Response;
        try {
          retry = await send(discovered);
        } catch {
          throw new OpenWAError('OpenWA is unreachable', 'UNREACHABLE');
        }
        if (retry.ok) return; // delivered via the discovered session
        const retryDetail = await readErrorBody(retry);
        throw new OpenWAError(
          `OpenWA request failed with status ${retry.status}${retryDetail ? `: ${retryDetail}` : ''}`,
          classifyStatus(retry.status),
          retry.status
        );
      }
    }

    // Capture the gateway's own error words (e.g. "Session not active") so the
    // server log names the exact cause. Server logs only — the API route maps
    // this to a generic user-facing message plus a coarse reason class.
    throw new OpenWAError(
      `OpenWA request failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
      classifyStatus(response.status),
      response.status
    );
  }

  // 2xx = the gateway accepted the message for sending (201 carries a
  // messageId). Delivery itself is asynchronous on WhatsApp's side — the
  // body is informational only, so nothing needs parsing here.
}
