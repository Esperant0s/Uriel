// `child_process.spawn` for the iOS build. iOS can't run processes; the only thing server.js spawns
// is yt-dlp, so this emulates the yt-dlp invocations it makes on top of the in-app extractor.
import { EventEmitter } from 'events';
import fs = require('./fs');
import store = require('./store');
import ex = require('../extract');
import tsAacModule = require('../ts2aac');
const { segmentsToAac, stripId3 } = tsAacModule;
import cacheLimitModule = require('../cache-limit');
const { enforceCacheLimit } = cacheLimitModule;

type Headers = Record<string, string>;
// how far a download is: pieces done, of how many
type OnPart = (done: number, total: number) => void;
type Container = 'aac' | 'mp3' | 'fmp4';
// the part of a ChildProcess server.js uses
interface FakeProcess extends EventEmitter { stdout: EventEmitter; stderr: EventEmitter; kill(): void }

// `work` is the yt-dlp call: what it prints, or an error for a non-zero exit
function fakeProcess(work: (signal: AbortSignal) => Promise<string>): FakeProcess {
  let killed = false;
  const ac = new AbortController();
  const p: FakeProcess = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    // like a killed process: stop the work and report the exit right away (server.js cleans up on 'close')
    kill() { if (killed) return; killed = true; ac.abort(); setTimeout(() => p.emit('close', null), 0); },
  });
  setTimeout(async () => {
    try {
      const out = await work(ac.signal);
      if (killed) return;
      if (out) p.stdout.emit('data', out);
      p.emit('close', 0);
    } catch (e) {
      if (killed) return;
      p.stderr.emit('data', `ERROR: ${(e instanceof Error && e.message) || e}`);
      p.emit('close', 1);
    }
  }, 0);
  return p;
}

