package io.github.esperant0s.uriel;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.view.KeyEvent;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.AudioAttributesCompat;
import androidx.media.AudioFocusRequestCompat;
import androidx.media.AudioManagerCompat;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Earbuds or a headset asked for music while Uriel isn't running: the last song plays straight away from the phone's
 * song cache, with nothing opening on screen, the way Spotify does.
 *
 * Uriel's player lives in the app's page, and the page needs the app on screen to start. Opening it from the
 * background showed the app over whatever was on screen until the song played, and many phones (vivo, Xiaomi, OPPO,
 * and stock Android when a setting says so) don't let an app open itself from the background at all. Android does let
 * an earbud tap start a foreground service, so this plays the song there with Android's own player.
 *
 * What to play comes from the page while it runs (MediaControlsPlugin.update → remember): the song, where it was,
 * and the next songs of the queue that are saved on the phone. This plays through those. Once the app is opened, the
 * page takes over from the same song and place (takeOver, media-controls.ts); if it isn't, the place is kept so the
 * next start, here or in the app, carries on from it.
 *
 * Main thread only, except remember, takeOver and stored.
 */
final class ColdPlayer {
    static final String PREFS = "uriel_resume";
    private static final String KEY_CURRENT = "current";
    private static final String KEY_UPCOMING = "upcoming";
    private static final String KEY_POSITION = "position";
    private static final String KEY_SHUFFLE = "shuffle";
    private static final String KEY_REPEAT = "repeat";
    // where the music got to here, for the page (takeOver): { qi, title, artist, position, playing, ended }
    private static final String KEY_HANDOVER = "handover";
    // "native" (PlayerService.kt) or "web" (the page's own player, for sound effects): which one earbuds wake
    static final String KEY_PLAYER = "player";
    // a song this short or less is a broken download (the same check as server.js findCachedFile)
    private static final long MIN_FILE_BYTES = 60_000;
    private static final long SAVE_EVERY_MS = 10_000;

    // set and cleared on the main thread; MediaControlsPlugin reads it from its own
    private static volatile ColdPlayer active;
    private static final Handler main = new Handler(Looper.getMainLooper());

    // a song this can play: one of the page's queue, saved on the phone
    private static final class Entry {
        final int qi;
        final String title, artist, album, artwork;
        final long durationMs;
        final File file, thumb;
        final JSONObject json;

        Entry(Context ctx, JSONObject o) {
            json = o;
            qi = o.optInt("qi", -1);
            title = o.optString("title", "");
            artist = o.optString("artist", "");
            album = o.optString("album", "");
            artwork = o.optString("artwork", "");
            durationMs = (long) (o.optDouble("duration", 0) * 1000);
            file = songFile(ctx, o.optString("path", ""), o.optString("cache", ""));
            thumb = cacheFile(ctx, "thumbnails", o.optString("thumb", ""));
        }

        boolean playable() {
            return file != null && file.isFile() && file.length() > MIN_FILE_BYTES;
        }
    }

    private final Context ctx;
    private final List<Entry> entries;
    private final boolean shuffle;
    private final String repeat;
    private final List<Integer> history = new ArrayList<>();
    private final Random random = new Random();
    private int index;
    private MediaPlayer player;
    private boolean prepared;
    private boolean wantPlaying = true;
    // paused by a call or another app for a moment: plays again when it gives the sound back
    private boolean pausedForFocus;
    private long startAtMs;
    private boolean ended;
    private MediaSessionCompat session;
    private AudioFocusRequestCompat focus;
    private boolean haveFocus;
    private boolean noisyRegistered;
    private Bitmap art;
    private final Runnable saveLater = new Runnable() {
        @Override public void run() {
            persist();
            if (isPlaying()) main.postDelayed(this, SAVE_EVERY_MS);
        }
    };

