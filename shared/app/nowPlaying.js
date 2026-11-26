// @ts-check
// What the playing song looks like around the app: the player bar and Now playing (cover crossfades, the glow
// from the cover's colours), and the banners behind Now playing and a playlist. Part of app.js, which calls
// this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielNowPlayingPart} out */
window.UrielApp.nowPlaying = function ({ analyzeCover, applyVisualEffects, el, formatDuration, getMediaArtwork, getTrackCanonicalId, getTrackThumbUrl, highlightPlayingRow, m3cSetImage, nextPlayerArt, refreshMeshCover, rememberTrackArt, setCoverBg, state, updateFavoriteIcon, updateMediaSession, updateThemeFromState, updateTvKaraokeMeta }, out) {
  // Crossfades cover art: the old image is cloned into a ghost that fades/shrinks out
  // while the new one blurs in underneath. The new src is decoded first so it never pops.
  const artSwapTokens = new WeakMap();
  function swapArtwork(/** @type {HTMLImageElement} */ img, /** @type {string} */ src, /** @type {(() => void) | undefined} */ onShown = undefined) {
    const token = {};
    artSwapTokens.set(img, token);
    const shown = img.style.display === 'block' && img.complete && img.naturalWidth > 0;
    if (!shown || img.getAttribute('src') === src || document.body.classList.contains('perf') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      img.src = src;
      img.style.display = 'block';
      if (onShown) onShown();
      return;
    }
    const pre = new Image();
    pre.src = src;
    const commit = () => {
      if (artSwapTokens.get(img) !== token) return;
      /** @type {HTMLElement} */ (img.parentElement).querySelectorAll('.art-ghost').forEach((/** @type {Element} */ g) => g.remove());
      const ghost = /** @type {HTMLElement} */ (img.cloneNode(false));
      ghost.removeAttribute('id');
      ghost.classList.remove('art-in');
      ghost.classList.add('art-ghost');
      ghost.style.cssText = `position:absolute;left:${img.offsetLeft}px;top:${img.offsetTop}px;width:${img.offsetWidth}px;height:${img.offsetHeight}px;display:block;margin:0;pointer-events:none;`;
      img.after(ghost);
      ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
      setTimeout(() => ghost.remove(), 900);
      img.src = src;
      img.style.display = 'block';
      img.classList.remove('art-in');
      void img.offsetWidth;
      img.classList.add('art-in');
      if (onShown) onShown();
    };
    pre.decode().then(commit, commit);
  }

  // YouTube's large cover is about six times the size of the small one and often missing (a grey stand-in that still
  // has to come back first): show the small one straight away and put the large one in once it's there
  const YT_MAXRES = /^(https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[\w-]{11}\/)maxresdefault\.jpg$/;
  function quickArt(/** @type {string} */ src) {
    return src.replace(YT_MAXRES, '$1mqdefault.jpg');
  }
  function showPlayerArt(/** @type {HTMLImageElement} */ img, /** @type {string} */ src) {
    const small = quickArt(src);
    if (small === src) return swapArtwork(img, src);
    let shown = false, bigReady = false;
    const upgrade = () => { if (shown && bigReady && img.getAttribute('src') === small) img.src = src; };
    swapArtwork(img, small, () => { shown = true; upgrade(); });
    const big = new Image();
    big.src = src;
    big.decode().then(() => { if (big.naturalWidth > 120) { bigReady = true; upgrade(); } }, () => {});
  }

  const FADE_IMG_SEL = '.track-row-thumb, .my-wave-track-cover, .quick-play-pill-img';
  // covers that already loaded once skip the fade: a scrolled list draws its rows again and again, and fading each
  // cover in from nothing made rows look like they disappeared while scrolling (#40)
  /** @type {Set<string | null>} */
  const shownThumbs = new Set();
  const markImgLoaded = (/** @type {Event} */ e) => {
    const t = /** @type {HTMLImageElement} */ (e.target);
    if (t.tagName !== 'IMG' || !t.matches(FADE_IMG_SEL)) return;
    // a cover that turns up right after its row was drawn came from the cache: no fade for that one either
    if (e.type === 'load' && t.__drawnAt && performance.now() - t.__drawnAt < 150) t.style.transition = 'none';
    t.classList.add('is-loaded');
    if (e.type === 'load') shownThumbs.add(t.getAttribute('src'));
  };
  document.addEventListener('load', markImgLoaded, true);
  document.addEventListener('error', markImgLoaded, true);

  // Colours the drawer with a soft glow from the cover's own palette (cheap stand-in for the old blurred banner).
  function tintNowPlaying(/** @type {string} */ src) {
    const panel = el.rightPanel;
    if (!panel) return;
    if (!src) {
      panel.style.removeProperty('--np-c1');
      panel.style.removeProperty('--np-c2');
      return;
    }
    analyzeCover(src).then((/** @type {{ accent: string, accent2?: string }} */ a) => {
      if (!state.currentTrack || getTrackThumbUrl(state.currentTrack) !== src) return;
      panel.style.setProperty('--np-c1', a.accent);
      panel.style.setProperty('--np-c2', a.accent2 || a.accent);
    });
  }

  /** @param {UrielTrack} track */
  function updateNowPlayingUI(track) {
    window.dispatchEvent(new CustomEvent('uriel:track', { detail: track }));
    if (el.playbarTitle) el.playbarTitle.textContent = track.title || 'Untitled';
    if (el.playbarTitle) el.playbarTitle.dataset.origTitle = track.title || '';
    if (el.playbarArtist) {
      el.playbarArtist.textContent = track.artist || 'Unknown artist';
      el.playbarArtist.classList.remove('play-failed');
      el.playbarArtist.removeAttribute('title');
    }

    const thumb = getTrackThumbUrl(track);
    if (thumb) {
      if (el.playbarArtwork) {
        el.playbarArtwork.onload = () => {
          // a fallback that loaded replaces the song's dead cover for good
          const shown = el.playbarArtwork.getAttribute('src') || '';
          if (el.playbarArtwork.__artTrack === track && shown !== thumb && shown !== quickArt(thumb)) rememberTrackArt(getTrackCanonicalId(track), shown);
          if (state.currentTrack && 'mediaSession' in navigator && navigator.mediaSession.metadata) {
            const curThumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : '') || state.currentTrack.thumbnail || '';
            const art = getMediaArtwork(curThumb);
            if (art.length > 0) {
              navigator.mediaSession.metadata.artwork = art;
            }
          }
        };
        showPlayerArt(el.playbarArtwork, thumb);
        if (typeof m3cSetImage === 'function') m3cSetImage(thumb);
        el.playbarArtwork.onerror = () => {
          // a dead cover: try the song's other covers (the right panel follows) before showing the placeholder
          const next = nextPlayerArt(track, el.playbarArtwork);
          if (next) {
            if (typeof m3cSetImage === 'function') m3cSetImage(next);
            if (el.rightPanelCover) el.rightPanelCover.src = next;
            updateThemeFromState();
            return;
          }
          el.playbarArtwork.style.display = 'none';
          if (el.artworkFallback) el.artworkFallback.style.display = 'flex';
        };
      }
      if (el.artworkFallback) el.artworkFallback.style.display = 'none';
      if (el.rightPanelCover) {
        showPlayerArt(el.rightPanelCover, thumb);
        el.rightPanelCover.onerror = () => {
          const next = nextPlayerArt(track, el.rightPanelCover);
          if (next) return;
          el.rightPanelCover.style.display = 'none';
          if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'flex';
        };
      }
      if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'none';
    } else {
      if (el.playbarArtwork) el.playbarArtwork.style.display = 'none';
      if (typeof m3cSetImage === 'function') m3cSetImage('');
      if (el.artworkFallback) el.artworkFallback.style.display = 'flex';
      if (el.rightPanelCover) el.rightPanelCover.style.display = 'none';
      if (el.rightPanelFallback) el.rightPanelFallback.style.display = 'flex';
    }

    if (el.rightPanelTitle) el.rightPanelTitle.textContent = track.title || 'Untitled';
    if (el.rightPanelArtist) el.rightPanelArtist.textContent = track.artist || 'Unknown artist';

    if (el.btnPlaybarMore) el.btnPlaybarMore.style.display = track.platform === 'local' ? 'none' : '';
    if (el.timeDuration && track && track.duration) el.timeDuration.textContent = formatDuration(track.duration);

    tintNowPlaying(thumb);
    refreshMeshCover();
    setCoverBg(thumb);
    updateFavoriteIcon();
    applyVisualEffects();
    highlightPlayingRow();
    updateThemeFromState();
    updateMediaSession();
    if (state.isTvKaraokeOpen) updateTvKaraokeMeta();
  }

  /** @type {UrielNowPlayingPart} */
  const api = { shownThumbs, updateNowPlayingUI };
  Object.assign(out, api);
};
