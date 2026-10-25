package af.ezy.mail;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.Map;

/**
 * Builds and posts the Gmail-style "new email" notification.
 *
 * Layout mirrors Gmail on Android:
 *   - collapsed: sender name (title) + subject (text) + sender avatar
 *   - expanded:  BigTextStyle with a body preview
 *   - actions:   Archive · Mark as read · Reply
 *   - status bar: clean white envelope glyph (ic_notification), never the
 *     colorful launcher icon
 *
 * Reply opens the email in the app (deep link via MainActivity); Archive and
 * Mark as read run directly on the device through NotificationActionReceiver
 * using the WebView session cookie, with the app-open fallback on failure.
 */
public final class EzyMailNotification {

    public static final String CHANNEL_ID = "ezy-emails";
    static final String SERVER_BASE = "https://ezymail.vercel.app";
    static final int NOTIFICATION_ID_BASE = 41000;

    private static final int[] AVATAR_COLORS = {
        0xFF1A73E8, 0xFF188038, 0xFFD93025, 0xFFE37400,
        0xFF7B1FA2, 0xFF00838F, 0xFF5F6368, 0xFFC5221F,
    };

    private EzyMailNotification() {}

    static void show(Context context, Map<String, String> data) {
        String emailId = data.get("emailId");
        String senderName = data.get("title");
        String subject = data.get("body");
        String preview = data.get("preview");
        String avatarUrl = data.get("avatar");
        if (emailId == null || senderName == null) return;
        if (subject == null || subject.trim().isEmpty()) subject = "(No subject)";

        ensureChannel(context);

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(SERVER_BASE + "/?id=" + emailId));
        open.setPackage(context.getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            emailId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(senderName)
                .setContentText(subject)
                .setContentIntent(contentIntent)
                .setColor(0xFF202124)
                .setCategory(NotificationCompat.CATEGORY_EMAIL)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setDefaults(NotificationCompat.DEFAULT_ALL);

        if (preview != null && !preview.trim().isEmpty()) {
            builder.setStyle(
                new NotificationCompat.BigTextStyle()
                    .bigText(preview)
                    .setSummaryText(subject));
        }

        Bitmap avatar = loadAvatar(context, avatarUrl, senderName);
        if (avatar != null) builder.setLargeIcon(avatar);

        // Archive — direct native action (uses the WebView session cookie)
        builder.addAction(
            R.drawable.ic_action_archive,
            "Archive",
            actionIntent(context, NotificationActionReceiver.ACTION_ARCHIVE, emailId));
        // Mark as read — direct native action
        builder.addAction(
            R.drawable.ic_action_read,
            "Mark as read",
            actionIntent(context, NotificationActionReceiver.ACTION_MARK_READ, emailId));
        // Reply — opens the email in the app (reply from the compose there)
        builder.addAction(
            R.drawable.ic_action_reply,
            "Reply",
            contentIntent);

        NotificationManagerCompat.from(context)
            .notify(NOTIFICATION_ID_BASE + (emailId.hashCode() & 0xFFFF), builder.build());
    }

    private static PendingIntent actionIntent(
        Context context, String action, String emailId) {
        Intent intent = new Intent(context, NotificationActionReceiver.class);
        intent.setAction(action);
        intent.putExtra(NotificationActionReceiver.EXTRA_EMAIL_ID, emailId);
        return PendingIntent.getBroadcast(
            context,
            (action + emailId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void ensureChannel(Context context) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel =
            new NotificationChannel(CHANNEL_ID, "New email", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Notifications for newly received emails");
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
    }

    /** Sender avatar bitmap, or a Gmail-style letter avatar. Never throws. */
    private static Bitmap loadAvatar(Context context, String avatarUrl, String senderName) {
        if (avatarUrl != null && !avatarUrl.trim().isEmpty()) {
            Bitmap fetched = fetchBitmap(avatarUrl);
            if (fetched != null) return circleCrop(fetched);
        }
        return letterAvatar(senderName);
    }

    private static Bitmap fetchBitmap(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setInstanceFollowRedirects(true);
            InputStream in = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(in);
            in.close();
            return bmp;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static Bitmap circleCrop(Bitmap src) {
        int size = Math.min(src.getWidth(), src.getHeight());
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setFilterBitmap(true);
        RectF rect = new RectF(0, 0, size, size);
        canvas.drawOval(rect, paint);
        paint.setXfermode(new android.graphics.PorterDuffXfermode(
            android.graphics.PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(src, null, rect, paint);
        return out;
    }

    /** Colored circle with the sender's initial — the Gmail fallback look. */
    private static Bitmap letterAvatar(String name) {
        int size = 256;
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        String trimmed = (name == null || name.trim().isEmpty()) ? "?" : name.trim();
        int color = AVATAR_COLORS[
            Math.abs(trimmed.toLowerCase(Locale.ROOT).hashCode()) % AVATAR_COLORS.length];
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        paint.setColor(Color.WHITE);
        paint.setTextSize(size * 0.45f);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setFakeBoldText(true);
        String letter = trimmed.substring(0, 1).toUpperCase(Locale.ROOT);
        float y = size / 2f - (paint.descent() + paint.ascent()) / 2f;
        canvas.drawText(letter, size / 2f, y, paint);
        return out;
    }
}