    // Headphones unplugged or a Bluetooth speaker gone: Android is about to play out loud, so pause (#32)
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { pause(); }
    };

    private final AudioManager.OnAudioFocusChangeListener focusListener = (change) -> {
        if (active != this) return;
        if (change == AudioManager.AUDIOFOCUS_LOSS) {
            pausedForFocus = false;
            haveFocus = false;
            pause();
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            // ducking is left to Android (setWillPauseWhenDucked false); a transient loss is a call or an assistant
            if (isPlaying()) { pause(); pausedForFocus = true; }
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            if (pausedForFocus) { pausedForFocus = false; play(); }
        }
    };

    private ColdPlayer(Context ctx, List<Entry> entries, int index, long startAtMs, boolean shuffle, String repeat) {
        this.ctx = ctx;
        this.entries = entries;
        this.index = index;
        this.startAtMs = startAtMs;
        this.shuffle = shuffle;
        this.repeat = repeat;
    }

    static boolean isActive() {
        return active != null;
    }

    // ---- what the page tells (MediaControlsPlugin.update, any thread) ----

    // current: the song on the page (title, artist, album, artwork, duration, qi, path or cache, thumb); upcoming:
    // the songs after it that are saved on the phone, in queue order. A song the page can't place on the phone right
    // now (the one brought back from last time, before it loads) keeps the file it had.
    static void remember(Context ctx, JSONObject current, JSONArray upcoming, double position, boolean shuffle, String repeat) {
        SharedPreferences p = prefs(ctx);
        try {
            if (current.optString("path", "").isEmpty() && current.optString("cache", "").isEmpty()) {
                JSONObject before = new JSONObject(p.getString(KEY_CURRENT, "{}"));
                if (sameSong(before, current)) {
                    current.put("path", before.optString("path", ""));
                    current.put("cache", before.optString("cache", ""));
                }
            }
        } catch (JSONException ignored) {}
        p.edit()
                .putString(KEY_CURRENT, current.toString())
                .putString(KEY_UPCOMING, upcoming.toString())
                .putFloat(KEY_POSITION, (float) Math.max(0, position))
                .putBoolean(KEY_SHUFFLE, shuffle)
                .putString(KEY_REPEAT, repeat)
                .apply();
    }

    // ---- earbuds (MediaButtonReceiver, main thread) ----

    // A key while Uriel's page isn't running. True when it was taken care of here; false when there is nothing on the
    // phone to play, and the app has to open for it.
    static boolean handleKey(Context context, int code) {
        if (active != null) {
            active.onKey(code);
            return true;
        }
        if (code == KeyEvent.KEYCODE_MEDIA_PAUSE || code == KeyEvent.KEYCODE_MEDIA_STOP) return true;
        return start(context.getApplicationContext(), code);
    }

    private static boolean start(Context ctx, int code) {
        SharedPreferences p = prefs(ctx);
        // the songs saved here earlier ran out: the app has to open for the next one
        JSONObject handover = json(p.getString(KEY_HANDOVER, null));
        if (handover != null && (handover.optBoolean("ended") || handover.optBoolean("needsApp"))) return false;
        List<Entry> entries = new ArrayList<>();
        JSONObject cur = json(p.getString(KEY_CURRENT, null));
        if (cur == null) return false;
        Entry first = new Entry(ctx, cur);
        if (!first.playable()) return false;
        entries.add(first);
        try {
            JSONArray up = new JSONArray(p.getString(KEY_UPCOMING, "[]"));
            for (int i = 0; i < up.length(); i++) {
                JSONObject o = up.optJSONObject(i);
                if (o == null) continue;
                Entry e = new Entry(ctx, o);
                if (e.playable()) entries.add(e);
            }
        } catch (JSONException ignored) {}
        long position = (long) (p.getFloat(KEY_POSITION, 0f) * 1000);
        // a song that had nearly finished starts over, as the page does (togglePlayPause)
        if (first.durationMs > 0 && position > first.durationMs - 5000) position = 0;
        int startIndex = 0;
        if (code == KeyEvent.KEYCODE_MEDIA_PREVIOUS) position = 0;
        else if (code == KeyEvent.KEYCODE_MEDIA_NEXT) {
            if (entries.size() < 2) return false;
            startIndex = 1;
            position = 0;
        }
        String repeat = p.getString(KEY_REPEAT, "off");
        ColdPlayer player = new ColdPlayer(ctx, entries, startIndex, position, p.getBoolean(KEY_SHUFFLE, false), repeat);
        if (startIndex != 0) player.history.add(0);
        // on a call: the tap is taken, and nothing plays over it
        AudioManager am = ctx.getSystemService(AudioManager.class);
        if (am != null && (am.getMode() == AudioManager.MODE_IN_CALL || am.getMode() == AudioManager.MODE_IN_COMMUNICATION)) return true;
        player.begin();
        return true;
    }

    // Has to happen while Android lets the earbud tap start a foreground service (some seconds): the session, the
    // notification and the service right away, the song once it has loaded.
    // Android 15+ gives the sound only to an app on screen or with a foreground service running, and the service
    // started for this only gets there once the earbud tap has been handled: asked again then (foregroundStarted).
    private boolean takeFocus() {
        if (haveFocus) return true;
        AudioManager am = ctx.getSystemService(AudioManager.class);
        if (am == null) return false;
        if (focus == null) {
            focus = new AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributesCompat.Builder()
                            .setUsage(AudioAttributesCompat.USAGE_MEDIA)
                            .setContentType(AudioAttributesCompat.CONTENT_TYPE_MUSIC).build())
                    .setOnAudioFocusChangeListener(focusListener, main)
                    .setWillPauseWhenDucked(false)
                    .build();
        }
        haveFocus = AudioManagerCompat.requestAudioFocus(am, focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        return haveFocus;
    }

    // PlaybackService is in the foreground (any thread)
    static void foregroundStarted() {
        main.post(() -> { if (active != null) active.onForeground(); });
    }

    private void onForeground() {
        if (!wantPlaying || ended || !prepared || isPlaying()) return;
        if (takeFocus()) {
            try { player.start(); } catch (IllegalStateException ignored) {}
            publish();
        } else {
            // the sound is someone else's (a call, an alarm): paused, with the notification to play later
            pause();
        }
    }

    private void begin() {
        active = this;
        session = new MediaSessionCompat(ctx, "Uriel");
        session.setMediaButtonReceiver(MediaControlsPlugin.mediaButtonIntent(ctx));
        session.setSessionActivity(MediaControlsPlugin.openApp(ctx));
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { play(); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { pause(); }
            @Override public void onSkipToNext() { next(false); }
            @Override public void onSkipToPrevious() { previous(); }
            @Override public void onSeekTo(long pos) { seek(pos); }
        }, main);
        session.setActive(true);
        ContextCompat.registerReceiver(ctx, noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
        noisyRegistered = true;
        load();
        // nothing opens on screen; a "Tap to keep listening" from an earlier try is old news
        MediaButtonReceiver.clearResume(ctx);
    }

    private Entry entry() {
        return entries.get(index);
    }

    private void load() {
        Entry e = entry();
        releasePlayer();
        prepared = false;
        ended = false;
        art = null;
        loadArt(e);
        MediaPlayer mp = new MediaPlayer();
        player = mp;
        mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
        mp.setWakeMode(ctx, PowerManager.PARTIAL_WAKE_LOCK);
        mp.setOnPreparedListener((m) -> {
            if (m != player) return;
            prepared = true;
            if (startAtMs > 0) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) m.seekTo(startAtMs, MediaPlayer.SEEK_CLOSEST);
                else m.seekTo((int) startAtMs);
            }
            startAtMs = 0;
            // without the sound yet (see takeFocus) it starts once the service is in the foreground
            if (wantPlaying && takeFocus()) m.start();
            publish();
        });
        mp.setOnCompletionListener((m) -> { if (m == player) next(true); });
        mp.setOnErrorListener((m, what, extra) -> {
            if (m == player) main.post(this::unplayable);
            return true;
        });
        try {
            mp.setDataSource(e.file.getAbsolutePath());
            mp.prepareAsync();
        } catch (Exception ex) {
            main.post(this::unplayable);
        }
        publish();
    }

    // A file Android can't play: on to the next one. With none left, the app plays it (it may have another way).
    private void unplayable() {
        if (active != this || entries.isEmpty()) return;
        Entry bad = entries.remove(index);
        List<Integer> kept = new ArrayList<>();
        for (int i : history) if (i != index) kept.add(i > index ? i - 1 : i);
        history.clear();
        history.addAll(kept);
        if (index < entries.size()) {
            startAtMs = 0;
            load();
            return;
        }
        releasePlayer();
        try {
            JSONObject h = new JSONObject();
            h.put("qi", bad.qi);
            h.put("title", bad.title);
            h.put("artist", bad.artist);
            h.put("position", position() / 1000.0);
            h.put("needsApp", true);
            prefs(ctx).edit().putString(KEY_HANDOVER, h.toString()).apply();
        } catch (JSONException ignored) {}
        entries.clear();
        stop();
        MediaButtonReceiver.showResume(ctx, "Tap to keep listening", "Uriel opens to play " + bad.title + ".");
    }

    private boolean isPlaying() {
        try { return player != null && prepared && player.isPlaying(); } catch (IllegalStateException e) { return false; }
    }

    private long position() {
        if (player == null || !prepared) return startAtMs;
        try { return player.getCurrentPosition(); } catch (IllegalStateException e) { return 0; }
    }

    void play() {
        if (ended) {
            // the saved songs ran out: only the app can carry on
            MediaButtonReceiver.openApp(ctx, true);
            return;
        }
        pausedForFocus = false;
        wantPlaying = true;
        if (player != null && prepared && takeFocus()) {
            try { player.start(); } catch (IllegalStateException ignored) {}
        }
        // also brings the service back into the foreground, after which the song starts if it couldn't yet
        publish();
    }

    void pause() {
        wantPlaying = false;
        if (player != null && prepared) {
            try { player.pause(); } catch (IllegalStateException ignored) {}
        }
        publish();
    }

    void toggle() {
        if (wantPlaying && !ended) pause(); else play();
    }

    void seek(long ms) {
        if (player != null && prepared) {
            try { player.seekTo((int) Math.max(0, ms)); } catch (IllegalStateException ignored) {}
        } else startAtMs = Math.max(0, ms);
        publish();
    }

    void previous() {
        if (position() > 3000 || history.isEmpty()) { seek(0); return; }
        index = history.remove(history.size() - 1);
        startAtMs = 0;
        wantPlaying = true;
        load();
    }

    // natural: the song played to its end
    void next(boolean natural) {
        if (natural && "one".equals(repeat)) {
            seek(0);
            if (player != null && prepared && takeFocus()) { try { player.start(); } catch (IllegalStateException ignored) {} }
            return;
        }
        int nextIndex = -1;
        if (shuffle) {
            List<Integer> left = new ArrayList<>();
            for (int i = 0; i < entries.size(); i++) if (i != index && !history.contains(i)) left.add(i);
            if (!left.isEmpty()) nextIndex = left.get(random.nextInt(left.size()));
        } else if (index + 1 < entries.size()) nextIndex = index + 1;
        if (nextIndex < 0) {
            finish();
            return;
        }
        history.add(index);
        index = nextIndex;
        startAtMs = 0;
        wantPlaying = true;
        load();
    }

    // The saved songs ran out (or none of them would play). The next song needs the app: it is told to carry on
    // after this one when it opens, and a tap on the notification or the earbuds opens it.
    private void finish() {
        ended = true;
        wantPlaying = false;
        persist();
        stop();
        MediaButtonReceiver.showResume(ctx, "Tap to keep listening", "The next song plays in Uriel.");
    }

    private void onKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY: play(); break;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_STOP: pause(); break;
            case KeyEvent.KEYCODE_MEDIA_NEXT: next(false); break;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: previous(); break;
            default: toggle();
        }
    }

    // The session, the notification and the service follow the player, and the place is saved.
    private void publish() {
        if (active != this || session == null) return;
        Entry e = entry();
        boolean playing = wantPlaying && !ended;
        MediaMetadataCompat.Builder m = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, e.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, e.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, e.album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs());
        if (art != null) m.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
        session.setMetadata(m.build());
        session.setPlaybackState(new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_STOP
                        | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackStateCompat.ACTION_SEEK_TO)
                .setState(!playing ? PlaybackStateCompat.STATE_PAUSED
                                : prepared ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_BUFFERING,
                        position(), playing && prepared ? 1f : 0f)
                .build());
        MediaControlsPlugin.post(ctx, notification(e, playing), playing);
        if (!noisyRegistered) {
            ContextCompat.registerReceiver(ctx, noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
            noisyRegistered = true;
        }
        persist();
        main.removeCallbacks(saveLater);
        if (playing) main.postDelayed(saveLater, SAVE_EVERY_MS);
    }

    private long durationMs() {
        if (player != null && prepared) {
            try { int d = player.getDuration(); if (d > 0) return d; } catch (IllegalStateException ignored) {}
        }
        return entry().durationMs;
    }

    private Notification notification(Entry e, boolean playing) {
        return new NotificationCompat.Builder(ctx, MediaControlsPlugin.CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_uriel)
                .setContentTitle(e.title)
                .setContentText(e.artist)
                .setLargeIcon(art)
                .setContentIntent(MediaControlsPlugin.openApp(ctx))
                .setDeleteIntent(PlaybackService.intent(ctx, PlaybackService.ACTION_DISMISS, 4))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setSilent(true)
                .setOngoing(playing)
                // Android 12 and older draw these buttons themselves; newer versions use the session's
                .addAction(android.R.drawable.ic_media_previous, "Previous", PlaybackService.intent(ctx, PlaybackService.ACTION_PREV, 1))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play",
                        PlaybackService.intent(ctx, PlaybackService.ACTION_TOGGLE, 2))
                .addAction(android.R.drawable.ic_media_next, "Next", PlaybackService.intent(ctx, PlaybackService.ACTION_NEXT, 3))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2))
                .build();
    }

    private void loadArt(Entry e) {
        new Thread(() -> {
            Bitmap b = null;
            if (e.thumb != null && e.thumb.isFile()) b = MediaControlsPlugin.decode(fileBytes(e.thumb));
            if (b == null && e.artwork.startsWith("https://")) b = MediaControlsPlugin.download(e.artwork);
            if (b == null) return;
            final Bitmap bitmap = b;
            main.post(() -> {
                if (active != this || entry() != e) return;
                art = bitmap;
                publish();
            });
        }, "uriel-cold-art").start();
    }

    // The place, for the next start and for the page (takeOver): the song becomes the one to resume, and the songs
    // still to come stay after it.
    private void persist() {
        if (entries.isEmpty()) return;
        Entry e = entry();
        long pos = position();
        try {
            JSONArray up = new JSONArray();
            for (int i = index + 1; i < entries.size(); i++) up.put(entries.get(i).json);
            prefs(ctx).edit()
                    .putString(KEY_CURRENT, e.json.toString())
                    .putString(KEY_UPCOMING, up.toString())
                    .putFloat(KEY_POSITION, pos / 1000f)
                    .putString(KEY_HANDOVER, handover(e, pos, false).toString())
                    .apply();
        } catch (JSONException ignored) {}
    }

    // The native player (PlayerService) playing on without the page: where it got to, saved as persist() saves it,
    // so the next start (the app, or earbuds) carries on from this song and not the one that session began with.
    static void rememberNative(Context ctx, JSONObject current, JSONArray upcoming, long pos) {
        try {
            JSONObject h = new JSONObject();
            h.put("qi", current.optInt("qi", -1));
            h.put("title", current.optString("title", ""));
            h.put("artist", current.optString("artist", ""));
            h.put("position", pos / 1000.0);
            h.put("playing", false);
            h.put("ended", false);
            prefs(ctx).edit()
                    .putString(KEY_CURRENT, current.toString())
                    .putString(KEY_UPCOMING, upcoming.toString())
                    .putFloat(KEY_POSITION, pos / 1000f)
                    .putString(KEY_HANDOVER, h.toString())
                    .apply();
        } catch (JSONException ignored) {}
    }

    private JSONObject handover(Entry e, long pos, boolean playing) throws JSONException {
        JSONObject h = new JSONObject();
        h.put("qi", e.qi);
        h.put("title", e.title);
        h.put("artist", e.artist);
        h.put("position", pos / 1000.0);
        h.put("playing", playing);
        h.put("ended", ended);
        return h;
    }

    // Ends this player; the notification and the service go with it unless the page has them now (taken).
    private void stop() {
        main.removeCallbacks(saveLater);
        releasePlayer();
        if (noisyRegistered) {
            try { ctx.unregisterReceiver(noisy); } catch (IllegalArgumentException ignored) {}
            noisyRegistered = false;
        }
        AudioManager am = ctx.getSystemService(AudioManager.class);
        if (focus != null && am != null) AudioManagerCompat.abandonAudioFocusRequest(am, focus);
        focus = null;
        haveFocus = false;
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (active == this) {
            active = null;
            if (MediaControlsPlugin.instance == null) {
                MediaControlsPlugin.playing = false;
                try { ctx.stopService(new Intent(ctx, PlaybackService.class)); } catch (Exception ignored) {}
                try { ctx.getSystemService(android.app.NotificationManager.class).cancel(MediaControlsPlugin.NOTIFICATION_ID); } catch (Exception ignored) {}
            }
        }
    }

    private void releasePlayer() {
        if (player == null) return;
        MediaPlayer mp = player;
        player = null;
        prepared = false;
        try { mp.reset(); } catch (Exception ignored) {}
        try { mp.release(); } catch (Exception ignored) {}
    }

    // The playback notification was swiped away while paused: done here.
    static void dismissed() {
        main.post(() -> { if (active != null && !active.wantPlaying) active.stop(); });
    }

    static void togglePressed() { main.post(() -> { if (active != null) active.toggle(); }); }
    static void nextPressed() { main.post(() -> { if (active != null) active.next(false); }); }
    static void prevPressed() { main.post(() -> { if (active != null) active.previous(); }); }

    // ---- the page takes over (MediaControlsPlugin, any thread) ----

    // Where the music got to here, or null: from this player while it runs (it stops, the page carries on), else
    // from the last time it ran. Given once.
    static JSObject takeOver(Context context) {
        Context ctx = context.getApplicationContext();
        AtomicReference<JSONObject> live = new AtomicReference<>();
        Runnable take = () -> {
            ColdPlayer p = active;
            if (p == null) return;
            try {
                JSONObject h = p.handover(p.entry(), p.position(), p.wantPlaying && !p.ended);
                h.put("live", true);
                live.set(h);
            } catch (Exception ignored) {}
            p.persist();
            p.stop();
        };
        if (Looper.myLooper() == Looper.getMainLooper()) take.run();
        else {
            CountDownLatch done = new CountDownLatch(1);
            main.post(() -> { try { take.run(); } finally { done.countDown(); } });
            try { done.await(3, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        }
        SharedPreferences p = prefs(ctx);
        JSONObject h = live.get() != null ? live.get() : json(p.getString(KEY_HANDOVER, null));
        p.edit().remove(KEY_HANDOVER).apply();
        if (h == null) return null;
        try { return JSObject.fromJSONObject(h); } catch (JSONException e) { return null; }
    }

    // ---- helpers ----

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject json(String s) {
        if (s == null) return null;
        try { return new JSONObject(s); } catch (JSONException e) { return null; }
    }

    private static boolean sameSong(JSONObject a, JSONObject b) {
        return a.optString("title", "").equals(b.optString("title", "")) && a.optString("artist", "").equals(b.optString("artist", ""));
    }

    // A file the page played (path: a song in the cache, the downloads folder or on the phone), or one in the song
    // cache by its name (mobile/shims/store.ts keeps /data/… in files/Mural/…)
    private static File songFile(Context ctx, String path, String cache) {
        if (path != null && path.startsWith("/")) return new File(path);
        return cacheFile(ctx, "tracks", cache);
    }

    private static File cacheFile(Context ctx, String dir, String name) {
        if (name == null || !name.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9]+")) return null;
        return new File(ctx.getFilesDir(), "Mural/" + dir + "/" + name);
    }

    private static byte[] fileBytes(File f) {
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 8 * 1024 * 1024) return null;
            }
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }
}
