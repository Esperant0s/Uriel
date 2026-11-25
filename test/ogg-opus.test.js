'use strict';

require('../tools/ts-require');

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { webmToOggOpus, packetSamples, oggCrc } = require('../mobile/ogg-opus.ts');
const { resolveBinary } = require('../desktop/platform');

const ffmpeg = resolveBinary('ffmpeg');

test('packetSamples reads the frame size and count from the first byte', () => {
  assert.equal(packetSamples(new Uint8Array([(31 << 3) | 0])), 960); // CELT 20 ms
  assert.equal(packetSamples(new Uint8Array([(16 << 3) | 1])), 240); // CELT 2.5 ms, two frames
  assert.equal(packetSamples(new Uint8Array([(3 << 3) | 3, 3])), 2880 * 3); // SILK 60 ms, three frames
});

test('oggCrc is the Ogg CRC-32 (not the reflected zlib one)', () => {
  assert.equal(oggCrc(new TextEncoder().encode('123456789')), 0x89a1897f);
});

test('a WebM from ffmpeg becomes an Ogg Opus that plays the same, with tags and cover', { skip: !ffmpeg && 'no ffmpeg' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-ogg-'));
  const webm = path.join(dir, 'a.webm');
  const made = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=3.3', '-ac', '2', '-c:a', 'libopus', '-b:a', '96k', '-f', 'webm', webm]);
  if (made.status !== 0) return t.skip('this ffmpeg has no libopus');
  const jpg = path.join(dir, 'c.jpg');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=16x16:d=1', '-frames:v', '1', jpg]);
  const out = path.join(dir, 'a.opus');
  // a big cover makes OpusTags span several pages
  const cover = { mime: 'image/jpeg', data: new Uint8Array(Buffer.concat([fs.readFileSync(jpg), Buffer.alloc(200000)])) };
  fs.writeFileSync(out, webmToOggOpus(new Uint8Array(fs.readFileSync(webm)), { title: 'Ça va', artist: 'Someone', album: 'Album', track: 2, cover }));
  const md5 = (f) => execFileSync(ffmpeg, ['-v', 'error', '-i', f, '-map', '0:a', '-f', 'md5', '-']).toString().trim();
  assert.equal(md5(out), md5(webm));
  // Ogg tags belong to the stream, not the file
  const meta = execFileSync(ffmpeg, ['-v', 'error', '-i', out, '-map_metadata', '0:s:a:0', '-f', 'ffmetadata', '-']).toString();
  assert.match(meta, /TITLE=Ça va/);
  assert.match(meta, /ALBUM=Album/);
  // ffmpeg checks every page's CRC and complains on stderr if one is wrong
  const check = spawnSync(ffmpeg, ['-v', 'error', '-i', out, '-f', 'null', '-']);
  assert.equal(check.stderr.toString(), '');
  fs.rmSync(dir, { recursive: true, force: true });
});
