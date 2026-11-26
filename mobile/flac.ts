// A small FLAC encoder for downloads on the phone (there's no ffmpeg there). 16-bit samples in blocks of 4096,
// each channel predicted with FLAC's fixed predictors (order 0-4) and the rest Rice coded; stereo is also tried as
// mid/side. Files come out a bit bigger than libFLAC's, which doesn't matter here: the source is lossy anyway.
// test/flac.test.js checks with ffmpeg that it decodes back to the exact samples.
import audioTags = require('../shared/audio-tags');

type Tags = import('../shared/audio-tags').Tags;

const BLOCK = 4096;

class Bits {
  buf = new Uint8Array(1 << 20);
  len = 0; // whole bytes written
  private acc = 0;
  private n = 0; // bits waiting in acc (under 8 between calls)

  private byte(b: number) {
    if (this.len === this.buf.length) {
      const bigger = new Uint8Array(this.buf.length * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    this.buf[this.len++] = b;
  }

  // up to 24 bits at a time keeps acc inside 32 bits
  write(v: number, bits: number) {
    while (bits > 24) {
      bits -= 24;
      this.write(Math.floor(v / 2 ** bits) & 0xffffff, 24);
    }
    this.acc = ((this.acc << bits) | (v & ((1 << bits) - 1))) >>> 0;
    this.n += bits;
    while (this.n >= 8) {
      this.n -= 8;
      this.byte((this.acc >>> this.n) & 255);
    }
    this.acc &= (1 << this.n) - 1;
  }

  zeros(count: number) {
    while (count > 24) { this.write(0, 24); count -= 24; }
    this.write(0, count);
  }

  align() { if (this.n) this.write(0, 8 - this.n); }

  bytes(from = 0, to = this.len) { return this.buf.subarray(from, to); }
}

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255;
  CRC8[i] = c;
  let d = i << 8;
  for (let j = 0; j < 8; j++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff;
  CRC16[i] = d;
}
const crc8 = (b: Uint8Array) => b.reduce((c, x) => CRC8[c ^ x], 0);
const crc16 = (b: Uint8Array) => b.reduce((c, x) => ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ x], 0);

// what's left after fixed predictor `order` (FLAC's orders 0-4) guesses each sample from the ones before
function residual(x: Int32Array, order: number): Int32Array {
  const n = x.length;
  const r = new Int32Array(n - order);
  for (let i = order; i < n; i++) {
    let v: number;
    if (order === 0) v = x[i];
    else if (order === 1) v = x[i] - x[i - 1];
    else if (order === 2) v = x[i] - 2 * x[i - 1] + x[i - 2];
    else if (order === 3) v = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3];
    else v = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
    r[i - order] = v;
  }
  return r;
}

const zigzag = (e: number) => (e >= 0 ? 2 * e : -2 * e - 1);

// Rice cost of n residuals that add up to `sum` (zigzagged) with parameter k: close enough to pick with, and
// much quicker than counting every one (the sum of u >> k is about sum / 2^k - n / 2)
const riceBits = (n: number, sum: number, k: number) => n * (k + 1) + Math.max(0, Math.floor(sum / 2 ** k - (k ? n / 2 : 0)));
function riceFor(n: number, sum: number) {
  let best = { k: 0, bits: riceBits(n, sum, 0) };
  for (let k = 1; k <= 14; k++) {
    const bits = riceBits(n, sum, k);
    if (bits < best.bits) best = { k, bits };
  }
  return best;
}

interface Plan { order: number; partOrder: number; ks: number[]; u: Uint32Array; bits: number }

// the best partition order (0-6) for the residuals of a block: each partition gets its own Rice parameter. The
// sums for the finest split are added up for the coarser ones.
function planResidual(r: Int32Array, blockSize: number, order: number): Plan | null {
  const u = new Uint32Array(r.length);
  for (let i = 0; i < r.length; i++) u[i] = zigzag(r[i]);
  let maxP = 0;
  while (maxP < 6 && blockSize % (2 << maxP) === 0 && (blockSize >> (maxP + 1)) > order) maxP++;
  if ((blockSize >> maxP) <= order) return null;
  let sums: number[] = [];
  let at = 0;
  for (let i = 0; i < 1 << maxP; i++) {
    const count = (blockSize >> maxP) - (i === 0 ? order : 0);
    let sum = 0;
    for (let j = at; j < at + count; j++) sum += u[j];
    sums.push(sum);
    at += count;
  }
  let best: Plan | null = null;
  for (let p = maxP; p >= 0; p--) {
    const ks: number[] = [];
    let bits = 6;
    sums.forEach((sum, i) => {
      const rice = riceFor((blockSize >> p) - (i === 0 ? order : 0), sum);
      ks.push(rice.k);
      bits += 4 + rice.bits;
    });
    if (!best || bits < best.bits) best = { order, partOrder: p, ks, u, bits };
    const coarser: number[] = [];
    for (let i = 0; i < sums.length; i += 2) coarser.push(sums[i] + (sums[i + 1] || 0));
    sums = coarser;
  }
  return best;
}

interface Sub { kind: 'constant' | 'verbatim' | 'fixed'; bits: number; plan?: Plan }

function chooseSubframe(x: Int32Array, bps: number): Sub {
  let constant = true;
  for (let i = 1; i < x.length && constant; i++) constant = x[i] === x[0];
  if (constant) return { kind: 'constant', bits: 8 + bps };
  let best: Sub = { kind: 'verbatim', bits: 8 + bps * x.length };
  for (let order = 0; order <= Math.min(4, x.length - 1); order++) {
    const plan = planResidual(residual(x, order), x.length, order);
    if (!plan) continue;
    const bits = 8 + order * bps + plan.bits;
    if (bits < best.bits) best = { kind: 'fixed', bits, plan };
  }
  return best;
}

