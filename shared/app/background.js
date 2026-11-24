// @ts-check
// Settings → Background: your own picture or video behind the app, the song's cover as the background, the
// mesh gradient and its customizer, and the palette style. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielBackgroundPart} out */
window.UrielApp.background = function ({ applyFxClip, closeModal, currentUiAlpha, getAdv, getTrackThumbUrl, LiquidMotion, meshLayer, PALETTE_STYLES, registerFx, setCoverBg, setUiAlphaViaSlider, showToast, state, syncBgVideoPlayback, Tm, updateThemeFromState }, out) {
  const btnChooseCustomBg = document.getElementById('btn-choose-custom-bg');
  const btnRemoveCustomBg = /** @type {HTMLButtonElement} */ (document.getElementById('btn-remove-custom-bg'));
  const sliderBgOpacity = /** @type {HTMLInputElement} */ (document.getElementById('slider-bg-opacity'));
  const valBgOpacity = document.getElementById('val-bg-opacity');
  const sliderBgBlur = /** @type {HTMLInputElement} */ (document.getElementById('slider-bg-blur'));
  const valBgBlur = document.getElementById('val-bg-blur');

  function updateCustomBg() {
    const bgUrl = localStorage.getItem('uriel_bg_url') || '';
    const opacityVal = parseInt(localStorage.getItem('uriel_bg_opacity') ?? '100', 10);
    let blurVal = parseInt(localStorage.getItem('uriel_bg_blur') ?? '0', 10);
    const isVideo = /\.(mp4|webm)($|\?)/i.test(bgUrl);
    document.body.classList.toggle('has-video-bg', isVideo && !!bgUrl);

    if (sliderBgOpacity) sliderBgOpacity.value = String(opacityVal);
    if (valBgOpacity) valBgOpacity.textContent = `${opacityVal}%`;
    if (sliderBgBlur) sliderBgBlur.value = String(blurVal);
    if (valBgBlur) valBgBlur.textContent = `${blurVal}px`;

    const customBg = document.getElementById('custom-bg');
    if (!customBg) return;

    if (!bgUrl) {
      document.body.classList.remove('glass-lite');
      customBg.innerHTML = '';
      customBg.style.display = 'none';
      if (btnRemoveCustomBg) btnRemoveCustomBg.disabled = true;
      syncBgVideoPlayback();
      return;
    }

    if (btnRemoveCustomBg) btnRemoveCustomBg.disabled = false;
    customBg.style.display = 'block';
    customBg.style.opacity = (opacityVal / 100).toString();
    customBg.style.filter = 'none';

    const currentMedia = /** @type {HTMLImageElement | HTMLVideoElement} */ (customBg.firstElementChild);
    const tag = isVideo ? 'VIDEO' : 'IMG';

    if (!currentMedia || currentMedia.tagName !== tag || currentMedia.src !== bgUrl) {
      customBg.innerHTML = '';
      if (isVideo) {
        const vid = document.createElement('video');
        vid.src = bgUrl;
        vid.preload = 'auto';
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.disablePictureInPicture = true;
        vid.setAttribute('disableRemotePlayback', '');
        vid.addEventListener('loadedmetadata', () => {
          if (vid.videoWidth * vid.videoHeight > 1920 * 1080 * 1.2) {
            showToast(Tm('This background video is larger than 1080p and may stutter. A 1080p file plays smoother.'), 'info');
          }
        }, { once: true });
        vid.play().catch(() => {});
        customBg.appendChild(vid);
      } else {
        const img = document.createElement('img');
        img.src = bgUrl;
        customBg.appendChild(img);
      }
    }

    // Glass over a moving background would re-blur every panel on every frame (~170 MB GPU).
    // "glass-lite" instead blurs the background once and leaves the panels plain see-through.
    const animatedBg = /\.(gif|mp4|webm)($|\?)/i.test(bgUrl);
    const glassLite = animatedBg && getAdv('glass_blur', false);
    document.body.classList.toggle('glass-lite', glassLite);
    if (glassLite) blurVal = Math.max(blurVal, parseInt(localStorage.getItem('uriel_glass_blur') || '16', 10) || 16);

    const media = /** @type {HTMLElement} */ (customBg.firstElementChild);
    if (media) {
      const q = blurVal > 0 ? 4 : 1;
      media.style.width = `${100 / q}%`;
      media.style.height = `${100 / q}%`;
      media.style.transformOrigin = '0 0';
      media.style.transform = q > 1 ? `scale(${q * 1.06}) translate(-3%, -3%)` : 'none';
      media.style.filter = blurVal > 0 ? `blur(${blurVal / q}px)` : 'none';
    }
    syncBgVideoPlayback();
  }

  function backgroundActive() { return !!localStorage.getItem('uriel_bg_url') || getAdv('cover_bg', true); }
  function onBackgroundChanged(/** @type {string} */ kind, /** @type {boolean} */ enabled) {
    if (!getAdv('ui_alpha_auto', true)) return;
    if (enabled) {
      const now = currentUiAlpha();
      if (now > 50) { localStorage.setItem('uriel_ui_alpha_prev', String(now)); setUiAlphaViaSlider(50); localStorage.setItem('uriel_ui_alpha_auto', '50'); localStorage.setItem('uriel_ui_alpha_auto_kind', kind); }
    } else {
      // undo when the background that dimmed the interface goes away. Checking "no background at all" never
      // passed with the cover background on (the default), so removing a custom one left the UI at 50%.
      const autoKind = localStorage.getItem('uriel_ui_alpha_auto_kind');
      if (autoKind ? autoKind !== kind : backgroundActive()) return;
      const auto = localStorage.getItem('uriel_ui_alpha_auto'), prev = localStorage.getItem('uriel_ui_alpha_prev');
      if (auto !== null && prev !== null && currentUiAlpha() === Number(auto)) setUiAlphaViaSlider(Number(prev));
      localStorage.removeItem('uriel_ui_alpha_auto'); localStorage.removeItem('uriel_ui_alpha_prev'); localStorage.removeItem('uriel_ui_alpha_auto_kind');
    }
  }

  if (btnChooseCustomBg) {
    btnChooseCustomBg.addEventListener('click', async () => {
      if (window.electronAPI && window.electronAPI.pickMedia) {
        const url = await window.electronAPI.pickMedia();
        if (url) {
          localStorage.setItem('uriel_bg_url', url);
          updateCustomBg();
          onBackgroundChanged('custom', true);
        }
      }
    });
  }

  if (btnRemoveCustomBg) {
    btnRemoveCustomBg.addEventListener('click', () => {
      localStorage.removeItem('uriel_bg_url');
      updateCustomBg();
      onBackgroundChanged('custom', false);
    });
  }

  if (sliderBgOpacity) {
    sliderBgOpacity.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (valBgOpacity) valBgOpacity.textContent = `${v}%`;
      localStorage.setItem('uriel_bg_opacity', String(v));
      const customBg = document.getElementById('custom-bg');
      if (customBg) customBg.style.opacity = (v / 100).toString();
    });
  }

  if (sliderBgBlur) {
    sliderBgBlur.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (valBgBlur) valBgBlur.textContent = `${v}px`;
      localStorage.setItem('uriel_bg_blur', String(v));
      const customBg = document.getElementById('custom-bg');
      if (customBg) {
        customBg.style.filter = 'none';
        const media = /** @type {HTMLElement} */ (customBg.firstElementChild);
        if (media) {
          const q = v > 0 ? 4 : 1;
          media.style.width = `${100 / q}%`;
          media.style.height = `${100 / q}%`;
          media.style.transformOrigin = '0 0';
          media.style.transform = q > 1 ? `scale(${q * 1.06}) translate(-3%, -3%)` : 'none';
          media.style.filter = v > 0 ? `blur(${v / q}px)` : 'none';
        }
      }
    });
  }

  updateCustomBg();

  const sliderCoverBgBrightness = /** @type {HTMLInputElement} */ (document.getElementById('slider-cover-bg-brightness'));
  const valCoverBgBrightness = document.getElementById('val-cover-bg-brightness');
  if (sliderCoverBgBrightness) {
    const savedBrightness = parseInt(localStorage.getItem('uriel_cover_bg_brightness') ?? '45', 10);
    sliderCoverBgBrightness.value = String(savedBrightness);
    if (valCoverBgBrightness) valCoverBgBrightness.textContent = `${savedBrightness}%`;
    document.documentElement.style.setProperty('--cover-bg-brightness', (savedBrightness / 100).toString());

    sliderCoverBgBrightness.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (valCoverBgBrightness) valCoverBgBrightness.textContent = `${v}%`;
      localStorage.setItem('uriel_cover_bg_brightness', String(v));
      document.documentElement.style.setProperty('--cover-bg-brightness', (v / 100).toString());
    });
  }

  setCoverBg(state.currentTrack ? getTrackThumbUrl(state.currentTrack) : '');

  registerFx(document.getElementById('home-ambient'), 'ambient', document.getElementById('view-discover'));
  registerFx(document.getElementById('playlist-hero-fx'), 'hero', document.getElementById('view-playlist-detail'));
  registerFx(document.getElementById('album-hero-fx'), 'hero', document.getElementById('view-album'));
  registerFx(document.getElementById('artist-hero-backdrop'), 'hero', document.getElementById('view-artist'));
  document.body.classList.toggle('no-clip-fx', !getAdv('clip_fx', false));
  applyFxClip();

  const sliderMeshBrightness = /** @type {HTMLInputElement} */ (document.getElementById('slider-mesh-brightness'));
  const valMeshBrightness = document.getElementById('val-mesh-brightness');
  if (sliderMeshBrightness) {
    sliderMeshBrightness.value = String(state.meshBrightness);
    if (valMeshBrightness) valMeshBrightness.textContent = `${state.meshBrightness}%`;
    sliderMeshBrightness.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (valMeshBrightness) valMeshBrightness.textContent = `${v}%`;
    });
    sliderMeshBrightness.addEventListener('change', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.meshBrightness = v;
      if (valMeshBrightness) valMeshBrightness.textContent = `${v}%`;
      localStorage.setItem('uriel_mesh_brightness', v.toString());
      updateThemeFromState();
    });
  }

  const DEFAULT_MESH_CFG = {
    p1: { x: 20, y: 0 },
    p2: { x: 85, y: 5 },
    speed: 0,
    blur: 0
  };

  /** @type {typeof DEFAULT_MESH_CFG} */
  let meshCfg = { ...DEFAULT_MESH_CFG };
  // 0–100, or the default when missing: Number(undefined) is NaN, which `?? default` never caught
  const meshCoord = (/** @type {unknown} */ v, /** @type {number} */ fallback) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : fallback);
  try {
    const raw = localStorage.getItem('uriel_mesh_cfg');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.p1 && parsed.p2) {
        meshCfg = {
          p1: { x: meshCoord(parsed.p1.x, 20), y: meshCoord(parsed.p1.y, 0) },
          p2: { x: meshCoord(parsed.p2.x, 85), y: meshCoord(parsed.p2.y, 5) },
          speed: Math.max(0, Math.min(100, Number(parsed.speed) || 0)),
          blur: Math.max(0, Math.min(60, Number(parsed.blur) || 0))
        };
      }
    }
  } catch (_) {}

  function applyMeshCfg(/** @type {typeof meshCfg} */ cfg, save = true) {
    meshCfg = cfg;
    const root = document.documentElement;
    root.style.setProperty('--mesh-p1x', `${cfg.p1.x}%`);
    root.style.setProperty('--mesh-p1y', `${cfg.p1.y}%`);
    root.style.setProperty('--mesh-p2x', `${cfg.p2.x}%`);
    root.style.setProperty('--mesh-p2y', `${cfg.p2.y}%`);
    const speedDur = cfg.speed > 0 ? `${(120 / (cfg.speed * 0.2 + 1)).toFixed(1)}s` : '0s';
    root.style.setProperty('--mesh-speed', speedDur);
    root.style.setProperty('--mesh-blur', `${cfg.blur}px`);

    const d1 = document.getElementById('mesh-dot-1');
    const d2 = document.getElementById('mesh-dot-2');
    if (d1) {
      d1.style.left = `${cfg.p1.x}%`;
      d1.style.top = `${cfg.p1.y}%`;
    }
    if (d2) {
      d2.style.left = `${cfg.p2.x}%`;
      d2.style.top = `${cfg.p2.y}%`;
    }

    const slSpeed = /** @type {HTMLInputElement} */ (document.getElementById('slider-mesh-speed'));
    const vlSpeed = document.getElementById('val-mesh-speed');
    if (slSpeed) slSpeed.value = String(cfg.speed);
    if (vlSpeed) vlSpeed.textContent = cfg.speed === 0 ? '0 (static)' : `${cfg.speed}`;

    const slBlur = /** @type {HTMLInputElement} */ (document.getElementById('slider-mesh-blur'));
    const vlBlur = document.getElementById('val-mesh-blur');
    if (slBlur) slBlur.value = String(cfg.blur);
    if (vlBlur) vlBlur.textContent = `${cfg.blur}px`;

    if (save) {
      localStorage.setItem('uriel_mesh_cfg', JSON.stringify(cfg));
    }
  }

  applyMeshCfg(meshCfg, false);

  const btnConfigureMesh = document.getElementById('btn-configure-mesh');
  const meshModal = document.getElementById('mesh-customizer-modal');
  const btnCloseMeshModal = document.getElementById('btn-close-mesh-modal');
  const btnResetMesh = document.getElementById('btn-reset-mesh');
  const sliderMeshSpeed = document.getElementById('slider-mesh-speed');
  const sliderMeshBlur = document.getElementById('slider-mesh-blur');

  function openMeshModal() {
    if (!meshModal) return;
    const card = /** @type {HTMLElement} */ (meshModal.querySelector('.settings-card') || meshModal);
    const previewBg = document.getElementById('mesh-preview-bg');
    const meshA = document.getElementById('bg-mesh-a');
    const meshB = document.getElementById('bg-mesh-b');
    const curBg = (meshLayer() === 'a' ? meshB : meshA)?.style.background || meshA?.style.background;
    if (previewBg && curBg) previewBg.style.background = curBg;

    applyMeshCfg(meshCfg, false);
    meshModal.classList.remove('hidden');
    requestAnimationFrame(() => {
      meshModal.classList.add('visible');
      if (window.LiquidMotion) {
        LiquidMotion.open(card, btnConfigureMesh, 'y');
      }
    });
  }

  function closeMeshModal() {
    if (!meshModal) return;
    const card = /** @type {HTMLElement} */ (meshModal.querySelector('.settings-card') || meshModal);
    if (window.LiquidMotion) {
      LiquidMotion.close(card, () => {
        meshModal.classList.remove('visible');
        meshModal.classList.add('hidden');
      });
    } else {
      closeModal(meshModal);
    }
  }

  if (btnConfigureMesh) btnConfigureMesh.addEventListener('click', openMeshModal);
  if (btnCloseMeshModal) btnCloseMeshModal.addEventListener('click', closeMeshModal);
  if (meshModal) {
    meshModal.addEventListener('click', (e) => {
      if (e.target === meshModal) closeMeshModal();
    });
  }

  if (sliderMeshSpeed) {
    sliderMeshSpeed.addEventListener('input', (e) => {
      meshCfg.speed = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      applyMeshCfg(meshCfg, true);
    });
  }

  if (sliderMeshBlur) {
    sliderMeshBlur.addEventListener('input', (e) => {
      meshCfg.blur = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      applyMeshCfg(meshCfg, true);
    });
  }

  if (btnResetMesh) {
    btnResetMesh.addEventListener('click', () => {
      applyMeshCfg({
        p1: { x: 20, y: 0 },
        p2: { x: 85, y: 5 },
        speed: 0,
        blur: 0
      }, true);
    });
  }

  const previewBox = document.getElementById('mesh-preview-box');
  const dot1 = document.getElementById('mesh-dot-1');
  const dot2 = document.getElementById('mesh-dot-2');

  function attachDotDrag(/** @type {HTMLElement | null} */ dotEl, /** @type {'p1' | 'p2'} */ key) {
    if (!dotEl || !previewBox) return;
    let isDragging = false;

    dotEl.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => {
      e.preventDefault();
      isDragging = true;
      dotEl.setPointerCapture(e.pointerId);
      dotEl.style.cursor = 'grabbing';
      dotEl.focus();
    });

    dotEl.addEventListener('pointermove', (/** @type {PointerEvent} */ e) => {
      if (!isDragging) return;
      const rect = previewBox.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
      const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
      meshCfg[key] = { x, y };
      applyMeshCfg(meshCfg, true);
    });

    const endDrag = (/** @type {PointerEvent} */ e) => {
      if (isDragging) {
        isDragging = false;
        try { dotEl.releasePointerCapture(e.pointerId); } catch (_) {}
        dotEl.style.cursor = 'grab';
      }
    };
    dotEl.addEventListener('pointerup', endDrag);
    dotEl.addEventListener('pointercancel', endDrag);

    dotEl.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else if (e.key === 'ArrowUp') dy = -1;
      else if (e.key === 'ArrowDown') dy = 1;
      else return;
      e.preventDefault();
      const cur = meshCfg[key];
      const x = Math.max(0, Math.min(100, cur.x + dx));
      const y = Math.max(0, Math.min(100, cur.y + dy));
      meshCfg[key] = { x, y };
      applyMeshCfg(meshCfg, true);
    });
  }

  attachDotDrag(dot1, 'p1');
  attachDotDrag(dot2, 'p2');

  const paletteDropdown = document.getElementById('palette-style-dropdown');
  const paletteTrigger = document.getElementById('palette-style-trigger');
  const paletteLabel = document.getElementById('palette-style-trigger-label');
  const paletteMenu = document.getElementById('palette-style-menu');
  if (paletteDropdown && paletteTrigger && paletteMenu) {
    const currentStyle = state.paletteStyle || 'classic';
    const styleObj = PALETTE_STYLES[currentStyle] || PALETTE_STYLES.classic;
    if (paletteLabel) paletteLabel.textContent = styleObj.label;
    /** @type {NodeListOf<HTMLElement>} */ (paletteMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.classList.toggle('selected', opt.dataset.value === currentStyle);
    });

    paletteTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      paletteDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (paletteMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        state.paletteStyle = val;
        localStorage.setItem('uriel_palette_style', state.paletteStyle);
        if (paletteLabel) paletteLabel.textContent = opt.textContent;
        paletteMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        paletteDropdown.classList.remove('open');
        updateThemeFromState();
      });
    });

    document.addEventListener('click', () => {
      paletteDropdown.classList.remove('open');
    });
  }

  /** @type {UrielBackgroundPart} */
  const api = { updateCustomBg, onBackgroundChanged };
  Object.assign(out, api);
};
