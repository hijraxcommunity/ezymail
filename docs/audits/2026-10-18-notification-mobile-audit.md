# EzyMail — Notification & Mobile Readiness Audit (Phase 1)

Date: 2026-10-18 · Auditor: Super Z · Scope: incoming-email notification lifecycle, Web/FCM push, PWA, Capacitor readiness
Method: static code inspection + git evidence. No production data touched, no code changed in this phase.

---

## 1. Confirmed findings (evidence-backed)

### F1. No service worker is ever registered → server push has zero targets (PRIMARY ROOT CAUSE)
- `navigator.serviceWorker.register()` appears **nowhere** in `src/` (only react-hook-form `.register` hits).
- `src/components/push-notification-setup.tsx:76-83` waits on `navigator.serviceWorker.ready` before `getToken()`. With no SW registered for the origin, that promise **never resolves** → `getToken` never runs → `/api/push/subscribe` is never called → `PushSubscription` table stays empty.
- Server side, `src/lib/notifications/sendPushNotification.ts:54-57` finds 0 subscriptions and returns. **Every FCM send since launch has been a no-op.**
- Both `public/sw.js` (full PWA SW: FCM background handler + notificationclick + offline caching) and `public/firebase-messaging-sw.js` sit in /public as **dead files**.

### F2. The only notifications that ever worked are foreground-only by construction
- `src/hooks/use-notifications.tsx` polls `/api/emails?folder=inbox…` every **15s** from a page JS timer (line 8, 268) and shows `new Notification(...)` **in page context** (`showBrowserNotification`, lines 57-77).
- Mobile browsers freeze/throttle timers in background tabs; a closed tab stops polling entirely. iOS standalone PWAs do not support the page-context Notification constructor at all.
- This exactly matches the symptom "desktop works, mobile doesn't": desktop foreground = page alive → works; mobile background/closed = nothing.

### F3. Fire-and-forget push after the response is racy on Vercel
- `src/app/api/emails/route.ts:305-320`: `sendPushNotification({...}).catch(() => {})` — **not awaited**, no `after()`. On Vercel serverless the function may be frozen immediately after the response returns; unawaited work can be dropped.
- Once F1 is fixed, this becomes the next reliability gap (even subscribed devices would miss notifications intermittently).

### F4. Deep links are broken end-to-end
- Push payloads and SW click handlers navigate to `/inbox?id=${emailId}` (`sendPushNotification.ts:84`, `public/sw.js:22,59+`, `public/firebase-messaging-sw.js`).
- **There is no `/inbox` route** — the app is single-route (`src/app/page.tsx`). Next.js would render the 404 page.
- `page.tsx` reads **no URL parameters** (zero `useSearchParams`/`searchParams` references) — even `/?id=…` would not open the email.
- Net effect: even if a notification arrived, tapping it could never open the right email.

### F5. Web push was also silently gated on a possibly-missing VAPID key
- `push-notification-setup.tsx:122-125`: if `NEXT_PUBLIC_FIREBASE_VAPID_KEY` is unset/short the component **returns silently** — no error, no log visible to users.
- Local `.env` contains 0 occurrences of the key (build-time env; Vercel value must be verified by owner).

### F6. iOS is structurally excluded from web push
- `src/lib/firebase.ts` gates on `isSupported()` (firebase messaging). FCM Web Push is **not supported on iOS Safari / iOS PWA** — iPhone users can never receive web push regardless of F1-F5. Native path (Capacitor + APNs via FCM) is the only fix for iOS.

### F7. Duplicate-notification surfaces coexist in the foreground
- Once F1 is fixed: page-context polling Notification (use-notifications) + FCM `onMessage` toast (push-notification-setup) + SW background notification are three independent surfaces. Foreground today = polling Notification + toast (double surface, tolerable); after the fix, dedup rules are needed (see plan).

### F8. Account-switch / logout token hygiene
- `POST /api/auth/logout` does **not** clean push subscriptions. Client-side cleanup depends on `tokenRef` in a mounted component (`push-notification-setup.tsx:147-156`).
- Re-subscribe upserts by `fcmToken` → rebinds the token to the new user (`subscribe/route.ts` upsert) — correct for device handover, but if cleanup ever fails, the previous user keeps receiving notifications on a device they no longer control (title includes sender name + subject = privacy leak across accounts).

### F9. Reply path never notifies
- `src/app/api/emails/[id]/reply/route.ts` creates the recipient's inbox copy but does not call `sendPushNotification` — only `POST /api/emails` (fresh compose) pushes.

### F10. Capacitor: greenfield
- No Capacitor deps, no android/ or ios/ projects, no config. Nothing to repair — Phase 3 is pure addition, fully isolatable from the web app.

## 2. Likely causes still needing verification
- V1. Is `NEXT_PUBLIC_FIREBASE_VAPID_KEY` set in Vercel (Production)? (Owner: Vercel → Settings → Env Vars. Name only, never paste values.)
- V2. Is `FIREBASE_SERVICE_ACCOUNT_KEY` set in Vercel? Its absence logs `[Push] FIREBASE_SERVICE_ACCOUNT_KEY env var is missing` per send.
- V3. Vercel runtime logs during a real send — look for `[Push]` lines to confirm which failure fires today.
- V4. FCM project `customer-database-88e9f` — does a Web Push certificate (VAPID) exist in the console, and does the Android app exist for later native phases?

