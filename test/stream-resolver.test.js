'use strict';

// The shared stream resolver (stream-resolver.js), driven with fake strategies and a fake clock
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHealth, createResolver, BLOCK_MS, REST_MS } = require('../shared/stream-resolver');

function clock() { let t = 1000; return { now: () => t, advance: (ms) => { t += ms; } }; }
const blockedErr = () => new Error("Sign in to confirm you're not a bot");
const isBlocked = (e) => /not a bot/.test(String(e && e.message));
// a strategy that answers what `answers` says, in order, and records each call
function fake(name, source, answers) {
  const calls = [];
  return { calls, s: { name, source, attempt: async (song) => { calls.push(song.id); const a = answers.length > 1 ? answers.shift() : answers[0]; if (a instanceof Error) throw a; return a; } } };
}

test('tries strategies in order and stops at the first that plays', async () => {
  const a = fake('fast', 'youtube-fast', [null]);
  const b = fake('ytDlp', 'youtube-ytdlp', [{ url: 'https://x/2' }]);
  const c = fake('soundcloud', 'soundcloud', [{ url: 'https://x/3' }]);
  const r = createResolver({ strategies: [a.s, b.s, c.s], isBlocked });
  const out = await r.resolve({ id: 'one' });
  assert.equal(out.url, 'https://x/2');
  assert.equal(out.source, 'ytDlp');
  assert.deepEqual(out.tried.map((t) => t.outcome), ['none', 'ok']);
  assert.equal(c.calls.length, 0);
});

test('"not a bot" blocks that source, so the next song skips it straight to the fallback', async () => {
  const c0 = clock();
  const yt = fake('ytDlp', 'youtube-ytdlp', [blockedErr()]);
  const sc = fake('soundcloud', 'soundcloud', [{ url: 'https://sc/1' }]);
  const r = createResolver({ strategies: [yt.s, sc.s], isBlocked, health: createHealth({ now: c0.now }), now: c0.now });
  await r.resolve({ id: 'a' });
  const second = await r.resolve({ id: 'b' });
  assert.equal(yt.calls.length, 1, 'YouTube asked once, not for every song');
  assert.deepEqual(second.tried.map((t) => t.outcome), ['skipped', 'ok']);
  c0.advance(BLOCK_MS + 1);
  await r.resolve({ id: 'c' });
  assert.equal(yt.calls.length, 2, 'tried again once the pause is over');
});

test('nothing works: it fails, and says whether it was a block', async () => {
  const r1 = createResolver({ strategies: [fake('ytDlp', 'youtube-ytdlp', [blockedErr()]).s, fake('soundcloud', 'soundcloud', [null]).s], isBlocked });
  await assert.rejects(r1.resolve({ id: 'x' }), (e) => e.code === 'blocked' && e.tried.length === 2);
  const r2 = createResolver({ strategies: [fake('fast', 'youtube-fast', [null]).s], isBlocked });
  await assert.rejects(r2.resolve({ id: 'x' }), (e) => e.code === 'unavailable');
});

test('a source that keeps failing rests 1, then 2 minutes; a success clears it', async () => {
  const c0 = clock();
  const h = createHealth({ now: c0.now });
  for (let i = 0; i < 3; i++) h.fail('soundcloud');
  assert.equal(h.blocked('soundcloud'), true);
  c0.advance(REST_MS[0] + 1);
  assert.equal(h.blocked('soundcloud'), false);
  for (let i = 0; i < 3; i++) h.fail('soundcloud');
  c0.advance(REST_MS[0] + 1);
  assert.equal(h.blocked('soundcloud'), true, 'the second rest is longer');
  h.ok('soundcloud');
  assert.equal(h.blocked('soundcloud'), false);
  assert.deepEqual(Object.keys(h.stats()), ['soundcloud']);
});

test("a background lookup that's turned away doesn't block the source for the next tap", async () => {
  const yt = fake('ytDlp', 'youtube-ytdlp', [blockedErr()]);
  const r = createResolver({ strategies: [yt.s], isBlocked });
  await assert.rejects(r.resolve({ id: 'next' }, { reason: 'prefetch' }));
  assert.equal(r.health.blocked('youtube-ytdlp'), false);
});

test('a slow strategy gets only its budget, and the song moves on', async () => {
  const slow = { name: 'ytDlp', source: 'youtube-ytdlp', maxMs: 50, attempt: () => new Promise(() => {}) };
  const sc = fake('soundcloud', 'soundcloud', [{ url: 'https://sc/2' }]);
  const r = createResolver({ strategies: [slow, sc.s], isBlocked });
  const out = await r.resolve({ id: 'slow' });
  assert.equal(out.source, 'soundcloud');
  assert.equal(out.tried[0].outcome, 'timeout');
});

test('the same song asked for twice at once is looked up once', async () => {
  let n = 0;
  const s = { name: 'fast', source: 'youtube-fast', attempt: async () => { n++; await new Promise((r) => setTimeout(r, 20)); return { url: 'https://x/1' }; } };
  const r = createResolver({ strategies: [s] });
  const [a, b] = await Promise.all([r.resolve({ id: 's', key: 's' }), r.resolve({ id: 's', key: 's' })]);
  assert.equal(n, 1);
  assert.equal(a.url, b.url);
});

test("strategies that don't handle a song are passed over; reset brings a blocked source back", async () => {
  const yt = { name: 'fast', source: 'youtube-fast', canHandle: (song) => song.youtube, attempt: async () => ({ url: 'https://yt' }) };
  const sc = fake('soundcloud', 'soundcloud', [{ url: 'https://sc' }]);
  const r = createResolver({ strategies: [yt, sc.s] });
  assert.equal((await r.resolve({ id: 'sc-song', youtube: false })).source, 'soundcloud');
  r.health.block('youtube-fast');
  assert.equal((await r.resolve({ id: 'yt-song', youtube: true })).source, 'soundcloud');
  r.health.reset('youtube-fast');
  assert.equal((await r.resolve({ id: 'yt-song2', youtube: true })).source, 'fast');
});
