// @ts-check
// Painting the theme: the colours read from the playing song's cover, the mesh gradient and the cover
// background behind the app, light and dark mode with buttons that stay readable, and remembering the colours
// for the next start (theme-boot.js). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielThemePart} out */
window.UrielApp.theme = function ({ activeSiteTheme, coverAnalysisCache, currentUiAlpha, DEFAULT_UI_ALPHA, el, generateM3Palette, getAdv, getCoverDominantColors, getTrackThumbUrl, hexToRgb, hslToHex, mixHex, refreshCachedThemeColors, relLuminance, rgbToHsl, setUiAlphaViaSlider, state, syncSiteThemeCards }, out) {
  function analyzeCover(/** @type {string} */ imgSrc) {
    return new Promise((resolve) => {
      if (!imgSrc) {
        return resolve({ accent: '#6750A4', accent2: '#9A82DB', luminance: 0.2, saturation: 0.5 });
      }
      if (coverAnalysisCache.has(imgSrc)) {
        const cached = coverAnalysisCache.get(imgSrc);
        coverAnalysisCache.delete(imgSrc);
        coverAnalysisCache.set(imgSrc, cached);
        return resolve(cached);
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 48;
          canvas.height = 48;
          const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
          ctx.drawImage(img, 0, 0, 48, 48);
          const data = ctx.getImageData(0, 0, 48, 48).data;

          let totalLuminance = 0;
          let nonGraySatSum = 0;
          let nonGraySatCount = 0;

          const bins = Array.from({ length: 24 }, (_, i) => ({
            idx: i,
            centerHue: (i + 0.5) * 15,
            weight: 0,
            rSum: 0,
            gSum: 0,
            bSum: 0,
            count: 0
          }));

          let fallbackR = 0, fallbackG = 0, fallbackB = 0;
          const totalPixels = data.length / 4;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            fallbackR += r;
            fallbackG += g;
            fallbackB += b;

            const rN = r / 255;
            const gN = g / 255;
            const bN = b / 255;

            const lum = 0.2126 * rN + 0.7152 * gN + 0.0722 * bN;
            totalLuminance += lum;

            const max = Math.max(rN, gN, bN);
            const min = Math.min(rN, gN, bN);
            const d = max - min;
            const l = (max + min) / 2;
            const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

            if (s >= 0.15) {
              nonGraySatSum += s;
              nonGraySatCount++;

              if (l >= 0.10 && l <= 0.90) {
                let hDeg = 0;
                if (d > 0) {
                  if (max === rN) {
                    hDeg = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
                  } else if (max === gN) {
                    hDeg = ((bN - rN) / d + 2) * 60;
                  } else {
                    hDeg = ((rN - gN) / d + 4) * 60;
                  }
                }
                const binIdx = Math.min(23, Math.max(0, Math.floor(hDeg / 15)));
                const bin = bins[binIdx];
                bin.weight += s;
                bin.rSum += r;
                bin.gSum += g;
                bin.bSum += b;
                bin.count++;
              }
            }
          }

          const meanLuminance = totalLuminance / totalPixels;
          const meanSaturation = nonGraySatCount > 0 ? (nonGraySatSum / nonGraySatCount) : 0;

          let bestBin = null;
          for (let i = 0; i < 24; i++) {
            if (bins[i].count > 0) {
              if (!bestBin || bins[i].weight > bestBin.weight) {
                bestBin = bins[i];
              }
            }
          }

          let accentHex = '';
          let accentR = 0, accentG = 0, accentB = 0;

          if (bestBin && bestBin.count > 0) {
            accentR = Math.round(bestBin.rSum / bestBin.count);
            accentG = Math.round(bestBin.gSum / bestBin.count);
            accentB = Math.round(bestBin.bSum / bestBin.count);
            accentHex = '#' + [accentR, accentG, accentB].map(x => x.toString(16).padStart(2, '0')).join('');
          } else {
            accentR = Math.round(fallbackR / totalPixels);
            accentG = Math.round(fallbackG / totalPixels);
            accentB = Math.round(fallbackB / totalPixels);
            accentHex = '#' + [accentR, accentG, accentB].map(x => x.toString(16).padStart(2, '0')).join('');
          }

          let bestBin2 = null;
          if (bestBin) {
            for (let i = 0; i < 24; i++) {
              if (bins[i].count > 0 && i !== bestBin.idx) {
                const diff = Math.abs(bins[i].centerHue - bestBin.centerHue);
                const dist = Math.min(diff, 360 - diff);
                if (dist >= 60) {
                  if (!bestBin2 || bins[i].weight > bestBin2.weight) {
                    bestBin2 = bins[i];
                  }
                }
              }
            }
          }

          let accent2Hex = '';
          if (bestBin2 && bestBin2.count > 0) {
            const r2 = Math.round(bestBin2.rSum / bestBin2.count);
            const g2 = Math.round(bestBin2.gSum / bestBin2.count);
            const b2 = Math.round(bestBin2.bSum / bestBin2.count);
            accent2Hex = '#' + [r2, g2, b2].map(x => x.toString(16).padStart(2, '0')).join('');
          } else {
            const hslAcc = rgbToHsl(accentR, accentG, accentB);
            const h2 = (hslAcc.h + 40) % 360;
            accent2Hex = hslToHex(h2, hslAcc.s, hslAcc.l);
          }

          const result = {
            accent: accentHex,
            accent2: accent2Hex,
            luminance: meanLuminance,
            saturation: meanSaturation
          };

          if (coverAnalysisCache.size >= 50) {
            const oldestKey = coverAnalysisCache.keys().next().value;
            coverAnalysisCache.delete(oldestKey);
          }
          coverAnalysisCache.set(imgSrc, result);
          resolve(result);
        } catch (err) {
          resolve({ accent: '#6750A4', accent2: '#9A82DB', luminance: 0.2, saturation: 0.5 });
        }
      };
      img.onerror = () => {
        resolve({ accent: '#6750A4', accent2: '#9A82DB', luminance: 0.2, saturation: 0.5 });
      };
      img.src = imgSrc;
    });
  }

  let activeMeshLayer = 'a';
  let lastMeshKey = '';
  /** @type {[string, string, string] | null} */
  let lastMeshArgs = null;
  /** @type {string[] | null} */
  let meshCoverColors = null;


  function colorToHex(/** @type {string} */ c) {
    if (!c) return '#9E9E9E';
    if (typeof c === 'string' && c.startsWith('#')) return c;
    const match = typeof c === 'string' && c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
    }
    return c;
  }

  async function refreshMeshCover() {
    if (!getAdv('mesh_cover_color', false) || !state.currentTrack) {
      meshCoverColors = null;
      return;
    }
    const trackBefore = state.currentTrack;
    const thumbUrl = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail) || '';
    if (!thumbUrl) {
      meshCoverColors = null;
      redrawMesh();
      return;
    }
    try {
      const [a, b] = await getCoverDominantColors(thumbUrl);
      const currentUrl = (state.currentTrack && (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail)) || '';
      if (!state.currentTrack || (state.currentTrack !== trackBefore && state.currentTrack.id !== trackBefore?.id) || currentUrl !== thumbUrl) return;
      meshCoverColors = [colorToHex(a), colorToHex(b || a)];
      redrawMesh();
    } catch (_) {}
  }

  let coverBgIdx = 0;
  let activeCoverBgUrl = '';

  function setCoverBg(/** @type {string} */ url) {
    const enabled = getAdv('cover_bg', true);
    const layers = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#cover-bg .cover-bg-layer'));
    if (!enabled || !url) {
      activeCoverBgUrl = '';
      document.body.classList.remove('cover-bg-on');
      layers.forEach(l => l.classList.remove('on'));
      return;
    }

    activeCoverBgUrl = url;
    document.body.classList.add('cover-bg-on');

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      if (activeCoverBgUrl !== url) return;
      if (layers.length < 2) return;
      const nextIdx = 1 - coverBgIdx;
      const nextLayer = /** @type {HTMLElement} */ (layers[nextIdx]);
      const prevLayer = layers[coverBgIdx];

      nextLayer.style.backgroundImage = `url(${JSON.stringify(url)})`;
      nextLayer.classList.add('on');
      prevLayer.classList.remove('on');
      coverBgIdx = nextIdx;
    };
    img.src = url;
  }

  /** @type {{ el: HTMLElement, kind: string, view: HTMLElement | null, home: { parent: ParentNode | null, next: ChildNode | null } }[]} */
  const fxItems = [];
  function registerFx(/** @type {HTMLElement | null} */ el, /** @type {string} */ kind, /** @type {HTMLElement | null} */ viewEl) {
    if (!el || fxItems.some(i => i.el === el)) return;
    fxItems.push({ el, kind, view: viewEl || null, home: { parent: el.parentNode, next: el.nextSibling } });
    el.dataset.fx = kind;
  }
  function applyFxClip() {
    const free = document.body.classList.contains('no-clip-fx');
    const root = document.getElementById('fx-root');
    fxItems.forEach(i => {
      if (free) {
        if (root) root.appendChild(i.el);
        i.el.classList.add('fx-free');
      } else {
        if (i.home && i.home.parent) {
          i.home.parent.insertBefore(i.el, i.home.next && i.home.next.parentNode === i.home.parent ? i.home.next : null);
        }
        i.el.classList.remove('fx-free');
      }
    });
    updateFxVisibility();
  }
  function updateFxVisibility() {
    const free = document.body.classList.contains('no-clip-fx');
    fxItems.forEach(i => {
      const isHidden = (free && i.view && !i.view.classList.contains('active'));
      i.el.classList.toggle('fx-hidden', !!isHidden);
      i.el.style.display = '';
    });
  }

  // the mesh again with its last colours, after something that changes how it looks
  function redrawMesh() {
    lastMeshKey = '';
    if (lastMeshArgs) updateMeshGradient(...lastMeshArgs);
  }
  function updateMeshGradient(/** @type {string} */ accentHex, /** @type {string} */ accent2Hex, /** @type {string} */ mode) {
    lastMeshArgs = [accentHex, accent2Hex, mode];
    const meshA = document.getElementById('bg-mesh-a');
    const meshB = document.getElementById('bg-mesh-b');
    if (!meshA || !meshB) return;

    const isEnabled = getAdv('mesh_gradient', false) && (state.meshBrightness > 0);
    if (!isEnabled) {
      meshA.style.opacity = '0';
      meshB.style.opacity = '0';
      lastMeshKey = '';
      return;
    }

    let c1 = accentHex;
    let c2 = accent2Hex;
    const useCover = getAdv('mesh_cover_color', false);
    if (useCover && meshCoverColors) {
      c1 = meshCoverColors[0];
      c2 = meshCoverColors[1];
    }
    const followIntensity = getAdv('mesh_follow_intensity', true);
    if (followIntensity) {
      const k = Math.max(0, Math.min(1, (Number.isFinite(state.themeIntensity) ? state.themeIntensity : 100) / 100));
      c1 = mixHex(c1, '#9E9E9E', 1 - k);
      c2 = mixHex(c2, '#9E9E9E', 1 - k);
    }

    const meshKey = `${c1}_${c2}_${mode}_${state.meshBrightness}_${followIntensity}_${useCover}`;
    if (meshKey === lastMeshKey) return;
    lastMeshKey = meshKey;

    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);

    const brightnessScale = Math.max(0, Math.min(100, state.meshBrightness)) / 100;
    const a1 = (mode === 'light' ? 0.22 : 0.55) * brightnessScale;
    const a2 = (mode === 'light' ? 0.18 : 0.45) * brightnessScale;

    const accentRgba = `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, ${a1})`;
    const accent2Rgba = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${a2})`;

    const gradient = `linear-gradient(to bottom, transparent 35%, var(--md-sys-color-background) 85%), ` +
      `radial-gradient(ellipse at var(--mesh-p1x, 20%) var(--mesh-p1y, 0%), ${accentRgba} 0%, transparent 70%), ` +
      `radial-gradient(ellipse at var(--mesh-p2x, 85%) var(--mesh-p2y, 5%), ${accent2Rgba} 0%, transparent 65%), ` +
      `var(--md-sys-color-background)`;

    const target = activeMeshLayer === 'a' ? meshB : meshA;
    const current = activeMeshLayer === 'a' ? meshA : meshB;

    target.style.background = gradient;
    target.style.opacity = '1';
    current.style.opacity = '0';

    activeMeshLayer = activeMeshLayer === 'a' ? 'b' : 'a';
  }

  let currentEffectiveMode = state.themeMode === 'auto' ? 'dark' : state.themeMode;


  function contrastRatio(/** @type {number} */ a, /** @type {number} */ b) {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  function computeButtonColors(/** @type {string} */ accentHex, /** @type {string} */ mode) {
    const rgb = hexToRgb(accentHex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const s = hsl.s;
    const dark = mode === 'dark';
    let l = dark ? Math.min(74, Math.max(52, hsl.l)) : Math.min(46, Math.max(32, hsl.l));
    const lumAt = (/** @type {number} */ L) => relLuminance(hslToHex(hsl.h, s, L));
    while (lumAt(l) > 0.42 && l > 26) l -= 1;
    const mid = lumAt(l);
    if (mid > 0.18 && mid < 0.23) {
      while (lumAt(l) > 0.18 && l > 22) l -= 1;
    }
    const bg = hslToHex(hsl.h, s, l);
    const bgLum = relLuminance(bg);
    const darkText = '#1B1B1F';
    const fg = contrastRatio(bgLum, 1) >= contrastRatio(bgLum, relLuminance(darkText)) ? '#FFFFFF' : darkText;
    const hover = hslToHex(hsl.h, s, Math.max(0, Math.min(100, l + (dark ? 5 : -5))));
    return { bg, fg, hover, bgLum };
  }

  function applyButtonAccent(/** @type {string} */ hexColor, /** @type {string} */ mode, /** @type {boolean} */ mono) {
    const themeAccent = document.documentElement.style.getPropertyValue('--md-sys-color-primary')?.trim() || hexColor || '#6750A4';
    const isMono = mono !== undefined ? mono : (state.themeIntensity < 8);
    const c = isMono ? (mode === 'light' ? { bg: '#111111', fg: '#FFFFFF', hover: '#333333' } : { bg: '#FFFFFF', fg: '#121212', hover: '#E6E6E6' }) : computeButtonColors(themeAccent, mode);
    const root = document.documentElement.style;
    root.setProperty('--btn-primary-bg', c.bg);
    root.setProperty('--btn-primary-fg', c.fg);
    root.setProperty('--btn-primary-hover', c.hover);
  }

  // see-through panels (UI opacity below 100%) read badly on a light theme: go solid while it is light, then back
  /** @type {string | null} */
  let lastEffectiveMode = null;
  function onEffectiveModeChanged(/** @type {string} */ mode) {
    if (lastEffectiveMode === null || !document.getElementById('slider-ui-alpha')) {
      // first paint on a light theme with the default opacity: start solid
      if (mode === 'light' && localStorage.getItem('uriel_ui_alpha') === null && document.getElementById('slider-ui-alpha')) {
        localStorage.setItem('uriel_ui_alpha', '100');
        document.documentElement.style.setProperty('--ui-alpha', '100%');
        /** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')).value = '100';
        localStorage.setItem('uriel_ui_alpha_light_prev', DEFAULT_UI_ALPHA);
        localStorage.setItem('uriel_ui_alpha_light_auto', '100');
      }
      lastEffectiveMode = mode;
      return;
    }
    if (lastEffectiveMode !== mode) {
      if (mode === 'light') {
        const now = currentUiAlpha();
        if (now < 100) {
          localStorage.setItem('uriel_ui_alpha_light_prev', String(now));
          localStorage.setItem('uriel_ui_alpha_light_auto', '100');
          setUiAlphaViaSlider(100);
        }
      } else if (lastEffectiveMode === 'light') {
        const auto = localStorage.getItem('uriel_ui_alpha_light_auto'), prev = localStorage.getItem('uriel_ui_alpha_light_prev');
        if (auto !== null && prev !== null && currentUiAlpha() === Number(auto)) setUiAlphaViaSlider(Number(prev));
        localStorage.removeItem('uriel_ui_alpha_light_auto');
        localStorage.removeItem('uriel_ui_alpha_light_prev');
      }
      lastEffectiveMode = mode;
    }
  }

  function applyTheme(/** @type {string} */ hexColor, /** @type {string} */ mode, intensity = state.themeIntensity, brightness = state.themeBrightness, /** @type {string | null} */ accent2 = null, isAuto = false) {
    currentEffectiveMode = mode;
    const site = !isAuto && mode === 'dark' ? activeSiteTheme() : null;
    if (site) { hexColor = site.accent; accent2 = site.accent2; }
    generateM3Palette(hexColor, mode, intensity, brightness);
    const themeAccent = document.documentElement.style.getPropertyValue('--md-sys-color-primary')?.trim() || hexColor;
    // a website theme is never the gray one, whatever the intensity slider says
    const mono = !site && intensity < 8;
    applyButtonAccent(themeAccent, mode, mono);
    document.body.classList.toggle('theme-light', mode === 'light');
    document.body.classList.toggle('theme-dark', mode === 'dark');
    document.body.classList.toggle('intensity-zero', mono);
    syncSiteThemeCards();
    onEffectiveModeChanged(mode);
    if (el.themeSwatches) {
      el.themeSwatches.forEach((/** @type {HTMLElement} */ sw) => sw.classList.toggle('active', !site && !!(state.themeAccent && sw.dataset.color && sw.dataset.color.toLowerCase() === state.themeAccent.toLowerCase())));
    }
    // not while the picker is open: that reset the picker under the pointer
    if (el.customColorInput && document.activeElement !== el.customColorInput) el.customColorInput.value = hexColor;

    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (el.sliderHue) el.sliderHue.value = String(hsl.h);
    if (el.valHue) el.valHue.textContent = hsl.h + '°';

    if (el.sliderIntensity) {
      el.sliderIntensity.disabled = isAuto;
      el.sliderIntensity.value = String(intensity);
      const parent = el.sliderIntensity.closest('.setting-item');
      if (parent) parent.classList.toggle('is-disabled', isAuto);
    }
    if (el.valIntensity) el.valIntensity.textContent = intensity + '%';

    if (el.sliderBrightness) {
      el.sliderBrightness.disabled = isAuto;
      el.sliderBrightness.value = String(brightness);
      const parent = el.sliderBrightness.closest('.setting-item');
      if (parent) parent.classList.toggle('is-disabled', isAuto);
    }
    if (el.valBrightness) el.valBrightness.textContent = brightness + '%';

    let resolvedAccent2 = accent2;
    if (!resolvedAccent2) {
      const h2 = (hsl.h + 40) % 360;
      resolvedAccent2 = /** @type {string} */ (hslToHex(h2, hsl.s, hsl.l));
    }

    updateMeshGradient(mono ? '#9E9E9E' : hexColor, mono ? '#757575' : resolvedAccent2, mode);
    refreshCachedThemeColors();
    saveThemeBootSoon();
  }

  // what the theme painted, for theme-boot.js to put back on the first frame of the next start (otherwise the
  // default purple shows until start-up gets this far)
  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let themeBootTimer = null;
  function saveThemeBoot() {
    if (themeBootTimer) clearTimeout(themeBootTimer);
    themeBootTimer = null;
    try {
      /** @type {Record<string, string>} */
      const mesh = {};
      for (const id of ['bg-mesh-a', 'bg-mesh-b']) { const m = document.getElementById(id); if (m) mesh[id] = m.style.cssText; }
      localStorage.setItem('uriel_theme_boot', JSON.stringify({
        root: document.documentElement.style.cssText,
        body: ['theme-light', 'theme-dark', 'intensity-zero'].filter((c) => document.body.classList.contains(c)),
        mesh,
      }));
    } catch (e) {}
  }
  function saveThemeBootSoon() { if (!themeBootTimer) themeBootTimer = setTimeout(saveThemeBoot, 1500); }
  window.addEventListener('pagehide', saveThemeBoot);

  // Auto-theme palettes touch dozens of CSS vars at once; a root view transition
  // crossfades the whole old/new palette instead of snapping.
  function smoothThemeSwap(/** @type {() => void} */ fn) {
    if (!document.startViewTransition || document.hidden || document.body.classList.contains('perf') || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
    const root = document.documentElement;
    root.classList.add('theme-vt');
    const vt = document.startViewTransition(fn);
    vt.finished.finally(() => root.classList.remove('theme-vt'));
  }

  function updateThemeFromState() {
    if (state.themeMode === 'auto') {
      const coverThumb = (state.currentTrack && (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail)) || '';
      if (coverThumb) {
        analyzeCover(coverThumb).then(analysis => {
          if (state.themeMode !== 'auto') return;
          // a slow analysis of an earlier song's cover mustn't repaint the theme after a skip
          const nowThumb = (state.currentTrack && (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : state.currentTrack.thumbnail)) || '';
          if (nowThumb !== coverThumb) return;

          const derivedMode = analysis.luminance > 0.58 ? 'light' : 'dark';
          const derivedIntensity = Math.min(85, Math.max(20, Math.round(analysis.saturation * 100 * 0.9)));
          let derivedBrightness;
          if (derivedMode === 'dark') {
            derivedBrightness = Math.min(60, Math.max(40, Math.round(40 + (Math.min(0.58, analysis.luminance) / 0.58) * 20)));
          } else {
            const normLum = Math.max(0, Math.min(1, (analysis.luminance - 0.58) / (1 - 0.58)));
            derivedBrightness = Math.min(75, Math.max(55, Math.round(55 + normLum * 20)));
          }

          smoothThemeSwap(() => applyTheme(analysis.accent, derivedMode, derivedIntensity, derivedBrightness, analysis.accent2, true));
        });
      } else {
        applyTheme(state.themeAccent, 'dark', state.themeIntensity, state.themeBrightness, null, true);
      }
    } else {
      applyTheme(state.themeAccent, state.themeMode, state.themeIntensity, state.themeBrightness, null, false);
    }

    if (el.themeModeBtns) {
      el.themeModeBtns.forEach((/** @type {HTMLElement} */ btn) => btn.classList.toggle('active', btn.dataset.themeMode === state.themeMode));
    }
  }

  const effectiveMode = () => currentEffectiveMode;

  /** @type {UrielThemePart} */
  const api = { analyzeCover, setCoverBg, registerFx, applyFxClip, updateFxVisibility, refreshMeshCover, redrawMesh, updateMeshGradient, smoothThemeSwap, updateThemeFromState, effectiveMode };
  Object.assign(out, api);
};
