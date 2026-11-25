// The cover put into a downloaded song: the song's thumbnail as a square JPEG of at most 600px. A YouTube video's
// thumbnail is 4:3 with black bars around a 16:9 picture: the square comes out of the picture, not the bars.
type Cover = import('../shared/audio-tags').Cover;

const MAX = 600;

export async function coverFor(url: string | undefined): Promise<Cover | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await globalThis.__urielFetch(url, {});
    if (!r.ok) return null;
    const img = await createImageBitmap(await r.blob());
    const picH = /ytimg\.com\/vi/.test(url) ? Math.min(img.height, Math.round(img.width * 9 / 16)) : img.height;
    const side = Math.min(img.width, picH);
    const size = Math.min(MAX, side);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ? { mime: 'image/jpeg', data: new Uint8Array(await blob.arrayBuffer()) } : null;
  } catch (e) {
    // a song without a cover is still worth saving
    console.warn('[uriel] no cover for the download', e instanceof Error ? e.message : e);
    return null;
  }
}
