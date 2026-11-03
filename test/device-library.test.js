'use strict';

// Music already on the device (device-library.js, server.js): found in the Music and downloads folders, listed in
// the library, played from where it is, and never deleted when taken out of the library.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mural-device-'));
for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME']) process.env[key] = tmp;
process.env.MURIEL_DATA_DIR = path.join(tmp, 'data');
const music = path.join(tmp, 'Music');
const put = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.alloc(bytes, 1)); };
put(path.join(music, 'Daft Punk - Get Lucky.mp3'), 4000);
put(path.join(music, 'Albums', 'Random Access Memories', '01 - Daft Punk - Give Life Back to Music.flac'), 5000);
put(path.join(music, 'notes.txt'), 10);
put(path.join(music, '.hidden', 'secret.mp3'), 10);

const lib = require('../device-library');

test('a found song gets the id an import of the same file gets', () => {
  assert.equal(lib.idFor('Daft Punk - Get Lucky.mp3', 4000), lib.songFromFile('/x/Daft Punk - Get Lucky.mp3', 4000, 'music').id);
  assert.deepEqual(lib.titleFromName('01 - Daft Punk - Give Life Back to Music'), { artist: 'Daft Punk', title: 'Give Life Back to Music' });
  assert.deepEqual(lib.titleFromName('Interlude'), { artist: 'Unknown artist', title: 'Interlude' });
  assert.equal(lib.songFromFile('/x/notes.txt', 10, 'music'), null);
});

test('folders are scanned deep or only at the top, without hidden folders', async () => {
  const deep = await lib.scanFolders([{ dir: music, deep: true, source: 'music' }]);
  assert.deepEqual(deep.map((s) => s.title).sort(), ['Get Lucky', 'Give Life Back to Music']);
  const top = await lib.scanFolders([{ dir: music, deep: false, source: 'downloads' }]);
  assert.deepEqual(top.map((s) => s.title), ['Get Lucky']);
  assert.equal(top[0].source, 'downloads');
});

const { startServer, stopServer, getServerToken, rescanDeviceMusic } = require('../server');
let port;
test.before(async () => { port = await startServer(0); });
test.after(async () => { await stopServer(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = (route, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: route, method: body ? 'POST' : 'GET', headers: { 'x-muriel-token': getServerToken(), 'Content-Type': 'application/json' } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject);
  req.end(body ? JSON.stringify(body) : undefined);
});
const library = async () => JSON.parse((await call('/api/library')).body);

test('songs in the Music folder show up in the library and play from where they are', async () => {
  await rescanDeviceMusic();
  const songs = await library();
  const lucky = songs.find((s) => s.title === 'Get Lucky');
  assert.ok(lucky, 'found');
  assert.equal(lucky.source, 'music');
  assert.equal(lucky.platform, 'local');
  const file = await call(`/api/library-file?id=${lucky.id}`);
  assert.equal(file.status, 200);
  assert.equal(file.body.length, 4000);
  assert.ok(fs.existsSync(path.join(music, 'Daft Punk - Get Lucky.mp3')), 'nothing copied or moved');
  assert.equal(fs.existsSync(path.join(process.env.MURIEL_DATA_DIR, 'library', `${lucky.id}.mp3`)), false);
  const status = JSON.parse((await call('/api/device-music')).body);
  assert.equal(status.enabled, true);
  assert.equal(status.count, 2);
  assert.ok(status.folders.includes(music));
});

test('taking a found song out of the library keeps the file, and it stays out after a rescan', async () => {
  const lucky = (await library()).find((s) => s.title === 'Get Lucky');
  assert.equal((await call('/api/library-remove', { id: lucky.id })).status, 200);
  assert.ok(fs.existsSync(path.join(music, 'Daft Punk - Get Lucky.mp3')), 'the file is never deleted');
  await rescanDeviceMusic();
  assert.equal((await library()).some((s) => s.id === lucky.id), false);
  await call('/api/device-music', { unhide: true });
  assert.equal((await library()).some((s) => s.id === lucky.id), true, '"show removed songs again" brings it back');
});

test('turning it off empties the found songs', async () => {
  await call('/api/device-music', { enabled: false });
  assert.equal((await library()).length, 0);
  assert.equal((await call(`/api/library-file?id=${lib.idFor('Daft Punk - Get Lucky.mp3', 4000)}`)).status, 404);
  await call('/api/device-music', { enabled: true });
  assert.equal((await library()).length, 2);
});
