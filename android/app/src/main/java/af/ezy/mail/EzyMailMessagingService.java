package af.ezy.mail;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Gmail-style notification renderer for EzyMail.
 *
 * Extends the Capacitor push plugin's MessagingService so onNewToken keeps
 * flowing to the plugin (token registration is untouched). For Android
 * data-only FCM messages carrying an email payload (sent by
 * sendPushNotification.ts with androidDataOnly — the server sends NO
 * android.notification block for Android tokens), this service builds the
 * notification locally in BOTH foreground and background — sender name as
 * title, subject as text, expandable body preview (BigTextStyle), sender
 * avatar as large icon, clean white status-bar glyph, and Archive /
 * Mark-as-read / Reply actions — exactly like Gmail. Any other message falls
 * back to the plugin's default handling, so nothing else changes.
 */
public class EzyMailMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        // Email payload = data carries emailId + title. Android tokens get
        // PURE data messages (no android.notification block), so this runs
        // for foreground AND background deliveries and is the ONLY thing
        // that shows a notification — no doubles possible. EzyMailNotification
        // itself never fails silently (plain fallback on rich-build error).
        boolean isEmailNotification =
            data != null
                && data.containsKey("emailId")
                && data.containsKey("title");

        if (isEmailNotification) {
            EzyMailNotification.show(this, data);
        } else {
            super.onMessageReceived(remoteMessage);
        }
    }
}
