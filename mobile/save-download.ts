// A song someone downloads on the phone: server.js has it in the cache already (the way playback gets it), and this
// writes it to Downloads in the format they picked, with its title, artist, album and cover. There's no ffmpeg on
// phones: YouTube's AAC goes into an M4A box as it is, Android's Opus into an Ogg file (.opus), also as it is.
// MP3 and FLAC are decoded here and encoded in a worker (encode-worker.ts), one song at a time.
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
  quality: string; // the dialog's bitrate chip, for MP3
  duration: number; // seconds, 0 when not known
  source: string; // what the song was found with (a YouTube URL), for getting its AAC
  id: string; // the cache id, which the dialog's progress goes by
  signal?: AbortSignal;
}

// decoding holds the whole song as samples (a 4-minute one: ~90 MB): longer ones aren't converted on the phone
const MAX_CONVERT_SECONDS = 30 * 60;
const KBPS: Record<string, number> = { 0: 320, 2: 256, 4: 192, 5: 128 };

const progress = (id: string, p: number) => window.dispatchEvent(new CustomEvent('uriel:dl-progress', { detail: { id, done: Math.round(p * 1000), total: 1000, stage: 'convert' } }));

// one conversion at a time: two songs of a batch decoded at once could run a phone out of memory
let converting: Promise<unknown> = Promise.resolve();
function encode(bytes: Uint8Array, kind: 'mp3' | 'flac', rate: number, kbps: number, tags: Tags, id: string, signal?: AbortSignal) {
  const run = converting.then(() => encodeNow(bytes, kind, rate, kbps, tags, id, signal));
  converting = run.catch(() => {});
  return run;
}

async function encodeNow(bytes: Uint8Array, kind: 'mp3' | 'flac', rate: number, kbps: number, tags: Tags, id: string, signal?: AbortSignal): Promise<Uint8Array> {
  const cancelled = () => new DOMException('download cancelled', 'AbortError');
  if (signal && signal.aborted) throw cancelled();
  progress(id, 0);
  // decoded at the song's own rate, so nothing is resampled
  const audio = await new OfflineAudioContext(2, 1, rate).decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const channels: Int16Array[] = [];
  for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) {
    const f = audio.getChannelData(c);
    const s = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) s[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32768)));
    channels.push(s);
  }
  if (signal && signal.aborted) throw cancelled();
  return new Promise((resolve, reject) => {
    const worker = new Worker('encode-worker.js');
    const stop = () => { worker.terminate(); reject(cancelled()); };
    const end = () => { worker.terminate(); if (signal) signal.removeEventListener('abort', stop); };
    if (signal) signal.addEventListener('abort', stop);
    worker.onmessage = (e: MessageEvent<{ progress?: number; done?: Uint8Array; error?: string }>) => {
      if (e.data.progress != null) progress(id, e.data.progress);
      else if (e.data.done) { end(); resolve(e.data.done); }
      else { end(); reject(new Error(e.data.error || 'encoding failed')); }
    };
    worker.onerror = (e) => { end(); reject(new Error(e.message || 'encoding failed')); };
    worker.postMessage({ kind, rate: audio.sampleRate, channels, kbps, tags }, channels.map((c) => c.buffer));
  });
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
  if ((o.format === 'mp3' || o.format === 'flac') && !(o.duration > MAX_CONVERT_SECONDS)) {
    const rate = ext === 'webm' ? 48000 : ext === 'aac' ? m4a.readAdts(bytes).rate : 44100;
    return save(o.format, await encode(bytes, o.format, rate, KBPS[o.quality] || 320, tags, o.id, o.signal));
  }
  // what's left is kept as it came (tagged where it can be): M4A from an MP3 (there's no AAC encoder here), a song
  // too long to convert, or a file of some other kind
  const kept = ext === 'mp3' ? await save('mp3', audioTags.concat([audioTags.id3v23(tags), withoutId3(bytes)]))
    : ext === 'webm' ? await asOgg()
      : await save(ext, bytes);
  if (o.format === 'original') return kept;
  const why = o.duration > MAX_CONVERT_SECONDS ? 'it is too long to convert on the phone' : `the phone can't turn it into ${o.format.toUpperCase()}`;
  return { ...kept, note: `Saved as ${path.extname(kept.filename).slice(1).toUpperCase()}: ${why}` };
}
