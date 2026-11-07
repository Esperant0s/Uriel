const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_WIN = process.platform === 'win32';

const DEFAULT_DATA_DIR = IS_WIN
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Uriel')
  : process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'Uriel')
  : path.join(os.homedir(), '.cache', 'uriel');

const CONFIG_DIR = IS_WIN
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Uriel')
  : process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'Uriel')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'uriel');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function resolveDataDir() {
  const override = process.env.URIEL_DATA_DIR;
  if (override && override.trim()) {
    try { return path.resolve(override.trim()); } catch (e) {}
  }
  const configured = readConfig().dataDir;
  if (configured && typeof configured === 'string' && configured.trim()) {
    try { return path.resolve(configured.trim()); } catch (e) {}
  }
  return DEFAULT_DATA_DIR;
}

// written beside and renamed into place: a crash halfway used to leave a cut-off file, read back as {}, so the
// data folder silently went back to the default and the next save dropped it for good
function writeConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
  fs.renameSync(tmp, CONFIG_PATH);
}

function setDataDir(dir) {
  const cfg = readConfig();
  if (dir && String(dir).trim()) cfg.dataDir = path.resolve(String(dir).trim());
  else delete cfg.dataDir;
  writeConfig(cfg);
  return cfg.dataDir || DEFAULT_DATA_DIR;
}

function resolveDownloadDir() {
  const configured = readConfig().downloadDir;
  if (configured && typeof configured === 'string' && configured.trim()) {
    try { return path.resolve(configured.trim()); } catch (e) {}
  }
  return null;
}

function setDownloadDir(dir) {
  const cfg = readConfig();
  if (dir && String(dir).trim()) cfg.downloadDir = path.resolve(String(dir).trim());
  else delete cfg.downloadDir;
  writeConfig(cfg);
  return cfg.downloadDir || null;
}

const DATA_DIR = resolveDataDir();

const CACHE_DIR = path.join(DATA_DIR, 'tracks');
const CUSTOM_LYRICS_DIR = path.join(DATA_DIR, 'custom-lyrics');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const METADATA_PATH = path.join(DATA_DIR, 'metadata.json');
const LIBRARY_DIR = path.join(DATA_DIR, 'library');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');
const BIN_DIR = path.join(DATA_DIR, 'bin');
const LEGACY_BIN_DIRS = (IS_WIN
  ? ['Muriel', 'Riff'].map((n) => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), n, 'bin'))
  : process.platform === 'darwin'
  ? ['Muriel', 'Riff'].map((n) => path.join(os.homedir(), 'Library', 'Application Support', n, 'bin'))
  : ['muriel', 'riff'].map((n) => path.join(os.homedir(), '.cache', n, 'bin'))
).filter((d) => d !== BIN_DIR);
const TUTORIAL_MARKER = IS_WIN ? 'C:\\Uriel\\.urieltutorial' : path.join(os.homedir(), '.urieltutorial');
const TUTORIAL_MARKER_FALLBACK = path.join(DATA_DIR, '.urieltutorial');
// where Muriel and Mural marked it (the data folder's copy comes over with migrate-legacy.js)
const TUTORIAL_MARKERS_BEFORE = [IS_WIN ? 'C:\\Mural\\.murieltutorial' : path.join(os.homedir(), '.murieltutorial'), path.join(DATA_DIR, '.murieltutorial')];
const STARTUP_PATH = path.join(DATA_DIR, 'startup.json');
function readStartupConfig() { try { return JSON.parse(fs.readFileSync(STARTUP_PATH, 'utf8')) || {}; } catch (e) { return {}; } }
function writeStartupConfig(patch) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STARTUP_PATH, JSON.stringify({ ...readStartupConfig(), ...patch }));
    return true;
  } catch (e) { return false; }
}
function tutorialDone() { return [TUTORIAL_MARKER, TUTORIAL_MARKER_FALLBACK, ...TUTORIAL_MARKERS_BEFORE].some((f) => fs.existsSync(f)); }
function markTutorialDone() {
  for (const file of [TUTORIAL_MARKER, TUTORIAL_MARKER_FALLBACK]) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '1'); return true; } catch (e) {}
  }
  return false;
}

// what Uriel itself keeps in its music folder (moving the folder copies and then deletes only these)
const URIEL_DATA_ENTRIES = ['tracks', 'custom-lyrics', 'lyrics', 'thumbnails', 'library', 'bin', 'plugins', 'logs', 'metadata.json', 'library.json', 'startup.json', 'spotify-auth.enc', 'lastfm-auth.enc', '.urieltutorial', 'i18n'];

// `only`: names to take at the top level (deeper levels take everything under them)
async function copyDirContents(fromDir, toDir, skipNames = new Set(['config.json']), only = null) {
  await fs.promises.mkdir(toDir, { recursive: true });
  const entries = await fs.promises.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipNames.has(entry.name) || (only && !only.includes(entry.name))) continue;
    const src = path.join(fromDir, entry.name);
    const dest = path.join(toDir, entry.name);
    if (entry.isDirectory()) await copyDirContents(src, dest, skipNames);
    else if (entry.isFile()) await fs.promises.copyFile(src, dest);
  }
}

