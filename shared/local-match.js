// @ts-check
// Finds the song already on this device (imported, or found by device-library.js) that is the same song as a
// playlist entry, so it plays from that file and counts as available offline instead of being streamed or
// downloaded again. Used by server.js, so desktop and phones (where server.js runs in the app) match alike.
//
// Same song = same title and artist once both are normalized (track-match.js: no "(Official Video)", "feat. X"
// or "Artist - " prefix, Cyrillic in Latin letters; search-text.js: Arabic letter variants), and, when both
// lengths are known, about the same length. A different version ("(Live)", "(Remix)") keeps its words in the
// title, so it never matches the original. A file named without an artist ("Unknown artist") matches only when
// both lengths are known and close.
const { matchNorm, splitArtists, cleanTitle } = require('./track-match');
const { normalizeSearch } = require('./search-text');

const UNKNOWN_ARTIST = 'unknown artist';
// a local file and a streamed upload of the same recording differ by a few seconds of silence at most
const durationTolerance = (want) => Math.max(5, want * 0.03);

const compact = (s) => s.replace(/^the /, '').replace(/ /g, '');

function artistsOf(artist) {
  const raw = normalizeSearch(String(artist || ''));
  if (!raw || matchNorm(raw) === UNKNOWN_ARTIST) return [];
  return splitArtists(raw).map(compact).filter(Boolean);
}

// the title keys a song is known by: its clean title, and for "Artist - Title" uploads on someone else's
// channel the part after the dash too (with that artist counted as one of the song's artists)
function keysFor(title, artist) {
  const t = normalizeSearch(String(title || ''));
  const artists = artistsOf(artist);
  const out = [];
  const add = (k, a) => { k = compact(k || ''); if (k && !out.some((o) => o.key === k)) out.push({ key: k, artists: a }); };
  add(cleanTitle(t, splitArtists(normalizeSearch(String(artist || '')))), artists);
  const dash = t.split(/\s[-–—|]\s/);
  if (dash.length > 1) {
    const head = artistsOf(dash[0]);
    if (head.length) add(cleanTitle(dash.slice(1).join(' - '), []), artists.concat(head));
  }
  return out;
}

function sameArtist(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      // "coldplay" vs "coldplayofficial" (the noise splitArtists leaves on channel names)
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if (short.length >= 4 && (long.startsWith(short) || long.endsWith(short))) return true;
    }
  }
  return false;
}

// songs: [{ id, title, artist, duration }]. Returns { find({ title, artist, duration }) -> song | null, size }.
function createLocalIndex(songs) {
  const byKey = new Map();
  for (const song of songs || []) {
    if (!song || !song.id || !song.title) continue;
    for (const { key, artists } of keysFor(song.title, song.artist)) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ song, artists });
    }
  }

  function find(track) {
    if (!track || !track.title || !byKey.size) return null;
    const want = Number(track.duration) || 0;
    let best = null;
    let bestScore = -Infinity;
    for (const { key, artists: wanted } of keysFor(track.title, track.artist)) {
      for (const { song, artists } of byKey.get(key) || []) {
        const got = Number(song.duration) || 0;
        const diff = want && got ? Math.abs(want - got) : null;
        if (diff !== null && diff > durationTolerance(want)) continue;
        const artistKnown = artists.length > 0 && wanted.length > 0;
        if (artistKnown ? !sameArtist(wanted, artists) : diff === null || diff > 3) continue;
        const score = (artistKnown ? 2 : 0) + (diff === null ? 0 : 1 - diff / 10);
        if (score > bestScore) { best = song; bestScore = score; }
      }
    }
    return best;
  }

  return { find, size: byKey.size };
}

module.exports = { createLocalIndex, keysFor };
