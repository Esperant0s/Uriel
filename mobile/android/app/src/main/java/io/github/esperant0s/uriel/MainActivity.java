package io.github.esperant0s.uriel;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ConnectivityManager.NetworkCallback networkCallback;

    // ---- the page stays awake in the background while music plays ----
    // The page picks, fetches and starts each next song. Android's WebView freezes a page that has been out of
    // sight for about five minutes unless the page itself makes sound, and since the native player (PlayerService)
    // plays the songs, it doesn't: the music stopped at the next song change until the app was opened. So while a
    // song plays or the next one loads, the WebView is told its window is still visible; a while after the music
    // stops it is told the truth again, and may rest. Nothing is drawn meanwhile: there is no window to draw to.
    static final long PAGE_RESTS_AFTER_MS = 60_000;
    private static volatile MainActivity current;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean stopped;
    private final Runnable keepPage = this::keepPageAwake;
    private final Runnable restPage = () -> showPage(false);

    // The music started, stopped or is loading (PlayerService, MediaControlsPlugin), or the page is needed for a
    // button (next, previous): any thread.
    static void musicChanged() {
        MainActivity a = current;
        if (a != null) a.ui.post(a.keepPage);
    }

    // whether Uriel is on screen, which the page can't tell while it is kept awake (PlayerService's visualizer): main thread
    static boolean onScreen() {
        MainActivity a = current;
        return a != null && !a.stopped;
    }

    private static boolean musicActive() {
        PlayerService player = PlayerService.Companion.getInstance();
        return MediaControlsPlugin.playing || (player != null && player.active());
    }

    private void keepPageAwake() {
        // on screen Android says what is visible
        if (!stopped) return;
        ui.removeCallbacks(restPage);
        showPage(true);
        if (!musicActive()) ui.postDelayed(restPage, PAGE_RESTS_AFTER_MS);
    }

    private void showPage(boolean visible) {
        if (!stopped) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) webView.dispatchWindowVisibilityChanged(visible ? View.VISIBLE : View.GONE);
    }

    @Override
    public void onStart() {
        stopped = false;
        ui.removeCallbacks(keepPage);
        ui.removeCallbacks(restPage);
        super.onStart();
    }

    @Override
    public void onStop() {
        super.onStop();
        stopped = true;
        // once the page has heard it is hidden and saved its place (app.js does that on 'visibilitychange')
        if (musicActive()) ui.postDelayed(keepPage, 1000);
    }

    // A WebView only knows it is offline when told: without this navigator.onLine stays true in airplane mode, every
    // offline check in the app is wrong, and the 'online' event that resumes a stalled song never fires.
    private void setWebViewOnline(boolean online) {
        runOnUiThread(() -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) webView.setNetworkAvailable(online);
        });
    }

    private void watchNetwork() {
        ConnectivityManager connectivity = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) return;
        setWebViewOnline(connectivity.getActiveNetwork() != null);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { setWebViewOnline(true); }
            @Override public void onLost(Network network) { setWebViewOnline(false); }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }

    @Override
    public void onDestroy() {
        if (current == this) current = null;
        ui.removeCallbacks(keepPage);
        ui.removeCallbacks(restPage);
        if (networkCallback != null) {
            ConnectivityManager connectivity = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivity != null) connectivity.unregisterNetworkCallback(networkCallback);
            networkCallback = null;
        }
        super.onDestroy();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugins that live in the app itself (not in an npm package) are registered by hand
        registerPlugin(MediaControlsPlugin.class);
        registerPlugin(UrielPlayerPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(DeviceMusicPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        if (getIntent() != null && MediaButtonReceiver.ACTION_RESUME.equals(getIntent().getAction())) {
            MediaControlsPlugin.startPlayWanted = true;
            MediaControlsPlugin.openedByEarbuds = false; // the person opened it from the notification: it stays open
        }
        super.onCreate(savedInstanceState);
        current = this;
        watchNetwork();
        clearResumeNotice();
    }

    // "Tap to keep listening" (MediaButtonReceiver) once Uriel is open; tapping it while Uriel runs plays straight away
    private void clearResumeNotice() {
        try { getSystemService(android.app.NotificationManager.class).cancel(MediaButtonReceiver.RESUME_NOTIFICATION_ID); } catch (Exception ignored) {}
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        clearResumeNotice();
        if (intent == null || !MediaButtonReceiver.ACTION_RESUME.equals(intent.getAction())) return;
        MediaControlsPlugin plugin = MediaControlsPlugin.instance;
        if (plugin != null) plugin.start("play"); else MediaControlsPlugin.startPlayWanted = true;
    }
}
