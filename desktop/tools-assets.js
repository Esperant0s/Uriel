// @ts-check
// Which yt-dlp build a system gets, and reading a published checksum list: desktop/tools.js downloads with these,
// and tools/fetch-ytdlp.mjs puts the same build into a release. No requires, so a build script can load it.

// platform and arch as Node names them (process.platform, process.arch)
function ytDlpAsset(platform, arch) {
  if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : arch === 'ia32' ? 'yt-dlp_x86.exe' : 'yt-dlp.exe';
  if (platform === 'darwin') return 'yt-dlp_macos.zip';
  return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
}

// the SHA-256 a "<hash>  <file>" list gives for fileName, or null
function expectedHash(sums, fileName) {
  for (const line of sums.split(/\r?\n/)) {
    const m = line.trim().match(/^([a-f0-9]{64})\s+\*?(?:\.\/)?(.+)$/i);
    if (m && m[2].trim() === fileName) return m[1].toLowerCase();
  }
  return null;
}

module.exports = { ytDlpAsset, expectedHash };
