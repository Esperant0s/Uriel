// M4A for saved downloads, without ffmpeg: YouTube's AAC (raw ADTS frames, see ts2aac.ts) goes into an MP4 box
// as it is, so nothing is re-encoded, and the song's title, artist, album and cover go in as iTunes tags (ilst).
// addIlst puts the same tags into an MP4 that's already one (SoundCloud's AAC).
import tags = require('../shared/audio-tags');

type Tags = import('../shared/audio-tags').Tags;
const { concat, utf8 } = tags;

const u16 = (n: number) => new Uint8Array([(n >>> 8) & 255, n & 255]);
const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const zeros = (n: number) => new Uint8Array(n);
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = concat(parts);
  return concat([u32(8 + body.length), utf8(type), body]);
};
// a "full box": version and flags first
const fullBox = (type: string, flags: number, ...parts: Uint8Array[]) => box(type, u32(flags), ...parts);
// "©nam" and the like: the © is one byte (0xA9), not UTF-8
const boxBytes = (type: Uint8Array, ...parts: Uint8Array[]) => {
  const body = concat(parts);
  return concat([u32(8 + body.length), type, body]);
};
const itunes = (name: string) => new Uint8Array([0xa9, ...utf8(name)]);

const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
const MATRIX = concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

interface Adts { rate: number; rateIndex: number; channels: number; profile: number; frames: Uint8Array[] }

// the AAC frames without their ADTS headers; anything between frames that isn't one (an ID3 tag) is skipped
function readAdts(b: Uint8Array): Adts {
  const frames: Uint8Array[] = [];
  let first: { profile: number; rateIndex: number; channels: number } | null = null;
  let p = 0;
  while (p + 7 <= b.length) {
    if (b[p] !== 0xff || (b[p + 1] & 0xf6) !== 0xf0) { p++; continue; }
    const headerLen = b[p + 1] & 1 ? 7 : 9;
    const len = ((b[p + 3] & 3) << 11) | (b[p + 4] << 3) | (b[p + 5] >> 5);
    if (len < headerLen || p + len > b.length) { p++; continue; }
    const profile = b[p + 2] >> 6;
    const rateIndex = (b[p + 2] >> 2) & 15;
    const channels = ((b[p + 2] & 1) << 2) | (b[p + 3] >> 6);
    if (!first) first = { profile, rateIndex, channels };
    // one raw block per frame is all MP4 can say; YouTube and every encoder we see write that
    if ((b[p + 6] & 3) !== 0) throw new Error('ADTS frames with several blocks');
    frames.push(b.subarray(p + headerLen, p + len));
    p += len;
  }
  if (!first || !frames.length || !RATES[first.rateIndex]) throw new Error('no AAC frames found');
  return { ...first, rate: RATES[first.rateIndex], frames };
}

function ilst(t: Tags) {
  const data = (type: number, value: Uint8Array) => box('data', u32(type), u32(0), value);
  const items: Uint8Array[] = [];
  if (t.title) items.push(boxBytes(itunes('nam'), data(1, utf8(String(t.title)))));
  if (t.artist) items.push(boxBytes(itunes('ART'), data(1, utf8(String(t.artist)))));
  if (t.album) items.push(boxBytes(itunes('alb'), data(1, utf8(String(t.album)))));
  if (Number(t.track) > 0) items.push(box('trkn', data(0, concat([u16(0), u16(Number(t.track)), u16(0), u16(0)]))));
  if (Number(t.year) > 0) items.push(boxBytes(itunes('day'), data(1, utf8(String(Number(t.year))))));
  if (t.cover) items.push(box('covr', data(t.cover.mime === 'image/png' ? 14 : 13, t.cover.data)));
  return box('ilst', ...items);
}

// moov/udta/meta: where iTunes, Android and every music app look for the tags
const udta = (t: Tags) => box('udta', fullBox('meta', 0,
  fullBox('hdlr', 0, u32(0), utf8('mdir'), utf8('appl'), zeros(9)),
  ilst(t)));

