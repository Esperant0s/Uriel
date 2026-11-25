// @ts-check
// Song rows: one row (cover, title, the offline mark, the heart, the ⋯ button), drawing a list of them in
// chunks, the song menu and the other action menus, and marking the row that plays. Part of app.js, which
// calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielTrackRowsPart} out */
window.UrielApp.trackRows = function ({ canReorder, checkOffline, copyText, dragGrip, el, escapeHtml, formatDuration, getBlocks, getTrackCanonicalId, getTrackThumbUrl, I18N, isBlocked, isPhoneApp, isSameTrack, Lib, listThumb, multiSel, OFFLINE_ICON, offlineKey, offlineState, openAddToPlaylistModal, openDownloadModal, openTrackArtist, openTrackArtModal, playTrack, removeTrackFromCurrentPlaylist, renderBlockedSettings, renderLocalView, rowTitle, sharePlaylist, shownThumbs, showToast, songRadioEnabled, sortTracksFor, startSongRadio, state, T, Tf, THUMB_FALLBACK, Tm, toggleBlockArtist, toggleBlockSong, toggleFavoriteTrack, toggleTrackSelection, topMomentMenuItem, otherVersionMenuItem, trackArtCandidates, updateArtistBlockButton, updateLocalBadge, updateQueueBadge }, out) {
  function createTrackRow(/** @type {UrielTrack} */ track, /** @type {number} */ idx, /** @type {string} */ currentCanonicalId, /** @type {string} */ context, /** @type {UrielTrack[]} */ tracks, /** @type {HTMLElement} */ container) {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.tabIndex = 0;
      const canonicalId = getTrackCanonicalId(track);
      row.dataset.canonicalId = canonicalId;
      row.dataset.trackIndex = String(idx);
      if (context === 'queue' && idx < state.queueIndex) row.classList.add('queue-played');
      row.dataset.trackId = track.id || '';
      row.dataset.trackTitle = track.title || '';
      row.dataset.trackArtist = track.artist || '';

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openTrackContextMenu(e.clientX, e.clientY, track, context, row);
      });

      const isMatch = currentCanonicalId && canonicalId === currentCanonicalId;
      if (isMatch) {
        if (state.currentTrackContext === context && state.currentTrackIndexInContext >= 0) {
          if (state.currentTrackIndexInContext === idx) {
            row.classList.add('playing');
          }
        } else {
          row.classList.add('playing');
        }
      }

      const isFav = isFavoriteSong(track);
      const rowThumb = getTrackThumbUrl(track);
      const rowListThumb = listThumb(rowThumb) || '';
      const isAlbum = context === 'album';
      const albumArtist = (track.albumArtist || '').trim().toLowerCase();
      const trackArtist = (track.artist || '').trim().toLowerCase();
      const showArtist = isAlbum ? (Boolean(trackArtist) && Boolean(albumArtist) && trackArtist !== albumArtist) : true;
      // [E] before the artist (Settings > Tracks > Show explicit tag hides it)
      const explicitTag = window.UrielLibrary && window.UrielLibrary.isTrackExplicit(track) ? '<span class="explicit-badge" title="Explicit">E</span>' : '';
      // the "plays without internet" mark (offlineBadge): shown now for local songs, after a check for the others
      const offline = offlineState(track);
      const offlineTag = `<span class="offline-badge" title="Available offline" data-i18n-attr="title" data-offline-key="${escapeHtml(offlineKey(track))}"${track.platform === 'local' ? ' data-local' : ''}${offline ? '' : ' hidden'}>${OFFLINE_ICON}</span>`;
      const artistSpan = showArtist ? `<span class="track-row-artist" title="View artist" data-i18n-attr="title">${escapeHtml(track.artist || 'unknown artist')}</span>` : '';

      row.innerHTML = `
      <span class="track-row-index">${(isAlbum && track.no) ? track.no : (idx + 1)}</span>
      ${!isAlbum ? `<img class="track-row-thumb${shownThumbs.has(rowListThumb) ? ' is-loaded' : ''}" src="${escapeHtml(rowListThumb)}" data-full="${escapeHtml(rowThumb || '')}" data-saved="${escapeHtml(track.thumbnail || '')}" data-art="${escapeHtml(JSON.stringify(trackArtCandidates(track)))}" alt="" onerror="${THUMB_FALLBACK}">` : ''}
      <div class="track-row-info">
      <span class="track-row-title">${escapeHtml(rowTitle(track))}</span>
      <span class="track-row-artist-wrap">${offlineTag}${explicitTag}${artistSpan}</span>
      </div>
      <span class="track-row-duration">${formatDuration(track.duration)}</span>
      <div class="track-row-actions">
      <button class="btn-icon-pill btn-row-fav" title="Favorite" data-i18n-attr="title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
      </button>
      <button class="btn-icon-pill btn-row-art" title="Customize cover & banner" data-i18n-attr="title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
      </button>
      <button class="btn-icon-pill btn-row-add-playlist" title="Add to playlist" data-i18n-attr="title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      ${track.platform === 'local' ? `
      <button class="btn-icon-pill btn-row-remove-local delete-btn" title="${track.source && track.source !== 'imported' ? 'Remove from My files (the file stays on this device)' : 'Remove from library'}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>` : `
      <button class="btn-icon-pill btn-row-more" title="Download and more">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="5" cy="12" r="2"></circle></svg>
      </button>`}
      ${context === 'playlist' ? `
        <button class="btn-icon-pill btn-row-remove-playlist delete-btn" title="Remove from playlist">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>` : ''}
        </div>
        `;

        if (canReorder(context)) row.appendChild(dragGrip());

        if (multiSel.active && multiSel.context === context) {
          const chk = document.createElement('span');
          chk.className = 'track-row-check';
          chk.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          row.insertBefore(chk, row.firstChild);
          row.classList.add('selectable');
          if (multiSel.tracks.has(canonicalId)) row.classList.add('selected');
        }

        row.addEventListener('click', (e) => {
          if (/** @type {HTMLElement} */ (e.target).closest('.track-row-actions')) return;
          if (multiSel.active && multiSel.context === context) {
            toggleTrackSelection(track, row);
            return;
          }
          if (/** @type {HTMLElement} */ (e.target).classList.contains('track-row-artist')) {
            e.stopPropagation();
            openTrackArtist(track);
            return;
          }
          let clickIndex = idx;
          let currentList = tracks;
          // the row's own object first: with a song in the list twice, the second copy played from the first
          const indexIn = (/** @type {UrielTrack[]} */ list) => { const i = list.indexOf(track); return i >= 0 ? i : list.findIndex((/** @type {UrielTrack} */ t) => isSameTrack(t, track)); };
          if (context === 'favorites') {
            currentList = sortTracksFor('favorites', state.favorites);
            clickIndex = indexIn(currentList);
          } else if (context === 'playlist') {
            const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
            if (pl && pl.tracks) {
              currentList = sortTracksFor('playlist', pl.tracks);
              clickIndex = indexIn(currentList);
            }
          } else if (context === 'artist') {
            const artistTracks = (state.currentArtistData && state.currentArtistData.tracks) || tracks;
            if (artistTracks) {
              currentList = artistTracks;
              clickIndex = indexIn(artistTracks);
            }
          } else if (context === 'queue') {
            // the queue as it is now: the rendered list could predate "Play next", and replaying it dropped that song
            currentList = state.queue;
            clickIndex = indexIn(currentList);
          }
          playTrack(track, currentList, clickIndex >= 0 ? clickIndex : idx, context);
        });

        // A finger tap gets moved onto the nearest element that listens for clicks, and only the buttons did,
        // so a tap on a short song title on a phone hit the heart. Listening here makes the title area its own
        // target; the click still bubbles to the row above, which plays the song.
        if (isPhoneApp) {
          const info = row.querySelector('.track-row-info');
          if (info) info.addEventListener('click', () => {});
        }

        const btnFav = row.querySelector('.btn-row-fav');
        if (btnFav) {
          btnFav.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavoriteTrack(track);
            const isFavNow = isFavoriteSong(track);
            const svg = btnFav.querySelector('svg');
            if (svg) svg.setAttribute('fill', isFavNow ? 'currentColor' : 'none');
          });
        }

        const btnArt = /** @type {HTMLElement | null} */ (row.querySelector('.btn-row-art'));
        if (btnArt) {
          btnArt.addEventListener('click', (e) => {
            e.stopPropagation();
            openTrackArtModal(track, btnArt);
          });
        }

        const btnMore = row.querySelector('.btn-row-more');
        if (btnMore) {
          btnMore.addEventListener('click', (e) => {
            e.stopPropagation();
            // phones have no right-click: "..." opens the song's menu there (Download is one of its items)
            if (isPhoneApp) {
              const r = btnMore.getBoundingClientRect();
              openTrackContextMenu(r.right, r.bottom, track, context, row);
              return;
            }
            openDownloadModal(track);
          });
        }

        const btnAddPl = row.querySelector('.btn-row-add-playlist');
        if (btnAddPl) {
          btnAddPl.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddToPlaylistModal(track);
          });
        }

        const btnRemPl = row.querySelector('.btn-row-remove-playlist');
        if (btnRemPl) {
          btnRemPl.addEventListener('click', (e) => {
            e.stopPropagation();
            removeTrackFromCurrentPlaylist(track);
          });
        }

        const btnRemLocal = row.querySelector('.btn-row-remove-local');
        if (btnRemLocal) {
          btnRemLocal.addEventListener('click', async (e) => {
            e.stopPropagation();
            const keepsFile = track.source && track.source !== 'imported';
            const ask = keepsFile
              ? Tf('Remove "{0}" from My files? The file stays on this device.', track.title || '')
              : Tf('Remove "{0}" from My files? Uriel\'s copy of the file is deleted.', track.title || '');
            if (!window.confirm(ask)) return;
            try {
              const removed = await fetch(`http://127.0.0.1:${state.serverPort}/api/library-remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: track.id })
              });
              // the server refused: keep the row, it would come back on the next refresh anyway
              if (!removed.ok) throw new Error(`library-remove answered ${removed.status}`);
              if (Array.isArray(state.localTracks)) {
                state.localTracks = state.localTracks.filter(t => t.id !== track.id);
              }
              if (Array.isArray(tracks)) {
                const tIdx = tracks.findIndex(t => isSameTrack(t, track));
                if (tIdx !== -1) tracks.splice(tIdx, 1);
              }
              updateLocalBadge();
              row.remove();
              if (state.currentView === 'local') {
                if (!state.localTracks || state.localTracks.length === 0) {
                  renderLocalView();
                } else if (el.localSubtitle) {
                  const query = el.localSearchInput ? el.localSearchInput.value.trim().toLowerCase() : '';
                  el.localSubtitle.textContent = query
                    ? `${tracks.length} of ${state.localTracks.length} songs`
                    : `${state.localTracks.length} songs in library`;
                }
              }
              showToast(Tm('Removed from library'));
            } catch (err) {
              console.warn('Remove local track error:', err);
              showToast(Tm("Couldn't remove from library"), 'error');
            }
          });
        }
        
      return row;
  }

  /** @type {HTMLElement | null} */
  let trackMenuEl = null;

  function closeTrackContextMenu() {
    if (trackMenuEl) {
      trackMenuEl.remove();
      trackMenuEl = null;
    }
  }

  // one index of the favourites, rebuilt when the list changes (track-sort.js favoriteIndex)
  /** @type {{ list: UrielTrack[], length: number, first: UrielTrack | undefined, last: UrielTrack | undefined, index: ReturnType<typeof favoriteIndex> } | null} */
  var favIndexCache = null;
  // an edit in the middle of the list (a renamed song, Sync) keeps its length and ends: start over on any library change
  window.addEventListener('uriel:library', () => { favIndexCache = null; });
  function isFavoriteSong(/** @type {UrielTrack} */ track) {
    const list = state.favorites || [];
    let c = favIndexCache;
    if (!c || c.list !== list || c.length !== list.length || c.first !== list[0] || c.last !== list[list.length - 1]) {
      c = favIndexCache = { list, length: list.length, first: list[0], last: list[list.length - 1], index: favoriteIndex(list) };
    }
    return c.index.has(track);
  }

  function openTrackContextMenu(/** @type {number} */ x, /** @type {number} */ y, /** @type {UrielTrack} */ track, /** @type {string} */ context, /** @type {HTMLElement} */ row) {
    closeTrackContextMenu();
    const isFav = isFavoriteSong(track);
    /** @type {{ label: string, run: () => void, danger?: boolean }[]} */
    const items = [
      { label: 'Play', run: () => row.click() },
      { label: 'Play next', run: () => {
        if (!state.queue.length || state.queueIndex < 0) { playTrack(track); return; }
        // in place: the queue stays the same array, so a My Wave top-up still loading for it keeps going
        for (let i = state.queue.length - 1; i > state.queueIndex; i--) {
          if (isSameTrack(state.queue[i], track)) state.queue.splice(i, 1);
        }
        state.queue.splice(state.queueIndex + 1, 0, track);
        updateQueueBadge();
        showToast(Tm('Playing next'), 'success');
      } },
      { label: 'Add to queue', run: () => {
        // only songs still to come count: one that already played is queued again
        const upcoming = state.queue.findIndex((/** @type {UrielTrack} */ t, /** @type {number} */ i) => i > state.queueIndex && isSameTrack(t, track));
        if (upcoming >= 0 || (state.queue[state.queueIndex] && isSameTrack(state.queue[state.queueIndex], track))) {
          showToast(Tm('Already in the queue'), 'info');
          return;
        }
        state.queue.push(track);
        updateQueueBadge();
        showToast(Tm('Added to queue'), 'success');
      } },
      ...(songRadioEnabled() ? [{ label: 'Start radio', run: () => startSongRadio([track]) }] : []),
      { label: 'Add to playlist…', run: () => openAddToPlaylistModal(track) },
      { label: isFav ? 'Remove from favorites' : 'Add to favorites', run: () => {
        toggleFavoriteTrack(track);
        const on = isFavoriteSong(track);
        const svg = row.querySelector('.btn-row-fav svg');
        if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
      } }
    ];
    const moment = topMomentMenuItem(track);
    if (moment) items.push(moment);
    const other = otherVersionMenuItem(track);
    if (other) items.push(other);
    if (track.artist && !/^unknown artist$/i.test(track.artist)) {
      items.push({ label: 'Go to artist', run: () => openTrackArtist(track) });
    }
    if (track.platform !== 'local') {
      items.push({ label: 'Download…', run: () => openDownloadModal(track) });
    }
    if (track.platform !== 'local') {
      items.push({ label: 'Share…', run: () => sharePlaylist({ name: [track.title, track.artist].filter(Boolean).join(' · ') || 'A song', tracks: [track] }) });
      if (track.url) items.push({ label: 'Copy song link', run: async () => { const ok = await copyText(track.url || ''); showToast(ok ? Tm('Link copied') : Tm("Couldn't copy the link"), ok ? 'success' : 'error'); } });
    }
    if (context === 'playlist') {
      items.push({ label: 'Remove from playlist', danger: true, run: () => removeTrackFromCurrentPlaylist(track) });
    }
    if (track.title) {
      items.push({ label: Lib.isSongBlocked(getBlocks().songs, track) ? 'Unblock song' : 'Block song', run: () => toggleBlockSong(track) });
    }
    if (track.artist && !/^unknown artist$/i.test(track.artist)) {
      const artistName = String(track.artist).split(/\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i)[0].trim();
      if (artistName) items.push({ label: Lib.isArtistBlocked(getBlocks().artists, artistName) ? 'Unblock artist' : 'Block artist', run: () => toggleBlockArtist(artistName) });
    }

    showActionMenu(x, y, items);
  }

  // a menu of { label, run, danger } at x, y (a song's, a playlist's); the same look and closing rules for all
  function showActionMenu(/** @type {number} */ x, /** @type {number} */ y, /** @type {UrielMenuItem[]} */ items, aboveY = y) {
    closeTrackContextMenu();
    const menu = document.createElement('div');
    menu.className = 'track-context-menu';
    menu.setAttribute('role', 'menu');
    items.forEach((/** @type {UrielMenuItem} */ item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'track-context-item' + (item.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      b.textContent = T(item.label);
      b.dataset.i18n = '';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTrackContextMenu();
        item.run();
      });
      menu.appendChild(b);
    });
    placeMenu(menu, x, y, aboveY);
    trackMenuEl = menu;
  }

  // Below the point when it fits, above it (aboveY) when not, and scrolling inside when neither: it used to be
  // pushed up over its button, or run off the bottom on a short window. Kept clear of the player bar. Phones get
  // a sheet along the bottom of the screen instead (mobile.css).
  function placeMenu(/** @type {HTMLElement} */ menu, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ aboveY) {
    document.body.appendChild(menu);
    if (isPhoneApp) { menu.classList.add('as-sheet'); return; }
    const bar = /** @type {HTMLElement} */ (document.querySelector('.playbar'));
    const barTop = bar && bar.offsetParent ? bar.getBoundingClientRect().top : window.innerHeight;
    const bottom = Math.min(window.innerHeight, barTop) - 8;
    if (menu.getBoundingClientRect().height > bottom - 8) {
      menu.style.maxHeight = `${Math.max(160, bottom - 8)}px`;
      menu.style.overflowY = 'auto';
    }
    const rect = menu.getBoundingClientRect();
    let top = y;
    if (top + rect.height > bottom) top = aboveY - rect.height >= 8 ? aboveY - rect.height : bottom - rect.height;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  document.addEventListener('click', closeTrackContextMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrackContextMenu(); });
  window.addEventListener('blur', closeTrackContextMenu);
  window.addEventListener('resize', closeTrackContextMenu);
  document.addEventListener('scroll', closeTrackContextMenu, true);

  function renderTracks(/** @type {HTMLElement} */ container, /** @type {UrielTrack[]} */ tracks, context = 'search') {
    if (!container) return;
    
    // the queue scrolls its own box in the drawer, everything else scrolls the main column
    const scrollParent = container.closest('.drawer-queue-scroll') || document.querySelector('.main-content');
    if (container._vScrollHandler && scrollParent) {
      scrollParent.removeEventListener('scroll', container._vScrollHandler);
    }

    // the list keeps its height while it is drawn again: emptied for a moment, the page got shorter and the browser
    // pulled a list scrolled far down back up, so a redraw (Add to queue, shuffle) jumped to other songs
    container.style.minHeight = `${container.offsetHeight}px`;
    container.innerHTML = '';
    
    if (!tracks || tracks.length === 0) {
      container.style.paddingTop = '0px';
      container.style.paddingBottom = '0px';
      /** @type {Record<string, string>} */
      const emptyMessages = {
        search: 'No matching songs. Try a different search',
        favorites: 'No favourites yet. Use the heart on a song to save it',
        playlist: 'This playlist is empty',
        local: 'Your library is empty. Add some music to get started',
        queue: 'Queue is empty. Play a song to start.'
      };
      container.innerHTML = `<div class="empty-hint" data-i18n>${emptyMessages[context] || 'No songs to show'}</div>`;
      container.style.minHeight = '';
      return;
    }

    // the row height is measured, not assumed: phone rows are 60px, and with a fixed 64 the drawn slice drifted
    // 4px per row away from the screen, so a long playlist showed blank space while scrolling (#40)
    let itemHeight = container._rowHeight || 64;
    const overscan = 15;
    function measureRowHeight() {
      const rows = /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.track-row'));
      if (rows.length < 2) return 0;
      const step = rows[1].offsetTop - rows[0].offsetTop;
      return step > 20 && step < 200 ? step : 0;
    }

    function renderChunk() {
      if (!scrollParent || container._isDraggingReorder) return;
      const parentRect = scrollParent.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = containerRect.top - parentRect.top + scrollParent.scrollTop;
      
      const visibleTop = Math.max(0, scrollParent.scrollTop - relativeTop);
      let startIndex = Math.floor(visibleTop / itemHeight) - overscan;
      let endIndex = Math.ceil((visibleTop + scrollParent.clientHeight) / itemHeight) + overscan;
      
      startIndex = Math.floor(startIndex / 5) * 5;
      endIndex = Math.ceil(endIndex / 5) * 5;
      
      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(tracks.length, endIndex);
      
      if (container._lastStartIndex === startIndex && container._lastEndIndex === endIndex) return;
      container._lastStartIndex = startIndex;
      container._lastEndIndex = endIndex;
      
      // keep the rows still in view (their images, focus and listeners stay) and only add or remove the difference
      const currentCanonicalId = state.currentTrack ? getTrackCanonicalId(state.currentTrack) : '';
      const kept = new Map();
      /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll(':scope > .track-row')).forEach((row) => {
        const idx = Number(row.dataset.trackIndex);
        if (idx >= startIndex && idx < endIndex && !kept.has(idx)) kept.set(idx, row);
        else row.remove();
      });
      const added = [];
      /** @type {Element | null} */
      let cursor = container.firstElementChild;
      for (let idx = startIndex; idx < endIndex; idx++) {
        let row = kept.get(idx);
        if (!row) {
          row = createTrackRow(tracks[idx], idx, currentCanonicalId, context, tracks, container);
          if (container._hasInitialRendered) row.style.animation = 'none';
          added.push(tracks[idx]);
        }
        if (row === cursor) cursor = /** @type {Element} */ (cursor).nextElementSibling;
        else container.insertBefore(row, cursor);
      }
      container.style.paddingTop = `${startIndex * itemHeight}px`;
      container.style.paddingBottom = `${(tracks.length - endIndex) * itemHeight}px`;
      container._hasInitialRendered = true;
      // reading a row's position makes the browser lay out the page right here, while scrolling: rows only change
      // height with the list's width (or when the list is drawn again), so once per width is enough
      const measured = container._rowMeasuredFor === parentRect.width ? 0 : measureRowHeight();
      if (measured) container._rowMeasuredFor = parentRect.width;
      if (measured && Math.abs(measured - itemHeight) > 0.5) {
        itemHeight = measured;
        container._rowHeight = measured;
        container._lastStartIndex = -1;
        container._lastEndIndex = -1;
        renderChunk();
        return;
      }
      highlightPlayingRow();
      checkOffline(added);
    }
    
    container._vScrollHandler = () => {
      if (!container._ticking) {
        window.requestAnimationFrame(() => {
          renderChunk();
          container._ticking = false;
        });
        container._ticking = true;
      }
    };
    
    if (scrollParent) {
       scrollParent.addEventListener('scroll', container._vScrollHandler, { passive: true });
    }
    
    container._hasInitialRendered = false;
    container._rowMeasuredFor = -1;
    container._lastStartIndex = -1;
    container._lastEndIndex = -1;
    renderChunk();
    container.style.minHeight = '';
  }

  function highlightPlayingRow() {
    const currentCanonicalId = state.currentTrack ? getTrackCanonicalId(state.currentTrack) : '';
    const rows = document.querySelectorAll('.track-row');

    if (!currentCanonicalId) {
      rows.forEach(r => r.classList.remove('playing'));
      return;
    }

    const containers = new Set();
    rows.forEach(r => {
      r.classList.remove('playing');
      if (r.parentElement) containers.add(r.parentElement);
    });

    containers.forEach(container => {
      const matches = Array.from(container.querySelectorAll('.track-row')).filter(r => r.dataset.canonicalId === currentCanonicalId);
      if (matches.length === 1) {
        matches[0].classList.add('playing');
      } else if (matches.length > 1) {
        const targetIdx = String(state.currentTrackIndexInContext);
        const exact = matches.find(r => r.dataset.trackIndex === targetIdx);
        if (exact) {
          exact.classList.add('playing');
        } else {
          matches[0].classList.add('playing');
        }
      }
    });
  }

  /** @type {UrielTrackRowsPart} */
  const api = { createTrackRow, renderTracks, highlightPlayingRow, isFavoriteSong, showActionMenu };
  Object.assign(out, api);
};
