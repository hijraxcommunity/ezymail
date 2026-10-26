package af.ezy.mail;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * EzyMail Application.
 *
 * 1) TEMPORARY diagnostic crash catcher (Task 74, remove once stable):
 *    installed in attachBaseContext — which runs BEFORE any ContentProvider
 *    (FirebaseInitProvider, InitializationProvider, FileProvider) and before
 *    Application.onCreate — so it sees crashes from every startup stage.
 *    On any uncaught exception it writes a full report to
 *    files/crash-report.txt and launches CrashReportActivity in a separate
 *    ":crash" process so the owner can photograph the stack trace.
 *
 * 2) DEFENSIVE FIREBASE INIT (Task 76, approved fix for the startup crash):
 *    google-services.json is gitignored and can be missing at build time.
 *    In that case the google-services Gradle plugin is skipped, Firebase
 *    resources are absent, FirebaseInitProvider never creates the default
 *    FirebaseApp — and PushNotificationsPlugin.register() used to kill the
 *    whole process with
 *      "IllegalStateException: Default FirebaseApp is not initialized in
 *       this process af.ezy.mail"
 *    the moment the user allowed notifications. We now guarantee a default
 *    FirebaseApp exists before any plugin can ask for it, using the same
 *    public web config as src/lib/firebase.ts. If init fails for any
 *    reason we log and continue — the app must never die here again; push
 *    registration then simply fails gracefully in the JS layer instead.
 */
public class EzyMailApp extends Application {

    private static final String TAG = "EzyMailApp";

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);

        final Thread.UncaughtExceptionHandler previous =
            Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                StringWriter sw = new StringWriter();
                throwable.printStackTrace(new PrintWriter(sw));

                // Walk the cause chain so wrapped exceptions are fully visible
                Throwable cause = throwable.getCause();
                int depth = 0;
                while (cause != null && depth++ < 6) {
                    sw.append("\nCAUSED BY:\n");
                    cause.printStackTrace(new PrintWriter(sw));
                    cause = cause.getCause();
                }

                String report =
                    "EzyMail crash report  "
                        + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
                            .format(new Date())
                        + "\nDevice: " + android.os.Build.MANUFACTURER + " "
                            + android.os.Build.MODEL
                        + "\nAndroid: " + android.os.Build.VERSION.RELEASE
                            + " (SDK " + android.os.Build.VERSION.SDK_INT + ")"
                        + "\nThread: " + thread.getName()
                        + "\n\n" + sw;

                FileOutputStream fos = new FileOutputStream(
                    new File(base.getFilesDir(), "crash-report.txt"), false);
                fos.write(report.getBytes("UTF-8"));
                fos.close();

                Intent intent = new Intent(base, CrashReportActivity.class);
                intent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                base.startActivity(intent);

                // Give the :crash process a moment to start before we die
                Thread.sleep(800);
            } catch (Throwable ignored) {
                // Reporting must never mask the original crash
            }

            if (previous != null) {
                previous.uncaughtException(thread, throwable);
            } else {
                android.os.Process.killProcess(android.os.Process.myPid());
                System.exit(10);
            }
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureFirebaseInitialized();
    }

    /**
     * Guarantees a default FirebaseApp exists so
     * PushNotificationsPlugin.register() can never throw
     * "Default FirebaseApp is not initialized" and kill the process.
     *
     * If google-services.json WAS present at build time, FirebaseInitProvider
     * has already created the default app and this is a no-op. Otherwise we
     * build explicit options from the public web config (same values as
     * src/lib/firebase.ts — project customer-database-88e9f).
     */
    private void ensureFirebaseInitialized() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId("1:961040699391:web:9b47f3bbcfe82186ae21ca")
                    .setApiKey("AIzaSyDgnA1cUv6JuRZDAfaSz9R4ev_pY1xC_vM")
                    .setProjectId("customer-database-88e9f")
                    .setGcmSenderId("961040699391")
                    .setStorageBucket("customer-database-88e9f.firebasestorage.app")
                    .build();
                FirebaseApp.initializeApp(this, options);
                Log.i(TAG, "Firebase default app created via defensive fallback "
                        + "(google-services.json was missing at build time)");
            } else {
                Log.i(TAG, "Firebase already initialized (google-services.json present)");
            }
        } catch (Throwable t) {
            // NEVER let Firebase setup kill the app. Push registration will
            // fail gracefully in the JS layer instead of crashing the process.
            Log.w(TAG, "Defensive Firebase init failed — push disabled, app continues", t);
        }
    }
}
