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
 * sendPushNotification.ts with androidDataOnly), this service builds the
 * notification locally — sender name as title, subject as text, expandable
 * body preview (BigTextStyle), sender avatar as large icon, clean white
 * status-bar glyph, and Archive / Mark-as-read / Reply actions — exactly
 * like Gmail. Any other message falls back to the plugin's default
 * handling, so nothing else changes.
 */
public class EzyMailMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        // Email payload = data carries emailId + title. The server now ALSO
        // includes a display-notification block so messages still show on
        // APKs without this renderer — here we upgrade the foreground case
        // to the Gmail-style notification (background messages are shown by
        // FCM itself before this service ever runs, so no doubles).
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
