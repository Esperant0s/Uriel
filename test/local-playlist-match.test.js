'use strict';

// A playlist song that is already on the device plays from that file and counts as available offline
// (server.js findLocalSong, local-match.js): the computer's Music folder, and the list a phone hands over.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-localmatch-'));
for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME']) process.env[key] = tmp;
process.env.URIEL_DATA_DIR = path.join(tmp, 'data');
const music = path.join(tmp, 'Music');
fs.mkdirSync(music, { recursive: true });
fs.writeFileSync(path.join(music, 'Daft Punk - Get Lucky.mp3'), Buffer.alloc(4000, 1));

const { startServer, stopServer, getServerToken, rescanDeviceMusic, setDeviceSongs } = require('../shared/server');
const lib = require('../shared/device-library');
let port;
test.before(async () => { port = await startServer(0); });
test.after(async () => { await stopServer(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = (route, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: route, method: body ? 'POST' : 'GET', headers: { 'x-uriel-token': getServerToken(), 'Content-Type': 'application/json' } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject);
  req.end(body ? JSON.stringify(body) : undefined);
});
const json = async (route, body) => JSON.parse((await call(route, body)).body);
const streamInfo = (t) => json(`/api/stream-info?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${t.id}`)}&id=${t.id}&platform=youtube&title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}&duration=${t.duration || 0}`);
const status = (tracks, filesOnly) => json('/api/downloaded-status', { tracks, filesOnly });

const lucky = { id: 'h5EofwRzit0', title: 'Get Lucky (Official Audio)', artist: 'Daft Punk', duration: 248 };
const other = { id: 'aaaaaaaaaaa', title: 'Get Lucky', artist: 'Someone Else', duration: 248 };

test('a playlist song in the Music folder plays from the file and counts as downloaded', async () => {
  await rescanDeviceMusic();
  const before = (await json('/api/device-music')).localVersion;
  const info = await streamInfo(lucky);
  assert.equal(info.success, true);
  assert.equal(info.isLocal, true);
  const id = lib.idFor('Daft Punk - Get Lucky.mp3', 4000);
  assert.equal(info.localId, id);
  assert.match(info.streamUrl, new RegExp(`/api/library-file\\?id=${id}`));
  const file = await call(new URL(info.streamUrl).pathname + new URL(info.streamUrl).search);
  assert.equal(file.status, 200);
  assert.equal(file.body.length, 4000);

  const st = await status([lucky, other]);
  assert.deepEqual(st.downloaded, [true, false]);
  assert.deepEqual((await status([lucky, other], true)).downloaded, [true, false], '"Download all" skips it too');
  assert.equal(st.localVersion, before);
});

test('songs a phone hands over match as well, and the version changes with them', async () => {
  const before = (await json('/api/device-music')).localVersion;
  setDeviceSongs([{ id: 'local_0123456789ab', vpath: '/device/storage/emulated/0/Music/song.m4a', ext: 'm4a', title: 'Halo', artist: 'Beyoncé', duration: 261, source: 'device' }]);
  const after = await status([{ id: 'bbbbbbbbbbb', title: 'Halo', artist: 'Beyonce', duration: 263 }, lucky]);
  assert.deepEqual(after.downloaded, [true, false], 'the Music folder song is gone from this list');
  assert.notEqual(after.localVersion, before);
});

test('with "Find music on this device" off, nothing matches', async () => {
  await call('/api/device-music', { enabled: false });
  assert.deepEqual((await status([lucky])).downloaded, [false]);
  await call('/api/device-music', { enabled: true });
  assert.deepEqual((await status([lucky])).downloaded, [true]);
});
