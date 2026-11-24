// @ts-check
// The search results page: songs from the chosen source, with the artist and albums that match above them, and a
// shared playlist link opened when one is pasted in. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielSearchPart} out */
window.UrielApp.search = function ({ Tm, bindHorizontalWheel, el, escapeHtml, fetchArtistCardForSearch, getAdv, importSharedPlaylist, openAlbum, renderTracks, showToast, state, switchView, syncHomeAmbientVisibility, updateRowFade }, out) {
  async function fetchAlbumsForSearch(/** @type {string} */ query, /** @type {number} */ token) {
    let container = document.getElementById('search-albums-container');
    if (!container) {
      const artistContainer = document.getElementById('search-artist-card-container');
      if (artistContainer && artistContainer.parentNode) {
        container = document.createElement('div');
        container.id = 'search-albums-container';
        artistContainer.parentNode.insertBefore(container, artistContainer.nextSibling);
      }
    }
    if (!container) return;

    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/albums/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (state.searchToken !== token) return;
      if (!data || !data.success || !Array.isArray(data.albums) || data.albums.length === 0) {
        container.innerHTML = '';
        return;
      }

      const albums = data.albums;
      container.innerHTML = `
        <div class="search-albums-section">
          <div class="section-sub-header">
            <h3 data-i18n>Albums</h3>
          </div>
          <div class="search-albums-row">
            ${albums.map((/** @type {UrielAlbum} */ album) => {
              const sub = album.year ? `${escapeHtml(album.artist)} · ${escapeHtml(album.year)}` : escapeHtml(album.artist || '');
              return `
                <div class="search-album-card" role="button" tabindex="0">
                  <img class="search-album-cover" src="${escapeHtml(album.cover || '')}" alt="${escapeHtml(album.title)}" loading="lazy" />
                  <div class="search-album-info">
                    <span class="search-album-title" title="${escapeHtml(album.title)}">${escapeHtml(album.title)}</span>
                    <span class="search-album-sub" title="${sub}">${sub}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      const row = /** @type {HTMLElement | null} */ (container.querySelector('.search-albums-row'));
      if (row) {
        bindHorizontalWheel(row);
        requestAnimationFrame(() => updateRowFade(row));
      }

      const cards = /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.search-album-card'));
      cards.forEach((card, idx) => {
        const album = albums[idx];
        if (!album) return;
        card.addEventListener('click', () => openAlbum(album));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openAlbum(album);
          }
        });
      });
    } catch (e) {
      if (state.searchToken === token && container) {
        container.innerHTML = '';
      }
    }
  }

  async function performSearch(/** @type {string} */ query) {
    if (!query || !query.trim()) return;
    // a shared playlist link pasted into the search bar adds the playlist
    if (window.UrielShare && window.UrielShare.payloadFrom(query)) {
      if (el.searchInput) { el.searchInput.value = ''; el.searchInput.blur(); }
      if (el.searchClearBtn) el.searchClearBtn.classList.add('hidden');
      importSharedPlaylist(query);
      return;
    }

    const searchToken = (state.searchToken || 0) + 1;
    state.searchToken = searchToken;

    state.searchQuery = query.trim().toLowerCase();
    switchView('discover');

    if (el.discoverEmpty) el.discoverEmpty.classList.add('hidden');
    if (el.searchResultsContainer) el.searchResultsContainer.classList.remove('hidden');
    if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();

    const artistCardContainer = document.getElementById('search-artist-card-container');
    if (artistCardContainer) artistCardContainer.innerHTML = '';

    const albumsContainer = document.getElementById('search-albums-container');
    if (albumsContainer) albumsContainer.innerHTML = '';

    const trimmedQuery = query.trim();
    if (getAdv('albums', true) && trimmedQuery.length >= 3) {
      fetchAlbumsForSearch(trimmedQuery, searchToken);
    }

    if (el.searchTracksList) {
      el.searchTracksList.innerHTML = `<div class="m3-loader-container" style="display: flex; justify-content: center; align-items: center; padding: 64px 0; width: 100%;">
        <svg class="g-spinner" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/></svg>
      </div>`;
    }

    try {
      if (!navigator.onLine) {
        if (el.searchTracksList) el.searchTracksList.innerHTML = `<div class="empty-hint" data-i18n>Offline: connect to the internet to search new songs</div>`;
        return;
      }
      const searchUrl = `http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(state.searchQuery)}&platform=${state.platform}&limit=20`;
      const res = await fetch(searchUrl);
      const data = await res.json();
      if (state.searchToken !== searchToken) return;

      if (!data.success || !data.tracks) {
        if (state.platform === 'ytmusic') showToast(Tm('YouTube Music is unavailable'));
        throw new Error(data.error || 'Failed to load search results');
      }

      state.searchResults = data.tracks;

      requestAnimationFrame(() => {
        if (el.searchTracksList) renderTracks(el.searchTracksList, data.tracks, 'search');
      });

      const showArtists = localStorage.getItem('uriel_search_artists') !== '0';
      const trimmedQuery = query.trim();
      if (showArtists && trimmedQuery.length >= 3) {
        fetchArtistCardForSearch(trimmedQuery, searchToken, data.tracks);
      }
    } catch (err) {
      if (state.searchToken !== searchToken) return;
      console.error('Search error:', err);
      const isOff = !navigator.onLine;
      if (el.searchTracksList) el.searchTracksList.innerHTML = `<div class="empty-hint">${isOff ? 'Offline: connect to the internet to search new songs' : 'Error fetching results: ' + escapeHtml((err instanceof Error ? err.message : String(err)))}</div>`;
    }
  }

  /** @type {UrielSearchPart} */
  const api = { performSearch };
  Object.assign(out, api);
};
