// A song someone downloads on the phone: server.js has it in the cache already (the way playback gets it), and this
// writes it to Downloads in the format they picked, with its title, artist, album and cover. There's no ffmpeg on
// phones, so the AAC is put in an M4A box as it is, and anything else is copied as it came.
import path = require('path');
import fs = require('./shims/fs');
import store = require('./shims/store');
import m4a = require('./m4a');
import audioTags = require('../shared/audio-tags');
import { coverFor } from './cover';

type Tags = import('../shared/audio-tags').Tags;

export interface SaveRequest {
  cached: string; // the song in the cache (/data/tracks/<id>.<ext>)
  dir: string; // Downloads
  base: string; // "Artist - Title"
  format: string; // original, m4a, mp3 or flac
  tags: Tags;
  thumbnail?: string;
}

// an ID3 tag already at the front of an MP3 (SoundCloud's have one): replaced, not stacked
function withoutId3(b: Uint8Array) {
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return b;
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
  return b.subarray(10 + size + ((b[5] & 0x10) ? 10 : 0));
}

async function write(file: string, bytes: Uint8Array) {
  await store.writeBytes(file, bytes);
  fs._register(file, bytes.length);
}

export async function saveDownload(o: SaveRequest): Promise<{ filename: string; note?: string }> {
  const ext = path.extname(o.cached).slice(1).toLowerCase();
  const tags: Tags = { ...o.tags, cover: await coverFor(o.thumbnail) };
  const save = async (outExt: string, bytes: Uint8Array) => {
    const filename = `${o.base}.${outExt}`;
    await write(path.join(o.dir, filename), bytes);
    return { filename };
  };
  const bytes = await store.readBytes(o.cached);
  if (ext === 'aac' && (o.format === 'original' || o.format === 'm4a')) return save('m4a', m4a.adtsToM4a(bytes, tags));
  if (ext === 'm4a' && (o.format === 'original' || o.format === 'm4a')) return save('m4a', m4a.addIlst(bytes, tags));
  if (ext === 'mp3' && (o.format === 'original' || o.format === 'mp3')) return save('mp3', audioTags.concat([audioTags.id3v23(tags), withoutId3(bytes)]));
  // not converted (yet): saved as it came, and the app says so
  const saved = await save(ext, bytes);
  return o.format === 'original' ? saved : { ...saved, note: `Saved as ${ext.toUpperCase()}: this song can't be turned into ${o.format.toUpperCase()} on the phone` };
}
