// @ts-check
// The Home screen's rows: the layout switch (Uriel's carousel or Spotify-style rows), quick picks, Daily Mixes,
// Trending now and the artists you follow. Part of app.js, which calls this once as it starts. What the rest of
// app.js uses goes into `out` first, so it can be called while this is still setting up.
window.UrielApp = window.UrielApp || {};
window.UrielApp.home = function ({ state, Lib, escapeHtml, getAdv, playTrack, safeJson, showToast, compactCount, getFollowedArtists, getTrackThumbUrl, bindHorizontalWheel, updateRowFade, switchView, getTrackCanonicalId, listThumb, openPlaylistDetail, renderPlaylistCover, computeTasteProfile, normalizeArtistName, getWaveAvoid, isBlocked, openAlbum, warmHomeSongs, openArtistProfile, setFollowedArtists, updateArtistsCount, renderArtistsTab, syncHomeAmbientVisibility, homeReady, getWaveTracks }, out) {
  Object.assign(out, {
    isSpotifyHome, renderFollowedArtists, renderMadeForYou, artistPlays, followedArtistCard, fetchFollowedMeta, renderSpotifyHome, applyHomeLayout,
    readDailyMixes: () => readDailyMixes(),
  });

  // ---- Home layout: Uriel (the carousel; the default) or Spotify-style rows (Settings > Advanced > Home layout) ----
  // The Spotify layout trades the carousel for quick picks (Liked songs, what you played last), "Made for you"
  // (My Wave and up to five Daily Mixes, new every day), Trending now and the artists you follow. Sync invite,
  // Your playlists, On repeat and For you stay below in both layouts.
  // (var: switchView can render Home before this block has run)
  function isSpotifyHome() {
    try { return (localStorage.getItem('uriel_home_layout') || 'spotify') === 'spotify'; } catch (e) { return false; }
  }
  const DAILY_MIXES_KEY = 'uriel_daily_mixes';
  const TRENDING_CACHE_KEY = 'uriel_trending_cache';
  const spThumb = (t) => (t && (getTrackThumbUrl(t) || t.thumbnail || t.cover)) || '';

  function spCoverPlaceholder(wrap) {
    if (wrap.querySelector('.sp-cover-note')) return;
    wrap.insertAdjacentHTML('beforeend', '<svg class="sp-cover-note" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>');
  }

  /** @param {{ cover?: string, gridCovers?: string[], title?: string, sub?: string, explicit?: boolean, round?: boolean, onClick?: () => void }} o */
  function spCard({ cover, gridCovers, title, sub, explicit, round, onClick }) {
    const card = document.createElement('div');
    card.className = 'sp-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const coverWrap = document.createElement('div');
    coverWrap.className = round ? 'sp-card-cover round' : 'sp-card-cover';
    if (Array.isArray(gridCovers) && gridCovers.length >= 4) {
      const grid = document.createElement('div');
      grid.className = 'sp-grid-cover';
      gridCovers.slice(0, 4).forEach((c) => {
        const img = document.createElement('img');
        img.loading = 'lazy'; img.decoding = 'async'; img.alt = ''; img.src = c || '';
        grid.appendChild(img);
      });
      coverWrap.appendChild(grid);
    } else if (cover) {
      const img = document.createElement('img');
      img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
      // a music note instead of the broken-image icon when the cover doesn't load (from Riff 43.2)
      img.addEventListener('error', () => { img.remove(); spCoverPlaceholder(coverWrap); }, { once: true });
      img.src = cover;
      coverWrap.appendChild(img);
    } else if (!round) {
      spCoverPlaceholder(coverWrap);
    }
    const titleEl = document.createElement('div');
    titleEl.className = 'sp-card-title sp-fade';
    titleEl.textContent = title || '';
    const subEl = document.createElement('div');
    subEl.className = 'sp-card-sub sp-fade';
    if (explicit) subEl.insertAdjacentHTML('afterbegin', '<span class="explicit-badge" title="Explicit">E</span>');
    subEl.appendChild(document.createTextNode(sub || ''));
    card.append(coverWrap, titleEl, subEl);
    if (onClick) {
      card.addEventListener('click', onClick);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
    }
    return card;
  }
  function spSpinnerCard(title) {
    const card = spCard({ title });
    card.classList.add('sp-card-loading');
    card.querySelector('.sp-card-cover').innerHTML = '<svg class="g-spinner" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/></svg>';
    return card;
  }
  function finishRow(row) {
    bindHorizontalWheel(row);
    requestAnimationFrame(() => updateRowFade(row));
  }

  // Liked songs and the last songs you played (your playlists fill up the grid when there are few)
  function renderQuickAccess() {
    const sec = document.getElementById('sp-quick-sec');
    const box = document.getElementById('sp-quick');
    if (!sec || !box) return;
    sec.hidden = !getAdv('jump_back', true);
    if (sec.hidden) return;
    box.innerHTML = '';
    const tile = (cls, title, sub, onClick) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = `sp-tile ${cls}`;
      t.innerHTML = `<span class="sp-tile-art"></span><span class="sp-tile-text"><span class="sp-tile-title sp-fade"></span><span class="sp-tile-sub sp-fade"></span></span>`;
      t.querySelector('.sp-tile-title').textContent = title;
      t.querySelector('.sp-tile-sub').textContent = sub || '';
      t.addEventListener('click', onClick);
      box.appendChild(t);
      return t.querySelector('.sp-tile-art');
    };
    const favs = (state.favorites || []).length;
    tile('sp-tile-liked', 'Liked songs', `${favs} song${favs === 1 ? '' : 's'}`, () => switchView('favorites'))
      .innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
    const seen = new Set();
    const recent = [];
    for (const t of state.history || []) {
      const k = t && (getTrackCanonicalId(t) || `${t.artist}::${t.title}`);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      recent.push(t);
      if (recent.length >= 5) break;
    }
    recent.forEach((t, i) => {
      const art = tile('', t.title || 'Untitled', t.artist || '', () => { state.myWaveActive = false; playTrack(t, [...recent], i); });
      art.innerHTML = `<img loading="lazy" decoding="async" alt="" src="${escapeHtml(listThumb(spThumb(t)) || spThumb(t))}">`;
    });
    (state.playlists || []).slice(0, Math.max(0, 5 - recent.length)).forEach((pl) => {
      const n = (pl.tracks || []).length;
      const art = tile('', pl.name || 'Untitled', `${n} song${n === 1 ? '' : 's'}`, () => openPlaylistDetail(pl.id));
      renderPlaylistCover(art, pl, 64);
    });
  }

  // ---- Daily Mixes: a few of the artists you play most each, with songs like theirs (library-pages.js) ----
  const readDailyMixes = () => {
    const v = safeJson(DAILY_MIXES_KEY, null);
    return v && v.day === Lib.localDay() && Array.isArray(v.mixes) ? v : null;
  };
  function mixCovers(mix) {
    const out = [];
    for (const t of mix.tracks || []) {
      const c = spThumb(t);
      if (c && !out.includes(c)) out.push(c);
      if (out.length === 4) break;
    }
    return out;
  }
  let mixesBusy = false;
  let plannedMixes = 0;
  async function generateDailyMixes(force = false) {
    if (mixesBusy || !getAdv('my_wave', true) || !isSpotifyHome()) return;
    if (!force && readDailyMixes()) return;
    mixesBusy = true;
    const day = Lib.localDay();
    const mixes = [];
    try {
      const profile = await computeTasteProfile(40);
      const plans = Lib.planMixes(profile.seeds, { day, normalize: normalizeArtistName });
      plannedMixes = plans.length;
      renderMadeForYou();
      for (const plan of plans) {
        try {
          const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/vibe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              history: (state.history || []).slice(0, 30),
              favorites: (state.favorites || []).slice(0, 25),
              platform: 'youtube',
              limit: 20,
              clientProfile: profile,
              seeds: plan.seeds,
              avoid: getWaveAvoid()
            })
          });
          const data = await res.json();
          // a mix of a handful of songs is not much of a mix
          const mixTracks = data && data.success && Array.isArray(data.tracks) ? data.tracks.filter(t => !isBlocked(t)) : [];
          if (mixTracks.length >= 8) {
            mixes.push({ id: plan.id, title: `Daily Mix ${mixes.length + 1}`, artists: plan.artists, tracks: mixTracks });
            try { localStorage.setItem(DAILY_MIXES_KEY, JSON.stringify({ day, mixes })); } catch (e) {}
            renderMadeForYou();
          }
        } catch (e) {
          break;
        }
      }
    } catch (e) {
    } finally {
      mixesBusy = false;
      plannedMixes = 0;
      // an empty day is remembered too, so a failed try doesn't run again on every visit to Home
      try { localStorage.setItem(DAILY_MIXES_KEY, JSON.stringify({ day, mixes })); } catch (e) {}
      renderMadeForYou();
    }
  }

  /** @type {any} */
  let mixesTimer = 0;
  function renderMadeForYou() {
    const sec = document.getElementById('sp-made-sec');
    const row = document.getElementById('sp-made');
    if (!sec || !row) return;
    if (!getAdv('my_wave', true)) { sec.hidden = true; return; }
    const cached = readDailyMixes();
    const mixes = cached ? cached.mixes : [];
    if (!cached && !mixesBusy && !mixesTimer) {
      // not straight away: the home page's own recommendations go first; and not while nobody sees the
      // window (each mix runs yt-dlp several times, #16): the home page asks again when it's shown
      mixesTimer = setTimeout(() => { mixesTimer = 0; if (!document.hidden && state.isWindowVisible !== false) generateDailyMixes(false); }, 3000);
    }
    const wave = Array.isArray(getWaveTracks()) ? getWaveTracks() : [];
    if (!wave.length && !mixes.length && !mixesBusy) { sec.hidden = true; return; }
    sec.hidden = false;
    row.innerHTML = '';
    const playWave = () => { const b = document.getElementById('btn-play-my-wave'); if (b) b.click(); };
    row.appendChild(wave.length
      ? spCard({ cover: spThumb(wave[0]), title: state.isHotPicks ? (state.hotPicksTitle || 'Hot picks') : 'My Wave', sub: state.isHotPicks ? 'Popular right now' : 'Based on your taste', onClick: playWave })
      : spSpinnerCard('My Wave'));
    mixes.forEach((mix, i) => {
      const covers = mixCovers(mix);
      row.appendChild(spCard({
        cover: covers[0] || '',
        gridCovers: covers.length >= 4 ? covers : null,
        title: mix.title || `Daily Mix ${i + 1}`,
        sub: (mix.artists || []).join(', '),
        onClick: () => openAlbum({
          id: mix.id,
          title: mix.title || `Daily Mix ${i + 1}`,
          type: 'Daily Mix',
          artist: (mix.artists || []).join(', ') || 'Daily Mix',
          mixArtists: mix.artists || [],
          trackCount: (mix.tracks || []).length,
          tracks: [...(mix.tracks || [])],
          gridCovers: covers.length >= 4 ? covers : null,
          cover: covers[0] || ''
        })
      }));
    });
    if (mixesBusy) {
      for (let n = mixes.length + 1; n <= Math.max(mixes.length + 1, plannedMixes); n++) row.appendChild(spSpinnerCard(`Daily Mix ${n}`));
    }
    finishRow(row);
  }
  const btnRegenMixes = document.getElementById('btn-regen-mixes');
  if (btnRegenMixes) {
    btnRegenMixes.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mixesBusy) return;
      try { localStorage.removeItem(DAILY_MIXES_KEY); } catch (err) {}
      generateDailyMixes(true);
    });
  }

  // ---- Trending now: Apple Music's most played songs in your country (or Deezer's chart), from /api/trending ----
  let trendingLoadedAt = 0;
  function renderTrendingCards(row, tracks) {
    row.innerHTML = '';
    tracks.forEach((t, i) => row.appendChild(spCard({
      cover: spThumb(t),
      title: t.title || 'Untitled',
      sub: t.artist || '',
      explicit: Lib.isTrackExplicit(t),
      onClick: () => { state.myWaveActive = false; playTrack(t, [...tracks], i); }
    })));
    finishRow(row);
    warmHomeSongs(tracks, 2);
  }
  async function renderTrending() {
    const sec = document.getElementById('sp-trend-sec');
    const row = document.getElementById('sp-trend');
    if (!sec || !row) return;
    if (!getAdv('my_wave', true)) { sec.hidden = true; return; }
    const cached = safeJson(TRENDING_CACHE_KEY, null);
    const hasCached = !!(cached && Array.isArray(cached.tracks) && cached.tracks.length);
    if (hasCached) {
      sec.hidden = false;
      if (!row.children.length) renderTrendingCards(row, cached.tracks);
    }
    // the chart changes slowly: once an hour is plenty
    if (Date.now() - trendingLoadedAt < 3600e3 && hasCached) return;
    trendingLoadedAt = Date.now();
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/trending`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.tracks) && data.tracks.length) {
        try { localStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({ at: Date.now(), tracks: data.tracks })); } catch (e) {}
        sec.hidden = false;
        renderTrendingCards(row, data.tracks);
        return;
      }
    } catch (e) {}
    if (!hasCached) { sec.hidden = true; trendingLoadedAt = 0; }
  }

  // ---- the artists you follow: "Your artists" (both layouts), Play and Profile on each ----
  function artistPlays(name) {
    const k = Lib.nameKey(name);
    return (state.history || []).filter((t) => t && Lib.nameKey(String(t.artist || '').split(/\s*(?:,|&|\bfeat\.|\bft\.)\s*/i)[0]) === k).length;
  }
  async function playFollowedArtist(a) {
    try {
      const q = `name=${encodeURIComponent(a.name)}${a.id ? `&id=${encodeURIComponent(a.id)}` : ''}`;
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist?${q}`);
      const data = await res.json();
      const tracks = (data && data.success && data.artist && data.artist.tracks) || [];
      if (!tracks.length) { showToast(`No songs found for ${a.name}`, 'warning'); return; }
      state.myWaveActive = false;
      playTrack(tracks[0], [...tracks], 0);
    } catch (e) {
      showToast(`Couldn't play ${a.name}`, 'error');
    }
  }
  function followedArtistCard(a) {
    const card = document.createElement('div');
    card.className = 'fav-artist-card';
    const plays = artistPlays(a.name);
    const badge = plays > 0 ? `${compactCount(plays)} play${plays === 1 ? '' : 's'}` : (a.fans > 0 ? `${compactCount(a.fans)} fans` : '');
    card.innerHTML = `
      <div class="fav-artist-circle">
        ${a.avatar ? `<img class="fav-artist-img" loading="lazy" decoding="async" alt="" src="${escapeHtml(a.avatar)}" onerror="this.style.visibility='hidden'">` : '<svg class="fav-artist-placeholder" width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
        ${badge ? `<div class="fav-artist-plays"><svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg><span>${escapeHtml(badge)}</span></div>` : ''}
        <div class="fav-artist-hover">
          <button type="button" class="fav-artist-action-btn primary btn-play-fav" title="Play ${escapeHtml(a.name)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Play</span></button>
          <button type="button" class="fav-artist-action-btn btn-view-fav" title="Open ${escapeHtml(a.name)}">Profile</button>
        </div>
      </div>
      <div class="fav-artist-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>`;
    const open = () => openArtistProfile(a.name, { id: a.id || '' });
    card.querySelector('.btn-play-fav').addEventListener('click', (e) => { e.stopPropagation(); playFollowedArtist(a); });
    card.querySelector('.btn-view-fav').addEventListener('click', (e) => { e.stopPropagation(); open(); });
    card.addEventListener('click', (e) => { if (!/** @type {HTMLElement} */ (e.target).closest('.fav-artist-action-btn')) open(); });
    return card;
  }
  // followed before their page was opened (or on another device): their picture, once per session
  const followedMetaTried = new Set();
  async function fetchFollowedMeta(list) {
    const todo = list.filter((a) => !a.avatar && !followedMetaTried.has(a.id || Lib.nameKey(a.name))).slice(0, 8);
    // the details are applied at the end to the list as it is then: a follow or unfollow (here, or from a linked
    // device) during the lookups would otherwise be overwritten with the list read before them
    const updates = [];
    for (const a of todo) {
      followedMetaTried.add(a.id || Lib.nameKey(a.name));
      try {
        const q = `name=${encodeURIComponent(a.name)}${a.id ? `&id=${encodeURIComponent(a.id)}` : ''}`;
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist?${q}`);
        const data = await res.json();
        const info = data && data.success && data.artist;
        if (!info) continue;
        // a page by name only can't say which namesake it is: it lends the picture, never a channel
        updates.push({ name: a.name, id: a.id ? (info.id || a.id) : '', ids: info.ids || [], avatar: info.avatar || '', fans: info.fans || 0 });
      } catch (e) {}
    }
    let followed = getFollowedArtists();
    let changed = false;
    for (const u of updates) {
      const r = Lib.refreshFollowed(followed, u);
      if (r.changed) { followed = r.list; changed = true; }
    }
    if (changed) setFollowedArtists(followed);
  }
  function renderFollowedArtists() {
    const list = getFollowedArtists().filter((a) => a && a.name);
    const on = getAdv('fav_artists', true) && list.length > 0;
    const sp = isSpotifyHome();
    const spSec = document.getElementById('sp-artists-sec');
    const spRow = document.getElementById('sp-artists');
    if (spSec) spSec.hidden = !(on && sp);
    if (spRow && on && sp) {
      spRow.innerHTML = '';
      list.forEach((a) => spRow.appendChild(followedArtistCard(a)));
      finishRow(spRow);
    }
    const box = document.getElementById('section-home-artists');
    if (box) {
      box.hidden = !(on && !sp);
      if (on && !sp) {
        box.innerHTML = '<div class="onrepeat-head"><h3 class="section-title">Your artists</h3></div><div class="sp-row fav-artists-row" id="home-artists-row"></div>';
        const row = box.querySelector('.sp-row');
        list.forEach((a) => row.appendChild(followedArtistCard(a)));
        finishRow(row);
      } else {
        box.innerHTML = '';
      }
    }
    if (on && state.serverPort) fetchFollowedMeta(list);
    updateArtistsCount();
    if (state.currentView === 'artists') renderArtistsTab();
  }

  function renderSpotifyHome() {
    if (!homeReady() || !isSpotifyHome()) return;
    renderQuickAccess();
    renderMadeForYou();
    renderTrending();
    renderFollowedArtists();
  }

  function applyHomeLayout() {
    const sp = isSpotifyHome();
    document.body.classList.toggle('home-spotify', sp);
    const btnSp = document.getElementById('home-layout-spotify');
    const btnMu = document.getElementById('home-layout-riff');
    if (btnSp) btnSp.classList.toggle('active', sp);
    if (btnMu) btnMu.classList.toggle('active', !sp);
    renderFollowedArtists();
    if (sp) renderSpotifyHome();
    if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
  }
  document.querySelectorAll('#home-layout-toggle .theme-mode-btn').forEach((/** @type {HTMLElement} */ btn) => {
    btn.addEventListener('click', () => {
      try { localStorage.setItem('uriel_home_layout', btn.dataset.layout === 'spotify' ? 'spotify' : 'uriel'); } catch (e) {}
      applyHomeLayout();
    });
  });
  // the home toggles of Settings > Advanced also switch rows of this layout on and off
  document.querySelectorAll('.effect-switch-btn[data-adv="fav_artists"], .effect-switch-btn[data-adv="my_wave"], .effect-switch-btn[data-adv="jump_back"]').forEach((btn) => {
    btn.addEventListener('click', () => setTimeout(() => { renderFollowedArtists(); renderSpotifyHome(); }, 0));
  });
};
