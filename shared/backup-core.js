// @ts-check
// Playlist files and profile backups: what goes into them and what is let back in. No DOM: backup.js runs it in
// the app, test/backup-core.test.js in Node.
// - Playlist files (JSON) are meant to be shared, so reading one trusts nothing: only plain text and numbers are
//   kept, songs must point at YouTube or SoundCloud (or be a song from this device's library), pictures must be
//   https, and everything is capped. The format is upstream Riff's, so either app reads the other's files.
// - A backup is one profile's own localStorage keys. Restoring one only writes Uriel's data and settings keys:
//   never the device's (profiles-core.js), the sync link, other profiles, logins or custom CSS. Riff's encrypted
//   account files (.rfacc) are read too: they are the same thing under a fixed, public key.
(function (root) {
  const LIMITS = { fileBytes: 30e6, playlists: 2000, tracksPerPlaylist: 20000, tracks: 200000, keyBytes: 8e6, totalBytes: 24e6 };
  const PLATFORMS = new Set(['youtube', 'ytmusic', 'soundcloud', 'local']);
  const YT_ID = /^[A-Za-z0-9_-]{11}$/;
  const LOCAL_ID = /^local_[A-Za-z0-9_-]{1,64}$/;
  const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
  // text from a file: only strings and numbers count ({ "toString": 1 } is valid JSON and breaks String())
  const clip = (s, n) => (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function parseUrl(s) {
    try { return new URL(String(s)); } catch (e) { return null; }
  }
  const httpsUrl = (s, n = 2048) => {
    const u = typeof s === 'string' && s.length <= n ? parseUrl(s) : null;
    return u && u.protocol === 'https:' ? u.href : '';
  };
  const YT_HOSTS = /^(?:www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/i;
  const SC_HOSTS = /^(?:www\.|m\.)?soundcloud\.com$/i;
  const ytIdFrom = (url) => {
    const u = parseUrl(url);
    if (!u || !YT_HOSTS.test(u.hostname)) return '';
    const id = u.hostname.toLowerCase() === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/) || [])[1] || '');
    return YT_ID.test(id) ? id : '';
  };
  const duration = (t) => {
    let d = Number(t.duration);
    if (!(d > 0) && Number(t.durationMs) > 0) d = Number(t.durationMs) / 1000;
    if (!(d > 0) && Number(t.duration_ms) > 0) d = Number(t.duration_ms) / 1000;
    return d > 0 && d < 86400 ? Math.round(d) : 0;
  };

  // A song from a shared playlist file -> a Uriel track, or null. A song with only a title and artist is kept
  // with needsMatch: true; backup.js looks it up on YouTube, like a Spotify import.
  function cleanSharedTrack(t) {
    if (!isObj(t)) return null;
    const title = clip(t.title || t.name || t.trackName, 300);
    const artist = clip(t.artist || t.artistName || t.author || t.uploader, 300);
    const base = { title: title || 'Unknown', artist };
    const album = clip(t.album, 300);
    if (album) base.album = album;
    const d = duration(t);
    if (d) base.duration = d;
    const thumb = httpsUrl(t.thumbnail) || httpsUrl(t.cover) || httpsUrl(t.image) || httpsUrl(t.artworkUrl);
    const platform = String(t.platform || t.source || '').toLowerCase();
    const id = typeof t.id === 'string' || typeof t.id === 'number' ? String(t.id) : '';
    if (platform === 'local' || LOCAL_ID.test(id)) {
      // plays only if that file is in this device's library; the path of the original isn't carried over
      return LOCAL_ID.test(id) ? { ...base, id, platform: 'local' } : (title ? { ...base, needsMatch: true } : null);
    }
    const url = httpsUrl(t.url);
    const u = url ? parseUrl(url) : null;
    if (u && SC_HOSTS.test(u.hostname) && u.pathname.length > 1) return { ...base, id: clip(id, 200) || url, platform: 'soundcloud', url, thumbnail: thumb };
    const vid = YT_ID.test(id) && platform !== 'soundcloud' ? id : ytIdFrom(url);
    if (vid) return { ...base, id: vid, platform: 'youtube', url: `https://www.youtube.com/watch?v=${vid}`, thumbnail: thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` };
    return title ? { ...base, ...(thumb ? { thumbnail: thumb } : {}), needsMatch: true } : null;
  }

  // the playlists in a playlist file (Uriel's, Riff's, or a bare list of songs); [] when there are none
  function parsePlaylistFile(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > LIMITS.fileBytes) return [];
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { return []; }
    let raw = [];
    if (Array.isArray(data)) {
      if (data.some((x) => isObj(x) && Array.isArray(x.tracks))) raw = data;
      else if (data.some((x) => isObj(x) && (x.title || x.id || x.url))) raw = [{ name: 'Imported playlist', tracks: data }];
    } else if (isObj(data)) {
      if (Array.isArray(data.playlists)) raw = data.playlists;
      else if (Array.isArray(data.tracks)) raw = [data];
    }
    const out = [];
    let total = 0;
    for (const p of raw.slice(0, LIMITS.playlists)) {
      if (!isObj(p) || !Array.isArray(p.tracks)) continue;
      const tracks = [];
      for (const t of p.tracks.slice(0, LIMITS.tracksPerPlaylist)) {
        if (total >= LIMITS.tracks) break;
        const c = cleanSharedTrack(t);
        if (c) { tracks.push(c); total++; }
      }
      const pl = { name: clip(p.name || p.title, 100) || 'Imported playlist', tracks };
      const description = clip(p.description, 500);
      if (description) pl.description = description;
      const cover = httpsUrl(p.cover);
      if (cover) pl.cover = cover;
      out.push(pl);
    }
    return out;
  }

  // Uriel playlists -> a playlist file. Songs from this device's files keep only their library id (the file
  // itself, its path and the local server's address stay here).
  function exportTrack(t) {
    if (!isObj(t)) return null;
    const out = { title: clip(t.title, 300), artist: clip(t.artist, 300) };
    const album = clip(t.album, 300);
    if (album) out.album = album;
    const d = duration(t);
    if (d) out.duration = d;
    const platform = PLATFORMS.has(t.platform) ? t.platform : 'youtube';
    const id = clip(t.id, 200);
    if (platform === 'local' || t.isLocal || LOCAL_ID.test(id)) return { ...out, id, platform: 'local', source: 'local' };
    const url = httpsUrl(t.url) || (YT_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : '');
    const cover = httpsUrl(t.thumbnail) || httpsUrl(t.cover);
    return { ...out, id, url, platform, source: platform, ...(cover ? { thumbnail: cover, cover } : {}) };
  }

  function playlistFile(playlists, { appVersion = '' } = {}) {
    return {
      app: 'Uriel',
      appVersion: String(appVersion || ''),
      exportedAt: new Date().toISOString(),
      playlists: (playlists || []).filter(isObj).map((p) => {
        const pl = { name: clip(p.name, 100) || 'untitled', tracks: (Array.isArray(p.tracks) ? p.tracks : []).map(exportTrack).filter(Boolean) };
        const description = clip(p.description, 500);
        if (description) pl.description = description;
        const cover = httpsUrl(p.cover);
        if (cover) pl.cover = cover;
        return pl;
      }),
    };
  }

  // a file name from a playlist or profile name
  const fileName = (name, ext) => `${clip(name, 60).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '') || 'uriel'}.${ext}`;

  // ---------- backups ----------
  const KEY_RE = /^(?:uriel|devsize)_[A-Za-z0-9_.:-]{1,80}$/;
  // never written by a restore, never in a backup: the sync link (and which devices are in it), the profile list,
  // logins, phone logs, and things that only mean something on the device they were made on
  // (a Riff file also carries its Last.fm login in plain text: Uriel keeps logins in the server's vault instead)
  const NEVER = [/^uriel_sync_/, /^uriel_p:/, /^uriel_secret_/, /^uriel_profiles?(?:_|$)/, /^uriel_debug_log$/,
    /^uriel_custom_css/, /^uriel_bg_(?:url|vpath)$/, /^uriel_banner_media$/, /^uriel_lastfm_(?!enabled$)/,
    // a copy of what the theme last painted (theme-boot.js), rebuilt from the theme settings, which are backed up
    /^uriel_theme_boot$/,
    // when this device last saved an automatic backup, and which one it was told not to offer again
    /^uriel_autobackup_/];
  const neverKey = (k) => NEVER.some((re) => re.test(k));
  function backupKeyAllowed(key, isDevice) {
    if (typeof key !== 'string' || !KEY_RE.test(key) || neverKey(key)) return false;
    return !(typeof isDevice === 'function' && isDevice(key));
  }
  // what a restore leaves of the profile it replaces: whatever a backup can't carry (the sync link, custom CSS,
  // the background picture, the device's keys, keys of plugins)
  const keepOnRestore = (key, isDevice) => !backupKeyAllowed(key, isDevice);

  // the open profile's own keys -> a backup file
  /** @param {any} entries @param {{ profileName?: string, appVersion?: string, isDevice?: (key: string) => boolean }} [o] */
  function makeBackup(entries, { profileName = '', appVersion = '', isDevice } = {}) {
    const data = {};
    for (const [k, v] of entries) if (typeof v === 'string' && backupKeyAllowed(k, isDevice)) data[k] = v;
    return { app: 'Uriel', kind: 'uriel-backup', version: 1, appVersion: String(appVersion || ''), exportedAt: new Date().toISOString(), profile: { name: clip(profileName, 24) }, data };
  }

  // A stored track, as the app itself saves it. A restore keeps its own fields (text, numbers, true/false; Uriel
  // tracks are flat), drops anything else, and only lets through addresses a picture or song can come from.
  const URL_FIELDS = new Set(['url', 'thumbnail', 'cover', 'image', 'artworkUrl', 'localThumbnail']);
  function storedUrl(v) {
    if (typeof v !== 'string') return '';
    if (v.startsWith('data:image/')) return v.length < 300000 ? v : '';
    const u = v.length <= 4096 ? parseUrl(v) : null;
    return u && (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'file:') ? v : '';
  }
  function cleanStoredTrack(t) {
    if (!isObj(t)) return null;
    const out = {};
    let n = 0;
    for (const k of Object.keys(t)) {
      if (++n > 60) break;
      if (!SAFE_KEY.test(k)) continue;
      const v = t[k];
      if (URL_FIELDS.has(k)) { const u = storedUrl(v); if (u) out[k] = u; continue; }
      if (typeof v === 'string') out[k] = v.slice(0, 2048);
      else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      else if (typeof v === 'boolean') out[k] = v;
    }
    if (!out.id && !out.title && !out.url) return null;
    if (out.platform !== undefined && !PLATFORMS.has(out.platform)) out.platform = 'youtube';
    return out;
  }
  const cleanTrackList = (list, cap) => (Array.isArray(list) ? list.slice(0, cap).map(cleanStoredTrack).filter(Boolean) : null);
  function cleanStoredPlaylists(list) {
    if (!Array.isArray(list)) return null;
    const seen = new Set();
    const out = [];
    for (const p of list.slice(0, LIMITS.playlists)) {
      if (!isObj(p)) continue;
      let id = typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) ? p.id : '';
      while (!id || seen.has(id)) id = `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      seen.add(id);
      const pl = { id, name: clip(p.name, 100) || 'untitled', tracks: cleanTrackList(p.tracks, LIMITS.tracksPerPlaylist) || [] };
      for (const k of Object.keys(p)) {
        if (k in pl || !SAFE_KEY.test(k)) continue;
        const v = p[k];
        if (k === 'cover') { const u = storedUrl(v); if (u) pl.cover = u; } else if (typeof v === 'string') pl[k] = v.slice(0, 2000);
        else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') pl[k] = v;
      }
      out.push(pl);
    }
    return out;
  }
  // keys whose value the app renders as songs and playlists get checked through; the rest stay text as they are
  const STRUCTURED = {
    devsize_playlists: cleanStoredPlaylists,
    devsize_favorites: (v) => cleanTrackList(v, LIMITS.tracks),
    devsize_history: (v) => cleanTrackList(v, 5000),
  };

  // Older names of the same keys: upstream Riff's riff_x (tools/rename-riff.py) and Muriel's and Mural's muriel_x
  // (and mural_x) are uriel_x now
  const fromOlder = (k) => (typeof k === 'string' ? k.replace(/^(?:riff|muriel|mural)_/, 'uriel_') : k);

  // A backup file's contents (already parsed) -> what a restore writes. Throws an Error with a message for people.
  /** @param {any} obj @param {{ isDevice?: (key: string) => boolean }} [o] */
  function readBackup(obj, { isDevice } = {}) {
    if (!isObj(obj)) throw new Error("That file isn't a Uriel backup");
    let source = '';
    let raw = null;
    // backups made before the rename say muriel-backup
    if ((obj.kind === 'uriel-backup' || obj.kind === 'muriel-backup') && isObj(obj.data)) { source = 'uriel'; raw = obj.data; }
    else if (isObj(obj.localStorage) && ['Riff', 'Muriel', 'Mural', 'Uriel'].includes(obj.app)) { source = 'riff'; raw = obj.localStorage; }
    if (!raw) throw new Error("That file isn't a Uriel backup or a Riff account file");
    const entries = {};
    const skipped = [];
    let total = 0;
    for (const k0 of Object.keys(raw).slice(0, 5000)) {
      const k = fromOlder(k0);
      let v = raw[k0];
      if (!backupKeyAllowed(k, isDevice) || v == null) { skipped.push(k); continue; }
      if (typeof v !== 'string') { try { v = JSON.stringify(v); } catch (e) { skipped.push(k); continue; } }
      if (typeof v !== 'string' || v.length > LIMITS.keyBytes) { skipped.push(k); continue; }
      if (STRUCTURED[k]) {
        let parsed;
        try { parsed = JSON.parse(v); } catch (e) { skipped.push(k); continue; }
        const clean = STRUCTURED[k](parsed);
        if (!clean) { skipped.push(k); continue; }
        v = JSON.stringify(clean);
      }
      total += k.length + v.length;
      if (total > LIMITS.totalBytes) throw new Error('That backup is too big to restore');
      entries[k] = v;
    }
    const count = (k) => { try { const v = JSON.parse(entries[k] || '[]'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };
    return {
      source,
      entries,
      skipped,
      profileName: source === 'uriel' && isObj(obj.profile) ? clip(obj.profile.name, 24) : '',
      counts: { playlists: count('devsize_playlists'), favorites: count('devsize_favorites'), history: count('devsize_history'), keys: Object.keys(entries).length },
    };
  }

  // ---------- Riff account files (.rfacc) ----------
  // "RFAC", a 12-byte IV, a 16-byte GCM tag, then AES-256-GCM of deflate-raw(JSON) under sha256('riff-account-key-v1')
  // (upstream main.js). The key is in Riff's source, so this is packaging, not protection.
  const isRiffAccount = (bytes) => bytes && bytes.length > 32 && bytes[0] === 0x52 && bytes[1] === 0x46 && bytes[2] === 0x41 && bytes[3] === 0x43;

  async function inflateRaw(bytes, max) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { try { await reader.cancel(); } catch (e) {} throw new Error('That account file is too big'); }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  async function readRiffAccount(bytes) {
    const subtle = typeof crypto !== 'undefined' && crypto.subtle;
    if (!subtle || typeof DecompressionStream !== 'function') throw new Error("This device can't open Riff account files");
    if (!isRiffAccount(bytes)) throw new Error("That file isn't a Riff account file");
    const keyBytes = await subtle.digest('SHA-256', new TextEncoder().encode('riff-account-key-v1'));
    const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = bytes.slice(4, 16);
    const tag = bytes.slice(16, 32);
    const body = bytes.slice(32);
    const sealed = new Uint8Array(body.length + tag.length);
    sealed.set(body);
    sealed.set(tag, body.length);
    let plain;
    try { plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, sealed)); } catch (e) { throw new Error('That Riff account file is damaged'); }
    const json = new TextDecoder().decode(await inflateRaw(plain, LIMITS.totalBytes * 2));
    try { return JSON.parse(json); } catch (e) { throw new Error('That Riff account file is damaged'); }
  }

  // ---- automatic backups: one file a day in the app's data folder, the newest few kept (backup.js makes them,
  // server.js keeps them). They are there for the day the saved lists are gone but the app's files aren't. ----
  const AUTO_KEEP = 7;
  const AUTO_NAME = /^uriel-auto-(\d{4}-\d{2}-\d{2})\.json$/;
  const autoBackupName = (day) => `uriel-auto-${day}.json`;
  const autoBackupDay = (name) => { const m = AUTO_NAME.exec(String(name || '')); return m ? m[1] : ''; };
  // the day as the user's clock has it
  const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const libraryIsEmpty = (c) => !c || !(c.playlists > 0 || c.favorites > 0 || c.history > 0);
  // once a day, and never an empty library: after a wipe those would push the good backups out
  /** @param {{ lastDay?: string, today: string, counts?: { playlists?: number, favorites?: number, history?: number } }} o */
  const autoBackupDue = ({ lastDay, today, counts }) => !libraryIsEmpty(counts) && lastDay !== today;
  // the files to delete so that the newest `keep` stay (other files in the folder are left alone)
  function autoBackupsToDrop(names, keep = AUTO_KEEP) {
    const own = (names || []).filter((n) => AUTO_NAME.test(n)).sort();
    return own.slice(0, Math.max(0, own.length - keep));
  }
  // The library is empty and a backup isn't: the newest such backup, to offer once. `backups` is newest first,
  // each { name, counts }; `dismissed` is the one the user said no to.
  /** @param {{ counts?: object, backups?: { name: string, counts?: object }[], dismissed?: string }} o */
  function restoreOffer({ counts, backups, dismissed }) {
    if (!libraryIsEmpty(counts)) return null;
    const best = (backups || []).find((b) => b && AUTO_NAME.test(b.name) && !libraryIsEmpty(b.counts));
    return best && best.name !== dismissed ? best : null;
  }

  // bytes of a picked backup file -> its parsed contents
  async function parseBackupFile(bytes) {
    if (!bytes || bytes.length > LIMITS.fileBytes) throw new Error('That file is too big');
    if (isRiffAccount(bytes)) return readRiffAccount(bytes);
    try { return JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')); } catch (e) { throw new Error("That file isn't a Uriel backup"); }
  }

  const api = { LIMITS, cleanSharedTrack, parsePlaylistFile, exportTrack, playlistFile, fileName, backupKeyAllowed, keepOnRestore, makeBackup, cleanStoredTrack, cleanStoredPlaylists, readBackup, AUTO_KEEP, AUTO_NAME, autoBackupName, autoBackupDay, dayOf, libraryIsEmpty, autoBackupDue, autoBackupsToDrop, restoreOffer, isRiffAccount, readRiffAccount, parseBackupFile };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UrielBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
