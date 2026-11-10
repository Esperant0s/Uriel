// Where a song's files are on the phone, for the native player (mobile/native-audio.ts, media-controls.ts and the
// Android side: PlayerService.kt, ColdPlayer.java).

// the app's file index (mobile/shims/fs.ts), loaded when first needed (tests run without it)
type FsShim = Pick<typeof import('./shims/fs'), 'statSync' | 'existsSync'>;
let fsShim: FsShim | null | undefined;
const fs = (): FsShim | null => {
  if (fsShim === undefined) { try { fsShim = require('./shims/fs') as FsShim; } catch (e) { fsShim = null; } }
  return fsShim;
};

// the song cache: shared/server.js findCachedFile, /data/tracks/<id><ext> (files/Mural/tracks on the phone)
const CACHE_EXT = ['.opus', '.webm', '.m4a', '.mp3', '.aac'];
const cleanId = (id: unknown): string => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');

// the file name of a song in the cache, or ''
function cachedName(t: Track | null | undefined): string {
  const id = t && t.id && cleanId(t.id);
  if (!id) return '';
  for (const ext of CACHE_EXT) {
    try { if (fs()!.statSync(`/data/tracks/${id}${ext}`).size > 60000) return id + ext; } catch (e) {}
  }
  return '';
}

// its cover, saved beside it
function thumbName(t: Track | null | undefined): string {
  const id = t && t.id && cleanId(t.id);
  try { return id && fs()!.existsSync(`/data/thumbnails/${id}.jpg`) ? `${id}.jpg` : ''; } catch (e) { return ''; }
}

// mobile/bridge.ts turns local songs into Capacitor file URLs: the file behind one, or ''
const CAP_FILE = '/_capacitor_file_';
function fileOfUrl(url: unknown): string {
  const src = String(url || '');
  const at = src.indexOf(CAP_FILE + '/');
  if (at < 0) return '';
  try { return decodeURIComponent(src.slice(at + CAP_FILE.length).split(/[?#]/)[0]); } catch (e) { return ''; }
}

// the file the <audio> element (or its native stand-in) plays, or ''
const playingPath = (a: { currentSrc?: string } | null | undefined): string => fileOfUrl(a && a.currentSrc);

export = { cachedName, thumbName, fileOfUrl, playingPath, cleanId };