function adtsToM4a(adts: Uint8Array, t: Tags): Uint8Array {
  const a = readAdts(adts);
  const n = a.frames.length;
  const duration = n * 1024;
  // AudioSpecificConfig: object type (profile + 1), rate index, channels
  const asc = new Uint8Array([((a.profile + 1) << 3) | (a.rateIndex >> 1), ((a.rateIndex & 1) << 7) | (a.channels << 3)]);
  const desc = (tag: number, body: Uint8Array) => concat([new Uint8Array([tag, body.length]), body]);
  const esds = fullBox('esds', 0, desc(3, concat([u16(0), new Uint8Array([0]),
    desc(4, concat([new Uint8Array([0x40, 0x15]), zeros(3), u32(0), u32(0), desc(5, asc)])),
    desc(6, new Uint8Array([2]))])));
  const mp4a = box('mp4a', zeros(6), u16(1), zeros(8), u16(a.channels || 2), u16(16), zeros(4), u32((a.rate & 0xffff) * 0x10000), esds);
  const sizes = new Uint8Array(n * 4);
  let total = 0;
  a.frames.forEach((f, i) => { sizes.set(u32(f.length), i * 4); total += f.length; });

  const build = (offset: number) => {
    const stbl = box('stbl',
      fullBox('stsd', 0, u32(1), mp4a),
      fullBox('stts', 0, u32(1), u32(n), u32(1024)),
      fullBox('stsc', 0, u32(1), u32(1), u32(n), u32(1)),
      fullBox('stsz', 0, u32(0), u32(n), sizes),
      fullBox('stco', 0, u32(1), u32(offset)));
    const minf = box('minf', fullBox('smhd', 0, u32(0)), box('dinf', fullBox('dref', 0, u32(1), fullBox('url ', 1))), stbl);
    const mdia = box('mdia',
      fullBox('mdhd', 0, u32(0), u32(0), u32(a.rate), u32(duration), u16(0x55c4), u16(0)),
      fullBox('hdlr', 0, u32(0), utf8('soun'), zeros(12), utf8('SoundHandler'), zeros(1)),
      minf);
    // the movie's own times are in the song's sample rate too
    const tkhd = fullBox('tkhd', 7, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0x100), u16(0), MATRIX, u32(0), u32(0));
    const mvhd = fullBox('mvhd', 0, u32(0), u32(0), u32(a.rate), u32(duration), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(2));
    return box('moov', mvhd, box('trak', tkhd, mdia), udta(t));
  };
  const ftyp = box('ftyp', utf8('M4A '), u32(0), utf8('M4A '), utf8('mp42'), utf8('isom'));
  // moov goes first (players can start before reading to the end); its size doesn't depend on the offset
  const moov = build(ftyp.length + build(0).length + 8);
  const out = new Uint8Array(ftyp.length + moov.length + 8 + total);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  let at = ftyp.length + moov.length;
  out.set(u32(8 + total), at);
  out.set(utf8('mdat'), at + 4);
  at += 8;
  for (const f of a.frames) { out.set(f, at); at += f.length; }
  return out;
}

interface Box { type: string; start: number; size: number; head: number }

function boxesIn(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = from;
  while (p + 8 <= to) {
    let size = view.getUint32(p);
    let head = 8;
    if (size === 1) { size = Number(view.getBigUint64(p + 8)); head = 16; } else if (size === 0) size = to - p;
    if (size < head || p + size > to) break;
    out.push({ type: String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), start: p, size, head });
    p += size;
  }
  return out;
}

// The tags go into moov, which makes it longer: the chunk offsets (stco/co64) that point past it move by as much.
// Returns the file unchanged where that can't be done safely.
function addIlst(mp4: Uint8Array, t: Tags): Uint8Array {
  const top = boxesIn(mp4, 0, mp4.length);
  const moov = top.find((x) => x.type === 'moov');
  if (!moov || moov.head !== 8) return mp4;
  const kids = boxesIn(mp4, moov.start + 8, moov.start + moov.size);
  // fragments that give their data as an absolute position would point at the wrong bytes afterwards
  for (const moof of top.filter((x) => x.type === 'moof')) {
    for (const traf of boxesIn(mp4, moof.start + 8, moof.start + moof.size).filter((x) => x.type === 'traf')) {
      const tfhd = boxesIn(mp4, traf.start + 8, traf.start + traf.size).find((x) => x.type === 'tfhd');
      if (tfhd && mp4[tfhd.start + 11] & 1) return mp4;
    }
  }
  const keep = kids.filter((x) => x.type !== 'udta').map((x) => mp4.slice(x.start, x.start + x.size));
  const newMoov = box('moov', ...keep, udta(t));
  const grow = newMoov.length - moov.size;
  // data after moov moves; offsets into data before it (mdat first) stay as they are
  const shift = (offset: number) => (offset >= moov.start + moov.size ? offset + grow : offset);
  const fixOffsets = (b: Uint8Array, from: number, to: number) => {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (const x of boxesIn(b, from, to)) {
      if (['trak', 'mdia', 'minf', 'stbl'].includes(x.type)) fixOffsets(b, x.start + x.head, x.start + x.size);
      else if (x.type === 'stco') {
        const n = view.getUint32(x.start + 12);
        for (let i = 0; i < n; i++) view.setUint32(x.start + 16 + i * 4, shift(view.getUint32(x.start + 16 + i * 4)));
      } else if (x.type === 'co64') {
        const n = view.getUint32(x.start + 12);
        for (let i = 0; i < n; i++) {
          const at = x.start + 16 + i * 8;
          view.setBigUint64(at, BigInt(shift(Number(view.getBigUint64(at)))));
        }
      }
    }
  };
  fixOffsets(newMoov, 8, newMoov.length);
  return concat([mp4.subarray(0, moov.start), newMoov, mp4.subarray(moov.start + moov.size)]);
}

export = { adtsToM4a, addIlst, readAdts };
