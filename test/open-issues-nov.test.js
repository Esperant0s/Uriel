'use strict';

// Regression tests for the issues still open on Nov 4: #17 (chunked YouTube ranges), #26 (iPhone audio context
// left 'interrupted'), #31 (letterboxed YouTube covers), #33 (timed lyrics for another cut), #36 (crossfade tail
// at 1x) and #40 (phone rows drifting in long lists).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ss = require('../shared/stream-source');
const { parseForLyrics, pickBest, syncedFits } = require('../shared/lyrics-match');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('#17: an open-ended Range becomes bounded chunks, bounded ones pass through', () => {
  assert.equal(ss.openRangeStart('bytes=0-'), 0);
  assert.equal(ss.openRangeStart('bytes=1048576-'), 1048576);
  assert.equal(ss.openRangeStart('bytes=0-1023'), -1);
  assert.equal(ss.openRangeStart('bytes=-500'), -1);
  assert.equal(ss.openRangeStart(undefined), -1);
  assert.equal(ss.chunkRange(0, 0), `bytes=0-${ss.YT_CHUNK_BYTES - 1}`);
  assert.equal(ss.chunkRange(100, 150), 'bytes=100-149');
  assert.deepEqual(ss.parseContentRange('bytes 0-10485759/31457280'), { start: 0, end: 10485759, total: 31457280 });
  assert.deepEqual(ss.parseContentRange('bytes 5-9/*'), { start: 5, end: 9, total: 0 });
  assert.equal(ss.parseContentRange('nonsense'), null);
});

test('#17: the proxy asks googlevideo for chunks and tells the player about the whole rest', () => {
  const server = read('shared/server.js');
  assert.match(server, /const chunkFrom = req\.method === 'GET' && streamSource\.isGoogleVideoUrl\(targetUrl\) \? streamSource\.openRangeStart\(headers\.range\) : -1;/);
  assert.match(server, /out\['content-range'\] = `bytes \$\{cr\.start\}-\$\{cr\.total - 1\}\/\$\{cr\.total\}`;/);
  assert.match(server, /pipeChunks\(proxyRes, cr\.start, cr\.total,/);
  // the next chunk starts where the bytes really ended, not where the header said
  assert.match(server, /const from = chunkStart \+ got;/);
});

test('#26: an interrupted audio context is resumed like a suspended one', () => {
  require('../shared/audio-engine');
  const Engine = globalThis.UrielAudioEngine;
  const e = new Engine();
  let resumed = 0;
  e.ctx = { state: 'interrupted', resume: () => { resumed++; return Promise.resolve(); } };
  assert.equal(e.needsResume(), true);
  e.resumeAudioContext();
  assert.equal(resumed, 1);
  e.ctx.state = 'running';
  assert.equal(e.needsResume(), false);
  e.resumeAudioContext();
  assert.equal(resumed, 1);
  const mod = read('mobile/audio-interruption.ts');
  assert.ok(mod.indexOf('c.resumeAudio()') > mod.indexOf("if (type !== 'ended') return;"));
  assert.match(read('shared/app.js'), /resumeAudio: \(\) => audioEngine && audioEngine\.resumeAudioContext/);
});

test('#31: letterboxed 4:3 YouTube frames are swapped for the bar-free 16:9 ones', () => {
  const app = read('shared/app.js');
  const src = app.match(/const YT_BOXED = (\/.+\/);/);
  assert.ok(src, 'YT_BOXED is defined');
  const YT_BOXED = eval(src[1]);
  assert.ok(YT_BOXED.test('https://i.ytimg.com/vi/Ee_uujKuJMI/hqdefault.jpg'));
  assert.ok(YT_BOXED.test('https://i.ytimg.com/vi/Ee_uujKuJMI/sddefault.jpg'));
  assert.ok(YT_BOXED.test('https://i.ytimg.com/vi/Ee_uujKuJMI/hqdefault.jpg?sqp=abc'));
  assert.ok(!YT_BOXED.test('https://i.ytimg.com/vi/Ee_uujKuJMI/mqdefault.jpg'));
  assert.ok(!YT_BOXED.test('https://i.ytimg.com/vi/Ee_uujKuJMI/maxresdefault.jpg'));
  assert.match(app, /if \(yt\) return \['maxresdefault', 'mqdefault'\]\.map/);
  // YouTube's grey stand-in for a missing maxresdefault falls back to mqdefault
  assert.match(app, /img\.naturalWidth > 120\) return;/);
});

test('#33: timed lyrics for a cut of another length come back untimed', () => {
  const want = parseForLyrics('Green Day - American Idiot (Official Music Video)', 'Green Day');
  const studio = { trackName: 'American Idiot', artistName: 'Green Day', duration: 176, syncedLyrics: '[00:00.50] Dont wanna be', plainLyrics: 'Dont wanna be' };
  // a music video with a 20 s intro
  const best = pickBest([studio], want, 196);
  assert.ok(best);
  assert.equal(best.syncedLyrics, null);
  assert.equal(best.plainLyrics, 'Dont wanna be');
  // the same length (within a few seconds) keeps the timing
  assert.equal(pickBest([studio], want, 178).syncedLyrics, studio.syncedLyrics);
  // a result that fits wins over one that doesn't
  const video = { ...studio, duration: 195, syncedLyrics: '[00:20.50] Dont wanna be' };
  assert.equal(pickBest([studio, video], want, 196).syncedLyrics, video.syncedLyrics);
  assert.equal(syncedFits({ duration: 0 }, 200), true);
  assert.equal(syncedFits({ duration: 176 }, 0), true);
  assert.match(read('shared/server.js'), /hit\.syncedLyrics && syncedFits\(hit, dur\)/);
});

test('#36: the crossfade tail keeps the speed and pitch through loading the song', () => {
  const app = read('shared/app.js');
  const prep = app.slice(app.indexOf('function prepareCrossfade('), app.indexOf('function startCrossfade('));
  assert.match(prep, /t\.defaultPlaybackRate = rate;/);
  assert.match(prep, /addEventListener\('loadedmetadata', \(\) => \{ matchRate\(\);/);
  // set before the src, not only after it
  assert.ok(prep.indexOf('matchRate();') < prep.indexOf('t.src = a.currentSrc;'));
});

test('#40: long lists measure their row height instead of assuming 64px', () => {
  const app = read('shared/app.js');
  assert.doesNotMatch(app, /const itemHeight = 64;/);
  assert.match(app, /let itemHeight = container\._rowHeight \|\| 64;/);
  assert.match(app, /const step = rows\[1\]\.offsetTop - rows\[0\]\.offsetTop;/);
});
