// The phone's home-screen icon (Settings → Theme → App icon): app.js calls window.MuralAppIcon.set(style) when an
// icon is picked. Android (AppIconPlugin.java) and iOS (MuralAppIconPlugin in AppDelegate.swift) can only switch
// between the icons the app ships with, so a picked image stays the Home button's icon only.
const { Capacitor, registerPlugin } = require('@capacitor/core');

// app.js's style ids -> the names the icons have in the Android and iOS projects (tools/render-app-icons.js)
const NAMES = {
  muriel: 'mural', '01-default': 'default', '02-editor': 'editor', '03-orbit': 'orbit', '04-vinyl': 'vinyl', '06-cosmos': 'cosmos',
  '07-aurora': 'aurora', '08-sunset': 'sunset', '09-amethyst': 'amethyst', '10-y2k-disc': 'y2k_disc', '11-cassette': 'cassette', '12-invincible': 'invincible',
};

module.exports = function appIcon() {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return;
  const plugin = registerPlugin('MuralAppIcon');
  window.MuralAppIcon = {
    // true: the phone's icon changed. 'custom': a picked image, which a phone can't use as its app icon
    async set(style) {
      if (style && !NAMES[style] && style !== 'classic') return 'custom';
      try { await plugin.set({ name: NAMES[style] || '' }); return true; } catch (e) { return false; }
    },
  };
};
module.exports.NAMES = NAMES;