async function removeDirContents(dir, skipNames = new Set(['config.json']), only = null) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipNames.has(entry.name) || (only && !only.includes(entry.name))) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await removeDirContents(target, skipNames);
      try { await fs.promises.rmdir(target); } catch (e) {}
    } else if (entry.isFile()) {
      try { await fs.promises.unlink(target); } catch (e) {}
    }
  }
}

function isExecutableFile(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
}

// Where package managers put programs. An app started from the desktop menu or Finder gets a much shorter PATH
// than a terminal does, so a yt-dlp or ffmpeg that is already installed was missed and the install prompt came up.
function systemBinDirs(env = process.env, platform = process.platform, home = os.homedir()) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return [
      path.join(local, 'Microsoft', 'WinGet', 'Links'),
      path.join(home, 'scoop', 'shims'),
      path.join(env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin'),
      path.join(env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin')
    ];
  }
  const dirs = ['/usr/local/bin', '/usr/bin', '/bin', path.join(home, '.local', 'bin')];
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/opt/local/bin', ...dirs];
  return [...dirs, '/snap/bin', '/home/linuxbrew/.linuxbrew/bin', path.join(home, '.nix-profile', 'bin'), '/run/current-system/sw/bin', '/var/lib/flatpak/exports/bin'];
}

function findInPath(name, env = process.env, platform = process.platform) {
  const win = platform === 'win32';
  const dirs = (env.PATH || env.Path || '').split(win ? ';' : ':').filter(Boolean);
  const extra = systemBinDirs(env, platform);
  const exts = win ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of dirs.concat(extra)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

const binaryCache = {};

// a miss is looked up again after a while, so a tool installed with a package manager while Uriel is open counts
const MISS_TTL = 30000;
const missedAt = {};

function resolveBinary(name) {
  if (name in binaryCache && (binaryCache[name] || Date.now() - missedAt[name] < MISS_TTL)) return binaryCache[name];
  const exe = IS_WIN ? `${name}.exe` : name;
  const envKey = `URIEL_${name.replace(/[^a-z0-9]/gi, '').toUpperCase()}`;
  const candidates = [
    process.env[envKey],
    path.join(BIN_DIR, exe),
    process.resourcesPath && path.join(process.resourcesPath, 'bin', exe),
    path.join(__dirname, 'bin', exe)
  ].filter(Boolean);
  // then the copies Uriel (or Riff) downloaded before the rename: they were skipped when the Uriel folder
  // already existed, and the app offered to download ~400 MB it already had
  const found = candidates.find(isExecutableFile) || findInPath(name) || LEGACY_BIN_DIRS.map((d) => path.join(d, exe)).find(isExecutableFile);
  binaryCache[name] = found || null;
  if (!found) missedAt[name] = Date.now();
  return binaryCache[name];
}

function ytDlpCommand(args) {
  const bin = resolveBinary('yt-dlp');
  if (!bin) {
    throw new Error('yt-dlp not found. Put yt-dlp and ffmpeg into the bin folder next to the app, or add them to PATH.');
  }
  const ffmpeg = resolveBinary('ffmpeg');
  // told where ffmpeg is unless it's on the PATH yt-dlp itself sees (one found in a package manager's folder may not be)
  const pathDirs = (process.env.PATH || process.env.Path || '').split(IS_WIN ? ';' : ':');
  const extra = ffmpeg && !pathDirs.includes(path.dirname(ffmpeg)) ? ['--ffmpeg-location', path.dirname(ffmpeg)] : [];
  // YouTube's player checks need a JavaScript runtime, and without one yt-dlp sees fewer (lower quality)
  // formats. Electron runs as plain Node when ELECTRON_RUN_AS_NODE is set, so the app is the runtime.
  const js = process.versions && process.versions.electron && process.execPath ? ['--js-runtimes', `node:${process.execPath}`] : [];
  return { bin, args: extra.concat(js, args), env: js.length ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env };
}

function clearBinaryCache() {
  Object.keys(binaryCache).forEach((k) => delete binaryCache[k]);
}

module.exports = {
  clearBinaryCache,
  IS_WIN, DATA_DIR, DEFAULT_DATA_DIR, CONFIG_PATH, BIN_DIR, LEGACY_BIN_DIRS, CACHE_DIR, CUSTOM_LYRICS_DIR, LYRICS_DIR, THUMBNAILS_DIR, METADATA_PATH,
  LIBRARY_DIR, LIBRARY_PATH, STARTUP_PATH,
  findInPath, systemBinDirs, resolveBinary, ytDlpCommand,
  tutorialDone, markTutorialDone,
  readStartupConfig, writeStartupConfig,
  readConfig, resolveDataDir, setDataDir, resolveDownloadDir, setDownloadDir, copyDirContents, removeDirContents, URIEL_DATA_ENTRIES
};
