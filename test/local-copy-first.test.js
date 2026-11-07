'use strict';

// A song already on this device plays from there without any online search. A Deezer or Apple Music song (id
// dz_..., url a YouTube search page) was searched for first, every time: slow, and impossible offline, because its
// copy is saved under the video's id. Every YouTube search here is counted, and the saved song is a real file.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { PassThrough } = require('node:stream');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-local-first-'));
for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) process.env[key] = tmp;
process.env.URIEL_DATA_DIR = path.join(tmp, 'data');

const searches = [];
https.get = (target, opts, cb) => {
  if (typeof opts === 'function') cb = opts;
  const res = new PassThrough();
  res.statusCode = 200;
  res.headers = {};
  const req = new PassThrough();
  req.setTimeout = () => req;
  if (String(target).includes('youtube.com/results')) searches.push(String(target));
  process.nextTick(() => { cb(res); res.end(''); });
  return req;
};
https.request = () => {
  const req = new PassThrough();
  req.end = () => { process.nextTick(() => req.emit('error', new Error('offline'))); return req; };
  return req;
};

// a song saved earlier: its first play found the video, and the copy is kept under that video's id
const { CACHE_DIR, METADATA_PATH } = require('../desktop/platform');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.writeFileSync(path.join(CACHE_DIR, 'SAVEDvideo1.opus'), Buffer.alloc(70000));
fs.writeFileSync(METADATA_PATH, JSON.stringify({ SAVEDvideo1: { id: 'SAVEDvideo1', title: 'Saved Song', artist: 'Some Artist', duration: '180', platform: 'youtube' } }));

const { startServer, stopServer, getServerToken } = require('../shared/server');
let port;
before(async () => { port = await startServer(0); });
after(async () => {
  await stopServer();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function get(route) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: route, headers: { 'x-uriel-token': getServerToken() } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, data: null }); } });
    }).on('error', reject);
  });
}
const searchPage = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const ask = (o, extra = '') => get(`/api/stream-info?${new URLSearchParams({ platform: 'youtube', ...o })}${extra}`);

const saved = { id: 'dz_30879048', url: searchPage('Some Artist - Saved Song official audio'), title: 'Saved Song', artist: 'Some Artist', duration: '180' };

test('a Deezer song saved under its video plays from that file, with no search', async () => {
  const r = await ask(saved, '&localOnly=1');
  assert.equal(r.data.isLocal, true, JSON.stringify(r.data));
  assert.ok(r.data.streamUrl.includes('/api/local-track?id=SAVEDvideo1'), r.data.streamUrl);
  // and so does the ordinary question, which a retry asks
  const plain = await ask(saved);
  assert.ok(plain.data.streamUrl.includes('/api/local-track?id=SAVEDvideo1'), plain.data.streamUrl);
  assert.equal(searches.length, 0, searches.join('\n'));
});

test('an Apple Music song without a length still finds it', async () => {
  const r = await ask({ ...saved, id: 'am_1440857781', duration: '0' }, '&localOnly=1');
  assert.ok(r.data.streamUrl.includes('/api/local-track?id=SAVEDvideo1'), JSON.stringify(r.data));
});

test('warming up a saved song searches for nothing', async () => {
  assert.equal((await get(`/api/prefetch?${new URLSearchParams({ platform: 'youtube', ...saved })}`)).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(searches.length, 0, searches.join('\n'));
});

test('a song not on this device: the local-only question says so and goes online for nothing', async () => {
  const r = await ask({ ...saved, id: 'dz_1', title: 'Not Saved' }, '&localOnly=1');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { success: false, notLocal: true });
  assert.equal(searches.length, 0, searches.join('\n'));
});

test('another version or artist or length is not the saved copy', async () => {
  for (const other of [{ title: 'Saved Song (Live)' }, { artist: 'Someone Else' }, { duration: '300' }]) {
    const r = await ask({ ...saved, id: 'dz_2', ...other }, '&localOnly=1');
    assert.equal(r.data.success, false, JSON.stringify(other));
  }
});

test('a song picked by its video does not swap to another upload of it', async () => {
  const r = await ask({ ...saved, id: 'OTHERvideo1', url: 'https://www.youtube.com/watch?v=OTHERvideo1' }, '&localOnly=1');
  assert.equal(r.data.success, false);
});

test('a saved song whose file is gone is not offered', async () => {
  fs.rmSync(path.join(CACHE_DIR, 'SAVEDvideo1.opus'));
  const r = await ask(saved, '&localOnly=1');
  assert.equal(r.data.success, false);
});
