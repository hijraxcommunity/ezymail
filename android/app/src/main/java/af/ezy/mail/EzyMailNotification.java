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
 * Reply opens the app's compose window with the reply pre-filled (deep link
 * /?compose=reply&id=<emailId> — the web app fetches the full email and opens
 * the compose with To / Subject / quoted body). Archive and Mark as read run
 * directly on the device through NotificationActionActivity using the WebView
 * session cookie, with the app-open fallback on failure.
 *
 * EVERY PendingIntent targets MainActivity / NotificationActionActivity
 * EXPLICITLY (no implicit ACTION_VIEW resolution): the manifest has no
 * intent-filter for https://ezymail.vercel.app, so implicit VIEW intents
 * never resolve — the owner saw the card dismiss on tap but the app never
 * open, and the Reply button did nothing. Explicit component intents always
 * resolve, and a notification tap may launch an activity directly (Android
 * 12+ only blocks broadcast/service trampolines).
 *
 * Never silent: show() wraps the rich build in try/catch — if ANYTHING in
 * the rich path throws (avatar, style, actions), a plain fallback
 * notification with the same tap-to-open deep link is posted instead. This
 * guards the data-only server change: with no android.notification block,
 * FCM posts nothing on its own — this class is the only thing that shows.
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
        if (emailId == null || senderName == null) return;
        if (subject == null || subject.trim().isEmpty()) subject = "(No subject)";

        ensureChannel(context);
        try {
            showRich(context, data, emailId, senderName, subject);
        } catch (Exception richFailed) {
            // Never silent: data-only FCM messages post NOTHING on their own,
            // so any failure here must still land a (plain) notification.
            try {
                showFallback(context, emailId, senderName, subject);
            } catch (Exception ignored) {
                // No notification is possible — nothing else to try.
            }
        }
    }

    /** Gmail-style rich notification: BigTextStyle, avatar, three actions. */
    private static void showRich(
            Context context, Map<String, String> data,
            String emailId, String senderName, String subject) {
        String preview = data.get("preview");
        String avatarUrl = data.get("avatar");

        // Explicit component intent — an implicit ACTION_VIEW here never
        // resolved (no manifest intent-filter for this host) and the tap
        // only dismissed the card without opening anything.
        Intent open = openEmailIntent(context, emailId);
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
                // EzyMail brand blue (sampled from the logo) — colors the
                // notification accent and the icon tint on supported surfaces.
                .setColor(0xFF1870E8)
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
            actionIntent(context, NotificationActionActivity.ACTION_ARCHIVE, emailId));
        // Mark as read — direct native action
        builder.addAction(
            R.drawable.ic_action_read,
            "Mark as read",
            actionIntent(context, NotificationActionActivity.ACTION_MARK_READ, emailId));
        // Reply — opens the compose window with the reply pre-filled
        // (?compose=reply&id=<emailId>; the web app fetches the email and
        // opens the compose with To / Subject / quoted body filled in).
        // Same explicit-intent rule as the content tap.
        Intent reply = composeReplyIntent(context, emailId);
        PendingIntent replyIntent = PendingIntent.getActivity(
            context,
            ("reply" + emailId).hashCode(),
            reply,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        builder.addAction(
            R.drawable.ic_action_reply,
            "Reply",
            replyIntent);

        NotificationManagerCompat.from(context)
            .notify(NOTIFICATION_ID_BASE + (emailId.hashCode() & 0xFFFF), builder.build());
    }

    /** Plain fallback — same look the FCM display block used to produce.
     *  Only reached when the rich build throws (never in normal flow). */
    private static void showFallback(
            Context context, String emailId, String senderName, String subject) {
        Intent open = openEmailIntent(context, emailId);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            emailId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder fallback =
            new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(senderName)
                .setContentText(subject)
                .setContentIntent(contentIntent)
                .setCategory(NotificationCompat.CATEGORY_EMAIL)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL);
        NotificationManagerCompat.from(context)
            .notify(NOTIFICATION_ID_BASE + (emailId.hashCode() & 0xFFFF), fallback.build());
    }

    /** Open-the-email intent: explicit MainActivity target (singleTask),
     *  the URL in Intent data exactly as MainActivity.openDeepLink reads it. */
    static Intent openEmailIntent(Context context, String emailId) {
        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(Uri.parse(SERVER_BASE + "/?id=" + emailId));
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return open;
    }

    /** Reply-compose deep link — same explicit-target rule. */
    static Intent composeReplyIntent(Context context, String emailId) {
        Intent reply = new Intent(context, MainActivity.class);
        reply.setAction(Intent.ACTION_VIEW);
        reply.setData(Uri.parse(SERVER_BASE + "/?compose=reply&id=" + emailId));
        reply.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return reply;
    }

    /** Archive / Mark-as-read: an ACTIVITY PendingIntent, not a broadcast —
     *  Android 12+ blocks receiver trampolines from starting activities
     *  (the old broadcast path's buttons looked dead). The transparent
     *  NotificationActionActivity does the work directly. */
    private static PendingIntent actionIntent(
        Context context, String action, String emailId) {
        Intent intent = new Intent(context, NotificationActionActivity.class);
        intent.setAction(action);
        intent.putExtra(NotificationActionActivity.EXTRA_EMAIL_ID, emailId);
        return PendingIntent.getActivity(
            context,
            (action + emailId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    // Package-visible: EzyMailApp.onCreate calls this on EVERY process start
    // (including when FCM wakes the process in the background for a
    // high-priority message), so the channel always exists BEFORE the FCM SDK
    // posts a background notification that targets it.
    static void ensureChannel(Context context) {
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
