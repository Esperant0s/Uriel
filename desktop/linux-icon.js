// @ts-check
// Linux: the taskbar and dock draw the icon of the app's launcher entry (~/.local/share/applications/uriel.desktop),
// not the window's: Wayland has no way for an app to set its own window icon. So the icon picked in Settings →
// Theme → App icon goes into the launcher entry: the PNG is saved under a new name each time (desktops cache icons
// by path) and the entry's Icon= line points at it. The window finds its entry by name: package.json's desktopName
// makes the window's app id "uriel".
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DESKTOP_FILE = 'uriel.desktop';
// what the launcher used to be called (launcher.js before the rename): moved to DESKTOP_FILE
const OLD_DESKTOP_FILES = ['muriel.desktop', 'mural.desktop'];

function paths(home = os.homedir()) {
  const apps = path.join(home, '.local', 'share', 'applications');
  const icons = path.join(home, '.local', 'share', 'icons', 'hicolor', '512x512', 'apps');
  return { apps, desktop: path.join(apps, DESKTOP_FILE), icons, appIcon: path.join(icons, 'uriel.png') };
}

// An older launcher entry of this app becomes uriel.desktop, so the window (app id "uriel") finds it.
// An entry is this app's when it starts the same AppImage.
function adoptOldEntry(home, image) {
  const p = paths(home);
  if (fs.existsSync(p.desktop) || !image) return false;
  for (const name of OLD_DESKTOP_FILES) {
    const file = path.join(p.apps, name);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    if (!text.includes(image)) continue;
    fs.writeFileSync(p.desktop, text);
    try { fs.chmodSync(p.desktop, 0o755); } catch (e) {}
    fs.rmSync(file, { force: true });
    return true;
  }
  return false;
}

// png: the icon's PNG bytes, or null for the app's own icon (defaultPng). Returns the icon path the entry now
// uses, or null when there is no launcher entry to change (nothing is created here: launcher.js does that).
/** @param {{ png?: Buffer | null, defaultPng?: Buffer, home?: string, image?: string }} [o] */
function setLauncherIcon({ png, defaultPng, home = os.homedir(), image = process.env.APPIMAGE } = {}) {
  const p = paths(home);
  adoptOldEntry(home, image);
  let text;
  try { text = fs.readFileSync(p.desktop, 'utf8'); } catch (e) { return null; }
  fs.mkdirSync(p.icons, { recursive: true });
  let icon = p.appIcon;
  if (png && png.length) {
    const hash = crypto.createHash('sha256').update(png).digest('hex').slice(0, 12);
    icon = path.join(p.icons, `uriel-${hash}.png`);
    if (!fs.existsSync(icon)) fs.writeFileSync(icon, png);
  } else if (!fs.existsSync(icon) && defaultPng) {
    fs.writeFileSync(icon, defaultPng);
  }
  // earlier picks
  for (const name of fs.readdirSync(p.icons)) {
    if (/^uriel-[0-9a-f]{12}\.png$/.test(name) && path.join(p.icons, name) !== icon) fs.rmSync(path.join(p.icons, name), { force: true });
  }
  const next = /^Icon=.*$/m.test(text) ? text.replace(/^Icon=.*$/m, `Icon=${icon}`) : text.replace(/^\[Desktop Entry\]$/m, `[Desktop Entry]\nIcon=${icon}`);
  if (next !== text) fs.writeFileSync(p.desktop, next);
  return icon;
}

module.exports = { paths, adoptOldEntry, setLauncherIcon, DESKTOP_FILE };
