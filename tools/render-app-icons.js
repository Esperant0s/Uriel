// Renders the app icon styles (shared/assets/app-icons/*.svg, and shared/assets/icon.svg as "mural") to the PNGs the phones need
// for switching their home-screen icon (Settings → Theme → App icon). Run with Electron after changing an icon:
//   npx electron tools/render-app-icons.js
// Android: res/mipmap-<density>/ic_uriel_<name>.png (round and square launchers) and ic_uriel_<name>_full.png
// (the full layer of an adaptive icon). iOS: Assets.xcassets/AppIcon-<name>.appiconset (one 1024px image).
// The results are committed, so the builds need nothing extra.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'mobile', 'android', 'app', 'src', 'main', 'res');
const XCASSETS = path.join(ROOT, 'mobile', 'ios', 'App', 'App', 'Assets.xcassets');
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

// the styles, by the name the app uses for them (app.js HOME_ICONS) -> resource-safe name
function icons() {
  const out = [{ id: 'uriel', name: 'mural', file: path.join(ROOT, 'shared', 'assets', 'icon.svg') }];
  for (const f of fs.readdirSync(path.join(ROOT, 'shared', 'assets', 'app-icons')).filter((f) => f.endsWith('.svg')).sort()) {
    const id = f.replace(/\.svg$/, '');
    out.push({ id, name: id.replace(/^\d+-/, '').replace(/[^a-z0-9]+/g, '_'), file: path.join(ROOT, 'shared', 'assets', 'app-icons', f) });
  }
  return out;
}

// draws an SVG at `size` px; `scale` < 1 leaves room around it (Android crops adaptive icons to a shape)
async function render(win, file, size, scale = 1, background = '') {
  const svg = fs.readFileSync(file, 'utf8');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = ${size};
      const g = c.getContext('2d');
      if (${JSON.stringify(background)}) { g.fillStyle = ${JSON.stringify(background)}; g.fillRect(0, 0, ${size}, ${size}); }
      const s = ${size} * ${scale}, o = (${size} - s) / 2;
      g.drawImage(img, o, o, s, s);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('could not draw ${path.basename(file)}'));
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
  })`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// the colour in the middle of the icon's edge, for the space Android adds around an adaptive icon
async function edgeColor(win, file) {
  const png = await render(win, file, 64);
  return win.webContents.executeJavaScript(`new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(32, 2, 1, 1).data; resolve(d[3] < 200 ? '#121214' : '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')); };
    img.src = 'data:image/png;base64,${png.toString('base64')}';
  })`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const preview = process.argv.includes('--preview');
  for (const icon of icons()) {
    if (preview) {
      fs.writeFileSync(path.join(process.env.PREVIEW_DIR || '/tmp', `${icon.name}.png`), await render(win, icon.file, 256));
      continue;
    }
    const bg = await edgeColor(win, icon.file);
    for (const [d, px] of Object.entries(LEGACY)) {
      fs.mkdirSync(path.join(RES, `mipmap-${d}`), { recursive: true });
      fs.writeFileSync(path.join(RES, `mipmap-${d}`, `ic_uriel_${icon.name}.png`), await render(win, icon.file, px));
    }
    // adaptive layer: the icon fills the 72dp of the 108dp layer that every launcher shape shows
    for (const [d, px] of Object.entries(ADAPTIVE)) {
      fs.writeFileSync(path.join(RES, `mipmap-${d}`, `ic_uriel_${icon.name}_full.png`), await render(win, icon.file, px, 72 / 108, bg));
    }
    fs.mkdirSync(path.join(RES, 'mipmap-anydpi-v26'), { recursive: true });
    fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26', `ic_uriel_${icon.name}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>\n<!-- made by tools/render-app-icons.js -->\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_uriel_${icon.name}_full"/>\n    <foreground android:drawable="@android:color/transparent"/>\n</adaptive-icon>\n`);
    const set = path.join(XCASSETS, `AppIcon-${icon.name}.appiconset`);
    fs.mkdirSync(set, { recursive: true });
    // iOS shows no transparency in app icons: a black corner would show, so the edge colour fills it
    fs.writeFileSync(path.join(set, 'icon-1024.png'), await render(win, icon.file, 1024, 1, bg));
    fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
    console.log(`${icon.id} -> ${icon.name} (edge ${bg})`);
  }
  app.quit();
});
