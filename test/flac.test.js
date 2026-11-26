'use strict';

require('../tools/ts-require');

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeFlac } = require('../mobile/flac.ts');
const { resolveBinary } = require('../desktop/platform');

const ffmpeg = resolveBinary('ffmpeg');

function signals(n) {
  const sine = new Int16Array(n);
  const noise = new Int16Array(n);
  const square = new Int16Array(n);
  let seed = 1;
  for (let i = 0; i < n; i++) {
    sine[i] = Math.round(12000 * Math.sin(i / 20));
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = (seed % 65536) - 32768;
    square[i] = (i >> 7) & 1 ? 32767 : -32768;
  }
  return { sine, noise, square, silence: new Int16Array(n) };
}

test('the stream starts with fLaC and a STREAMINFO block that knows the length', () => {
  const s = signals(5000);
  const out = Buffer.from(encodeFlac([s.sine, s.noise], 44100, { title: 'x' }));
  assert.equal(out.subarray(0, 4).toString(), 'fLaC');
  assert.equal(out[4] & 0x7f, 0);
  assert.equal(out.readUIntBE(5, 3), 34);
  const info = out.subarray(8, 8 + 34);
  assert.equal(info.readUInt16BE(0), 4096);
  // 20-bit rate, 3-bit channels - 1, 5-bit bits - 1, 36-bit total samples
  assert.equal(info.readUIntBE(10, 3) >> 4, 44100);
  assert.equal((info[12] >> 1) & 7, 1);
  assert.equal(info.readUInt32BE(14), 5000);
});

test('ffmpeg decodes it back to the exact samples, and reads its tags', { skip: !ffmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-flac-'));
  // a short last block, every kind of signal, mono and stereo
  const n = 4096 * 3 + 1234;
  const s = signals(n);
  const jpg = path.join(dir, 'c.jpg');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=16x16:d=1', '-frames:v', '1', jpg]);
  const cover = { mime: 'image/jpeg', data: new Uint8Array(fs.readFileSync(jpg)) };
  for (const [name, chans] of [['mono sine', [s.sine]], ['noise and silence', [s.noise, s.silence]], ['square and sine', [s.square, s.sine]], ['same both sides', [s.sine, s.sine]]]) {
    const file = path.join(dir, 'a.flac');
    fs.writeFileSync(file, encodeFlac(chans, 48000, { title: 'Ça va', album: 'Album', track: 7, cover }));
    const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
    const want = Buffer.alloc(n * chans.length * 2);
    for (let i = 0; i < n; i++) chans.forEach((c, ch) => want.writeInt16LE(c[i], (i * chans.length + ch) * 2));
    assert.ok(pcm.equals(want), `${name}: samples differ`);
    // a bad frame CRC is only a complaint on stderr
    assert.equal(spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-']).stderr.toString(), '', name);
    const meta = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'ffmetadata', '-']).toString();
    assert.match(meta, /TITLE=Ça va|title=Ça va/);
    assert.match(meta, /track=7|TRACKNUMBER=7/i);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// frame numbers from 128 on take two bytes, from 2048 three: a real song's length, not a short clip
test('a long song decodes back to the exact samples too', { skip: !ffmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-flac-'));
  const n = 4096 * 2100 + 77;
  const { sine } = signals(n);
  const file = path.join(dir, 'long.flac');
  fs.writeFileSync(file, encodeFlac([sine], 44100, {}));
  assert.equal(spawnSync(ffmpeg, ['-v', 'error', '-threads', '1', '-i', file, '-f', 'null', '-']).stderr.toString(), '');
  const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
  assert.ok(pcm.equals(Buffer.from(sine.buffer, sine.byteOffset, sine.byteLength)), 'samples differ');
  fs.rmSync(dir, { recursive: true, force: true });
});
