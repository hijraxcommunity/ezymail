package af.ezy.mail;

import android.content.Intent;
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
            final String target = url;
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(target));
        }
    }
}
