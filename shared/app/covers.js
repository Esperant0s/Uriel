// @ts-check
// Song covers (#18, #31): every picture worth trying for a song, best first, YouTube frames without their black
// bars, the next one to try when a cover fails, and covers that turned up saved back with the song. Part of
// app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielCoversPart} out */
window.UrielApp.covers = function ({ getAdv, getTrackArt, getTrackCanonicalId, isPhoneApp, state, tokenUrl }, out) {
  function listThumb(/** @type {string} */ url) {
    if (!url || !getAdv('light_thumbs', true)) return url;
    const yt = url.match(/^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{6,})\//);
    if (yt) return `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg`;
    if (/(googleusercontent|ggpht)\.com/.test(url)) return url.replace(/=w\d+-h\d+[^&?]*$/, '=w120-h120-l90-rj').replace(/=s\d+[^&?]*$/, '=s120');
    if (/sndcdn\.com/.test(url)) return url.replace(/-(t500x500|original|crop)\./, '-t300x300.');
    return url;
  }

  // Cover art (#18). Many saved songs (synced, restored, imported, matched on play) carry no thumbnail or a
  // dead one, and the row just hid its picture. A YouTube song's cover can always be derived from its id, and a
  // failed picture walks down a list of candidates instead of giving up.
  const YT_THUMB = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;
  function trackYoutubeId(/** @type {UrielTrack} */ track) {
    if (!track) return '';
    const p = String(track.platform || '').toLowerCase();
    if (p === 'local' || p === 'soundcloud' || p === 'sc') return '';
    const m = String(track.url || track.videoId || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return m[1];
    if (/^[\w-]{11}$/.test(String(track.videoId || ''))) return track.videoId;
    if ((p === 'youtube' || p === 'ytmusic' || p === 'yt' || (!p && !track.url)) && /^[\w-]{11}$/.test(String(track.id || ''))) return String(track.id);
    return '';
  }
  // YouTube's 4:3 frames (hqdefault, sddefault, default, 0-3) have black bars baked in above and below the 16:9
  // video, and a square cover showed them, around the video's own side panels (#31). The 16:9 frames have no
  // bars, and their middle square is the artwork of an album-art video: maxresdefault, else mqdefault (always there).
  const YT_BOXED = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:hqdefault|sddefault|default|[0-3])\.(?:jpg|webp)(?:\?.*)?$/;
  function unboxedYt(/** @type {string | undefined} */ url) {
    const m = typeof url === 'string' ? url.match(YT_BOXED) : null;
    return m ? `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg` : url;
  }
  // a missing maxresdefault is YouTube's 120x90 grey stand-in, which loads fine (no error): use mqdefault
  document.addEventListener('load', (e) => {
    const img = /** @type {HTMLImageElement} */ (e.target);
    if (!img || img.tagName !== 'IMG' || img.naturalWidth > 120) return;
    const m = (img.getAttribute('src') || '').match(/^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:maxresdefault|sddefault)\./);
    if (m) img.src = `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`;
  }, true);
  // a widescreen music video has black bars inside its own 16:9 frame, which a square cover showed as bands above
  // and below the picture (#31). The bars are found on a small copy of the frame and cut off with object-view-box
  // (Chromium only: Android and computers; elsewhere the cover stays as it was).
  const ytBars = new Map();
  function findYtBars(/** @type {string} */ id) {
    if (ytBars.has(id)) return ytBars.get(id);
    const job = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const W = 64, H = 36;
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
          ctx.drawImage(img, 0, 0, W, H);
          const px = ctx.getImageData(0, 0, W, H).data;
          const dark = (/** @type {number} */ y) => {
            let n = 0;
            for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (Math.max(px[i], px[i + 1], px[i + 2]) < 28) n++; }
            return n >= W * 0.75; // a dark scene can run into the bar, so a bar row is mostly black, not all
          };
          let top = 0, bottom = 0;
          while (top < H / 2 && dark(top)) top++;
          while (bottom < H / 2 && dark(H - 1 - bottom)) bottom++;
          // both edges dark and the bars a similar size: a letterbox, not just a dark sky or a dark floor
          const ok = top >= 2 && bottom >= 2 && Math.abs(top - bottom) <= 2 && top + bottom < H * 0.6;
          resolve(ok ? { top: (top / H) * 100, bottom: (bottom / H) * 100 } : null);
        } catch (e) { resolve(null); }
      };
      img.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    });
    ytBars.set(id, job);
    return job;
  }
  const YT_WIDE = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:mqdefault|maxresdefault|hq720)\./;
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('object-view-box', 'inset(0%)')) {
    document.addEventListener('load', (e) => {
      const img = /** @type {HTMLImageElement} */ (e.target);
      if (!img || img.tagName !== 'IMG') return;
      const m = (img.getAttribute('src') || '').match(YT_WIDE);
      img.style.objectViewBox = '';
      if (!m) return;
      const src = img.getAttribute('src');
      findYtBars(m[1]).then((/** @type {{ top: number, bottom: number } | null} */ bars) => {
        if (bars && img.getAttribute('src') === src) img.style.objectViewBox = `inset(${bars.top}% 0% ${bars.bottom}% 0%)`;
      });
    }, true);
  }
  // other sizes of a cover we already have (YouTube frames, SoundCloud artwork)
  function artVariants(/** @type {string} */ url) {
    if (!url || typeof url !== 'string') return [];
    const yt = url.match(YT_THUMB);
    if (yt) return ['maxresdefault', 'mqdefault'].map((s) => `https://i.ytimg.com/vi/${yt[1]}/${s}.jpg`);
    if (/sndcdn\.com\/.*-(t500x500|original|large|crop|t300x300)\./.test(url)) return ['t500x500', 'large', 't300x300'].map((s) => url.replace(/-(t500x500|original|large|crop|t300x300)\./, `-${s}.`));
    return [];
  }
  function derivedTrackArt(/** @type {UrielTrack} */ track) {
    const id = trackYoutubeId(track);
    return id ? artVariants(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`) : [];
  }
  // every picture worth trying for a song, best first
  function trackArtCandidates(/** @type {UrielTrack | null} */ track) {
    if (!track) return [];
    /** @type {string[]} */
    const out = [];
    const add = (/** @type {string | undefined} */ raw) => { const u = unboxedYt(raw); if (u && typeof u === 'string' && !out.includes(u)) out.push(u); };
    [getTrackArt(track).cover, track.localThumbnail, track.thumbnail, track.cover, track.image, track.artworkUrl].forEach((u) => { add(u); artVariants(u).forEach(add); });
    derivedTrackArt(track).forEach(add);
    // last: the same picture through the in-app server (kept on disk, so a blocked or dead cover host costs one
    // try), which falls back to the song's iTunes cover by artist and title. Computers only.
    if (!isPhoneApp && state.serverPort && track.title) {
      const first = out.find((u) => /^https?:\/\//.test(u) && !u.startsWith('http://127.0.0.1')) || '';
      add(tokenUrl(`http://127.0.0.1:${state.serverPort}/api/image-proxy?url=${encodeURIComponent(first)}&artist=${encodeURIComponent(track.artist || '')}&title=${encodeURIComponent(track.title)}`));
    }
    return out;
  }

  // next cover to try in a player <img> whose current one failed ('' when none is left)
  function nextPlayerArt(/** @type {UrielTrack} */ track, /** @type {HTMLImageElement} */ img) {
    if (!img || !track) return '';
    if (img.__artTrack !== track) { img.__artTrack = track; img.__artTried = new Set(); }
    const tried = /** @type {Set<string>} */ (img.__artTried);
    const cur = img.getAttribute('src') || '';
    tried.add(cur);
    const next = trackArtCandidates(track).concat(artVariants(cur)).find((u) => !tried.has(u));
    if (!next) return '';
    tried.add(next);
    img.style.display = 'block';
    img.src = next;
    return next;
  }

  function getTrackThumbUrl(/** @type {UrielTrack | null} */ track) {
    if (!track) return '';
    const o = getTrackArt(track).cover;
    if (o) return o;
    if (track.localThumbnail) return track.localThumbnail;
    return unboxedYt(track.thumbnail || track.cover || track.image || track.artworkUrl || derivedTrackArt(track)[0] || '');
  }

  // A song's cover that loaded in place of its saved (missing or dead) one is saved with the song.
  // Saved in one go once the covers stop arriving: saving per cover wrote the whole library again for every row that
  // scrolled into view, and on a phone a long list ran the page out of memory within seconds. A cover not saved
  // before the app closes is just found again next time.
  const rememberedArt = new Map();
  let rememberedArtTimer = 0;
  /** @param {string | undefined} canonicalId @param {string} url */
  function rememberTrackArt(canonicalId, url) {
    if (!canonicalId || !/^https:\/\//.test(url || '')) return;
    if (state.currentTrack && getTrackCanonicalId(state.currentTrack) === canonicalId && !getTrackArt(state.currentTrack).cover) state.currentTrack.thumbnail = url;
    rememberedArt.set(canonicalId, url);
    clearTimeout(rememberedArtTimer);
    rememberedArtTimer = window.setTimeout(saveRememberedArt, 2000);
  }
  function saveRememberedArt() {
    const art = new Map(rememberedArt);
    rememberedArt.clear();
    const fix = (/** @type {UrielTrack[]} */ arr) => {
      let changed = false;
      (arr || []).forEach((/** @type {UrielTrack} */ t) => {
        const url = t && art.get(getTrackCanonicalId(t));
        if (url && t.thumbnail !== url && !getTrackArt(t).cover) { t.thumbnail = url; changed = true; }
      });
      return changed;
    };
    try {
      if (fix(state.favorites)) localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (fix(state.history)) localStorage.setItem('devsize_history', JSON.stringify(state.history));
      let pl = false;
      (state.playlists || []).forEach((/** @type {UrielPlaylist} */ p) => { if (p && fix(p.tracks)) pl = true; });
      if (pl) localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    } catch (e) {}
  }

  // onerror of a cover <img>: next candidate (data-full, then data-art, then other sizes), hidden when none is left
  // files named "Artist - Title" keep the artist in the title as well: the row shows it once, under the title
  function rowTitle(/** @type {UrielTrack} */ track) {
    let t = track.title || 'untitled';
    const a = (track.artist || '').trim().toLowerCase();
    if (!a) return t;
    // "Artist - Title", "Artist, Other - Title" or "Artist & Other - Title", sometimes twice over
    for (let i = t.indexOf(' - '); i > 0; i = t.indexOf(' - ')) {
      const head = t.slice(0, i).toLowerCase();
      if (head !== a && !head.startsWith(a + ',') && !head.startsWith(a + ' &')) break;
      t = t.slice(i + 3);
    }
    return t;
  }
  // a song row with no cover left shows a music note on the row's grey square instead of an empty gap
  const NO_COVER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#8a8a8a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(6 6) scale(.5)"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></g></svg>');
  function nextTrackArt(/** @type {HTMLImageElement} */ img) {
    if (!img) return false;
    const tried = /** @type {Set<string>} */ (img.__artTried || (img.__artTried = new Set()));
    const cur = img.getAttribute('src') || '';
    tried.add(cur);
    let list = [];
    try { list = JSON.parse(img.dataset.art || '[]'); } catch (e) {}
    if (img.dataset.full) list.unshift(img.dataset.full);
    list = list.concat(artVariants(cur));
    const next = list.find((/** @type {string} */ u) => u && !tried.has(u));
    if (!next) {
      if (img.classList.contains('track-row-thumb') && cur !== NO_COVER) img.src = NO_COVER;
      else img.style.visibility = 'hidden';
      return false;
    }
    tried.add(next);
    const row = img.closest && /** @type {HTMLElement | null} */ (img.closest('[data-canonical-id]'));
    if (row && !img.__artRemember) {
      img.__artRemember = true;
      img.addEventListener('load', () => {
        const ok = img.getAttribute('src');
        if (img.naturalWidth > 0 && ok && ok !== img.dataset.saved && ok !== NO_COVER) rememberTrackArt(row.dataset.canonicalId, ok);
      });
    }
    img.style.visibility = '';
    img.src = next;
    return true;
  }
  window.urielArtNext = nextTrackArt;
  // Pictures with no onerror of their own (artist photos, album and playlist covers, search results, home cards)
  // showed the browser's broken-image icon when their host failed: try the picture's other sizes, then hide it
  // so the cover's placeholder shows instead
  document.addEventListener('error', (e) => {
    const img = /** @type {HTMLImageElement} */ (e.target);
    if (!img || img.tagName !== 'IMG' || img.onerror || img.hasAttribute('onerror')) return;
    if (!nextTrackArt(img)) img.classList.add('img-failed');
  }, true);

  // Old saves: give YouTube songs without a cover the one derived from their id (no network), once, when idle.
  function backfillTrackArt() {
    const fill = (/** @type {UrielTrack[]} */ arr) => {
      let changed = false;
      (arr || []).forEach((/** @type {UrielTrack} */ t) => {
        if (t && !t.thumbnail && !t.localThumbnail) { const d = derivedTrackArt(t)[0]; if (d) { t.thumbnail = d; changed = true; } }
      });
      return changed;
    };
    try {
      if (fill(state.favorites)) localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (fill(state.history)) localStorage.setItem('devsize_history', JSON.stringify(state.history));
      let pl = false;
      (state.playlists || []).forEach((/** @type {UrielPlaylist} */ p) => { if (p && fill(p.tracks)) pl = true; });
      if (pl) localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    } catch (e) {}
  }
  (window.requestIdleCallback || ((f) => setTimeout(f, 3000)))(backfillTrackArt);

  /** @type {UrielCoversPart} */
  const api = { YT_THUMB, listThumb, trackYoutubeId, trackArtCandidates, nextPlayerArt, getTrackThumbUrl, rowTitle, nextTrackArt, rememberTrackArt };
  Object.assign(out, api);
};
