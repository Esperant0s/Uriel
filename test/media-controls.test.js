'use strict';

// mobile/media-controls.js: the Android "now playing" notification / lock-screen controls.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

function setup(platform = 'android', { unrestricted = true, island = null, startPlay = null, files = null, queue = null } = {}) {
  const calls = [];
  const asked = [];
  let actionListener = null;
  const plugin = {
    update: (data) => { calls.push(data); return Promise.resolve(); },
    addListener: (name, cb) => { if (name === 'action') actionListener = cb; return Promise.resolve({ remove() {} }); },
    backgroundStatus: () => Promise.resolve({ unrestricted }),
    allowBackground: () => { asked.push('allow'); return Promise.resolve(); },
    // like an older native side when null: the call fails
    islandStatus: () => (island ? Promise.resolve(island) : Promise.reject(new Error('not implemented'))),
    allowIsland: (opts) => { asked.push(`island ${JSON.stringify(opts || {})}`); return Promise.resolve(island); },
    takeStartPlay: () => Promise.resolve(startPlay || {}),
    moveToBack: () => { asked.push('back'); return Promise.resolve(); },
  };
  // the song cache, as the app's file index sees it (mobile/shims/fs.js): path -> size
  const fsFile = path.join(__dirname, '../mobile/shims/fs.js');
  if (files) {
    require.cache[fsFile] = { id: fsFile, filename: fsFile, loaded: true, exports: {
      statSync: (p) => { if (!(p in files)) throw new Error('ENOENT'); return { size: files[p] }; },
      existsSync: (p) => p in files,
    } };
  } else delete require.cache[fsFile];
  const fakeCore = { Capacitor: { getPlatform: () => platform }, registerPlugin: () => plugin };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) { return request === '@capacitor/core' ? fakeCore : origLoad.call(this, request, ...rest); };
  const file = path.join(__dirname, '../mobile/media-controls.js');
  delete require.cache[file];
  // it keeps the file index it was first given
  delete require.cache[path.join(__dirname, '../mobile/song-files.js')];
  const audio = new EventTarget();
  Object.assign(audio, { paused: true, currentTime: 0, duration: NaN, playbackRate: 1 });
  const did = [];
  const state = { currentTrack: null, isPlaying: false, queue: queue || [], queueIndex: 0 };
  global.window = new EventTarget();
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  global.document = { hidden: false };
  window.UrielCore = {
    state, audio, thumb: (t) => t.thumbnail,
    togglePlay: () => { did.push('toggle'); state.isPlaying = !state.isPlaying; },
    next: () => did.push('next'), prev: () => did.push('prev'), seek: (s) => did.push(`seek ${s}`),
    isSameTrack: (a, b) => a.id === b.id,
    restoreAt: (i, pos, play) => { did.push(`restore ${i} ${pos} ${play}`); return true; },
  };
  try { require(file)(); } finally { Module._load = origLoad; }
  return { calls, asked, audio, state, did, action: (a) => actionListener(a) };
}

const tick = () => new Promise((r) => setTimeout(r, 120));

test('one update per song change with title, cover, length and play state', async () => {
  const { calls, audio, state } = setup();
  state.currentTrack = { title: 'Song', artist: 'Someone', duration: 200, thumbnail: 'https://i.ytimg.com/vi/a/mqdefault.jpg' };
  state.isPlaying = true;
  window.dispatchEvent(new Event('uriel:track'));
  // loaded (a song brought back from last time and not loaded yet reports where it will start instead)
  Object.assign(audio, { src: 'https://localhost/_capacitor_file_/data/x/files/Mural/tracks/a.m4a', currentTime: 3, duration: 201.5 });
  audio.dispatchEvent(new Event('durationchange'));
  audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], {
    title: 'Song', artist: 'Someone', album: '', artwork: 'https://i.ytimg.com/vi/a/mqdefault.jpg', duration: 201.5, position: 3, playing: true, loading: false, rate: 1, shuffle: false, repeat: 'off', island: 'auto',
    // for earbuds while the page isn't running (ColdPlayer.java): not in the queue and not saved, so nothing to play
    resume: { qi: -1, title: 'Song', artist: 'Someone', album: '', artwork: 'https://i.ytimg.com/vi/a/mqdefault.jpg', duration: 200, cache: '', thumb: '' },
    upcoming: [],
    resumePosition: 3,
    // the page's own <audio> element (no native player): this side shows the song
    external: false,
  });
});

