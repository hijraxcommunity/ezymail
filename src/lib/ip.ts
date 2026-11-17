/**
 * F-43: one shared client-IP derivation for rate limiting and audit fields,
 * replacing ~19 per-route copies that trusted the raw `x-forwarded-for`
 * header verbatim (a forged header rotated the login rate-limit bucket per
 * fake IP and poisoned AdminLog IP fields).
 *
 * Preference order:
 * 1. `x-real-ip` — on the production platform (Vercel) this is set and
 *    overwritten by the edge per request, so clients cannot forge it there.
 * 2. The first `x-forwarded-for` entry — kept as the fallback because that
 *    is what every existing call site (and the local E2E harnesses) used;
 *    on the single-proxy production platform the edge overwrites it too.
 *
 * Residual, documented with F-32: on a multi-hop proxy deployment the
 * leftmost `x-forwarded-for` entry is client-controlled — the complete fix
 * is a trusted-proxy allowlist or platform WAF, tracked together with the
 * shared-store limiter residual.
 */
export function getClientIp(request: { headers: Headers }): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
