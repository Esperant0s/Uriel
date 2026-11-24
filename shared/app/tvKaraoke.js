// @ts-check
// The TV karaoke: the lyrics fullscreen over the song's banner, its controls, which output it plays on, and its
// settings (fonts, sizes, the visualizer behind it). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielTvKaraokePart} out */
window.UrielApp.tvKaraoke = function ({ applyTrackBannerFx, audioEngine, el, ensureSfFontLoaded, fontVal, getTrackArt, getTrackThumbUrl, isPhoneApp, playNext, playPrev, renderLyricsView, resizeCanvases, setPlayPauseState, setTvkAmbient, SF_FONT_STACK, showToast, startVisualizers, state, stopLyricsScroll, syncTvkAmbientPlayback, syncTvkProgress, T, Tf, Tm, toggleFavoriteTrack, togglePlayPause, updateLyricsPadding, updatePlayPauseButton, updateSyncedLyricsHighlight, viz }, out) {
  /** @type {HTMLElement | null} */
  let lyricsContainerParent = null;
  /** @type {ChildNode | null} */
  let lyricsContainerSibling = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tvIdleTimer = null;
  const getTvIdleTimer = () => tvIdleTimer;

  function resetTvIdleTimer() {
    if (!state.isTvKaraokeOpen || !el.tvKaraoke) return;
    el.tvKaraoke.classList.remove('tv-idle');
    if (tvIdleTimer) clearTimeout(tvIdleTimer);
    tvIdleTimer = setTimeout(() => {
      const tvkPanel = document.getElementById('tvk-panel');
      if (tvkPanel && tvkPanel.classList.contains('open')) return;
      if (state.isTvKaraokeOpen && el.tvKaraoke) {
        el.tvKaraoke.classList.add('tv-idle');
      }
    }, 3000);
  }

  let activeTvBannerKey = '';
  let activeTvLayerIdx = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tvBannerTransitionTimer = null;

  function syncTvBanner() {
    const tvBg = el.tvBg || document.getElementById('tv-bg');
    if (!tvBg) return;

    let layerA = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-a'));
    let layerB = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-b'));
    if (!layerA || !layerB) {
      tvBg.innerHTML = '<div class="tv-bg-layer active" id="tv-bg-layer-a"></div><div class="tv-bg-layer" id="tv-bg-layer-b"></div>';
      layerA = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-a'));
      layerB = /** @type {HTMLElement} */ (document.getElementById('tv-bg-layer-b'));
      activeTvLayerIdx = 0;
      activeTvBannerKey = '';
    }

    const banner = document.getElementById('right-panel-banner');
    let bannerType = 'none';
    let bannerSrc = '';

    if (banner && banner.style.display !== 'none' && banner.style.opacity !== '0') {
      const bannerImg = /** @type {HTMLElement} */ (banner.querySelector('.banner-image'));
      const video = banner.querySelector('video');
      const img = banner.querySelector('img');
      if (video && video.src) {
        bannerType = 'video';
        bannerSrc = video.src;
      } else if (img && img.src) {
        bannerType = 'img';
        bannerSrc = img.src;
      } else if (bannerImg && bannerImg.style.backgroundImage && bannerImg.style.backgroundImage !== 'none') {
        bannerType = 'bg';
        bannerSrc = bannerImg.style.backgroundImage;
      } else if (banner.style.backgroundImage && banner.style.backgroundImage !== 'none') {
        bannerType = 'bg';
        bannerSrc = banner.style.backgroundImage;
      }
    }

    // the song's own banner (Track art dialog), with its own blur / opacity / fade when it has them (Riff 43)
    const songArt = state.currentTrack ? getTrackArt(state.currentTrack) : {};
    applyTrackBannerFx(songArt);
    if (bannerType === 'none' && songArt.banner) {
      bannerType = /\.(mp4|webm)($|\?)/i.test(songArt.banner) ? 'video' : 'img';
      bannerSrc = songArt.banner;
    }

    // no banner (they're gone in Uriel): use the custom background if there is one, else the cover
    const customBg = localStorage.getItem('uriel_bg_url') || '';
    if (bannerType === 'none' && customBg) {
      bannerType = /\.(mp4|webm)($|\?)/i.test(customBg) ? 'video' : 'img';
      bannerSrc = customBg;
    }

    if (bannerType === 'none') {
      const thumb = getTrackThumbUrl(state.currentTrack);
      if (thumb) {
        bannerType = 'fallback';
        bannerSrc = thumb;
      }
    }
    setTvkAmbient(bannerType === 'fallback' || bannerType === 'none');

    const newKey = `${bannerType}:${bannerSrc}`;
    if (newKey === activeTvBannerKey) return;

    const layers = [layerA, layerB];
    const prevLayer = layers[activeTvLayerIdx];
    const nextIdx = 1 - activeTvLayerIdx;
    const nextLayer = layers[nextIdx];

    if (tvBannerTransitionTimer) {
      clearTimeout(tvBannerTransitionTimer);
      tvBannerTransitionTimer = null;
    }

    nextLayer.innerHTML = '';
    nextLayer.style.backgroundImage = '';
    nextLayer.classList.remove('fallback');

    let transitionDone = false;
    const activateNext = () => {
      if (transitionDone) return;
      transitionDone = true;
      nextLayer.classList.add('active');
      prevLayer.classList.remove('active');
      activeTvLayerIdx = nextIdx;
      activeTvBannerKey = newKey;

      tvBannerTransitionTimer = setTimeout(() => {
        prevLayer.innerHTML = '';
        prevLayer.style.backgroundImage = '';
        prevLayer.classList.remove('fallback');
        tvBannerTransitionTimer = null;
      }, 550);
    };

    if (bannerType === 'video') {
      const vid = document.createElement('video');
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.src = bannerSrc;
      vid.onloadeddata = () => {
        vid.play().catch(() => {});
        activateNext();
      };
      vid.onerror = () => activateNext();
      nextLayer.appendChild(vid);
    } else if (bannerType === 'img') {
      const img = document.createElement('img');
      img.onload = () => activateNext();
      img.onerror = () => activateNext();
      img.src = bannerSrc;
      nextLayer.appendChild(img);
    } else if (bannerType === 'bg') {
      nextLayer.style.backgroundImage = bannerSrc;
      activateNext();
    } else if (bannerType === 'fallback') {
      nextLayer.classList.add('fallback');
      const img = new Image();
      img.onload = () => {
        nextLayer.style.backgroundImage = `url("${bannerSrc}")`;
        activateNext();
      };
      img.onerror = () => {
        nextLayer.style.backgroundImage = `url("${bannerSrc}")`;
        activateNext();
      };
      img.src = bannerSrc;
    } else {
      activateNext();
    }
  }

  /** @param {boolean} [forcedNoLyrics] */

  function syncTvLayout(forcedNoLyrics) {
    const tv = el.tvKaraoke || document.getElementById('tv-karaoke');
    if (!tv) return;
    const panel = el.rightPanel || document.getElementById('right-panel');
    const noLyrics = typeof forcedNoLyrics === 'boolean'
      ? forcedNoLyrics
      : (panel ? panel.classList.contains('lyrics-empty') : (!state.syncedLyrics || state.syncedLyrics.length === 0));
    const wasNoLyrics = tv.classList.contains('tv-nolyrics');
    tv.classList.toggle('tv-nolyrics', !!noLyrics);
    if (wasNoLyrics !== !!noLyrics && typeof resizeCanvases === 'function') {
      requestAnimationFrame(resizeCanvases);
    }
  }

  let lastTvMetaTrackKey = '';
  function updateTvKaraokeMeta() {
    const curTrack = state.currentTrack;
    const trackKey = curTrack ? `${curTrack.id || ''}:${curTrack.title || ''}:${curTrack.artist || ''}` : '';
    const isNew = trackKey !== lastTvMetaTrackKey;
    lastTvMetaTrackKey = trackKey;

    const titleText = (curTrack && curTrack.title) || 'No song';
    const artistText = (curTrack && curTrack.artist) || '';

    if (el.tvKaraokeTitle) {
      if (isNew && el.tvKaraokeTitle.textContent !== titleText) {
        el.tvKaraokeTitle.style.opacity = '0';
        el.tvKaraokeTitle.style.transform = 'translateY(6px)';
        setTimeout(() => {
          el.tvKaraokeTitle.textContent = titleText;
          el.tvKaraokeTitle.style.opacity = '1';
          el.tvKaraokeTitle.style.transform = 'none';
        }, 120);
      } else {
        el.tvKaraokeTitle.textContent = titleText;
      }
    }
    if (el.tvKaraokeArtist) {
      if (isNew && el.tvKaraokeArtist.textContent !== artistText) {
        el.tvKaraokeArtist.style.opacity = '0';
        el.tvKaraokeArtist.style.transform = 'translateY(6px)';
        setTimeout(() => {
          el.tvKaraokeArtist.textContent = artistText;
          el.tvKaraokeArtist.style.opacity = '1';
          el.tvKaraokeArtist.style.transform = 'none';
        }, 120);
      } else {
        el.tvKaraokeArtist.textContent = artistText;
      }
    }

    const coverEl = /** @type {HTMLImageElement} */ (el.tvCover || document.getElementById('tv-cover'));
    if (coverEl) {
      const thumb = getTrackThumbUrl(curTrack);
      if (thumb) {
        if (coverEl.dataset.currentThumb !== thumb) {
          coverEl.dataset.currentThumb = thumb;
          const preImg = new Image();
          preImg.onload = () => {
            if (coverEl.dataset.currentThumb === thumb) {
              coverEl.style.opacity = '0';
              coverEl.style.transform = 'scale(0.96)';
              setTimeout(() => {
                coverEl.src = thumb;
                coverEl.style.display = 'block';
                coverEl.style.opacity = '1';
                coverEl.style.transform = 'scale(1)';
              }, 120);
            }
          };
          preImg.onerror = () => {
            // a slow failure for an earlier song mustn't replace the cover that is showing now
            if (coverEl.dataset.currentThumb !== thumb) return;
            coverEl.src = thumb;
            coverEl.style.display = 'block';
            coverEl.style.opacity = '1';
            coverEl.style.transform = 'scale(1)';
          };
          preImg.src = thumb;
        }
      } else {
        coverEl.dataset.currentThumb = '';
        coverEl.style.display = 'none';
        coverEl.src = '';
      }
    }
    syncTvBanner();
    syncTvLayout();
  }

  /** @type {ReturnType<typeof setInterval> | null} */
  let tvkOutputInterval = null;
  async function updateTvkOutput() {
    const nameEl = document.getElementById('tvk-output-name');
    const batteryEl = document.getElementById('tvk-battery');
    const batteryPctEl = document.getElementById('tvk-battery-pct');
    const batteryLevelEl = document.getElementById('tvk-battery-level');
    const outputContainer = document.getElementById('tvk-output');
    if (!nameEl) return;

    let deviceName = '';
    let batteryLevel = null;

    if (window.electronAPI && typeof window.electronAPI.getAudioOutputInfo === 'function') {
      try {
        const info = await window.electronAPI.getAudioOutputInfo();
        if (info && info.name && info.name !== 'Default output') {
          deviceName = info.name;
        }
        if (info && typeof info.battery === 'number') {
          batteryLevel = info.battery;
        }
      } catch (e) {}
    }

    if (!deviceName) {
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/audio-output-info`);
        if (res.ok) {
          const info = await res.json();
          if (info && info.name && info.name !== 'Default output') {
            deviceName = info.name;
          }
          if (info && typeof info.battery === 'number') {
            batteryLevel = info.battery;
          }
        }
      } catch (e) {}
    }

    if (!deviceName && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        const audioEl = el.nativeAudio || document.getElementById('native-audio');
        const sinkId = (audioEl && audioEl.sinkId) ? audioEl.sinkId : '';

        let matched = null;
        if (sinkId) {
          matched = audioOutputs.find(d => d.deviceId === sinkId);
        }
        if (!matched) {
          matched = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
        }

        let label = matched && matched.label ? matched.label.trim() : '';
        label = label.replace(/^Default\s*[-–—:]\s*/i, '').trim();
        if (label && label.toLowerCase() !== 'default') {
          deviceName = label;
        }
      } catch (e) {}
    }

    const finalName = deviceName || T('Default output');
    nameEl.textContent = finalName;
    if (outputContainer) outputContainer.title = finalName;

    if (batteryEl && batteryPctEl && batteryLevelEl) {
      if (batteryLevel !== null && !isNaN(batteryLevel) && batteryLevel >= 0) {
        const clampedPct = Math.max(0, Math.min(100, Math.round(batteryLevel)));
        batteryPctEl.textContent = `${clampedPct}%`;
        const fillH = Math.max(clampedPct > 0 ? 1 : 0, Math.min(12, Math.round(12 * (clampedPct / 100))));
        const fillY = 19 - fillH;
        batteryLevelEl.setAttribute('y', String(fillY));
        batteryLevelEl.setAttribute('height', String(fillH));
        batteryLevelEl.setAttribute('x', '8');
        batteryLevelEl.setAttribute('width', '8');
        batteryEl.classList.remove('hidden');
        batteryEl.classList.toggle('battery-low', clampedPct <= 20);
        batteryEl.title = Tf('Battery level: {0}%', clampedPct);
      } else {
        batteryEl.classList.add('hidden');
      }
    }
  }

  function openTvKaraoke() {
    if (!el.tvKaraoke || !el.lyricsContainer) return;
    if (state.isTvKaraokeOpen) return;
    state.isTvKaraokeOpen = true;
    if (!viz.animationFrameId) { viz.hasDrawnPausedFrame = false; startVisualizers(); }

    lyricsContainerParent = el.lyricsContainer.parentElement;
    lyricsContainerSibling = el.lyricsContainer.nextSibling;

    if (el.tvKaraokeContent) {
      el.tvKaraokeContent.appendChild(el.lyricsContainer);
    }
    if (el.lyricsContainer) {
      el.lyricsContainer.style.paddingTop = '';
      el.lyricsContainer.style.paddingBottom = '';
      el.lyricsContainer.scrollTop = 0;
    }
    updateTvKaraokeMeta();
    syncTvBanner();
    syncTvLayout();
    el.tvKaraoke.classList.remove('hidden');
    syncTvkAmbientPlayback();
    applyTvk();
    syncTvkUI();
    resetTvIdleTimer();
    resizeCanvases();
    if (state.isPlaying) {
      if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(true);
      startVisualizers();
    }

    stopLyricsScroll();
    renderLyricsView();
    const syncTvLyrics = () => {
      updateLyricsPadding();
      state.forceSnapLyrics = true;
      state.forceLyricsScroll = true;
      state.lastActiveLyricIdx = -1;
      if (el.nativeAudio) {
        const cur = el.nativeAudio.currentTime || 0;
        const dur = el.nativeAudio.duration || (state.currentTrack ? state.currentTrack.duration : 0);
        updateSyncedLyricsHighlight(cur);
        syncTvkProgress(cur, dur);
      }
    };
    syncTvLyrics();
    requestAnimationFrame(syncTvLyrics);
    setTimeout(syncTvLyrics, 50);
    setTimeout(syncTvLyrics, 150);
    const isTvPlaying = !!(state.isPlaying && el.nativeAudio && !el.nativeAudio.paused);
    updatePlayPauseButton(isTvPlaying, state.isBuffering);
    setPlayPauseState(isTvPlaying, false);
    updateTvkOutput();
    if (tvkOutputInterval) clearInterval(tvkOutputInterval);
    tvkOutputInterval = setInterval(updateTvkOutput, 8000);
  }

  function closeTvKaraoke() {
    if (!state.isTvKaraokeOpen || !el.tvKaraoke) return;
    state.isTvKaraokeOpen = false;
    if (tvIdleTimer) clearTimeout(tvIdleTimer);
    if (tvkOutputInterval) {
      clearInterval(tvkOutputInterval);
      tvkOutputInterval = null;
    }
    const tvkPanel = document.getElementById('tvk-panel');
    if (tvkPanel) {
      tvkPanel.classList.remove('open');
      const btnSettings = document.getElementById('btn-tvk-settings');
      if (btnSettings) btnSettings.classList.remove('open');
    }
    el.tvKaraoke.classList.remove('tv-idle');
    el.tvKaraoke.classList.add('hidden');
    syncTvkAmbientPlayback();

    const targetParent = (lyricsContainerParent && lyricsContainerParent.isConnected)
      ? lyricsContainerParent
      : (document.querySelector('.lyrics-section') || (el.rightPanel && el.rightPanel.querySelector('.lyrics-section')));
    if (targetParent && el.lyricsContainer) {
      if (lyricsContainerSibling && lyricsContainerSibling.parentNode === targetParent) {
        targetParent.insertBefore(el.lyricsContainer, lyricsContainerSibling);
      } else {
        targetParent.appendChild(el.lyricsContainer);
      }
    }
    if (el.lyricsContainer) {
      el.lyricsContainer.style.paddingTop = '';
      el.lyricsContainer.style.paddingBottom = '';
      el.lyricsContainer.scrollTop = 0;
    }

    stopLyricsScroll();
    renderLyricsView();
    const syncSidebarLyrics = () => {
      updateLyricsPadding();
      state.forceSnapLyrics = true;
      state.forceLyricsScroll = true;
      state.lastActiveLyricIdx = -1;
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
    };
    syncSidebarLyrics();
    requestAnimationFrame(syncSidebarLyrics);
    setTimeout(syncSidebarLyrics, 50);
    setTimeout(syncSidebarLyrics, 150);
    setTimeout(syncSidebarLyrics, 300);
  }

  window.openTvKaraoke = openTvKaraoke;
  window.closeTvKaraoke = closeTvKaraoke;

  if (el.btnTvKaraoke) {
    el.btnTvKaraoke.addEventListener('click', openTvKaraoke);
  }
  if (el.tvKaraokeClose) {
    el.tvKaraokeClose.addEventListener('click', closeTvKaraoke);
  }
  if (el.tvKaraoke) {
    el.tvKaraoke.addEventListener('mousemove', resetTvIdleTimer);
  }

  const btnTvkPrev = document.getElementById('btn-tvk-prev');
  const btnTvkPlay = document.getElementById('btn-tvk-play');
  const btnTvkNext = document.getElementById('btn-tvk-next');
  if (btnTvkPrev) btnTvkPrev.addEventListener('click', () => playPrev());
  if (btnTvkNext) btnTvkNext.addEventListener('click', () => playNext());
  if (btnTvkPlay) btnTvkPlay.addEventListener('click', () => togglePlayPause());
  if (el.btnTvkFav) el.btnTvkFav.addEventListener('click', () => {
    if (state.currentTrack) toggleFavoriteTrack(state.currentTrack);
  });

  const TVK_DEFAULTS = {
    font: 'inherit',
    align: 'center',
    size: 100,
    weight: 700,
    gap: 16,
    anim: 'slide',
    speed: 900
  };

  /** @type {Record<string, string>} */
  const TVK_FONTS = {
    'default': 'inherit',
    'inherit': 'inherit',
    'sf': SF_FONT_STACK,
    'SF Pro': SF_FONT_STACK,
    [SF_FONT_STACK]: SF_FONT_STACK,
    'serif': "Georgia, 'Times New Roman', serif",
    "Georgia, 'Times New Roman', serif": "Georgia, 'Times New Roman', serif",
    'rounded': "ui-rounded, 'Nunito', system-ui, sans-serif",
    "ui-rounded, 'Nunito', system-ui, sans-serif": "ui-rounded, 'Nunito', system-ui, sans-serif",
    'mono': "ui-monospace, 'JetBrains Mono', monospace",
    "ui-monospace, 'JetBrains Mono', monospace": "ui-monospace, 'JetBrains Mono', monospace",
    'condensed': "'Arial Narrow', 'Roboto Condensed', sans-serif",
    "'Arial Narrow', 'Roboto Condensed', sans-serif": "'Arial Narrow', 'Roboto Condensed', sans-serif"
  };

  function getTvk() {
    try {
      const raw = localStorage.getItem('uriel_tvk');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          font: parsed.font || TVK_DEFAULTS.font,
          align: ['left', 'center', 'right'].includes(parsed.align) ? parsed.align : TVK_DEFAULTS.align,
          size: Number(parsed.size) || TVK_DEFAULTS.size,
          weight: Number(parsed.weight) || TVK_DEFAULTS.weight,
          gap: (parsed.gap !== undefined && !isNaN(Number(parsed.gap))) ? Number(parsed.gap) : TVK_DEFAULTS.gap,
          anim: parsed.anim || TVK_DEFAULTS.anim,
          speed: Number(parsed.speed) || TVK_DEFAULTS.speed
        };
      }
    } catch (_) {}
    return { ...TVK_DEFAULTS };
  }

  function saveTvk(/** @type {Record<string, unknown>} */ settings) {
    try {
      localStorage.setItem('uriel_tvk', JSON.stringify(settings));
    } catch (_) {}
  }

  function updateTvkVisualizerSetting(/** @type {boolean | string} */ enabled) {
    const on = enabled !== false && enabled !== 'false';
    localStorage.setItem('uriel_tvk_visualizer', on ? 'true' : 'false');
    const tv = document.getElementById('tv-karaoke');
    if (tv) {
      tv.classList.toggle('no-tvk-visualizer', !on);
    }
    const btnTvkVis = document.getElementById('btn-tvk-visualizer');
    if (btnTvkVis) btnTvkVis.classList.toggle('active', on);
    const btnTvkVisSetting = document.getElementById('btn-tvk-visualizer-setting');
    if (btnTvkVisSetting) btnTvkVisSetting.classList.toggle('active', on);
    if (on && state.isPlaying) {
      if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(true);
      startVisualizers();
    }
  }

  function updateTvkVisualizerLyricsSetting(/** @type {boolean | string} */ enabled) {
    const on = enabled === true || enabled === 'true';
    localStorage.setItem('uriel_tvk_visualizer_lyrics', on ? 'true' : 'false');
    const tv = document.getElementById('tv-karaoke');
    if (tv) {
      tv.classList.toggle('tvk-show-lyrics-visualizer', on);
    }
    const btnTvkVisLyrics = document.getElementById('btn-tvk-visualizer-lyrics');
    if (btnTvkVisLyrics) btnTvkVisLyrics.classList.toggle('active', on);
    const btnTvkVisLyricsSetting = document.getElementById('btn-tvk-visualizer-lyrics-setting');
    if (btnTvkVisLyricsSetting) btnTvkVisLyricsSetting.classList.toggle('active', on);
    if (on && state.isPlaying) {
      if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(true);
      startVisualizers();
    }
  }

  function updateTvkVisualizerOpacity(/** @type {string | number} */ opacityVal) {
    let val = parseInt(String(opacityVal), 10);
    if (isNaN(val)) val = 85;
    val = Math.max(10, Math.min(100, val));
    localStorage.setItem('uriel_tvk_visualizer_opacity', val.toString());

    const norm = (val / 100).toFixed(2);
    const tv = document.getElementById('tv-karaoke');
    if (tv) {
      tv.style.setProperty('--tvk-vis-opacity', norm);
    }

    const sliderPanel = /** @type {HTMLInputElement} */ (document.getElementById('tvk-vis-opacity'));
    if (sliderPanel && parseInt(sliderPanel.value, 10) !== val) sliderPanel.value = String(val);
    const valPanel = document.getElementById('val-tvk-vis-opacity');
    if (valPanel) valPanel.textContent = `${val}%`;

    const sliderSetting = /** @type {HTMLInputElement} */ (document.getElementById('slider-tvk-vis-opacity-setting'));
    if (sliderSetting && parseInt(sliderSetting.value, 10) !== val) sliderSetting.value = String(val);
    const valSetting = document.getElementById('val-tvk-vis-opacity-setting');
    if (valSetting) valSetting.textContent = `${val}%`;
  }

  function applyTvk() {
    const tv = document.getElementById('tv-karaoke');
    if (!tv) return;
    const s = getTvk();
    const font = TVK_FONTS[s.font] || s.font || 'inherit';
    if (s.font === 'sf' || font.includes('SF Pro')) {
      ensureSfFontLoaded();
    }
    const align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'center';
    const scale = (Number(s.size) || 100) / 100;
    const weight = Number(s.weight) || 700;
    const gap = (s.gap !== undefined && !isNaN(Number(s.gap))) ? Number(s.gap) : 16;
    const speed = Number(s.speed) || 900;
    const anim = ['smooth', 'slide', 'fade', 'pop', 'none'].includes(s.anim) ? s.anim : 'slide';

    tv.style.setProperty('--tvk-font', font);
    tv.style.setProperty('--tvk-scale', String(scale));
    tv.style.setProperty('--tvk-weight', String(weight));
    tv.style.setProperty('--tvk-gap', `${gap}px`);
    tv.style.setProperty('--tvk-speed', `${speed}ms`);
    tv.setAttribute('data-tvk-anim', anim);
    tv.setAttribute('data-tvk-align', align);

    const tvkVisOn = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
    tv.classList.toggle('no-tvk-visualizer', !tvkVisOn);
    const tvkVisLyricsOn = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
    tv.classList.toggle('tvk-show-lyrics-visualizer', tvkVisLyricsOn);
    const visOpacity = parseInt(localStorage.getItem('uriel_tvk_visualizer_opacity') || '85', 10);
    tv.style.setProperty('--tvk-vis-opacity', (Math.max(10, Math.min(100, visOpacity)) / 100).toFixed(2));
  }

  function syncTvkUI() {
    const s = getTvk();
    const selFont = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-font'));
    const sliderSize = /** @type {HTMLInputElement} */ (document.getElementById('tvk-size'));
    const sliderWeight = /** @type {HTMLInputElement} */ (document.getElementById('tvk-weight'));
    const sliderGap = /** @type {HTMLInputElement} */ (document.getElementById('tvk-gap'));
    const selAnim = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-anim'));
    const sliderSpeed = /** @type {HTMLInputElement} */ (document.getElementById('tvk-speed'));

    const valSize = document.getElementById('val-tvk-size');
    const valWeight = document.getElementById('val-tvk-weight');
    const valGap = document.getElementById('val-tvk-gap');
    const valSpeed = document.getElementById('val-tvk-speed');

    const fontVal = TVK_FONTS[s.font] || s.font;
    if (selFont) {
      selFont.value = fontVal;
      if (!selFont.value) selFont.value = s.font;
    }
    const fontLabel = document.getElementById('tvk-font-label');
    const fontMenu = document.getElementById('tvk-font-menu');
    if (fontMenu) {
      const options = /** @type {NodeListOf<HTMLElement>} */ (fontMenu.querySelectorAll('.m3-dropdown-option'));
      let matched = false;
      options.forEach((opt) => {
        const isMatch = opt.dataset.value === s.font || opt.dataset.value === fontVal;
        opt.classList.toggle('selected', isMatch);
        if (isMatch) {
          if (fontLabel) fontLabel.textContent = opt.textContent;
          matched = true;
        }
      });
      if (!matched && fontLabel) fontLabel.textContent = 'Default';
    }

    const alignGroup = document.getElementById('tvk-align-group');
    if (alignGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (alignGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.align);
      });
    }

    const animGroup = document.getElementById('tvk-anim-group');
    if (animGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (animGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.anim);
      });
    }
    if (selAnim) selAnim.value = s.anim;

    if (sliderSize) sliderSize.value = String(s.size);
    if (sliderWeight) sliderWeight.value = String(s.weight);
    if (sliderGap) sliderGap.value = String(s.gap);
    if (sliderSpeed) sliderSpeed.value = String(s.speed);

    if (valSize) valSize.textContent = `${s.size}%`;
    if (valWeight) valWeight.textContent = `${s.weight}`;
    if (valGap) valGap.textContent = `${s.gap}px`;
    if (valSpeed) valSpeed.textContent = `${s.speed}ms`;

    const tvkVisOn = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
    const btnTvkVis = document.getElementById('btn-tvk-visualizer');
    if (btnTvkVis) btnTvkVis.classList.toggle('active', tvkVisOn);
    const btnTvkVisSetting = document.getElementById('btn-tvk-visualizer-setting');
    if (btnTvkVisSetting) btnTvkVisSetting.classList.toggle('active', tvkVisOn);

    const tvkVisLyricsOn = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
    const btnTvkVisLyrics = document.getElementById('btn-tvk-visualizer-lyrics');
    if (btnTvkVisLyrics) btnTvkVisLyrics.classList.toggle('active', tvkVisLyricsOn);
    const btnTvkVisLyricsSetting = document.getElementById('btn-tvk-visualizer-lyrics-setting');
    if (btnTvkVisLyricsSetting) btnTvkVisLyricsSetting.classList.toggle('active', tvkVisLyricsOn);

    const visOpacity = parseInt(localStorage.getItem('uriel_tvk_visualizer_opacity') || '85', 10);
    const sliderTvkVisOpacity = /** @type {HTMLInputElement} */ (document.getElementById('tvk-vis-opacity'));
    if (sliderTvkVisOpacity) sliderTvkVisOpacity.value = String(visOpacity);
    const valTvkVisOpacity = document.getElementById('val-tvk-vis-opacity');
    if (valTvkVisOpacity) valTvkVisOpacity.textContent = `${visOpacity}%`;

    const sliderTvkVisOpacitySetting = /** @type {HTMLInputElement} */ (document.getElementById('slider-tvk-vis-opacity-setting'));
    if (sliderTvkVisOpacitySetting) sliderTvkVisOpacitySetting.value = String(visOpacity);
    const valTvkVisOpacitySetting = document.getElementById('val-tvk-vis-opacity-setting');
    if (valTvkVisOpacitySetting) valTvkVisOpacitySetting.textContent = `${visOpacity}%`;
  }

  function initTvk() {
    applyTvk();
    syncTvkUI();

    const btnSettings = document.getElementById('btn-tvk-settings');
    const panel = document.getElementById('tvk-panel');
    const btnReset = document.getElementById('btn-tvk-reset');

    const selFont = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-font'));
    const fontDropdown = document.getElementById('tvk-font-dropdown');
    const fontTrigger = document.getElementById('tvk-font-trigger');
    const fontMenu = document.getElementById('tvk-font-menu');

    const alignGroup = document.getElementById('tvk-align-group');
    const animGroup = document.getElementById('tvk-anim-group');

    const sliderSize = /** @type {HTMLInputElement} */ (document.getElementById('tvk-size'));
    const sliderWeight = /** @type {HTMLInputElement} */ (document.getElementById('tvk-weight'));
    const sliderGap = /** @type {HTMLInputElement} */ (document.getElementById('tvk-gap'));
    const selAnim = /** @type {HTMLSelectElement} */ (document.getElementById('tvk-anim'));
    const sliderSpeed = /** @type {HTMLInputElement} */ (document.getElementById('tvk-speed'));

    const valSize = document.getElementById('val-tvk-size');
    const valWeight = document.getElementById('val-tvk-weight');
    const valGap = document.getElementById('val-tvk-gap');
    const valSpeed = document.getElementById('val-tvk-speed');

    if (btnSettings && panel) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        if (!isOpen) {
          panel.classList.add('open');
          btnSettings.classList.add('open');
          if (el.tvKaraoke) el.tvKaraoke.classList.remove('tv-idle');
          if (tvIdleTimer) clearTimeout(tvIdleTimer);
        } else {
          panel.classList.remove('open');
          btnSettings.classList.remove('open');
          if (fontDropdown) fontDropdown.classList.remove('open');
          resetTvIdleTimer();
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!panel || !panel.classList.contains('open')) return;
      if (!panel.contains(/** @type {Node} */ (e.target)) && (!btnSettings || !btnSettings.contains(/** @type {Node} */ (e.target)))) {
        panel.classList.remove('open');
        if (btnSettings) btnSettings.classList.remove('open');
        if (fontDropdown) fontDropdown.classList.remove('open');
        resetTvIdleTimer();
      }
    });

    if (fontTrigger && fontDropdown) {
      fontTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        fontDropdown.classList.toggle('open');
      });
    }

    if (fontMenu) {
      /** @type {NodeListOf<HTMLElement>} */ (fontMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value || '';
          if (selFont) selFont.value = val;
          const current = getTvk();
          current.font = val;
          saveTvk(current);
          applyTvk();
          syncTvkUI();
          if (fontDropdown) fontDropdown.classList.remove('open');
        });
      });
    }

    if (alignGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (alignGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = btn.dataset.value || '';
          const current = getTvk();
          current.align = val;
          saveTvk(current);
          applyTvk();
          syncTvkUI();
        });
      });
    }

    if (animGroup) {
      /** @type {NodeListOf<HTMLElement>} */ (animGroup.querySelectorAll('.tvk-pill-btn')).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = btn.dataset.value || '';
          if (selAnim) selAnim.value = val;
          const current = getTvk();
          current.anim = val;
          saveTvk(current);
          applyTvk();
          syncTvkUI();
        });
      });
    }

    const onTvkInput = () => {
      const current = getTvk();
      const tvk = {
        font: (selFont && selFont.value) || current.font || 'inherit',
        align: current.align || 'center',
        size: Number(sliderSize && sliderSize.value) || 100,
        weight: Number(sliderWeight && sliderWeight.value) || 700,
        gap: (sliderGap && sliderGap.value !== undefined) ? Number(sliderGap.value) : 16,
        anim: (selAnim && selAnim.value) || current.anim || 'smooth',
        speed: Number(sliderSpeed && sliderSpeed.value) || 350
      };
      saveTvk(tvk);
      applyTvk();
      if (valSize) valSize.textContent = `${tvk.size}%`;
      if (valWeight) valWeight.textContent = `${tvk.weight}`;
      if (valGap) valGap.textContent = `${tvk.gap}px`;
      if (valSpeed) valSpeed.textContent = `${tvk.speed}ms`;
    };

    [selFont, sliderSize, sliderWeight, sliderGap, selAnim, sliderSpeed].forEach(input => {
      if (!input) return;
      input.addEventListener('input', onTvkInput);
      input.addEventListener('change', onTvkInput);
    });

    const btnTvkVis = document.getElementById('btn-tvk-visualizer');
    if (btnTvkVis) {
      btnTvkVis.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
        updateTvkVisualizerSetting(!cur);
      });
    }
    const btnTvkVisSetting = document.getElementById('btn-tvk-visualizer-setting');
    if (btnTvkVisSetting) {
      btnTvkVisSetting.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer') !== 'false';
        updateTvkVisualizerSetting(!cur);
      });
    }

    const btnTvkVisLyrics = document.getElementById('btn-tvk-visualizer-lyrics');
    if (btnTvkVisLyrics) {
      btnTvkVisLyrics.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
        updateTvkVisualizerLyricsSetting(!cur);
      });
    }
    const btnTvkVisLyricsSetting = document.getElementById('btn-tvk-visualizer-lyrics-setting');
    if (btnTvkVisLyricsSetting) {
      btnTvkVisLyricsSetting.addEventListener('click', () => {
        const cur = localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true';
        updateTvkVisualizerLyricsSetting(!cur);
      });
    }

    const sliderTvkVisOpacity = document.getElementById('tvk-vis-opacity');
    if (sliderTvkVisOpacity) {
      const onOpInput = (/** @type {Event} */ e) => {
        updateTvkVisualizerOpacity(/** @type {HTMLInputElement} */ (e.target).value);
      };
      sliderTvkVisOpacity.addEventListener('input', onOpInput);
      sliderTvkVisOpacity.addEventListener('change', onOpInput);
    }
    const sliderTvkVisOpacitySetting = document.getElementById('slider-tvk-vis-opacity-setting');
    if (sliderTvkVisOpacitySetting) {
      const onOpInput = (/** @type {Event} */ e) => {
        updateTvkVisualizerOpacity(/** @type {HTMLInputElement} */ (e.target).value);
      };
      sliderTvkVisOpacitySetting.addEventListener('input', onOpInput);
      sliderTvkVisOpacitySetting.addEventListener('change', onOpInput);
    }

    const sliderVizSmooth = /** @type {HTMLInputElement} */ (document.getElementById('slider-viz-smooth'));
    const valVizSmooth = document.getElementById('val-viz-smooth');
    if (sliderVizSmooth) {
      const saved = localStorage.getItem('uriel_viz_smooth');
      if (saved !== null) sliderVizSmooth.value = saved;
      if (valVizSmooth) valVizSmooth.textContent = `${sliderVizSmooth.value}%`;
      const onSmoothInput = (/** @type {Event} */ e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value;
        if (valVizSmooth) valVizSmooth.textContent = `${v}%`;
        localStorage.setItem('uriel_viz_smooth', v);
      };
      sliderVizSmooth.addEventListener('input', onSmoothInput);
      sliderVizSmooth.addEventListener('change', onSmoothInput);
    }

    const sliderVizSens = /** @type {HTMLInputElement} */ (document.getElementById('slider-viz-sens'));
    const valVizSens = document.getElementById('val-viz-sens');
    if (sliderVizSens) {
      const saved = localStorage.getItem('uriel_viz_sens');
      if (saved !== null) sliderVizSens.value = saved;
      if (valVizSens) valVizSens.textContent = `${sliderVizSens.value}%`;
      const onSensInput = (/** @type {Event} */ e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value;
        if (valVizSens) valVizSens.textContent = `${v}%`;
        localStorage.setItem('uriel_viz_sens', v);
      };
      sliderVizSens.addEventListener('input', onSensInput);
      sliderVizSens.addEventListener('change', onSensInput);
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        saveTvk(TVK_DEFAULTS);
        updateTvkVisualizerSetting(true);
        updateTvkVisualizerLyricsSetting(false);
        updateTvkVisualizerOpacity(85);
        applyTvk();
        syncTvkUI();
      });
    }
  }

  /** @type {UrielTvKaraokePart} */
  const api = { openTvKaraoke, closeTvKaraoke, initTvk, resetTvIdleTimer, getTvIdleTimer, syncTvBanner, syncTvLayout, updateTvKaraokeMeta, updateTvkOutput, updateTvkVisualizerSetting, updateTvkVisualizerLyricsSetting, updateTvkVisualizerOpacity };
  Object.assign(out, api);
};
