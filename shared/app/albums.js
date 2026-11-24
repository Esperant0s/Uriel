// @ts-check
// Albums: playing one from a song (finding each of its songs), the artist card on the search page, saved albums
// and the Albums tab, and the thumbs up / down on a Daily Mix. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielAlbumsPart} out */
window.UrielApp.albums = function ({ el, escapeHtml, getTrackNormalizedKey, isSameTrack, Lib, normalizeImportText, openArtistProfile, playback, playTrack, pool, refreshStacks, renderAlbumCards, renderQueueView, safeArray, safeJson, showToast, shuffleQueue, sortedLibrary, state, switchView, Tm, toSeconds, updateNavIndicator, updateQueueBadge }, out) {
  async function fetchArtistCardForSearch(/** @type {string} */ query, /** @type {number} */ token, /** @type {UrielTrack[]} */ searchTracks) {
    const container = document.getElementById('search-artist-card-container');
    if (!container) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist?name=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (state.searchToken !== token) return;
      if (!data.success || !data.artist || !data.artist.name) return;

      const artist = data.artist;
      const normQ = normalizeImportText(query);
      const normA = normalizeImportText(artist.name);

      const isExactOrPrefix = normA === normQ || normA.startsWith(normQ) || normQ.startsWith(normA);
      const isTopTrackArtist = Array.isArray(searchTracks) && searchTracks.slice(0, 5).some(t => {
        const normT = normalizeImportText(t.artist);
        // a song without an artist matches nothing ("" is inside every name)
        return !!normT && (normT === normA || normT.includes(normA) || normA.includes(normT));
      });

      if (!isExactOrPrefix && !isTopTrackArtist) {
        return;
      }

      const avatarUrl = artist.avatar || (searchTracks && searchTracks[0] ? searchTracks[0].thumbnail : '');
      container.innerHTML = `
        <div class="search-artist-card" role="button" tabindex="0">
          <div class="search-artist-avatar-wrap">
            ${avatarUrl ? `<img class="search-artist-avatar" loading="lazy" decoding="async" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(artist.name)}" />` : '<div style="width:100%;height:100%;background:var(--md-sys-color-surface-container);"></div>'}
          </div>
          <div class="search-artist-info">
            <span class="search-artist-name">${escapeHtml(artist.name)}</span>
            <span class="search-artist-label" data-i18n>Artist</span>
          </div>
        </div>
      `;

      const card = /** @type {HTMLElement | null} */ (container.querySelector('.search-artist-card'));
      if (card) {
        card.addEventListener('click', () => openArtistProfile(artist.name));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openArtistProfile(artist.name);
          }
        });
      }
    } catch (e) {}
  }

  const albumResolved = new Map();

  function normalizeMatchText(/** @type {string | undefined} */ str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function resolveAlbumTrack(/** @type {UrielAlbum} */ album, /** @type {UrielTrack} */ t) {
    if (!album || !t) return null;
    const albumId = album.id || '';
    const trackNo = t.no != null ? t.no : 1;
    // per disc: track 1 of disc 2 isn't track 1 of disc 1
    const cacheKey = `${albumId}:${t.disc || 1}:${trackNo}`;
    if (albumResolved.has(cacheKey)) {
      return albumResolved.get(cacheKey);
    }

    const query = `${t.artist || album.artist || ''} ${t.title || ''}`.trim();
    const platform = state.platform || 'youtube';
    let picked = null;
    try {
      const url = `http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(query)}&platform=${platform}&limit=5`;
      const res = await fetch(url);
      const data = await res.json();
      const results = (data && Array.isArray(data.tracks)) ? data.tracks.slice(0, 5) : [];
      if (results.length > 0) {
        const normAlbumTitle = normalizeMatchText((t.title || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/\b(feat|ft)\b.*$/i, ''));
        const targetSec = t.durationMs ? t.durationMs / 1000 : null;
        const matching = normAlbumTitle
          ? results.filter((/** @type {UrielTrack} */ cand) => normalizeMatchText(cand.title).includes(normAlbumTitle))
          : [];

        if (matching.length > 0) {
          if (targetSec != null) {
            picked = matching.find((/** @type {UrielTrack} */ c) => {
              const cSec = toSeconds(c.duration);
              return cSec > 0 && Math.abs(cSec - targetSec) <= 6;
            }) || matching[0];
          } else {
            picked = matching[0];
          }
        }
      }
    } catch (err) {
      console.warn('[albums] resolve error:', err);
    }

    if (picked) {
      albumResolved.set(cacheKey, picked);
    }
    return picked;
  }

  function isEpisodeAlbum(/** @type {UrielTrack[]} */ tracks) {
    if (!tracks || tracks.length < 4) return false;
    const chapterLike = tracks.filter((/** @type {UrielTrack} */ t) => /^(kapitel|inhaltsangabe|titelmusik|teil|chapter)\b|\((teil|kapitel|part|chapter)\s*\d+\)/i.test((t.title || '').trim())).length;
    return chapterLike / tracks.length >= 0.6;
  }

  async function playEpisodeAlbum(/** @type {UrielAlbum} */ album, /** @type {UrielTrack[]} */ tracks, /** @type {number} */ runId) {
    const totalSec = tracks.reduce((/** @type {number} */ a, /** @type {UrielTrack} */ t) => a + (t.durationMs || 0), 0) / 1000;
    const platform = state.platform || 'youtube';
    const queries = [
      `${album.artist || ''} ${album.title || ''} ganzes Hörspiel`.trim(),
      `${album.artist || ''} ${album.title || ''}`.trim()
    ];
    let picked = null;
    for (const query of queries) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(query)}&platform=${platform}&limit=8`);
        const data = await res.json();
        const results = (data && Array.isArray(data.tracks)) ? data.tracks : [];
        const epTitle = normalizeMatchText((album.title || '').replace(/^\s*folge\s*\d+\s*[:\-]?\s*/i, '').replace(/\(.*?\)/g, ''));
        const epNum = ((album.title || '').match(/folge\s*(\d+)/i) || [])[1];
        const long = results.filter((/** @type {UrielTrack} */ c) => {
          if (toSeconds(c.duration) < 600) return false;
          const ct = normalizeMatchText(c.title);
          if (epTitle && ct.includes(epTitle)) return true;
          return !!epNum && new RegExp('folge\\s*' + epNum + '(\\D|$)').test(ct);
        });
        if (long.length) {
          picked = long.slice().sort((/** @type {UrielTrack} */ a, /** @type {UrielTrack} */ b) => Math.abs(toSeconds(a.duration) - totalSec) - Math.abs(toSeconds(b.duration) - totalSec))[0];
          break;
        }
      } catch (e) {}
    }
    if (playback.albumRunId !== runId) return;
    if (!picked) {
      showToast(Tm('This album does not exist'), 'warning');
      return;
    }
    playTrack(picked, [picked], 0, 'album');
  }

  async function playAlbumFrom(/** @type {UrielAlbum} */ album, /** @type {UrielTrack[]} */ tracks, startIndex = 0) {
    if (!album || !tracks || !tracks.length) return;
    const runId = ++playback.albumRunId;

    const toastTimer = setTimeout(() => {
      showToast(Tm('Finding songs…'), 'info');
    }, 800);

    if (isEpisodeAlbum(tracks)) {
      await playEpisodeAlbum(album, tracks, runId);
      clearTimeout(toastTimer);
      return;
    }

    const startIdx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const firstResolved = await resolveAlbumTrack(album, tracks[startIdx]);
    clearTimeout(toastTimer);

    if (playback.albumRunId !== runId) return;

    if (!firstResolved) {
      showToast(Tm('This album does not exist'), 'warning');
      return;
    }

    playTrack(firstResolved, [firstResolved], 0, 'album');

    const remaining = tracks.map((/** @type {UrielTrack} */ t, /** @type {number} */ idx) => ({ t, idx })).filter((/** @type {{ t: UrielTrack, idx: number }} */ item) => item.idx !== startIdx);
    const resolvedMap = new Map();
    let skippedCount = 0;

    await pool(remaining, 4, async (/** @type {{ t: UrielTrack, idx: number }} */ item) => {
      if (playback.albumRunId !== runId) return;
      const resTrack = await resolveAlbumTrack(album, item.t);
      if (playback.albumRunId !== runId) return;
      if (resTrack) {
        resolvedMap.set(item.idx, resTrack);
      } else {
        skippedCount++;
      }
    });

    if (playback.albumRunId !== runId) return;

    // the album continues after the song that was clicked; the earlier songs come after the last one
    // (they used to be queued right after it, so Next on track 4 played track 1)
    for (let k = 1; k < tracks.length; k++) {
      const i = (startIdx + k) % tracks.length;
      const cand = resolvedMap.get(i);
      if (!cand) continue;
      const alreadyInQueue = state.queue.some((/** @type {UrielTrack} */ q) => isSameTrack(q, cand));
      if (!alreadyInQueue) {
        state.queue.push(cand);
      }
    }
    // the album's songs come in after the first one starts: mix them in now
    if (state.isShuffle) { state.unshuffledQueue = null; shuffleQueue(); }
    updateQueueBadge();
    if (state.currentView === 'queue') renderQueueView();

    if (skippedCount > 0) {
      showToast(Tm('{0} songs not found', skippedCount), 'warning');
    }
  }

  // ---- saved albums: the heart on an album page and the Albums tab (Settings > Tracks > Show Albums tab) ----
  // Kept in uriel_saved_albums, the same on every linked device (sync.js). library-pages.js decides what is
  // "the same album" and what a saved album keeps.
  const SAVED_ALBUMS_KEY = 'uriel_saved_albums';
  const getSavedAlbums = () => safeArray(SAVED_ALBUMS_KEY);
  function setSavedAlbums(/** @type {UrielAlbum[]} */ list) {
    try { localStorage.setItem(SAVED_ALBUMS_KEY, JSON.stringify(list)); } catch (e) {}
    updateAlbumsCount();
    if (state.currentView === 'albums') renderSavedAlbums();
  }
  function updateAlbumsCount() {
    const n = getSavedAlbums().length;
    const badge = document.getElementById('albums-count');
    if (badge) badge.textContent = String(n);
    const sub = document.getElementById('albums-subtitle');
    if (sub) sub.textContent = `${n} album${n === 1 ? '' : 's'} saved`;
  }
  function renderSavedAlbums() {
    const grid = document.getElementById('saved-albums-grid');
    if (!grid) return;
    updateAlbumsCount();
    const albums = sortedLibrary('albums', getSavedAlbums());
    if (!albums.length) {
      grid.innerHTML = '<div class="empty-hint">No saved albums yet. Open an album and tap the heart to save it.</div>';
      return;
    }
    renderAlbumCards(grid, albums, (/** @type {UrielAlbum} */ a) => [a.type && a.type !== 'Album' ? a.type : '', a.artist, a.year].filter(Boolean).join(' · '));
  }
  // the Albums tab and the heart only show when Settings > Tracks > Show Albums tab is on
  const btnShowAlbums = document.getElementById('btn-show-albums');
  function applyShowAlbums() {
    const show = localStorage.getItem('uriel_show_albums') === '1';
    document.body.classList.toggle('hide-albums-tab', !show);
    if (el.navAlbums) el.navAlbums.classList.toggle('nav-collapsed', !show);
    if (btnShowAlbums) btnShowAlbums.classList.toggle('active', show);
    if (!show && state.currentView === 'albums') switchView('discover');
    refreshStacks();
    updateNavIndicator(false);
  }
  if (btnShowAlbums) {
    btnShowAlbums.addEventListener('click', () => {
      localStorage.setItem('uriel_show_albums', localStorage.getItem('uriel_show_albums') === '1' ? '0' : '1');
      applyShowAlbums();
    });
  }

  // the album on the album page (an album, or a Daily Mix)
  /** @type {UrielAlbum | null} */
  let albumOnPage = null;
  function updateSaveAlbumButton() {
    const btn = document.getElementById('btn-save-album');
    if (!btn || !albumOnPage) return;
    const saved = Lib.isAlbumSaved(getSavedAlbums(), albumOnPage);
    btn.classList.toggle('active', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.title = saved ? 'Remove from your albums' : 'Save album';
    btn.setAttribute('aria-label', btn.title);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
  }
  const btnSaveAlbum = document.getElementById('btn-save-album');
  if (btnSaveAlbum) {
    btnSaveAlbum.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!albumOnPage || albumOnPage.type === 'Daily Mix') return;
      const r = Lib.toggleSavedAlbum(getSavedAlbums(), albumOnPage);
      setSavedAlbums(/** @type {UrielAlbum[]} */ (r.list));
      updateSaveAlbumButton();
      showToast(r.saved ? 'Saved to your albums' : 'Removed from your albums', 'info');
    });
  }

  // ---- Daily Mixes: thumbs up / down ("Do you like these songs?") on a mix's page ----
  // A liked mix makes its songs and artists count for more in My Wave and tomorrow's mixes; a disliked one keeps
  // what it brought in out of them (library-pages.js). Asked once per mix, and the mixes change every day.
  const MIX_FEEDBACK_KEY = 'uriel_mix_feedback';
  const getMixFeedback = () => Lib.cleanFeedback(safeJson(MIX_FEEDBACK_KEY, null));
  function showAlbumExtras(/** @type {UrielAlbum} */ album) {
    albumOnPage = album;
    const isMix = album.type === 'Daily Mix';
    if (btnSaveAlbum) btnSaveAlbum.hidden = isMix;
    updateSaveAlbumButton();
    const box = document.getElementById('daily-mix-feedback');
    if (!box) return;
    box.classList.toggle('hidden', !isMix || Lib.isMixRated(getMixFeedback(), album.id));
    box.classList.remove('fading-out');
    box.querySelectorAll('.daily-mix-rate-btn').forEach(b => b.classList.remove('active'));
  }
  function rateDailyMix(/** @type {boolean} */ isLike) {
    const mix = albumOnPage;
    if (!mix || mix.type !== 'Daily Mix') return;
    const fb = Lib.rateMix(getMixFeedback(), { id: mix.id, artists: mix.mixArtists || [], tracks: mix.tracks || [] }, isLike, (/** @type {UrielTrack} */ t) => getTrackNormalizedKey(t.artist, t.title));
    try { localStorage.setItem(MIX_FEEDBACK_KEY, JSON.stringify(fb)); } catch (e) {}
    const like = document.getElementById('btn-dm-like');
    const dislike = document.getElementById('btn-dm-dislike');
    if (like) like.classList.toggle('active', isLike);
    if (dislike) dislike.classList.toggle('active', !isLike);
    showToast(isLike ? 'Glad you like this mix' : 'Got it. Less like this from now on', 'info');
    const box = document.getElementById('daily-mix-feedback');
    setTimeout(() => {
      if (!box) return;
      box.classList.add('fading-out');
      setTimeout(() => { box.classList.add('hidden'); box.classList.remove('fading-out'); }, 280);
    }, 350);
  }
  const btnDmLike = document.getElementById('btn-dm-like');
  const btnDmDislike = document.getElementById('btn-dm-dislike');
  if (btnDmLike) btnDmLike.addEventListener('click', () => rateDailyMix(true));
  if (btnDmDislike) btnDmDislike.addEventListener('click', () => rateDailyMix(false));

  /** @type {UrielAlbumsPart} */
  const api = { fetchArtistCardForSearch, resolveAlbumTrack, playAlbumFrom, getSavedAlbums, setSavedAlbums, updateAlbumsCount, renderSavedAlbums, applyShowAlbums, updateSaveAlbumButton, getMixFeedback, showAlbumExtras };
  Object.assign(out, api);
};