## 3. Key files / functions map
| Area | Path | Notes |
|---|---|---|
| Server push | `src/lib/notifications/sendPushNotification.ts` | FCM v1, token cleanup, per-platform payloads (android/apns already present) |
| Send trigger | `src/app/api/emails/route.ts:305-320` | fire-and-forget after commit; scheduled sends correctly skipped |
| Client setup | `src/components/push-notification-setup.tsx` | permission + getToken + subscribe + onMessage + logout cleanup |
| Foreground fallback | `src/hooks/use-notifications.tsx` | 15s polling, page Notification, sound, toasts, prefs from `/api/user/profile` |
| Firebase lib | `src/lib/firebase.ts` | config (public by design), `isSupported()` gate |
| Service workers | `public/sw.js`, `public/firebase-messaging-sw.js` | unregistered; sw.js is the better one (offline cache + click routing) |
| SW registration | **missing** (Providers claims it, doesn't do it) | must be added |
| Subscribe/unsub | `src/app/api/push/{subscribe,unsubscribe}/route.ts` | auth'd, upsert by unique token, ownership-scoped delete |
| Model | `prisma/schema.prisma` `PushSubscription` | userId, fcmToken @unique, deviceInfo, platform("web"/"android"/"ios"), cascade |
| Deep links | `src/app/page.tsx` | no URL param handling today |
| Manifest | `public/manifest.json` | standalone, scope `/`, start_url `/` ✓ |
| iOS meta | `src/app/layout.tsx` (`appleWebApp`) | PWA-installable ✓ |
| Prefs | user.preferences JSON (`desktopNotif`, `soundNotif`) via settings-panel | respected by polling path; NOT by push path (gap) |
| Auth | `ezymail-session` httpOnly cookie, 30d sliding (Batch 3) | reusable as-is for Capacitor webview |
| Reply | `src/app/api/emails/[id]/reply/route.ts` | no push (F9) |

## 4. Reusable as-is (do not rebuild)
- FCM v1 server sender incl. android/apns payload branches and invalid-token cleanup.
- `PushSubscription` model + subscribe/unsubscribe endpoints (auth + ownership correct).
- `sw.js` — already implements background display + click routing + offline caching; just needs registration + URL fix.
- Preference plumbing (`desktopNotif`/`soundNotif` in user.preferences).
- Auth/session (httpOnly cookie, sliding 30d) — works for webview without redesign.

## 5. Missing implementation / configuration
1. SW registration (one SW, root scope) — the linchpin.
2. VAPID key env (verify/set) + explicit unsupported/denied states surfaced.
3. Reliable post-response execution (`after()` from next/server).
4. Deep-link routing: `/?id=<emailId>` payload + `page.tsx` param handling + updated SW click handlers; remove `/inbox?id=` targets.
5. Foreground dedup policy (polling vs FCM vs toast).
6. Reply-path push trigger.
7. Logout server-side hygiene (delete current device's subscription row client-side is done; add token-rebind safety).
8. Native push (Capacitor) — plugin, registration, token lifecycle (Phase 2C/3).
9. Notification preferences gating on the push path (currently push ignores user prefs).

## 6. Risks & recommended fixes (smallest-safe)
| Risk | Fix |
|---|---|
| Double notifications after SW lands | Desktop foreground: keep polling list-refresh, suppress page Notification when FCM subscribed (flag from setup status); SW handler only fires in background by design |
| Post-response lambda freeze | Wrap push dispatch in `after()` (Next 15+/16) — non-blocking yet guaranteed |
| 404 on tap | Single-route deep link `/?id=` + searchParams open; keep back/redirect fallback to `/` |
| Cross-account leak | On login, subscribe rebinds (existing upsert) + on logout client unsubscribes its token; add server guard: never send subject contents if `platform` row stale >90d? (keep simple: rely on rebind + cleanup) |
| iOS | No web-push fix possible; native phase required. Document clearly |
| Duplicate SW registrations | Register exactly `sw.js` once in Providers; delete `firebase-messaging-sw.js` from /public (or keep only as fallback docs) |

## 7. Phased implementation plan (proposed)
- **Phase 2 (web, minimal diffs):**
  - 2a: register `/sw.js` in Providers; point setup at explicit registration; surface unsupported/denied states; remove dead `firebase-messaging-sw.js`.
  - 2b: `after()`-wrap the push trigger; add reply-path trigger; honor `desktopNotif` pref on push path; foreground dedup flag.
  - 2c: deep links — payloads `/?id=`, `page.tsx` opens `?id` email on mount; SW click handlers updated.
  - Validation: local sqlite rig (subscribe/unsubscribe auth, token cleanup, dedup), build + guard; device checks stay owner-side.
- **Phase 3 (Capacitor, isolated):** remote-URL wrapper (server features rule out static export — API routes/auth/db); `capacitor.config.ts` + android/ + ios/ projects added **alongside** (web app untouched on Vercel); @capacitor/push-notifications; token → subscribe with platform; tap → deep link; document cookie/CORS needs (SameSite=None + Secure; capacitor origin).
- **Phase 4:** Android: code-level build check (no Android SDK in sandbox — document). iOS: document-only (no macOS/Xcode). Owner prerequisites listed.
- **Phase 5:** tests — subscribe auth (401/forged), token cleanup on UNREGISTERED, deep-link id mapping, reply push, prefs respected, no-send-on-scheduled, no-dup (tag + single inboxEmail id).
- **Phase 6:** deployment/release guide with env names, Firebase/APNs/Play/App Store steps, rollback, monitoring.

**Owner prerequisites (Phase 2+):** VAPID key + service account key verified in Vercel; for native: Firebase Android app + google-services.json, Apple Developer account + APNs key, later Play/App Store accounts.
