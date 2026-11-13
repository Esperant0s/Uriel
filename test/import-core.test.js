'use strict';

// Importing from Spotify and Apple Music, the part with no page in it (shared/import-core.js): the export files,
// lengths, names tidied for matching, and what an import error means.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../shared/import-core');

test('a length is read as seconds, m:ss or milliseconds', () => {
  assert.equal(C.toSeconds('3:45'), 225);
  assert.equal(C.toSeconds('1:02:03'), 3723);
  assert.equal(C.toSeconds(225), 225);
  assert.equal(C.toSeconds('225'), 225);
  assert.equal(C.toSeconds(225000), 225, 'far more than a day of seconds: milliseconds');
  for (const junk of ['', 'abc', -5, 0, null, undefined]) assert.equal(C.toSeconds(junk), 0, String(junk));
});

test('a 20-minute track given in seconds stays 20 minutes (it was read as milliseconds: 1 second)', () => {
  assert.equal(C.toSeconds(1200), 1200);
  assert.equal(C.parseAppleDuration(1200), 1200);
  assert.equal(C.parseAppleDuration('1200'), 1200);
});

test("Apple's lengths: m:ss, seconds, or milliseconds when the field says so", () => {
  assert.equal(C.parseAppleDuration('3:45'), 225);
  assert.equal(C.parseAppleDuration('1:02:03'), 3723);
  assert.equal(C.parseAppleDuration(240000), 240);
  assert.equal(C.parseAppleDuration('1200', true), 1, 'a millisecond field is taken at its word');
  for (const none of [null, undefined, '', '  ', 'abc', '3:xx']) assert.equal(C.parseAppleDuration(none), undefined, String(none));
});

test('names are tidied the same way on both sides of a match', () => {
  assert.equal(C.normalizeImportText('Beyoncé – Halo (feat. Someone)'), 'beyonce halo');
  assert.equal(C.normalizeImportText('Song - Remastered 2011'), 'song');
  assert.equal(C.normalizeImportText('Track [2009 Remaster]'), 'track');
  assert.equal(C.normalizeImportText(''), '');
  assert.equal(C.normalizeForMatch('Кино - Группа крови'), 'kino gruppa krovi', 'Cyrillic is written out in Latin letters');
  assert.equal(C.normalizeForMatch('Song (Live) [HD]'), 'song');
  assert.equal(C.normalizeForMatch('Title feat. X and more'), 'title');
  assert.equal(C.normalizeForMatch('Café Déjà'), 'cafe deja');
});

test("Spotify's library file gives the liked songs", () => {
  const got = C.parseSpotifyExport({ tracks: [{ artist: ' A ', track: ' T ' }, null, { artist: '', track: 'no artist' }, { artist: 'B', track: 'U', durationMs: 200000 }] });
  assert.deepEqual(got.likes, [{ title: 'T', artist: 'A', duration: undefined }, { title: 'U', artist: 'B', duration: 200 }]);
  assert.deepEqual(got.playlists, []);
});

test("Spotify's playlist file gives each playlist that has songs", () => {
  const got = C.parseSpotifyExport({ playlists: [
    { name: 'Road', items: [{ track: { trackName: 'T', artistName: 'A', durationMs: 200000 } }, { episode: {} }, null] },
    { name: 'Empty', items: [] },
    { items: [{ track: { track: 'X', artist: 'Y' } }] },
  ] });
  assert.deepEqual(got.playlists, [
    { name: 'Road', tracks: [{ title: 'T', artist: 'A', duration: 200 }] },
    { name: 'Imported Playlist', tracks: [{ title: 'X', artist: 'Y', duration: undefined }] },
  ]);
});

test('a streaming history lists each song once, and how long it was played is not its length', () => {
  const got = C.parseSpotifyExport([
    { artistName: 'A', trackName: 'T', msPlayed: 5000 },
    { artistName: 'a', trackName: 't', msPlayed: 9 },
    { artistName: 'B', trackName: 'U', msPlayed: 180000 },
  ]);
  assert.equal(got.likes.length, 3);
  assert.deepEqual(C.uniqueSongs(got.likes), [{ title: 'T', artist: 'A', duration: undefined }, { title: 'U', artist: 'B', duration: undefined }]);
});

test('a file that is none of these gives nothing', () => {
  for (const other of [{}, { hello: 1 }, [], 'text', 5]) assert.deepEqual(C.parseSpotifyExport(other), { likes: [], playlists: [] });
});

