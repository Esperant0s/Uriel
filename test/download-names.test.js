'use strict';

// Two different songs with the same "Artist - Title" no longer share one file, and a download counts as there
// only for the song it was saved for.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('a different song with a taken name gets "(2)", the same song keeps its name', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-names-data-'));
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-names-dl-'));
  process.env.URIEL_DATA_DIR = data;
  require('../desktop/platform').setDownloadDir(dl);
  const t = require('../shared/server')._test;
  fs.writeFileSync(path.join(dl, 'Someone - Song.mp3'), 'x');
  // a file from before (nobody knows whose it is) is taken to be this song's
  assert.equal(await t.downloadBase('Someone - Song', 'aaa'), 'Someone - Song');
  t.rememberDownload('Someone - Song.mp3', 'aaa');
  assert.equal(await t.downloadBase('Someone - Song', 'aaa'), 'Someone - Song');
  assert.equal(await t.downloadBase('Someone - Song', 'bbb'), 'Someone - Song (2)');
  assert.equal(await t.isDownloaded('Song', 'Someone', 'aaa'), true);
  assert.equal(await t.isDownloaded('Song', 'Someone', 'bbb'), false);
});
