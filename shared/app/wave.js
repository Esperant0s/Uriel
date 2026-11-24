// @ts-check
// My Wave on Home: your taste from favourites and history, the songs /api/vibe picks from it, the carousel and
// Jump back in, the cover-coloured light behind them, and "For you". Part of app.js, which calls this once as
// it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielWavePart} out */
window.UrielApp.wave = function ({ capMap, el, escapeHtml, getAdv, getBlocks, getMixFeedback, getTrackCanonicalId, getTrackThumbUrl, homeReady, I18N, isBlocked, isPhoneApp, isSpotifyHome, Lib, listThumb, offlineState, openArtistProfile, performSearch, playTrack, renderMadeForYou, renderQueueView, safeJson, showToast, state, T, THUMB_FALLBACK, Tm, trackArtCandidates, updateQueueBadge }, out) {
  /** @type {Map<string, Record<string, unknown>>} */
  const analysisCache = new Map();
  /** @type {UrielTrack[]} */
  let myWaveCurrentTracks = [];
  /** @type {UrielTrack[]} */
  let jumpBackCurrentTracks = [];
  let homeMode = localStorage.getItem('uriel_home_pane') === 'recent' ? 'recent' : 'wave';
  let isExtendingMyWave = false;

  function getCachedTrackAnalysis(/** @type {string | undefined} */ trackId) {
    if (!trackId) return null;
    const cleanId = String(trackId).replace(/[^a-zA-Z0-9_-]/g, '_');
    if (analysisCache.has(cleanId)) return analysisCache.get(cleanId);
    try {
      const stored = localStorage.getItem(`uriel_audio_analysis_${cleanId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        analysisCache.set(cleanId, parsed);
        capMap(analysisCache, 300);
        return parsed;
      }
    } catch (e) {}
    return null;
  }

  function setCachedTrackAnalysis(/** @type {string | undefined} */ trackId, /** @type {Record<string, unknown> | null} */ analysis) {
    if (!trackId || !analysis) return;
    const cleanId = String(trackId).replace(/[^a-zA-Z0-9_-]/g, '_');
    analysisCache.set(cleanId, analysis);
    capMap(analysisCache, 300);
    try {
      localStorage.setItem(`uriel_audio_analysis_${cleanId}`, JSON.stringify(analysis));
      fetch(`http://127.0.0.1:${state.serverPort}/api/track-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cleanId, analysis })
      }).catch(() => {});
    } catch (e) {}
  }

  function getTrackNormalizedKey(/** @type {string | undefined} */ artist, /** @type {string | undefined} */ title) {
    let a = String(artist || '').toLowerCase();
    let t = String(title || '').toLowerCase();
    t = t.replace(/\s*\([^)]*official[^)]*\)/gi, '')
         .replace(/\s*\[[^\]]*\]/gi, '')
         .replace(/\s*\([^)]*(video|audio|remaster(ed)?|lyrics?|visualizer)[^)]*\)/gi, '');
    t = t.replace(/\s*(feat\.?|ft\.?)\s+[^(\[-]+/gi, '')
         .replace(/\s*\((feat\.?|ft\.?)[^)]*\)/gi, '');
    a = a.replace(/\s*(feat\.?|ft\.?)\s+.*$/gi, '');
    a = a.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    return `${a}::${t}`;
  }

  const WAVE_SKIPS_KEY = 'uriel_wave_skips';

  function normalizeArtistName(/** @type {string} */ name) {
    return String(name || '')
      .replace(/\b(official|vevo|records|topic)\b/gi, '')
      .replace(/[^\w\s&-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function getWaveSkips() {
    try {
      const raw = localStorage.getItem(WAVE_SKIPS_KEY);
      return Array.isArray(JSON.parse(raw || 'null')) ? JSON.parse(raw || 'null') : [];
    } catch (e) {
      return [];
    }
  }

  function recordWaveSkip(/** @type {UrielTrack} */ track) {
    if (!track) return;
    const key = (typeof getTrackNormalizedKey === 'function') ? getTrackNormalizedKey(track.artist, track.title) : '';
    const artist = (track.artist || '').trim();
    if (!key && !artist) return;
    const skips = getWaveSkips();
    skips.push({ key, artist, t: Date.now() });
    if (skips.length > 200) {
      skips.splice(0, skips.length - 200);
    }
    try {
      localStorage.setItem(WAVE_SKIPS_KEY, JSON.stringify(skips));
    } catch (e) {}
  }

  function getWaveAvoid() {
    const skips = getWaveSkips();
    const keys = [];
    /** @type {Record<string, number>} */
    const artistCounts = {};
    /** @type {Record<string, string>} */
    const artistDisplay = {};

    for (const s of skips) {
      if (s && s.key) {
        keys.push(s.key);
      }
      if (s && s.artist) {
        const a = s.artist.trim();
        const normA = normalizeArtistName(a);
        if (normA) {
          artistCounts[normA] = (artistCounts[normA] || 0) + 1;
          if (!artistDisplay[normA]) {
            artistDisplay[normA] = a;
          }
        }
      }
    }

    const artists = Object.entries(artistCounts)
      .filter(([_, count]) => count >= 3)
      .map(([normA]) => artistDisplay[normA]);

    // what a thumbs down on a Daily Mix keeps out (library-pages.js)
    const disliked = Lib.feedbackAvoid(getMixFeedback());
    keys.push(...disliked.keys);
    disliked.artists.forEach((/** @type {string} */ a) => { if (!artists.includes(a)) artists.push(a); });
    // and blocked artists and songs
    const blocks = getBlocks();
    blocks.artists.forEach((/** @type {string} */ a) => { if (!artists.includes(a)) artists.push(a); });
    blocks.songs.forEach((/** @type {UrielTrack} */ t) => keys.push(getTrackNormalizedKey(t.artist, t.title)));

    return {
      keys: Array.from(new Set(keys)),
      artists
    };
  }

  async function computeTasteProfile(maxSeeds = 8) {
    const favs = Array.isArray(state.favorites) ? state.favorites : [];
    const hist = Array.isArray(state.history) ? state.history : [];

    let cyrillicCount = 0;
    /** @type {number[]} */
    const durations = [];
    const allTracks = [...favs, ...hist];

    allTracks.forEach(track => {
      if (!track) return;
      if (track.title && /[\u0400-\u04FF]/.test(track.title)) {
        cyrillicCount++;
      }
      if ((track.duration || 0) > 0) {
        durations.push(track.duration || 0);
      }
    });

    const seenHistCanIds = new Set();
    const canIdRepeatBonus = new Map();
    const canIdRecency = new Map();

    hist.forEach((track, index) => {
      if (!track) return;
      const rawCanId = String(track.id || track.url || track.key || (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(track) : '') || '').trim();
      const normKey = (track.artist && track.title && typeof getTrackNormalizedKey === 'function') ? getTrackNormalizedKey(track.artist, track.title) : '';
      const effectiveCanId = rawCanId || normKey;
      if (!effectiveCanId) return;

      if (!seenHistCanIds.has(effectiveCanId)) {
        seenHistCanIds.add(effectiveCanId);
        let recency;
        const ts = Number(track.playedAt || track.timestamp || track.date || track.time);
        if (ts && !isNaN(ts) && ts > 0) {
          const ageDays = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
          recency = Math.pow(0.5, ageDays / 21);
        } else {
          recency = Math.pow(0.97, index);
        }
        canIdRecency.set(effectiveCanId, recency);
      } else {
        const curBonus = canIdRepeatBonus.get(effectiveCanId) || 0;
        if (curBonus < 2.0) {
          canIdRepeatBonus.set(effectiveCanId, Math.min(2.0, curBonus + 0.5));
        }
      }
    });

    const mergedMap = new Map();

    function getOrCreateEntry(/** @type {UrielTrack} */ track) {
      if (!track || !track.artist || !track.title) return null;
      const artist = String(track.artist).trim();
      const title = String(track.title).trim();
      if (!artist || !title) return null;
      const normKey = (typeof getTrackNormalizedKey === 'function') ? getTrackNormalizedKey(artist, title) : '';
      if (!normKey || normKey === '::') return null;

      if (!mergedMap.has(normKey)) {
        mergedMap.set(normKey, {
          artist,
          title,
          id: track.id || '',
          platform: track.platform || state.platform || 'youtube',
          weight: 0,
          seenHistCanIds: new Set(),
          favAdded: false
        });
      }
      const entry = mergedMap.get(normKey);
      if (!entry.id && track.id) {
        entry.id = track.id;
        entry.platform = track.platform || state.platform || 'youtube';
      }
      return { entry, normKey };
    }

    favs.forEach(track => {
      const res = getOrCreateEntry(track);
      if (!res) return;
      const { entry } = res;
      if (!entry.favAdded) {
        entry.weight += 3;
        entry.favAdded = true;
      }
    });

    hist.forEach(track => {
      const res = getOrCreateEntry(track);
      if (!res) return;
      const { entry, normKey } = res;
      const rawCanId = String(track.id || track.url || track.key || (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(track) : '') || '').trim();
      const effectiveCanId = rawCanId || normKey;

      if (!entry.seenHistCanIds.has(effectiveCanId)) {
        entry.seenHistCanIds.add(effectiveCanId);
        const recency = canIdRecency.get(effectiveCanId) || 0;
        const repeatBonus = canIdRepeatBonus.get(effectiveCanId) || 0;
        entry.weight += (recency + repeatBonus);
      }
    });

    // songs from Daily Mixes you gave a thumbs up count like favourites, their artists a bit more
    const mixFeedback = getMixFeedback();
    // a rated song is kept as { id, title, artist, key }: enough to count it like a played one
    mixFeedback.likedTracks.forEach((/** @type {unknown} */ track) => {
      const res = getOrCreateEntry(/** @type {UrielTrack} */ (track));
      if (res) res.entry.weight += 3;
    });

    /** @type {Record<string, number>} */
    const artistWeights = {};
    /** @type {Record<string, string>} */
    const artistDisplayNames = {};
    mergedMap.forEach(item => {
      if (item.artist) {
        const a = item.artist.trim();
        const normArtist = normalizeArtistName(a);
        if (normArtist) {
          artistWeights[normArtist] = (artistWeights[normArtist] || 0) + item.weight;
          if (!artistDisplayNames[normArtist]) {
            artistDisplayNames[normArtist] = a;
          }
        }
      }
    });
    mixFeedback.likedArtists.forEach((/** @type {string} */ a) => {
      const normArtist = normalizeArtistName(a);
      if (!normArtist) return;
      artistWeights[normArtist] = (artistWeights[normArtist] || 0) + 4;
      if (!artistDisplayNames[normArtist]) artistDisplayNames[normArtist] = a.trim();
    });

    const sortedArtists = Object.entries(artistWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([normArtist]) => artistDisplayNames[normArtist]);

    const seeds = Array.from(mergedMap.values())
      .filter(s => s.artist && s.title && s.artist.trim() && s.title.trim())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxSeeds)
      .map(s => ({
        artist: s.artist,
        title: s.title,
        id: s.id,
        platform: s.platform || 'youtube',
        weight: Math.round(s.weight * 1000) / 1000
      }));

    const dominantScript = cyrillicCount > (allTracks.length ? allTracks.length * 0.35 : 0) ? 'Cyrillic' : 'Latin';
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    return {
      trackCount: Math.max(mergedMap.size, favs.length),
      topArtists: sortedArtists.slice(0, 5),
      dominantScript,
      avgDuration,
      bpmLabel: null,
      energyLabel: null,
      seeds
    };
  }

  function renderMyWaveChips(/** @type {unknown} */ profile) {
    const chipsContainer = document.getElementById('my-wave-chips');
    if (chipsContainer) chipsContainer.innerHTML = '';
  }

  const dominantColorsCache = new Map();

  function getCoverDominantColors(/** @type {string} */ url) {
    if (!url) return Promise.resolve(['rgb(80, 80, 120)', 'rgb(120, 80, 100)']);
    if (dominantColorsCache.has(url)) {
      return Promise.resolve(dominantColorsCache.get(url));
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
          ctx.drawImage(img, 0, 0, 32, 32);
          const data = ctx.getImageData(0, 0, 32, 32).data;

          const buckets = new Map();
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness < 30 || brightness > 230) continue;

            const qr = Math.round(r / 32) * 32;
            const qg = Math.round(g / 32) * 32;
            const qb = Math.round(b / 32) * 32;
            const key = `${qr},${qg},${qb}`;
            buckets.set(key, (buckets.get(key) || 0) + 1);
          }

          const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
          const c1 = sorted[0] ? `rgb(${sorted[0][0]})` : 'rgb(80, 100, 140)';
          const c2 = sorted[1] ? `rgb(${sorted[1][0]})` : sorted[0] ? `rgb(${sorted[0][0]})` : 'rgb(140, 80, 100)';

          const result = [c1, c2];
          dominantColorsCache.set(url, result);
          capMap(dominantColorsCache, 300);
          canvas.width = 0;
          canvas.height = 0;
          img.onload = null;
          img.onerror = null;
          img.src = '';
          resolve(result);
        } catch (e) {
          const fallback = ['rgb(80, 100, 140)', 'rgb(140, 80, 100)'];
          dominantColorsCache.set(url, fallback);
          img.onload = null;
          img.onerror = null;
          resolve(fallback);
        }
      };
      img.onerror = () => {
        if (img.crossOrigin) {
          img.crossOrigin = null;
          img.src = url;
          return;
        }
        const fallback = ['rgb(80, 100, 140)', 'rgb(140, 80, 100)'];
        dominantColorsCache.set(url, fallback);
        img.onload = null;
        img.onerror = null;
        resolve(fallback);
      };
      img.src = url;
    });
  }

  function updateTextFade(/** @type {HTMLElement} */ el) {
    if (!el) return;
    el.classList.toggle('fade-end', el.scrollWidth > el.clientWidth);
  }

  window.addEventListener('resize', () => {
    ['my-wave-focused-title', 'my-wave-focused-artist', 'jump-focused-title', 'jump-focused-artist'].forEach(id => {
      const el = document.getElementById(id);
      if (el) updateTextFade(el);
    });
  });

  let ambientIdx = 0;
  let currentAmbientUrl = null;
  async function setHomeAmbient(/** @type {string} */ url) {
    const box = document.getElementById('home-ambient');
    if (!box) return;
    const layers = /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('.home-ambient-layer'));
    if (!url) {
      currentAmbientUrl = null;
      layers.forEach((l) => {
        l.classList.remove('on');
        l.style.background = '';
      });
      return;
    }
    currentAmbientUrl = url;
    try {
      const [c1, c2] = await getCoverDominantColors(url);
      if (currentAmbientUrl !== url) return;
      const next = /** @type {HTMLElement} */ (layers[ambientIdx ^ 1]);
      const prev = layers[ambientIdx];
      const gradient = `radial-gradient(circle 550px at 28% 35%, ${c1} 0%, transparent 68%), radial-gradient(circle 550px at 72% 65%, ${c2} 0%, transparent 68%)`;
      if (next) {
        next.style.backgroundImage = 'none';
        next.style.background = gradient;
        next.classList.add('on');
      }
      if (prev) {
        prev.classList.remove('on');
      }
      ambientIdx ^= 1;
    } catch (e) {
      console.warn('Ambient error:', e);
    }
  }

  function syncHomeAmbientVisibility() {
    const ambient = document.getElementById('home-ambient');
    if (!ambient) return;
    const isDiscoverActive = state.currentView === 'discover' && el.viewDiscover && el.viewDiscover.classList.contains('active');
    const isSearchShowing = el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden');
    const isDiscoverEmptyShowing = el.discoverEmpty && !el.discoverEmpty.classList.contains('hidden');
    const hasModes = typeof availableModes === 'function' ? availableModes().length > 0 : true;
    const isAmbientEnabled = getAdv('my_wave_ambient', true);

    const shouldShow = isDiscoverActive && !isSearchShowing && isDiscoverEmptyShowing && hasModes && isAmbientEnabled;
    ambient.classList.toggle('ambient-hidden', !shouldShow);
    ambient.style.display = shouldShow ? '' : 'none';
  }

  async function updateAmbientLight(/** @type {HTMLElement | string | null} */ ambientEl, /** @type {string} */ thumbnailUrl) {
    let url = '';
    if (typeof thumbnailUrl === 'string') {
      url = thumbnailUrl;
    } else if (typeof ambientEl === 'string') {
      if (ambientEl === 'my-wave-ambient-light' || ambientEl === 'jump-ambient-light') {
        url = typeof thumbnailUrl === 'string' ? thumbnailUrl : '';
      } else {
        url = ambientEl;
      }
    } else if (ambientEl && typeof ambientEl === 'object' && typeof thumbnailUrl === 'string') {
      url = thumbnailUrl;
    }

    syncHomeAmbientVisibility();
    setHomeAmbient(url);
  }

  let currentWaveFocusedIndex = 0;

  // a second caller (Next pressed at the end while the background top-up runs) waits for the same top-up
  // instead of getting false and doing nothing
  /** @type {Promise<boolean> | null} */
  let myWaveExtending = null;
  function extendMyWaveQueue() {
    if (!state.myWaveActive) return Promise.resolve(false);
    if (!myWaveExtending) myWaveExtending = extendMyWaveQueueOnce().finally(() => { myWaveExtending = null; });
    return myWaveExtending;
  }

  async function extendMyWaveQueueOnce() {
    if (isExtendingMyWave) return false;
    isExtendingMyWave = true;
    const queue = state.queue;
    try {
      const profile = await computeTasteProfile();
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/vibe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: (state.history || []).slice(0, 30),
          favorites: (state.favorites || []).slice(0, 25),
          platform: 'youtube',
          limit: 8,
          clientProfile: profile,
          seeds: profile.seeds,
          avoid: getWaveAvoid()
        })
      });
      const data = await res.json();
      // another list started while this was loading: its queue doesn't get wave songs
      if (!state.myWaveActive || state.queue !== queue) return false;
      if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
        const existingIds = new Set(state.queue.map((/** @type {UrielTrack} */ t) => getTrackCanonicalId(t)));
        const existingKeys = new Set(state.queue.map((/** @type {UrielTrack} */ t) => getTrackNormalizedKey(t.artist, t.title)));
        const newTracks = data.tracks.filter((/** @type {UrielTrack} */ t) => {
          const cid = getTrackCanonicalId(t);
          const nkey = getTrackNormalizedKey(t.artist, t.title);
          return !existingIds.has(cid) && !existingKeys.has(nkey) && !isBlocked(t);
        });
        if (newTracks.length > 0) {
          state.queue.push(...newTracks);
          updateQueueBadge();
          renderQueueView();
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      isExtendingMyWave = false;
    }
  }

  const btnPlayMyWave = document.getElementById('btn-play-my-wave');
  if (btnPlayMyWave) {
    btnPlayMyWave.addEventListener('click', async () => {
      if (!myWaveCurrentTracks || myWaveCurrentTracks.length === 0) {
        const profile = await computeTasteProfile();
        if (profile.trackCount < 5) {
          showToast(Tm('Save at least 5 songs to tune My Wave'));
          return;
        }
        await loadHomePage();
      }
      if (myWaveCurrentTracks && myWaveCurrentTracks.length > 0) {
        state.myWaveActive = true;
        const startIdx = (currentWaveFocusedIndex >= 0 && currentWaveFocusedIndex < myWaveCurrentTracks.length) ? currentWaveFocusedIndex : 0;
        playTrack(myWaveCurrentTracks[startIdx], [...myWaveCurrentTracks], startIdx, 'wave');
        showToast(Tm('Playing My Wave'));
      }
    });
  }

  if (el.btnRefreshVibe) {
    el.btnRefreshVibe.addEventListener('click', async () => {
      const btn = el.btnRefreshVibe;
      if (btn.classList.contains('loading')) return;

      const wrapper = document.querySelector('#section-my-wave .my-wave-carousel-wrapper');
      btn.classList.add('loading');
      if (wrapper) wrapper.classList.add('loading');

      let spinner = /** @type {HTMLElement} */ (wrapper ? wrapper.querySelector('.my-wave-carousel-spinner') : null);
      if (!spinner && wrapper) {
        spinner = document.createElement('div');
        spinner.className = 'my-wave-carousel-spinner';
        spinner.innerHTML = `
          <div class="m3-spinner-container">
            <svg class="m3-circular-progress" viewBox="0 0 48 48">
              <circle class="m3-spinner-track" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
              <circle class="m3-spinner-head" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
            </svg>
          </div>
        `;
        wrapper.appendChild(spinner);
      }
      if (spinner) spinner.style.display = 'flex';

      try {
        const ok = await loadHomePage(true);
        if (!ok) {
          showToast(Tm('Could not refresh'), 'error');
        }
      } catch (err) {
        showToast(Tm('Could not refresh'), 'error');
      } finally {
        btn.classList.remove('loading');
        if (wrapper) wrapper.classList.remove('loading');
        if (spinner) spinner.style.display = 'none';
      }
    });
  }

  function scrollCarouselTo(/** @type {HTMLElement} */ row, /** @type {number} */ idx) {
    if (!row) return;
    const cards = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('.my-wave-track-card'));
    if (cards.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(cards.length - 1, idx));
    row._targetIndex = clampedIdx;
    let step = 304;
    if (cards.length > 1) {
      step = cards[1].offsetLeft - cards[0].offsetLeft;
    } else if (cards.length === 1) {
      step = cards[0].offsetWidth + 24;
    }
    const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
    const target = Math.max(0, Math.min(maxScroll, clampedIdx * step));
    row.scrollTo({ left: target, behavior: 'smooth' });
  }

  function updateCoverflowCards(/** @type {HTMLElement | null} */ row, /** @type {HTMLElement | null} */ titleEl, /** @type {HTMLElement | null} */ artistEl, /** @type {HTMLElement | null} */ ambientEl, /** @type {UrielTrack[] | null} */ tracks) {
    if (!row) row = document.getElementById('home-vibe-grid');
    if (!row) return;
    if (!tracks) {
      tracks = (row.id === 'home-vibe-grid')
        ? (homeMode === 'recent' ? jumpBackCurrentTracks : myWaveCurrentTracks)
        : jumpBackCurrentTracks;
    }
    if (!tracks || tracks.length === 0) return;
    const cards = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('.my-wave-track-card'));
    if (cards.length === 0) return;

    if (!titleEl) titleEl = document.getElementById(row.id === 'home-vibe-grid' ? 'my-wave-focused-title' : 'jump-focused-title');
    if (!artistEl) artistEl = document.getElementById(row.id === 'home-vibe-grid' ? 'my-wave-focused-artist' : 'jump-focused-artist');
    if (!ambientEl) ambientEl = document.getElementById(row.id === 'home-vibe-grid' ? 'my-wave-ambient-light' : 'jump-ambient-light');

    let step = 304;
    if (cards.length > 1) {
      step = cards[1].offsetLeft - cards[0].offsetLeft;
    } else if (cards.length === 1) {
      step = cards[0].offsetWidth + 24;
    }
    if (!step || step <= 0) step = 304;

    const floatIndex = row.scrollLeft / step;
    const newFocused = Math.max(0, Math.min(cards.length - 1, Math.round(floatIndex)));
    if (typeof row._targetIndex === 'number' && Math.abs(row.scrollLeft - (row._targetIndex * step)) < 12) {
      row._targetIndex = undefined;
    }

    cards.forEach((card, /** @type {number} */ j) => {
      const dist = Math.abs(j - newFocused);
      card.classList.remove('near', 'far');
      if (dist === 0) {
        card.style.zIndex = '10';
      } else if (dist === 1) {
        card.classList.add('near');
        card.style.zIndex = '5';
      } else {
        card.classList.add('far');
        card.style.zIndex = '1';
      }
    });

    const prevFocused = (typeof row._focusedIndex === 'number') ? row._focusedIndex : -1;
    if (newFocused !== prevFocused && tracks[newFocused]) {
      row._focusedIndex = newFocused;
      if (row.id === 'home-vibe-grid') {
        currentWaveFocusedIndex = newFocused;
      }
      const track = tracks[newFocused];
      if (titleEl && artistEl) {
        titleEl.textContent = track.title || 'Untitled';
        artistEl.textContent = track.artist || 'Unknown';
        updateTextFade(titleEl);
        updateTextFade(artistEl);
      }
      const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(track) : '') || track.thumbnail || track.cover || track.image || '';
      updateAmbientLight(ambientEl, thumb);
    }
  }

  function getJumpBackTracks() {
    const raw = Array.isArray(state.history) ? state.history : [];
    const seen = new Set();
    const tracks = [];
    for (const t of raw) {
      if (!t || typeof t !== 'object') continue;
      const canId = (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(t) : '') || t.id || `${t.artist || ''}::${t.title || ''}`;
      if (seen.has(canId)) continue;
      seen.add(canId);
      const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(t) : '') || t.thumbnail || t.cover || t.image || t.localThumbnail || '';
      tracks.push({
        ...t,
        thumbnail: thumb,
        title: t.title || 'Untitled',
        artist: t.artist || t.uploader || 'Unknown artist'
      });
      if (tracks.length >= 15) break;
    }
    return tracks;
  }

  function buildHomeCard(/** @type {UrielTrack} */ track, /** @type {string} */ mode, /** @type {number} */ idx) {
    const card = document.createElement('div');
    card.className = 'my-wave-track-card';
    if (typeof idx === 'number') card.dataset.index = String(idx);
    const thumbUrl = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(track) : '') || track.thumbnail || track.cover || track.image || '';
    card.innerHTML = `
      <div class="my-wave-track-cover-wrap">
        <img class="my-wave-track-cover" loading="lazy" decoding="async" src="${escapeHtml(thumbUrl)}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'280\\' height=\\'280\\' fill=\\'%23555\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'">
        <div class="my-wave-track-play-overlay">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      const row = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
      const curIdx = (typeof idx === 'number') ? idx : parseInt(String(card.dataset.index), 10);
      const focusedIndex = (row && typeof row._focusedIndex === 'number') ? row._focusedIndex : 0;
      if (curIdx === focusedIndex) {
        if (mode === 'wave') {
          state.myWaveActive = true;
          const waveQueue = [...myWaveCurrentTracks];
          playTrack(track, waveQueue, curIdx, 'wave');
        } else {
          state.myWaveActive = false;
          const recentTracks = jumpBackCurrentTracks.length > 0 ? jumpBackCurrentTracks : getJumpBackTracks();
          playTrack(track, [...recentTracks], curIdx);
        }
      } else if (row) {
        scrollCarouselTo(row, curIdx);
      }
    });

    return card;
  }

  function getWaveSpinnerHtml() {
    return `
      <div class="m3-spinner-container" style="margin: auto;">
        <svg class="m3-circular-progress" viewBox="0 0 48 48">
          <circle class="m3-spinner-track" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
          <circle class="m3-spinner-head" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
        </svg>
      </div>
    `;
  }

  function renderHomeCarousel(/** @type {string} */ mode) {
    if (!mode) mode = homeMode || 'wave';
    homeMode = mode;

    const headerLabel = /** @type {HTMLElement} */ (document.querySelector('#section-my-wave .home-pane-label'));
    if (headerLabel) {
      const waveLabel = (state.isHotPicks && state.hotPicksTitle) ? state.hotPicksTitle : 'My Wave';
      if (mode === 'recent' || waveLabel === 'My Wave') I18N.text(headerLabel, mode === 'recent' ? 'Jump back in' : 'My Wave');
      else headerLabel.textContent = waveLabel;
      headerLabel.style.cursor = availableModes().length > 1 ? 'pointer' : 'default';
      headerLabel.style.pointerEvents = 'auto';
      if (!headerLabel._hasToggleListener) {
        headerLabel._hasToggleListener = true;
        headerLabel.addEventListener('click', () => {
          const avail = availableModes();
          if (avail.length > 1) {
            const nextMode = homeMode === 'wave' ? 'recent' : 'wave';
            const curIdx = avail.indexOf(homeMode);
            const nextIdx = avail.indexOf(nextMode);
            if (nextIdx !== -1) {
              switchHomeMode(nextIdx - curIdx);
            }
          }
        });
      }
    }
    const actions = /** @type {HTMLElement} */ (document.querySelector('#section-my-wave .my-wave-actions'));
    if (actions) {
      actions.style.display = (mode === 'wave') ? '' : 'none';
    }

    const vibeGrid = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
    const focusedMeta = document.getElementById('my-wave-focused-meta');
    if (!vibeGrid) return;

    if (mode === 'recent') {
      jumpBackCurrentTracks = getJumpBackTracks();
    }
    const source = (mode === 'recent') ? jumpBackCurrentTracks : myWaveCurrentTracks;

    vibeGrid.innerHTML = '';

    if (!source || source.length === 0) {
      if (focusedMeta) focusedMeta.innerHTML = '';
      if (mode === 'recent') {
        vibeGrid.innerHTML = `<div class="vibe-empty-hint" data-i18n>Play some songs to see them here</div>`;
      } else {
        vibeGrid.innerHTML = getWaveSpinnerHtml();
      }
      updateAmbientLight('my-wave-ambient-light', '');
      return;
    }

    const fragment = document.createDocumentFragment();
    source.forEach((track, idx) => {
      fragment.appendChild(buildHomeCard(track, mode, idx));
    });
    vibeGrid.appendChild(fragment);

    const firstThumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(source[0]) : '') || source[0].thumbnail || source[0].cover || source[0].image || '';

    if (focusedMeta && source[0]) {
      focusedMeta.innerHTML = `
        <div class="my-wave-focused-title" id="my-wave-focused-title">${escapeHtml(source[0].title || 'Untitled')}</div>
        <div class="my-wave-focused-artist" id="my-wave-focused-artist">${escapeHtml(source[0].artist || 'Unknown')}</div>
      `;
      const titleEl = document.getElementById('my-wave-focused-title');
      const artistEl = document.getElementById('my-wave-focused-artist');
      if (titleEl) updateTextFade(titleEl);
      if (artistEl) updateTextFade(artistEl);
      updateAmbientLight('my-wave-ambient-light', firstThumb);
    }

    vibeGrid.scrollLeft = 0;
    vibeGrid._focusedIndex = -1;
    updateCoverflowCards(vibeGrid, document.getElementById('my-wave-focused-title'), document.getElementById('my-wave-focused-artist'), document.getElementById('my-wave-ambient-light'), source);
  }


  function availableModes() {
    const modes = [];
    if (getAdv('my_wave', true)) modes.push('wave');
    if (getAdv('jump_back', true)) modes.push('recent');
    return modes;
  }

  function updateHomeDots() {
    const dotsContainer = document.getElementById('home-hero-dots');
    if (!dotsContainer) return;
    const avail = availableModes();
    if (avail.length <= 1) {
      dotsContainer.style.display = 'none';
      dotsContainer.innerHTML = '';
      return;
    }
    dotsContainer.style.display = '';
    dotsContainer.innerHTML = '';
    avail.forEach(m => {
      const btn = document.createElement('button');
      const label = m === 'recent' ? 'Jump back in' : 'My Wave';
      btn.setAttribute('aria-label', T(label));
      btn.title = T(label);
      if (m === homeMode) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (m !== homeMode) {
          const curIdx = avail.indexOf(homeMode);
          const targetIdx = avail.indexOf(m);
          switchHomeMode(targetIdx - curIdx);
        }
      });
      dotsContainer.appendChild(btn);
    });
  }

  function switchHomeMode(/** @type {number} */ dir) {
    const avail = availableModes();
    if (avail.length <= 1) return;
    const curIdx = avail.indexOf(homeMode);
    if (curIdx === -1) return;
    const targetIdx = curIdx + dir;
    if (targetIdx < 0 || targetIdx >= avail.length) return;
    const newMode = avail[targetIdx];
    if (newMode === homeMode) return;

    homeMode = newMode;
    localStorage.setItem('uriel_home_pane', newMode);
    updateHomeDots();

    const isPerf = document.body.classList.contains('perf') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isPerf) {
      renderHomeCarousel(newMode);
      return;
    }

    const vibeGrid = document.getElementById('home-vibe-grid');
    const focusedMeta = document.getElementById('my-wave-focused-meta');
    const animTargets = /** @type {HTMLElement[]} */ ([vibeGrid, focusedMeta].filter(Boolean));

    const shiftOut = dir > 0 ? '-16px' : '16px';
    const shiftIn = dir > 0 ? '16px' : '-16px';

    animTargets.forEach(el => {
      el.style.setProperty('--home-shift', shiftOut);
      el.classList.remove('home-in');
      el.classList.add('home-out');
    });

    setTimeout(() => {
      renderHomeCarousel(newMode);
      const newVibeGrid = document.getElementById('home-vibe-grid');
      const newFocusedMeta = document.getElementById('my-wave-focused-meta');
      const newTargets = /** @type {HTMLElement[]} */ ([newVibeGrid, newFocusedMeta].filter(Boolean));
      newTargets.forEach(el => {
        el.style.setProperty('--home-in-shift', shiftIn);
        el.classList.remove('home-out');
        el.classList.add('home-in');
        setTimeout(() => {
          el.classList.remove('home-in');
        }, 260);
      });
    }, 180);
  }

  function initHomeHero() {
    const avail = availableModes();
    const hero = document.getElementById('home-hero') || document.querySelector('#view-discover .discover-content');
    const dots = document.getElementById('home-hero-dots');

    if (avail.length === 0) {
      if (hero) hero.style.display = 'none';
      if (dots) dots.style.display = 'none';
      const homeAmbient = document.getElementById('home-ambient');
      if (homeAmbient) homeAmbient.style.display = 'none';
      return;
    }

    if (hero) hero.style.display = '';

    if (!avail.includes(homeMode)) {
      homeMode = avail[0];
      localStorage.setItem('uriel_home_pane', homeMode);
    }

    updateHomeDots();
    renderHomeCarousel(homeMode);
    syncHomeAmbientVisibility();
  }

  function stepCarouselFocus(/** @type {number} */ delta) {
    const row = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
    if (!row) return;
    const cards = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('.my-wave-track-card'));
    if (cards.length === 0) return;
    const base = (typeof row._targetIndex === 'number')
      ? row._targetIndex
      : ((typeof row._focusedIndex === 'number') ? row._focusedIndex : 0);
    const next = Math.max(0, Math.min(cards.length - 1, base + delta));
    scrollCarouselTo(row, next);
  }

  function isDiscoverActive() {
    const view = document.getElementById('view-discover');
    return !!(view && view.classList.contains('active'));
  }

  function isFormInputFocused() {
    const activeEl = /** @type {HTMLElement} */ (document.activeElement);
    if (!activeEl) return false;
    const tag = activeEl.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || activeEl.isContentEditable;
  }

  let isWheelModeLocked = false;
  let isCarouselWheelLocked = false;

  const viewDiscoverEl = document.getElementById('view-discover');
  if (viewDiscoverEl) {
    viewDiscoverEl.addEventListener('wheel', (e) => {
      if (!isDiscoverActive() || isFormInputFocused()) return;
      if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
      if (/** @type {HTMLElement} */ (e.target).closest('#search-results-container')) return;
      // the home page scrolls (recommendations below the card): only sideways scrolling, or scrolling
      // over the card row itself, flips cards
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!sideways && !/** @type {HTMLElement} */ (e.target).closest('.my-wave-carousel-wrapper')) return;
      const delta = sideways ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 8) return;
      if (isCarouselWheelLocked) return;
      e.preventDefault();
      isCarouselWheelLocked = true;
      setTimeout(() => { isCarouselWheelLocked = false; }, 85);
      stepCarouselFocus(delta > 0 ? 1 : -1);
    }, { passive: false });

    let touchStartY = 0;
    let touchStartX = 0;
    viewDiscoverEl.addEventListener('touchstart', (e) => {
      if (!isDiscoverActive()) return;
      if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
      }
    }, { passive: true });

    viewDiscoverEl.addEventListener('touchend', (e) => {
      if (!isDiscoverActive()) return;
      if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
      if (e.changedTouches.length > 0) {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const diffY = touchStartY - touchEndY;
        const diffX = touchStartX - touchEndX;
        // vertical swipes scroll the page; sideways swipes flip cards
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          stepCarouselFocus(diffX > 0 ? 1 : -1);
        }
      }
    }, { passive: true });
  }

  window.addEventListener('keydown', (e) => {
    if (!isDiscoverActive() || isFormInputFocused()) return;
    if (el.searchResultsContainer && !el.searchResultsContainer.classList.contains('hidden')) return;
    // Up/Down scroll the (now scrolling) Home page; nothing behind an open dialog or Encore moves
    if (document.querySelector('.encore, .modal-backdrop.visible:not(.hidden)')) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepCarouselFocus(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepCarouselFocus(1);
    }
  });


  // "For you": genres, similar artists and picks from /api/discover (iTunes genres + Deezer related/charts)
  let forYouSig = '';
  /** @param {boolean} [force] */
  async function loadForYou(force) {
    const box = document.getElementById('section-for-you');
    if (!box || !state.serverPort) return;
    const sig = `${state.history.length}:${state.favorites.length}:${state.history[0] ? state.history[0].id : ''}`;
    if (!force && sig === forYouSig) return;
    forYouSig = sig;
    const isEmpty = (/** @type {UrielForYou | null} */ d) => !d || !d.success || (!(d.genres || []).length && !(d.sections || []).some((/** @type {UrielHomeSection} */ x) => (x.items || x.tracks || []).length));
    // what For you showed last time, drawn at once while the new one loads
    const cached = safeJson('uriel_home_foryou_cache', null);
    if (!box.children.length && cached && !isEmpty(cached.data)) renderForYou(box, cached.data);
    let data = null;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/discover`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: state.history.slice(0, 60), favorites: state.favorites.slice(0, 60) }),
      });
      data = await res.json();
    } catch (e) {}
    // forget the signature on a failed (or offline, empty) load, or "For you" stayed empty until the history changed
    if (isEmpty(data)) { if (forYouSig === sig) forYouSig = ''; return; }
    try { localStorage.setItem('uriel_home_foryou_cache', JSON.stringify({ at: Date.now(), data })); } catch (e) {}
    renderForYou(box, data);
  }
  function renderForYou(/** @type {HTMLElement} */ box, /** @type {UrielForYou} */ data) {
    box.innerHTML = '';
    const section = (/** @type {string} */ title) => {
      const block = document.createElement('div');
      block.className = 'section-block fy-section';
      block.innerHTML = `<div class="section-header-inline"><h3 class="section-title">${escapeHtml(title)}</h3></div>`;
      box.appendChild(block);
      return block;
    };
    if (data.genres && data.genres.length) {
      const chips = document.createElement('div');
      chips.className = 'suggestion-chips fy-genres';
      data.genres.slice(0, 6).forEach((/** @type {string} */ g) => {
        const c = document.createElement('button');
        c.className = 'chip-btn';
        c.textContent = g;
        c.addEventListener('click', () => { if (el.searchInput) el.searchInput.value = `${g} music`; performSearch(`${g} music`); });
        chips.appendChild(c);
      });
      section('Your genres').appendChild(chips);
    }
    // blocked artists and songs stay out of For you; so do the songs you played just now
    const blockedArtists = getBlocks().artists;
    const recentKeys = new Set((state.history || []).slice(0, 30).map((/** @type {UrielTrack} */ t) => getTrackNormalizedKey(t.artist, t.title)));
    for (const raw of data.sections || []) {
      const sec = raw.type === 'artists'
        ? { ...raw, items: (raw.items || []).filter((/** @type {UrielArtist} */ a) => a && !Lib.isArtistBlocked(blockedArtists, a.name)) }
        : { ...raw, tracks: (raw.tracks || []).filter((/** @type {UrielTrack} */ t) => t && !isBlocked(t) && !recentKeys.has(getTrackNormalizedKey(t.artist, t.title))) };
      if (!(sec.items || sec.tracks || []).length) continue;
      const row = document.createElement('div');
      row.className = 'fy-row';
      if (sec.type === 'artists') {
        (sec.items || []).forEach((/** @type {UrielArtist} */ a) => {
          const b = document.createElement('button');
          b.className = 'fy-artist';
          b.innerHTML = `<img src="${escapeHtml(a.picture || '')}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(a.name)}</span>`;
          b.addEventListener('click', () => openArtistProfile(a.name));
          row.appendChild(b);
        });
      } else {
        const list = sec.tracks || [];
        list.forEach((/** @type {UrielTrack} */ t, /** @type {number} */ i) => {
          const b = document.createElement('button');
          b.className = 'fy-card';
          b.innerHTML = `<img src="${escapeHtml(listThumb(getTrackThumbUrl(t)) || '')}" data-art="${escapeHtml(JSON.stringify(trackArtCandidates(t)))}" alt="" loading="lazy" decoding="async" onerror="${THUMB_FALLBACK}"><span class="fy-title">${escapeHtml(t.title)}</span><span class="fy-artist-name">${escapeHtml(t.artist)}</span>`;
          b.addEventListener('click', () => playTrack(t, sec.tracks, i));
          row.appendChild(b);
        });
      }
      section(sec.title).appendChild(row);
    }
    const firstSongs = (data.sections || []).find((/** @type {UrielHomeSection} */ x) => x.type !== 'artists' && (x.tracks || []).length);
    if (firstSongs) warmHomeSongs(firstSongs.tracks || [], 1);
  }

  // My Wave's picks from /api/vibe, one of each song
  // The first few recommended songs, looked up ahead so tapping one starts at once: computers find the stream,
  // phones fetch the song into the offline cache (so only on Wi-Fi, and never with Data Saver). A few per feed,
  // a few seconds apart, never while a song you picked is loading, at most 8 per session.
  /** @type {Set<string>} */
  var homeWarmed = new Set();
  function warmHomeSongs(/** @type {UrielTrack[]} */ tracks, /** @type {number} */ n) {
    if (!state.serverPort || !Array.isArray(tracks)) return;
    const conn = navigator.connection;
    if (conn && conn.saveData) return;
    if (isPhoneApp && conn && conn.type && conn.type !== 'wifi' && conn.type !== 'ethernet') return;
    homeWarmed = homeWarmed || new Set();
    const picks = tracks.filter((t) => t && t.platform !== 'local' && (t.url || t.id) && !isBlocked(t) && !homeWarmed.has(getTrackCanonicalId(t))).slice(0, n || 2);
    picks.forEach((t, k) => {
      if (homeWarmed.size >= 8) return;
      homeWarmed.add(getTrackCanonicalId(t));
      setTimeout(() => {
        if (state.trackLoading || offlineState(t)) return;
        fetch(`http://127.0.0.1:${state.serverPort}/api/prefetch?url=${encodeURIComponent(t.url || '')}&id=${encodeURIComponent(t.id || '')}&platform=${t.platform || 'youtube'}&title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&duration=${encodeURIComponent(t.duration || 0)}&thumbnail=${encodeURIComponent(t.thumbnail || '')}`).catch(() => {});
      }, 5000 + homeWarmed.size * 4000);
    });
  }
  async function fetchWaveTracks(/** @type {Record<string, unknown>} */ payload) {
    const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/vibe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const out = [];
    if (data && data.success && Array.isArray(data.tracks)) {
      const seenIds = new Set();
      const seenKeys = new Set();
      for (const t of data.tracks) {
        const cid = getTrackCanonicalId(t);
        const nkey = getTrackNormalizedKey(t.artist, t.title);
        if (!seenIds.has(cid) && !seenKeys.has(nkey)) {
          seenIds.add(cid);
          seenKeys.add(nkey);
          out.push(t);
        }
      }
    }
    return out;
  }
  function saveWaveCache(/** @type {UrielTrack[]} */ tracks) {
    if (!Array.isArray(tracks) || tracks.length < 5) return;
    try { localStorage.setItem('uriel_home_wave_cache', JSON.stringify({ at: Date.now(), tracks: tracks.slice(0, 30) })); } catch (e) {}
  }

  async function loadHomePage(isRefresh = false) {
    loadForYou();
    const jumpSection = document.getElementById('section-jump-back');
    if (jumpSection) {
      jumpSection.style.display = 'none';
    }

    const waveSection = document.getElementById('section-my-wave');
    if (waveSection) {
      waveSection.style.display = '';
    }

    if (!isRefresh) {
      jumpBackCurrentTracks = getJumpBackTracks();
      initHomeHero();
    }
    if (availableModes().length === 0) return false;

    if (!getAdv('my_wave', true)) {
      if (homeMode === 'recent') {
        renderHomeCarousel('recent');
      }
      return false;
    }

    const vibeGrid = /** @type {HTMLElement} */ (document.getElementById('home-vibe-grid'));
    const focusedMeta = document.getElementById('my-wave-focused-meta');

    if (!isRefresh && focusedMeta && homeMode === 'wave' && myWaveCurrentTracks.length === 0) {
      focusedMeta.innerHTML = `
        <div class="my-wave-skeleton-title-bar skeleton-shimmer"></div>
        <div class="my-wave-skeleton-artist-bar skeleton-shimmer"></div>
      `;
    }

    if (!isRefresh && vibeGrid && homeMode === 'wave' && myWaveCurrentTracks.length === 0) {
      vibeGrid.style.opacity = '1';
      vibeGrid.innerHTML = getWaveSpinnerHtml();
    }

    try {
      const profile = await computeTasteProfile();
      /** @type {{ history: UrielTrack[], favorites: UrielTrack[], platform: string, limit: number, clientProfile: unknown, seeds: unknown, avoid: unknown, refresh?: boolean }} */
      const vibePayload = {
        history: (state.history || []).slice(0, 30),
        favorites: (state.favorites || []).slice(0, 25),
        platform: 'youtube',
        limit: 10,
        clientProfile: profile,
        seeds: profile.seeds,
        avoid: getWaveAvoid()
      };
      if (isRefresh) {
        vibePayload.refresh = true;
      }
      // the last My Wave shows at once (no waiting for the network on every start) and a new one is fetched
      // quietly for next time; Refresh always asks for new picks
      let uniqueTracks = [];
      const cachedWave = isRefresh ? null : safeJson('uriel_home_wave_cache', null);
      const waveFresh = !!(cachedWave && Array.isArray(cachedWave.tracks) && cachedWave.tracks.length >= 5 && Date.now() - (cachedWave.at || 0) < 6 * 3600e3);
      if (waveFresh) {
        uniqueTracks = cachedWave.tracks.filter((/** @type {UrielTrack} */ t) => t && !isBlocked(t));
        setTimeout(() => { fetchWaveTracks({ ...vibePayload, refresh: true }).then(saveWaveCache, () => {}); }, 15000);
      } else {
        uniqueTracks = await fetchWaveTracks(vibePayload).catch(() => []);
        saveWaveCache(uniqueTracks);
      }
      warmHomeSongs(uniqueTracks, 2);

      state.isHotPicks = false;
      state.hotPicksTitle = '';

      if (uniqueTracks.length < 5) {
        try {
          const hotRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/hot?limit=12`);
          const hotData = await hotRes.json();
          if (hotData && hotData.success && Array.isArray(hotData.tracks) && hotData.tracks.length > 0) {
            uniqueTracks = hotData.tracks;
            state.isHotPicks = true;
            state.hotPicksTitle = hotData.title || `Hot picks ${new Date().getFullYear()}`;
          }
        } catch (_) {}
      }

      if (uniqueTracks.length === 0) {
        if (!isRefresh) {
          myWaveCurrentTracks = [];
          if (homeMode === 'wave') {
            if (focusedMeta) focusedMeta.innerHTML = '';
            if (vibeGrid) {
              vibeGrid.innerHTML = `
                <div class="my-wave-retry-container" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: auto; padding: 24px; color: var(--md-sys-color-on-surface-variant); font-size: 14px;">
                  <span data-i18n>Couldn't load recommendations</span>
                  <button class="btn-icon-pill" id="btn-retry-vibe" title="Retry" aria-label="Retry" data-i18n-attr="title aria-label" style="width: 32px; height: 32px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  </button>
                </div>
              `;
              const retryBtn = vibeGrid.querySelector('#btn-retry-vibe');
              if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                  if (el.btnRefreshVibe) el.btnRefreshVibe.click();
                  else loadHomePage(true);
                });
              }
            }
            updateAmbientLight('my-wave-ambient-light', '');
          }
        }
        return false;
      }

      // blocked artists and songs never make it into My Wave (the server leaves them out too; this is the safety net)
      myWaveCurrentTracks = uniqueTracks.filter((/** @type {UrielTrack} */ t) => !isBlocked(t));
      if (!myWaveCurrentTracks.length) myWaveCurrentTracks = uniqueTracks;
      currentWaveFocusedIndex = 0;
      if (homeReady() && isSpotifyHome()) renderMadeForYou();
      if (homeMode === 'wave') {
        if (vibeGrid) {
          vibeGrid.style.transition = 'none';
          vibeGrid.style.opacity = '0';
        }
        renderHomeCarousel('wave');
        currentWaveFocusedIndex = 0;
        if (vibeGrid) {
          vibeGrid.scrollLeft = 0;
          vibeGrid._focusedIndex = 0;
          const firstCard = /** @type {HTMLElement} */ (vibeGrid.querySelector('.my-wave-track-card'));
          if (firstCard && document.activeElement && document.activeElement.closest('#home-vibe-grid')) {
            firstCard.focus();
          }
          vibeGrid.offsetHeight;
          vibeGrid.style.transition = 'opacity 250ms ease';
          vibeGrid.style.opacity = '1';
        }
      }
      return true;
    } catch (err) {
      if (!isRefresh) {
        myWaveCurrentTracks = [];
        if (homeMode === 'wave') {
          if (focusedMeta) focusedMeta.innerHTML = '';
          if (vibeGrid) {
            vibeGrid.innerHTML = `
              <div class="my-wave-retry-container" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: auto; padding: 24px; color: var(--md-sys-color-on-surface-variant); font-size: 14px;">
                <span data-i18n>Couldn't load recommendations</span>
                <button class="btn-icon-pill" id="btn-retry-vibe" title="Retry" aria-label="Retry" data-i18n-attr="title aria-label" style="width: 32px; height: 32px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                </button>
              </div>
            `;
            const retryBtn = vibeGrid.querySelector('#btn-retry-vibe');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => {
                if (el.btnRefreshVibe) el.btnRefreshVibe.click();
                else loadHomePage(true);
              });
            }
          }
          updateAmbientLight('my-wave-ambient-light', '');
        }
      }
      return false;
    }
  }

  const vibeGridEl = document.getElementById('home-vibe-grid');
  if (vibeGridEl) {
    vibeGridEl.addEventListener('scroll', () => {
      const curTracks = (homeMode === 'recent') ? jumpBackCurrentTracks : myWaveCurrentTracks;
      updateCoverflowCards(vibeGridEl, document.getElementById('my-wave-focused-title'), document.getElementById('my-wave-focused-artist'), document.getElementById('my-wave-ambient-light'), curTracks);
    }, { passive: true });
  }

  const quickRowEl = document.getElementById('home-quick-play-row');
  if (quickRowEl) {
    quickRowEl.addEventListener('scroll', () => {
      updateCoverflowCards(quickRowEl, document.getElementById('jump-focused-title'), document.getElementById('jump-focused-artist'), document.getElementById('jump-ambient-light'), jumpBackCurrentTracks);
    }, { passive: true });
  }

  const getWaveTracks = () => myWaveCurrentTracks;

  /** @type {UrielWavePart} */
  const api = { analysisCache, getWaveTracks, computeTasteProfile, normalizeArtistName, getTrackNormalizedKey, getWaveAvoid, recordWaveSkip, extendMyWaveQueue, getCoverDominantColors, syncHomeAmbientVisibility, initHomeHero, loadForYou, warmHomeSongs, loadHomePage };
  Object.assign(out, api);
};
