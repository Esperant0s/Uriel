'use strict';

// mobile/native-audio.js: on Android, app.js's <audio> element played by the native player (PlayerService.kt).
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function setup({ webAudio = false, attach = {} } = {}) {
  const calls = [];
  const listeners = {};
  const player = {
    addListener: (name, cb) => { listeners[name] = cb; return Promise.resolve({ remove() {} }); },
    attach: () => Promise.resolve(attach),
  };
  for (const m of ['load', 'play', 'pause', 'seek', 'setSpeed', 'setVolume', 'clear', 'setModes']) {
    player[m] = (arg) => { calls.push(arg === undefined ? m : [m, arg]); return Promise.resolve(); };
  }
  const fakeCore = { Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => player };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) { return request === '@capacitor/core' ? fakeCore : origLoad.call(this, request, ...rest); };
  const file = path.join(__dirname, '../mobile/native-audio.js');
  delete require.cache[file];
  delete require.cache[path.join(__dirname, '../mobile/song-files.js')];
  const web = new EventTarget();
  Object.assign(web, { src: '', currentSrc: '', paused: true, ended: false, playbackRate: 1, preservesPitch: true, volume: 1, muted: false,
    play() { web.paused = false; return Promise.resolve(); }, pause() { web.paused = true; }, load() {}, removeAttribute() { web.src = ''; } });
  global.window = new EventTarget();
  global.localStorage = { getItem: () => null, setItem() {} };
  global.DOMException = global.DOMException || class extends Error {};
  window.UrielNeedsWebAudio = () => webAudio;
  window.__urielResolveLocal = (u) => Promise.resolve('https://localhost/_capacitor_file_/data/user/0/x/files/Mural/tracks/a%20b.webm');
  window.UrielCore = { state: { currentTrack: { id: 'a', title: 'Song', artist: 'Someone' }, queue: [], queueIndex: 0 } };
  let audio;
  try { audio = require(file)(web); } finally { Module._load = origLoad; }
  const events = [];
  for (const t of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'error', 'seeked', 'waiting']) audio.addEventListener(t, () => events.push(t));
  const state = (s) => listeners.state({ at: Date.now(), rate: 1, playWhenReady: true, ...s });
  return { audio, web, calls, events, state, listeners };
}

test('a song from the app plays through the native player, by its file', async () => {
  const { audio, calls, events, state } = setup();
  audio.src = 'http://127.0.0.1:38472/api/local-track?id=a';
  assert.strictEqual(audio.paused, true);
  await audio.play();
  const load = calls.find((c) => c[0] === 'load')[1];
  assert.strictEqual(load.path, '/data/user/0/x/files/Mural/tracks/a b.webm');
  assert.strictEqual(load.item.title, 'Song');
  assert.ok(calls.includes('play'));
  assert.strictEqual(audio.backend, 'native');
  // the player reports: metadata once, then playing
  state({ item: JSON.stringify({ load: load.item.load }), state: 3, playing: true, position: 1, duration: 200 });
  await tick();
  assert.deepStrictEqual(events, ['play', 'durationchange', 'loadedmetadata', 'playing']);
  assert.strictEqual(audio.duration, 200);
  assert.ok(audio.currentTime >= 1);
});

test('news about an earlier song, or from before the last pause, is ignored', async () => {
  const { audio, calls, events, state } = setup();
  audio.src = 'http://127.0.0.1:1/api/local-track?id=a';
  await audio.play();
  const load = calls.find((c) => c[0] === 'load')[1].item.load;
  state({ item: JSON.stringify({ load: load - 1 }), state: 4, playing: false, position: 0, duration: 10 });
  const before = Date.now() - 1000;
  audio.pause();
  // read before the pause reached the player: still playing there
  state({ item: JSON.stringify({ load }), state: 3, playing: true, position: 5, duration: 200, at: before });
  await tick();
  assert.strictEqual(audio.paused, true);
  assert.ok(!events.includes('ended'));
  assert.ok(!events.includes('playing'));
});

test('the song ending: pause, then ended, like an <audio> element', async () => {
  const { audio, calls, events, state } = setup();
  audio.src = 'http://127.0.0.1:1/api/local-track?id=a';
  await audio.play();
  const load = calls.find((c) => c[0] === 'load')[1].item.load;
  state({ item: JSON.stringify({ load }), state: 3, playing: true, position: 1, duration: 200 });
  state({ item: JSON.stringify({ load }), state: 4, playing: false, position: 200, duration: 200 });
  await tick();
  assert.deepStrictEqual(events.slice(-2), ['pause', 'ended']);
  assert.strictEqual(audio.ended, true);
  assert.strictEqual(audio.paused, true);
});

test('another app taking the sound pauses the page too', async () => {
  const { audio, calls, events, state } = setup();
  audio.src = 'http://127.0.0.1:1/api/local-track?id=a';
  await audio.play();
  await tick();
  const load = calls.find((c) => c[0] === 'load')[1].item.load;
  state({ item: JSON.stringify({ load }), state: 3, playing: true, position: 1, duration: 200 });
  state({ item: JSON.stringify({ load }), state: 3, playing: false, playWhenReady: false, position: 2, duration: 200 });
  await tick();
  assert.strictEqual(audio.paused, true);
  assert.strictEqual(events[events.length - 1], 'pause');
});

test('with sound effects on, the song plays through the real element', async () => {
  const { audio, web, calls } = setup({ webAudio: true });
  audio.src = 'http://127.0.0.1:1/api/local-track?id=a';
  assert.strictEqual(audio.backend, 'web');
  assert.strictEqual(web.src, 'http://127.0.0.1:1/api/local-track?id=a');
  await audio.play();
  assert.strictEqual(web.paused, false);
  assert.ok(!calls.some((c) => c[0] === 'load'));
});

test('a seek before the song is sent starts it there', async () => {
  const { audio, calls } = setup();
  audio.src = 'http://127.0.0.1:1/api/local-track?id=a';
  audio.currentTime = 42;
  await audio.play();
  assert.strictEqual(calls.find((c) => c[0] === 'load')[1].startAt, 42);
});

test('a song the native player already plays is taken on as it is', async () => {
  const { audio, events, state, calls } = setup();
  assert.ok(audio.adopt({ item: { title: 'Song', artist: 'Someone', qi: 0 }, position: 30, duration: 200, playing: true }));
  await tick();
  assert.deepStrictEqual(events, ['durationchange', 'loadedmetadata', 'play', 'playing']);
  assert.ok(audio.src);
  assert.ok(audio.currentTime >= 30);
  // its reports (no load number) still count
  state({ item: JSON.stringify({ title: 'Song' }), state: 4, playing: false, position: 200, duration: 200 });
  await tick();
  assert.strictEqual(audio.ended, true);
  assert.ok(!calls.some((c) => c[0] === 'load'));
});
