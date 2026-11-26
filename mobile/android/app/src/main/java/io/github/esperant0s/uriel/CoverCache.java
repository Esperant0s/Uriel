package io.github.esperant0s.uriel;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

// Song covers kept on the phone. The WebView's own cache drops them quickly (YouTube lets a cover be kept for two
// hours), so every list downloaded its covers again after a while. Covers from these hosts are saved the first time
// and read from the phone after that, also offline. The page's addresses stay the same.
class CoverCache {
    private static final Pattern HOSTS = Pattern.compile("(^|\\.)(ytimg\\.com|googleusercontent\\.com|ggpht\\.com|sndcdn\\.com|mzstatic\\.com)$");
    private static final long MAX_BYTES = 80L * 1024 * 1024;
    private static final int MAX_COVER = 4 * 1024 * 1024;
    private static int savedSinceTrim;

    static WebResourceResponse serve(Context context, WebResourceRequest request) {
        String host = request.getUrl().getHost();
        if (!"GET".equals(request.getMethod()) || !"https".equals(request.getUrl().getScheme()) || host == null || !HOSTS.matcher(host).find()) return null;
        if (request.getRequestHeaders().containsKey("Range")) return null;
        String url = request.getUrl().toString();
        File dir = new File(context.getCacheDir(), "covers");
        File file = new File(dir, sha1(url));
        try {
            if (file.isFile()) {
                file.setLastModified(System.currentTimeMillis());
                byte[] head = new byte[12];
                try (FileInputStream in = new FileInputStream(file)) { in.read(head); }
                return response(200, "OK", typeOf(head), new FileInputStream(file));
            }
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(15000);
            String agent = request.getRequestHeaders().get("User-Agent");
            if (agent != null) conn.setRequestProperty("User-Agent", agent);
            int status = conn.getResponseCode();
            InputStream body = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            byte[] bytes = body != null ? readAll(body) : new byte[0];
            conn.disconnect();
            // YouTube answers a missing large cover with a 404 and a grey picture; the page counts on getting both
            if (status != 200) return response(status, conn.getResponseMessage() != null ? conn.getResponseMessage() : "Error", typeOf(bytes), new ByteArrayInputStream(bytes));
            if (bytes.length > 0 && bytes.length <= MAX_COVER) save(dir, file, bytes);
            return response(200, "OK", typeOf(bytes), new ByteArrayInputStream(bytes));
        } catch (IOException e) {
            // let the WebView try it itself
            return null;
        }
    }

    private static WebResourceResponse response(int status, String reason, String type, InputStream body) {
        Map<String, String> headers = new HashMap<>();
        // the page reads some covers into a canvas (the black bars of a video, the colours of a cover)
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "max-age=31536000");
        return new WebResourceResponse(type, null, status, reason, headers, body);
    }

    private static void save(File dir, File file, byte[] bytes) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) return;
        File tmp = File.createTempFile("cover", ".tmp", dir);
        try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(bytes); }
        if (!tmp.renameTo(file)) tmp.delete();
        synchronized (CoverCache.class) {
            if (++savedSinceTrim < 100) return;
            savedSinceTrim = 0;
        }
        trim(dir);
    }

    // the covers looked at longest ago go first
    private static synchronized void trim(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        long total = 0;
        for (File f : files) total += f.length();
        if (total <= MAX_BYTES) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File f : files) {
            if (total <= MAX_BYTES * 3 / 4) break;
            total -= f.length();
            f.delete();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        try (InputStream body = in) {
            while ((n = body.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_COVER) throw new IOException("cover too big");
            }
        }
        return out.toByteArray();
    }

    private static String typeOf(byte[] b) {
        if (b.length > 3 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "image/png";
        if (b.length > 11 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        if (b.length > 2 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F') return "image/gif";
        return "image/jpeg";
    }

    private static String sha1(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
            StringBuilder hex = new StringBuilder();
            for (byte x : d) hex.append(String.format("%02x", x));
            return hex.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
