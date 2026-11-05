'use strict';

// Deezer and Apple Music songs (ids dz_30879048, am_123) have no YouTube video yet: their url is a YouTube search
// page and the app finds the video when the song plays. Asking about one ahead of time (the home screen's warm-up,
// the next song in the queue, a download) used to hand yt-dlp watch?v=dz_30879048, which fails on every launch and
// can rest yt-dlp for the songs that do exist. yt-dlp is a fake script and YouTube search a canned page.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { PassThrough } = require('node:stream');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-catalog-'));
for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) process.env[key] = tmp;
process.env.URIEL_DATA_DIR = path.join(tmp, 'data');

const calls = path.join(tmp, 'yt-dlp-calls.txt');
const fake = path.join(tmp, 'yt-dlp');
fs.writeFileSync(fake, `#!/bin/sh
echo "$*" >> "${calls}"
for last; do :; done
case "$last" in
  *watch\\?v=REALsong*) echo "https://rr1.googlevideo.com/videoplayback?id=$last"; exit 0 ;;
  *) echo "ERROR: [youtube] $last: This video is unavailable" >&2; exit 1 ;;
esac
`);
fs.chmodSync(fake, 0o755);
process.env.URIEL_YTDLP = fake;
process.env.URIEL_FFMPEG = fake;

// every search finds one video, named after the query's first word; "nothing" finds none
const searches = [];
const video = (id) => ({ videoRenderer: { videoId: id, title: { runs: [{ text: 'A song' }] }, ownerText: { runs: [{ text: 'An artist' }] }, lengthText: { simpleText: '3:00' } } });
https.get = (target, opts, cb) => {
  if (typeof opts === 'function') cb = opts;
  const res = new PassThrough();
  res.statusCode = 200;
  res.headers = {};
  const req = new PassThrough();
  req.setTimeout = () => req;
  const q = String(target).includes('youtube.com/results') ? new URL(String(target)).searchParams.get('search_query') : null;
  if (q !== null) searches.push(q);
  const m = q && q.match(/REALsong\w*/);
  const items = m ? [video(m[0].padEnd(11, '0'))] : [];
  const page = `<html><script>var ytInitialData = ${JSON.stringify({ contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: items } }] } } } } })};</script></html>`;
  process.nextTick(() => { cb(res); res.end(q !== null ? page : ''); });
  return req;
};
// the fast YouTube lookup (yt-fast.js) posts to YouTube's player API: offline, so songs go through yt-dlp
https.request = () => {
  const req = new PassThrough();
  req.end = () => { process.nextTick(() => req.emit('error', new Error('offline'))); return req; };
  return req;
};

