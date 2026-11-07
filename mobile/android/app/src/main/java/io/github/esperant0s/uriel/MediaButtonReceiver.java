package io.github.esperant0s.uriel;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.KeyEvent;

import androidx.core.app.NotificationCompat;

/**
 * A tap on earbuds or a headset when Uriel has no media session of its own running. Android remembers this receiver
 * for the app that played last, also after the app was closed.
 *  - Uriel still running (in the background, paused): the tap plays, pauses or skips, as it should.
 *  - Uriel closed by Android: its player lives in the app's page, and Android doesn't let an app open its page from
 *    the background, so the tap can't start the music by itself like Spotify's background player. It tries, and
 *    puts up "Tap to keep listening": opening that plays the last song (MainActivity, MediaControlsPlugin).
 */
public class MediaButtonReceiver extends BroadcastReceiver {
    static final String ACTION_RESUME = "io.github.esperant0s.uriel.RESUME_PLAYBACK";
    static final int RESUME_NOTIFICATION_ID = 7303;
    private static final String CHANNEL = "uriel_resume";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return;
        KeyEvent key = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        if (key == null || key.getAction() != KeyEvent.ACTION_DOWN) return;
        int code = key.getKeyCode();
        boolean starts = code == KeyEvent.KEYCODE_MEDIA_PLAY || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_HEADSETHOOK
                || code == KeyEvent.KEYCODE_MEDIA_NEXT || code == KeyEvent.KEYCODE_MEDIA_PREVIOUS;
        if (!starts) return;

        MediaControlsPlugin plugin = MediaControlsPlugin.instance;
        if (plugin != null) {
            if (code == KeyEvent.KEYCODE_MEDIA_NEXT) plugin.start("next");
            else if (code == KeyEvent.KEYCODE_MEDIA_PREVIOUS) plugin.start("prev");
            else if (MediaControlsPlugin.playing && code != KeyEvent.KEYCODE_MEDIA_PLAY) plugin.send("pause", -1);
            else plugin.start("play");
            return;
        }
        MediaControlsPlugin.startPlayWanted = true;
        MediaControlsPlugin.openedByEarbuds = true;
        try { context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
        // MainActivity takes this away again when it did open
        showResume(context);
    }

    private static void showResume(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Resume from earbuds", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("When Uriel was closed and your earbuds or headset asked for music");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
        Intent open = new Intent(ctx, MainActivity.class).setAction(ACTION_RESUME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 60, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        nm.notify(RESUME_NOTIFICATION_ID, new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("Tap to keep listening")
                .setContentText("Uriel was closed. It starts where you left off.")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setTimeoutAfter(60_000)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .build());
    }
}
