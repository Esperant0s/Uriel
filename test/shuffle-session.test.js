'use strict';

// Shuffle leaves songs already played this session (in any queue) for last: runs app.js's own shufflePool
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appSource = require('../tools/app-source');

const app = appSource();
const src = app.slice(app.indexOf('  function shufflePool(q, played) {'), app.indexOf('  function pickShuffleIndex() {'));
// shufflePool(q, played) with the rest of the app replaced by what each case says
function poolWith({ queueIndex = 0, heard = [], blocked = [] }) {
  const make = new Function('state', 'isBlocked', 'playedThisSession', `${src}; return shufflePool;`);
  return make({ queueIndex }, (t) => blocked.includes(t.id), (t) => heard.includes(t.id));
}
const q = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
const ids = (pool) => pool.map((i) => q[i].id).sort();

test('songs heard earlier this session are left out while others remain', () => {
  const pool = poolWith({ queueIndex: 0, heard: ['b', 'c'] });
  assert.deepEqual(ids(pool(q, new Set())), ['d', 'e']);
});

test('once every other song has been heard this session, they can come back (but not the playing one)', () => {
  const pool = poolWith({ queueIndex: 0, heard: ['a', 'b', 'c', 'd', 'e'] });
  assert.deepEqual(ids(pool(q, new Set())), ['b', 'c', 'd', 'e']);
});

test("this round's played songs and blocked songs stay out either way", () => {
  const pool = poolWith({ queueIndex: 0, heard: ['d'], blocked: ['e'] });
  assert.deepEqual(ids(pool(q, new Set([q[1]]))), ['c']);
  const all = poolWith({ queueIndex: 0, heard: ['c', 'd'], blocked: ['e'] });
  assert.deepEqual(ids(all(q, new Set([q[1]]))), ['c', 'd'], 'only heard ones left: they play rather than nothing');
});

test('a song counts as played the moment it starts, whatever queue it was in', () => {
  assert.match(app, /addEventListener\('playing', \(\) => \{\n      notePlayedThisSession\(state\.currentTrack\);/);
  assert.match(app, /sessionPlayed\.has\(getTrackCanonicalId\(t\)\) \|\| sessionPlayed\.has\(getTrackNormalizedKey\(t\.artist, t\.title\)\)/);
});