test('earbuds get the song and the saved songs after it, matched by song (the brought-back song is a copy)', async () => {
  const q = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id.toUpperCase(), artist: 'X', duration: 100 }));
  const { calls, state } = setup('android', {
    queue: q,
    files: { '/data/tracks/b.m4a': 3e6, '/data/tracks/c.temp.opus': 3e6, '/data/tracks/d.webm': 5000, '/data/thumbnails/b.jpg': 1 },
  });
  state.queueIndex = 0;
  state.currentTrack = { ...q[0] };
  window.dispatchEvent(new Event('uriel:track'));
  await tick();
  const { resume, upcoming } = calls[0];
  assert.strictEqual(resume.qi, 0);
  assert.strictEqual(resume.cache, '');
  // c is still downloading and d is too small to be a song: only b
  assert.deepStrictEqual(upcoming.map((u) => [u.qi, u.cache, u.thumb]), [[1, 'b.m4a', 'b.jpg']]);
});

test('with repeat off the saved songs stop at the end of the queue; with repeat on they go round', async () => {
  const q = ['a', 'b', 'c'].map((id) => ({ id, title: id, artist: 'X' }));
  const files = { '/data/tracks/a.opus': 1e6, '/data/tracks/b.opus': 1e6, '/data/tracks/c.opus': 1e6 };
  const off = setup('android', { queue: q, files });
  off.state.queueIndex = 1;
  off.state.currentTrack = q[1];
  window.dispatchEvent(new Event('uriel:track'));
  await tick();
  assert.deepStrictEqual(off.calls[0].upcoming.map((u) => u.qi), [2]);
  assert.strictEqual(off.calls[0].resume.cache, 'b.opus');
  const all = setup('android', { queue: q, files });
  Object.assign(all.state, { queueIndex: 1, currentTrack: q[1], repeatMode: 'all' });
  window.dispatchEvent(new Event('uriel:track'));
  await tick();
  assert.deepStrictEqual(all.calls[0].upcoming.map((u) => u.qi), [2, 0]);
});

test('the page carries on where the earbud player got to', async () => {
  const q = ['a', 'b', 'c'].map((id) => ({ id, title: id, artist: 'X' }));
  // still playing when the app opened
  let t = setup('android', { queue: q, startPlay: { native: { qi: 1, title: 'b', artist: 'X', position: 42.5, playing: true, live: true } } });
  await tick();
  assert.deepStrictEqual(t.did, ['restore 1 42.5 true']);
  // the queue moved since: found by its song
  t = setup('android', { queue: [q[2], q[0], q[1]], startPlay: { native: { qi: 1, title: 'b', artist: 'X', position: 7, playing: false, live: true } } });
  await tick();
  assert.deepStrictEqual(t.did, ['restore 2 7 false']);
  // from an earlier time, opened by a person: shown, not played
  t = setup('android', { queue: q, startPlay: { native: { qi: 0, title: 'a', artist: 'X', position: 3, playing: false } } });
  await tick();
  assert.deepStrictEqual(t.did, ['restore 0 3 false']);
  // its saved songs ran out and earbuds opened the app: the next song, then out of sight once it plays
  t = setup('android', { queue: q, startPlay: { start: true, background: true, native: { qi: 0, title: 'a', artist: 'X', ended: true } } });
  await tick();
  assert.deepStrictEqual(t.did, ['restore 0 0 false', 'next']);
  t.audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.ok(t.asked.includes('back'));
});

test('the island setting goes along: the phone decides until it is picked, then on or off', async () => {
  const { calls, state } = setup();
  state.currentTrack = { title: 'T' };
  assert.strictEqual(window.UrielIsland.enabled({ defaultOn: true }), true);
  assert.strictEqual(window.UrielIsland.enabled({ defaultOn: false }), false);
  window.UrielIsland.setEnabled(true);
  await tick();
  assert.strictEqual(calls[0].island, 'on');
  assert.strictEqual(window.UrielIsland.enabled({ defaultOn: false }), true);
  window.UrielIsland.setEnabled(false);
  await tick();
  assert.strictEqual(calls[1].island, 'off');
  assert.strictEqual(window.UrielIsland.enabled({ defaultOn: true }), false);
});

test('island status survives a native side without it', async () => {
  setup();
  assert.deepStrictEqual(await window.UrielIsland.status(), {});
  assert.strictEqual(window.UrielIsland.enabled({}), false);
});

