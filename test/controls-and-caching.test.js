'use strict';

// Spotify-style song and playlist controls, "N of M downloaded" on playlists, a home page that shows its last
// recommendations at once and looks the first songs up ahead, and a saved queue that can't fill the storage
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('shared/app.js');

test("a song's menu can share it and copy its link; a playlist has a ⋯ menu", () => {
  assert.match(app, /label: 'Share…', run: \(\) => sharePlaylist\(\{ name: \[track\.title, track\.artist\]/);
  assert.match(app, /label: 'Copy song link'/);
  assert.match(read('shared/index.html'), /id="btn-playlist-more"/);
  for (const label of ['Play next', 'Add to queue', 'Edit details', 'Duplicate', 'Export as file', 'Delete playlist']) {
    assert.ok(app.includes(`{ label: '${label}', `), label);
  }
});

test('playlists say how many of their songs are downloaded, and the dialog what it will skip', () => {
  assert.match(app, /refreshPlaylistDownloads\(pl\);\n  \}/, 'when a playlist opens');
  assert.match(app, /'\{0\} of \{1\} downloaded'/);
  assert.match(app, /'Download \{0\} more'/);
  assert.match(app, /'\{0\} of \{1\} already downloaded · \{2\} to go'/);
});

test('My Wave and For you show what they had last time while new picks load', () => {
  assert.match(app, /safeJson\('uriel_home_wave_cache', null\)/);
  assert.match(app, /safeJson\('uriel_home_foryou_cache', null\)/);
  assert.match(app, /fetchWaveTracks\(\{ \.\.\.vibePayload, refresh: true \}\)\.then\(saveWaveCache/, 'the cached wave is replaced for next time');
});

test("recommended songs are looked up ahead, but not on a phone's mobile data or with Data Saver", () => {
  const fn = app.slice(app.indexOf('function warmHomeSongs'), app.indexOf('function warmHomeSongs') + 1400);
  assert.match(fn, /conn\.saveData\) return/);
  assert.match(fn, /isPhoneApp && conn && conn\.type && conn\.type !== 'wifi'/);
  assert.match(fn, /homeWarmed\.size >= 8/);
  assert.match(fn, /state\.trackLoading/);
});

test('the saved queue keeps up to 1000 songs around the current one', () => {
  const fn = app.slice(app.indexOf('function saveQueueState()'), app.indexOf('function scheduleQueueSave'));
  assert.match(fn, /all\.slice\(from, from \+ 1000\)/);
  assert.match(fn, /queueIndex: state\.queueIndex - from/);
});

test('phones: the now-playing controls and the row under them share one five-column grid', () => {
  const css = read('mobile/mobile.css');
  assert.match(css, /body\.np-open \.playbar-right \{ display: grid !important; grid-template-columns: repeat\(5, 1fr\);/);
  assert.match(css, /body\.np-open #btn-toggle-queue \{ grid-column: 3; \}/);
});

test('the playlist buttons wrap instead of running off the page; the edit buttons live in ⋯', () => {
  const css = read('shared/styles.css');
  assert.match(css, /\.playlist-actions \{ flex-wrap: wrap !important;/);
  assert.match(css, /#btn-share-playlist, #btn-rename-playlist, #btn-export-playlist, #btn-delete-playlist \{ display: none !important; \}/);
});

test('computers: a round play button and plain controls, centred with the seek bar as one block', () => {
  const css = read('shared/styles.css');
  assert.match(css, /:is\(\.btn-play-pause, \.btn-play-pause\.playing\) \{\s*width: 40px !important; height: 40px !important;[^}]*border-radius: 50% !important;/);
  assert.match(css, /\.playbar-center \{ padding-top: 18px; \}/);
});
