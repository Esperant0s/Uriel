// @ts-check
'use strict';

// Keeps the computer's offline songs under the limit chosen in Settings → Storage: the songs played longest ago
// go first and the newest few always stay. A song removed here can still be streamed and is cached again when
// played. Phones do the same with their own file system in mobile/cache-limit.ts.
const fs = require('fs');
const path = require('path');

const AUDIO = /\.(opus|webm|m4a|mp3|aac)$/i;
const KEEP_NEWEST = 4;

// files: [{ id, name, size, used, temp }]. Returns the files to delete.
function planEviction(files, limitBytes, keepNewest = KEEP_NEWEST) {
  if (!(limitBytes > 0)) return [];
  let total = files.reduce((n, f) => n + f.size, 0); // a download still being written counts towards the limit
  if (total <= limitBytes) return [];
  const songs = files.filter((f) => !f.temp).sort((a, b) => a.used - b.used);
  const out = [];
  for (const f of songs.slice(0, Math.max(0, songs.length - keepNewest))) {
    if (total <= limitBytes) break;
    out.push(f);
    total -= f.size;
  }
  return out;
}

// lastPlayed(id) -> ms or 0: the file's time already moves when a song is looked up to play, this adds what the
// index remembers. onRemoved(id) runs for each song actually deleted.
/** @param {string} dir @param {number} limitBytes @param {{ lastPlayed?: (id: string) => number, onRemoved?: (id: string) => void, keepNewest?: number }} [o] */
async function enforceLimit(dir, limitBytes, { lastPlayed = () => 0, onRemoved = () => {}, keepNewest = KEEP_NEWEST } = {}) {
  if (!(limitBytes > 0)) return 0;
  const files = [];
  for (const name of await fs.promises.readdir(dir)) {
    const temp = name.includes('.temp.');
    if (!temp && !AUDIO.test(name)) continue;
    try {
      const st = await fs.promises.stat(path.join(dir, name));
      const id = name.replace(AUDIO, '');
      files.push({ id, name, size: st.size, used: Math.max(st.mtimeMs, Number(lastPlayed(id)) || 0), temp });
    } catch (e) {}
  }
  let removed = 0;
  for (const f of planEviction(files, limitBytes, keepNewest)) {
    try {
      await fs.promises.unlink(path.join(dir, f.name));
      removed++;
      onRemoved(f.id);
    } catch (e) {} // in use (Windows, while it plays): it goes next time
  }
  return removed;
}

module.exports = { planEviction, enforceLimit, KEEP_NEWEST };
