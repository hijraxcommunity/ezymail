# EzyMail — Capacitor Mobile Architecture Decision (Phase 3)

Date: 2026-10-18 · Status: **Decision made, wrapper implementation pending owner go-ahead after Phase 2 deploy**
Decision owner: repo main · Applies to: Android + iOS native shells

---

## 1. Decision: Remote-URL wrapper (NOT a bundled build)

The native shells will load the live production web app (`https://ezymail.vercel.app`) inside the
platform WebView, with the Capacitor JS bridge injected via `server.url` + `allowNavigation`.
The backend stays on Vercel. **No static export is used or planned.**

## 2. Rationale (why not a bundled/exported build)

1. **The app is server-dependent by design.** Auth (`/api/auth/*`), mail (`/api/emails*`,
   `/api/labels`, upload/download), push (`/api/push/*`), user prefs and the trial-expiry cron are
   Next.js route handlers over Prisma + Neon Postgres. A static export would remove every one of
   these; the task brief explicitly forbids forcing static export to satisfy mobile.
2. **One deploy surface.** Fixes and features ship to web and both shells simultaneously with
   zero app-store review latency for non-native changes.
3. **No secrets in the bundle.** The server FCM credential (`FIREBASE_SERVICE_ACCOUNT_KEY`) and
   DB credentials never leave Vercel. The only client-side Firebase values are the public web
   config (`src/lib/firebase.ts`) plus the build-time VAPID key — public by design.
4. **Cookie/session reuse.** The httpOnly `ezymail-session` cookie (30-day sliding) works
   unchanged: with a remote-URL wrapper the document origin IS `ezymail.vercel.app`, so cookies
   are first-party and no `SameSite=None` / CORS relaxation is required. (A bundled
   `capacitor://localhost` origin would force both — another point against it.)
5. **Isolation.** `capacitor.config.ts` + `android/` + `ios/` are additive directories; the web
   app on Vercel is untouched, satisfying the isolation constraint.

## 3. Push architecture per platform (unified server, two transports)

| Platform | Transport | Token stored in `PushSubscription.platform` | Notes |
|---|---|---|---|
| Web/PWA (desktop Chrome/Edge/Firefox, Android Chrome installed) | Web Push via FCM (VAPID) | `web` | Standard `getToken()` + SW registration (Phase 2a fixed) |
| Android shell | Native FCM via `@capacitor/push-notifications` | `android` | Server already builds `android.notification` payloads |
| iOS shell | Native APNs via FCM (`@capacitor/push-notifications`) | `ios` | Server already builds `apns.aps.alert` payloads; iOS web push is structurally unavailable (audit F6) |

The web app code gets a small platform branch (only piece of shared code touched):

```
if (Capacitor.isNativePlatform()) → PushNotifications.register(), listen('registration')
  → POST /api/push/subscribe { token, platform: 'android' | 'ios' }
else → existing FCM-web getToken() flow (Phase 2a/2b)
```

`PushSubscription.fcmToken` stays `@unique` → upsert rebind covers device/account handover.

## 4. WebView behavior requirements (to verify in Phase 4)

- **Service workers:** supported in Android WebView; **NOT supported in WKWebView** — this is
  irrelevant on iOS because the native transport above does not use a web SW. Web/PWA push
  remains the path for iOS home-screen installs (iOS 16.4+).
- **Deep links:** native tap (`pushNotificationActionPerformed`) → navigate WebView to
  `https://ezymail.vercel.app/?id=<emailId>` — reuses the Phase 2c param handling unchanged.
- **Cookies:** verify session survives app restart (WKWebView `HTTPCookieStore` / Android
  `CookieManager` persist by default); sliding renewal keeps 30-day sessions alive.
- **Permission UX:** first `PushNotifications.requestPermissions()` inside the shell; denied
  state must surface (reuse Phase 2a diagnosability pattern).

## 5. Phase 3 implementation steps (ordered, each a separate reviewable commit)

1. `npm i -D @capacitor/cli` + `npm i @capacitor/core @capacitor/push-notifications`
   (`capacitor.config.ts` below; no android/ios generated in sandbox — no SDKs here).
2. Native branch in `src/components/push-notification-setup.tsx` (guarded, web path byte-equal).
3. Owner-side (needs Android SDK / Xcode): `npx cap add android`, `npx cap add ios`,
   `google-services.json`, signing. Documented in Phase 4 checklist — NOT executable here.

### capacitor.config.ts (planned content)

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'af.ezy.mail',
  appName: 'EzyMail',
  webDir: 'public',            // placeholder; server.url overrides loading assets
  server: {
    url: 'https://ezymail.vercel.app',   // production; url is switched per build if needed
    allowNavigation: ['ezymail.vercel.app'],
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
}
export default config
```

`webDir` is only required by CLI validation; with `server.url` set, the WebView loads the remote
site and injects the bridge — no bundled assets ship.

## 6. Explicitly out of scope / risks

- No store submission from the sandbox (owner-side, Phase 4/6).
- iOS: no macOS/Xcode available — nothing iOS can be built or verified here; documented honestly.
- If Vercel ever adds strict bot/WebView headers, `allowNavigation` handles origin, not UA —
  revisit then (low risk; cookies + normal navigation are unaffected).
