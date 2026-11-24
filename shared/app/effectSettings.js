// @ts-check
// Settings switches for effects and tracks: blur and glass, the frame-rate cap, hardware acceleration, the
// effect switches (cover background, motion, clip effects...), what songs show, the cursor, the slider
// ticks and colours, and Show on Discord. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.effectSettings = function ({ addsElements, applyFxClip, applyReducedMotionSetting, applyShowAlbums, applyUiOpacity, DEFAULT_UI_ALPHA, discordPresenceOn, el, getAdv, getTrackThumbUrl, initHomeHero, listThumb, loadHomePage, onBackgroundChanged, redrawMesh, refreshMeshCover, refreshStacks, renderLyricsView, setAdv, setCoverBg, showToast, sidebarEl, state, switchView, syncTvBanner, systemPrefersReducedMotion, Tm, updateAlbumsCount, updateCustomBg, updateDiscordPresence, updateMeshGradient, updateNavIndicator, updateRightPanelBanner, updateThemeFromState, viz }) {
  document.body.classList.toggle('no-blur', !getAdv('blur_fx', true));

  const sliderGlassBlur = /** @type {HTMLInputElement} */ (document.getElementById('slider-glass-blur'));
  const valGlassBlur = document.getElementById('val-glass-blur');
  function applyGlass() {
    const on = getAdv('glass_blur', false);
    const px = Math.max(4, Math.min(40, parseInt(localStorage.getItem('uriel_glass_blur') || '16', 10) || 16));
    document.body.classList.toggle('glass', on);
    document.documentElement.style.setProperty('--glass-blur', `${px}px`);
    if (sliderGlassBlur) sliderGlassBlur.value = String(px);
    if (valGlassBlur) valGlassBlur.textContent = `${px}px`;
    const strengthRow = document.getElementById('setting-glass-strength');
    if (strengthRow) strengthRow.classList.toggle('is-disabled', !on);
    updateCustomBg();
  }
  if (sliderGlassBlur) sliderGlassBlur.addEventListener('input', () => {
    localStorage.setItem('uriel_glass_blur', sliderGlassBlur.value);
    applyGlass();
  });
  applyGlass();

  const fpsBtns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-fps-cap]'));
  const syncFpsBtns = () => {
    const cur = localStorage.getItem('uriel_fps_cap') || '60';
    fpsBtns.forEach((/** @type {HTMLElement} */ b) => b.classList.toggle('active', b.dataset.fpsCap === cur));
  };
  fpsBtns.forEach((b) => b.addEventListener('click', () => { localStorage.setItem('uriel_fps_cap', String(b.dataset.fpsCap)); viz.userFpsCap = parseInt(String(b.dataset.fpsCap), 10) || 0; syncFpsBtns(); }));
  syncFpsBtns();

  const btnHwAccel = document.getElementById('btn-hw-accel');
  if (btnHwAccel && window.electronAPI && window.electronAPI.getHwAccel) {
    window.electronAPI.getHwAccel().then((/** @type {boolean} */ on) => btnHwAccel.classList.toggle('active', on !== false));
    btnHwAccel.addEventListener('click', () => {
      const next = !btnHwAccel.classList.contains('active');
      btnHwAccel.classList.toggle('active', next);
      window.electronAPI.setHwAccel(next);
      showToast(Tm('Restart Uriel to apply'), 'info');
    });
  }

  const advButtons = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.effect-switch-btn[data-adv]'));
  advButtons.forEach((btn) => {
    const key = btn.dataset.adv || '';
    const defaultVal = key === 'reduce_motion' ? systemPrefersReducedMotion() : (key === 'mesh_gradient' || key === 'glass_blur' || key === 'mesh_cover_color' || key === 'clip_fx') ? false : true;
    const currentVal = getAdv(key, defaultVal);
    btn.classList.toggle('active', currentVal);

    btn.addEventListener('click', () => {
      const newVal = !btn.classList.contains('active');
      document.querySelectorAll(`.effect-switch-btn[data-adv="${key}"]`).forEach(b => b.classList.toggle('active', newVal));
      setAdv(key, newVal);

      if (key === 'reduce_motion') {
        applyReducedMotionSetting();
      } else if (key === 'glass_blur') {
        applyGlass();
        // glass over a fully opaque UI does nothing, so make it see-through the first time
        if (newVal && parseInt(localStorage.getItem('uriel_ui_alpha') || DEFAULT_UI_ALPHA, 10) >= 100) {
          localStorage.setItem('uriel_ui_alpha', '60');
          applyUiOpacity();
          showToast(Tm('Interface opacity set to 60% so the glass shows'), 'info');
        }
      } else if (key === 'blur_fx') {
        document.body.classList.toggle('no-blur', !newVal);
      } else if (key === 'light_thumbs') {
        /** @type {NodeListOf<HTMLImageElement>} */ (document.querySelectorAll('.track-row-thumb[data-full], .quick-play-pill-img[data-full]')).forEach((img) => { img.src = listThumb(img.dataset.full || '') || img.dataset.full || ''; });
      } else if (key === 'mesh_gradient') {
        updateThemeFromState();
      } else if (key === 'mesh_follow_intensity') {
        redrawMesh();
      } else if (key === 'mesh_cover_color') {
        refreshMeshCover();
        redrawMesh();
      } else if (key === 'cover_bg') {
        const thumb = state.currentTrack ? getTrackThumbUrl(state.currentTrack) : '';
        setCoverBg(thumb);
        if (typeof onBackgroundChanged === 'function') onBackgroundChanged('cover', newVal);
      } else if (key === 'clip_fx') {
        document.body.classList.toggle('no-clip-fx', !newVal);
        applyFxClip();
      } else if (key === 'albums') {
        if (!newVal && state.currentView === 'album') {
          const target = (state.previousView && state.previousView !== 'album') ? state.previousView : 'discover';
          switchView(target);
        }
      } else if (key === 'my_wave' || key === 'jump_back') {
        initHomeHero();
        if (newVal) loadHomePage();
      } else if (key === 'my_wave_ambient') {
        const homeAmb = document.getElementById('home-ambient');
        if (homeAmb) homeAmb.style.display = newVal ? '' : 'none';
        const ambientEl = document.getElementById('my-wave-ambient-light');
        if (ambientEl) ambientEl.style.display = newVal ? '' : 'none';
        const jumpAmbient = document.getElementById('jump-ambient-light');
        if (jumpAmbient) jumpAmbient.style.display = newVal ? '' : 'none';
      } else if (key === 'banners' || key === 'track_banners') {
        const bannerR = document.getElementById('right-panel-banner');
        const bannerP = document.getElementById('playlist-header-banner');
        const showR = getAdv('banners', true) && getAdv('track_banners', true);
        const showP = getAdv('banners', true);
        if (bannerR) {
          bannerR.style.display = showR ? '' : 'none';
          if (!showR) {
            bannerR.style.opacity = '0';
            const vid = bannerR.querySelector('video.banner-video');
            if (vid) vid.remove();
          }
        }
        if (bannerP) {
          bannerP.style.display = showP ? '' : 'none';
          if (!showP) {
            bannerP.style.opacity = '0';
          }
        }
        if (showR && state.currentTrack) {
          updateRightPanelBanner(getTrackThumbUrl(state.currentTrack));
        }
        if (state.isTvKaraokeOpen) syncTvBanner();
      } else if (key === 'karaoke_words') {
        renderLyricsView();
      }
    });
  });

  const btnSearchArtists = document.getElementById('btn-search-artists');
  if (btnSearchArtists) {
    btnSearchArtists.classList.toggle('active', localStorage.getItem('uriel_search_artists') !== '0');
    btnSearchArtists.addEventListener('click', () => {
      const v = !btnSearchArtists.classList.contains('active');
      btnSearchArtists.classList.toggle('active', v);
      localStorage.setItem('uriel_search_artists', v ? '1' : '0');
    });
  }

  const btnSmooth = document.getElementById('btn-smooth-presets');
  if (btnSmooth) {
    btnSmooth.classList.toggle('active', localStorage.getItem('uriel_smooth_presets') !== 'false');
    btnSmooth.addEventListener('click', () => {
      const v = !btnSmooth.classList.contains('active');
      btnSmooth.classList.toggle('active', v);
      localStorage.setItem('uriel_smooth_presets', String(v));
    });
  }
  if (sidebarEl) {
    sidebarEl.classList.add('no-nav-anim');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebarEl.classList.remove('no-nav-anim');
      });
    });
  }

  const btnShowLocal = document.getElementById('btn-show-local');
  function updateShowLocalUI(animate = false) {
    const show = localStorage.getItem('uriel_show_local') !== 'false';
    if (el.navLocal) el.navLocal.classList.toggle('nav-collapsed', !show);
    if (btnShowLocal) btnShowLocal.classList.toggle('active', show);
    if (!show && state.currentView === 'local') {
      switchView('discover');
    }
    if (animate) {
      const t0 = performance.now();
      (function f() {
        refreshStacks();
        updateNavIndicator(false);
        if (performance.now() - t0 < 350) requestAnimationFrame(f);
      })();
    } else {
      refreshStacks();
      updateNavIndicator(false);
    }
  }
  if (btnShowLocal) {
    btnShowLocal.addEventListener('click', () => {
      const show = localStorage.getItem('uriel_show_local') !== 'false';
      localStorage.setItem('uriel_show_local', (!show) ? 'true' : 'false');
      updateShowLocalUI(true);
      refreshStacks();
    });
  }
  updateShowLocalUI(false);
  applyShowAlbums();
  updateAlbumsCount();

  // Settings > Tracks > Show explicit tag [E] on songs (on unless turned off)
  const toggleExplicitTag = document.getElementById('toggle-explicit-tag');
  function applyExplicitTag() {
    const on = localStorage.getItem('uriel_show_explicit') !== '0';
    document.body.classList.toggle('hide-explicit-badges', !on);
    if (toggleExplicitTag) toggleExplicitTag.classList.toggle('active', on);
  }
  if (toggleExplicitTag) {
    toggleExplicitTag.addEventListener('click', () => {
      localStorage.setItem('uriel_show_explicit', localStorage.getItem('uriel_show_explicit') === '0' ? '1' : '0');
      applyExplicitTag();
    });
  }
  applyExplicitTag();

  function applyNoHandCursor(/** @type {boolean} */ on) {
    document.body.classList.toggle('no-hand-cursor', !!on);
  }
  const btnNoHandCursor = document.getElementById('btn-no-hand-cursor');
  const noHand = localStorage.getItem('uriel_no_hand_cursor') !== '0';
  applyNoHandCursor(noHand);
  if (btnNoHandCursor) {
    btnNoHandCursor.classList.toggle('active', noHand);
    btnNoHandCursor.addEventListener('click', () => {
      const next = !btnNoHandCursor.classList.contains('active');
      btnNoHandCursor.classList.toggle('active', next);
      localStorage.setItem('uriel_no_hand_cursor', next ? '1' : '0');
      applyNoHandCursor(next);
    });
  }

  function applyHighlightButtons(/** @type {boolean} */ on) {
    document.body.classList.toggle('highlight-buttons', !!on);
  }
  const btnHighlightButtons = document.getElementById('btn-highlight-buttons');
  const initialHighlightButtons = localStorage.getItem('uriel_highlight_buttons') !== '0';
  applyHighlightButtons(initialHighlightButtons);
  if (btnHighlightButtons) {
    btnHighlightButtons.classList.toggle('active', initialHighlightButtons);
    btnHighlightButtons.addEventListener('click', () => {
      const next = !btnHighlightButtons.classList.contains('active');
      btnHighlightButtons.classList.toggle('active', next);
      localStorage.setItem('uriel_highlight_buttons', next ? '1' : '0');
      applyHighlightButtons(next);
    });
  }

  function watchSliderValue(/** @type {HTMLInputElement} */ input, /** @type {() => void} */ onChange) {
    const desc = /** @type {{ get: () => string, set: (v: string) => void }} */ (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'));
    Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); onChange(); } });
    input.addEventListener('input', onChange);
  }
  /** @param {ParentNode} [root] */
  function enhanceSliders(root) {
    /** @type {NodeListOf<HTMLInputElement>} */ ((root || document).querySelectorAll('input[type="range"]:not(.sl-done):not(#slider-theme-hue)')).forEach((/** @type {HTMLInputElement} */ input) => {
      if (input.closest('.eq-slider-box') || input.closest('.eq-slider-wrap') || input.closest('.hue-seg') || input.classList.contains('eq-band-range')) return;
      input.classList.add('sl-done');
      const wrap = document.createElement('div');
      wrap.className = 'sl';
      wrap.innerHTML = '<div class="sl-active"></div><div class="sl-inactive"></div>';
      input.before(wrap);
      wrap.appendChild(input);
      const sync = () => {
        const min = input.min === '' ? 0 : parseFloat(input.min);
        const max = input.max === '' ? 100 : parseFloat(input.max);
        wrap.style.setProperty('--v', String(max > min ? (parseFloat(input.value) - min) / (max - min) : 0));
      };
      watchSliderValue(input, sync);
      sync();
    });
  }
  enhanceSliders();
  let sliderRaf = 0;
  new MutationObserver((muts) => { if (sliderRaf || !addsElements(muts)) return; sliderRaf = requestAnimationFrame(() => { sliderRaf = 0; enhanceSliders(); }); }).observe(document.body, { childList: true, subtree: true });

  (function initHueSegments() {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-hue'));
    const track = document.querySelector('.hue-seg-track');
    const host = document.getElementById('hue-seg');
    if (!input || !track || !host) return;
    for (let i = 0; i < 12; i++) {
      const seg = document.createElement('i');
      seg.style.background = `linear-gradient(90deg, hsl(${i * 30} 75% 55%), hsl(${(i + 1) * 30} 75% 55%))`;
      track.appendChild(seg);
    }
    const sync = () => {
      const min = input.min === '' ? 0 : parseFloat(input.min);
      const max = input.max === '' ? 360 : parseFloat(input.max);
      host.style.setProperty('--v', String(max > min ? (parseFloat(input.value) - min) / (max - min) : 0));
    };
    watchSliderValue(input, sync);
    sync();
  })();

  // Settings: Show on Discord (desktop only, where the presence bridge exists)
  const btnDiscordPresence = document.getElementById('btn-discord-presence');
  if (btnDiscordPresence && window.electronAPI && typeof window.electronAPI.discordPresenceUpdate === 'function') {
    /** @type {HTMLElement} */ (document.getElementById('setting-discord-row')).style.display = '';
    btnDiscordPresence.classList.toggle('active', discordPresenceOn());
    btnDiscordPresence.addEventListener('click', () => {
      const on = !discordPresenceOn();
      localStorage.setItem('uriel_discord_presence', on ? 'true' : 'false');
      btnDiscordPresence.classList.toggle('active', on);
      if (on) updateDiscordPresence();
      else if (window.electronAPI.discordPresenceClear) window.electronAPI.discordPresenceClear();
    });
  }
};
