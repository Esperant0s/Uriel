// @ts-check
// The album page: an iTunes album (its songs are found on YouTube when played) or a Daily Mix, with Play, Save and
// Download (the whole album). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielAlbumPart} out */
window.UrielApp.album = function ({ Lib, T, Tf, Tm, createTrackRow, escapeHtml, getCoverDominantColors, getSavedAlbums, getTrackCanonicalId, highlightPlayingRow, openArtistProfile, openDownloadAllModal, openTrackArtist, playAlbumFrom, playTrack, resolveAlbumTrack, setSavedAlbums, showAlbumExtras, showToast, state, switchView, updateFade }, out) {
  // ---- Download a whole album (#19): the playlist download (openDownloadAllModal) with the album's songs.
  // Songs already on this device (downloaded, or in the offline cache) are left out; when that is all of them
  // the button shows a check. While it runs the button counts the songs.
  /** @type {{ album: UrielAlbum, items: UrielTrack[], sources: UrielTrack[], isMix: boolean, downloaded: boolean[], busy: boolean, progress: string } | null} */
  let albumDownload = null;
  function renderAlbumDownloadButton() {
    const btn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-download-album'));
    if (!btn) return;
    const d = albumDownload;
    const items = d ? d.items : [];
    const all = !!d && items.length > 0 && d.downloaded.length === items.length && d.downloaded.every(Boolean);
    btn.disabled = !items.length;
    btn.classList.toggle('is-done', all && !(d && d.busy));
    btn.classList.toggle('is-busy', !!(d && d.busy));
    const prog = btn.querySelector('.dl-album-progress');
    if (prog) prog.textContent = d && d.busy ? d.progress : '';
    btn.title = d && d.busy ? Tf('Downloading {0}', d.progress) : all ? T('Album downloaded') : T('Download album');
    btn.setAttribute('aria-label', btn.title);
  }
  async function refreshAlbumDownloadState(/** @type {{ album: UrielAlbum, items: UrielTrack[], sources: UrielTrack[], isMix: boolean, downloaded: boolean[], busy: boolean, progress: string } | null} */ d) {
    if (!d || !state.serverPort) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/downloaded-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: d.items.map((/** @type {UrielTrack} */ t) => ({ title: t.title || '', artist: t.artist || '', id: String(t.id || ''), duration: Number(t.duration) || 0 })) }),
      });
      const data = await res.json();
      if (albumDownload !== d || !data || !data.success || !Array.isArray(data.downloaded)) return;
      d.downloaded = data.downloaded.map(Boolean);
    } catch (e) {}
    if (albumDownload === d) renderAlbumDownloadButton();
  }
  // items: the rows of the album page; sources: the album's own songs (found on YouTube when downloaded)
  function setupAlbumDownload(/** @type {UrielAlbum} */ album, /** @type {UrielTrack[]} */ items, /** @type {UrielTrack[]} */ sources, /** @type {boolean} */ isMix) {
    // a download of another album still running keeps its own object; this page gets a new one
    const keep = (items || []).map((/** @type {UrielTrack} */ t, /** @type {number} */ i) => ({ t, src: (sources || [])[i] })).filter((/** @type {{ t: UrielTrack, src: UrielTrack }} */ x) => x.t && x.t.platform !== 'local');
    albumDownload = { album, items: keep.map((/** @type {{ t: UrielTrack, src: UrielTrack }} */ x) => x.t), sources: keep.map((/** @type {{ t: UrielTrack, src: UrielTrack }} */ x) => x.src), isMix, downloaded: [], busy: false, progress: '' };
    renderAlbumDownloadButton();
    refreshAlbumDownloadState(albumDownload);
  }
  function resetAlbumDownload() {
    albumDownload = null;
    renderAlbumDownloadButton();
  }
  const btnDownloadAlbum = document.getElementById('btn-download-album');
  if (btnDownloadAlbum) {
    btnDownloadAlbum.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = albumDownload;
      if (!d || !d.items.length) return;
      if (d.busy) { showToast(Tm('This album is downloading: {0}', d.progress), 'info'); return; }
      const missing = d.items.filter((/** @type {UrielTrack} */ _, /** @type {number} */ i) => !d.downloaded[i]);
      if (!missing.length) { showToast(Tm('This album is already downloaded'), 'info'); return; }
      const byId = new Map(d.items.map((/** @type {UrielTrack} */ t, /** @type {number} */ i) => [t.id, d.sources[i]]));
      if (missing.length < d.items.length) showToast(Tm('{0} of {1} songs are already downloaded: getting the rest', d.items.length - missing.length, d.items.length), 'info');
      openDownloadAllModal({
        name: d.album.title || 'Album',
        tracks: missing,
        resolve: d.isMix ? null : (/** @type {UrielTrack} */ t) => resolveAlbumTrack(d.album, /** @type {UrielTrack} */ (byId.get(t.id))),
        onProgress: (/** @type {number} */ i, /** @type {number} */ n) => {
          d.busy = true;
          d.progress = `${i + 1}/${n}`;
          if (albumDownload === d) renderAlbumDownloadButton();
        },
        onDone: () => {
          d.busy = false;
          d.progress = '';
          if (albumDownload === d) { renderAlbumDownloadButton(); refreshAlbumDownloadState(d); }
        },
      }, 'Download album');
    });
  }

  let currentAlbumRunId = 0;

  // An album from iTunes (its songs are found on YouTube when played), or a Daily Mix (album.type 'Daily Mix',
  // its songs already in album.tracks, playable as they are)
  async function openAlbum(/** @type {UrielAlbum} */ album) {
    if (!album || !album.id) return;
    const runId = ++currentAlbumRunId;
    const isMix = album.type === 'Daily Mix';
    const kind = album.type || 'Album';

    state.previousView = state.currentView;
    switchView('album');
    showAlbumExtras(album);
    resetAlbumDownload();

    const coverEl = document.getElementById('album-detail-cover');
    if (coverEl) {
      if (Array.isArray(album.gridCovers) && album.gridCovers.length >= 4) {
        coverEl.innerHTML = `<div class="sp-grid-cover album-grid-cover">${album.gridCovers.slice(0, 4).map((/** @type {string} */ c) => `<img loading="lazy" decoding="async" src="${escapeHtml(c)}" alt="" />`).join('')}</div>`;
      } else {
        coverEl.innerHTML = album.cover
          ? `<img loading="lazy" decoding="async" src="${escapeHtml(album.cover)}" alt="${escapeHtml(album.title)}" style="width:100%;height:100%;aspect-ratio:1;border-radius:20px;object-fit:cover;box-shadow:none;" />`
          : '<div style="width:100%;height:100%;aspect-ratio:1;border-radius:20px;background:var(--md-sys-color-surface-container);"></div>';
      }
    }

    const titleEl = document.getElementById('album-detail-title');
    if (titleEl) titleEl.textContent = album.title || 'Untitled album';

    const artistBtn = document.getElementById('album-detail-artist');
    const setAlbumArtist = (/** @type {string} */ name) => {
      if (!artistBtn) return;
      artistBtn.textContent = name;
      // a mix lists the artists it was made from: nothing to open
      artistBtn.title = isMix ? '' : Tf('View {0}', name);
      artistBtn.classList.toggle('is-static', isMix);
      artistBtn.onclick = isMix ? null : () => {
        if (name && typeof openArtistProfile === 'function') openArtistProfile(name);
      };
    };
    setAlbumArtist(album.artist || '');

    const countEl = document.getElementById('album-detail-count');
    const baseCount = album.trackCount ? `${album.trackCount} song${album.trackCount === 1 ? '' : 's'}` : '';
    const initialMeta = [kind, album.year, baseCount].filter(Boolean).join(' · ');
    if (countEl) countEl.textContent = initialMeta || kind;

    const albumView = document.getElementById('view-album');
    const albumHeroFx = document.getElementById('album-hero-fx');
    const colorCover = album.cover || (album.gridCovers && album.gridCovers[0]) || '';
    if (albumHeroFx) {
      albumHeroFx.style.backgroundImage = colorCover ? `url("${colorCover}")` : '';
    }
    if (colorCover) {
      getCoverDominantColors(colorCover).then((/** @type {string[]} */ [domColor]) => {
        if (state.currentView === 'album' && currentAlbumRunId === runId) {
          if (albumView) albumView.style.setProperty('--playlist-accent-color', domColor);
          if (albumHeroFx) albumHeroFx.style.setProperty('--playlist-accent-color', domColor);
          document.documentElement.style.setProperty('--playlist-accent-color', domColor);
        }
      });
    } else {
      if (albumView) albumView.style.removeProperty('--playlist-accent-color');
      if (albumHeroFx) albumHeroFx.style.removeProperty('--playlist-accent-color');
      document.documentElement.style.removeProperty('--playlist-accent-color');
    }

    const playAlbumBtnInit = /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-album'));
    if (playAlbumBtnInit) {
      playAlbumBtnInit.disabled = true;
      playAlbumBtnInit.onclick = null;
    }

    const listEl = document.getElementById('album-tracks-list');
    if (listEl) {
      listEl.innerHTML = `<div class="m3-loader-container" style="display: flex; justify-content: center; align-items: center; padding: 64px 0; width: 100%;">
        <svg class="g-spinner" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/></svg>
      </div>`;
    }

    try {
      let tracks = isMix && Array.isArray(album.tracks) && album.tracks.length ? album.tracks : null;
      let albumArtist = album.artist || '';
      let albumYear = album.year || '';
      if (!tracks) {
        // the id first; the title and artist find the album when the id doesn't (iTunes gives it another id in
        // another country, and saved albums come along from linked devices)
        const q = new URLSearchParams({ id: album.id });
        if (album.title) q.set('title', album.title);
        if (album.artist) q.set('artist', album.artist);
        if (album.source) q.set('source', album.source);
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/album-tracks?${q}`);
        const data = await res.json();
        if (currentAlbumRunId !== runId) return;

        if (!data || !data.success || !Array.isArray(data.tracks) || data.tracks.length === 0) {
          throw new Error(data && data.error ? data.error : 'Failed to load album songs');
        }
        tracks = /** @type {UrielTrack[]} */ (data.tracks);
        albumArtist = (data.album && data.album.artist) || albumArtist;
        albumYear = (data.album && data.album.year) || albumYear;
        // opened without a cover (a saved album from a device that had none): the album's own, here and in the saved list
        if (!album.cover && data.album && data.album.cover) {
          album.cover = data.album.cover;
          if (coverEl) coverEl.innerHTML = `<img loading="lazy" decoding="async" src="${escapeHtml(album.cover)}" alt="${escapeHtml(album.title)}" style="width:100%;height:100%;aspect-ratio:1;border-radius:20px;object-fit:cover;box-shadow:none;" />`;
          if (albumHeroFx) albumHeroFx.style.backgroundImage = `url("${album.cover}")`;
          /** @type {UrielAlbum[]} */
          const saved = getSavedAlbums();
          if (saved.some(a => Lib.sameAlbum(a, album) && !a.cover)) setSavedAlbums(saved.map(a => (Lib.sameAlbum(a, album) && !a.cover ? { ...a, cover: album.cover } : a)));
        }
      }

      if (albumArtist && !isMix) setAlbumArtist(albumArtist);

      if (countEl) {
        const cnt = tracks.length === 1 ? T('1 song') : Tf('{0} songs', tracks.length);
        countEl.textContent = [T(kind), albumYear, cnt].filter(Boolean).join(' · ');
      }

      album._tracks = tracks;
      if (!album.trackCount) album.trackCount = tracks.length;

      // a mix's songs play as they are; an album's are found on YouTube (playAlbumFrom)
      const items = tracks.map((/** @type {UrielTrack} */ t, /** @type {number} */ idx) => (isMix ? { ...t, albumArtist } : {
        id: `${album.id}_${t.disc || 1}_${t.no || (idx + 1)}`,
        title: t.title,
        artist: t.artist || albumArtist,
        albumArtist: albumArtist,
        duration: Math.round((t.durationMs || 0) / 1000),
        durationMs: t.durationMs || 0,
        album: album.title || '',
        cover: album.cover,
        thumbnail: album.cover,
        no: t.no || (idx + 1),
        disc: t.disc || 1,
        ...(t.isExplicit ? { isExplicit: true } : {})
      }));
      const playFrom = (/** @type {number} */ idx) => (isMix ? playTrack(items[idx], items, idx, 'album') : playAlbumFrom(album, tracks, idx));
      setupAlbumDownload(album, items, isMix ? items : tracks, isMix);

      const playAlbumBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-album'));
      if (playAlbumBtn) {
        playAlbumBtn.disabled = false;
        playAlbumBtn.onclick = () => playFrom(0);
      }

      if (listEl) {
        listEl.innerHTML = '';
        const currentCanonicalId = state.currentTrack ? getTrackCanonicalId(state.currentTrack) : '';
        items.forEach((/** @type {UrielTrack} */ trackItem, /** @type {number} */ idx) => {
          const row = createTrackRow(trackItem, idx, currentCanonicalId, 'album', isMix ? items : tracks, listEl);
          row.addEventListener('click', (/** @type {MouseEvent} */ e) => {
            if (/** @type {HTMLElement} */ (e.target).closest('.track-row-actions')) return;
            if (/** @type {HTMLElement} */ (e.target).classList.contains('track-row-artist')) {
              e.stopPropagation();
              openTrackArtist(trackItem);
              return;
            }
            e.stopImmediatePropagation();
            playFrom(idx);
          }, true);
          listEl.appendChild(row);
        });
        highlightPlayingRow();
        const albumTracksCol = /** @type {HTMLElement} */ (document.querySelector('#view-album .album-tracks-col'));
        if (albumTracksCol) {
          albumTracksCol.scrollTop = 0;
          updateFade(albumTracksCol);
          if (!albumTracksCol._fadeBound) {
            albumTracksCol._fadeBound = true;
            albumTracksCol.addEventListener('scroll', () => updateFade(albumTracksCol), { passive: true });
          }
        }
      }
    } catch (err) {
      if (currentAlbumRunId !== runId) return;
      if (listEl) {
        listEl.innerHTML = `<div class="empty-hint" style="color: var(--md-sys-color-error, #ba1a1a);"><span data-i18n>Failed to load album:</span> ${escapeHtml((err instanceof Error ? err.message : String(err)))}</div>`;
      }
    }
  }
  window.openAlbum = openAlbum;

  /** @type {UrielAlbumPart} */
  const api = { openAlbum };
  Object.assign(out, api);
};
