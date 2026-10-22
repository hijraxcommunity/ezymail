# EzyMail — Mobile Readiness + Notification Repair: Final Report (Phases 1–6)

Date: 2026-10-22 · Status: COMPLETE — all phases closed, owner-verified end-to-end on device
Span: commits `a5c4c05..f8a4d74` (19 commits, 7 production pushes) · HEAD = `f8a4d74` = `origin/main`

---

## 1. Root cause of "notifications never arrive" + evidence

**Primary root cause (production-proven):** `buildFcmMessage()` in
`src/lib/notifications/sendPushNotification.ts` placed a `priority` field inside
`message.android.notification`. The FCM v1 API schema has **no such field** there
(`priority` is valid only on `message.android`). Because FCM schema-validates the entire
message before platform routing, **every send since deploy was rejected with
`400 INVALID_ARGUMENT` — for all users, all tokens, web and native alike.**

Evidence (owner-supplied Vercel runtime logs, 2026-10-22):
`[Push] Sending to 10 token(s) for user: cmozmpe990000...` followed by 10×
`FCM API error: 400 — Unknown name "priority" at 'message.android.notification': Cannot find field`.
After the schema fix, the owner confirmed live delivery on an Android emulator:
**"it is working now"** — the first successful end-to-end notification in the project's history.

**Contributing causes found and fixed during the audit phases:** service-worker
subscription races (2a), unreliable in-request dispatch (2b — moved to post-response
`after()`), broken deep links (2c — `sw.js` rewritten to `/?id=` targets), missing
`@capacitor/android` dependency (fresh clones could not generate the native shell),
and a dangerous token-cleanup rule that treated any `INVALID_ARGUMENT` as a dead token
(a payload bug could have wiped every subscription — now only true `UNREGISTERED`
signals delete rows).

## 2. Architecture conclusion

**Chosen: Capacitor remote-URL wrapper.** The native Android/iOS shell loads
`https://ezymail.vercel.app` directly (`capacitor.config.ts`: `server.url` +
`allowNavigation`). Consequences, all verified:

- Zero code duplication: one web codebase serves browser, PWA, and both shells.
- Secrets never enter the app binary; backend stays on Vercel (no static export).
- Session cookie remains first-party (WebView loads the production origin directly).
- Web path byte-identical: the native branch is gated behind
  `Capacitor.isNativePlatform()` with a dynamic `import('@capacitor/push-notifications')`
  that browsers never fetch. Browser smoke test on a production build showed zero
  capacitor network requests and zero console errors.
- Web/app updates are **automatic** for all web-layer changes; only native-shell changes
  (icon, plugins, permissions, config) require a new APK build.

## 3. Changed files (key list)

| Area | Files |
|---|---|
| Push core | `src/lib/notifications/sendPushNotification.ts` (payload schema fix, safe cleanup, prefs gate) |
| Client push | `src/components/push-notification-setup.tsx` (SW hardening, dedup, native branch, tap deep link) |
| Service worker | `public/sw.js` (`/?id=` deep-link targets, data-only rendering) |
| Compose/dispatch | compose + reply API routes (post-response `after()` dispatch, prefs gate) |
| Capacitor | `capacitor.config.ts`, `@capacitor/core|cli|push-notifications|android` deps, `.gitignore` native artifacts |
| Tests | `scripts/phase2-payload.test.ts` (8 tests incl. FCM-schema regression locks), `scripts/phase5-api-battery.sh` (21 assertions) |
| Ops/CI | `.github/scripts/integrity.cjs`, `.github/workflows/ci.yml`, `.gitignore` (Firebase configs) |
| Docs | audit doc, `docs/mobile/capacitor-architecture.md`, `docs/mobile/platform-verification-checklist.md`, `docs/deployment/notification-mobile-deploy-guide.md`, `worklog.md` (Tasks 47–54) |

## 4. Test results

- **Phase 5 API regression battery: 21/21 GREEN** (isolated sqlite rig, absolute
  `DATABASE_URL`, rig-in-use safety abort, orphan-server teardown) — subscribe auth
  (401 without cookie / forged), register/login, upsert subs, compose → post-response
  dispatch, FCM-boundary safe-fail (email NOT rolled back), inbox scoping, reply-path
  push, prefs gate skip, scheduled → no push, cross-user unsubscribe DENIED,
  own-unsubscribe scoped, zero-subscriber no-op, profile 401 no-fallback.
- **Payload unit tests: 8/8 GREEN** (`npx tsx scripts/phase2-payload.test.ts`) — now
  locking the exact FCM v1 schema that production rejected (`notification.priority`
  absent, drawable icon name, data-only web, deep link, apns alert/sound/badge).
