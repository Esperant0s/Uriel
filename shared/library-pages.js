// @ts-check
// Uriel's library pages, the parts that are plain data: saved albums, followed artists, the Daily Mixes of the
// Spotify-style home and the thumbs up / down they get, and the explicit [E] badge. No DOM, no network: app.js
// draws them, server.js marks explicit songs with the same check, test/library-pages.test.js runs this in Node.
(function (/** @type {Record<string, unknown>} */ root) {
  // case, accents, spaces and punctuation aside; "NOBODYKNOWS - Topic" is "NobodyKnows" (as in ytm-artist.js)
  // (only Latin accents and emoji/symbol marks go: in Hindi or Arabic the marks are vowels, and "दिल" isn't "दल")
  const fold = (/** @type {unknown} */ s) => String(s == null ? '' : s).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f\u20d0-\u20ff\ufe00-\ufe0f]/g, '').replace(/[^\p{L}\p{N}\p{M}]/gu, '');
  const nameKey = (/** @type {unknown} */ s) => fold(String(s == null ? '' : s).replace(/\s*-\s*Topic$/i, ''));
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? /** @type {unknown[]} */ (v) : []);
  // a saved album, a followed artist, a song (blocked, rated or a mix seed): what this file reads of each.
  // They come from storage and from other devices, so every function checks before it trusts a field.
  /** @typedef {{ id?: string | number, ids?: string[], title?: string, artist?: string, album?: string, name?: string, avatar?: string, fans?: number, cover?: string, type?: string, year?: string | number, trackCount?: number, source?: string, key?: string | number, weight?: number, tracks?: unknown, artists?: unknown, _tracks?: unknown, isExplicit?: boolean, explicit?: boolean, explicit_lyrics?: boolean, explicit_content_lyrics?: number }} LpItem */
  const items = (/** @type {unknown} */ v) => /** @type {LpItem[]} */ (list(v).filter((x) => x && typeof x === 'object'));
  const strings = (/** @type {unknown} */ v) => /** @type {string[]} */ (list(v).filter((x) => typeof x === 'string'));

  // ---------- saved albums ----------
  // The same album: the same id, or the same title by the same artist (iTunes gives one album another id in
  // another country, so an album saved on a phone in one country is still "saved" on a computer in another).
  /** @param {LpItem | null | undefined} a @param {LpItem | null | undefined} b */
  function sameAlbum(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && String(a.id) === String(b.id)) return true;
    return !!fold(a.title) && fold(a.title) === fold(b.title) && nameKey(a.artist) === nameKey(b.artist);
  }
  const isAlbumSaved = (/** @type {unknown} */ saved, /** @type {LpItem} */ album) => items(saved).some((a) => sameAlbum(a, album));

  // what a saved album keeps: enough to draw its card and open it again, on any linked device
  /** @param {LpItem} album @param {number} [now] */
  function albumEntry(album, now = Date.now()) {
    const tracks = Array.isArray(album._tracks) ? album._tracks.length : 0;
    /** @type {{ id: string, title: string, artist: string, cover: string, type: string, year: string, trackCount: number, savedAt: number, source?: string }} */
    const out = {
      id: String(album.id || ''),
      title: album.title || '',
      artist: album.artist || '',
      cover: album.cover || '',
      type: album.type || 'Album',
      year: String(album.year || ''),
      trackCount: Number(album.trackCount) || tracks,
      savedAt: now,
    };
    if (album.source) out.source = album.source;
    return out;
  }

  // saving puts the album first; saving it again removes it
  /** @param {unknown} saved @param {LpItem} album @param {number} [now] */
  function toggleSavedAlbum(saved, album, now = Date.now()) {
    const cur = items(saved);
    if (isAlbumSaved(cur, album)) return { list: cur.filter((a) => !sameAlbum(a, album)), saved: false };
    return { list: [albumEntry(album, now), ...cur], saved: true };
  }

  // ---------- followed artists ----------
  // Several artists can share a name, so a followed artist keeps its YouTube Music channel (`id`) when its page
  // had one. A page knows all the channels its artist answers to (`ids`: its YouTube Music page, its YouTube
  // channel). An artist followed by name only, or a page opened by name only, goes by the name.
  /** @param {LpItem | null | undefined} entry @param {LpItem | null | undefined} artist */
  function followMatches(entry, artist) {
    if (!entry || !artist) return false;
    const ids = [artist.id, ...list(artist.ids)].filter(Boolean);
    if (entry.id && ids.length) return ids.includes(entry.id);
    const k = nameKey(artist.name);
    return !!k && nameKey(entry.name) === k;
  }
  const isArtistFollowed = (/** @type {unknown} */ followed, /** @type {LpItem} */ artist) => items(followed).some((e) => followMatches(e, artist));

  /** @param {LpItem} artist @param {number} [now] */
  function followEntry(artist, now = Date.now()) {
    /** @type {{ name: string, avatar: string, fans: number, followedAt: number, id?: string }} */
    const out = { name: String(artist.name || '').trim(), avatar: artist.avatar || '', fans: Number(artist.fans) || 0, followedAt: now };
    if (artist.id) out.id = String(artist.id);
    return out;
  }

  // following puts the artist first; following again unfollows (every entry that is this artist)
  /** @param {unknown} followed @param {LpItem} artist @param {number} [now] */
  function toggleFollowArtist(followed, artist, now = Date.now()) {
    const cur = items(followed);
    if (isArtistFollowed(cur, artist)) return { list: cur.filter((e) => !followMatches(e, artist)), followed: false };
    if (!nameKey(artist && artist.name)) return { list: cur, followed: false };
    return { list: [followEntry(artist, now), ...cur], followed: true };
  }

  // The page of a followed artist knows more than the entry (its picture, its channel): the entry learns it.
  // Unchanged entries stay the same objects, so nothing is written (or synced) when there's nothing new.
  /** @param {unknown} followed @param {LpItem} artist */
  function refreshFollowed(followed, artist) {
    let changed = false;
    const out = items(followed).map((e) => {
      if (!followMatches(e, artist)) return e;
      const next = { ...e };
      if (artist.id && !e.id) next.id = artist.id;
      if (artist.avatar && artist.avatar !== e.avatar) next.avatar = artist.avatar;
      if (artist.fans && Number(artist.fans) !== e.fans) next.fans = Number(artist.fans);
      if (artist.name && !e.name) next.name = artist.name;
      const same = /** @type {(keyof LpItem)[]} */ (Object.keys(next)).every((k) => next[k] === e[k]);
      if (same) return e;
      changed = true;
      return next;
    });
    return { list: out, changed };
  }

  // ---------- Daily Mixes ----------
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // The artists you play most, spread over up to five mixes (rank 1 in mix 1, rank 2 in mix 2, ...), each artist
  // with its two songs you play most as seeds; the server finds songs like the seeds. The ids carry the day, so
  // a thumbs up or down is asked again for tomorrow's mixes.
  /** @param {unknown} seeds @param {{ day?: string, max?: number, normalize?: (s: string) => string }} [o] */
  function planMixes(seeds, { day = localDay(), max = 5, normalize = nameKey } = {}) {
    /** @type {Map<string, { name: string, tracks: LpItem[] }>} */
    const byArtist = new Map();
    for (const s of items(seeds)) {
      const k = s && s.artist ? normalize(s.artist) : '';
      if (!k) continue;
      const a = byArtist.get(k) || { name: String(s.artist), tracks: /** @type {LpItem[]} */ ([]) };
      a.tracks.push(s);
      byArtist.set(k, a);
    }
    const artists = [...byArtist.values()].map((a) => {
      const top = a.tracks.slice().sort((x, y) => (y.weight || 0) - (x.weight || 0)).slice(0, 2);
      return { name: a.name, tracks: top, weight: top.reduce((/** @type {number} */ n, t) => n + (t.weight || 0), 0) };
    }).sort((a, b) => b.weight - a.weight).slice(0, 15);
    if (artists.length < 4) return [];
    const count = Math.min(max, Math.floor(artists.length / 2));
    /** @type {{ artists: string[], seeds: LpItem[] }[]} */
    const buckets = Array.from({ length: count }, () => ({ artists: [], seeds: [] }));
    artists.forEach((a, rank) => {
      const b = buckets[rank % count];
      b.artists.push(a.name);
      b.seeds.push(...a.tracks);
    });
    return buckets.map((b, i) => ({ id: `daily-mix-${day}-${i + 1}`, title: `Daily Mix ${i + 1}`, artists: b.artists, seeds: b.seeds.slice(0, 6) }));
  }

  // ---------- thumbs up / down on a Daily Mix ----------
  /** @typedef {{ likedArtists: string[], dislikedArtists: string[], likedTracks: LpItem[], dislikedTracks: LpItem[], ratingsByMix: Record<string, string> }} Feedback */
  const CAP_TRACKS = 300;
  const CAP_ARTISTS = 150;
  const CAP_RATINGS = 60;
  /** @param {unknown} v @returns {Feedback} */
  function cleanFeedback(v) {
    /** @type {Record<string, unknown>} */
    const o = v && typeof v === 'object' ? /** @type {Record<string, unknown>} */ (v) : {};
    return {
      likedArtists: strings(o.likedArtists).filter((a) => a.trim()),
      dislikedArtists: strings(o.dislikedArtists).filter((a) => a.trim()),
      likedTracks: items(o.likedTracks),
      dislikedTracks: items(o.dislikedTracks),
      ratingsByMix: o.ratingsByMix && typeof o.ratingsByMix === 'object' && !Array.isArray(o.ratingsByMix) ? /** @type {Record<string, string>} */ (o.ratingsByMix) : {},
    };
  }
  const isMixRated = (/** @type {unknown} */ feedback, /** @type {string} */ mixId) => !!(mixId && cleanFeedback(feedback).ratingsByMix[mixId]);

  // A liked mix: its songs and their artists count for more in your taste (My Wave, tomorrow's mixes).
  // A disliked one: its songs, and the artists it brought in, are avoided. The artists the mix was built from
  // are the ones you play most, so "not my taste" never puts them on the avoid list.
  /** @param {unknown} feedback @param {{ id?: string, artists?: unknown, tracks?: unknown } | null | undefined} mix @param {boolean} isLike @param {(t: LpItem) => string} [trackKey] */
  function rateMix(feedback, mix, isLike, trackKey = (t) => `${nameKey(t.artist)}::${fold(t.title)}`) {
    const fb = cleanFeedback(feedback);
    if (!mix || !mix.id) return fb;
    const seedArtists = new Set(list(mix.artists).map(nameKey));
    const tracks = items(mix.tracks).filter((t) => t.title);
    const entries = tracks.map((t) => ({ id: t.id || '', title: t.title || '', artist: t.artist || '', key: t.artist && t.title ? trackKey(t) : (t.id || '') }));
    const sameTrack = (/** @type {LpItem} */ a, /** @type {LpItem} */ b) => (a.id && a.id === b.id) || (a.key && a.key === b.key);
    const artistNames = new Map();
    for (const name of [...(isLike ? list(mix.artists) : []), ...tracks.map((t) => t.artist)]) {
      const k = nameKey(name);
      if (!k || (!isLike && seedArtists.has(k)) || artistNames.has(k)) continue;
      artistNames.set(k, String(name).trim());
    }
    /** @type {['likedTracks' | 'dislikedTracks', 'likedTracks' | 'dislikedTracks']} */
    const [keepT, dropT] = isLike ? ['likedTracks', 'dislikedTracks'] : ['dislikedTracks', 'likedTracks'];
    /** @type {['likedArtists' | 'dislikedArtists', 'likedArtists' | 'dislikedArtists']} */
    const [keepA, dropA] = isLike ? ['likedArtists', 'dislikedArtists'] : ['dislikedArtists', 'likedArtists'];
    fb[dropT] = fb[dropT].filter((t) => !entries.some((e) => sameTrack(t, e)));
    fb[keepT] = [...entries.filter((e) => !fb[keepT].some((t) => sameTrack(t, e))), ...fb[keepT]].slice(0, CAP_TRACKS);
    fb[dropA] = fb[dropA].filter((a) => !artistNames.has(nameKey(a)));
    fb[keepA] = [...[...artistNames.values()].filter((a) => !fb[keepA].some((x) => nameKey(x) === nameKey(a))), ...fb[keepA]].slice(0, CAP_ARTISTS);
    const ratings = Object.entries({ ...fb.ratingsByMix, [mix.id]: isLike ? 'like' : 'dislike' });
    fb.ratingsByMix = Object.fromEntries(ratings.slice(-CAP_RATINGS));
    return fb;
  }

  // what the disliked mixes add to My Wave's avoid list: { keys, artists }
  /** @param {unknown} feedback */
  function feedbackAvoid(feedback) {
    const fb = cleanFeedback(feedback);
    const keys = new Set();
    fb.dislikedTracks.forEach((t) => { if (t.key) keys.add(t.key); if (t.id) keys.add(t.id); });
    return { keys: [...keys], artists: fb.dislikedArtists.slice() };
  }

  // ---------- the explicit [E] badge ----------
  // a marker in a title or album name: "(Explicit)", "[E]", "[18+]", "(Dirty)", "uncensored", "без цензуры"
  const EXPLICIT_TEXT = /\bexplicit\b|[[(]\s*(?:e|18\+|\+18|dirty)\s*[)\]]|\buncensored\b|без\s+цензуры|нецензурн/i;
  const isExplicitText = (/** @type {unknown} */ s) => !!s && EXPLICIT_TEXT.test(String(s));
  // flagged by the service (YouTube Music's [E], iTunes / Deezer's explicit lyrics) or marked in the title
  /** @param {LpItem | null | undefined} t */
  function isTrackExplicit(t) {
    if (!t) return false;
    if (t.isExplicit === true || t.explicit === true || t.explicit_lyrics === true || t.explicit_content_lyrics === 1) return true;
    return isExplicitText(t.title) || isExplicitText(t.album);
  }

  // ---------- blocked artists and songs (from Riff 43.1) ----------
  // Never played on their own: skipped when the queue moves on and kept out of My Wave, the mixes and For you.
  // A blocked artist is a name ("Queen" also blocks "Queen & David Bowie"); a blocked song is its id, or its
  // title by the same artist (the same song from another upload).
  const ARTIST_SPLIT = /\s*(?:,|&|\+|\/|;|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b)\s*/i;
  const artistsOf = (/** @type {unknown} */ s) => String(s == null ? '' : s).split(ARTIST_SPLIT).map(nameKey).filter(Boolean);
  /** @param {unknown} blocked @param {unknown} artist */
  function isArtistBlocked(blocked, artist) {
    const keys = new Set(list(blocked).map(nameKey).filter(Boolean));
    if (!keys.size || !artist) return false;
    return keys.has(nameKey(artist)) || artistsOf(artist).some((k) => keys.has(k));
  }
  /** @param {LpItem | null | undefined} entry @param {LpItem | null | undefined} track */
  function blockedSongMatches(entry, track) {
    if (!entry || !track) return false;
    if (entry.id && track.id && String(entry.id) === String(track.id)) return true;
    if (!fold(entry.title) || fold(entry.title) !== fold(track.title)) return false;
    const a = nameKey(entry.artist), b = nameKey(track.artist);
    return !a || !b || a === b;
  }
  const isSongBlocked = (/** @type {unknown} */ blocked, /** @type {LpItem} */ track) => items(blocked).some((e) => blockedSongMatches(e, track));
  const isTrackBlocked = (/** @type {{ songs?: unknown, artists?: unknown } | null | undefined} */ blocks, /** @type {LpItem | null | undefined} */ track) => !!track && !!blocks
    && (isSongBlocked(blocks.songs, track) || isArtistBlocked(blocks.artists, track.artist));
  /** @param {unknown} blocked @param {unknown} artist */
  function toggleBlockedArtist(blocked, artist) {
    const name = String(artist == null ? '' : artist).trim().slice(0, 200);
    const cur = list(blocked);
    if (!nameKey(name)) return { list: cur, blocked: false };
    const k = nameKey(name);
    if (cur.some((a) => nameKey(a) === k)) return { list: cur.filter((a) => nameKey(a) !== k), blocked: false };
    return { list: [...cur, name], blocked: true };
  }
  /** @param {unknown} blocked @param {LpItem | null | undefined} track */
  function toggleBlockedSong(blocked, track) {
    const cur = items(blocked);
    if (!track || !fold(track.title)) return { list: cur, blocked: false };
    if (cur.some((e) => blockedSongMatches(e, track))) return { list: cur.filter((e) => !blockedSongMatches(e, track)), blocked: false };
    const entry = { id: track.id ? String(track.id) : '', title: String(track.title).slice(0, 300), artist: String(track.artist || '').slice(0, 300) };
    return { list: [...cur, entry], blocked: true };
  }

  const api = {
    nameKey, sameAlbum, isAlbumSaved, albumEntry, toggleSavedAlbum,
    followMatches, isArtistFollowed, toggleFollowArtist, refreshFollowed,
    localDay, planMixes, cleanFeedback, isMixRated, rateMix, feedbackAvoid,
    isExplicitText, isTrackExplicit,
    isArtistBlocked, isSongBlocked, isTrackBlocked, toggleBlockedArtist, toggleBlockedSong,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UrielLibrary = api;
})(typeof window !== 'undefined' ? window : globalThis);
