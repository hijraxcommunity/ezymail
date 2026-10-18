# EzyMail — Platform Verification Checklists (Phase 4)

Date: 2026-10-18 · Scope: Android + iOS native shells (after Phase 3 wrapper lands)
Sandbox honesty note: **this environment has no Android SDK and no macOS/Xcode.** Nothing below
marked `[owner]` was executed here; those items remain UNVERIFIED until done on real hardware.

---

## A. Android — build & device checklist

### A1. Prerequisites `[owner]`
- [ ] Android Studio installed (includes SDK 34/35 + platform tools)
- [ ] After Phase 3 commits: `npx cap add android` → `android/` project generated
- [ ] Firebase console → project `customer-database-88e9f` → add **Android app**
      (package `af.ezy.mail`) → download `google-services.json` → place at `android/app/`
- [ ] `google-services.json` must be git-ignored (contains project identifiers, not secrets —
      but keep it out of VCS per standard practice)

### A2. Build `[owner]`
- [ ] `npx cap sync android` (copies config, installs plugin native deps)
- [ ] Debug run: `npx cap open android` → Run on device → app loads `https://ezymail.vercel.app`
- [ ] Release build: generate keystore (`keytool -genkeypair -v -keystore ezymail-release.keystore`),
      configure `android/app/build.gradle` signingConfigs → **store keystore + passwords in a
      password manager, never in git**
- [ ] `bundleRelease` → AAB for Play; `assembleRelease` → APK for direct testing

### A3. Functional verification on device `[owner]`
- [ ] Login works in the WebView; session persists across app kill + relaunch (CookieManager)
- [ ] Android notification permission dialog appears on first subscribe; grant →
      `PushSubscription` row appears with `platform="android"` (check via `/api/push/subscribe`
      success or DB count script)
- [ ] From another EzyMail account, send mail → notification arrives **foreground, background
      and app-killed** (FCM `android.notification` payload shows natively)
- [ ] Tap notification → app opens at `/?id=<emailId>` → correct email visible → URL cleaned to `/`
- [ ] Reply to an email from web → push arrives on device (reply-path trigger, Phase 2b)
- [ ] Recipient-only rule: mail to user B does NOT notify user A's device
- [ ] Notification prefs: recipient with `desktopNotif=false` gets no push (prefs gate)
- [ ] Logout → this device's token row removed; login as different user → token rebinds to new user
- [ ] Old token invalidation: uninstall + reinstall → new token row added, stale row cleaned on
      next send (UNREGISTERED cleanup)

### A4. Store submission `[owner]`
- [ ] Play Console: app listing, privacy policy URL, content rating, data-safety form
      (declares: account/email content, push tokens, no data sale)
- [ ] Internal testing track first → promote to production after A3 passes

---

## B. iOS — build & device checklist

### B0. Honesty statement
**No iOS build has ever been produced for EzyMail.** This sandbox has no macOS/Xcode; the iOS
shell does not exist yet (`ios/` not generated). Everything below is `[owner]` and UNVERIFIED.

### B1. Prerequisites `[owner]`
- [ ] macOS + Xcode (latest), Apple Developer Program membership ($99/yr)
- [ ] After Phase 3 commits: `npx cap add ios` → `ios/` project generated
- [ ] `npx cap sync ios`, open Xcode workspace, set Team + bundle id `af.ezy.mail`
- [ ] **APNs**: Apple Developer → Keys → create APNs Auth Key (.p8) → upload to Firebase console
      → project settings → Cloud Messaging → iOS. (Without this, FCM cannot deliver to iOS.)
- [ ] Xcode target → Signing & Capabilities → add **Push Notifications** and
      **Background Modes → Remote notifications**
- [ ] Firebase console → add iOS app (bundle `af.ezy.mail`) → `GoogleService-Info.plist` into
      the Xcode project (git-ignored)

### B2. Functional verification on device `[owner]`
- [ ] App loads production site; login + cookie persistence across kill/relaunch
      (WKWebView HTTPCookieStore)
- [ ] `PushNotifications.register()` succeeds (APNs token → FCM token) → subscribe row
      `platform="ios"`
- [ ] Send from another account → notification in foreground/background/killed states
- [ ] Tap → `/?id=<emailId>` opens the correct email; back guard intact
- [ ] Account-switch rebind + logout cleanup as in A3
- [ ] **Note:** Web Push is NOT used on iOS shell (WKWebView has no service workers); only the
      native path above is valid. iOS home-screen PWA (Safari, iOS 16.4+) may use web push —
      separate from the shell, test with `Add to Home Screen`.

### B3. Store submission `[owner]`
- [ ] App Store Connect: listing, privacy labels, screenshots, review notes (test account
      credentials required for review)
- [ ] TestFlight first → production after B2 passes

---

## C. Web regression gate (re-run after every native phase)

- [ ] `npm run build` green; `tsc --noEmit` = pre-existing baseline only; eslint clean
- [ ] `node .github/scripts/integrity.cjs` green
- [ ] `scripts/phase2-run.sh` battery 23/23; payload tests 7/7
- [ ] Browser E2E: SW registered + controlling; `/?id=` deep link opens + URL cleaned;
      `[Push]` log lines present and diagnosable
- [ ] Production URL up; `/sw.js` served with current content; login flow unaffected