const opt = (args: string[], name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function searchJson(target: string, limit?: number): Promise<string> {
  let entries;
  let m = target.match(/^(yt|sc)search(\d*):(.*)$/);
  if (m) {
    const n = Number(m[2]) || limit || 20;
    entries = m[1] === 'sc' ? await ex.soundcloudSearch(m[3], n) : await ex.youtubeSearch(m[3], n);
  } else if ((m = target.match(/music\.youtube\.com\/search\?q=([^#&]+)/))) {
    entries = await ex.ytMusicSearch(decodeURIComponent(m[1].replace(/\+/g, ' ')), limit || 20);
  } else if (/^https?:\/\//.test(target)) {
    // playlist / album / set link (link import)
    const pl = await ex.playlist(target, limit || 500);
    return JSON.stringify({ title: pl.title, entries: pl.entries });
  } else {
    throw new Error(`unsupported search target ${target}`);
  }
  return JSON.stringify({ entries });
}

// Joins downloaded HLS segments into one playable file:
//  'aac'  (default, YouTube): packed audio / MPEG-TS → raw ADTS .aac
//  'mp3'  (SoundCloud): MP3 segments, ID3 tags stripped, frames appended → .mp3
//  'fmp4' (SoundCloud): init segment + moof/mdat fragments appended → fragmented .m4a
function joinSegments(parts: Uint8Array[], container?: Container): Uint8Array {
  if (container === 'aac' || !container) return segmentsToAac(parts);
  return concat(container === 'mp3' ? parts.map(stripId3) : parts);
}

function concat(pieces: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(pieces.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of pieces) { out.set(x, o); o += x.length; }
  return out;
}

// Fetches every segment of an HLS media playlist and joins them into one file.
async function downloadHls(playlistUrl: string, headers: Headers, signal: AbortSignal | undefined, container: Container | undefined, onPart?: OnPart): Promise<Uint8Array> {
  const m3u = await (await globalThis.__urielFetch(playlistUrl, { headers, signal })).text();
  const lines = m3u.split('\n').map((l) => l.trim());
  const key = lines.find((l) => l.startsWith('#EXT-X-KEY') && !/METHOD=NONE/.test(l));
  if (key) throw new Error('this song is only available encrypted (DRM)');
  const urls = lines.filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, playlistUrl).href);
  // fragmented MP4 needs its init segment (EXT-X-MAP) in front of the first fragment
  const map = lines.map((l) => l.startsWith('#EXT-X-MAP') && (l.match(/URI="([^"]+)"/) || [])[1]).find(Boolean);
  if (map) urls.unshift(new URL(map, playlistUrl).href);
  if (!urls.length) throw new Error('empty HLS playlist');
  return joinSegments(await fetchAll(urls, headers, signal, onPart), container);
}

// Fetches every URL (4 at a time) and returns their bodies in order.
async function fetchAll(urls: string[], headers: Headers, signal?: AbortSignal, onPart?: OnPart): Promise<Uint8Array[]> {
  const parts = new Array<Uint8Array>(urls.length);
  let next = 0;
  let finished = 0;
  // once one segment has failed for good (or the download was cancelled) the other workers stop too,
  // instead of fetching the rest of a song that can't be finished
  let failed: unknown = null;
  const worker = async () => {
    while (next < urls.length && !failed) {
      if (signal && signal.aborted) throw (failed = new Error('download cancelled'));
      const i = next++;
      // a flaky segment shouldn't sink the whole song: retry it a couple of times with a short backoff
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await globalThis.__urielFetch(urls[i], { headers, signal });
          if (!r.ok) throw Object.assign(new Error(`segment ${i} failed: ${r.status}`), { status: r.status });
          parts[i] = new Uint8Array(await r.arrayBuffer());
          if (onPart) onPart(++finished, urls.length);
          break;
        } catch (e) {
          // a 403/404 won't change on retry
          const status = Number((e as { status?: number } | null)?.status) || 0;
          if (attempt >= 2 || failed || (signal && signal.aborted) || (status >= 400 && status < 500)) throw (failed = failed || e);
          await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  return parts;
}

// A googlevideo file in 1 MiB ranges (like yt-dlp: long single requests get throttled or cut off),
// checked to have arrived whole.
async function downloadRanges(url: string, headers: Headers, signal: AbortSignal | undefined, size: number, onPart?: OnPart): Promise<Uint8Array> {
  const step = 1 << 20;
  const urls: string[] = [];
  for (let a = 0; a < size; a += step) urls.push(`${url}&range=${a}-${Math.min(size, a + step) - 1}`);
  const bytes = concat(await fetchAll(urls, headers, signal, onPart));
  if (bytes.length !== size) throw new Error(`incomplete download: ${bytes.length} of ${size} bytes`);
  return bytes;
}

// Android plays Opus (WebM) natively; set by bridge.ts. iOS keeps the AAC stream.
const playsOpus = () => !!globalThis.__urielPlaysOpus;

// How far a song's download has got, for the download dialog. The file is named after the song's id.
const progressOf = (template: string | undefined): OnPart => {
  const id = (String(template || '').split('/').pop() || '').split('.')[0];
  return (done, total) => {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('uriel:dl-progress', { detail: { id, done, total } }));
  };
};

async function download(args: string[], target: string, signal?: AbortSignal): Promise<string> {
  const audio = await ex.resolveAudio(target);
  if (signal && signal.aborted) throw new Error('download cancelled');
  const template = opt(args, '-o');
  if (!template) throw new Error('no file name to save to');
  // yt-dlp templates: the user-facing download keeps the real container (no ffmpeg on iOS to convert)
  const named = (ext: string) => (template.includes('%(ext)s') ? template.replace('%(ext)s', ext) : template);
  let out = named(audio.ext);
  let size: number;
  // full-quality Opus when the extractor found it; any failure falls back to the stream below
  const opus = audio.opus && playsOpus() ? await downloadRanges(audio.opus.url, audio.headers, signal, audio.opus.size, progressOf(template)).catch((e) => {
    if (signal && signal.aborted) throw e;
    console.warn('[uriel] Opus download failed, using AAC', e instanceof Error ? e.message : e);
    return null;
  }) : null;
  if (opus) {
    out = named('webm');
    await store.writeBytes(out, opus);
    size = opus.length;
  } else if (audio.kind === 'hls') {
    const bytes = await downloadHls(audio.url, audio.headers, signal, audio.container, progressOf(template));
    await store.writeBytes(out, bytes);
    size = bytes.length;
  } else {
    size = await store.download(audio.url, out, audio.headers || { 'User-Agent': 'Mozilla/5.0' });
  }
  fs._register(out, size);
  enforceCacheLimit();
  return '';
}

function spawn(_bin: string, args: string[] = []): FakeProcess {
  // yt-dlp takes the target anywhere: server.js puts search terms first and URLs last
  const target = [...args].reverse().find((a) => /^(yt|sc)search\d*:|^https?:\/\//.test(a)) || args[args.length - 1];
  const limit = Number(opt(args, '--playlist-end')) || undefined;

  if (args.includes('-g')) return fakeProcess(async () => `${(await ex.resolveAudio(target)).url}\n`);
  if (args.includes('--dump-single-json') || args.includes('-J')) return fakeProcess(() => searchJson(target, limit));
  if (args.includes('--print')) return fakeProcess(async () => `${(await ex.resolveAudio(target)).artist || 'NA'}\n`);
  if (args.includes('-x')) return fakeProcess((signal) => download(args, target, signal));
  return fakeProcess(async () => { throw new Error(`unsupported yt-dlp call: ${args.join(' ')}`); });
}

export = { joinSegments, spawn, execFile: () => { throw new Error('execFile is not available on iOS'); } };
