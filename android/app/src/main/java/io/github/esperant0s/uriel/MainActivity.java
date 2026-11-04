package io.github.esperant0s.uriel;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugins that live in the app itself (not in an npm package) are registered by hand
        registerPlugin(MediaControlsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(DeviceMusicPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
