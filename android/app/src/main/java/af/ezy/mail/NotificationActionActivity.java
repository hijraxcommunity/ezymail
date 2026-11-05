package af.ezy.mail;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.widget.Toast;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Invisible handler for the Archive / Mark-as-read buttons on the
 * new-email notification.
 *
 * Replaces the old NotificationActionReceiver broadcast path. Android 12+
 * BLOCKS broadcast receivers from starting activities after a notification
 * tap (the notification-trampoline restriction), so the receiver's
 * app-open fallback never fired — the buttons looked completely dead
 * (owner report 2026-11-05: "the buttons does not work"). An activity
 * started DIRECTLY by the notification tap is the allowed pattern, and
 * this one is fully transparent: the user only sees the result toast.
 *
 * Flow: PATCH /api/emails/<id> with the WebView session cookie (same
 * endpoint the app UI uses), cancel the notification card, toast the
 * result, finish(). If the patch fails (expired session, offline), the
 * email opens in the app instead — allowed here because a resumed
 * activity may start another activity.
 */
public class NotificationActionActivity extends Activity {

    public static final String ACTION_ARCHIVE = "af.ezy.mail.ACTION_ARCHIVE";
    public static final String ACTION_MARK_READ = "af.ezy.mail.ACTION_MARK_READ";
    public static final String EXTRA_EMAIL_ID = "emailId";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Initialize the cookie manager on the main thread (required by the
        // WebView stack); the actual cookie read happens on the worker
        // thread below.
        CookieManager.getInstance();

        Intent intent = getIntent();
        String action = intent != null ? intent.getAction() : null;
        String emailId = intent != null ? intent.getStringExtra(EXTRA_EMAIL_ID) : null;
        if (emailId == null || emailId.isEmpty()
                || (!ACTION_ARCHIVE.equals(action) && !ACTION_MARK_READ.equals(action))) {
            finish();
            return;
        }

        final boolean archive = ACTION_ARCHIVE.equals(action);
        final String jsonBody = archive ? "{\"isArchived\":true}" : "{\"isRead\":true}";
        final String id = emailId;

        // Network must leave the main thread; the transparent activity just
        // stays up (visible as nothing) until the patch settles — worst case
        // a few seconds, bounded by the connect/read timeouts below.
        new Thread(() -> {
            boolean ok = patchEmail(id, jsonBody);
            runOnUiThread(() -> {
                // Gmail behavior: acting on the card clears it, success or not.
                cancelCard(id);
                if (ok) {
                    Toast.makeText(this, archive ? "Archived" : "Marked as read",
                        Toast.LENGTH_SHORT).show();
                } else {
                    // Session expired / offline → finish the job in the app.
                    Toast.makeText(this, "Opening email…", Toast.LENGTH_SHORT).show();
                    Intent open = EzyMailNotification.openEmailIntent(this, id);
                    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(open);
                }
                finish();
            });
        }).start();
    }

    /** Cancels the new-email notification card for this email. */
    private void cancelCard(String emailId) {
        try {
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(EzyMailNotification.NOTIFICATION_ID_BASE
                    + (emailId.hashCode() & 0xFFFF));
            }
        } catch (Exception ignored) {
            // Never block the action result over a cancel failure.
        }
    }

    /** PUT /api/emails/<id> with the WebView session cookie. */
    private static boolean patchEmail(String emailId, String jsonBody) {
        HttpURLConnection conn = null;
        try {
            String cookies = CookieManager.getInstance()
                .getCookie(EzyMailNotification.SERVER_BASE);
            if (cookies == null || cookies.isEmpty()) return false;

            conn = (HttpURLConnection)
                new URL(EzyMailNotification.SERVER_BASE + "/api/emails/" + emailId)
                    .openConnection();
            conn.setRequestMethod("PUT");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Cookie", cookies);
            OutputStream os = conn.getOutputStream();
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            os.close();
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
