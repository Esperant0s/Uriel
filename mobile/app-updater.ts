// Android in-app updates: gives update-notifier.js the same download / install calls the computer's preload.js
// does, backed by android/.../AppUpdaterPlugin.java (downloads the APK, checks GitHub's SHA-256, opens the installer).
// iOS has nothing here: a sideloaded app can't install another, so the banner keeps opening the release page.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

// a release as update-notifier.js found it, and how far its download is
interface Update { version?: string; apk?: { url: string; sha256: string; size: number } }
interface Progress { received?: number; total?: number }
interface UpdaterPlugin {
  download(o: { url: string; sha256: string; size: number }): Promise<void>;
  install(): Promise<{ ok: boolean; error?: string }>;
  addListener(name: 'progress', cb: (p: Progress) => void): Promise<PluginListenerHandle>;
}
const messageOf = (e: unknown, fallback: string): string => (e instanceof Error && e.message) || fallback;

function appUpdater(): void {
  if (Capacitor.getPlatform() !== 'android') return;
  const plugin = registerPlugin<UpdaterPlugin>('UrielUpdater');
  window.UrielAppUpdater = {
    supported: async () => true,
    async download(update: Update | null | undefined, onProgress?: (p: Progress) => void) {
      const apk = update && update.apk;
      if (!apk) return { ok: false, error: 'no verified download in this release' };
      const listener = await plugin.addListener('progress', (p) => { if (onProgress) onProgress(p); });
      try {
        await plugin.download({ url: apk.url, sha256: apk.sha256, size: apk.size });
        return { ok: true, version: update.version };
      } catch (e) {
        return { ok: false, error: messageOf(e, 'download failed') };
      } finally {
        listener.remove();
      }
    },
    async install() {
      try { return await plugin.install(); } catch (e) { return { ok: false, error: messageOf(e, 'install failed') }; }
    },
  };
}

export = appUpdater;
