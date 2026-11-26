package io.github.esperant0s.uriel;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps downloads going while Uriel is in the background: without a foreground service Android freezes the app soon
 * after it leaves the screen, and a long "Download all" stops until it is opened again. Shows the progress and a
 * Cancel button. The downloading itself happens in the page; MediaControlsPlugin.downloading() drives this.
 */
public class DownloadService extends Service {
    private static final String CHANNEL = "uriel_downloads";
    private static final int NOTIFICATION_ID = 7302;
    private static final String ACTION_CANCEL = "io.github.esperant0s.uriel.CANCEL_DOWNLOADS";
    private static final long WAKE_MS = 30 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;
    // while it runs MainActivity keeps the page awake with Uriel out of sight: the downloading happens there
    static volatile boolean running = false;

    // Starts sent but not yet in onStartCommand. Stopping the service then crashed the app: Android insists a
    // started-in-foreground service calls startForeground() first. The page reports every song, so "done" often came
    // right after the last report and the batch ended with Uriel closing. The stop waits for those starts instead.
    private static final Object lock = new Object();
    private static int pending = 0;
    private static boolean hideWanted = false;

    static void show(Context ctx, String title, int done, int total, int percent, boolean converting) {
        Intent i = new Intent(ctx, DownloadService.class)
                .putExtra("title", title).putExtra("done", done).putExtra("total", total).putExtra("percent", percent)
                .putExtra("converting", converting);
        synchronized (lock) {
            hideWanted = false;
            pending++;
        }
        try {
            ContextCompat.startForegroundService(ctx, i);
        } catch (RuntimeException e) {
            synchronized (lock) { pending--; }
            throw e;
        }
    }

    static void hide(Context ctx) {
        synchronized (lock) {
            if (pending > 0) { hideWanted = true; return; }
        }
        ctx.stopService(new Intent(ctx, DownloadService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CANCEL.equals(intent.getAction())) {
            MediaControlsPlugin plugin = MediaControlsPlugin.instance;
            if (plugin != null) plugin.send("cancel-downloads", -1);
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = build(intent);
        boolean stopNow;
        try {
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
        } catch (Exception e) {
            // not allowed right now: the download just depends on the app staying open
            synchronized (lock) { if (pending > 0) pending--; }
            stopSelf();
            return START_NOT_STICKY;
        }
        synchronized (lock) {
            if (pending > 0) pending--;
            stopNow = hideWanted && pending == 0;
            if (stopNow) hideWanted = false;
        }
        // the downloads ended while this start was on its way
        if (stopNow) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            MainActivity.musicChanged();
        }
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Uriel:downloads");
            wakeLock.setReferenceCounted(false);
        }
        wakeLock.acquire(WAKE_MS);
        return START_NOT_STICKY;
    }

    private Notification build(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Songs being saved to this phone");
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        String title = intent != null ? intent.getStringExtra("title") : null;
        int done = intent != null ? intent.getIntExtra("done", 0) : 0;
        int total = intent != null ? intent.getIntExtra("total", 0) : 0;
        int percent = intent != null ? intent.getIntExtra("percent", -1) : -1;
        boolean converting = intent != null && intent.getBooleanExtra("converting", false);
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 40, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent cancel = PendingIntent.getService(this, 41, new Intent(this, DownloadService.class).setAction(ACTION_CANCEL), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(total > 1 ? "Downloading " + Math.min(total, done + 1) + " of " + total : converting ? "Converting" : "Downloading")
                .setContentText(title != null ? title : "")
                .setContentIntent(contentIntent)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setSilent(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel", cancel);
        // percent is the whole job's (a batch counts the songs under way too), so the bar moves during each song
        if (percent >= 0) b.setProgress(100, percent, false);
        else if (total > 1) b.setProgress(total, done, false);
        else b.setProgress(0, 0, true);
        return b.build();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // Android's daily limit for this kind of service: the rest continues once the app is open again
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        // the page may rest again a while after this (MainActivity)
        MainActivity.musicChanged();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
