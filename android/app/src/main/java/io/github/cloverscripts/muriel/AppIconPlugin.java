package io.github.cloverscripts.muriel;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The home-screen icon (Settings → Theme → App icon, mobile/app-icon.js). Each icon style is a launcher
 * activity-alias in AndroidManifest.xml; this turns the chosen one on and the others off. Some launchers take a
 * moment to show the new icon, and a few drop the old home-screen shortcut, which Android doesn't let apps avoid.
 */
@CapacitorPlugin(name = "MuralAppIcon")
public class AppIconPlugin extends Plugin {
    // the styles tools/render-app-icons.js makes, as in AndroidManifest.xml (".LauncherIcon_<name>")
    static final String[] ICONS = { "mural", "default", "editor", "orbit", "vinyl", "cosmos", "aurora", "sunset", "amethyst", "y2k_disc", "cassette", "invincible" };

    private ComponentName alias(String name) {
        String pkg = getContext().getPackageName();
        return new ComponentName(pkg, "io.github.cloverscripts.muriel." + (name == null ? "LauncherDefault" : "LauncherIcon_" + name));
    }

    // name: one of ICONS, or "" for the app's own icon
    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("name", "");
        boolean known = false;
        for (String n : ICONS) if (n.equals(name)) known = true;
        String chosen = known ? name : null;
        PackageManager pm = getContext().getPackageManager();
        try {
            // the new one on first: with none enabled for a moment, some launchers remove the app's icon
            pm.setComponentEnabledSetting(alias(chosen), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            if (chosen != null) pm.setComponentEnabledSetting(alias(null), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            for (String n : ICONS) {
                if (n.equals(chosen)) continue;
                pm.setComponentEnabledSetting(alias(n), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            JSObject ret = new JSObject();
            ret.put("name", chosen == null ? "" : chosen);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "couldn't change the icon");
        }
    }
}
