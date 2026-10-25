package af.ezy.mail;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * TEMPORARY diagnostic crash catcher (owner-approved debugging build).
 *
 * Installed in attachBaseContext — which runs BEFORE any ContentProvider
 * (FirebaseInitProvider, InitializationProvider, FileProvider) and before
 * Application.onCreate — so it sees crashes from every startup stage.
 *
 * On any uncaught exception it: writes a full report (device info + stack
 * trace + cause chain) to files/crash-report.txt, then launches
 * CrashReportActivity in a separate ":crash" process that survives the death
 * of the main process and displays the report on screen for the owner to
 * photograph. Remove once the startup crash is identified.
 */
public class EzyMailApp extends Application {

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
}