- **CI integrity guard: GREEN** after every push (166 TS files, all imports resolve,
  8 critical files present). It caught and blocked **6 separate sweep incidents**.
- **Live production evidence:** `FCM success` path + device notification confirmed by
  owner on 2026-10-22.

## 5. Build & deploy results

7 pushes, each Vercel-deployed and health-checked (site `200`, `sw.js` deep-link
marker `/?id=` present, VAPID key inlined in bundle, capacitor inert on web):
`a5c4c05..4648cfc` (audit + Phase 2a/2b/2c) → `4648cfc..737e352` (Phase 3a/3b) →
`737e352..1c5c733` → `1c5c733..b9c10fd` (Phase 5 battery) → `b9c10fd..2551470` →
`2551470..1178141` (gitignore guard + `@capacitor/android` dep fix) →
`1178141..f8a4d74` (FCM schema fix). No static export; build command unchanged
(`prisma generate` only).

## 6. Environment variables (names only — values live in Vercel)

- `DATABASE_URL` — Neon Postgres (production)
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` — web-push subscription (public by design)
- `FIREBASE_SERVICE_ACCOUNT_KEY` — FCM v1 sending (server-only, JSON service account)
- Pre-existing: `JWT_SECRET`, `OPENWA_API_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID`

Never commit: `google-services.json`, `GoogleService-Info.plist`, `*.p8`,
`key.properties`, keystores — all gitignored as of `0aa2ab5`.

## 7. Owner manual steps

Completed by owner: Android Studio setup, `npx cap add android`, `google-services.json`
(package `af.ezy.mail`), emulator run, notification receipt confirmed.

Remaining (small):
1. Browser end-to-end check: Chrome → site → allow notifications → send yourself an
   email → SW-rendered notification with deep link (`/?id=`).
2. App icon/splash: `assets/logo.png` (1024×1024, already in repo) →
   `npx @capacitor/assets generate --android` → `npx cap sync android` → reinstall.
3. **Revoke the GitHub PAT** (used 7× across pushes) once no further pushes are needed.
4. Pre-existing security todos: rotate Neon password, audit old PATs, check Vercel
   Cron logs.
5. iOS path stays future work (needs macOS/Xcode + APNs .p8 key).

## 8. Known limitations

- Web-push delivery via FCM v1 (top-level `data` reaching `sw.js`) is schema-valid now
  but the browser leg has not yet been observed live (item 7.1) — payload verified by
  unit tests and schema only.
- iOS native shell never built (no macOS in environment) — documented honestly in the
  Phase 4 checklist; APNs payload shape is tested at unit level only.
- Emulators are not physical devices: vendor push quirks (battery optimization,
  OEM killers) remain untested; checklist covers them.
- `scripts/` history was lost to a sweep and rebuilt from spec; the battery rig is
  sqlite, not Neon — production DB behavior is covered only at the API/Prisma boundary.
- The repository is under an ongoing automated attack ("sweep"): 6 incidents during
  this project (UUID commits, history rewind, working-tree deletion/revert, chmod
  noise, repeated targeting of `src/app/api/upload/route.ts`). The integrity guard +
  push-from-origin protocol held; origin/main was never corrupted.

## 9. Commit list (a5c4c05..f8a4d74, 19 commits)

```
f8a4d74  Fix: FCM v1 payload schema (400 INVALID_ARGUMENT) + UNREGISTERED-only cleanup + regression locks
1178141  Worklog: Task 53 (capacitor android dep fix + sweep #4 history-rewind repair)
cd4221e  Fix: add @capacitor/android dependency — npx cap add android failed without it
41ea417  Worklog: Task 52 (push #5 + sweep #3 repair + Firebase config guard)
0aa2ab5  Guard: ignore Firebase native configs and signing material
2551470  Worklog: Task 51 (Phase 5 battery 21/21 + rig hardening)
b9c10fd  Phase 5: regression battery rebuilt (21/21), tracked in git
1c5c733  Worklog: Task 50
737e352  Worklog: Task 49 (Phase 3 + sweep #2 recovery)
bc9e976  Capacitor (3b): guarded native push branch — inert on web
ed588ae  Capacitor (3a): deps + remote-URL wrapper config + native gitignore
99489fd  Worklog: Tasks 47-48
4648cfc  Docs: Phase 3 decision, Phase 4 checklists, Phase 6 deploy guide
de3c4a6  Push (2a): SW-subscription hardening + foreground dedup
c504c5a  Push (2b): post-response dispatch, prefs gate, reply-path push, data-only web payload
d3cf86f  Push (2c): deep links end-to-end (sw.js /?id=)
f1f74b2  Audit doc: post-audit corrections + Phase 2 record
de46333  Worklog: Task 46 (Phase 2)
274484b  (sweep artifact — UUID commit, no functional content)
```
