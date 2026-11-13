// Turns a YouTube/SoundCloud title and channel into what lyrics sites list ("Artist - Song (Official Video)"
// on channel "ArtistVEVO" -> song "Song" by "Artist"), and picks the lrclib result that actually matches.

(function () {
  const NOISE = /\b(official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|8k|remaster(ed)?|clip|mv|m\/v|explicit|clean|color\s*coded|live\s*performance|performance\s*video|full\s*album|tiny\s*desk)\b/i;
  const FEAT = /\b(feat\.?|ft\.?|featuring|with|prod\.?|produced\s+by)\s/i;
  const BRACKETS = /\s*[([{【「『](.*?)[)\]}】」』]/g;
  const DASH = /\s+[-–—|]\s+/;

  function norm(s) {
    return String(s || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // drops "(Official Video)", "[Lyrics]", "(feat. X)" but keeps "(Remix)", "(Pt. 2)"; `all` drops every bracket
  function cleanTitle(s, all = false) {
    let t = String(s || '').replace(/[’‘`]/g, "'").replace(BRACKETS, (m, inner) => (all || NOISE.test(inner) || FEAT.test(inner + ' ') ? '' : m));
    t = t.replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, '');
    t = t.replace(/\s*[|｜].*$/, '');
    return t.replace(/\s+/g, ' ').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').trim();
  }

  function cleanArtist(s) {
    return String(s || '')
      .replace(BRACKETS, '')
      .replace(/\s*-\s*topic$/i, '')
      .replace(/(\S)\s*vevo$/i, '$1')
      .replace(/\s+(official|music)$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitArtists(s) {
    return String(s || '').split(/\s*(?:,|&|\+|;|\/|×|\bx\b|\band\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/i).map((a) => a.trim()).filter(Boolean);
  }

  const uniq = (list) => {
    const seen = new Set();
    return list.filter((v) => { const k = norm(v); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };

  function parseForLyrics(title, artist) {
    const channel = cleanArtist(artist);
    let song = String(title || '');
    let fromTitle = '';
    const parts = song.split(DASH);
    if (parts.length >= 2) {
      const left = parts[0], right = parts.slice(1).join(' - ');
      const ch = norm(channel), l = norm(left);
      const leftIsArtist = !ch || (l && (l.includes(norm(splitArtists(channel)[0] || channel)) || ch.includes(norm(splitArtists(left)[0] || left)))) || /topic|vevo|records|music/i.test(artist || '');
      if (leftIsArtist) { fromTitle = cleanArtist(left); song = right; } else if (NOISE.test(right)) song = left; // "Song - Remastered 2011"
    }
    const titles = uniq([cleanTitle(song), cleanTitle(song, true)]);
    const lead = fromTitle || channel;
    // channel names often drop the spaces ("TheWeeknd"); lrclib lists "The Weeknd"
    const spaced = (n) => (n && !/\s/.test(n) ? n.replace(/([a-z])([A-Z])/g, '$1 $2') : '');
    const artists = uniq([lead, splitArtists(lead)[0], channel, splitArtists(channel)[0], spaced(lead), spaced(channel)].filter(Boolean));
    // a label or lyrics channel, not the artist: then a result by someone else may still be the song
    const unsure = !fromTitle && (!channel || /\b(records?|music|entertainment|lyrics?|channel|tv|studios?|productions?)\b/i.test(channel));
    return { titles, artists, unsure };
  }

  function tokens(s) { return new Set(norm(s).split(' ').filter(Boolean)); }
  function overlap(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach((t) => { if (B.has(t)) n++; });
    return n / Math.min(A.size, B.size);
  }

  // How alike two song titles are as a whole: "Drip" isn't "My Drip" and "Love" isn't "Love Again" (#47), but
  // "(Official Video)", "(feat. X)" and "- Remastered 2011" on the result don't count against it
  function titleMatch(want, name) {
    let got = cleanTitle(name);
    const parts = got.split(DASH);
    if (parts.length >= 2 && NOISE.test(parts.slice(1).join(' '))) got = parts[0];
    const A = tokens(want), B = tokens(got);
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach((t) => { if (B.has(t)) n++; });
    return n / Math.max(A.size, B.size);
  }

  // like overlap, but words lots of artist names have don't count: "The Weeknd" isn't "The Kid LAROI" (#47)
  const COMMON = new Set(['the', 'a', 'an', 'and', 'of', 'lil', 'dj', 'mc', 'big', 'young']);
  function artistOverlap(a, b) {
    const A = [...tokens(a)].filter((t) => !COMMON.has(t));
    const B = new Set([...tokens(b)].filter((t) => !COMMON.has(t)));
    if (!A.length || !B.size) return overlap(a, b);
    return A.filter((t) => B.has(t)).length / Math.min(A.length, B.size);
  }

  // Timed lyrics fit only the cut they were timed on: a music video with an intro (or a longer outro) is longer
  // than the studio song lrclib lists, and its lyrics then ran ahead of the singing (#33). Further apart than
  // this, a result's words can still show, untimed.
  const SYNC_TOLERANCE_S = 6;
  function syncedFits(item, duration) {
    const len = Number(item && item.duration) || 0;
    return !(duration > 0 && len > 0 && Math.abs(len - duration) > SYNC_TOLERANCE_S);
  }

  // lrclib search results -> the best one for this song, or null when nothing really matches. A result whose
  // length is too far off for its timing comes back with its plain lyrics only.
  function pickBest(list, want, duration) {
    if (!Array.isArray(list)) return null;
    let best = null, bestScore = 0;
    for (const raw of list) {
      if (!raw || raw.instrumental) continue;
      const item = raw.syncedLyrics && !syncedFits(raw, duration) ? { ...raw, syncedLyrics: null } : raw;
      if (!item.syncedLyrics && !item.plainLyrics) continue;
      const t = Math.max(...want.titles.map((w) => titleMatch(w, item.trackName || item.name)));
      const a = Math.max(0, ...want.artists.map((w) => artistOverlap(w, item.artistName)));
      const d = duration > 0 && item.duration > 0 ? Math.abs(item.duration - duration) : null;
      if (t < 0.75) continue;
      // another artist's song of the same name and length was taken too (#47): only when ours isn't known
      if (a < 0.5 && !(want.unsure && d !== null && d <= 3)) continue;
      let score = t * 3 + a * 2 + (item.syncedLyrics ? 1 : 0);
      if (d !== null) score += d <= 2 ? 1.5 : d <= 8 ? 0.5 : -1;
      if (score > bestScore) { best = item; bestScore = score; }
    }
    return best;
  }

  const api = { parseForLyrics, pickBest, syncedFits, cleanTitle, cleanArtist, splitArtists, norm };
  if (typeof module !== 'undefined') module.exports = api;
  else window.UrielLyricsMatch = api; // the page uses it to show clean song names (Encore)
})();
