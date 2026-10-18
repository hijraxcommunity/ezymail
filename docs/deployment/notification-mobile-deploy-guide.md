# EzyMail — Notification & Mobile Deployment Guide (Phase 6)

Date: 2026-10-18 · Audience: repo owner
Rule honored: **environment variable NAMES only below — values are never printed, stored, or
committed anywhere.**

Status vocabulary used throughout:
- **COMMITTED** = exists in a git commit
- **DEPLOYED** = live on Vercel production (https://ezymail.vercel.app)
- **VERIFIED** = observed working on real production / real device

---

## 1. Current status snapshot (update as things ship)

| Item | Status |
|---|---|
| Phase 1 audit (`docs/audits/2026-10-18-notification-mobile-audit.md`) | COMMITTED (local, awaiting push) |
| Phase 2 fixes 2a/2b/2c (SW hardening, after() dispatch, deep links) | COMMITTED (local, awaiting push) — NOT YET DEPLOYED |
| Payload tests 7/7 + API battery 23/23 + browser E2E | VERIFIED (isolated sandbox rig only) |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` on Vercel | VERIFIED BY OWNER (exists as a var) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` on Vercel | OWNER CONFIRMS PRESENT — re-check cheaply post-deploy (Section 5) |
| Push subscriptions table populated in production | UNKNOWN — check after deploy (Section 5) |
| Capacitor android/ios shells | NOT STARTED (Phase 3 decision committed; no SDKs in sandbox) |
| iOS build/device verification | NOT PERFORMED (no macOS/Xcode) — see Phase 4 checklist |

## 2. Environment variables (names + purpose only)

| Name | Where it is read | Purpose | Sensitive? |
|---|---|---|---|
| `DATABASE_URL` | Prisma | Neon Postgres connection | YES — rotate if ever exposed |
| `JWT_SECRET` | `src/lib/auth.ts` | Session signing | YES |
| `CRON_SECRET` | `/api/cron/trial-expiry` | Vercel Cron bearer | YES |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `sendPushNotification.ts` | FCM v1 server auth (full JSON, single line) | YES — server-only, never NEXT_PUBLIC |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | `push-notification-setup.tsx` | Web Push subscribe (build-time; **redeploy required after changing**) | Public by design |
| `OPENWA_API_URL` / `OPENWA_API_KEY` / `OPENWA_SESSION_ID` / `OPENWA_DEFAULT_COUNTRY_CODE` | WhatsApp integration | Unrelated to notifications | API key sensitive |

Owner checks on Vercel → Settings → Environment Variables (names visible; values hidden by Vercel):
both push vars above must exist for **Production** (and Preview if you test branches).

## 3. Deploying the notification fixes (web)

1. Owner supplies a one-time PAT (Contents: Read/Write on this repo). Token used once in a shell
   variable, output redacted, unset afterward; revoke after use (standing protocol).
2. `git push origin main` (6+ commits currently queued: audit + 2a/2b/2c + docs + worklog).
3. Vercel auto-deploys on push (build command: `prisma generate` only — no `db push` at build).
4. No DB migration is expected from Phase 2 (`PushSubscription` model unchanged).

Rollback: Vercel → Deployments → previous production deployment → **Instant Rollback**, or
`git revert <sha>` + push. Phase 2 made no destructive schema changes; rollback is safe.

## 4. Firebase / native prerequisites (before shells ship)

- Firebase project `customer-database-88e9f`: Web Push certificate exists (implied by the VAPID
  var on Vercel); Android app + `google-services.json` for the Android shell; iOS app +
  APNs .p8 key uploaded for the iOS shell (detailed steps in
  `docs/mobile/platform-verification-checklist.md`).
- Signing: Android keystore (owner-managed, never committed); iOS certs via Xcode.

## 5. Post-deploy verification (web) — 10 minutes

1. Open https://ezymail.vercel.app → hard refresh → DevTools → Application → Service Workers:
   `/sw.js` **activated and controlling**.
2. Log in → the floating push setup should subscribe (allow permission):
   DevTools console must NOT show `NEXT_PUBLIC_FIREBASE_VAPID_KEY missing`.
3. Send yourself mail from a second account → notification arrives while tab is **backgrounded
   or closed** (this is the fixed behavior; previously only foreground worked).
4. Tap the notification → correct email opens (`/?id=`), URL cleans to `/`.
5. Vercel → Functions logs during step 3: expect `[Push] Sending to N token(s)`; if you see
   `FIREBASE_SERVICE_ACCOUNT_KEY env var is missing` → that var is not set on Vercel: add it and
   redeploy (its value never leaves Vercel).
6. Subscription count sanity (read-only): `node scripts/push-sub-count.cjs` with a valid
   `DATABASE_URL`, or count rows in Neon console.

## 6. Monitoring & guardrails (ongoing)

- GitHub Actions integrity guard runs on every push + hourly heartbeat — keep green.
- Vercel function logs: grep `[Push]` for dispatch/diagnostics lines.
- Vercel Crons: `/api/cron/trial-expiry` daily 02:00 UTC should log HTTP 200 (bearer `CRON_SECRET`).
- Standing owner-side security items from previous batches: revoke any PATs ever pasted in chat,
  rotate the Neon password if not yet done, then update `DATABASE_URL` on Vercel (redeploy).

## 7. Store releases (later, after Phase 4 passes on hardware)

- Android: Play Console internal testing → production (data-safety: email content + push tokens;
  no sharing/sale). Signing: upload key managed by owner.
- iOS: App Store Connect TestFlight → production; provide review test account.
- Both shells point at production URL — web deploys instantly; shells update via store review
  only when native config changes.
