'use strict';

// Shuffle mixes the queue itself (so the queue shows what plays next), leaves songs already played this session
// for last, and turning it off puts the old order back: runs app.js's own shuffleQueue and unshuffleQueue
const test = require('node:test');
const assert = require('node:assert/strict');
const appSource = require('../tools/app-source');

const app = appSource();
const src = app.slice(app.indexOf('  function shuffleQueue() {', app.indexOf('window.UrielApp.playback = function')), app.indexOf('  // A song that can\'t be played used to stop'));
function withState(state, heard = []) {
  const make = new Function('state', 'playedThisSession', `${src}; return { shuffleQueue, unshuffleQueue };`);
  return make(state, (t) => heard.includes(t.id));
}
const songs = () => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
const ids = (list) => list.map((t) => t.id);

test('the playing song goes first and every other song follows once, in the same array', () => {
  const q = songs();
  const state = { queue: q, queueIndex: 3, queueHistory: [], unshuffledQueue: null };
  withState(state).shuffleQueue();
  assert.equal(state.queue, q);
  assert.equal(state.queueIndex, 0);
  assert.equal(q[0].id, 'd');
  assert.deepEqual(ids(q).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('songs heard earlier this session come after the others', () => {
  const state = { queue: songs(), queueIndex: 0, queueHistory: [], unshuffledQueue: null };
  withState(state, ['b', 'c']).shuffleQueue();
  assert.deepEqual(ids(state.queue.slice(4)).sort(), ['b', 'c']);
});

test('turning shuffle off puts the order back on the song playing, with added songs after', () => {
  const q = songs();
  const state = { queue: q, queueIndex: 2, queueHistory: [], unshuffledQueue: null };
  const { shuffleQueue, unshuffleQueue } = withState(state);
  shuffleQueue();
  state.queueIndex = 3;
  const playing = q[3];
  q.push({ id: 'g' });
  const [removed] = q.splice(5, 1);
  unshuffleQueue();
  assert.deepEqual(ids(q), ['a', 'b', 'c', 'd', 'e', 'f', 'g'].filter((id) => id !== removed.id));
  assert.equal(q[state.queueIndex], playing);
  assert.equal(state.unshuffledQueue, null);
});

test('a song in the queue twice stays twice', () => {
  const q = songs();
  const state = { queue: q, queueIndex: 0, queueHistory: [], unshuffledQueue: null };
  const { shuffleQueue, unshuffleQueue } = withState(state);
  shuffleQueue();
  q.push(q[2]);
  unshuffleQueue();
  assert.equal(q.length, 7);
  assert.deepEqual(ids(q.slice(0, 6)), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('a song counts as played the moment it starts, whatever queue it was in', () => {
  assert.match(app, /addEventListener\('playing', \(\) => \{\n      notePlayedThisSession\(state\.currentTrack\);/);
  assert.match(app, /sessionPlayed\.has\(getTrackCanonicalId\(t\)\) \|\| sessionPlayed\.has\(getTrackNormalizedKey\(t\.artist, t\.title\)\)/);
});

test('Next follows the queue order with shuffle on, it no longer picks at random', () => {
  assert.doesNotMatch(app, /pickShuffleIndex|planShuffleNext|shuffleBag/);
});
