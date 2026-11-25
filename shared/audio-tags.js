// @ts-check
// Tag blocks for saved downloads: ID3v2.3 for MP3, Vorbis comments for FLAC and Ogg Opus, and the FLAC PICTURE
// block (also what Ogg files carry as METADATA_BLOCK_PICTURE). The server writes them on phones, where there's no
// ffmpeg, and hands the Ogg cover to ffmpeg on the PC. test/audio-tags.test.js reads them back.
const { Buffer } = require('buffer');

/** @typedef {{ mime: string, data: Uint8Array }} Cover */
/** @typedef {{ title?: string, artist?: string, album?: string, track?: number | string, year?: number | string, cover?: Cover | null }} Tags */

const utf8 = (/** @type {string} */ s) => new TextEncoder().encode(s);

/** @param {Uint8Array[]} parts */
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const u32be = (/** @type {number} */ n) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const u32le = (/** @type {number} */ n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]);

// the text fields that are set, as [name, value]
/** @param {Tags} t */
function fields(t) {
  /** @type {[string, string][]} */
  const out = [];
  if (t.title) out.push(['title', String(t.title)]);
  if (t.artist) out.push(['artist', String(t.artist)]);
  if (t.album) out.push(['album', String(t.album)]);
  if (Number(t.track) > 0) out.push(['track', String(Number(t.track))]);
  if (Number(t.year) > 0) out.push(['year', String(Number(t.year))]);
  return out;
}

const ID3_FRAMES = /** @type {Record<string, string>} */ ({ title: 'TIT2', artist: 'TPE1', album: 'TALB', track: 'TRCK', year: 'TYER' });

/** @param {string} id @param {Uint8Array} body */
const id3Frame = (id, body) => concat([utf8(id), u32be(body.length), new Uint8Array(2), body]);

// UTF-16 with a BOM: v2.3 has no UTF-8, and Latin-1 would lose anything outside Western Europe
/** @param {string} s */
function utf16(s) {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out[2 + i * 2] = c & 255; out[3 + i * 2] = c >> 8; }
  return out;
}

/** @param {Tags} t */
function id3v23(t) {
  const frames = fields(t).map(([k, v]) => id3Frame(ID3_FRAMES[k], concat([new Uint8Array([1]), utf16(v)])));
  if (t.cover) {
    // text encoding 0, MIME, picture type 3 (front cover), empty description
    frames.push(id3Frame('APIC', concat([new Uint8Array([0]), utf8(t.cover.mime), new Uint8Array([0, 3, 0]), t.cover.data])));
  }
  const body = concat(frames);
  const n = body.length;
  // the size is "syncsafe": 7 bits per byte
  const header = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
  return concat([header, body]);
}

const VORBIS_NAMES = /** @type {Record<string, string>} */ ({ title: 'TITLE', artist: 'ARTIST', album: 'ALBUM', track: 'TRACKNUMBER', year: 'DATE' });

/** @param {Cover} cover */
function flacPicture(cover) {
  const mime = utf8(cover.mime);
  // type 3, MIME, no description, width/height/depth/colours left at 0 (players read them from the image)
  return concat([u32be(3), u32be(mime.length), mime, u32be(0), u32be(0), u32be(0), u32be(0), u32be(0), u32be(cover.data.length), cover.data]);
}

/** @param {Cover} cover */
const metadataBlockPicture = (cover) => Buffer.from(flacPicture(cover)).toString('base64');

// a Vorbis comment block (FLAC's VORBIS_COMMENT body; Ogg Opus puts "OpusTags" before it). Ogg files carry the
// cover inside it, FLAC files in a PICTURE block of their own.
/** @param {string} vendor @param {Tags} t @param {{ withCover?: boolean }} [o] */
function vorbisComment(vendor, t, { withCover = false } = {}) {
  const list = fields(t).map(([k, v]) => `${VORBIS_NAMES[k]}=${v}`);
  if (withCover && t.cover) list.push(`METADATA_BLOCK_PICTURE=${metadataBlockPicture(t.cover)}`);
  const v = utf8(vendor);
  const parts = [u32le(v.length), v, u32le(list.length)];
  for (const c of list) { const b = utf8(c); parts.push(u32le(b.length), b); }
  return concat(parts);
}

module.exports = { id3v23, vorbisComment, flacPicture, metadataBlockPicture, concat, utf8 };
