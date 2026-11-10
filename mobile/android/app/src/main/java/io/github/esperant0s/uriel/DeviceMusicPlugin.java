package io.github.esperant0s.uriel;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The songs already on the phone, from Android's media library (mobile/device-music.ts lists them in My files).
 * Each comes with its file path: the WebView plays it from there, the way it plays Uriel's own downloads in
 * Music/Mural. Reading the library needs "Music and audio" (Android 13+) or storage access (older), asked once.
 */
@CapacitorPlugin(
        name = "UrielDeviceMusic",
        permissions = {
                @Permission(strings = { Manifest.permission.READ_MEDIA_AUDIO }, alias = "audio"),
                @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage")
        })
public class DeviceMusicPlugin extends Plugin {
    private static final int MAX_SONGS = 20000;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
    }

    private boolean granted() {
        return getPermissionState(alias()) == PermissionState.GRANTED;
    }

    // { granted, canAsk }: canAsk is false once Android won't show the question again (then only Settings can)
    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", granted());
        ret.put("canAsk", getPermissionState(alias()) != PermissionState.DENIED);
        call.resolve(ret);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (granted()) { status(call); return; }
        requestPermissionForAlias(alias(), call, "afterRequest");
    }

    @PermissionCallback
    private void afterRequest(PluginCall call) {
        status(call);
    }

    // { granted, songs: [{ path, name, title, artist, album, duration (s), size, added (ms) }] }
    @PluginMethod
    public void list(PluginCall call) {
        if (!granted()) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            ret.put("songs", new JSArray());
            call.resolve(ret);
            return;
        }
        worker.execute(() -> {
            JSArray songs = new JSArray();
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] columns = {
                    MediaStore.Audio.Media.DATA, MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE, MediaStore.Audio.Media.DATE_ADDED
            };
            // music only: no ringtones, alarms, notification sounds or voice recordings
            String where = MediaStore.Audio.Media.IS_MUSIC + " != 0";
            try (Cursor c = resolver.query(collection, columns, where, null, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                if (c != null) {
                    while (c.moveToNext() && songs.length() < MAX_SONGS) {
                        String path = c.getString(0);
                        if (path == null || !new File(path).canRead()) continue;
                        JSObject s = new JSObject();
                        s.put("path", path);
                        s.put("name", c.getString(1));
                        s.put("title", c.getString(2));
                        String artist = c.getString(3);
                        s.put("artist", artist == null || "<unknown>".equals(artist) ? "" : artist);
                        s.put("album", c.getString(4));
                        s.put("duration", c.getLong(5) / 1000.0);
                        s.put("size", c.getLong(6));
                        s.put("added", c.getLong(7) * 1000);
                        songs.put(s);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("granted", true);
                ret.put("songs", songs);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "couldn't read the music library");
            }
        });
    }
}
