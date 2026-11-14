// Puts the tools Uriel needs into bundled-bin/ for a release build: the newest yt-dlp, and ffmpeg with ffprobe
// (yt-dlp's builds of them, the ones desktop/tools.js would download), each checked against its published SHA-256.
// The release workflows run it before electron-builder, which ships bundled-bin/ as resources/bin (package.json,
// extraResources). desktop/tools.js copies yt-dlp into the data folder on first start, where it keeps itself
// updated; ffmpeg and ffprobe are used where they are. macOS gets yt-dlp's zipped folder build (it starts in a
// second, not a minute) and no ffmpeg: there is no build of it from the same source.
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ytDlpAsset, ffmpegAsset, expectedHash } = require('../desktop/tools-assets.js');

const out = join(root, 'bundled-bin');
const IS_WIN = process.platform === 'win32';
const exe = (name) => (IS_WIN ? `${name}.exe` : name);

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Uriel release build' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// a file from a release, refused unless it matches the release's own checksum list
async function verified(base, sumsFile, asset) {
  const want = expectedHash((await get(`${base}/${sumsFile}`)).toString('utf8'), asset);
  if (!want) throw new Error(`no checksum published for ${asset}`);
  const body = await get(`${base}/${asset}`);
  const got = createHash('sha256').update(body).digest('hex');
  if (got !== want) throw new Error(`checksum mismatch for ${asset}: ${got}, expected ${want}`);
  return body;
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { const hit = findFile(full, name); if (hit) return hit; } else if (entry.name === name) return full;
  }
  return null;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// yt-dlp
const ytAsset = ytDlpAsset(process.platform, process.arch);
const yt = await verified('https://github.com/yt-dlp/yt-dlp/releases/latest/download', 'SHA2-256SUMS', ytAsset);
const ytFile = process.platform === 'darwin' ? 'yt-dlp_macos.zip' : exe('yt-dlp');
writeFileSync(join(out, ytFile), yt);
if (!IS_WIN) chmodSync(join(out, ytFile), 0o755);
console.log(`bundled-bin/${ytFile}: ${ytAsset}, ${mb(yt.length)}`);

// ffmpeg and ffprobe
const ff = ffmpegAsset(process.platform, process.arch);
if (!ff) {
  console.log('no ffmpeg build for this system: the app asks for one when it needs it');
} else {
  const archive = await verified('https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download', 'checksums.sha256', ff.name);
  const work = mkdtempSync(join(tmpdir(), 'uriel-ffmpeg-'));
  try {
    const file = join(work, ff.name);
    writeFileSync(file, archive);
    // Windows: the bsdtar in System32 reads zips; a GNU tar earlier in PATH (Git's) can't
    const tar = IS_WIN ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-xf', file, '-C', work], { stdio: 'inherit' });
    for (const name of ['ffmpeg', 'ffprobe']) {
      const src = findFile(work, exe(name));
      if (!src) throw new Error(`${exe(name)} not found inside ${ff.name}`);
      copyFileSync(src, join(out, exe(name)));
      if (!IS_WIN) chmodSync(join(out, exe(name)), 0o755);
    }
    console.log(`bundled-bin/${exe('ffmpeg')} and ${exe('ffprobe')}: from ${ff.name}, ${mb(archive.length)} download`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
