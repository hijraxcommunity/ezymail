/**
 * Email HTML sanitizer — XSS protection for untrusted email bodies.
 *
 * Every piece of rendered email HTML (`bodyHtml`, or a plain-text `body`
 * converted to HTML) is untrusted: it can come from any sender, campaign, or
 * announcement, and reaches the DOM via `dangerouslySetInnerHTML` in the email
 * viewer. This module sanitizes that HTML before it can reach the DOM.
 *
 * Design (allowlist-based, fail-closed):
 * - Explicit element allowlist (ALLOWED_TAGS): text formatting, lists, tables,
 *   links, images, preformatted/quoted blocks — what legitimate email HTML uses.
 * - Explicit attribute allowlist (ALLOWED_ATTR). Event handlers (`on*`),
 *   `class`, `id`, `srcset`, form fields, etc. are not on it and are removed.
 *   `class` is deliberately excluded: the app stylesheet ships Tailwind
 *   utilities (e.g. `fixed inset-0 z-50`) that attacker HTML could otherwise
 *   opt into to build a phishing overlay.
 * - Explicit URL scheme allowlist (ALLOWED_URI_REGEXP): http/https, mailto,
 *   tel, callto, sms, plus scheme-relative/relative URLs. `javascript:`,
 *   `data:`, `vbscript:`, `file:`, and unknown schemes are blocked — including
 *   DOMPurify's default data:-on-media-tags exception (overridden in a hook).
 * - Dangerous active content is removed with its content: `<script>`,
 *   `<style>`, `<iframe>`, `<object>`, `<embed>`, SVG, MathML, forms, etc.
 * - Inline `style` attributes are kept (legitimate email formatting) but each
 *   declaration is filtered against a CSS denylist (see filterStyleDeclarations).
 * - Outside a browser (e.g. during SSR prerender), sanitization fails CLOSED
 *   and returns an empty string: email bodies are only ever rendered
 *   client-side after a user opens an email, and an unsanitized passthrough
 *   on the server would be a silent XSS bypass.
 *
 * The sanitizer is built on DOMPurify (Cure53, actively maintained), using its
 * window-factory form so the exact same configuration is testable under jsdom.
 */

import DOMPurify, { type Config, type WindowLike } from 'dompurify'

/**
 * Elements allowed in email HTML. Anything not listed is removed; content of
 * script-like elements (script/style/svg/iframe/math/...) is removed with the
 * element (DOMPurify's default FORBID_CONTENTS), other removed elements keep
 * their text content.
 */
export const ALLOWED_TAGS: readonly string[] = [
  // Text and inline formatting (incl. legacy email tags)
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'del', 'dfn', 'em',
  'font', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span',
  'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
  // Block structure
  'blockquote', 'center', 'div', 'figure', 'figcaption', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'p', 'pre',
  // Lists
  'dd', 'dl', 'dt', 'li', 'ol', 'ul',
  // Tables (email layouts are table-based)
  'caption', 'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr',
  // Media
  'img',
  // Inert disclosure widget used by some newsletters
  'details', 'summary',
]

/**
 * Attributes allowed on the elements above. Note:
 * - `target` is allowed so legitimate links keep their open-in-new-tab
 *   behavior; the afterSanitizeAttributes hook forces `rel="noopener
 *   noreferrer"` on any link that carries a target (reverse-tabnabbing guard).
 * - `style` is allowed but its content is filtered by the CSS hook below.
 * - `background`/`formaction`/`srcset`/`data-*`/`id`/`name` etc. are not
 *   allowed and are stripped.
 */
export const ALLOWED_ATTR: readonly string[] = [
  // Links
  'href', 'target', 'title',
  // Images
  'src', 'alt', 'width', 'height',
  // Styling and text direction/localization (RTL emails need dir/lang)
  'style', 'dir', 'lang',
  // Legacy table layout attributes common in email HTML
  'align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'colspan',
  'rowspan', 'valign', 'summary',
]

/**
 * URL schemes allowed in URI attributes (href/src). Mirrors DOMPurify's
 * default allowlist minus ftp/cid/xmpp (unused by this app); the `[^a-z]`
 * and scheme-less branches keep relative URLs such as `/api/attachments/...`
 * and `image.png` working. Anchored at the start so lookalike schemes fail.
 */
