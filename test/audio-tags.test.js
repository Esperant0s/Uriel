const test = require('node:test');
const assert = require('node:assert');
const { id3v23, vorbisComment, flacPicture, metadataBlockPicture } = require('../shared/audio-tags');

const cover = { mime: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]) };
const tags = { title: 'Ça va 日本', artist: 'Someone', album: 'Album', track: 3, year: 2021, cover };

function readId3(b) {
  assert.strictEqual(Buffer.from(b.subarray(0, 3)).toString(), 'ID3');
  assert.strictEqual(b[3], 3);
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
  assert.strictEqual(size, b.length - 10);
  const frames = {};
  for (let at = 10; at < b.length;) {
    const id = Buffer.from(b.subarray(at, at + 4)).toString();
    const n = Buffer.from(b.subarray(at + 4, at + 8)).readUInt32BE(0);
    frames[id] = b.subarray(at + 10, at + 10 + n);
    at += 10 + n;
  }
  return frames;
}

test('id3v23 writes text frames as UTF-16 and the cover as APIC', () => {
  const f = readId3(id3v23(tags));
  assert.strictEqual(f.TIT2[0], 1);
  assert.strictEqual(Buffer.from(f.TIT2.subarray(3)).toString('utf16le'), 'Ça va 日本');
  assert.strictEqual(Buffer.from(f.TPE1.subarray(3)).toString('utf16le'), 'Someone');
  assert.strictEqual(Buffer.from(f.TRCK.subarray(3)).toString('utf16le'), '3');
  assert.strictEqual(Buffer.from(f.TYER.subarray(3)).toString('utf16le'), '2021');
  const apic = Buffer.from(f.APIC);
  assert.strictEqual(apic.subarray(1, 11).toString(), 'image/jpeg');
  assert.deepStrictEqual([...apic.subarray(11, 14)], [0, 3, 0]);
  assert.deepStrictEqual([...apic.subarray(14)], [...cover.data]);
});

test('id3v23 leaves out fields that are not set', () => {
  const f = readId3(id3v23({ title: 'x' }));
  assert.deepStrictEqual(Object.keys(f), ['TIT2']);
});

test('vorbisComment lists the fields, with the cover only when asked', () => {
  const read = (b) => {
    const buf = Buffer.from(b);
    let at = 0;
    const vlen = buf.readUInt32LE(at); at += 4;
    const vendor = buf.subarray(at, at + vlen).toString(); at += vlen;
    const n = buf.readUInt32LE(at); at += 4;
    const list = [];
    for (let i = 0; i < n; i++) { const l = buf.readUInt32LE(at); at += 4; list.push(buf.subarray(at, at + l).toString()); at += l; }
    assert.strictEqual(at, buf.length);
    return { vendor, list };
  };
  const plain = read(vorbisComment('Uriel', tags));
  assert.strictEqual(plain.vendor, 'Uriel');
  assert.deepStrictEqual(plain.list, ['TITLE=Ça va 日本', 'ARTIST=Someone', 'ALBUM=Album', 'TRACKNUMBER=3', 'DATE=2021']);
  const withCover = read(vorbisComment('Uriel', tags, { withCover: true }));
  assert.strictEqual(withCover.list.length, 6);
  assert.strictEqual(withCover.list[5], `METADATA_BLOCK_PICTURE=${metadataBlockPicture(cover)}`);
});

test('flacPicture is a type 3 picture with the image at the end', () => {
  const b = Buffer.from(flacPicture(cover));
  assert.strictEqual(b.readUInt32BE(0), 3);
  assert.strictEqual(b.readUInt32BE(4), 10);
  assert.strictEqual(b.subarray(8, 18).toString(), 'image/jpeg');
  assert.strictEqual(b.readUInt32BE(38), cover.data.length);
  assert.deepStrictEqual([...b.subarray(42)], [...cover.data]);
});

// ffmpeg (the copy the app uses on the PC) reads the tags back; skipped where there is none
const { resolveBinary } = require('../desktop/platform');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ffmpeg = resolveBinary('ffmpeg');

test('ffmpeg reads the ID3 tags and cover of an MP3', { skip: !ffmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uriel-tags-'));
  const raw = path.join(dir, 'raw.mp3');
  const jpg = path.join(dir, 'c.jpg');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=1', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', raw]);
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=16x16:d=1', '-frames:v', '1', jpg]);
  const tagged = path.join(dir, 'tagged.mp3');
  fs.writeFileSync(tagged, Buffer.concat([id3v23({ ...tags, cover: { mime: 'image/jpeg', data: fs.readFileSync(jpg) } }), fs.readFileSync(raw)]));
  const meta = execFileSync(ffmpeg, ['-v', 'error', '-i', tagged, '-f', 'ffmetadata', '-']).toString();
  assert.match(meta, /title=Ça va 日本/);
  assert.match(meta, /album=Album/);
  assert.match(meta, /track=3/);
  // ffmpeg -i with no output lists the streams on stderr: the cover is a picture attached to the file
  const info = spawnSync(ffmpeg, ['-hide_banner', '-i', tagged]).stderr.toString();
  assert.match(info, /attached pic/);
  fs.rmSync(dir, { recursive: true, force: true });
});
