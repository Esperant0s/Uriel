package io.github.esperant0s.uriel;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
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

    // ---- Add folder: a folder the person picks, and the ones inside it, copied into the library ----
    // .mka is how Uriel's own downloads are saved in Music/Mural (WebM songs: mobile/shims/store.ts)
    private static final Set<String> AUDIO = new HashSet<>(Arrays.asList(
            "mp3", "wav", "flac", "opus", "ogg", "oga", "m4a", "aac", "webm", "weba", "mka"));

    @PluginMethod
    public void pickFolder(PluginCall call) {
        startActivityForResult(call, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), "folderPicked");
    }

    // resolves with { songs: [{ id, file, ext, name, size }] }, the same as electron-api.ts gives for picked files
    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("songs", new JSArray());
            call.resolve(ret);
            return;
        }
        Uri tree = data.getData();
        worker.execute(() -> {
            try {
                JSArray found = new JSArray();
                scan(tree, DocumentsContract.getTreeDocumentId(tree), 0, found);
                JSObject count = new JSObject();
                count.put("count", found.length());
                notifyListeners("folderScanned", count);

                File library = new File(getContext().getFilesDir(), "Mural/library");
                library.mkdirs();
                JSArray songs = new JSArray();
                for (int i = 0; i < found.length(); i++) {
                    JSObject f = JSObject.fromJSONObject(found.getJSONObject(i));
                    String name = f.getString("name");
                    long size = f.getLong("size");
                    String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
                    if (ext.equals("mka")) ext = "webm";
                    String id = "local_" + sha1(name + size).substring(0, 12);
                    File target = new File(library, id + "." + ext);
                    // the same file picked before is there already; one cut short is copied again
                    if (!target.exists() || target.length() != size) {
                        try (InputStream in = getContext().getContentResolver().openInputStream(Uri.parse(f.getString("uri")));
                             OutputStream out = new FileOutputStream(target)) {
                            if (in == null) { target.delete(); continue; }
                            byte[] buf = new byte[1 << 16];
                            int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        } catch (Exception e) {
                            target.delete();
                            continue;
                        }
                    }
                    JSObject s = new JSObject();
                    s.put("id", id);
                    s.put("file", target.getName());
                    s.put("ext", ext);
                    s.put("name", name.substring(0, name.lastIndexOf('.')));
                    s.put("size", target.length());
                    songs.put(s);
                }
                JSObject ret = new JSObject();
                ret.put("songs", songs);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "couldn't read that folder");
            }
        });
    }

    // the audio files in a folder and the folders inside it, four deep like on computers (desktop/main.js)
    private void scan(Uri tree, String docId, int depth, JSArray out) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] cols = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE
        };
        try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0);
                String name = c.getString(1);
                if (name == null || name.startsWith(".")) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                    if (depth < 4) scan(tree, id, depth + 1, out);
                    continue;
                }
                int dot = name.lastIndexOf('.');
                if (dot < 1 || !AUDIO.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT))) continue;
                JSObject f = new JSObject();
                f.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                f.put("name", name);
                f.put("size", c.getLong(3));
                out.put(f);
            }
        }
    }

    private static String sha1(String s) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"))) hex.append(String.format("%02x", b));
        return hex.toString();
    }
}
