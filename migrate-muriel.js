// Mural used to be Muriel. On the first start of Mural on a computer, everything Muriel kept is brought over:
// the page's storage (playlists, favorites, history, settings: Electron's userData folder), the music data folder
// (library, offline songs, lyrics, covers, yt-dlp and ffmpeg) and config.json. Muriel's own folders are left as
// they are, so Muriel keeps working next to Mural.
//
// Song files never change once written, so they are hard-linked where the disk allows it (no second copy taking
// up space); everything else is copied, because both apps rewrite those files. Runs before anything opens them.
const fs = require('fs');
const os = require('os');
const path = require('path');

// files under these are written once and never changed in place: safe to share between the two apps
const LINKABLE = new Set(['tracks', 'thumbnails', 'library', 'bin']);
// Chromium's caches: rebuilt on their own, and often large
const SKIP = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'blob_storage', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']);

function copyTree(from, to, link = false) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (fs.existsSync(dest)) continue;
    if (entry.isDirectory()) copyTree(src, dest, link || LINKABLE.has(entry.name));
    else if (entry.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(src), dest); } catch (e) {} }
    else if (entry.isFile()) {
      if (link) { try { fs.linkSync(src, dest); continue; } catch (e) {} }
      fs.copyFileSync(src, dest);
    }
  }
}

// [old, new] folder pairs for this computer
function folderPairs(appDataDir, platform = process.platform, env = process.env, home = os.homedir()) {
  const pairs = [[path.join(appDataDir, 'Muriel'), path.join(appDataDir, 'Mural')]];
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    pairs.push([path.join(local, 'Muriel'), path.join(local, 'Mural')]);
  } else if (platform !== 'darwin') {
    pairs.push([path.join(home, '.cache', 'muriel'), path.join(home, '.cache', 'mural')]);
    const config = env.XDG_CONFIG_HOME || path.join(home, '.config');
    pairs.push([path.join(config, 'muriel'), path.join(config, 'mural')]);
  }
  // macOS keeps data, config and userData in the one Application Support folder (the first pair)
  return pairs;
}

// Copies each old folder to its new place, once: a new folder that already exists is never touched.
function migrate(appDataDir, opts = {}) {
  const moved = [];
  for (const [from, to] of folderPairs(appDataDir, opts.platform, opts.env, opts.home)) {
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    const tmp = `${to}.migrating`;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
      copyTree(from, tmp);
      // renamed into place only when complete: a copy cut short is redone on the next start
      fs.renameSync(tmp, to);
      moved.push(to);
    } catch (e) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }
  }
  return moved;
}

module.exports = { migrate, folderPairs, copyTree };
