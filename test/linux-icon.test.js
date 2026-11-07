// linux-icon.js: on Linux the taskbar shows the launcher entry's icon, so the picked app icon goes there
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { paths, setLauncherIcon } = require('../desktop/linux-icon');

const IMAGE = '/home/me/Applications/uriel-1.5.5-linux-x86_64.AppImage';
const entry = (icon) => `[Desktop Entry]\nType=Application\nName=Uriel\nExec="${IMAGE}" %U\nIcon=${icon}\n`;
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-linux-icon-'));
const iconLine = (h) => fs.readFileSync(paths(h).desktop, 'utf8').match(/^Icon=(.*)$/m)[1];

test('a picked icon goes into the launcher entry under a new name each time, the old one is removed', () => {
  const h = home();
  const p = paths(h);
  fs.mkdirSync(p.apps, { recursive: true });
  fs.writeFileSync(p.desktop, entry('/somewhere/uriel.png'));

  const first = setLauncherIcon({ png: Buffer.from('one'), defaultPng: Buffer.from('app'), home: h, image: IMAGE });
  assert.equal(iconLine(h), first);
  assert.equal(fs.readFileSync(first, 'utf8'), 'one');

  const second = setLauncherIcon({ png: Buffer.from('two'), defaultPng: Buffer.from('app'), home: h, image: IMAGE });
  assert.notEqual(second, first);
  assert.equal(iconLine(h), second);
  assert.equal(fs.existsSync(first), false);

  // back to the app's own icon
  assert.equal(setLauncherIcon({ png: null, defaultPng: Buffer.from('app'), home: h, image: IMAGE }), p.appIcon);
  assert.equal(iconLine(h), p.appIcon);
  assert.equal(fs.readFileSync(p.appIcon, 'utf8'), 'app');
  assert.equal(fs.existsSync(second), false);
  fs.rmSync(h, { recursive: true, force: true });
});

test('no launcher entry: nothing is created', () => {
  const h = home();
  assert.equal(setLauncherIcon({ png: Buffer.from('x'), home: h, image: IMAGE }), null);
  assert.equal(fs.existsSync(paths(h).desktop), false);
  fs.rmSync(h, { recursive: true, force: true });
});

test("an older entry of this AppImage becomes uriel.desktop; someone else's is left alone", () => {
  const h = home();
  const p = paths(h);
  fs.mkdirSync(p.apps, { recursive: true });
  fs.writeFileSync(path.join(p.apps, 'mural.desktop'), entry('/x.png').replace(IMAGE, '/other/app.AppImage'));
  fs.writeFileSync(path.join(p.apps, 'muriel.desktop'), entry('/x.png'));
  setLauncherIcon({ png: Buffer.from('one'), home: h, image: IMAGE });
  assert.equal(fs.existsSync(path.join(p.apps, 'muriel.desktop')), false);
  assert.equal(fs.existsSync(path.join(p.apps, 'mural.desktop')), true);
  assert.match(iconLine(h), /uriel-[0-9a-f]{12}\.png$/);
  fs.rmSync(h, { recursive: true, force: true });
});
