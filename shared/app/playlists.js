// @ts-check
// Playlists: the list, a playlist's page and its buttons (play, shuffle, share, the More menu, rename, select),
// playlists on Home, which songs are downloaded, shared playlist links, and the new, delete and add-to dialogs.
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielPlaylistsPart} out */
window.UrielApp.playlists = function ({ showRecommendations, canReorder, closeModal, downloadedInFolder, dragGrip, el, escapeHtml, exitMultiSelect, formatDuration, getCoverDominantColors, getLibrarySort, getTrackCanonicalId, getTrackSortMode, getTrackThumbUrl, I18N, isBlocked, isFavoriteSong, isPhoneApp, isSameTrack, matchesTrackQuery, multiSel, multiSelectSourceTracks, nextTrackArt, offlineChanged, openModal, playTrack, renderPlaylistDuplicateButton, renderTracks, rerenderMultiSelectView, setShuffle, setTrackSortMode, setupSortDropdown, showActionMenu, showToast, songRadioEnabled, sortedLibrary, sortTracksFor, stampAddedAt, startMultiSelect, startSongRadio, state, switchView, syncPlaylistFromSource, syncSortDropdown, T, Tf, Tm, trackArtCandidates, updateFavoriteIcon, updateFavoritesBadge, updateMultiSelectBar, updateQueueBadge }, out) {
  function renderPlaylistCover(/** @type {HTMLElement} */ container, /** @type {UrielPlaylist} */ playlist, size = 64) {
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('playlist-cover-art');

    function renderFallback() {
      container.innerHTML = '';
      container.classList.remove('cover-single', 'cover-empty');
      const tracks = (playlist && playlist.tracks) ? playlist.tracks : [];
      let firstThumb = null;
      let firstTrack = null;
      for (const t of tracks) {
        const src = getTrackThumbUrl(t);
        if (src) {
          firstThumb = src;
          firstTrack = t;
          break;
        }
      }

      if (firstThumb) {
        container.classList.add('cover-single');
        const img = document.createElement('img');
        img.className = 'cover-single-img';
        img.src = firstThumb;
        img.alt = '';
        img.loading = 'lazy';
        img.style.objectFit = 'cover';
        img.dataset.art = JSON.stringify(trackArtCandidates(firstTrack));
        img.onerror = () => {
          if (nextTrackArt(img)) return;
          container.classList.remove('cover-single');
          container.classList.add('cover-empty');
          container.innerHTML = `<svg width="${Math.round(size * 0.45)}" height="${Math.round(size * 0.45)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        };
        container.appendChild(img);
      } else {
        container.classList.add('cover-empty');
        container.innerHTML = `
          <svg width="${Math.round(size * 0.45)}" height="${Math.round(size * 0.45)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        `;
      }
    }

    if (playlist && playlist.cover && typeof playlist.cover === 'string' && playlist.cover.trim()) {
      container.classList.add('cover-single');
      const img = document.createElement('img');
      img.className = 'cover-single-img';
      img.src = playlist.cover.trim();
      img.alt = '';
      img.loading = 'lazy';
      img.style.objectFit = 'cover';
      img.onerror = () => {
        renderFallback();
      };
      container.appendChild(img);
      return;
    }

    renderFallback();
  }

  // Home: "Your playlists". They only lived in a side drawer, and many people never found them.
  function renderHomePlaylists() {
    const box = document.getElementById('section-home-playlists');
    if (!box) return;
    const lists = state.playlists || [];
    box.innerHTML = `<div class="onrepeat-head"><h3 class="section-title" data-i18n>Your playlists</h3></div><div class="home-pl-row"></div>`;
    const row = /** @type {HTMLElement} */ (box.querySelector('.home-pl-row'));
    const card = (/** @type {string} */ cls, /** @type {() => void} */ onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `home-pl-card ${cls}`;
      b.addEventListener('click', onClick);
      row.appendChild(b);
      return b;
    };
    const add = card('home-pl-new', () => { if (el.btnNewPlaylist) el.btnNewPlaylist.click(); });
    add.innerHTML = `<span class="home-pl-cover"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span><b data-i18n>New playlist</b><span>${lists.length ? '&nbsp;' : 'Make your first one'}</span>`;
    lists.forEach((/** @type {UrielPlaylist} */ pl) => {
      const b = card('', () => openPlaylistDetail(pl.id));
      const cover = document.createElement('span');
      cover.className = 'home-pl-cover';
      renderPlaylistCover(cover, pl, 150);
      const n = (pl.tracks || []).length;
      b.append(cover);
      b.insertAdjacentHTML('beforeend', `<b>${escapeHtml(pl.name || 'Untitled')}</b><span data-i18n>${n} song${n === 1 ? '' : 's'}</span>`);
    });
  }

  function renderPlaylistsList() {
    renderHomePlaylists();
    if (!el.playlistsList) return;
    el.playlistsList.innerHTML = '';
    if (!state.playlists || state.playlists.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'playlists-empty-note';
      emptyMsg.style.cssText = 'padding: 24px 12px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: calc(13px * var(--font-scale, 1));';
      emptyMsg.textContent = 'No playlists yet';
      emptyMsg.dataset.i18n = '';
      el.playlistsList.appendChild(emptyMsg);
      return;
    }
    sortedLibrary('playlists', state.playlists).forEach((/** @type {UrielPlaylist} */ pl) => {
      const item = document.createElement('div');
      item.className = 'playlist-item';
      item.dataset.playlistId = pl.id;
      if (state.currentView === 'playlist-detail' && state.currentPlaylistId === pl.id) {
        item.classList.add('active');
      }

      const thumbEl = document.createElement('div');
      thumbEl.className = 'playlist-item-thumb';
      renderPlaylistCover(thumbEl, pl, 44);

      const infoEl = document.createElement('div');
      infoEl.className = 'playlist-item-info';
      const trackCount = (pl.tracks || []).length;
      infoEl.innerHTML = `
        <span class="playlist-item-name">${escapeHtml(pl.name || 'untitled')}</span>
        <span class="playlist-item-count" data-i18n>${trackCount} track${trackCount === 1 ? '' : 's'}</span>
      `;

      item.appendChild(thumbEl);
      item.appendChild(infoEl);
      if (canReorder('playlists')) item.appendChild(dragGrip());

      item.addEventListener('click', () => {
        openPlaylistDetail(pl.id);
      });
      el.playlistsList.appendChild(item);
    });
  }

  function createPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ initialTracks = [], cover = '', { open = true } = {}) {
    if (!name || !name.trim()) return null;
    /** @type {UrielPlaylist} */
    const newPl = {
      id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: name.trim(),
      tracks: Array.isArray(initialTracks)
        ? initialTracks.map(t => (t && typeof t.addedAt === 'number') ? t : stampAddedAt(t))
        : []
    };
    if (cover && typeof cover === 'string' && cover.trim()) {
      newPl.cover = cover.trim();
    }
    state.playlists.push(newPl);
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    renderPlaylistsList();
    if (open) openPlaylistDetail(newPl.id);
    return newPl;
  }

  function openPlaylistDetail(/** @type {string} */ playlistId) {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === playlistId);
    if (!pl) return;
    // the page shares its scroll with the view it was opened from: opened from "Your playlists" low on the
    // home screen, it showed up halfway down its song list with the header out of sight
    const opening = state.currentView !== 'playlist-detail' || state.currentPlaylistId !== playlistId;
    state.currentPlaylistId = playlistId;
    if (el.playlistDetailTitle) el.playlistDetailTitle.textContent = pl.name;
    const query = el.playlistSearchInput ? normalizeSearch(el.playlistSearchInput.value) : '';
    let filtered = pl.tracks;
    if (query) {
      filtered = pl.tracks.filter((/** @type {UrielTrack} */ t) => matchesTrackQuery(t, query));
    }
    filtered = sortTracksFor('playlist', filtered);
    if (el.playlistSort) { el.playlistSort.value = getTrackSortMode('playlist'); syncSortDropdown('playlist'); }
    renderPlaylistDescription(pl);
    renderPlaylistDuplicateButton(pl);
    renderPlaylistSource(pl);
    const totalSec = (pl.tracks || []).reduce((/** @type {number} */ acc, /** @type {UrielTrack} */ t) => acc + (t.duration || 0), 0);
    const durStr = totalSec > 0 ? ` • ${formatDuration(totalSec)}` : '';
    if (el.playlistDetailCount) el.playlistDetailCount.textContent = (query ? `${filtered.length} of ${pl.tracks.length} songs` : `${pl.tracks.length} songs`) + durStr;
    const detailCover = document.getElementById('playlist-detail-cover');
    if (detailCover) renderPlaylistCover(detailCover, pl, 160);
    const coverSrc = (pl && pl.cover) ? pl.cover : ((pl.tracks && pl.tracks[0]) ? getTrackThumbUrl(pl.tracks[0]) : '');
    const plHeroFx = document.getElementById('playlist-hero-fx');
    if (plHeroFx) {
      plHeroFx.style.backgroundImage = coverSrc ? `url("${coverSrc}")` : '';
    }
    const headerEl = /** @type {HTMLElement} */ (document.querySelector('.playlist-detail-header'));
    if (headerEl) {
      if (coverSrc) {
        getCoverDominantColors(coverSrc).then((/** @type {string[]} */ [domColor]) => {
          if (state.currentPlaylistId === playlistId) {
            headerEl.style.setProperty('--playlist-accent-color', domColor);
            document.documentElement.style.setProperty('--playlist-accent-color', domColor);
          }
        });
      } else {
        headerEl.style.removeProperty('--playlist-accent-color');
        document.documentElement.style.removeProperty('--playlist-accent-color');
      }
    }
    if (opening) { const main = document.querySelector('.main-content'); if (main) main.scrollTop = 0; }
    if (el.playlistTracksList) renderTracks(el.playlistTracksList, filtered, 'playlist');
    if (!query) showRecommendations('playlist', pl);
    switchView('playlist-detail');
    renderPlaylistsList();
    refreshPlaylistDownloads(pl);
  }

  if (el.playlistSort) {
    el.playlistSort.addEventListener('change', () => {
      setTrackSortMode('playlist', el.playlistSort.value);
      if (state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
    });
    el.playlistSort.value = getTrackSortMode('playlist');
    setupSortDropdown('playlist', el.playlistSort);
  }

  // A playlist's description, written right on the page ("Add a description..."); it goes wherever the
  // playlist goes (sync, share links keep to name and songs)
  const playlistDescEl = document.getElementById('playlist-detail-desc');
  // "From Spotify · imported 3 Nov" on a playlist made from a link, with Sync (app/imports.js)
  /** @type {Record<string, string>} */
  const SOURCE_NAMES = { spotify: 'Spotify', apple: 'Apple Music', yandex: 'Yandex Music', youtube: 'YouTube', ytmusic: 'YouTube Music', soundcloud: 'SoundCloud' };
  function renderPlaylistSource(/** @type {UrielPlaylist} */ pl) {
    const box = document.getElementById('playlist-source');
    const text = document.getElementById('playlist-source-text');
    if (!box || !text) return;
    const src = pl && pl.source;
    box.hidden = !(src && src.url);
    if (!src || !src.url) return;
    const day = new Date(src.at || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    text.textContent = Tf('From {0} · synced {1}', SOURCE_NAMES[src.kind] || src.kind, day);
  }
  const btnSyncPlaylist = document.getElementById('btn-sync-playlist');
  if (btnSyncPlaylist) btnSyncPlaylist.addEventListener('click', () => {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (pl) syncPlaylistFromSource(pl);
  });

  function renderPlaylistDescription(/** @type {UrielPlaylist} */ pl) {
    const desc = document.getElementById('playlist-detail-desc');
    if (!desc || document.activeElement === desc) return;
    desc.textContent = (pl && pl.description) || '';
  }
  if (playlistDescEl) {
    try { playlistDescEl.contentEditable = 'plaintext-only'; } catch (e) {}
    if (playlistDescEl.contentEditable !== 'plaintext-only') playlistDescEl.contentEditable = 'true';
    playlistDescEl.spellcheck = false;
    playlistDescEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); playlistDescEl.blur(); }
      if (e.key === 'Escape') {
        const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
        playlistDescEl.textContent = (pl && pl.description) || '';
        playlistDescEl.blur();
      }
      e.stopPropagation();
    });
    playlistDescEl.addEventListener('blur', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl) return;
      const next = playlistDescEl.textContent.replace(/\s+\n/g, '\n').trim().slice(0, 300);
      if ((pl.description || '') !== next) {
        if (next) pl.description = next;
        else delete pl.description;
        localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
      }
      playlistDescEl.textContent = pl.description || '';
    });
  }
  // Play goes through the playlist in the order shown; Shuffle turns shuffle on and starts on a random song
  function playOpenPlaylist(/** @type {boolean} */ shuffle) {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl || !pl.tracks || !pl.tracks.length) return;
    const list = sortTracksFor('playlist', pl.tracks);
    setShuffle(shuffle);
    const i = shuffle ? Math.floor(Math.random() * list.length) : 0;
    playTrack(list[i], list, i, 'playlist');
  }
  // Share: the playlist goes inside a link (share-link.js) that opens in the web player or in Uriel
  async function sharePlaylist(/** @type {{ name: string, tracks: UrielTrack[] } | undefined} */ pl) {
    const S = window.UrielShare;
    if (!pl || !S) return;
    let link, count;
    try { const r = await S.encode({ name: pl.name, tracks: pl.tracks || [] }); link = S.webLink(r.payload); count = r.count; } catch (e) { showToast(Tm("Couldn't make a link for this playlist"), 'error'); return; }
    if (!count) { showToast(Tm("Songs from your own files can't be shared, and this playlist has nothing else"), 'info'); return; }
    const skipped = (pl.tracks || []).length - count;
    const note = skipped > 0 ? ` (${skipped === 1 ? T('1 song from your own files left out') : Tf('{0} songs from your own files left out', skipped)})` : '';
    if (window.electronAPI && window.electronAPI.shareText) { // phones: the share sheet
      const r = await window.electronAPI.shareText(pl.name, `${pl.name} on Uriel 🎧 ${link}`);
      if (r === 'copied') showToast(Tm('Link copied{0}', note), 'success');
      else if (r === 'shared' && note) showToast(Tm('Shared{0}', note), 'info');
      else if (r === 'failed') showToast(Tm("Couldn't share the link"), 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast(Tm('Link copied. Anyone can open it in the browser or in Uriel{0}', note), 'success');
    } catch (e) { window.prompt(T('Copy this link'), link); }
  }
  // ---- the playlist's "More" menu: the things Spotify keeps behind its ⋯ ----
  function queuePlaylist(/** @type {UrielPlaylist} */ pl, /** @type {boolean} */ next) {
    const tracks = (pl.tracks || []).filter((/** @type {UrielTrack} */ t) => !isBlocked(t));
    if (!tracks.length) { showToast(Tm('This playlist is empty'), 'info'); return; }
    // nothing playing yet: the playlist simply starts
    if (!state.queue.length || state.queueIndex < 0) { playTrack(tracks[0], tracks.slice(), 0, 'playlist'); return; }
    if (next) state.queue.splice(state.queueIndex + 1, 0, ...tracks);
    else state.queue.push(...tracks);
    updateQueueBadge();
    window.dispatchEvent(new Event('uriel:queue'));
    showToast(next ? Tm('{0} songs play next', tracks.length) : Tm('{0} songs added to the queue', tracks.length), 'success');
  }
  function duplicatePlaylist(/** @type {UrielPlaylist} */ pl) {
    const taken = new Set(state.playlists.map((/** @type {UrielPlaylist} */ p) => p.name));
    let name = Tf('{0} (copy)', pl.name);
    for (let n = 2; taken.has(name); n++) name = Tf('{0} (copy {1})', pl.name, n);
    const copy = { ...pl, id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, tracks: (pl.tracks || []).map((/** @type {UrielTrack} */ t) => ({ ...t })) };
    state.playlists.push(copy);
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    window.dispatchEvent(new Event('uriel:library'));
    renderPlaylistsList();
    openPlaylistDetail(copy.id);
    showToast(Tm('Made "{0}"', name), 'success');
  }
  const btnPlaylistMore = document.getElementById('btn-playlist-more');
  if (btnPlaylistMore) btnPlaylistMore.addEventListener('click', (e) => {
    e.stopPropagation();
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl) return;
    const click = (/** @type {string} */ id) => () => { const b = document.getElementById(id); if (b) b.click(); };
    const r = btnPlaylistMore.getBoundingClientRect();
    showActionMenu(r.left, r.bottom + 6, [
      { label: 'Play next', run: () => queuePlaylist(pl, true) },
      { label: 'Add to queue', run: () => queuePlaylist(pl, false) },
      ...(songRadioEnabled() && (pl.tracks || []).length ? [{ label: 'Start radio', run: () => startSongRadio((pl.tracks || []).slice(0, 5)) }] : []),
      { label: 'Edit details', run: click('btn-rename-playlist') },
      { label: 'Duplicate', run: () => duplicatePlaylist(pl) },
      { label: 'Share…', run: () => sharePlaylist(pl) },
      { label: 'Export as file', run: click('btn-export-playlist') },
      { label: 'Delete playlist', danger: true, run: click('btn-delete-playlist') },
    ], r.top - 6);
  });

  // ---- which of a playlist's songs are already on this device ----
  // Songs from your own files always are; the others count when they're in the Downloads folder (what "Download
  // all" skips). Shown under the title ("12 of 40 downloaded") and on the Download button ("Download 28 more").
  let playlistDownloadsFor = '';
  async function refreshPlaylistDownloads(/** @type {UrielPlaylist | undefined} */ pl) {
    const stateEl = document.getElementById('playlist-download-state');
    const label = document.getElementById('btn-download-playlist-label');
    if (!pl || !stateEl) return;
    const id = pl.id;
    playlistDownloadsFor = id;
    const all = pl.tracks || [];
    const online = all.filter((/** @type {UrielTrack} */ t) => t.platform !== 'local');
    let present;
    try { present = online.length ? await downloadedInFolder(online) : []; } catch (e) { present = null; }
    if (playlistDownloadsFor !== id || state.currentPlaylistId !== id) return;
    if (!present) { stateEl.hidden = true; if (label) label.textContent = T('Download all'); return; }
    const have = present.filter(Boolean).length + (all.length - online.length);
    // the arrows on the rows agree with the count
    online.forEach((/** @type {UrielTrack} */ t, /** @type {number} */ i) => { if (present[i]) offlineChanged(t, true); });
    stateEl.hidden = !all.length || !have;
    stateEl.textContent = have >= all.length ? T('All downloaded') : Tf('{0} of {1} downloaded', have, all.length);
    stateEl.classList.toggle('complete', have >= all.length);
    if (label) label.textContent = have >= all.length && all.length ? T('Downloaded') : (have ? Tf('Download {0} more', all.length - have) : T('Download all'));
  }

  const btnSharePlaylist = document.getElementById('btn-share-playlist');
  if (btnSharePlaylist) btnSharePlaylist.addEventListener('click', () => sharePlaylist(state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId)));

  // a playlist someone shared: from a uriel://playlist link, the search bar or the link importer
  let importingShare = '';
  async function importSharedPlaylist(/** @type {string} */ text) {
    const S = window.UrielShare;
    const payload = S ? S.payloadFrom(text) : '';
    if (!payload) return false;
    if (importingShare === payload) return true;
    importingShare = payload;
    try {
      const { name, tracks } = await S.decode(payload);
      if (!tracks.length) { showToast(Tm('That playlist link has no songs Uriel can play'), 'info'); return true; }
      // short links carry only YouTube ids: look up titles and artists first
      if (tracks.some((/** @type {UrielTrack} */ t) => t.needsInfo)) { showToast(Tm('Adding "{0}"…', name), 'info'); await S.fillInfo(tracks); }
      const key = (/** @type {UrielTrack[]} */ list) => list.map((/** @type {UrielTrack} */ t) => `${t.platform}:${t.id}`).join('|');
      const same = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.name === name && key(p.tracks || []) === key(tracks));
      if (same) { openPlaylistDetail(same.id); showToast(Tm('You already have "{0}"', name), 'info'); return true; }
      const taken = new Set(state.playlists.map((/** @type {UrielPlaylist} */ p) => p.name));
      let finalName = name;
      for (let i = 2; taken.has(finalName); i++) finalName = `${name} (${i})`;
      createPlaylist(finalName, tracks);
      showToast(tracks.length === 1 ? Tm('Added "{0}" (1 song)', finalName) : Tm('Added "{0}" ({1} songs)', finalName, tracks.length), 'success');
    } catch (e) {
      showToast(Tm("That playlist link didn't work. It may have been cut off, so ask for it again"), 'error');
    } finally {
      setTimeout(() => { if (importingShare === payload) importingShare = ''; }, 3000);
    }
    return true;
  }
  window.addEventListener('uriel:deeplink', (e) => { const d = /** @type {CustomEvent} */ (e).detail; if (/^(?:uriel|muriel):\/\/playlist/i.test(String(d || ''))) importSharedPlaylist(d); });

  if (el.btnPlayPlaylist) el.btnPlayPlaylist.addEventListener('click', () => playOpenPlaylist(false));
  const btnShufflePlaylist = document.getElementById('btn-shuffle-playlist');
  if (btnShufflePlaylist) btnShufflePlaylist.addEventListener('click', () => playOpenPlaylist(true));

  (function setupFavAllPlaylist() {
    const btn = document.getElementById('btn-fav-all-playlist');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl || !pl.tracks) return;
      let added = 0;
      for (let i = pl.tracks.length - 1; i >= 0; i--) {
        const track = pl.tracks[i];
        if (!isFavoriteSong(track)) {
          state.favorites.unshift(stampAddedAt(track));
          added++;
        }
      }
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      updateFavoritesBadge();
      updateFavoriteIcon();
      btn.title = Tf('{0} added to favorites', added);
      const old = btn.style.color;
      btn.style.color = '#ff6b8a';
      setTimeout(() => { btn.style.color = old; btn.title = T('Add all to favorites'); }, 2500);
    });
  })();

  (function setupPlaylistRename() {
    const btn = document.getElementById('btn-rename-playlist');
    const titleEl = document.getElementById('playlist-detail-title');
    if (!btn || !titleEl) return;
    btn.addEventListener('click', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl || titleEl.querySelector('input')) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = pl.name || '';
      input.style.cssText = 'font:inherit;color:inherit;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.4);border-radius:12px;padding:2px 12px;width:100%;max-width:600px;outline:none;';
      titleEl.textContent = '';
      titleEl.appendChild(input);
      input.focus();
      input.select();
      let done = false;
      const finish = (/** @type {boolean} */ save) => {
        if (done) return;
        done = true;
        const newName = input.value.trim();
        if (save && newName) {
          pl.name = newName;
          localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
        }
        titleEl.textContent = pl.name;
        renderPlaylistsList();
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    });
  })();

  (function setupMultiSelectControls() {
    const on = (/** @type {string} */ id, /** @type {() => void} */ fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    on('btn-select-playlist', () => startMultiSelect('playlist'));
    on('btn-select-favorites', () => startMultiSelect('favorites'));
    on('multi-select-done', () => exitMultiSelect());
    on('multi-select-all', () => {
      const all = multiSelectSourceTracks();
      const allSelected = all.length > 0 && all.every((/** @type {UrielTrack} */ t) => multiSel.tracks.has(getTrackCanonicalId(t)));
      multiSel.tracks.clear();
      if (!allSelected) all.forEach((/** @type {UrielTrack} */ t) => multiSel.tracks.set(getTrackCanonicalId(t), t));
      updateMultiSelectBar();
      rerenderMultiSelectView();
    });
    on('multi-select-fav', () => {
      let added = 0;
      multiSel.tracks.forEach((/** @type {UrielTrack} */ t) => {
        if (!isFavoriteSong(t)) { state.favorites.unshift(stampAddedAt(t)); added++; }
      });
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      updateFavoritesBadge();
      updateFavoriteIcon();
      showToast(!added ? Tm('Already in favorites') : added === 1 ? Tm('Added 1 song to favorites') : Tm('Added {0} songs to favorites', added), added ? 'success' : 'info');
    });
    on('multi-select-radio', () => {
      const picked = Array.from(multiSel.tracks.values());
      if (!picked.length) return;
      if (picked.length > 5) showToast(Tm('Radio uses the first 5 selected songs'), 'info');
      exitMultiSelect();
      startSongRadio(picked);
    });
    on('multi-select-add', () => {
      const picked = Array.from(multiSel.tracks.values());
      if (picked.length) openAddToPlaylistModal(null, picked);
    });
    on('multi-select-remove', () => {
      const n = multiSel.tracks.size;
      if (!n || !window.confirm(n === 1 ? T('Remove 1 song?') : Tf('Remove {0} songs?', n))) return;
      if (multiSel.context === 'favorites') {
        state.favorites = state.favorites.filter((/** @type {UrielTrack} */ f) => !multiSel.tracks.has(getTrackCanonicalId(f)));
        localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
        updateFavoritesBadge();
        updateFavoriteIcon();
      } else {
        const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
        if (pl) {
          pl.tracks = pl.tracks.filter((/** @type {UrielTrack} */ t) => !multiSel.tracks.has(getTrackCanonicalId(t)));
          localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
          renderPlaylistsList();
        }
      }
      multiSel.tracks.clear();
      updateMultiSelectBar();
      rerenderMultiSelectView();
    });
  })();

  // takes the row's song object: a playlist can hold the same song twice, and removing one copy took all of them
  function removeTrackFromCurrentPlaylist(/** @type {UrielTrack} */ track) {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl) return;
    const at = pl.tracks.indexOf(track);
    if (at >= 0) pl.tracks.splice(at, 1);
    else pl.tracks = pl.tracks.filter((/** @type {UrielTrack} */ t) => !isSameTrack(t, track));
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    if (state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
  }

  function deleteCurrentPlaylist() {
    if (!state.currentPlaylistId) return;
    state.playlists = state.playlists.filter((/** @type {UrielPlaylist} */ p) => p.id !== state.currentPlaylistId);
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    state.currentPlaylistId = null;
    renderPlaylistsList();
    switchView('discover');
  }

  /** @type {UrielTrack | null} */
  let trackToAddToPlaylist = null;
  /** @type {UrielTrack[] | null} */
  let manyToAddToPlaylist = null;
  // tracks waiting for the playlist that "New playlist" in the add dialog is about to create
  /** @type {UrielTrack[] | null} */
  let tracksForNewPlaylist = null;
  function openAddToPlaylistModal(/** @type {UrielTrack | null} */ track, /** @type {UrielTrack[] | null} */ many = null) {
    trackToAddToPlaylist = track;
    manyToAddToPlaylist = many;
    if (!el.playlistPickList) return;

    const trackPreviewEl = document.getElementById('add-playlist-track-preview');
    if (trackPreviewEl) {
      if (track) {
        const thumb = getTrackThumbUrl(track) || '';
        trackPreviewEl.innerHTML = '';
        if (thumb) {
          const previewImg = document.createElement('img');
          previewImg.className = 'add-playlist-track-preview-thumb';
          previewImg.src = thumb;
          previewImg.alt = '';
          previewImg.style.width = '40px';
          previewImg.style.height = '40px';
          previewImg.style.flex = '0 0 40px';
          previewImg.onerror = () => { previewImg.style.visibility = 'hidden'; };
          trackPreviewEl.appendChild(previewImg);
        } else {
          const previewPlaceholder = document.createElement('div');
          previewPlaceholder.className = 'add-playlist-track-preview-thumb';
          previewPlaceholder.style.width = '40px';
          previewPlaceholder.style.height = '40px';
          previewPlaceholder.style.flex = '0 0 40px';
          previewPlaceholder.style.display = 'flex';
          previewPlaceholder.style.alignItems = 'center';
          previewPlaceholder.style.justifyContent = 'center';
          previewPlaceholder.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
          trackPreviewEl.appendChild(previewPlaceholder);
        }

        const previewInfo = document.createElement('div');
        previewInfo.className = 'add-playlist-track-preview-info';

        const previewTitle = document.createElement('span');
        previewTitle.className = 'add-playlist-track-preview-title';
        previewTitle.textContent = track.title || 'untitled';

        const previewArtist = document.createElement('span');
        previewArtist.className = 'add-playlist-track-preview-artist';
        previewArtist.textContent = track.artist || 'unknown artist';

        previewInfo.appendChild(previewTitle);
        previewInfo.appendChild(previewArtist);
        trackPreviewEl.appendChild(previewInfo);
        trackPreviewEl.style.display = 'flex';
      } else {
        trackPreviewEl.style.display = 'none';
        trackPreviewEl.innerHTML = '';
      }
    }

    el.playlistPickList.innerHTML = '';
    if (state.playlists.length === 0) {
      el.playlistPickList.innerHTML = '<div class="empty-hint" data-i18n style="padding: 24px 0; text-align: center; color: var(--md-sys-color-outline);">No playlists yet. Create one first.</div>';
    } else {
      state.playlists.forEach((/** @type {UrielPlaylist} */ pl, /** @type {number} */ idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'playlist-pick-item';
        item.style.animationDelay = `${idx * 25}ms`;

        const isAlreadyAdded = many
          ? many.length > 0 && many.every((/** @type {UrielTrack} */ m) => (pl.tracks || []).some((/** @type {UrielTrack} */ t) => t.id === m.id))
          : track && (pl.tracks || []).some((/** @type {UrielTrack} */ t) => t.id === track.id);
        if (isAlreadyAdded) item.classList.add('already-added');

        const thumbEl = document.createElement('div');
        thumbEl.className = 'playlist-pick-thumb';
        thumbEl.style.width = '44px';
        thumbEl.style.height = '44px';
        thumbEl.style.flex = '0 0 44px';
        renderPlaylistCover(thumbEl, pl, 44);
        const coverImg = thumbEl.querySelector('img');
        if (coverImg) {
          coverImg.style.width = '44px';
          coverImg.style.height = '44px';
          coverImg.style.objectFit = 'cover';
        }

        const infoEl = document.createElement('div');
        infoEl.className = 'playlist-pick-info';
        const trackCount = (pl.tracks || []).length;

        const nameEl = document.createElement('span');
        nameEl.className = 'playlist-pick-name';
        nameEl.textContent = pl.name || 'untitled';

        const countEl = document.createElement('span');
        countEl.className = 'playlist-pick-count';
        countEl.textContent = `${trackCount} song${trackCount === 1 ? '' : 's'}`;
        countEl.dataset.i18n = '';

        infoEl.appendChild(nameEl);
        infoEl.appendChild(countEl);

        const actionEl = document.createElement('div');
        if (isAlreadyAdded) {
          actionEl.className = 'playlist-pick-badge in-playlist';
          actionEl.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Added
          `;
        } else {
          actionEl.className = 'playlist-pick-action-btn';
          actionEl.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          `;
        }

        item.appendChild(thumbEl);
        item.appendChild(infoEl);
        item.appendChild(actionEl);

        item.addEventListener('click', () => {
          if (many) {
            const fresh = many.filter((/** @type {UrielTrack} */ m) => !pl.tracks.some((/** @type {UrielTrack} */ t) => t.id === m.id));
            fresh.forEach((/** @type {UrielTrack} */ m) => pl.tracks.push(stampAddedAt(m)));
            if (fresh.length) {
              localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
              renderPlaylistsList();
            }
            showToast(!fresh.length ? Tm('Already in "{0}"', pl.name) : fresh.length === 1 ? Tm('Added 1 song to "{0}"', pl.name) : Tm('Added {0} songs to "{1}"', fresh.length, pl.name), fresh.length ? 'success' : 'info');
          } else if (track) {
            if (!pl.tracks.some((/** @type {UrielTrack} */ t) => t.id === track.id)) {
              pl.tracks.push(stampAddedAt(track));
              localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
              renderPlaylistsList();
              showToast(Tm('Added to "{0}"', pl.name), 'success');
            } else {
              showToast(Tm('Already in "{0}"', pl.name), 'info');
            }
          }
          if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
        });

        el.playlistPickList.appendChild(item);
      });
    }
    if (el.addToPlaylistModal) openModal(el.addToPlaylistModal);
  }

  if (el.playlistSearchInput) {
    el.playlistSearchInput.addEventListener('input', () => {
      if (state.currentPlaylistId) openPlaylistDetail(state.currentPlaylistId);
    });
  }
  if (el.btnBackPlaylists) el.btnBackPlaylists.addEventListener('click', () => switchView('discover'));

  const deletePlaylistModal = document.getElementById('delete-playlist-modal');
  const deletePlaylistMsg = document.getElementById('delete-playlist-msg');
  const btnCancelDeletePlaylist = document.getElementById('btn-cancel-delete-playlist');
  const btnConfirmDeletePlaylist = document.getElementById('btn-confirm-delete-playlist');

  if (el.btnDeletePlaylist) {
    el.btnDeletePlaylist.addEventListener('click', () => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl) return;
      if (deletePlaylistMsg) I18N.text(deletePlaylistMsg, 'Delete playlist "{0}"? This action cannot be undone.', pl.name);
      if (deletePlaylistModal) openModal(deletePlaylistModal);
    });
  }

  if (btnCancelDeletePlaylist && deletePlaylistModal) {
    btnCancelDeletePlaylist.addEventListener('click', () => {
      closeModal(deletePlaylistModal);
    });
  }

  if (btnConfirmDeletePlaylist && deletePlaylistModal) {
    btnConfirmDeletePlaylist.addEventListener('click', () => {
      deleteCurrentPlaylist();
      closeModal(deletePlaylistModal);
      showToast(Tm('Playlist deleted'));
    });
  }

  // "Or import one" (the service buttons under Create) only when making an empty playlist
  const showCreateImportBar = (/** @type {boolean} */ on) => { const bar = el.createPlaylistModal && el.createPlaylistModal.querySelector('.cpm-import-bar'); if (bar) bar.classList.toggle('hidden', !on); };

  if (el.btnNewPlaylist) {
    el.btnNewPlaylist.addEventListener('click', () => {
      tracksForNewPlaylist = null;
      if (el.newPlaylistInput) el.newPlaylistInput.value = '';
      showCreateImportBar(true);
      if (el.createPlaylistModal) openModal(el.createPlaylistModal);
      if (el.newPlaylistInput) el.newPlaylistInput.focus();
    });
  }

  if (el.btnCancelNewPlaylist) {
    el.btnCancelNewPlaylist.addEventListener('click', () => {
      tracksForNewPlaylist = null;
      if (el.createPlaylistModal) closeModal(el.createPlaylistModal);
    });
  }

  if (el.btnConfirmNewPlaylist) {
    el.btnConfirmNewPlaylist.addEventListener('click', () => {
      const name = el.newPlaylistInput ? el.newPlaylistInput.value : '';
      if (!name.trim()) return;
      const pending = tracksForNewPlaylist;
      tracksForNewPlaylist = null;
      if (pending && pending.length) {
        // made from the add dialog: put the song(s) in and stay where the user was
        const seen = new Set();
        const pl = createPlaylist(name, pending.filter((/** @type {UrielTrack} */ t) => t && t.id && !seen.has(t.id) && seen.add(t.id)), '', { open: false });
        if (pl) showToast(pl.tracks.length === 1 ? Tm('Added to "{0}"', pl.name) : Tm('Added {0} songs to "{1}"', pl.tracks.length, pl.name), 'success');
      } else {
        createPlaylist(name);
      }
      if (el.createPlaylistModal) closeModal(el.createPlaylistModal);
    });
  }

  if (el.newPlaylistInput) {
    el.newPlaylistInput.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' && el.btnConfirmNewPlaylist) el.btnConfirmNewPlaylist.click();
      if (e.key === 'Escape' && el.btnCancelNewPlaylist) el.btnCancelNewPlaylist.click();
    });
  }

  if (el.btnCancelAddPlaylist) {
    el.btnCancelAddPlaylist.addEventListener('click', () => {
      if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
    });
  }

  const btnCloseAddPlaylist = document.getElementById('btn-close-add-playlist-modal');
  if (btnCloseAddPlaylist) {
    btnCloseAddPlaylist.addEventListener('click', () => {
      if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
    });
  }

  const btnCreatePlFromAdd = document.getElementById('btn-create-pl-from-add-modal');
  if (btnCreatePlFromAdd) {
    btnCreatePlFromAdd.addEventListener('click', () => {
      tracksForNewPlaylist = manyToAddToPlaylist ? manyToAddToPlaylist.slice() : (trackToAddToPlaylist ? [trackToAddToPlaylist] : null);
      if (el.addToPlaylistModal) closeModal(el.addToPlaylistModal);
      if (el.createPlaylistModal) {
        if (el.newPlaylistInput) el.newPlaylistInput.value = '';
        showCreateImportBar(false);
        openModal(el.createPlaylistModal);
        if (el.newPlaylistInput) el.newPlaylistInput.focus();
      }
    });
  }

  /** @type {UrielPlaylistsPart} */
  const api = { renderPlaylistCover, renderPlaylistsList, createPlaylist, openPlaylistDetail, sharePlaylist, refreshPlaylistDownloads, importSharedPlaylist, removeTrackFromCurrentPlaylist, deleteCurrentPlaylist, openAddToPlaylistModal };
  Object.assign(out, api);
};
