'use strict';

// Downloads on the PC get the app's title, artist, album, track number and cover, whatever format they're in.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveBinary } = require('../desktop/platform');

const ffmpeg = resolveBinary('ffmpeg');

test('retagDownload sets the tags and cover of every format', { skip: !ffmpeg && 'no ffmpeg' }, async (t) => {
  const { retagDownload } = require('../shared/server')._test;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-retag-'));
  const cover = path.join(dir, 'c.jpg');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=16x16:d=1', '-frames:v', '1', cover]);
  for (const [ext, codec] of [['mp3', 'libmp3lame'], ['m4a', 'aac'], ['flac', 'flac'], ['opus', 'libopus']]) {
    const file = path.join(dir, `a.${ext}`);
    if (spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=1', '-c:a', codec, '-metadata', 'title=Video title', file]).status !== 0) {
      t.diagnostic(`no ${codec} in this ffmpeg`);
      continue;
    }
    await retagDownload(file, { title: 'Song', artist: 'Someone', album: 'Album', track: '3', year: '2020' }, cover);
    // Ogg keeps its tags on the stream
    const meta = execFileSync(ffmpeg, ['-v', 'error', '-i', file, ...(ext === 'opus' ? ['-map_metadata', '0:s:a:0'] : []), '-f', 'ffmetadata', '-']).toString();
    assert.match(meta, /title=Song/i, ext);
    assert.match(meta, /album=Album/i, ext);
    assert.match(spawnSync(ffmpeg, ['-hide_banner', '-i', file]).stderr.toString(), /attached pic/, `${ext} has a cover`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
