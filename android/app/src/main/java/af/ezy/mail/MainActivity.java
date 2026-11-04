package af.ezy.mail;

import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // ─── Notification deep link — open the tapped email ─────────────────────
    // The Gmail-style notification's content intent carries the email URL.
    // Capacitor's Bridge does not route ACTION_VIEW data into the WebView on
    // its own, so forward it here. Covers cold start (getIntent) and warm
    // start (onNewIntent — MainActivity is singleTask).
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openDeepLink(intent);
    }

    private void openDeepLink(Intent intent) {
        if (intent == null || bridge == null || bridge.getWebView() == null) return;
        String url = intent.getDataString();
        if (url == null) url = intent.getStringExtra("ezymail.url");
        if (url != null && url.startsWith("https://ezymail.vercel.app")) {
            // Gmail-like: opening the email (content tap) or the reply compose
            // (Reply action tap) clears that email's notification card. The
            // card's id is derived from the emailId exactly like the renderer
            // and NotificationActionReceiver compute it.
            cancelEmailNotification(url);
            final String target = url;
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(target));
        }
    }

    /** Cancels the new-email notification card for the email in the URL. */
    private void cancelEmailNotification(String url) {
        try {
            String id = Uri.parse(url).getQueryParameter("id");
            if (id == null || id.isEmpty()) return;
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(EzyMailNotification.NOTIFICATION_ID_BASE
                    + (id.hashCode() & 0xFFFF));
            }
        } catch (Exception ignored) {
            // Never block the deep link over a cancel failure.
        }
    }
}
