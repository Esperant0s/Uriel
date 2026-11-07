'use strict';

// A playlist song that is already on the device (local-match.js): matched by title, artist and length.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalIndex } = require('../shared/local-match');

const songs = [
  { id: 'local_000000000001', title: 'Get Lucky', artist: 'Daft Punk', duration: 248 },
  { id: 'local_000000000002', title: 'Yellow (Live)', artist: 'Coldplay', duration: 300 },
  { id: 'local_000000000003', title: 'Interlude', artist: 'Unknown artist', duration: 95 },
  { id: 'local_000000000004', title: 'Кукушка', artist: 'Кино', duration: 0 },
  { id: 'local_000000000005', title: 'Beyoncé Song', artist: 'Beyoncé', duration: 200 },
];
const index = createLocalIndex(songs);
const find = (t) => (index.find(t) || {}).id || null;

test('the same title and artist match, whatever the noise around them', () => {
  assert.equal(find({ title: 'Get Lucky', artist: 'Daft Punk', duration: 248 }), 'local_000000000001');
  assert.equal(find({ title: 'Get Lucky (Official Audio)', artist: 'Daft Punk', duration: 250 }), 'local_000000000001');
  assert.equal(find({ title: 'GET LUCKY (feat. Pharrell Williams)', artist: 'Daft Punk, Pharrell Williams', duration: 248 }), 'local_000000000001');
  assert.equal(find({ title: 'Daft Punk - Get Lucky', artist: 'DaftPunkVEVO', duration: 249 }), 'local_000000000001');
  assert.equal(find({ title: 'Daft Punk - Get Lucky', artist: 'Some Uploader', duration: 249 }), 'local_000000000001', '"Artist - Title" on another channel');
  assert.equal(find({ title: 'Beyonce Song', artist: 'Beyonce', duration: 201 }), 'local_000000000005', 'accents');
  assert.equal(find({ title: 'Kukushka', artist: 'Kino', duration: 260 }), 'local_000000000004', 'Cyrillic, and no length on the file');
});

test('another artist, another version or another length is not the same song', () => {
  assert.equal(find({ title: 'Get Lucky', artist: 'Someone Else', duration: 248 }), null);
  assert.equal(find({ title: 'Get Lucky (Remix)', artist: 'Daft Punk', duration: 248 }), null);
  assert.equal(find({ title: 'Get Lucky', artist: 'Daft Punk', duration: 369 }), null, 'the album version is two minutes longer');
  assert.equal(find({ title: 'Yellow', artist: 'Coldplay', duration: 300 }), null, 'the live version is not the original');
  assert.equal(find({ title: 'Yellow (Live)', artist: 'Coldplay', duration: 301 }), 'local_000000000002');
});

test('a file without an artist matches only on a close length', () => {
  assert.equal(find({ title: 'Interlude', artist: 'Anyone', duration: 96 }), 'local_000000000003');
  assert.equal(find({ title: 'Interlude', artist: 'Anyone', duration: 0 }), null);
  assert.equal(find({ title: 'Interlude', artist: 'Anyone', duration: 120 }), null);
});

test('nothing to match against', () => {
  assert.equal(createLocalIndex([]).find({ title: 'Get Lucky', artist: 'Daft Punk' }), null);
  assert.equal(index.find({ title: '', artist: 'Daft Punk' }), null);
  assert.equal(index.find(null), null);
});
