// The phone's home-screen icon (Settings → Theme → App icon): app.js calls window.UrielAppIcon.set(style) when an
// icon is picked. Android (AppIconPlugin.java) and iOS (UrielAppIconPlugin in AppDelegate.swift) can only switch
// between the icons the app ships with, so a picked image stays the Home button's icon only.
import { Capacitor, registerPlugin } from '@capacitor/core';

// app.js's style ids -> the names the icons have in the Android and iOS projects (tools/render-app-icons.js)
const NAMES: Record<string, string> = {
  uriel: 'mural', '01-default': 'default', '02-editor': 'editor', '03-orbit': 'orbit', '04-vinyl': 'vinyl', '06-cosmos': 'cosmos',
  '07-aurora': 'aurora', '08-sunset': 'sunset', '09-amethyst': 'amethyst', '10-y2k-disc': 'y2k_disc', '11-cassette': 'cassette', '12-invincible': 'invincible',
};

function appIcon(): void {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return;
  const plugin = registerPlugin<{ set(o: { name: string }): Promise<void> }>('UrielAppIcon');
  window.UrielAppIcon = {
    // true: the phone's icon changed. 'custom': a picked image, which a phone can't use as its app icon
    async set(style: string): Promise<boolean | 'custom'> {
      if (style && !NAMES[style] && style !== 'classic') return 'custom';
      try { await plugin.set({ name: NAMES[style] || '' }); return true; } catch (e) { return false; }
    },
  };
}
appIcon.NAMES = NAMES;

export = appIcon;