test('notifications are asked for once, after the battery question, island or not (#25)', async () => {
  const off = { supported: true, vendor: 'vivo', defaultOn: true, notifications: false, promoted: true };
  const vivo = setup('android', { unrestricted: false, island: off });
  vivo.audio.dispatchEvent(new Event('playing'));
  vivo.audio.dispatchEvent(new Event('playing'));
  await tick();
  // never opens Settings by itself
  assert.deepStrictEqual(vivo.asked, ['allow', 'island {"settings":false}']);
  // the playback notification needs them too: also asked with the island off, or before Android 16
  for (const island of [{ ...off, defaultOn: false }, { ...off, supported: false, defaultOn: false }]) {
    const other = setup('android', { island });
    other.audio.dispatchEvent(new Event('playing'));
    await tick();
    assert.deepStrictEqual(other.asked, ['island {"settings":false}']);
  }
  // notifications already allowed, or no answer from the phone: nothing to ask
  for (const island of [{ ...off, notifications: true }, {}]) {
    const other = setup('android', { island });
    other.audio.dispatchEvent(new Event('playing'));
    await tick();
    assert.deepStrictEqual(other.asked, []);
  }
});

test('the gap while the next song downloads is reported as loading, not as a pause', async () => {
  const { calls, audio, state } = setup();
  state.currentTrack = { title: 'One', duration: 100 };
  state.isPlaying = true;
  audio.dispatchEvent(new Event('playing'));
  await tick();
  // the song ends: app.js pauses, then starts loading the next one
  state.isPlaying = false;
  audio.dispatchEvent(new Event('pause'));
  state.currentTrack = { title: 'Two', duration: 100 };
  state.trackLoading = true;
  window.dispatchEvent(new Event('uriel:loading'));
  await tick();
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].title, 'Two');
  assert.strictEqual(calls[1].playing, false);
  assert.strictEqual(calls[1].loading, true);
  state.isPlaying = true;
  state.trackLoading = false;
  audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.deepStrictEqual([calls[2].playing, calls[2].loading], [true, false]);
});

test('a button press is answered with the real state, even when it changed nothing', async () => {
  const { calls, state, action } = setup();
  state.currentTrack = { title: 'T' };
  window.UrielCore.togglePlay = () => {}; // nothing to resume
  action({ action: 'play' });
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].playing, false);
  assert.strictEqual(calls[0].loading, false);
});

test('asks once to keep running in the background, when the first song starts', async () => {
  const restricted = setup('android', { unrestricted: false });
  restricted.audio.dispatchEvent(new Event('playing'));
  restricted.audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.deepStrictEqual(restricted.asked, ['allow']);
  const fine = setup('android', { unrestricted: true });
  fine.audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.deepStrictEqual(fine.asked, []);
});

test('notification buttons drive the player', () => {
  const { state, did, action } = setup();
  state.isPlaying = true;
  action({ action: 'play' });
  action({ action: 'pause' });
  action({ action: 'pause' });
  action({ action: 'next' });
  action({ action: 'prev' });
  action({ action: 'seek', position: 42 });
  assert.deepStrictEqual(did, ['toggle', 'next', 'prev', 'seek 42']);
});

test('shuffle and repeat: their state goes to the player, and its buttons toggle them', async () => {
  const { calls, state, did, action } = setup();
  state.currentTrack = { title: 'T' };
  Object.assign(window.UrielCore, {
    toggleShuffle: () => { did.push('shuffle'); state.isShuffle = !state.isShuffle; },
    // like the app's button: off, the playlist, the song
    toggleRepeat: () => { did.push('repeat'); state.repeatMode = { off: 'all', all: 'one', one: 'off' }[state.repeatMode || 'off']; },
  });
  action({ action: 'shuffle' });
  await tick();
  assert.deepStrictEqual([calls[0].shuffle, calls[0].repeat], [true, 'off']);
  action({ action: 'repeat' });
  await tick();
  assert.deepStrictEqual([calls[1].shuffle, calls[1].repeat], [true, 'all']);
  action({ action: 'repeat' });
  await tick();
  assert.strictEqual(calls[2].repeat, 'one');
  // toggled inside the app: the notification follows
  state.isShuffle = false;
  window.dispatchEvent(new Event('uriel:modes'));
  await tick();
  assert.strictEqual(calls[3].shuffle, false);
  assert.deepStrictEqual(did, ['shuffle', 'repeat', 'repeat']);
});

test('does nothing outside Android', async () => {
  const { calls, state } = setup('ios');
  state.currentTrack = { title: 'T' };
  window.dispatchEvent(new Event('uriel:track'));
  await tick();
  assert.strictEqual(calls.length, 0);
});

test.after(() => { delete global.window; delete global.localStorage; delete global.document; });
