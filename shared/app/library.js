// @ts-check
// Your library's lists: favourites, history, the queue and the songs from your own files, how each is sorted,
// and the counts beside them. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielLibraryPart} out */
window.UrielApp.library = function ({ artistPlays, el, isFavoriteSong, isPhoneApp, matchesTrackQuery, renderArtistsTab, renderPlaylistsList, renderSavedAlbums, renderTracks, scheduleQueueSave, showToast, state, Tm, tokenUrl }, out) {
  function toggleFavoriteTrack(/** @type {UrielTrack} */ track) {
    if (!track) return;
    const exists = isFavoriteSong(track);
    
    if (exists) {
      state.favorites = state.favorites.filter((/** @type {UrielTrack} */ f) => !isSameSong(f, track));
    } else {
      state.favorites.unshift(stampAddedAt(track));
    }
    
    localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
    updateFavoritesBadge();
    updateFavoriteIcon();
    if (state.currentView === 'favorites') renderFavoritesView();
  }

  function updateFavoriteIcon() {
    const isFav = !!(state.currentTrack && isFavoriteSong(state.currentTrack));
    if (el.favIcon) el.favIcon.setAttribute('fill', isFav ? 'currentColor' : 'none');
    if (el.tvkFavIcon) el.tvkFavIcon.setAttribute('fill', isFav ? 'currentColor' : 'none');
    if (el.btnTvkFav) {
      el.btnTvkFav.classList.toggle('active', isFav);
      el.btnTvkFav.setAttribute('aria-pressed', String(isFav));
      el.btnTvkFav.disabled = !state.currentTrack;
    }
  }

  function updateFavoritesBadge() {
    if (el.favoritesCount) { el.favoritesCount.textContent = String(state.favorites.length); el.favoritesCount.hidden = !state.favorites.length; }
  }

  /** @type {Record<string, string>} */
  const TRACK_SORT_KEYS = { favorites: 'uriel_favorites_sort', playlist: 'uriel_playlist_sort' };

  function getTrackSortMode(/** @type {string} */ kind) {
    const stored = localStorage.getItem(TRACK_SORT_KEYS[kind]) || '';
    return TRACK_SORT_MODES.includes(stored) ? stored : 'manual';
  }

  function setTrackSortMode(/** @type {string} */ kind, /** @type {string} */ mode) {
    localStorage.setItem(TRACK_SORT_KEYS[kind], TRACK_SORT_MODES.includes(mode) ? mode : 'manual');
  }

  function sortTracksFor(/** @type {string} */ kind, /** @type {UrielTrack[]} */ tracks) {
    return sortTracks(tracks, getTrackSortMode(kind));
  }

  function stampAddedAt(/** @type {UrielTrack} */ track) {
    return { ...track, addedAt: Date.now() };
  }

  function renderFavoritesView() {
    const query = el.favoritesSearchInput ? normalizeSearch(el.favoritesSearchInput.value) : '';
    let filtered = state.favorites;
    if (query) {
      filtered = filtered.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query));
    }
    filtered = sortTracksFor('favorites', filtered);
    if (el.favoritesSort) { el.favoritesSort.value = getTrackSortMode('favorites'); syncSortDropdown('favorites'); }
    if (el.favoritesSubtitle) el.favoritesSubtitle.textContent = query ? `${filtered.length} of ${state.favorites.length} songs` : `${state.favorites.length} songs saved`;
    if (el.favoritesTracksList) renderTracks(el.favoritesTracksList, filtered, 'favorites');
  }

  if (el.favoritesSearchInput) {
    el.favoritesSearchInput.addEventListener('input', () => renderFavoritesView());
  }

  // Sort menus of Favorites and playlists: a Material dropdown in front of the <select> (still the value), with
  // the select's options, so the list of orders stays in one place (track-sort.js does the sorting)
  // (var: a view can render before this line has run)
  /** @type {Record<string, { dropdown: HTMLElement, menu: HTMLElement, select: HTMLSelectElement, label: HTMLElement | null }>} */
  var sortDropdowns = {};
  function syncSortDropdown(/** @type {string} */ kind) {
    const d = sortDropdowns && sortDropdowns[kind];
    if (!d) return;
    /** @type {NodeListOf<HTMLElement>} */ (d.menu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      const on = opt.dataset.value === d.select.value;
      opt.classList.toggle('selected', on);
      opt.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && d.label) d.label.textContent = opt.textContent;
    });
  }
  function setupSortDropdown(/** @type {string} */ kind, /** @type {HTMLSelectElement} */ selectEl) {
    const dropdown = document.getElementById(`${kind}-sort-dropdown`);
    const trigger = document.getElementById(`${kind}-sort-trigger`);
    const menu = document.getElementById(`${kind}-sort-menu`);
    if (!dropdown || !trigger || !menu || !selectEl) return;
    sortDropdowns[kind] = { dropdown, menu, select: selectEl, label: document.getElementById(`${kind}-sort-label`) };
    menu.innerHTML = '';
    [...selectEl.options].forEach((o) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'm3-dropdown-option';
      opt.setAttribute('role', 'option');
      opt.dataset.value = o.value;
      opt.textContent = o.textContent;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        if (selectEl.value !== o.value) {
          selectEl.value = o.value;
          selectEl.dispatchEvent(new Event('change'));
        }
        syncSortDropdown(kind);
      });
      menu.appendChild(opt);
    });
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      Object.values(sortDropdowns).forEach((d) => { if (d.dropdown !== dropdown) d.dropdown.classList.remove('open'); });
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dropdown.classList.remove('open'); });
    syncSortDropdown(kind);
  }

  if (el.favoritesSort) {
    el.favoritesSort.addEventListener('change', () => {
      setTrackSortMode('favorites', el.favoritesSort.value);
      renderFavoritesView();
    });
    el.favoritesSort.value = getTrackSortMode('favorites');
    setupSortDropdown('favorites', el.favoritesSort);
  }

  // Sorting the Albums tab, the playlists list and the Artists tab (#19); track-sort.js does the sorting.
  // Kept per view in localStorage. (var and function declarations: the lists can render before this line runs)
  /** @type {Record<string, string>} */
  var LIBRARY_SORT_KEYS = { albums: 'uriel_albums_sort', playlists: 'uriel_playlists_sort', artists: 'uriel_artists_sort' };
  function getLibrarySort(/** @type {string} */ kind) {
    let v = null;
    try { v = localStorage.getItem((LIBRARY_SORT_KEYS || {})[kind] || ''); } catch (e) {}
    return librarySortMode(kind, v || '');
  }
  /** @template {{ name: string }} I @param {string} kind @param {I[]} items */
  function sortedLibrary(kind, items) {
    return sortLibrary(kind, items, getLibrarySort(kind), kind === 'artists' ? { plays: (a) => artistPlays(a.name) } : {});
  }
  ['albums', 'playlists', 'artists'].forEach((kind) => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById(`${kind}-sort`));
    if (!sel) return;
    sel.value = getLibrarySort(kind);
    sel.addEventListener('change', () => {
      try { localStorage.setItem(LIBRARY_SORT_KEYS[kind], librarySortMode(kind, sel.value)); } catch (e) {}
      syncSortDropdown(kind);
      if (kind === 'albums') renderSavedAlbums();
      else if (kind === 'artists') renderArtistsTab();
      else renderPlaylistsList();
    });
    setupSortDropdown(kind, sel);
  });

  function renderHistoryView() {
    if (el.historyTracksList) renderTracks(el.historyTracksList, state.history, 'history');
  }

  let queueRerender = 0;
  function updateQueueBadge() {
    window.dispatchEvent(new Event('uriel:queue'));
    if (el.queueCount) { el.queueCount.textContent = String(state.queue.length); el.queueCount.style.display = state.queue.length ? 'inline-block' : 'none'; }
    scheduleQueueSave();
    // an open queue list kept showing the old order after Play next / Add to queue
    if (!queueRerender && (state.currentView === 'queue' || (state.isRightPanelOpen && state.drawerTab === 'queue'))) {
      queueRerender = requestAnimationFrame(() => {
        queueRerender = 0;
        const list = /** @type {HTMLElement} */ (el.queueTracksList);
        // a plain skip keeps the same queue (the row highlight follows on its own); only redraw when it changed
        if (list && (list._renderedQueue !== state.queue || list._renderedLen !== state.queue.length)) renderQueueView();
        else if (list) /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(':scope > .track-row')).forEach((r) => r.classList.toggle('queue-played', Number(r.dataset.trackIndex) < state.queueIndex));
      });
    }
  }

  function renderQueueView() {
    if (!el.queueTracksList) return;
    renderTracks(el.queueTracksList, state.queue, 'queue');
    el.queueTracksList._renderedQueue = state.queue;
    el.queueTracksList._renderedLen = state.queue.length;
  }

  function updateLocalBadge() {
    if (el.localCount) { const n = (state.localTracks && state.localTracks.length) || 0; el.localCount.textContent = String(n); el.localCount.hidden = !n; }
  }

  // The server looks up missing covers in the background; pick them up while the library is open.
  /** @type {ReturnType<typeof setTimeout> | null} */
  let localCoverRefreshTimer = null;
  let localCoverRefreshCount = 0;
  function scheduleLocalCoverRefresh() {
    if (localCoverRefreshTimer) clearTimeout(localCoverRefreshTimer);
    localCoverRefreshTimer = null;
    const missing = (state.localTracks || []).filter((/** @type {UrielTrack} */ t) => !t.thumbnail).length;
    if (!missing) { localCoverRefreshCount = 0; return; }
    if (localCoverRefreshCount >= 40) return;
    localCoverRefreshTimer = setTimeout(async () => {
      localCoverRefreshTimer = null;
      if (state.currentView !== 'local') return;
      localCoverRefreshCount++;
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/library`);
        const fresh = await res.json();
        const before = (state.localTracks || []).filter((/** @type {UrielTrack} */ t) => t.thumbnail).length;
        const after = fresh.filter((/** @type {UrielTrack} */ t) => t.thumbnail).length;
        if (after !== before) {
          state.localTracks = fresh;
          renderLocalView(false);
          return;
        }
      } catch (e) {}
      scheduleLocalCoverRefresh();
    }, 15000);
  }

  async function renderLocalView(forceFetch = true) {
    if (forceFetch || !state.localTracks) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/library`);
        state.localTracks = await res.json();
      } catch (e) {
        if (!Array.isArray(state.localTracks)) state.localTracks = [];
      }
    }
    updateLocalBadge();
    scheduleLocalCoverRefresh();
    const query = el.localSearchInput ? normalizeSearch(el.localSearchInput.value) : '';
    let filtered = state.localTracks || [];
    if (query) {
      filtered = filtered.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query));
    }
    if (el.localSubtitle) {
      el.localSubtitle.textContent = query
        ? `${filtered.length} of ${state.localTracks.length} songs`
        : `${state.localTracks.length} songs in library`;
    }
    if (el.localTracksList) {
      if (!state.localTracks || state.localTracks.length === 0) {
        el.localTracksList.style.paddingTop = '0px';
        el.localTracksList.style.paddingBottom = '0px';
        el.localTracksList.innerHTML = `
          <div class="empty-hint" style="display:flex;flex-direction:column;align-items:center;gap:12px;">
            <span data-i18n>No local tracks in library yet.</span>
            <button class="btn-pill-primary" id="btn-add-local-files-empty" data-i18n>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add files
            </button>
          </div>`;
        const emptyBtn = el.localTracksList.querySelector('#btn-add-local-files-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', () => importLocalFiles());
      } else {
        renderTracks(el.localTracksList, filtered, 'local');
      }
    }
  }

  if (el.localSearchInput) {
    el.localSearchInput.addEventListener('input', () => renderLocalView(false));
  }

  /** @param {{ folder?: boolean }} [opts] */

  async function importLocalFiles(opts) {
    if (!window.electronAPI || !window.electronAPI.importAudioFiles) return;
    try {
      const items = await window.electronAPI.importAudioFiles(opts && opts.folder ? { folder: true } : undefined);
      if (!items || items.length === 0) return;

      await fetch(`http://127.0.0.1:${state.serverPort}/api/library-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });

      if (state.currentView === 'local') renderLocalView(true);

      let idx = 0;
      async function worker() {
        while (idx < items.length) {
          const item = items[idx++];
          if (!item || !item.id) continue;
          await new Promise((/** @type {(value?: void) => void} */ resolve) => {
            const url = tokenUrl(`http://127.0.0.1:${state.serverPort}/api/library-file?id=${encodeURIComponent(item.id)}`);
            // set src after construction: new Audio(url) skips the phone bridge's src rewrite
            const a = new Audio();
            a.preload = 'metadata';
            a.src = url;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              a.src = '';
              resolve();
            };
            a.onloadedmetadata = async () => {
              const dur = Math.round(a.duration || 0);
              if (dur > 0) {
                try {
                  await fetch(`http://127.0.0.1:${state.serverPort}/api/library-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id, duration: dur })
                  });
                } catch (e) {}
              }
              finish();
            };
            a.onerror = () => finish();
            setTimeout(finish, 5000);
          });
        }
      }
      // one at a time on phones: each probe can pull a whole (lossless, so big) file into memory there
      await Promise.all(isPhoneApp ? [worker()] : [worker(), worker()]);

      await renderLocalView(true);
      showToast(Tm('Added {0} songs', items.length));
    } catch (e) {
      console.warn('Import audio files error:', e);
    }
  }

  // Small-list art: a 44px row doesn't need a 720p frame decoded into RAM (~1.1 MB each).
  // Falls back to the full URL via data-full if the small variant 404s.

  /** @type {UrielLibraryPart} */
  const api = { toggleFavoriteTrack, updateFavoriteIcon, updateFavoritesBadge, getTrackSortMode, setTrackSortMode, sortTracksFor, stampAddedAt, renderFavoritesView, syncSortDropdown, setupSortDropdown, getLibrarySort, renderHistoryView, updateQueueBadge, renderQueueView, updateLocalBadge, renderLocalView, sortedLibrary, importLocalFiles };
  Object.assign(out, api);
};
