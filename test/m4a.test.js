'use strict';

require('../tools/ts-require');

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { adtsToM4a, addIlst, readAdts } = require('../mobile/m4a.ts');
const { resolveBinary } = require('../desktop/platform');

const ffmpeg = resolveBinary('ffmpeg');
const tags = { title: 'Ça va', artist: 'Someone', album: 'Album', track: 4, year: 2020 };

// a fake ADTS stream: LC, 44.1 kHz, stereo, frames of the given payload sizes, with an ID3 tag in front
function fakeAdts(sizes) {
  const parts = [Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0, 0])];
  for (const n of sizes) {
    const len = n + 7;
    parts.push(Buffer.from([0xff, 0xf1, (1 << 6) | (4 << 2), (2 << 6) | (len >> 11), (len >> 3) & 255, ((len & 7) << 5) | 0x1f, 0xfc]), Buffer.alloc(n, 7));
  }
  return new Uint8Array(Buffer.concat(parts));
}

function boxes(b, from = 0, to = b.length) {
  const out = {};
  for (let p = from; p + 8 <= to;) {
    const size = b.readUInt32BE(p);
    out[b.subarray(p + 4, p + 8).toString('latin1')] = { start: p, size };
    p += size;
  }
  return out;
}

test('adtsToM4a: one sample per frame, stco points at the first one, tags in moov', () => {
  const out = Buffer.from(adtsToM4a(fakeAdts([100, 200, 50]), tags));
  const top = boxes(out);
  assert.deepEqual(Object.keys(top), ['ftyp', 'moov', 'mdat']);
  assert.equal(top.mdat.size, 8 + 350);
  const stsz = out.indexOf('stsz');
  assert.equal(out.readUInt32BE(stsz + 12), 3);
  assert.deepEqual([out.readUInt32BE(stsz + 16), out.readUInt32BE(stsz + 20), out.readUInt32BE(stsz + 24)], [100, 200, 50]);
  const stco = out.indexOf('stco');
  assert.equal(out.readUInt32BE(stco + 12), top.mdat.start + 8);
  assert.ok(out.indexOf(Buffer.from([0xa9, ...Buffer.from('nam')])) > 0);
  assert.ok(out.indexOf('trkn') > 0);
});

test('readAdts refuses something that is not AAC', () => {
  assert.throws(() => readAdts(new Uint8Array(100)), /no AAC frames/);
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-m4a-')); }
const meta = (f) => execFileSync(ffmpeg, ['-v', 'error', '-i', f, '-f', 'ffmetadata', '-']).toString();
const md5 = (f) => execFileSync(ffmpeg, ['-v', 'error', '-i', f, '-map', '0:a', '-f', 'md5', '-']).toString().trim();
const coverJpg = (dir) => {
  const jpg = path.join(dir, 'c.jpg');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=16x16:d=1', '-frames:v', '1', jpg]);
  return { mime: 'image/jpeg', data: new Uint8Array(fs.readFileSync(jpg)) };
};

test('ffmpeg plays an M4A made from ADTS the same, and reads its tags and cover', { skip: !ffmpeg && 'no ffmpeg' }, () => {
  const dir = tmp();
  const aac = path.join(dir, 'a.aac');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=3', '-ac', '2', '-c:a', 'aac', '-f', 'adts', aac]);
  const m4a = path.join(dir, 'a.m4a');
  fs.writeFileSync(m4a, adtsToM4a(new Uint8Array(fs.readFileSync(aac)), { ...tags, cover: coverJpg(dir) }));
  assert.equal(md5(m4a), md5(aac));
  const m = meta(m4a);
  assert.match(m, /title=Ça va/);
  assert.match(m, /album=Album/);
  assert.match(m, /track=4/);
  assert.match(spawnSync(ffmpeg, ['-hide_banner', '-i', m4a]).stderr.toString(), /attached pic/);
  fs.rmSync(dir, { recursive: true, force: true });
});

for (const [name, flags] of [['moov at the end', []], ['moov first', ['-movflags', '+faststart']], ['fragmented', ['-movflags', 'frag_keyframe+empty_moov+default_base_moof']]]) {
  test(`addIlst tags an existing M4A (${name}) without changing its audio`, { skip: !ffmpeg && 'no ffmpeg' }, () => {
    const dir = tmp();
    const src = path.join(dir, 'src.m4a');
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=3', '-c:a', 'aac', ...flags, src]);
    const out = path.join(dir, 'out.m4a');
    fs.writeFileSync(out, addIlst(new Uint8Array(fs.readFileSync(src)), tags));
    assert.equal(md5(out), md5(src));
    assert.match(meta(out), /artist=Someone/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
