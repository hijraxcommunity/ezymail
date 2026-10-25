package af.ezy.mail;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import androidx.core.app.NotificationManagerCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Handles the Archive / Mark-as-read buttons on the new-email notification.
 *
 * The actions run directly on the device: the request reuses the session
 * cookie the WebView already holds for the server (same login), calls the
 * same PUT /api/emails/<id> endpoint the app UI uses, then dismisses the
 * notification. If anything fails (expired session, offline), the email
 * opens in the app instead so the user can act there.
 *
 * Reply is NOT routed here — its PendingIntent opens the email directly.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    public static final String ACTION_ARCHIVE = "af.ezy.mail.ACTION_ARCHIVE";
    public static final String ACTION_MARK_READ = "af.ezy.mail.ACTION_MARK_READ";
    public static final String EXTRA_EMAIL_ID = "emailId";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String emailId = intent.getStringExtra(EXTRA_EMAIL_ID);
        if (emailId == null || emailId.isEmpty()) return;

        // Give the network call time inside onReceive (10s window)
        PendingResult result = goAsync();
        final String finalAction = action;
        new Thread(() -> {
            boolean ok = false;
            if (ACTION_ARCHIVE.equals(finalAction)) {
                ok = patchEmail(emailId, "{\"isArchived\":true}");
            } else if (ACTION_MARK_READ.equals(finalAction)) {
                ok = patchEmail(emailId, "{\"isRead\":true}");
            }
            // Dismiss the notification either way (Gmail-like: tapping an
            // action clears the notification)
            NotificationManagerCompat.from(context)
                .cancel(EzyMailNotification.NOTIFICATION_ID_BASE + (emailId.hashCode() & 0xFFFF));
            if (!ok) {
                // Session expired / offline → open the email in the app
                Intent open = new Intent(Intent.ACTION_VIEW,
                    Uri.parse(EzyMailNotification.SERVER_BASE + "/?id=" + emailId));
                open.setPackage(context.getPackageName());
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                context.startActivity(open);
            }
            result.finish();
        }).start();
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
