// A song someone downloads on the phone: server.js has it in the cache already (the way playback gets it), and this
// writes it to Downloads in the format they picked, with its title, artist, album and cover. There's no ffmpeg on
// phones: YouTube's AAC goes into an M4A box as it is, Android's Opus into an Ogg file (.opus), also as it is.
import path = require('path');
import fs = require('./shims/fs');
import store = require('./shims/store');
import m4a = require('./m4a');
import oggOpus = require('./ogg-opus');
import childProcess = require('./shims/child_process');
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
  source: string; // what the song was found with (a YouTube URL), for getting its AAC
  id: string; // the cache id, which the dialog's progress goes by
  signal?: AbortSignal;
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
  // a WebM this can't read (laced blocks, which YouTube doesn't send) is still saved, as it is
  const asOgg = () => {
    try {
      return save('opus', oggOpus.webmToOggOpus(bytes, tags));
    } catch (e) {
      console.warn('[uriel] WebM not moved to Ogg', e instanceof Error ? e.message : e);
      return save('webm', bytes);
    }
  };
  if (ext === 'aac' && (o.format === 'original' || o.format === 'm4a')) return save('m4a', m4a.adtsToM4a(bytes, tags));
  if (ext === 'm4a' && (o.format === 'original' || o.format === 'm4a')) return save('m4a', m4a.addIlst(bytes, tags));
  if (ext === 'mp3' && (o.format === 'original' || o.format === 'mp3')) return save('mp3', audioTags.concat([audioTags.id3v23(tags), withoutId3(bytes)]));
  if (ext === 'webm' && o.format === 'm4a') {
    // Android caches the Opus: YouTube has the same song as AAC, which goes into the M4A untouched
    const aac = await childProcess.fetchAac(o.source, o.id, o.signal).catch((e) => {
      if (o.signal && o.signal.aborted) throw e;
      console.warn('[uriel] no AAC for M4A, saving the Opus', e instanceof Error ? e.message : e);
      return null;
    });
    if (aac) return save('m4a', m4a.adtsToM4a(aac, tags));
    return { ...(await asOgg()), note: "Saved as Opus: YouTube had no M4A version of this song" };
  }
  if (ext === 'webm' && o.format === 'original') return asOgg();
  // not converted (yet): saved as it came, and the app says so
  const saved = await save(ext, bytes);
  return o.format === 'original' ? saved : { ...saved, note: `Saved as ${ext.toUpperCase()}: this song can't be turned into ${o.format.toUpperCase()} on the phone` };
}