export const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|callto|sms):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

/**
 * CSS declaration denylist for inline `style` attributes. Any declaration
 * matching one of these patterns is dropped (fail closed):
 * - url()/image-set(): remote resource loads, tracking pixels, exfiltration
 * - expression()/behavior/-moz-binding/progid: script execution in legacy IE
 * - javascript:/vbscript: inside CSS values
 * - @import inside style values
 * - position:fixed/absolute: overlay-phishing layouts (UI clickjacking);
 *   relative/static/sticky positioning stays allowed
 */
const CSS_DENYLIST: readonly RegExp[] = [
  /url\s*\(/i,
  /image-set\s*\(/i,
  /expression\s*\(/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /@import/i,
  /behavior\s*:/i,
  /-moz-binding/i,
  /progid\s*:/i,
  /position\s*:\s*["']?\s*(?:fixed|absolute)\b/i,
]

export function filterStyleDeclarations(css: string): string {
  return css
    .split(';')
    .filter((declaration) => {
      const d = declaration.trim()
      if (!d) return false
      return !CSS_DENYLIST.some((pattern) => pattern.test(d))
    })
    .join(';')
}

/** DOMPurify configuration — explicit, allowlist-based. */
const CONFIG: Config = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...ALLOWED_ATTR],
  ALLOWED_URI_REGEXP,
  // No data-* attributes (inert but unnecessary surface).
  ALLOW_DATA_ATTR: false,
  // Only the schemes in ALLOWED_URI_REGEXP.
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // mXSS hardening (jQuery 3.0-era self-closing-in-attribute trick).
  ALLOW_SELF_CLOSE_IN_ATTR: false,
  // Keep text of removed wrappers (e.g. unknown tags), while script-like
  // elements still lose their content via DOMPurify's default FORBID_CONTENTS.
  KEEP_CONTENT: true,
  // Emails are stored as body fragments; full documents are unwrapped to
  // their body content (head/meta/style inside head are dropped entirely).
  WHOLE_DOCUMENT: false,
  // Return a string for dangerouslySetInnerHTML (default, explicit).
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
  // DOM clobbering protection for document/form property names (default).
  SANITIZE_DOM: true,
}

/**
 * Builds a sanitizer bound to a specific window (browser: the real window;
 * tests: a jsdom window). Hooks are registered per-instance.
 */
export function createEmailHtmlSanitizer(root: WindowLike): (html: string) => string {
  const purify = DOMPurify(root)

  purify.addHook('uponSanitizeAttribute', (_node, data) => {
    // Block every data: URI. DOMPurify 3.4 allows any data: value on
    // src/href of media tags (img/audio/video/source/track) by default,
    // without a MIME-type restriction; this app's inline images always use
    // real (usually relative) URLs, so data: is pure attack surface here.
    const rawValue = typeof data.attrValue === 'string' ? data.attrValue : ''
    if (rawValue.replace(/^[\s\u0000-\u0020]+/, '').toLowerCase().startsWith('data:')) {
      data.keepAttr = false
      return
    }
    if (data.attrName !== 'style') return
    const filtered = filterStyleDeclarations(data.attrValue)
    if (filtered.trim() === '') {
      // Every declaration was dangerous — drop the attribute entirely.
      data.keepAttr = false
      return
    }
    data.attrValue = filtered
  })

  purify.addHook('afterSanitizeAttributes', (node) => {
    // Any email-forced `target="_blank"` is hardened against reverse
    // tabnabbing. Links without target keep their default behavior.
    if (node.nodeName === 'A' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })

  return (html: string) => purify.sanitize(html, CONFIG)
}

const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined'

const browserSanitize = isBrowser
  ? createEmailHtmlSanitizer(window as unknown as WindowLike)
  : null

/**
 * Sanitizes untrusted email HTML for safe rendering with
 * `dangerouslySetInnerHTML`. Fails closed (empty string) outside the browser.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return html
  if (!browserSanitize) return ''
  return browserSanitize(html)
}
