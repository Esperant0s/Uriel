'use strict';

require('../tools/ts-require');

// Settings → Theme → App icon changes the real app icon: every style has its Android launcher entry and PNGs, its
// iOS alternate icon, and the same name in both plugins and in mobile/app-icon.ts
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { NAMES } = require('../mobile/app-icon');
const appSource = require('../tools/app-source');
const names = Object.values(NAMES).sort();

test('every icon style the picker offers has a phone icon name', () => {
  const styles = fs.readdirSync(path.join(root, 'shared', 'assets', 'app-icons')).map((f) => f.replace(/\.svg$/, '')).concat('uriel').sort();
  assert.deepEqual(Object.keys(NAMES).sort(), styles);
  const app = appSource();
  for (const id of Object.keys(NAMES)) assert.ok(app.includes(`id: '${id}'`), `${id} is in HOME_ICONS`);
});

test('Android: a launcher alias and PNGs for each, and the plugin knows them all', () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  const java = read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/AppIconPlugin.java');
  const javaNames = [...java.match(/ICONS = \{([^}]+)\}/)[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(javaNames, names);
  for (const n of names) {
    assert.match(manifest, new RegExp(`android:name="io\\.github\\.cloverscripts\\.muriel\\.LauncherIcon_${n}"[\\s\\S]*?android:icon="@mipmap/ic_uriel_${n}"[\\s\\S]*?android:enabled="false"`));
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      assert.ok(fs.existsSync(path.join(root, 'mobile/android/app/src/main/res', `mipmap-${d}`, `ic_uriel_${n}.png`)), `${d} ${n}`);
      assert.ok(fs.existsSync(path.join(root, 'mobile/android/app/src/main/res', `mipmap-${d}`, `ic_uriel_${n}_full.png`)), `${d} ${n} full`);
    }
    assert.ok(fs.existsSync(path.join(root, 'mobile/android/app/src/main/res/mipmap-anydpi-v26', `ic_uriel_${n}.xml`)));
  }
  // exactly one launcher entry is on at first, and the main screen itself is no longer one
  assert.equal((manifest.match(/android:enabled="true"/g) || []).length, 1);
  const main = manifest.slice(manifest.indexOf('android:name=".MainActivity"'), manifest.indexOf('</activity>'));
  assert.equal(main.includes('android.intent.category.LAUNCHER'), false);
});

test('iOS: an alternate icon set for each, included in the build, and the plugin knows them all', () => {
  const swift = read('mobile/ios/App/App/AppDelegate.swift');
  const swiftNames = [...swift.match(/static let icons: Set<String> = \[([^\]]+)\]/)[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(swiftNames, names);
  for (const n of names) assert.ok(fs.existsSync(path.join(root, 'mobile/ios/App/App/Assets.xcassets', `AppIcon-${n}.appiconset`, 'icon-1024.png')), n);
  assert.match(read('mobile/ios/App/App.xcodeproj/project.pbxproj'), /ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES;/);
  assert.match(swift, /registerPluginInstance\(UrielAppIconPlugin\(\)\)/);
});