test('CSV: quoted commas, doubled quotes, and tabs or semicolons between columns', () => {
  assert.deepEqual(C.parseAppleCSV('Title,Artist\n"Hello, World","The ""Band"""\nX,Y'), {
    headers: ['title', 'artist'],
    rows: [{ title: 'Hello, World', artist: 'The "Band"' }, { title: 'X', artist: 'Y' }],
  });
  assert.deepEqual(C.parseAppleCSV('Title\tArtist\r\nA\tB').rows, [{ title: 'A', artist: 'B' }]);
  assert.deepEqual(C.parseAppleCSV('Title;Artist\nA;B').rows, [{ title: 'A', artist: 'B' }]);
  assert.deepEqual(C.parseAppleCSV(''), { headers: [], rows: [] });
});

test("Apple Music's CSV: songs with a playlist go into it, the rest are liked songs", () => {
  const got = C.parseAppleExportCSV('Track Name,Artist Name,Duration in Milliseconds,Playlist Name\nSong1,Art1,240000,Road\nSong2,Art2,180000,\nNoArtist,,1,Road\nSong3,Art3,1200,Road');
  assert.deepEqual(got.likes, [{ title: 'Song2', artist: 'Art2', duration: 180 }]);
  assert.deepEqual(got.playlists, [{ name: 'Road', tracks: [{ title: 'Song1', artist: 'Art1', duration: 240 }, { title: 'Song3', artist: 'Art3', duration: 1 }] }]);
});

test("Apple Music's JSON: Apple's own key names, and playlists inside playlists of tracks", () => {
  const got = C.parseAppleExportJSON([
    { Title: 'S', Artist: 'A', 'Track Duration': '3:30' },
    { name: 'Mix', tracks: [{ name: 'T2', artistName: 'B', durationInMillis: 200000 }] },
    { name: 'Box', items: [{ title: 'T3', artist: 'C', duration: 1200 }] },
    { something: 'else' },
  ]);
  assert.deepEqual(got.likes, [{ title: 'S', artist: 'A', duration: 210 }]);
  assert.deepEqual(got.playlists, [
    { name: 'Mix', tracks: [{ title: 'T2', artist: 'B', duration: 200 }] },
    { name: 'Box', tracks: [{ title: 'T3', artist: 'C', duration: 1200 }] },
  ]);
});

test('an import error says what happened and what to try', () => {
  const code = (...a) => C.classifyImportError(...a).code;
  assert.equal(code('spotify', 403, {}), 'spotify_forbidden');
  assert.equal(code('spotify', 429, {}), 'spotify_rate_limited');
  assert.equal(code('spotify', 404, {}), 'spotify_not_found');
  assert.equal(code('spotify', 0, { code: 'spotify_incomplete' }), 'spotify_incomplete');
  assert.equal(code('link', 0, { code: 'yandex_region' }), 'yandex_region');
  assert.equal(code('apple', 404, ''), 'not_found');
  assert.equal(code('apple', 403, ''), 'private', 'elsewhere a refusal usually means a private playlist');
  assert.equal(code('link', new Error('search_unresponsive'), ''), 'search_unresponsive');
  assert.equal(code('link', new Error('boom'), ''), 'unknown');
  assert.equal(C.classifyImportError('apple', new Error('boom'), '').hint, 'Try the Export files method');
  assert.equal(C.classifyImportError('link', new Error('boom'), '').hint, 'Check the link');
});

test('offline, or a request that never got through, is a connection problem', () => {
  assert.equal(C.classifyImportError('spotify', new Error('boom'), '', false).code, 'network');
  assert.equal(C.classifyImportError('link', new Error('Failed to fetch'), '').code, 'network');
});

test('too many requests says how long to wait when the service does', () => {
  assert.equal(C.classifyImportError('link', 429, '').hint, 'Try again in a minute');
  assert.equal(C.classifyImportError('link', 429, 'Retry-After: 30').hint, 'Try again in 30s');
});

test('every error names one of the pictures app/imports.js has', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'shared/app/imports.js'), 'utf8');
  const have = new Set([...src.slice(src.indexOf('const IMPORT_ICONS = {'), src.indexOf('// what went wrong, with its picture')).matchAll(/^    (\w+): `<svg/gm)].map((m) => m[1]));
  assert.deepEqual([...have].sort(), ['clock', 'lock', 'network', 'restricted', 'search', 'unknown']);
  const cases = [['spotify', 403, {}], ['spotify', 429, {}], ['spotify', 404, {}], ['spotify', 0, { code: 'spotify_incomplete' }],
    ['link', 0, { code: 'yandex_region' }], ['link', 0, { code: 'yandex_private' }], ['link', 0, { code: 'yandex_failed' }],
    ['apple', 404, ''], ['apple', 403, ''], ['spotify', new Error('restricted'), ''], ['link', 429, ''],
    ['link', new Error('search_unresponsive'), ''], ['link', new Error('boom'), ''], ['link', new Error('boom'), '', false]];
  for (const c of cases) assert.ok(have.has(C.classifyImportError(...c).icon), JSON.stringify(c));
});
