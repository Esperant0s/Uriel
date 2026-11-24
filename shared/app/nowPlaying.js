// @ts-check
// What the playing song looks like around the app: the player bar and Now playing (cover crossfades, the glow
// from the cover's colours), and the banners behind Now playing and a playlist. Part of app.js, which calls
// this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielNowPlayingPart} out */
window.UrielApp.nowPlaying = function ({ analyzeCover, applyVisualEffects, el, formatDuration, getAdv, getMediaArtwork, getTrackArt, getTrackCanonicalId, getTrackThumbUrl, highlightPlayingRow, m3cSetImage, nextPlayerArt, refreshMeshCover, rememberTrackArt, setCoverBg, setTrackArt, state, syncTvBanner, updateFavoriteIcon, updateMediaSession, updateThemeFromState, updateTvKaraokeMeta }, out) {
  // Crossfades cover art: the old image is cloned into a ghost that fades/shrinks out
  // while the new one blurs in underneath. The new src is decoded first so it never pops.
  const artSwapTokens = new WeakMap();
  function swapArtwork(/** @type {HTMLImageElement} */ img, /** @type {string} */ src) {
    const token = {};
    artSwapTokens.set(img, token);
    const shown = img.style.display === 'block' && img.complete && img.naturalWidth > 0;
    if (!shown || img.getAttribute('src') === src || document.body.classList.contains('perf') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      img.src = src;
      img.style.display = 'block';
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
    };
    pre.decode().then(commit, commit);
  }

  const FADE_IMG_SEL = '.track-row-thumb, .my-wave-track-cover, .quick-play-pill-img';
  // covers that already loaded once skip the fade: a scrolled list draws its rows again and again, and fading each
  // cover in from nothing made rows look like they disappeared while scrolling (#40)
  /** @type {Set<string | null>} */
  const shownThumbs = new Set();
  const markImgLoaded = (/** @type {Event} */ e) => {
    const t = /** @type {HTMLImageElement} */ (e.target);
    if (t.tagName !== 'IMG' || !t.matches(FADE_IMG_SEL)) return;
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
          if (el.playbarArtwork.__artTrack === track && shown !== thumb) rememberTrackArt(getTrackCanonicalId(track), shown);
          if (state.currentTrack && 'mediaSession' in navigator && navigator.mediaSession.metadata) {
            const curThumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : '') || state.currentTrack.thumbnail || '';
            const art = getMediaArtwork(curThumb);
            if (art.length > 0) {
              navigator.mediaSession.metadata.artwork = art;
            }
          }
        };
        swapArtwork(el.playbarArtwork, thumb);
        if (typeof m3cSetImage === 'function') m3cSetImage(thumb);
        el.playbarArtwork.onerror = () => {
          // a dead cover: try the song's other covers (the right panel follows) before showing the placeholder
          const next = nextPlayerArt(track, el.playbarArtwork);
          if (next) {
            if (typeof m3cSetImage === 'function') m3cSetImage(next);
            if (el.rightPanelCover) el.rightPanelCover.src = next;
            updateRightPanelBanner(next);
            updateThemeFromState();
            return;
          }
          el.playbarArtwork.style.display = 'none';
          if (el.artworkFallback) el.artworkFallback.style.display = 'flex';
        };
      }
      if (el.artworkFallback) el.artworkFallback.style.display = 'none';
      if (el.rightPanelCover) {
        swapArtwork(el.rightPanelCover, thumb);
        el.rightPanelCover.onerror = () => {
          const next = nextPlayerArt(track, el.rightPanelCover);
          if (next) { updateRightPanelBanner(next); return; }
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

    updateRightPanelBanner(thumb);
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

  function updateRightPanelBanner(/** @type {string} */ thumbUrl) {
    const banner = /** @type {HTMLElement} */ (document.getElementById('right-panel-banner'));
    if (!banner) return;
    if (!getAdv('banners', true) || !getAdv('track_banners', true)) {
      banner.style.display = 'none';
      if (state.isTvKaraokeOpen) syncTvBanner();
      return;
    }
    banner.style.display = '';
    const bannerImg = /** @type {HTMLElement} */ (banner.querySelector('.banner-image') || banner);
    const trackArt = state.currentTrack ? getTrackArt(state.currentTrack) : {};
    const trackBanner = trackArt.banner || null;
    const globalMedia = localStorage.getItem('uriel_banner_media');
    const mediaToUse = trackBanner || globalMedia || thumbUrl;
    banner._pendingMedia = mediaToUse;

    if (!mediaToUse) {
      banner.classList.add('fading-out');
      setTimeout(() => {
        bannerImg.style.backgroundImage = 'none';
        const vid = banner.querySelector('video.banner-video');
        if (vid) vid.remove();
        banner.style.opacity = '0';
        banner.classList.remove('fading-out');
        if (state.isTvKaraokeOpen) syncTvBanner();
      }, 300);
      if (state.isTvKaraokeOpen) syncTvBanner();
      return;
    }

    const isVideo = /\.(mp4|webm)($|\?)/i.test(mediaToUse);
    if (isVideo) {
      bannerImg.style.backgroundImage = 'none';
      let vid = /** @type {HTMLVideoElement} */ (banner.querySelector('video.banner-video'));
      if (!vid) {
        vid = document.createElement('video');
        vid.className = 'banner-video';
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        banner.appendChild(vid);
      }
      vid.onerror = () => {
        if (trackBanner && state.currentTrack) {
          setTrackArt(state.currentTrack, { banner: undefined });
          updateRightPanelBanner(thumbUrl);
        } else {
          banner.style.opacity = '0';
          if (state.isTvKaraokeOpen) syncTvBanner();
        }
      };
      if (vid.src !== mediaToUse) {
        vid.src = mediaToUse;
        vid.play().catch(() => {});
      }
      banner.style.opacity = '1';
      if (state.isTvKaraokeOpen) syncTvBanner();
      return;
    }

    const vid = banner.querySelector('video.banner-video');
    if (vid) vid.remove();

    const img = new Image();
    img.src = mediaToUse;
    img.onload = () => {
      if (banner._pendingMedia !== mediaToUse) return;
      const nextBg = `url("${mediaToUse}")`;
      const cur = /** @type {HTMLElement} */ (banner.querySelector('.banner-image'));
      const curBg = cur ? cur.style.backgroundImage : '';
      if (cur && curBg === nextBg) {
        banner.style.opacity = '1';
      } else if (!cur || !curBg || curBg === 'none' || banner.style.opacity !== '1' || document.body.classList.contains('perf')) {
        bannerImg.style.backgroundImage = nextBg;
        banner.style.opacity = '1';
      } else {
        // Crossfade: new layer goes underneath (first in DOM, so querySelector finds it), old one fades out on top.
        banner.querySelectorAll('.banner-image.banner-leaving').forEach(n => n.remove());
        const next = /** @type {HTMLElement} */ (cur.cloneNode(false));
        next.style.backgroundImage = nextBg;
        cur.before(next);
        cur.classList.add('banner-leaving');
        cur.addEventListener('animationend', () => cur.remove(), { once: true });
        setTimeout(() => cur.remove(), 1200);
      }
      if (state.isTvKaraokeOpen) syncTvBanner();
    };
    img.onerror = () => {
      if (trackBanner && state.currentTrack) {
        setTrackArt(state.currentTrack, { banner: undefined });
        updateRightPanelBanner(thumbUrl);
      } else {
        banner.style.opacity = '0';
        if (state.isTvKaraokeOpen) syncTvBanner();
      }
    };
    if (state.isTvKaraokeOpen) syncTvBanner();
  }

  function updatePlaylistDetailBanner(/** @type {string} */ thumbUrl) {
    const banner = document.getElementById('playlist-header-banner');
    if (!banner) return;
    if (!getAdv('banners', true)) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = '';
    const bannerImg = /** @type {HTMLElement} */ (banner.querySelector('.banner-image') || banner);
    const globalMedia = localStorage.getItem('uriel_banner_media');
    const mediaToUse = globalMedia || thumbUrl;

    if (!mediaToUse) {
      banner.style.opacity = '0';
      bannerImg.style.backgroundImage = 'none';
      const vid = banner.querySelector('video.banner-video');
      if (vid) vid.remove();
      return;
    }

    const isVideo = /\.(mp4|webm)($|\?)/i.test(mediaToUse);
    if (isVideo) {
      bannerImg.style.backgroundImage = 'none';
      let vid = /** @type {HTMLVideoElement} */ (banner.querySelector('video.banner-video'));
      if (!vid) {
        vid = document.createElement('video');
        vid.className = 'banner-video';
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        banner.appendChild(vid);
      }
      if (vid.src !== mediaToUse) {
        vid.src = mediaToUse;
        vid.play().catch(() => {});
      }
      banner.style.opacity = '1';
      return;
    }

    const vid = banner.querySelector('video.banner-video');
    if (vid) vid.remove();

    const img = new Image();
    img.src = mediaToUse;
    img.onload = () => {
      bannerImg.style.backgroundImage = `url("${mediaToUse}")`;
      banner.style.opacity = '1';
    };
    img.onerror = () => {
      banner.style.opacity = '0';
    };
  }

  /** @type {UrielNowPlayingPart} */
  const api = { shownThumbs, updateNowPlayingUI, updateRightPanelBanner, updatePlaylistDetailBanner };
  Object.assign(out, api);
};
