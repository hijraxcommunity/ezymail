import { randomUUID } from 'crypto';

/**
 * Server-side attachment validation for POST /api/emails (audit F-04).
 *
 * The compose UI previously sent an attachments array that was stored
 * verbatim (`JSON.stringify(attachments)`), which let a client set
 * attacker-controlled `name`/`url` metadata on stored email rows — the
 * metadata later flows into the attachment viewer (Print XSS) and the
 * attachment serving endpoint. This sanitizer is the single write path:
 *
 *  - `name` is restricted to the same charset as POST /api/upload
 *    ([a-zA-Z0-9._-], max 255 chars) and never starts with dots.
 *  - `url` is NEVER taken from the client — it is regenerated server-side
 *    from the owner id + a fresh UUID + the sanitized name, keeping the
 *    exact path shape the serving route matches against.
 *  - `data` must be a strict base64 data URL, size-capped to the same
 *    limits as POST /api/upload, and `type` is derived from the data URL
 *    itself (not from a client-supplied field).
 *  - Active-content MIME types (HTML/XHTML/SVG) are rejected at entry;
 *    they have no legitimate attach flow and are pure XSS vectors.
 */
const MAX_FILES = 5;
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB per file — same as POST /api/upload
const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // 3MB total — same as POST /api/upload

const FORBIDDEN_MIME = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
]);

// Strict data-URL grammar: <mime>;base64,<b64> with no whitespace or extras.
const DATA_URL_RE = /^data:([a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*);base64,([A-Za-z0-9+/]+={0,2})$/;

export interface SanitizedAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
  data: string;
}

export type SanitizeAttachmentsResult =
  | { ok: true; value: SanitizedAttachment[] }
  | { ok: false; error: string };

export function sanitizeAttachments(
  input: unknown,
  ownerUserId: string
): SanitizeAttachmentsResult {
  if (input === undefined || input === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Attachments must be an array' };
  }
  if (input.length > MAX_FILES) {
    return { ok: false, error: `You can attach up to ${MAX_FILES} files per email` };
  }

  const out: SanitizedAttachment[] = [];
  let totalBytes = 0;

  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: 'Invalid attachment entry' };
    }
    const rec = entry as Record<string, unknown>;

    const rawName = typeof rec.name === 'string' ? rec.name : '';
    const safeName = rawName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '_')
      .slice(0, 255);
    if (!safeName || !/[a-zA-Z0-9]/.test(safeName)) {
      return { ok: false, error: 'Attachment name is invalid' };
    }

    const data = typeof rec.data === 'string' ? rec.data : '';
    const match = DATA_URL_RE.exec(data);
    if (!match) {
      return { ok: false, error: `Attachment "${safeName}" has invalid or missing file data` };
    }
    const mime = match[1].toLowerCase();
    if (FORBIDDEN_MIME.has(mime)) {
      return { ok: false, error: 'Files of type "' + mime + '" cannot be attached' };
    }
    const base64 = match[2];

    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0) {
      return { ok: false, error: `Attachment "${safeName}" is empty` };
    }
    if (bytes.length > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `File "${safeName}" exceeds the ${MAX_FILE_BYTES / 1024 / 1024}MB per-file limit`,
      };
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return {
        ok: false,
        error: `Total attachment size cannot exceed ${MAX_TOTAL_BYTES / 1024 / 1024}MB`,
      };
    }

    out.push({
      name: safeName,
      url: `/api/attachments/${ownerUserId}_${randomUUID()}_${safeName}`,
      size: bytes.length,
      type: mime,
      data: `data:${mime};base64,${base64}`,
    });
  }

  return { ok: true, value: out };
}
