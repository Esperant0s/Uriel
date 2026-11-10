// Tickets from the GitHub tracker that were reproduced in the running app.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('shared/app.js');

test('#41: wheel ticks add up: a smooth scrollBy per tick lost most of a fast flick', () => {
  const start = app.indexOf('function wheelRowSideways(');
  const body = app.slice(start, app.indexOf('function bindHorizontalWheel', start));
  assert.match(body, /glideRowBy\(row,/);
  assert.doesNotMatch(body, /scrollBy\(/);
  assert.match(body, /row\._glideRaf \? row\._glideTo : row\.scrollLeft/);
});

test('#41: Ctrl and = zooms in, since Ctrl and + needs Shift on most keyboards', () => {
  assert.match(read('desktop/main.js'), /input\.key !== '='[\s\S]{0,200}zoomLevel \+= 0\.5/);
});

test('#32: losing the output pauses, on the PC and on Android', () => {
  assert.match(app, /state\.isPlaying && \(lostChosen \|\| lostDefault\)/);
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MediaControlsPlugin.java'), /ACTION_AUDIO_BECOMING_NOISY/);
});

test('phone downloads use the routes playback uses, so a song that plays can be saved too', () => {
  const server = read('shared/server.js');
  const start = server.indexOf('async function handleDownload(');
  const phone = server.slice(start, server.indexOf('const cachedFile = cleanId', start));
  assert.match(phone, /streamResolver\.resolve\(/);
  assert.doesNotMatch(phone, /await downloadTrackToDisk\(/);
});

test('the phone dialog promises no format, shows progress and retries', () => {
  const css = read('mobile/mobile.css');
  assert.match(css, /#download-modal :is\(\.download-section:has\(#format-chips-grid\), \.download-section:has\(#quality-chips-grid\), #download-effects-section\)/);
  assert.match(app, /!isPhoneApp \? `Download \$\{selectedFormat\.toUpperCase\(\)\}`/);
  assert.match(app, /'uriel:dl-progress'/);
  assert.match(read('mobile/shims/child_process.ts'), /uriel:dl-progress/);
  assert.match(app, /runDownloadBatch\(\[t\]/);
});

test('downloads keep going in the background with a notification', () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:name="\.DownloadService"[\s\S]{0,90}foregroundServiceType="dataSync"/);
  assert.match(manifest, /FOREGROUND_SERVICE_DATA_SYNC/);
  assert.match(read('mobile/media-controls.ts'), /plugin\.downloading\(/);
});

test('a tap on earbuds reaches Uriel even when it is closed', () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:name="\.MediaButtonReceiver"[\s\S]{0,160}android\.intent\.action\.MEDIA_BUTTON/);
  const plugin = read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MediaControlsPlugin.java');
  assert.match(plugin, /session\.setMediaButtonReceiver\(/);
  assert.match(read('mobile/media-controls.ts'), /plugin\.takeStartPlay\(\)/);
  // closed by Android, it can't open itself from the background: "Tap to keep listening" opens it and plays
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MediaButtonReceiver.java'), /Tap to keep listening/);
  assert.match(read('mobile/android/app/src/main/java/io/github/esperant0s/uriel/MainActivity.java'), /ACTION_RESUME/);
});

test('the mini player centres its content above the progress line', () => {
  const css = read('mobile/mobile.css');
  assert.match(css, /padding: 0 8px 5px 8px !important;/);
  assert.match(css, /#m3c-wrap \{ width: 44px !important; height: 44px !important;/);
});

test('the queue in the player sheet does not scroll sideways', () => {
  const css = read('shared/styles.css');
  assert.match(css, /#drawer-queue \{ overflow-y: auto; overflow-x: hidden; display: block; padding-inline: 8px; margin-inline: -8px; \}/);
  assert.match(css, /#drawer-queue \.tracks-list \{ margin: 0 -8px; \}/);
});

test('a swipe that starts on a button does not light it up: a finger waits before the ripple', () => {
  assert.match(app, /if \(e\.pointerType === 'mouse'\) \{ spawnRipple\(el, e\.clientX, e\.clientY\); return; \}/);
  assert.match(app, /document\.addEventListener\('pointercancel', fadeRipples, true\);/);
  // no timer: a finger rests a moment before it scrolls, so a delay still lit the button up
  const start = app.indexOf('let pendingRipple = null;');
  assert.doesNotMatch(app.slice(start, app.indexOf('function spawnRipple(', start)), /setTimeout\(\(\) => \{ if \(pendingRipple/);
});

test('the mini player draws only the played part of its progress line, no grey track that looks like a scrollbar', () => {
  const css = read('mobile/mobile.css');
  assert.match(css, /calc\(var\(--mini-progress, 0\) \* 100%\), transparent 0\);/);
  assert.doesNotMatch(css, /--mini-progress, 0\) \* 100%\), (rgba|color-mix)/);
});