const { startServer, stopServer, getServerToken, _test: { youtubeExtractTarget } } = require('../server');
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
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}
const asked = () => { try { return fs.readFileSync(calls, 'utf-8'); } catch (_) { return ''; } };
const searchUrl = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
async function until(done, what) {
  for (let i = 0; i < 200; i++) {
    if (done()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`timed out waiting for ${what}; yt-dlp was asked:\n${asked()}`);
}
const songQuery = (o) => new URLSearchParams({ platform: 'youtube', title: 'A song', artist: 'An artist', duration: '180', ...o });

test('a catalogue id or a search page is not a YouTube video', () => {
  const song = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  // the same 11 characters a video id has, which is why yt-dlp answers "unavailable" and not "invalid"
  assert.equal(youtubeExtractTarget(searchUrl('a - b'), 'dz_30879048', 'youtube').unresolved, true);
  assert.equal(youtubeExtractTarget(searchUrl('a - b'), 'am_1440857781', 'youtube').unresolved, true);
  assert.equal(youtubeExtractTarget('', 'dz_308', 'youtube').unresolved, true);
  assert.equal(youtubeExtractTarget(searchUrl('a - b'), '', 'youtube').unresolved, true);
  // a real video still is, also when it was found for a catalogue song
  assert.deepEqual(youtubeExtractTarget(song, 'dz_30879048', 'youtube'), { url: song, youtube: true });
  assert.deepEqual(youtubeExtractTarget('', 'dQw4w9WgXcQ', 'youtube'), { url: song, youtube: true });
  assert.deepEqual(youtubeExtractTarget('https://soundcloud.com/a/b', 'dz_30879048', 'soundcloud'), { url: 'https://soundcloud.com/a/b', youtube: false });
  // a search for yt-dlp stays that search (a download without a video in mind)
  assert.equal(youtubeExtractTarget('ytsearch1:a b official audio', 'dz_30879048', 'youtube').url, 'ytsearch1:a b official audio');
  assert.equal(youtubeExtractTarget('ytsearch1:a b official audio', 'dl_0123456789ab', 'youtube').url, 'ytsearch1:a b official audio');
});

test('warming up a catalogue song looks up the video its search finds, ready for when it is played', { skip: process.platform === 'win32' }, async () => {
  const q = songQuery({ id: 'dz_30879048', url: searchUrl('REALsongOne official audio') });
  assert.equal((await get(`/api/prefetch?${q}`)).status, 200);
  await until(() => asked().includes('REALsongOne'), 'the lookup of the found video');
  assert.ok(!asked().includes('dz_'), asked());

  // the tap: the app searches too, then asks about the video the search found. No second yt-dlp run.
  const before = asked().length;
  const tap = await get(`/api/stream-info?${songQuery({ id: 'REALsongOne', url: 'https://www.youtube.com/watch?v=REALsongOne' })}`);
  assert.equal(tap.status, 200, tap.body);
  assert.ok(tap.body.includes('REALsongOne'), tap.body);
  assert.equal(asked().length, before, asked());
});

test('warming up a catalogue song nothing can be found for starts no yt-dlp at all', { skip: process.platform === 'win32' }, async () => {
  const already = asked().length;
  const seen = searches.length;
  const q = songQuery({ id: 'am_1440857781', url: searchUrl('nothing here official audio') });
  assert.equal((await get(`/api/prefetch?${q}`)).status, 200);
  await until(() => searches.length > seen, 'the search');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(asked().length, already, asked());
});

test('a catalogue id without a url is found by title and artist', { skip: process.platform === 'win32' }, async () => {
  const q = songQuery({ id: 'dz_77777777', url: '', title: 'REALsongTwo' });
  assert.equal((await get(`/api/prefetch?${q}`)).status, 200);
  await until(() => asked().includes('REALsongTwo'), 'the lookup of the found video');
  assert.ok(!asked().includes('dz_'), asked());
});

test('playing a catalogue song directly never asks yt-dlp about its id, so yt-dlp is not rested for other songs', { skip: process.platform === 'win32' }, async () => {
  // three failures in a row used to rest yt-dlp: the fourth song then skipped it
  for (const id of ['dz_11111111', 'dz_22222222', 'dz_33333333']) {
    const r = await get(`/api/stream-info?${songQuery({ id, url: searchUrl('nothing'), title: 'nothing' })}`);
    assert.equal(r.status, 500, r.body);
  }
  assert.ok(!asked().includes('dz_'), asked());
  const q = songQuery({ id: 'dz_44444444', url: searchUrl('x'), title: 'REALsongThree' });
  const r = await get(`/api/stream-info?${q}`);
  assert.equal(r.status, 200, r.body);
  assert.ok(r.body.includes('REALsongThr'), r.body);
  assert.ok(!asked().includes('dz_'), asked());
});

test('downloading a catalogue song searches for it instead of opening the search page or its id', { skip: process.platform === 'win32' }, async () => {
  const q = new URLSearchParams({ id: 'dz_55555555', url: searchUrl('An artist - A song official audio'), title: 'A song', artist: 'An artist' });
  await get(`/api/download?${q}`);
  const lines = asked().split('\n').filter((l) => l.includes('ytsearch1:An artist A song official audio'));
  assert.ok(lines.length, asked());
  assert.ok(!asked().includes('dz_'), asked());
  assert.ok(!asked().includes('youtube.com/results'), asked());
});
