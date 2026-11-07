'use strict';

// Fixes found running the Android app in an emulator: one loading circle, no broken-image icons, page titles and an
// even bottom bar on phones, and system bars in the theme's colours
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a song that is loading shows one circle (the play button), not a second one over the player bar', () => {
  assert.equal(read('shared/index.html').includes('track-loading-overlay'), false);
  assert.equal(read('shared/app.js').includes('trackLoadingOverlay'), false);
  assert.equal(read('shared/styles.css').includes('.track-loading-overlay'), false);
});

test('pictures without a fallback of their own try other sizes, then hide instead of showing a broken icon', () => {
  const app = read('shared/app.js');
  const at = app.indexOf("document.addEventListener('error', (e) => {");
  assert.ok(at > 0);
  const handler = app.slice(at, at + 400);
  assert.match(handler, /img\.tagName !== 'IMG' \|\| img\.onerror \|\| img\.hasAttribute\('onerror'\)/, 'leaves pictures with their own onerror alone');
  assert.match(handler, /nextTrackArt\(img\)/);
  assert.match(handler, /, true\);/, 'capture phase: error events do not bubble');
});

test('phones show page titles and an evenly spaced bottom bar', () => {
  const css = read('mobile/mobile.css');
  assert.match(css, /html\.is-mobile :is\(#view-favorites, #view-local, #view-history\) \.view-header h2 \{\s*display: block !important;/);
  assert.match(css, /html\.is-mobile #sidebar \.rail-action-group \.rail-icon-btn \{ width: 100% !important; background: transparent !important; \}/);
});

test('Android colours its system bars from the theme', () => {
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MainActivity.java'), /registerPlugin\(SystemBarsPlugin\.class\)/);
  assert.match(read('mobile/bridge.js'), /require\('\.\/system-bars'\)\(\)/);
  const js = read('mobile/system-bars.js');
  assert.match(js, /registerPlugin\('UrielSystemBars'\)/);
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/SystemBarsPlugin.java'), /@CapacitorPlugin\(name = "UrielSystemBars"\)/);
});
