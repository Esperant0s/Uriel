package io.github.esperant0s.uriel;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The status bar and the gesture bar in the app's colours (mobile/system-bars.ts). Where the WebView is too old to
 * draw behind them, Capacitor pads it inside the bars and they showed the window's background: light grey on a dark
 * app. The window now paints the page's background behind the status bar and the navigation's behind the gesture
 * bar, and the bars' icons are dark or light to suit. Where the page draws behind the bars, only the icons matter.
 */
@CapacitorPlugin(name = "UrielSystemBars")
public class SystemBarsPlugin extends Plugin {
    /** top: behind the status bar; bottom: everything else the WebView doesn't cover (the gesture bar) */
    static class BarsBackground extends Drawable {
        final Paint paint = new Paint();
        int top = Color.BLACK, bottom = Color.BLACK, topHeight = 0;

        @Override
        public void draw(Canvas canvas) {
            Rect b = getBounds();
            paint.setColor(bottom);
            canvas.drawRect(b, paint);
            paint.setColor(top);
            canvas.drawRect(b.left, b.top, b.right, b.top + topHeight, paint);
        }

        @Override public void setAlpha(int alpha) {}
        @Override public void setColorFilter(ColorFilter cf) {}
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }

    private final BarsBackground background = new BarsBackground();

    private static int parse(String hex, int fallback) {
        try { return Color.parseColor(hex); } catch (Exception e) { return fallback; }
    }

    // top, bottom: "#rrggbb"; light: true for a light theme (dark icons)
    @PluginMethod
    public void set(PluginCall call) {
        final int top = parse(call.getString("top", ""), Color.BLACK);
        final int bottom = parse(call.getString("bottom", ""), top);
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
            Insets bars = insets != null ? insets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()) : Insets.NONE;
            background.top = top;
            background.bottom = bottom;
            background.topHeight = bars.top;
            if (decor.getBackground() != background) decor.setBackground(background);
            else background.invalidateSelf();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }

    // the phone's own colors, for the System app theme: dark or light, and Material You's accent (Android 12 and newer)
    @PluginMethod
    public void colors(PluginCall call) {
        Context ctx = getContext();
        boolean dark = (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        JSObject ret = new JSObject();
        ret.put("dark", dark);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int c = ctx.getColor(dark ? android.R.color.system_accent1_200 : android.R.color.system_accent1_600);
            ret.put("accent", String.format("#%06x", c & 0xffffff));
        }
        call.resolve(ret);
    }
}
