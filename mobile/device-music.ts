// The songs already on the phone, for My files (server.js setDeviceSongs, device-library.js):
//  - Android: the phone's music library (android/.../DeviceMusicPlugin.java), after asking once for "Music and audio"
//  - iPhone: audio files in Uriel's folder in the Files app (On My iPhone → Uriel), including Uriel's own downloads.
//    Apple doesn't let apps read the files of the Music app's library, so that's the place to put songs.
// Each song plays from where it is: its path goes to the server as /device/<path>, and mobile/shims/store.ts
// turns that into a URL the WebView loads. Looked at again whenever the app comes back to the foreground.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import lib = require('../shared/device-library');

const ASKED = 'uriel_device_music_asked';
const IOS_SKIP = new Set(['tracks', 'lyrics', 'custom-lyrics', 'thumbnails', 'library', 'logs', 'i18n', 'bin', 'plugins']);

// android/.../DeviceMusicPlugin.java
interface DeviceSong { name?: string; path: string; size?: number; title?: string; artist?: string; duration?: number; added?: number }
interface DeviceMusicPlugin {
  status(): Promise<{ granted?: boolean; canAsk?: boolean }>;
  request(): Promise<{ granted?: boolean; canAsk?: boolean }>;
  list(): Promise<{ songs?: DeviceSong[] }>;
}
// the part of shared/server.js this needs
interface DeviceServer { setDeviceSongs(songs: object[]): void }

async function androidSongs(plugin: DeviceMusicPlugin, mayAsk: boolean) {
  let st = await plugin.status();
  // asked once, on the first start: after that only from Settings (switching "Find music on this device" on)
  if (!st.granted && st.canAsk && mayAsk) {
    st = await plugin.request();
  }
  if (!st.granted) return null;
  const { songs } = await plugin.list();
  return (songs || []).map((s) => {
    const fromName = lib.titleFromName(String(s.name || '').replace(/\.[^.]+$/, ''));
    return {
      id: lib.idFor(s.name, s.size),
      vpath: '/device' + s.path,
      ext: (String(s.name || '').split('.').pop() || '').toLowerCase(),
      title: s.title || fromName.title,
      artist: s.artist || fromName.artist,
      duration: Number(s.duration) || 0,
      addedAt: Number(s.added) || 0,
      source: /\/Music\/Mural\//.test(s.path) ? 'downloads' : 'device',
    };
  }).filter((s) => lib.AUDIO_EXTS.has(s.ext));
}

// Documents is the folder the Files app shows as "Uriel"; Uriel keeps its own data in Documents/Mural, where only
// the Downloads folder holds songs
async function iosSongs() {
  const out: object[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries: Awaited<ReturnType<typeof Filesystem.readdir>>['files'] = [];
    try { entries = (await Filesystem.readdir({ path: dir, directory: Directory.Documents })).files || []; } catch (e) { return; }
    for (const e of entries) {
      if (out.length >= 20000 || e.name.startsWith('.')) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === 'directory') {
        if (depth < 8 && !(dir === 'Mural' && IOS_SKIP.has(e.name))) await walk(rel, depth + 1);
        continue;
      }
      const song = lib.songFromFile(e.name, e.size || 0, rel.startsWith('Mural/Downloads/') ? 'downloads' : 'files');
      if (!song) continue;
      const path = decodeURIComponent(String(e.uri || '').replace(/^file:\/\//, ''));
      if (!path) continue;
      out.push({ ...song, path: undefined, vpath: '/device' + path, addedAt: Number(e.mtime) || 0 });
    }
  }
  await walk('', 0);
  return out;
}

function deviceMusic(server: () => DeviceServer): void {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return;
  const plugin = platform === 'android' ? registerPlugin<DeviceMusicPlugin>('UrielDeviceMusic') : null;
  let running: Promise<number> | null = null;

  async function scan(mayAsk: boolean): Promise<number> {
    let songs: object[] | null = null;
    try {
      songs = plugin ? await androidSongs(plugin, mayAsk) : await iosSongs();
    } catch (e) {
      console.warn('device music:', e instanceof Error ? e.message : e);
    }
    if (songs) server().setDeviceSongs(songs);
    return songs ? songs.length : 0;
  }
  function rescan(mayAsk = false) {
    if (!running) running = scan(mayAsk).finally(() => { running = null; });
    return running;
  }

  // the first start asks (once); Settings asks again when the switch is turned on
  const first = !localStorage.getItem(ASKED);
  try { localStorage.setItem(ASKED, '1'); } catch (e) {}
  const begin = () => rescan(first).then(() => window.dispatchEvent(new CustomEvent('uriel:device-music')));
  if (window.UrielCore) begin(); else window.addEventListener('uriel:ready', begin, { once: true });
  App.addListener('appStateChange', (s) => { if (s && s.isActive) rescan(false); });
  window.UrielDeviceMusic = { rescan: (ask?: boolean) => rescan(!!ask) };
}

export = deviceMusic;
