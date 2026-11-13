// @ts-check
// Importing music from elsewhere, the part with no page in it: reading Spotify's and Apple Music's export files,
// lengths given in seconds, milliseconds or m:ss, names tidied for matching, and what an import error means.
// app.js and app/imports.js run it in the app, test/import-core.test.js in Node.
(function (root) {
  function normalizeImportText(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*[\(\[](?:feat|ft)\.?\s+[^)\]]+[)\]]/gi, '')
      .replace(/\s*-\s*remaster(?:ed)?\b.*/gi, '')
      .replace(/[\(\[][^)\]]*remaster(?:ed)?[^)\]]*[)\]]/gi, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // search results give seconds; only a value longer than a day is taken as milliseconds (the old cut-off,
  // 1000, turned every song or episode over 16 minutes into a few seconds)
  const MS_DURATION_ABOVE = 86400;
  function toSeconds(dur) {
    if (typeof dur === 'string') {
      const trimmed = dur.trim();
      if (/^\d+(:\d{1,2}){1,2}$/.test(trimmed)) {
        return trimmed.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
      }
      const num = Number(trimmed);
      if (!Number.isNaN(num) && num > 0) {
        return num > MS_DURATION_ABOVE ? Math.round(num / 1000) : Math.round(num);
      }
      return 0;
    }
    if (typeof dur === 'number' && dur > 0) {
      return dur > MS_DURATION_ABOVE ? Math.round(dur / 1000) : Math.round(dur);
    }
    return 0;
  }

  const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g' };
  function normalizeForMatch(s) {
    return String(s || '').toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\b(feat|ft|remaster(ed)?|remix|version|official|audio|video|lyrics?)\b.*$/g, ' ')
      .split('').map((c) => (CYR[c] !== undefined ? CYR[c] : c)).join('')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // One of Spotify's export files, already parsed (YourLibrary.json, Playlist1.json, or a streaming history): the
  // songs it lists as { likes, playlists: [{ name, tracks }] }. msPlayed (streaming history) is how long a song was
  // listened to, not how long it is, so it is never taken as the length.
  function parseSpotifyExport(json) {
    const likes = [];
    const playlists = [];
    const song = (title, artist, durMs) => ({ title: String(title).trim(), artist: String(artist).trim(), duration: durMs ? Math.round(durMs / 1000) : undefined });
    const rawTracks = Array.isArray(json?.tracks) ? json.tracks : (Array.isArray(json) ? json : null);
    if (rawTracks) {
      for (const item of rawTracks) {
        if (!item) continue;
        const title = item.track || item.trackName;
        const artist = item.artist || item.artistName;
        if (title && artist) likes.push(song(title, artist, item.durationMs || item.duration_ms));
      }
    }
    const rawPlaylists = Array.isArray(json?.playlists) ? json.playlists : (Array.isArray(json) && json[0]?.items ? json : null);
    if (rawPlaylists) {
      for (const pl of rawPlaylists) {
        if (!pl) continue;
        const tracks = [];
        for (const it of (Array.isArray(pl.items) ? pl.items : [])) {
          if (!it || !it.track) continue;
          const title = it.track.trackName || it.track.track;
          const artist = it.track.artistName || it.track.artist;
          if (title && artist) tracks.push(song(title, artist, it.track.durationMs || it.track.duration_ms));
        }
        if (tracks.length) playlists.push({ name: pl.name || 'Imported Playlist', tracks });
      }
    }
    return { likes, playlists };
  }

  // each song once: a streaming-history file lists a song once per play (60 plays of 3 songs meant 60 searches)
  function uniqueSongs(list) {
    const seen = new Set();
    return list.filter((t) => {
      const k = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // `ms`: the field says milliseconds (durationInMillis, duration_ms, "Milliseconds"). Otherwise only a big number
  // is taken as milliseconds: the old cut-off, 1000, made a 20-minute track given in seconds last 1 second
  function parseAppleDuration(val, ms = false) {
    if (val == null) return undefined;
    const s = String(val).trim();
    if (!s) return undefined;
    if (s.includes(':')) {
      const parts = s.split(':').map(Number);
      if (parts.some(isNaN)) return undefined;
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const n = Number(s);
    if (!isNaN(n)) return ms || n > 10000 ? Math.round(n / 1000) : Math.round(n);
    return undefined;
  }

  function parseAppleCSV(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { headers: [], rows: [] };
    const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',');
    function splitRow(row) {
      const res = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === '"') {
          if (inQuotes && row[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (c === delim && !inQuotes) {
          res.push(cur.trim());
          cur = '';
        } else cur += c;
      }
      res.push(cur.trim());
      return res;
    }
    const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitRow(lines[i]);
      const row = {};
      for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] || '';
      rows.push(row);
    }
    return { headers, rows };
  }

  function parseAppleExportCSV(text) {
    const { headers, rows } = parseAppleCSV(text);
    const titleCol = headers.find(h => /^(title|name|track\s*name|song(\s*name)?|track\s*description)$/i.test(h)) || headers.find(h => /(title|song|track)/i.test(h));
    const artistCol = headers.find(h => /^(artist(\s*name)?|artist\(s\)|creator|uploader)$/i.test(h)) || headers.find(h => /artist/i.test(h));
    const durCol = headers.find(h => /(duration|time|length)/i.test(h));
    const plCol = headers.find(h => /(playlist(\s*name)?|container(\s*description|\s*name)?)/i.test(h));

    const likes = [];
    const playlistsMap = new Map();

    for (const r of rows) {
      const title = titleCol ? r[titleCol] : '';
      const artist = artistCol ? r[artistCol] : '';
      if (!title || !artist) continue;
      const dur = durCol ? parseAppleDuration(r[durCol], /milli|\bms\b/i.test(durCol)) : undefined;
      const pl = plCol ? r[plCol].trim() : '';
      const track = { title: title.trim(), artist: artist.trim(), duration: dur };
      if (pl) {
        if (!playlistsMap.has(pl)) playlistsMap.set(pl, []);
        playlistsMap.get(pl).push(track);
      } else {
        likes.push(track);
      }
    }
    const playlists = [];
    for (const [name, tracks] of playlistsMap.entries()) playlists.push({ name, tracks });
    return { likes, playlists };
  }

  function parseAppleExportJSON(json) {
    const likes = [];
    const playlistsMap = new Map();

    function walk(node, currentPl = '') {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, currentPl);
        return;
      }
      // Apple's own export writes "Title", "Artist", "Track Duration": also look keys up in lower case, like the CSV path
      const lowered = {};
      for (const [k, v] of Object.entries(node)) { lowered[k] = v; const lk = k.toLowerCase(); if (!(lk in lowered)) lowered[lk] = v; }
      node = lowered;

      let pl = currentPl;
      if (node.playlistName || node.playlist || node['playlist name']) {
        pl = node.playlistName || node.playlist || node['playlist name'];
      }

      if (Array.isArray(node.tracks) && (node.name || node.title)) {
        const pName = node.name || node.title;
        for (const t of node.tracks) walk(t, pName);
        return;
      }
      if (Array.isArray(node.items) && (node.name || node.title)) {
        const pName = node.name || node.title;
        for (const t of node.items) walk(t, pName);
        return;
      }

      const title = String(node.title || node.name || node.trackName || node.song || node['track name'] || node['song name'] || '').trim();
      const artist = String(node.artistName || node.artist || node.artist_name || node['artist name'] || '').trim();
      const durRaw = node.durationInMillis || node.duration || node.duration_ms || node.time || node.trackDuration || node['track duration'];
      const duration = parseAppleDuration(durRaw, durRaw != null && (durRaw === node.durationInMillis || durRaw === node.duration_ms));

      if (title && artist && (node.type === 'song' || node.type === 'songs' || duration || pl || node.contentDescriptor)) {
        const track = { title, artist, duration };
        if (pl) {
          if (!playlistsMap.has(pl)) playlistsMap.set(pl, []);
          playlistsMap.get(pl).push(track);
        } else {
          likes.push(track);
        }
        return;
      }

      for (const k of Object.keys(node)) {
        walk(node[k], pl);
      }
    }

    walk(json);
    const playlists = [];
    for (const [name, tracks] of playlistsMap.entries()) playlists.push({ name, tracks });
    return { likes, playlists };
  }

  // What went wrong with an import, for people: { code, title, hint, icon } (icon is a name; app/imports.js has the
  // pictures). `online`: whether the device has a connection.
  function classifyImportError(provider, statusOrError, body, online = true) {
    let status = typeof statusOrError === 'number' ? statusOrError : 0;
    let rawMsg = '';
    if (statusOrError instanceof Error) {
      rawMsg = statusOrError.message || String(statusOrError);
    }
    if (typeof body === 'string') {
      rawMsg = rawMsg ? `${rawMsg} ${body}` : body;
    } else if (body && typeof body === 'object') {
      if (body.status && !status) status = Number(body.status);
      if (body.error) rawMsg = rawMsg ? `${rawMsg} ${body.error}` : String(body.error);
    }
    const msg = (rawMsg || '').toLowerCase();

    // the song search went quiet partway through matching (matchSpotifyTracks): not a problem with the playlist
    if (msg.includes('search_unresponsive')) {
      return { code: 'search_unresponsive', title: 'Search is not responding, so the import stopped', hint: 'Try again later; nothing gets added twice', icon: 'network' };
    }

    if (body && typeof body === 'object') {
      if (body.code === 'spotify_incomplete') {
        return { code: 'spotify_incomplete', title: 'Spotify returned only part of this playlist', hint: 'Connect your account or use Export files', icon: 'restricted' };
      }
      if (body.code === 'spotify_forbidden' || (provider === 'spotify' && status === 403)) {
        return { code: 'spotify_forbidden', title: 'Spotify refused this playlist request (403)', hint: 'Try connecting an authorized account or use Export files', icon: 'restricted' };
      }
      if (body.code === 'spotify_rate_limited' || (provider === 'spotify' && status === 429)) {
        return { code: 'spotify_rate_limited', title: 'Spotify is rate limiting requests. Wait a minute and try again.', hint: '', icon: 'clock' };
      }
      if (body.code === 'spotify_not_found' || (provider === 'spotify' && status === 404)) {
        return { code: 'spotify_not_found', title: 'Playlist not found. Is it public?', hint: '', icon: 'search' };
      }
      if (body.code === 'yandex_region') {
        return { code: 'yandex_region', title: "Yandex Music isn't available where you are", hint: 'Yandex only serves some countries', icon: 'restricted' };
      }
      if (body.code === 'yandex_private') {
        return { code: 'yandex_private', title: "Yandex Music didn't share this playlist", hint: 'Make it public in Yandex Music, or use its older link: music.yandex.ru/users/NAME/playlists/NUMBER', icon: 'lock' };
      }
      if (body.code === 'yandex_failed') {
        return { code: 'yandex_failed', title: "Couldn't read this playlist from Yandex Music", hint: 'Try again later, or use Export files', icon: 'unknown' };
      }
    }

    if (!online || msg.includes('network') || msg.includes('fetch') || msg.includes('dns') || msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('offline') || msg.includes('etimedout')) {
      return { code: 'network', title: "Can't reach the service", hint: 'Check your connection', icon: 'network' };
    }
    if (status === 429 || msg.includes('429') || msg.includes('too many requests')) {
      let hint = 'Try again in a minute';
      const mRetry = msg.match(/retry-after:?\s*(\d+)/i) || msg.match(/try again in\s*(\d+)/i);
      if (mRetry) hint = `Try again in ${mRetry[1]}s`;
      return { code: 'rate_limit', title: 'Too many requests', hint, icon: 'clock' };
    }
    if (status === 404 || msg.includes('404') || msg.includes('not found') || msg.includes('deleted') || msg.includes('does not exist') || msg.includes('incomplete youtube id') || msg.includes('unsupported link') || msg.includes('invalid spotify playlist url') || msg.includes('invalid apple music playlist url')) {
      return { code: 'not_found', title: 'Playlist not found', hint: 'Check the link', icon: 'search' };
    }
    if (msg.includes('private') || msg.includes('isprivate') || msg.includes('sign in') || msg.includes('signin') || status === 401 || (provider !== 'spotify' && (status === 403 || msg.includes('403')))) {
      return { code: 'private', title: 'Your playlist is private', hint: 'Make it public and try again', icon: 'lock' };
    }
    if (status === 403 || msg.includes('403') || msg.includes('forbidden') || msg.includes('restricted') || msg.includes('refused')) {
      return { code: 'restricted', title: provider === 'spotify' ? "Spotify doesn't allow reading this playlist" : "This service doesn't allow reading this playlist", hint: 'Try the Export files method', icon: 'restricted' };
    }
    return { code: 'unknown', title: "Couldn't read this playlist", hint: (provider === 'spotify' || provider === 'apple') ? 'Try the Export files method' : 'Check the link', icon: 'unknown' };
  }

  const api = {
    normalizeImportText, toSeconds, normalizeForMatch,
    parseSpotifyExport, uniqueSongs,
    parseAppleDuration, parseAppleCSV, parseAppleExportCSV, parseAppleExportJSON,
    classifyImportError,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UrielImportCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
