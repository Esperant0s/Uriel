// Android gets YouTube's Opus in a WebM file, which has no tags music apps read. Saved as a download it's moved
// into an Ogg file (.opus) as it is, packet for packet, with an OpusTags header holding the title, artist, album
// and cover. Nothing is re-encoded.
import audioTags = require('../shared/audio-tags');

type Tags = import('../shared/audio-tags').Tags;
const { concat, utf8 } = audioTags;

// ---- reading the WebM ----

// elements whose body is more elements: walked into instead of skipped (which also copes with "unknown size")
const CONTAINERS = new Set([0x18538067, 0x1654ae6b, 0xae, 0x1f43b675, 0xa0]);
const ID = { codecId: 0x86, codecPrivate: 0x63a2, trackNumber: 0xd7, simpleBlock: 0xa3, block: 0xa1, discardPadding: 0x75a2 };

interface Opus { head: Uint8Array; packets: Uint8Array[]; discardNs: number }

function readWebm(b: Uint8Array): Opus {
  let p = 0;
  // a variable-length number: the first byte's leading zeros say how long it is
  const vint = (keepMarker: boolean) => {
    const first = b[p];
    let len = 1;
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
    if (len > 8) throw new Error('bad WebM');
    let v = keepMarker ? first : first & (0xff >> len);
    let allOnes = v === (0xff >> len);
    for (let i = 1; i < len; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 0xff) allOnes = false; }
    p += len;
    return { v, unknown: !keepMarker && allOnes };
  };
  let head: Uint8Array | null = null;
  let codec = '';
  let track = 0;
  let opusTrack = 0;
  let discardNs = 0;
  const packets: Uint8Array[] = [];
  while (p < b.length) {
    const id = vint(true).v;
    const size = vint(false);
    if (CONTAINERS.has(id)) continue;
    if (size.unknown) throw new Error('bad WebM');
    const body = b.subarray(p, p + size.v);
    p += size.v;
    if (id === ID.trackNumber) track = body.reduce((n, x) => n * 256 + x, 0);
    else if (id === ID.codecId) codec = String.fromCharCode(...body);
    else if (id === ID.codecPrivate && codec === 'A_OPUS') { head = body; opusTrack = track; }
    else if (id === ID.discardPadding) discardNs = body.reduce((n, x) => n * 256 + x, 0);
    else if (id === ID.simpleBlock || id === ID.block) {
      // track number (a vint), 16-bit timecode, flags, then the frame
      const t = body[0] & 0x80 ? body[0] & 0x7f : -1;
      if (t !== (opusTrack || 1)) continue;
      if (body[3] & 0x06) throw new Error('laced WebM blocks');
      packets.push(body.subarray(4));
    }
  }
  if (!head || codec !== 'A_OPUS' || !packets.length) throw new Error('no Opus audio in this file');
  return { head, packets, discardNs };
}

// samples (at 48 kHz) in one Opus packet, from its first byte (RFC 6716, 3.1)
function packetSamples(pkt: Uint8Array) {
  const config = pkt[0] >> 3;
  const per = config < 12 ? [480, 960, 1920, 2880][config & 3]
    : config < 16 ? [480, 960][config & 1]
      : [120, 240, 480, 960][config & 3];
  const code = pkt[0] & 3;
  const frames = code === 0 ? 1 : code === 3 ? pkt[1] & 0x3f : 2;
  return per * frames;
}

// ---- writing the Ogg ----

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();
function oggCrc(b: Uint8Array) {
  let c = 0;
  for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 255]) >>> 0;
  return c;
}

function oggWriter() {
  const serial = (Math.random() * 0x100000000) >>> 0;
  const out: Uint8Array[] = [];
  let seq = 0;
  let segs: number[] = [];
  let body: Uint8Array[] = [];
  let granule = -1; // where the last packet that ends on this page ends; -1: none does
  let continued = false;

  const flush = (flags = 0) => {
    if (!segs.length) return;
    const h = new Uint8Array(27 + segs.length);
    const v = new DataView(h.buffer);
    h.set(utf8('OggS'));
    h[5] = (continued ? 1 : 0) | flags | (seq === 0 ? 2 : 0);
    v.setUint32(6, granule < 0 ? 0xffffffff : granule % 0x100000000, true);
    v.setUint32(10, granule < 0 ? 0xffffffff : Math.floor(granule / 0x100000000), true);
    v.setUint32(14, serial, true);
    v.setUint32(18, seq++, true);
    h[26] = segs.length;
    h.set(segs, 27);
    const page = concat([h, ...body]);
    new DataView(page.buffer).setUint32(22, oggCrc(page), true);
    out.push(page);
    segs = []; body = []; granule = -1; continued = false;
  };

  // a packet goes in as lacing values of 255 and one under 255 (0 when its length is a multiple of 255);
  // a page holds 255 of them, so a big one (OpusTags with a cover) carries on over the next pages
  const add = (pkt: Uint8Array, endsAt: number) => {
    let at = 0;
    for (;;) {
      if (segs.length === 255) {
        const midPacket = at > 0;
        flush();
        continued = midPacket;
      }
      const n = Math.min(255, pkt.length - at);
      segs.push(n);
      body.push(pkt.subarray(at, at + n));
      at += n;
      if (n < 255) { granule = endsAt; return; }
    }
  };
  return { add, flush, bytes: () => concat(out) };
}

function webmToOggOpus(webm: Uint8Array, t: Tags): Uint8Array {
  const opus = readWebm(webm);
  const w = oggWriter();
  // OpusHead alone on the first page, OpusTags from the second, then the audio on pages of their own
  w.add(opus.head, 0);
  w.flush();
  w.add(concat([utf8('OpusTags'), audioTags.vorbisComment('Uriel', t, { withCover: true })]), 0);
  w.flush();
  const total = opus.packets.reduce((n, pkt) => n + packetSamples(pkt), 0);
  // the encoder's padding at the end: the last page's position says where the song really stops
  const end = total - Math.round(opus.discardNs * 48000 / 1e9);
  let at = 0;
  let sincePage = 0;
  opus.packets.forEach((pkt, i) => {
    at += packetSamples(pkt);
    w.add(pkt, i === opus.packets.length - 1 ? Math.min(at, end) : at);
    sincePage += packetSamples(pkt);
    // about a second of audio per page
    if (sincePage >= 48000 && i < opus.packets.length - 1) { w.flush(); sincePage = 0; }
  });
  w.flush(4);
  return w.bytes();
}

export = { webmToOggOpus, readWebm, packetSamples, oggCrc };
