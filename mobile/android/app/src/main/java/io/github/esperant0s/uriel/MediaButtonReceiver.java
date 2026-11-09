package io.github.esperant0s.uriel;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.KeyEvent;

import androidx.annotation.OptIn;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.util.UnstableApi;

/**
 * A tap on earbuds or a headset when Uriel has no media session of its own running. Android remembers this receiver
 * for the app that played last, also after the app was closed.
 * Android lets an app have one such receiver, and it serves both of Uriel's players:
 *  - The native player (PlayerService.kt, Media3) was the one playing last: Media3 starts it, and it plays the last
 *    song and the saved songs after it (its onPlaybackResumption), with nothing opening on screen.
 * The rest is for the page's own player, used while sound effects are on (MediaControlsPlugin):
 *  - Uriel's page running (in the background, paused): the tap plays, pauses or skips, as it should.
 *  - Uriel closed: ColdPlayer plays the last song from the phone's song cache straight away, with nothing opening
 *    on screen, the way Spotify does.
 *  - Closed, and that song isn't saved on the phone: only the app can play it. Uriel tries to open (Android lets the
 *    tap do that on some phones, then it goes back out of sight once the music plays), and puts up "Tap to keep
 *    listening" in case it can't: opening that plays the last song (MainActivity, MediaControlsPlugin).
 */
@OptIn(markerClass = UnstableApi.class)
public class MediaButtonReceiver extends androidx.media3.session.MediaButtonReceiver {
    static final String ACTION_RESUME = "io.github.esperant0s.uriel.RESUME_PLAYBACK";
    static final int RESUME_NOTIFICATION_ID = 7303;
    private static final String CHANNEL = "uriel_resume";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return;
        KeyEvent key = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        // a held button repeats its key: only the first press counts
        if (key == null || key.getAction() != KeyEvent.ACTION_DOWN || key.getRepeatCount() > 0) return;
        int code = key.getKeyCode();
        boolean known = code == KeyEvent.KEYCODE_MEDIA_PLAY || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_HEADSETHOOK
                || code == KeyEvent.KEYCODE_MEDIA_NEXT || code == KeyEvent.KEYCODE_MEDIA_PREVIOUS
                || code == KeyEvent.KEYCODE_MEDIA_PAUSE || code == KeyEvent.KEYCODE_MEDIA_STOP;
        if (!known) return;

        // the native player: Media3 takes the key to it (and starts it if Uriel isn't running)
        if (PlayerService.Companion.getInstance() != null || nativeLast(context)) {
            super.onReceive(context, intent);
            return;
        }
        MediaControlsPlugin plugin = MediaControlsPlugin.instance;
        if (plugin != null) {
            if (code == KeyEvent.KEYCODE_MEDIA_NEXT) plugin.start("next");
            else if (code == KeyEvent.KEYCODE_MEDIA_PREVIOUS) plugin.start("prev");
            else if (code == KeyEvent.KEYCODE_MEDIA_PAUSE || code == KeyEvent.KEYCODE_MEDIA_STOP) plugin.send("pause", -1);
            else if (MediaControlsPlugin.playing && code != KeyEvent.KEYCODE_MEDIA_PLAY) plugin.send("pause", -1);
            else plugin.start("play");
            return;
        }
        if (ColdPlayer.handleKey(context, code)) return;
        openApp(context, true);
    }

    // which player played last: the page tells with every song (MediaControlsPlugin.update)
    private static boolean nativeLast(Context context) {
        return !"web".equals(context.getSharedPreferences(ColdPlayer.PREFS, Context.MODE_PRIVATE).getString(ColdPlayer.KEY_PLAYER, "native"));
    }

    // The app opens and plays the last song (or carries on after the songs ColdPlayer had). byEarbuds: nobody
    // opened it on purpose, so it goes back out of sight once the music plays.
    static void openApp(Context context, boolean byEarbuds) {
        MediaControlsPlugin.startPlayWanted = true;
        MediaControlsPlugin.openedByEarbuds = byEarbuds;
        try { context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
        // MainActivity takes this away again when it did open
        showResume(context, "Tap to keep listening", "Uriel was closed. It starts where you left off.");
    }

    static void clearResume(Context ctx) {
        try { ctx.getSystemService(NotificationManager.class).cancel(RESUME_NOTIFICATION_ID); } catch (Exception ignored) {}
    }

    static void showResume(Context ctx, String title, String text) {
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
        try {
            nm.notify(RESUME_NOTIFICATION_ID, new NotificationCompat.Builder(ctx, CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_media_play)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setTimeoutAfter(60_000)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                    .build());
        } catch (Exception ignored) {
            // notifications turned off
        }
    }
}
