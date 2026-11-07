package io.github.esperant0s.uriel;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ConnectivityManager.NetworkCallback networkCallback;

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
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(DeviceMusicPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        watchNetwork();
    }
}
