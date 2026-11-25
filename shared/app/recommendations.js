// @ts-check
// "Recommended for you" under a playlist and under Liked songs (Riff 0.6): songs like the ones in it, from the
// song radio (server.js /api/radio), each with Add to put it straight in. Part of app.js, which calls this once
// as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielRecommendationsPart} out */
window.UrielApp.recommendations = function ({ getTrackThumbUrl, isBlocked, isSameTrack, listThumb, openPlaylistDetail, playTrack, renderFavoritesView, renderPlaylistsList, stampAddedAt, state, T, toggleFavoriteTrack }, out) {
  /** @type {Map<string, { at: number, tracks: UrielTrack[] }>} */
  const cache = new Map();
  const FRESH_MS = 10 * 60 * 1000;
  let shownKey = '';

  // the box under the list, made the first time it's needed
  function boxAfter(/** @type {string} */ listId) {
    const list = document.getElementById(listId);
    if (!list) return null;
    let box = /** @type {HTMLElement | null} */ (list.nextElementSibling);
    if (!box || !box.classList.contains('recs')) {
      box = document.createElement('section');
      box.className = 'recs';
      box.hidden = true;
      box.innerHTML = '<div class="recs-head"><h3 class="recs-title"></h3><button type="button" class="recs-more"></button></div><div class="recs-list"></div>';
      list.after(box);
    }
    return box;
  }

  /** @param {UrielTrack[]} songs */
  async function fetchRecs(songs) {
    const seeds = [...songs].sort(() => Math.random() - 0.5).slice(0, 5).map((t) => ({ id: t.id || '', title: t.title || '', artist: t.artist || '', platform: t.platform || 'youtube' }));
    const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/radio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seeds, limit: 12, exclude: { ids: songs.map((t) => String(t.id || '')).filter(Boolean), keys: [] } }),
    });
    const data = await res.json();
    return data && data.success && Array.isArray(data.tracks) ? data.tracks : [];
  }

  /** @param {HTMLElement} box @param {UrielTrack[]} recs @param {UrielTrack[]} songs @param {(t: UrielTrack) => void} add */
  function draw(box, recs, songs, add) {
    const shown = recs.filter((t) => t && t.title && !isBlocked(t) && !songs.some((s) => isSameTrack(s, t))).slice(0, 8);
    box.hidden = !shown.length;
    const list = /** @type {HTMLElement} */ (box.querySelector('.recs-list'));
    list.innerHTML = '';
    shown.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'rec-row';
      const img = document.createElement('img');
      img.src = listThumb(getTrackThumbUrl(t));
      img.alt = '';
      img.loading = 'lazy';
      const meta = document.createElement('div');
      meta.className = 'rec-meta';
      const title = document.createElement('b');
      title.textContent = t.title || '';
      const artist = document.createElement('span');
      artist.textContent = t.artist || '';
      meta.append(title, artist);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-add';
      btn.textContent = T('Add');
      btn.addEventListener('click', (e) => { e.stopPropagation(); add(t); });
      row.append(img, meta, btn);
      row.addEventListener('click', () => playTrack(t, shown, i));
      list.appendChild(row);
    });
  }

  // called whenever a playlist or Liked songs is drawn: suggestions for it, fetched again after 10 minutes
  /** @param {'playlist' | 'favorites'} kind @param {UrielPlaylist} [pl] */
  async function showRecommendations(kind, pl, fresh = false) {
    const box = boxAfter(kind === 'playlist' ? 'playlist-tracks-list' : 'favorites-tracks-list');
    if (!box) return;
    const songs = kind === 'playlist' ? (pl ? pl.tracks : []) : state.favorites;
    const key = kind === 'playlist' && pl ? `pl:${pl.id}` : 'favorites';
    shownKey = key;
    /** @type {HTMLElement} */ (box.querySelector('.recs-title')).textContent = T('Recommended for you');
    const more = /** @type {HTMLButtonElement} */ (box.querySelector('.recs-more'));
    more.textContent = T('Refresh');
    more.onclick = () => showRecommendations(kind, pl, true);
    if (!songs.length) { box.hidden = true; return; }
    const add = (/** @type {UrielTrack} */ t) => {
      if (kind === 'playlist' && pl) {
        pl.tracks.push(stampAddedAt(t));
        localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
        renderPlaylistsList();
        openPlaylistDetail(pl.id);
      } else {
        toggleFavoriteTrack(t);
        renderFavoritesView();
      }
    };
    const c = cache.get(key);
    if (c && !fresh && Date.now() - c.at < FRESH_MS) { draw(box, c.tracks, songs, add); return; }
    let recs = [];
    try { recs = await fetchRecs(songs); } catch (e) {}
    cache.set(key, { at: Date.now(), tracks: recs });
    if (shownKey === key) draw(box, recs, songs, add);
  }

  /** @type {UrielRecommendationsPart} */
  const api = { showRecommendations };
  Object.assign(out, api);
};
