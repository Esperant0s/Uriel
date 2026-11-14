// Puts the newest yt-dlp for this system into bundled-bin/, checked against yt-dlp's published SHA-256 sums.
// The release workflows run it before electron-builder, which ships bundled-bin/ as resources/bin (package.json,
// extraResources); desktop/tools.js copies it into the data folder on first start, where it keeps itself updated.
// macOS gets the zipped folder build, the one desktop/tools.js installs (it starts in a second, not a minute).
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// the same names desktop/tools.js downloads; on macOS one build covers Intel and Apple Silicon
const { ytDlpAsset, expectedHash } = require('../desktop/tools-assets.js');

const out = join(root, 'bundled-bin');
const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const asset = ytDlpAsset(process.platform, process.arch);
const file = process.platform === 'darwin' ? 'yt-dlp_macos.zip' : process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Uriel release build' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const want = expectedHash((await get(`${base}/SHA2-256SUMS`)).toString('utf8'), asset);
if (!want) throw new Error(`no checksum published for ${asset}`);
const body = await get(`${base}/${asset}`);
const got = createHash('sha256').update(body).digest('hex');
if (got !== want) throw new Error(`checksum mismatch for ${asset}: ${got}, expected ${want}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, file), body);
if (process.platform !== 'win32') chmodSync(join(out, file), 0o755);
console.log(`bundled-bin/${file}: ${asset}, ${(body.length / 1048576).toFixed(1)} MB, sha256 ${got.slice(0, 12)}…`);
