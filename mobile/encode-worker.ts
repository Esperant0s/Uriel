// Encodes a downloaded song to MP3 or FLAC off the page's thread (mobile/save-download.ts sends it the samples).
// Built on its own into www/encode-worker.js, which keeps lamejs (LGPL) in a file of its own.
import { Mp3Encoder } from '@breezystack/lamejs';
import flac = require('./flac');
import audioTags = require('../shared/audio-tags');

type Tags = import('../shared/audio-tags').Tags;
export interface EncodeJob { kind: 'mp3' | 'flac'; rate: number; channels: Int16Array[]; kbps: number; tags: Tags }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<EncodeJob>) => void) | null; postMessage(m: unknown, transfer?: Transferable[]): void };
const progress = (p: number) => ctx.postMessage({ progress: p });

function mp3(job: EncodeJob) {
  const [left, right] = job.channels;
  const stereo = job.channels.length > 1;
  const enc = new Mp3Encoder(stereo ? 2 : 1, job.rate, job.kbps);
  const parts: Uint8Array[] = [audioTags.id3v23(job.tags)];
  const step = 1152 * 20;
  for (let i = 0; i < left.length; i += step) {
    parts.push(new Uint8Array(enc.encodeBuffer(left.subarray(i, i + step), stereo ? right.subarray(i, i + step) : undefined)));
    if ((i / step) % 50 === 0) progress(i / left.length);
  }
  parts.push(new Uint8Array(enc.flush()));
  return audioTags.concat(parts);
}

ctx.onmessage = (e) => {
  try {
    const job = e.data;
    const out = job.kind === 'mp3' ? mp3(job) : flac.encodeFlac(job.channels, job.rate, job.tags, progress);
    ctx.postMessage({ done: out }, [out.buffer]);
  } catch (err) {
    ctx.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
