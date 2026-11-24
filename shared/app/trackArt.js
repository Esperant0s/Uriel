// @ts-check
// The Track art dialog: a song's own cover and banner (a file, or a cover found online: its own covers in several
// sizes, YouTube results, iTunes albums), and the banner's own effects. Part of app.js, which calls this once as
// it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielTrackArtPart} out */
window.UrielApp.trackArt = function ({ I18N, LiquidMotion, T, Tm, YT_THUMB, analysisCache, closeModal, coverAnalysisCache, el, getTrackArt, getTrackCanonicalId, getTrackThumbUrl, isSameTrack, listThumb, m3cSetImage, nextTrackArt, renderTrackBannerFxControls, setTrackArt, showToast, state, syncTvBanner, trackArtCandidates, trackYoutubeId, updateMediaSession, updateRightPanelBanner, updateThemeFromState }, out) {
  /** @type {UrielTrack | null} */
  let trackArtCurrentTrack = null;

  function onTrackArtUpdated(/** @type {UrielTrack} */ track) {
    if (!track) return;

    const currentCover = getTrackThumbUrl(track);
    if (currentCover) coverAnalysisCache.delete(currentCover);
    if (track.thumbnail) coverAnalysisCache.delete(track.thumbnail);
    const art = getTrackArt(track);
    if (art.cover) coverAnalysisCache.delete(art.cover);

    if (track.id) {
      const cleanId = String(track.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      if (typeof analysisCache !== 'undefined' && analysisCache.delete) {
        analysisCache.delete(cleanId);
      }
    }

    if (state.currentTrack && isSameTrack(state.currentTrack, track)) {
      const thumb = getTrackThumbUrl(state.currentTrack);
      if (thumb) {
        if (el.playbarArtwork) {
          el.playbarArtwork.src = thumb;
          if (typeof m3cSetImage === 'function') m3cSetImage(thumb);
          el.playbarArtwork.style.display = 'block';
        }
        if (el.artworkFallback) el.artworkFallback.style.display = 'none';
        if (el.rightPanelCover) {
          el.rightPanelCover.src = thumb;
          el.rightPanelCover.style.display = 'block';
        }
        if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'none';
      }
      updateRightPanelBanner(thumb);
      if (state.isTvKaraokeOpen) syncTvBanner();
      updateMediaSession();
      updateThemeFromState();
    }

    const canonical = getTrackCanonicalId(track);
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.track-row')).forEach((row) => {
      if (row.dataset && row.dataset.canonicalId === canonical) {
        const img = /** @type {HTMLImageElement} */ (row.querySelector('.track-row-thumb'));
        if (img) { const full = getTrackThumbUrl(track); img.dataset.full = full; img.src = listThumb(full); }
      }
    });
  }

  function renderTrackArtModal() {
    if (!trackArtCurrentTrack) return;
    const t = trackArtCurrentTrack;
    const titleEl = document.getElementById('track-art-modal-title');
    if (titleEl) I18N.text(titleEl, 'Art: {0}', t.title || T('Untitled'));

    const art = getTrackArt(t);

    const coverImg = /** @type {HTMLImageElement} */ (document.getElementById('track-art-cover-img'));
    const coverPh = document.getElementById('track-art-cover-placeholder');
    const coverStatus = document.getElementById('track-art-cover-status');
    const activeCover = getTrackThumbUrl(t);
    if (coverImg) {
      coverImg.dataset.art = JSON.stringify(trackArtCandidates(t));
      coverImg.__artTried = null;
      coverImg.onerror = () => { if (!nextTrackArt(coverImg)) { coverImg.style.display = 'none'; if (coverPh) coverPh.style.display = 'block'; } };
    }
    if (activeCover) {
      if (coverImg) {
        coverImg.src = activeCover;
        coverImg.style.display = 'block';
      }
      if (coverPh) coverPh.style.display = 'none';
    } else {
      if (coverImg) coverImg.style.display = 'none';
      if (coverPh) coverPh.style.display = 'block';
    }
    if (coverStatus) coverStatus.textContent = art.cover ? 'Custom cover' : 'Default art';

    const bannerImg = /** @type {HTMLImageElement} */ (document.getElementById('track-art-banner-img'));
    const bannerVid = /** @type {HTMLVideoElement} */ (document.getElementById('track-art-banner-vid'));
    const bannerPh = document.getElementById('track-art-banner-placeholder');
    const bannerStatus = document.getElementById('track-art-banner-status');
    const activeBanner = art.banner || localStorage.getItem('uriel_banner_media') || activeCover;
    const isVideo = activeBanner && /\.(mp4|webm)($|\?)/i.test(activeBanner);

    if (activeBanner) {
      if (isVideo) {
        if (bannerImg) bannerImg.style.display = 'none';
        if (bannerVid) {
          bannerVid.src = activeBanner;
          bannerVid.style.display = 'block';
        }
      } else {
        if (bannerVid) bannerVid.style.display = 'none';
        if (bannerImg) {
          bannerImg.src = activeBanner;
          bannerImg.style.display = 'block';
        }
      }
      if (bannerPh) bannerPh.style.display = 'none';
    } else {
      if (bannerImg) bannerImg.style.display = 'none';
      if (bannerVid) bannerVid.style.display = 'none';
      if (bannerPh) bannerPh.style.display = 'block';
    }
    if (bannerStatus) bannerStatus.textContent = art.banner ? 'Custom banner' : (localStorage.getItem('uriel_banner_media') ? 'Global banner' : 'Default art');
    renderTrackBannerFxControls(t, art);
  }

  function openTrackArtModal(/** @type {UrielTrack} */ track, /** @type {HTMLElement | null} */ triggerEl = null) {
    if (!track) return;
    trackArtCurrentTrack = track;
    const modal = document.getElementById('track-art-modal');
    if (!modal) return;
    resetCoverPicker();
    renderTrackArtModal();
    const card = /** @type {HTMLElement} */ (modal.querySelector('.dialog-card') || modal);
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      modal.classList.add('visible');
      if (window.LiquidMotion) {
        LiquidMotion.open(card, triggerEl, 'y');
      }
    });
  }
  window.openTrackArtModal = openTrackArtModal;

  function closeTrackArtModal() {
    const modal = document.getElementById('track-art-modal');
    if (!modal) return;
    const card = /** @type {HTMLElement} */ (modal.querySelector('.dialog-card') || modal);
    if (window.LiquidMotion) {
      LiquidMotion.close(card, () => {
        modal.classList.remove('visible');
        modal.classList.add('hidden');
      });
    } else {
      closeModal(modal);
    }
  }

  const trackArtModal = document.getElementById('track-art-modal');
  const btnCloseTrackArtModal = document.getElementById('btn-close-track-art-modal');
  const btnChooseTrackCover = document.getElementById('btn-choose-track-cover');
  const btnResetTrackCover = document.getElementById('btn-reset-track-cover');
  const btnChooseTrackBanner = document.getElementById('btn-choose-track-banner');
  const btnResetTrackBanner = document.getElementById('btn-reset-track-banner');
  const btnRightPanelArt = document.getElementById('btn-right-panel-art');

  if (btnRightPanelArt) {
    btnRightPanelArt.addEventListener('click', () => {
      if (state.currentTrack) {
        openTrackArtModal(state.currentTrack, btnRightPanelArt);
      }
    });
  }

  if (btnCloseTrackArtModal) {
    btnCloseTrackArtModal.addEventListener('click', closeTrackArtModal);
  }

  if (trackArtModal) {
    trackArtModal.addEventListener('click', (e) => {
      if (e.target === trackArtModal) closeTrackArtModal();
    });
  }

  const isImageFile = (/** @type {string} */ u) => /\.(png|jpe?g|webp|gif)($|\?)/i.test(u);
  const isMediaFile = (/** @type {string} */ u) => /\.(png|jpe?g|webp|gif|mp4|webm)($|\?)/i.test(u);

  if (btnChooseTrackCover) {
    btnChooseTrackCover.addEventListener('click', async () => {
      if (!trackArtCurrentTrack) return;
      if (window.electronAPI && window.electronAPI.pickMedia) {
        const url = await window.electronAPI.pickMedia();
        if (url) {
          if (!isImageFile(url)) {
            showToast(Tm('Cover must be an image (PNG, JPG, WebP, GIF)'));
            return;
          }
          setTrackArt(trackArtCurrentTrack, { cover: url });
          onTrackArtUpdated(trackArtCurrentTrack);
          renderTrackArtModal();
        }
      }
    });
  }

  if (btnResetTrackCover) {
    btnResetTrackCover.addEventListener('click', () => {
      if (!trackArtCurrentTrack) return;
      setTrackArt(trackArtCurrentTrack, { cover: undefined });
      onTrackArtUpdated(trackArtCurrentTrack);
      renderTrackArtModal();
    });
  }

  // Cover picker (#18): the song's own covers in several sizes, the first YouTube results for artist + title,
  // and Apple Music (iTunes) album covers through the app's existing album search. Picking one saves it as the
  // song's custom cover; Reset goes back to the default.
  const coverPickerGrid = document.getElementById('track-art-picker-grid');
  const coverPickerStatus = document.getElementById('track-art-picker-status');
  const btnFindTrackCover = /** @type {HTMLButtonElement} */ (document.getElementById('btn-find-track-cover'));
  let coverPickerRun = 0;

  function resetCoverPicker() {
    coverPickerRun++;
    if (coverPickerGrid) { coverPickerGrid.innerHTML = ''; coverPickerGrid.hidden = true; }
    if (coverPickerStatus) I18N.text(coverPickerStatus, 'Pick one from YouTube and Apple Music');
    if (btnFindTrackCover) btnFindTrackCover.disabled = false;
  }

  async function coverCandidatesFor(/** @type {UrielTrack} */ track) {
    /** @type {{ url: string, source: string }[]} */
    const out = [];
    const seen = new Set();
    const add = (/** @type {string | undefined} */ url, /** @type {string} */ source) => {
      if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
      const key = url.replace(YT_THUMB, 'yt:$1/').replace(/\?.*$/, '');
      if (seen.has(url) || seen.has(key)) return;
      seen.add(url); seen.add(key);
      out.push({ url, source });
    };
    // the same frame in smaller sizes isn't a choice
    /** @type {string[]} */
    const own = trackArtCandidates(track).filter((/** @type {string} */ u) => /^https?:\/\//.test(u) && !u.startsWith('http://127.0.0.1') && !/ytimg\.com\/vi\/[^/]+\/(mq)?default\.jpg/.test(u));
    const ytId = trackYoutubeId(track);
    own.forEach((u) => add(u, YT_THUMB.test(u) ? 'YouTube' : T('Current')));
    if (ytId) ['maxresdefault', 'sddefault'].forEach((s) => add(`https://i.ytimg.com/vi/${ytId}/${s}.jpg`, 'YouTube'));
    const q = [track.artist, track.title].filter(Boolean).join(' ').trim();
    if (!q || !state.serverPort) return out;
    const base = `http://127.0.0.1:${state.serverPort}`;
    const [yt, albums] = await Promise.all([
      fetch(`${base}/api/search?q=${encodeURIComponent(q)}&platform=youtube&limit=6`).then((r) => r.json()).catch(() => null),
      fetch(`${base}/api/albums/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null),
    ]);
    ((albums && albums.albums) || []).slice(0, 8).forEach((/** @type {UrielAlbum} */ a) => add(a.cover, a.title ? `Apple Music · ${a.title}` : 'Apple Music'));
    ((yt && yt.tracks) || []).slice(0, 6).forEach((/** @type {UrielTrack} */ t) => add(t.thumbnail || (t.id ? `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg` : ''), t.title ? `YouTube · ${t.title}` : 'YouTube'));
    return out;
  }

  if (btnFindTrackCover && coverPickerGrid) {
    btnFindTrackCover.addEventListener('click', async () => {
      const track = trackArtCurrentTrack;
      if (!track) return;
      const run = ++coverPickerRun;
      btnFindTrackCover.disabled = true;
      if (coverPickerStatus) I18N.text(coverPickerStatus, 'Looking for covers…');
      const list = await coverCandidatesFor(track);
      if (run !== coverPickerRun) return;
      btnFindTrackCover.disabled = false;
      const current = getTrackThumbUrl(track);
      coverPickerGrid.innerHTML = '';
      list.forEach(({ url, source }) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'track-art-choice' + (url === current ? ' selected' : '');
        b.title = source;
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        // a size YouTube doesn't have comes back as an error (or a 120px grey frame): leave it out
        img.onerror = () => b.remove();
        img.onload = () => { if (img.naturalWidth <= 120 && /ytimg\.com\/vi\/[^/]+\/(maxres|sd)default/.test(url)) b.remove(); };
        img.src = url;
        const tag = document.createElement('span');
        tag.className = 'track-art-choice-src';
        tag.textContent = source;
        b.append(img, tag);
        b.addEventListener('click', () => {
          setTrackArt(track, { cover: url });
          onTrackArtUpdated(track);
          renderTrackArtModal();
          coverPickerGrid.querySelectorAll('.track-art-choice').forEach((x) => x.classList.toggle('selected', x === b));
        });
        coverPickerGrid.appendChild(b);
      });
      coverPickerGrid.hidden = !list.length;
      if (coverPickerStatus) I18N.text(coverPickerStatus, list.length ? 'Tap a cover to use it for this song' : 'No covers found');
    });
  }

  if (btnChooseTrackBanner) {
    btnChooseTrackBanner.addEventListener('click', async () => {
      if (!trackArtCurrentTrack) return;
      if (window.electronAPI && window.electronAPI.pickMedia) {
        const url = await window.electronAPI.pickMedia();
        if (url) {
          if (!isMediaFile(url)) {
            showToast(Tm('Banner must be image or video (PNG, JPG, WebP, GIF, MP4, WebM)'));
            return;
          }
          setTrackArt(trackArtCurrentTrack, { banner: url });
          onTrackArtUpdated(trackArtCurrentTrack);
          renderTrackArtModal();
        }
      }
    });
  }

  if (btnResetTrackBanner) {
    btnResetTrackBanner.addEventListener('click', () => {
      if (!trackArtCurrentTrack) return;
      setTrackArt(trackArtCurrentTrack, { banner: undefined });
      onTrackArtUpdated(trackArtCurrentTrack);
      renderTrackArtModal();
    });
  }

  /** @type {UrielTrackArtPart} */
  const api = { openTrackArtModal };
  Object.assign(out, api);
};
