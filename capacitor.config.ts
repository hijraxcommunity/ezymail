import type { CapacitorConfig } from '@capacitor/cli'

/**
 * EzyMail Capacitor configuration — Remote-URL wrapper architecture.
 *
 * Decision record: docs/mobile/capacitor-architecture.md
 * - The WebView loads the live production web app; the backend stays on Vercel.
 * - No static export, no bundled copy of the app, no secrets in the shell.
 * - With `server.url` set, Capacitor injects its JS bridge into the remote
 *   page, so `src/components/push-notification-setup.tsx` can register the
 *   native FCM/APNs token via the guarded `Capacitor.isNativePlatform()`
 *   branch (inert in normal browsers).
 *
 * `webDir` is only required by CLI validation; no assets are actually served
 * from it while `server.url` is set.
 */
const config: CapacitorConfig = {
  appId: 'af.ezy.mail',
  appName: 'EzyMail',
  webDir: 'public',
  server: {
    url: 'https://ezymail.vercel.app',
    allowNavigation: ['ezymail.vercel.app'],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      // The branded @drawable/splash stays on screen (no blank gap) until the
      // web app calls SplashScreen.hide() once its real UI is rendered.
      // launchShowDuration doubles as the safety cap: if the remote page never
      // loads (offline, JS error), the splash is still dismissed after 15s.
      launchShowDuration: 15000,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
  },
}

export default config