function writeSubframe(w: Bits, x: Int32Array, bps: number, s: Sub) {
  const signed = (v: number) => w.write(v < 0 ? v + 2 ** bps : v, bps);
  if (s.kind === 'constant') { w.write(0, 8); signed(x[0]); return; }
  if (s.kind === 'verbatim') { w.write(0b00000010, 8); x.forEach(signed); return; }
  const plan = s.plan as Plan;
  w.write((0b001000 | plan.order) << 1, 8);
  for (let i = 0; i < plan.order; i++) signed(x[i]);
  w.write(0, 2); // Rice coding with 4-bit parameters
  w.write(plan.partOrder, 4);
  let at = 0;
  plan.ks.forEach((k, i) => {
    w.write(k, 4);
    const count = (x.length >> plan.partOrder) - (i === 0 ? plan.order : 0);
    for (let j = at; j < at + count; j++) {
      const u = plan.u[j];
      const q = u >>> k;
      // the unary part, its stop bit and the low bits in one go when they fit
      if (q + 1 + k <= 24) w.write((1 << k) | (u & ((1 << k) - 1)), q + 1 + k);
      else {
        w.zeros(q);
        w.write(1, 1);
        if (k) w.write(u & ((1 << k) - 1), k);
      }
    }
    at += count;
  });
}

// the frame number, written the way UTF-8 writes a character
function utf8Number(w: Bits, n: number) {
  if (n < 0x80) { w.write(n, 8); return; }
  const bytes: number[] = [];
  let lead = 0xc0;
  let room = 0x1f;
  for (;;) {
    bytes.unshift(0x80 | (n & 0x3f));
    n = Math.floor(n / 64);
    if (n <= room) break;
    lead = (lead >> 1) | 0x80;
    room >>= 1;
  }
  w.write(lead | n, 8);
  for (const b of bytes) w.write(b, 8);
}

// channels: 16-bit samples, one array per channel; onProgress gets 0..1
function encodeFlac(channels: Int16Array[], rate: number, tags: Tags, onProgress?: (p: number) => void): Uint8Array {
  const total = channels[0].length;
  const w = new Bits();
  let minFrame = Infinity;
  let maxFrame = 0;
  let frameNo = 0;
  for (let start = 0; start < total; start += BLOCK) {
    const size = Math.min(BLOCK, total - start);
    const x = channels.map((c) => Int32Array.from(c.subarray(start, start + size)));
    // stereo: left/right, or one of them with the difference, or their average with the difference
    let mode = channels.length - 1;
    let subs = x.map((c) => ({ data: c, bps: 16, sub: chooseSubframe(c, 16) }));
    if (channels.length === 2) {
      const side = x[0].map((l, i) => l - x[1][i]);
      const mid = x[0].map((l, i) => (l + x[1][i]) >> 1);
      const s = { data: side, bps: 17, sub: chooseSubframe(side, 17) };
      const m = { data: mid, bps: 16, sub: chooseSubframe(mid, 16) };
      const options = [
        { mode: 1, subs },
        { mode: 8, subs: [subs[0], s] },
        { mode: 9, subs: [s, subs[1]] },
        { mode: 10, subs: [m, s] },
      ];
      const cost = (o: typeof options[number]) => o.subs.reduce((n, c) => n + c.sub.bits, 0);
      const best = options.reduce((a, b) => (cost(b) < cost(a) ? b : a));
      mode = best.mode;
      subs = best.subs;
    }
    const frameStart = w.len;
    w.write(0b11111111111110, 14);
    w.write(0, 2); // reserved, fixed block size
    w.write(size === BLOCK ? 12 : 7, 4); // 4096, or the size at the end of the header
    w.write(0, 4); // sample rate: as in STREAMINFO
    w.write(mode, 4);
    w.write(4, 3); // 16 bits per sample
    w.write(0, 1);
    utf8Number(w, frameNo++);
    if (size !== BLOCK) w.write(size - 1, 16);
    w.write(crc8(w.bytes(frameStart)), 8);
    for (const c of subs) writeSubframe(w, c.data, c.bps, c.sub);
    w.align();
    w.write(crc16(w.bytes(frameStart)), 16);
    minFrame = Math.min(minFrame, w.len - frameStart);
    maxFrame = Math.max(maxFrame, w.len - frameStart);
    if (onProgress && frameNo % 50 === 0) onProgress(start / total);
  }
  const frames = w.bytes();

  const info = new Bits();
  info.write(BLOCK, 16);
  info.write(BLOCK, 16);
  info.write(minFrame === Infinity ? 0 : minFrame, 24);
  info.write(maxFrame, 24);
  info.write(rate, 20);
  info.write(channels.length - 1, 3);
  info.write(15, 5);
  info.write(Math.floor(total / 2 ** 32), 4);
  info.write(total >>> 0, 32);
  info.zeros(128); // MD5 left out, which FLAC allows
  const blocks: [number, Uint8Array][] = [[0, info.bytes()], [4, audioTags.vorbisComment('Uriel', tags)]];
  if (tags.cover) blocks.push([6, audioTags.flacPicture(tags.cover)]);
  const head = new Bits();
  head.write(0x664c6143, 32); // "fLaC"
  blocks.forEach(([type, body], i) => {
    head.write(i === blocks.length - 1 ? 0x80 | type : type, 8);
    head.write(body.length, 24);
    for (const b of body) head.write(b, 8);
  });
  onProgress && onProgress(1);
  return audioTags.concat([head.bytes(), frames]);
}

export = { encodeFlac };
