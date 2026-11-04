// Music already on the device, found instead of imported: the computer's Music folder and the folder Uriel
// downloads into (server.js scans and watches them), Android's music library and the iPhone's Uriel folder in
// the Files app (mobile/device-music.js hands those over). The songs play from where they are: nothing is copied.
//
// A found song gets the id an import of the same file gets (main.js and mobile/electron-api.js: name + size), so
// a song that was imported before isn't listed twice and its favorites and playlist entries keep working.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'opus', 'ogg', 'oga', 'm4a', 'aac', 'webm', 'weba']);
const MAX_FILES = 20000;
const MAX_DEPTH = 8;

const idFor = (name, size) => 'local_' + crypto.createHash('sha1').update(String(name) + size).digest('hex').slice(0, 12);

// "03 - Artist - Song" -> { artist: 'Artist', title: 'Song' } (the rule imported files have always used)
function titleFromName(rawName) {
  const raw = String(rawName || '').trim();
  const clean = raw.replace(/^\d+(?:[.\s-]+)\s*/, '').trim() || raw || 'Untitled';
  const dash = clean.indexOf(' - ');
  if (dash === -1) return { artist: 'Unknown artist', title: clean };
  return { artist: clean.slice(0, dash).trim() || 'Unknown artist', title: clean.slice(dash + 3).trim() || clean };
}

// a song from a file: `size` keeps the id the same as the file's import would get
function songFromFile(file, size, source) {
  const name = path.basename(file);
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!AUDIO_EXTS.has(ext)) return null;
  return { id: idFor(name, size), path: file, ext, size, source, ...titleFromName(name.slice(0, -(ext.length + 1))) };
}

// Every audio file under each folder: `deep` folders to MAX_DEPTH (the Music folder), the others only at the top
// (Downloads holds everything else people download too). Hidden folders and files are skipped.
async function scanFolders(folders, limit = MAX_FILES) {
  const out = [];
  const seen = new Set();
  async function walk(dir, depth, deep, source) {
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      if (out.length >= limit || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (deep && depth < MAX_DEPTH) await walk(full, depth + 1, deep, source);
      } else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).slice(1).toLowerCase())) {
        let st;
        try { st = await fs.promises.stat(full); } catch (e) { continue; }
        const song = songFromFile(full, st.size, source);
        if (song && !seen.has(song.id)) { seen.add(song.id); out.push(song); }
      }
    }
  }
  for (const f of folders) if (f && f.dir) await walk(f.dir, 0, !!f.deep, f.source || 'device');
  return out;
}

// Calls onChange (once, after things settle) when files are added, removed or renamed in any of the folders.
// Returns a function that stops watching.
function watchFolders(folders, onChange, settleMs = 2000) {
  let timer = null;
  const fire = () => { clearTimeout(timer); timer = setTimeout(onChange, settleMs); };
  const watchers = [];
  for (const f of folders) {
    if (!f || !f.dir) continue;
    try { watchers.push(fs.watch(f.dir, { recursive: !!f.deep }, fire)); } catch (e) {
      // no recursive watching here (or the folder is gone): the top level still notices new files
      try { watchers.push(fs.watch(f.dir, fire)); } catch (_) {}
    }
  }
  for (const w of watchers) w.on('error', () => {});
  return () => { clearTimeout(timer); for (const w of watchers) { try { w.close(); } catch (e) {} } };
}

module.exports = { AUDIO_EXTS, idFor, titleFromName, songFromFile, scanFolders, watchFolders };
