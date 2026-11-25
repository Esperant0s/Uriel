// @ts-check
document.addEventListener('DOMContentLoaded', async () => {
  // playlists, favorites and history are read from IndexedDB before anything uses them (library-store.js)
  try { if (window.UrielLibraryStore) await window.UrielLibraryStore.ready; } catch (e) {}
  await libraryUnavailableScreen();
  try { localStorage.removeItem('uriel_stats'); } catch (e) {}

  const THUMB_FALLBACK = "if(window.urielArtNext){window.urielArtNext(this)}else if(this.dataset.full&&this.src!==this.dataset.full){this.src=this.dataset.full}else{this.style.visibility='hidden'}";

  function escapeHtml(/** @type {unknown} */ value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const LiquidMotion = {
    setAnchor(/** @type {HTMLElement} */ element, /** @type {HTMLElement | null} */ triggerEl, axis = 'x') {
      if (!element) return;
      if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const parentRect = element.parentElement ? element.parentElement.getBoundingClientRect() : { top: 0, left: 0 };
        if (axis === 'x') {
          const anchorY = (rect.top + rect.height / 2) - parentRect.top;
          element.style.setProperty('--liquid-anchor-y', `${anchorY}px`);
          element.style.setProperty('--liquid-anchor-x', '0px');
          element.style.transformOrigin = `0px ${anchorY}px`;
        } else {
          const anchorX = (rect.left + rect.width / 2) - parentRect.left;
          element.style.setProperty('--liquid-anchor-x', `${anchorX}px`);
          element.style.setProperty('--liquid-anchor-y', '0px');
          element.style.transformOrigin = `${anchorX}px 0px`;
        }
      } else {
        if (axis === 'x') {
          element.style.setProperty('--liquid-anchor-y', '50%');
          element.style.setProperty('--liquid-anchor-x', '0px');
          element.style.transformOrigin = '0px 50%';
        } else {
          element.style.setProperty('--liquid-anchor-x', '50%');
          element.style.setProperty('--liquid-anchor-y', '0px');
          element.style.transformOrigin = '50% 0px';
        }
      }
    },
    /** @param {HTMLElement} element @param {HTMLElement | null} triggerEl @param {string} [axis] @param {() => void} [onDone] */
    open(element, triggerEl, axis = 'x', onDone) {
      if (!element) return;
      this.setAnchor(element, triggerEl, axis);
      element.classList.remove('liquid-closing');
      element.classList.add('liquid-surface', `liquid-${axis}`, 'liquid-open');
      if (onDone) setTimeout(onDone, 480);
    },
    /** @param {HTMLElement} element @param {() => void} [onDone] */
    close(element, onDone) {
      if (!element) return;
      element.classList.add('liquid-closing');
      element.classList.remove('liquid-open');
      setTimeout(() => {
        element.classList.remove('liquid-closing', 'liquid-open');
        if (onDone) onDone();
      }, 300);
    }
  };
  window.LiquidMotion = LiquidMotion;


  function injectM3Shapes() {
    const defs = document.getElementById('m3-dynamic-defs');
    if (!defs) return;

    const formulas = {
      'm3-cookie-4': (/** @type {number} */ a) => 40 + 6 * Math.cos(4 * a),
                          'm3-diamond-puffy': (/** @type {number} */ a) => 36 + 10 * Math.cos(4 * a),
                          'm3-flower': (/** @type {number} */ a) => 28 + 18 * Math.abs(Math.cos(4 * a)),
                          'm3-poly-6': (/** @type {number} */ a) => {
                            let t = a % (2 * Math.PI / 6);
                            if (t < 0) t += 2 * Math.PI / 6;
                            return 36 / Math.cos(t - Math.PI / 6);
                          },
                          'm3-leaf-4': (/** @type {number} */ a) => 40 + 6 * Math.cos(4 * a)
    };

    let html = '';
    for (const [id, formula] of Object.entries(formulas)) {
      let path = '';
      const res = 120;
      for (let i = 0; i <= res; i++) {
        const angle = (i / res) * 2 * Math.PI;
        const r = formula(angle);
        const x = 0.5 + (r * Math.cos(angle)) / 100;
        const y = 0.5 + (r * Math.sin(angle)) / 100;
        path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(4)},${y.toFixed(4)} `;
      }
      path += 'Z';
      html += `<clipPath id="${id}" clipPathUnits="objectBoundingBox"><path d="${path}" /></clipPath>`;
    }
    defs.insertAdjacentHTML('beforeend', html);
  }
  injectM3Shapes();

  // UI language (i18n.js): T('English') now, Tf('{0} songs', n) with values that are never translated,
  // Tm(...) for a toast or I18N.text(el, ...) that keep up when the translation comes in or the language changes.
  // Only literal strings go in: anything from the library or typed by someone goes into the {0} slots.
  const I18N = window.UrielI18n || { T: (/** @type {string} */ s) => s, Tf: (/** @type {string} */ s, /** @type {unknown[]} */ ...a) => String(s).replace(/\{(\d)\}/g, (_, i) => (a[i] != null ? String(a[i]) : '')), lang: 'en', text: (/** @type {HTMLElement} */ el, /** @type {string} */ s, /** @type {unknown[]} */ ...a) => { if (el) el.textContent = String(s).replace(/\{(\d)\}/g, (_, i) => (a[i] != null ? String(a[i]) : '')); }, ready: () => Promise.resolve(), connect() {}, setLang: async () => true, refresh() {} };
  if (!I18N.Tm) I18N.Tm = (/** @type {string} */ s, /** @type {unknown[]} */ ...a) => ({ i18n: String(s), args: a, toString() { return I18N.Tf(this.i18n, ...this.args); } });
  const T = (/** @type {string} */ s) => I18N.T(s);
  const Tf = (/** @type {string} */ s, /** @type {unknown[]} */ ...args) => I18N.Tf(s, ...args);
  /** @returns {UrielI18nMessage} */
  const Tm = (/** @type {string} */ s, /** @type {unknown[]} */ ...args) => I18N.Tm(s, ...args);
  // what upstream Riff (and plugins written for it) call
  window.t = T;
  window.applyI18n = (lang) => I18N.setLang(lang);
  // shown often but not on the page until then (a song's menu, everyday messages): asked for along with the page
  if (I18N.known) I18N.known(['Play next', 'Add to queue', 'Add to playlist…', 'Add to favorites', 'Remove from favorites', 'Go to artist',
    'Download…', 'Remove from playlist', 'Playing next', 'Added to queue', 'Already in the queue', 'Added to "{0}"', 'Already in "{0}"',
    'Added {0} songs to "{1}"', 'Playlist deleted', 'Link copied{0}', 'Removed from library', 'Could not play this song. Try again or skip.',
    'Offline: connect to the internet to search new songs', 'No matching songs. Try a different search', 'Search for "{0}"', 'Actions',
    'Playlists', 'Favorites', 'In playlists', 'Queue', 'History', 'Library', 'Online', 'Discover', 'View', 'Audio', 'Your stats',
    'Repeat: playlist', 'Repeat: this song', 'Start radio', 'Radio · {0}', 'Radio · {0} and {1} more', 'Sleep timer: {0} min', 'Sleep timer: end of song']);

  /** @type {{ message: UrielText, type: string, duration: number | null }[]} */
  const toastQueue = [];
  const MAX_QUEUED_TOASTS = 10;
  let isToastActive = false;

  // message: a string as it is (it is not translated: it may hold a song title), or Tm('...', ...) to translate
  function showToast(/** @type {UrielText | null | undefined} */ message, type = 'info', /** @type {number | null} */ duration = null) {
    if (!message) return;
    if (toastQueue.length >= MAX_QUEUED_TOASTS) {
      toastQueue.shift();
    }
    toastQueue.push({ message, type, duration });
    if (!isToastActive) {
      // a message in another language waits a moment for its words, instead of showing up in English
      if (typeof message !== 'string' && message.i18n && I18N.lang !== 'en') {
        isToastActive = true;
        I18N.ready(message.i18n).then(processToastQueue);
      } else {
        processToastQueue();
      }
    }
  }

  function processToastQueue() {
    if (toastQueue.length === 0) {
      isToastActive = false;
      return;
    }
    isToastActive = true;
    const container = document.getElementById('toast-container');
    if (!container) {
      toastQueue.length = 0;
      isToastActive = false;
      return;
    }
    const { message, type, duration } = /** @type {typeof toastQueue[number]} */ (toastQueue.shift());

    const toast = document.createElement('div');
    toast.className = `uriel-toast ${type}${duration ? ' wide' : ''}`;

    let iconSvg = '';
    if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="14"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>';
    } else if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><polyline points="5 12.5 10 17.5 19 7.5"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    }

    const cleanMessage = String(message).charAt(0).toUpperCase() + String(message).slice(1);

    toast.innerHTML = `
      ${iconSvg ? `<span class="toast-icon">${iconSvg}</span>` : ''}
      <span class="toast-text">${escapeHtml(cleanMessage)}</span>
    `;
    if (typeof message !== 'string' && message.i18n) I18N.text(toast.querySelector('.toast-text'), message);

    container.appendChild(toast);

    let dismissed = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    let remaining = duration || 3500;
    let startTimestamp = Date.now();

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      toast.classList.add('leaving');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        toast.remove();
        processToastQueue();
      };
      toast.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 320);
    };

    const startTimer = (/** @type {number} */ dur) => {
      startTimestamp = Date.now();
      timer = setTimeout(dismiss, dur);
    };

    toast.addEventListener('mouseenter', () => {
      if (timer) clearTimeout(timer);
      remaining -= (Date.now() - startTimestamp);
      if (remaining < 500) remaining = 500;
    });

    toast.addEventListener('mouseleave', () => {
      if (!dismissed) {
        startTimer(remaining);
      }
    });

    toast.addEventListener('click', dismiss);

    startTimer(remaining);
  }

  if (localStorage.getItem('uriel_scale_rebased_v2') !== '1') {
    localStorage.setItem('uriel_scale_rebased_v2', '1');
    if (localStorage.getItem('devsize_ui_scale') === '90') {
      localStorage.removeItem('devsize_ui_scale');
    }
    if (localStorage.getItem('uriel_font_scale') === '95') {
      localStorage.removeItem('uriel_font_scale');
    }
  }

  const savedScale = parseFloat(localStorage.getItem('devsize_ui_scale') || '100');
  applyScale(savedScale);

  function applyScale(/** @type {number} */ scalePercent) {
    const factor = (scalePercent / 100) * 0.90;
    document.documentElement.style.setProperty('--app-scale', factor.toString());
    if (window.electronAPI && window.electronAPI.setZoomFactor) {
      window.electronAPI.setZoomFactor(factor);
    } else {
      document.body.style.zoom = String(factor);
    }
  }

  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  }, { passive: true });

  function openModal(/** @type {HTMLElement | null} */ elModal) {
    if (!elModal) return;
    if (elModal._closeTimer) { clearTimeout(elModal._closeTimer); elModal._closeTimer = null; }
    elModal.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elModal.classList.add('visible');
      });
    });
  }

  function closeModal(/** @type {HTMLElement | null} */ elModal) {
    if (!elModal) return;
    elModal.classList.remove('visible');
    if (elModal._closeTimer) clearTimeout(elModal._closeTimer);
    elModal._closeTimer = setTimeout(() => {
      elModal._closeTimer = null;
      elModal.classList.add('hidden');
    }, 200);
  }

  const defaultPresets = [
    { id: 'p_default', name: 'default', settings: { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_speedup', name: 'speed up (orig pitch)', settings: { speed: 1.35, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_speedup_pitch', name: 'speed up (tape pitch)', settings: { speed: 1.0, speedPitch: 1.30, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_slowed', name: 'slowed + reverb', settings: { speed: 1.0, speedPitch: 0.82, pitch: 0, reverb: 65, distortion: 0, volume: 1.0, echo: 15, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_nightcore', name: 'nightcore', settings: { speed: 1.0, speedPitch: 1.25, pitch: 0, reverb: 20, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'p_distortion', name: 'distortion hard', settings: { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 75, volume: 1.25, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }
  ];

  const defaultVfx = {
    ambientGlow: true,
    bassPulse: false,
    vinylSpin: false,
    soundwaveRings: false,
    borderGlow: false,
    particles: false,
    backdropBlur: false,
    crt: false,
    grain: false,
    lyricsSpotlight: false
  };

  function normalizePreset(/** @type {UrielPreset} */ p) {
    if (!p) return null;
    // a preset file can have it all wrong: every value is checked below
    const s = /** @type {Record<string, unknown>} */ (p.settings || p.values || {});
    const eq = /** @type {{ low?: unknown, mid?: unknown, high?: unknown }} */ (s.eq || {});
    return {
      id: p.id,
      name: p.name || 'preset',
      settings: {
        speed: typeof s.speed === 'number' ? s.speed : 1.0,
        speedPitch: typeof s.speedPitch === 'number' ? s.speedPitch : 1.0,
        pitch: typeof s.pitch === 'number' ? s.pitch : (typeof s.pitchSemitones === 'number' ? s.pitchSemitones : 0),
                          reverb: typeof s.reverb === 'number' ? s.reverb : 0,
                          distortion: typeof s.distortion === 'number' ? s.distortion : 0,
                          volume: typeof s.volume === 'number' ? s.volume : (typeof s.gain === 'number' ? s.gain : 1.0),
                          echo: typeof s.echo === 'number' ? s.echo : 0,
                          eq: {
                            low: typeof eq.low === 'number' ? eq.low : 0,
                            mid: typeof eq.mid === 'number' ? eq.mid : 0,
                            high: typeof eq.high === 'number' ? eq.high : 0
                          },
                          eqBands: Array.isArray(s.eqBands) && s.eqBands.length === 10 ? s.eqBands.map((/** @type {unknown} */ v) => typeof v === 'number' ? v : 0) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      }
    };
  }

  function safeJson(/** @type {string} */ key, /** @type {unknown} */ fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function safeArray(/** @type {string} */ key) {
    const value = safeJson(key, []);
    return Array.isArray(value) ? value : [];
  }

  const rawCustomPresets = safeArray('devsize_custom_presets');
  const normalizedCustomPresets = rawCustomPresets.map(normalizePreset).filter(Boolean);

  const savedVolumeRaw = parseFloat(localStorage.getItem('uriel_volume') || '');
  const savedVolume = Number.isFinite(savedVolumeRaw) ? Math.max(0, Math.min(1, savedVolumeRaw)) : 0.85;

  const DEFAULT_AUDIO_SETTINGS = { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  const DEFAULT_HQ_SETTINGS = { engine: 'hqmusic-3', preset: 'studio', vocal: 0, air: 0, bass: 0 };
  // on unless switched off: speed, pitch and effects reset every launch was mistaken for a bug (issue #5)
  let soundPersistenceEnabled = localStorage.getItem('uriel_persist_sound_settings') !== '0';

  function loadSoundSettings() {
    if (!soundPersistenceEnabled) {
      return {
        audioSettings: { ...DEFAULT_AUDIO_SETTINGS, eq: { ...DEFAULT_AUDIO_SETTINGS.eq }, eqBands: [...DEFAULT_AUDIO_SETTINGS.eqBands] },
        hqEnabled: false,
        hqSettings: { ...DEFAULT_HQ_SETTINGS }
      };
    }
    const savedAudio = safeJson('uriel_audio_settings', null);
    const savedHq = safeJson('uriel_hq_settings', null);
    const audioObj = savedAudio && typeof savedAudio === 'object' ? savedAudio : {};
    const hqObj = savedHq && typeof savedHq === 'object' ? savedHq : {};
    return {
      audioSettings: {
        ...DEFAULT_AUDIO_SETTINGS,
        ...audioObj,
        eq: { ...DEFAULT_AUDIO_SETTINGS.eq, ...(audioObj.eq && typeof audioObj.eq === 'object' ? audioObj.eq : {}) },
        eqBands: Array.isArray(audioObj.eqBands) && audioObj.eqBands.length === 10 ? audioObj.eqBands.map((/** @type {unknown} */ v) => typeof v === 'number' ? v : 0) : [...DEFAULT_AUDIO_SETTINGS.eqBands]
      },
      hqEnabled: localStorage.getItem('uriel_hq_enabled') === '1',
      hqSettings: { ...DEFAULT_HQ_SETTINGS, ...hqObj }
    };
  }

  const savedSound = loadSoundSettings();

  const SF_FONT_STACK = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif`;

  function ensureSfFontLoaded() {
    if (!document.getElementById('font-sf-pro')) {
      const link = document.createElement('link');
      link.id = 'font-sf-pro';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.cdnfonts.com/css/sf-pro-display';
      document.head.appendChild(link);
    }
  }

  function applyFont(/** @type {string | undefined} */ font) {
    const f = (typeof font === 'string' && font) ? font : (localStorage.getItem('uriel_font') || 'google');
    if (typeof state !== 'undefined' && state) {
      state.riffFont = f;
    }
    if (f === 'sf') {
      ensureSfFontLoaded();
      document.documentElement.style.setProperty('--font-family', SF_FONT_STACK);
    } else if (f === 'system') {
      document.documentElement.style.setProperty('--font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    } else {
      document.documentElement.style.removeProperty('--font-family');
    }
    const fontOptGoogle = document.getElementById('font-opt-google');
    const fontOptSf = document.getElementById('font-opt-sf');
    const fontOptSystem = document.getElementById('font-opt-system');
    if (fontOptGoogle) fontOptGoogle.classList.toggle('active', f === 'google');
    if (fontOptSf) fontOptSf.classList.toggle('active', f === 'sf');
    if (fontOptSystem) fontOptSystem.classList.toggle('active', f === 'system');
  }

  // the app's state: many parts read and write it, and it holds songs and lists as the services sent them
  /** @type {UrielAppState} */
  const state = {
    platform: localStorage.getItem('uriel_platform') || 'youtube',
    currentView: 'discover',
    previousView: 'discover',
    currentPlaylistId: null,
    currentArtistData: null,
    searchQuery: '',
    searchResults: [],
    queue: [],
    queueIndex: -1,
    queueHistory: [],
    // the queue's order before shuffle mixed it, so turning shuffle off puts it back
    unshuffledQueue: null,
    currentTrack: null,
    currentTrackContext: null,
    currentTrackIndexInContext: -1,
    isPlaying: false,
    isMuted: localStorage.getItem('uriel_muted') === '1',
    volume: savedVolume,
    // repeat: 'off', 'all' (the queue starts over) or 'one' (the song plays again); isRepeat means 'one'
    repeatMode: /** @type {Record<string, string>} */ ({ '1': 'one', all: 'all' })[localStorage.getItem('uriel_repeat') || ''] || 'off',
    isRepeat: localStorage.getItem('uriel_repeat') === '1',
    isShuffle: localStorage.getItem('uriel_shuffle') === '1',
    isAutoRemix: false,
    myWaveActive: false,
    _isNaturalEnding: false,
    _skipRecordedFor: null,
    isRightPanelOpen: false,
    drawerTab: 'now',
    lyricsMode: 'line',
    uiScale: savedScale,
    activePresetId: soundPersistenceEnabled ? (localStorage.getItem('uriel_active_preset') || 'p_default') : 'p_default',
    themeMode: localStorage.getItem('uriel_theme_mode') || 'dark',
    paletteStyle: localStorage.getItem('uriel_palette_style') || 'classic',
    meshBrightness: parseInt(localStorage.getItem('uriel_mesh_brightness') || '100', 10),
    themeAccent: localStorage.getItem('uriel_theme_accent') || '#6750A4',
    themeIntensity: parseInt(localStorage.getItem('uriel_theme_intensity') || '0'),
    // one of SITE_THEMES ('' = none: the palette comes from the accent alone). Never chosen yet: Halloween Glow
    siteTheme: localStorage.getItem('uriel_site_theme') ?? 'halloween',
    themeBrightness: parseInt(localStorage.getItem('uriel_theme_brightness') || '50'),
    trEnabled: localStorage.getItem('uriel_tr_enabled') === 'true',
    trLang: localStorage.getItem('uriel_tr_lang') || 'en',
    trAuto: localStorage.getItem('uriel_tr_auto') === 'true',
    trActive: false,
    currentTranslations: null,
    isTvKaraokeOpen: false,
                          audioSettings: savedSound.audioSettings,
                          hqEnabled: savedSound.hqEnabled,
                          hqSettings: savedSound.hqSettings,
                          vfx: { ...defaultVfx, ...safeJson('devsize_vfx', {}), bassPulse: false, particles: false, soundwaveRings: false, borderGlow: false, backdropBlur: false, crt: false, grain: false, lyricsSpotlight: false },
                          favorites: safeArray('devsize_favorites'),
                          history: safeArray('devsize_history'),
                          playlists: safeArray('devsize_playlists'),
                          customPresets: normalizedCustomPresets,
                          localTracks: [],
                          syncedLyrics: [],
                          glitchTimes: [],
                          lastGlitchedIndex: -1,
                          isGlitching: false,
                          isWindowVisible: true,
                          loadToken: 0,
                          currentAbortController: null,
                          presetToRenameId: null,
                          serverPort: 38472,
                          lastBroadcastStateKey: null,
                          lyricWordsLine: null,
                          lyricWords: [],
                          lyricSweptEl: null,
                          lyricWordKey: null,
                          syncTimeout: null,
                          scrubberDragTargetTime: undefined,
                          riffFont: localStorage.getItem('uriel_font') || 'google'
  };

  function migrateAddedAt() {
    // the same song favourited from several places (album row, player bar, search) was kept once per source (#10)
    const favorites = backfillAddedAt(dedupeFavoriteTracks(state.favorites), true);
    if (favorites !== state.favorites) {
      state.favorites = favorites;
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
    }
    let playlistsChanged = false;
    for (const pl of state.playlists) {
      if (!pl || !Array.isArray(pl.tracks)) continue;
      const tracks = backfillAddedAt(pl.tracks, false);
      if (tracks !== pl.tracks) {
        pl.tracks = tracks;
        playlistsChanged = true;
      }
    }
    if (playlistsChanged) localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
  }

  migrateAddedAt();

  applyFont(state.riffFont);

  if (window.electronAPI && window.electronAPI.getServerPort) {
    try {
      state.serverPort = await window.electronAPI.getServerPort();
    } catch (e) {
      console.warn('Failed to get server port:', e);
    }
  }

  // Settings → Storage → Song storage limit. Phones have their own row and clean-up (mobile/mobile-ui.ts).
  (() => {
    const row = document.getElementById('offline-limit-item');
    if (!row) return;
    if (document.documentElement.classList.contains('is-mobile') || !state.serverPort) { row.remove(); return; }
    const tell = (/** @type {string} */ mb, /** @type {boolean} */ apply) => fetch(`http://127.0.0.1:${state.serverPort}/api/cache-limit?mb=${mb}${apply ? '&apply=1' : ''}`, { method: 'POST' }).catch(() => {});
    const buttons = /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll('[data-limit]'));
    const show = (/** @type {string | undefined} */ mb) => buttons.forEach((b) => b.classList.toggle('active', b.dataset.limit === mb));
    const current = localStorage.getItem('uriel_cache_limit_mb') || '10240';
    show(current);
    tell(current, false);
    buttons.forEach((/** @type {HTMLElement} */ b) => b.addEventListener('click', () => {
      localStorage.setItem('uriel_cache_limit_mb', String(b.dataset.limit));
      show(b.dataset.limit);
      tell(String(b.dataset.limit), true).then(updateOfflineStorageUI);
    }));
  })();

  // other languages: what this device translated before, then whatever is still missing (English: nothing)
  I18N.connect(`http://127.0.0.1:${state.serverPort}`);

  function hexToRgb(/** @type {string} */ hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((/** @type {string} */ c) => c + c).join('');
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHsl(/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(/** @type {number} */ h, /** @type {number} */ s, /** @type {number} */ l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (/** @type {number} */ n) => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  function getAdv(/** @type {string} */ name, defaultVal = true) {
    const val = localStorage.getItem(`uriel_adv_${name}`);
    if (val === null) return defaultVal;
    return val === 'true';
  }

  function setAdv(/** @type {string} */ name, /** @type {boolean} */ boolVal) {
    localStorage.setItem(`uriel_adv_${name}`, boolVal ? 'true' : 'false');
  }

  // off or on as chosen in Settings; never chosen: the system's "Reduce motion" (from Riff 43.2)
  function systemPrefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  function applyReducedMotionSetting() {
    const reduced = getAdv('reduce_motion', systemPrefersReducedMotion());
    document.documentElement.classList.toggle('force-reduced-motion', reduced);
  }

  // ---- the theme palette and the website themes (app/themePalette.js) ----
  const themePalettePart = /** @type {UrielThemePalettePart} */ ({});
  window.UrielApp.themePalette({ getAdv, hexToRgb, hslToHex, mixHex, relLuminance, rgbToHsl, state }, themePalettePart);
  const { activeSiteTheme, generateM3Palette } = themePalettePart;
  const PALETTE_STYLES = themePalettePart.PALETTE_STYLES;
  const SITE_THEMES = themePalettePart.SITE_THEMES;

  // playback flags the parts in shared/app/ read and set too, so they live in one object passed to them
  const playback = {
    // the playing song is fading out for Crossfade, and the next one should fade in when it starts
    crossfadeTriggered: false,
    crossfadeFadeInPending: false,
    // the progress bar's knob is being dragged
    isDraggingScrubber: false,
    // bumped when another song starts, so an album still being looked up stops queueing itself
    albumRunId: 0,
    // the hls.js player of a song that streams as HLS
    /** @type {UrielHls | null} */
    hls: null,
  };

  // the visualizers' drawing state, which the player and Settings change too (the drawing is in app/visualizer.js)
  const viz = {
    /** @type {number | null} */
    animationFrameId: null,
    // the paused visualizer was drawn once and needs no more frames until something changes
    hasDrawnPausedFrame: false,
    // Settings → frame rate, read once here rather than on every frame (its buttons update it): 60 unless Native (0)
    // was chosen; drawing at 165 fps costs a lot and looks the same
    userFpsCap: parseInt(localStorage.getItem('uriel_fps_cap') || '60', 10) || 0,
    // the wide visualizer behind the player bar draws one liquid wave instead of bars
    connected: localStorage.getItem('uriel_viz_connected') === '1',
  };
  let cachedPrimaryColor = '';
  let cachedDimColor = '';
  let vizFrameTimer = 0;
  // Asking for a frame and then skipping it still makes the browser produce one on every refresh of a fast screen,
  // so a capped loop waits on a timer first. The timer ends a little early to catch the frame the cap wants: rAF
  // then lands on the next refresh, and a 60 Hz screen doesn't drop to every other frame.
  /** @param {FrameRequestCallback} callback @param {number} fps */
  function scheduleVizFrame(callback, fps) {
    if (!fps) return requestAnimationFrame(callback);
    vizFrameTimer = window.setTimeout(() => {
      vizFrameTimer = 0;
      viz.animationFrameId = requestAnimationFrame(callback);
    }, Math.max(0, 1000 / fps - 7));
    return -1;
  }
  function cancelVizFrame() {
    if (vizFrameTimer) clearTimeout(vizFrameTimer);
    vizFrameTimer = 0;
    if (viz.animationFrameId) cancelAnimationFrame(viz.animationFrameId);
    viz.animationFrameId = null;
  }
  function refreshCachedThemeColors() {
    const rootStyle = getComputedStyle(document.documentElement);
    cachedPrimaryColor = rootStyle.getPropertyValue('--md-sys-color-primary').trim() || '#6750A4';
    cachedDimColor = rootStyle.getPropertyValue('--md-sys-color-on-surface').trim() || '#E6E0E9';
    viz.hasDrawnPausedFrame = false;
  }
  // the theme's primary colour, read from the page the first time it's needed
  function primaryColor() {
    if (!cachedPrimaryColor) refreshCachedThemeColors();
    return cachedPrimaryColor;
  }
  function dimColor() {
    if (!cachedPrimaryColor) refreshCachedThemeColors();
    return cachedDimColor;
  }

  const coverAnalysisCache = new Map();
  // drop the oldest entries of an in-memory cache past n, so long sessions don't grow without end
  function capMap(/** @type {Map<unknown, unknown>} */ m, /** @type {number} */ n) { while (m.size > n) m.delete(m.keys().next().value); }
  // Interface opacity when it was never set: panels mostly solid, so text stays readable over busy backgrounds and
  // album colours (Riff's 20% made every panel 80% see-through). Menus and dialogs are solid whatever it is (styles.css).
  const DEFAULT_UI_ALPHA = '85';

  function mixHex(/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ t) {
    const c1 = hexToRgb(a);
    const c2 = hexToRgb(b);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const bl = Math.round(c1.b + (c2.b - c1.b) * t);
    return '#' + [r, g, bl].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
  }
  function relLuminance(/** @type {string} */ hex) {
    const c = hexToRgb(hex);
    const f = (/** @type {number} */ v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  const el = {
    btnMinimize: /** @type {HTMLButtonElement} */ (document.getElementById('btn-minimize')),
                          btnMaximize: /** @type {HTMLButtonElement} */ (document.getElementById('btn-maximize')),
                          btnClose: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close')),

                          searchInput: /** @type {HTMLInputElement} */ (document.getElementById('search-input')),
                          searchClearBtn: /** @type {HTMLButtonElement} */ (document.getElementById('search-clear-btn')),
                          searchIconBtn: /** @type {HTMLButtonElement} */ (document.getElementById('search-icon-btn')),
                          platformYt: /** @type {HTMLButtonElement} */ (document.getElementById('platform-yt')),
                          platformYtm: /** @type {HTMLButtonElement} */ (document.getElementById('platform-ytm')),
                          platformSc: /** @type {HTMLButtonElement} */ (document.getElementById('platform-sc')),

                          navActiveIndicator: /** @type {HTMLElement} */ (document.getElementById('nav-active-indicator')),
                          navDiscover: /** @type {HTMLButtonElement} */ (document.getElementById('nav-discover')),
                          navFavorites: /** @type {HTMLButtonElement} */ (document.getElementById('nav-favorites')),
                          navAlbums: /** @type {HTMLButtonElement} */ (document.getElementById('nav-albums')),
                          navLocal: /** @type {HTMLButtonElement} */ (document.getElementById('nav-local')),
                          navHistory: /** @type {HTMLButtonElement} */ (document.getElementById('nav-history')),
                          navQueue: /** @type {HTMLElement} */ (document.getElementById('nav-queue')),
                          navSettings: /** @type {HTMLButtonElement} */ (document.getElementById('nav-settings')),
                          favoritesCount: /** @type {HTMLElement} */ (document.getElementById('favorites-count')),
                          localCount: /** @type {HTMLElement} */ (document.getElementById('local-count')),
                          queueCount: /** @type {HTMLElement} */ (document.getElementById('queue-count')),

                          presetsContainer: /** @type {HTMLElement} */ (document.getElementById('presets-container')),
                          btnSavePresetDialog: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-preset-dialog')),
                          savePresetModal: /** @type {HTMLElement} */ (document.getElementById('save-preset-modal')),
                          newPresetName: /** @type {HTMLInputElement} */ (document.getElementById('new-preset-name')),
                          btnCancelPreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-preset')),
                          btnConfirmSavePreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-save-preset')),

                          renamePresetModal: /** @type {HTMLElement} */ (document.getElementById('rename-preset-modal')),
                          renamePresetName: /** @type {HTMLInputElement} */ (document.getElementById('rename-preset-name')),
                          btnCancelRenamePreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-rename-preset')),
                          btnConfirmRenamePreset: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-rename-preset')),

                          playlistsList: /** @type {HTMLElement} */ (document.getElementById('playlists-list')),
                          btnNewPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-new-playlist')),

                          viewDiscover: /** @type {HTMLElement} */ (document.getElementById('view-discover')),
                          viewFavorites: /** @type {HTMLElement} */ (document.getElementById('view-favorites')),
                          viewAlbums: /** @type {HTMLElement} */ (document.getElementById('view-albums')),
                          viewLocal: /** @type {HTMLElement} */ (document.getElementById('view-local')),
                          viewHistory: /** @type {HTMLElement} */ (document.getElementById('view-history')),
                          viewQueue: /** @type {HTMLElement} */ (document.getElementById('view-queue')),
                          viewPlaylistDetail: /** @type {HTMLElement} */ (document.getElementById('view-playlist-detail')),
                          viewAlbum: /** @type {HTMLElement} */ (document.getElementById('view-album')),
                          viewArtist: /** @type {HTMLElement} */ (document.getElementById('view-artist')),
                          viewSettings: /** @type {HTMLElement} */ (document.getElementById('view-settings')),

                          btnBackAlbum: /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-album')),
                          albumDetailCover: /** @type {HTMLElement} */ (document.getElementById('album-detail-cover')),
                          albumDetailTitle: /** @type {HTMLElement} */ (document.getElementById('album-detail-title')),
                          albumDetailArtist: /** @type {HTMLButtonElement} */ (document.getElementById('album-detail-artist')),
                          albumDetailCount: /** @type {HTMLElement} */ (document.getElementById('album-detail-count')),
                          btnPlayAlbum: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-album')),
                          albumTracksList: /** @type {HTMLElement} */ (document.getElementById('album-tracks-list')),

                          artistHero: /** @type {HTMLElement} */ (document.getElementById('artist-hero')),
                          artistHeroImg: /** @type {HTMLImageElement} */ (document.getElementById('artist-hero-img')),
                          artistFansLine: /** @type {HTMLElement} */ (document.getElementById('artist-fans-line')),
                          btnBackArtist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-artist')),
                          artistVerifiedBadge: /** @type {HTMLElement} */ (document.getElementById('artist-verified-badge')),
                          artistProfileName: /** @type {HTMLElement} */ (document.getElementById('artist-profile-name')),
                          artistProfileBio: /** @type {HTMLElement} */ (document.getElementById('artist-profile-bio')),
                          btnPlayArtistTracks: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-artist-tracks')),
                          artistTracksCount: /** @type {HTMLElement} */ (document.getElementById('artist-tracks-count')),
                          artistTracksList: /** @type {HTMLElement} */ (document.getElementById('artist-tracks-list')),

                          discoverEmpty: /** @type {HTMLElement} */ (document.getElementById('discover-empty')),
                          searchResultsContainer: /** @type {HTMLElement} */ (document.getElementById('search-results-container')),
                          searchTracksList: /** @type {HTMLElement} */ (document.getElementById('search-tracks-list')),
                          suggestionChips: /** @type {HTMLElement} */ (document.getElementById('suggestion-chips')),

                          favoritesTracksList: /** @type {HTMLElement} */ (document.getElementById('favorites-tracks-list')),
                          favoritesSearchInput: /** @type {HTMLInputElement} */ (document.getElementById('favorites-search-input')),
                          favoritesSort: /** @type {HTMLSelectElement} */ (document.getElementById('favorites-sort')),
                          playlistSearchInput: /** @type {HTMLInputElement} */ (document.getElementById('playlist-search-input')),
                          playlistSort: /** @type {HTMLSelectElement} */ (document.getElementById('playlist-sort')),
                          favoritesSubtitle: /** @type {HTMLElement} */ (document.getElementById('favorites-subtitle')),
                          localTracksList: /** @type {HTMLElement} */ (document.getElementById('local-tracks-list')),
                          localSearchInput: /** @type {HTMLInputElement} */ (document.getElementById('local-search-input')),
                          localSubtitle: /** @type {HTMLElement} */ (document.getElementById('local-subtitle')),
                          btnAddLocalFiles: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-local-files')),
                          btnAddLocalFilesEmpty: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-local-files-empty')),
                          historyTracksList: /** @type {HTMLElement} */ (document.getElementById('history-tracks-list')),
                          btnClearHistory: /** @type {HTMLButtonElement} */ (document.getElementById('btn-clear-history')),
                          queueTracksList: /** @type {HTMLElement} */ (document.getElementById('queue-tracks-list')),
                          btnClearQueue: /** @type {HTMLButtonElement} */ (document.getElementById('btn-clear-queue')),
                          playlistTracksList: /** @type {HTMLElement} */ (document.getElementById('playlist-tracks-list')),
                          playlistDetailTitle: /** @type {HTMLElement} */ (document.getElementById('playlist-detail-title')),
                          playlistDetailCount: /** @type {HTMLElement} */ (document.getElementById('playlist-detail-count')),
                          btnBackPlaylists: /** @type {HTMLButtonElement} */ (document.getElementById('btn-back-playlists')),
                          btnPlayPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-playlist')),
                          btnDeletePlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-delete-playlist')),

                          rightPanel: /** @type {HTMLElement} */ (document.getElementById('right-panel')),
                          btnCloseRightPanel: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-right-panel')),
                          btnToggleLyricsPanel: /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle-lyrics-panel')),
                          btnLyricsMode: /** @type {HTMLButtonElement} */ (document.getElementById('btn-lyrics-mode')),
                          coverContainer: /** @type {HTMLElement} */ (document.getElementById('cover-container')),
                          rightPanelArtworkBox: /** @type {HTMLElement} */ (document.getElementById('right-panel-artwork-box')),
                          rightPanelCover: /** @type {HTMLImageElement} */ (document.getElementById('right-panel-cover')),
                          rightPanelFallback: /** @type {HTMLElement} */ (document.getElementById('right-panel-fallback')),
                          rightPanelTitle: /** @type {HTMLElement} */ (document.getElementById('right-panel-title')),
                          rightPanelArtist: /** @type {HTMLElement} */ (document.getElementById('right-panel-artist')),
                          lyricsContainer: /** @type {HTMLElement} */ (document.getElementById('lyrics-container')),
                          lyricsHint: /** @type {HTMLElement} */ (document.getElementById('lyrics-hint')),
                          btnTranslateLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-translate-lyrics')),
                          btnTrEnabled: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tr-enabled')),
                          selectTrLang: /** @type {HTMLSelectElement} */ (document.getElementById('select-tr-lang')),
                          btnTrAuto: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tr-auto')),
                          btnTvKaraoke: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tv-karaoke')),
                          tvKaraoke: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke')),
                          tvBg: /** @type {HTMLElement} */ (document.getElementById('tv-bg')),
                          tvCover: /** @type {HTMLImageElement} */ (document.getElementById('tv-cover')),
                          tvKaraokeContent: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke-content')),
                          tvKaraokeClose: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-tv-karaoke')),
                          tvKaraokeTitle: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke-title')),
                          tvKaraokeArtist: /** @type {HTMLElement} */ (document.getElementById('tv-karaoke-artist')),
                          btnTvkFav: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-fav')),
                          tvkFavIcon: /** @type {HTMLElement} */ (document.getElementById('tvk-fav-icon')),
                          btnTvkShuffle: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-shuffle')),
                          btnTvkRepeat: /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-repeat')),
                          tvkVolumeSlider: /** @type {HTMLInputElement} */ (document.getElementById('tvk-volume-slider')),

                          playbar: /** @type {HTMLElement} */ (document.getElementById('playbar')),
                          playbarArtwork: /** @type {HTMLImageElement} */ (document.getElementById('playbar-artwork')),
                          artworkFallback: /** @type {HTMLElement} */ (document.getElementById('artwork-fallback')),
                          playbarTitle: /** @type {HTMLElement} */ (document.getElementById('playbar-title')),
                          playbarArtist: /** @type {HTMLElement} */ (document.getElementById('playbar-artist')),
                          btnToggleFav: /** @type {HTMLButtonElement} */ (document.getElementById('btn-toggle-fav')),
                          favIcon: /** @type {HTMLElement} */ (document.getElementById('fav-icon')),
                          btnShuffle: /** @type {HTMLButtonElement} */ (document.getElementById('btn-shuffle')),
                          btnPrev: /** @type {HTMLButtonElement} */ (document.getElementById('btn-prev')),
                          btnPlayPause: /** @type {HTMLButtonElement} */ (document.getElementById('btn-play-pause')),
                          playIcon: /** @type {HTMLElement} */ (document.getElementById('play-icon')),
                          pauseIcon: /** @type {HTMLElement} */ (document.getElementById('pause-icon')),
                          playbarSpinner: /** @type {HTMLElement} */ (document.getElementById('playbar-spinner')),
                          btnNext: /** @type {HTMLButtonElement} */ (document.getElementById('btn-next')),
                          btnRepeat: /** @type {HTMLButtonElement} */ (document.getElementById('btn-repeat')),

                          timeCurrent: /** @type {HTMLElement} */ (document.getElementById('time-current')),
                          timeDuration: /** @type {HTMLElement} */ (document.getElementById('time-duration')),
                          scrubberTrack: /** @type {HTMLElement} */ (document.getElementById('scrubber-track')),

                          visualizerCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('visualizer-canvas')),
                          btnOpenSettings: /** @type {HTMLButtonElement} */ (document.getElementById('btn-open-settings')),
                          settingsModifiedDot: /** @type {HTMLElement} */ (document.getElementById('settings-modified-dot')),
                          btnVolumeMute: /** @type {HTMLButtonElement} */ (document.getElementById('btn-volume-mute')),
                          volumeIcon: /** @type {HTMLElement} */ (document.getElementById('volume-icon')),
                          volumeMutedIcon: /** @type {HTMLElement} */ (document.getElementById('volume-muted-icon')),
                          volumeSlider: /** @type {HTMLInputElement} */ (document.getElementById('volume-slider')),

                          downloadModal: /** @type {HTMLElement} */ (document.getElementById('download-modal')),
                          btnCloseDownloadModal: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-download-modal')),
                          btnCancelDownload: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-download')),
                          btnConfirmDownload: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-download')),
                          downloadSpinner: /** @type {HTMLElement} */ (document.getElementById('download-spinner')),
                          downloadBtnText: /** @type {HTMLElement} */ (document.getElementById('download-btn-text')),
                          downloadPreviewThumb: /** @type {HTMLImageElement} */ (document.getElementById('download-preview-thumb')),
                          downloadPreviewFallback: /** @type {HTMLElement} */ (document.getElementById('download-preview-fallback')),
                          downloadPreviewTitle: /** @type {HTMLElement} */ (document.getElementById('download-preview-title')),
                          downloadPreviewArtist: /** @type {HTMLElement} */ (document.getElementById('download-preview-artist')),
                          btnPlaybarMore: /** @type {HTMLButtonElement} */ (document.getElementById('btn-playbar-more')),

                          audioSettingsModal: /** @type {HTMLElement} */ (document.getElementById('audio-settings-modal')),
                          btnCloseSettings: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-settings')),
                          sleepTimerStatus: /** @type {HTMLElement} */ (document.getElementById('sleep-timer-status')),
                          btnResetAudio: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-audio')),
                          commandPalette: /** @type {HTMLElement} */ (document.getElementById('command-palette')),
                          commandPaletteInput: /** @type {HTMLInputElement} */ (document.getElementById('command-palette-input')),
                          commandPaletteResults: /** @type {HTMLElement} */ (document.getElementById('command-palette-results')),
                          btnDedupePlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-dedupe-playlist')),
                          btnDedupePlaylistLabel: /** @type {HTMLElement} */ (document.getElementById('btn-dedupe-playlist-label')),

                          btnToggleHqAudio: /** @type {HTMLButtonElement} */ (document.getElementById('toggle-hq-audio')),
                          hqEnhancerCard: document.querySelector('.hq-enhancer-card'),
                          hqPanelWrapper: /** @type {HTMLElement} */ (document.getElementById('hq-panel-wrapper')),
                          hqEngineSelect: /** @type {HTMLSelectElement} */ (document.getElementById('hq-engine-select')),
                          sliderHqVocal: /** @type {HTMLInputElement} */ (document.getElementById('slider-hq-vocal')),
                          valHqVocal: /** @type {HTMLElement} */ (document.getElementById('val-hq-vocal')),
                          sliderHqAir: /** @type {HTMLInputElement} */ (document.getElementById('slider-hq-air')),
                          valHqAir: /** @type {HTMLElement} */ (document.getElementById('val-hq-air')),
                          sliderHqBass: /** @type {HTMLInputElement} */ (document.getElementById('slider-hq-bass')),
                          valHqBass: /** @type {HTMLElement} */ (document.getElementById('val-hq-bass')),
                          hqPresetChips: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.hq-preset-chip')),

                          sliderSpeed: /** @type {HTMLInputElement} */ (document.getElementById('slider-speed')),
                          valSpeed: /** @type {HTMLElement} */ (document.getElementById('val-speed')),
                          sliderSpeedPitch: /** @type {HTMLInputElement} */ (document.getElementById('slider-speed-pitch')),
                          valSpeedPitch: /** @type {HTMLElement} */ (document.getElementById('val-speed-pitch')),
                          sliderPitch: /** @type {HTMLInputElement} */ (document.getElementById('slider-pitch')),
                          valPitch: /** @type {HTMLElement} */ (document.getElementById('val-pitch')),
                          sliderReverb: /** @type {HTMLInputElement} */ (document.getElementById('slider-reverb')),
                          valReverb: /** @type {HTMLElement} */ (document.getElementById('val-reverb')),
                          sliderDistortion: /** @type {HTMLInputElement} */ (document.getElementById('slider-distortion')),
                          valDistortion: /** @type {HTMLElement} */ (document.getElementById('val-distortion')),
                          sliderGain: /** @type {HTMLInputElement} */ (document.getElementById('slider-gain')),
                          valGain: /** @type {HTMLElement} */ (document.getElementById('val-gain')),
                          sliderEcho: /** @type {HTMLInputElement} */ (document.getElementById('slider-echo')),
                          valEcho: /** @type {HTMLElement} */ (document.getElementById('val-echo')),
                          sliderEqLow: /** @type {HTMLInputElement} */ (document.getElementById('slider-eq-low')),
                          valEqLow: /** @type {HTMLElement} */ (document.getElementById('val-eq-low')),
                          sliderEqMid: /** @type {HTMLInputElement} */ (document.getElementById('slider-eq-mid')),
                          valEqMid: /** @type {HTMLElement} */ (document.getElementById('val-eq-mid')),
                          sliderEqHigh: /** @type {HTMLInputElement} */ (document.getElementById('slider-eq-high')),
                          valEqHigh: /** @type {HTMLElement} */ (document.getElementById('val-eq-high')),
                          eqBands: /** @type {HTMLElement} */ (document.getElementById('eq-bands')),
                          btnResetEqBands: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-eq-bands')),

                          sliderScale: /** @type {HTMLInputElement} */ (document.getElementById('settings-slider-scale') || document.getElementById('slider-scale')),
                          valScale: /** @type {HTMLElement} */ (document.getElementById('settings-val-scale') || document.getElementById('val-scale')),
                          sliderFontScale: /** @type {HTMLInputElement} */ (document.getElementById('slider-font-scale')),
                          valFontScale: /** @type {HTMLElement} */ (document.getElementById('val-font-scale')),
                          sliderCornerRadius: /** @type {HTMLInputElement} */ (document.getElementById('slider-corner-radius')),
                          valCornerRadius: /** @type {HTMLElement} */ (document.getElementById('val-corner-radius')),
                          sliderUiAlpha: /** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')),
                          valUiAlpha: /** @type {HTMLElement} */ (document.getElementById('val-ui-alpha')),
                          btnResetUiAlpha: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-ui-alpha')),
                          sliderTextAlpha: /** @type {HTMLInputElement} */ (document.getElementById('slider-text-alpha')),
                          valTextAlpha: /** @type {HTMLElement} */ (document.getElementById('val-text-alpha')),
                          btnResetTextAlpha: /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-text-alpha')),
                          themeModeBtns: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.theme-mode-btn[data-theme-mode]')),
                          themeSwatches: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.theme-swatch')),
                          customColorInput: /** @type {HTMLInputElement} */ (document.getElementById('settings-custom-color-input')),
                          sliderHue: /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-hue')),
                          valHue: /** @type {HTMLElement} */ (document.getElementById('val-theme-hue')),
                          sliderIntensity: /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-intensity')),
                          valIntensity: /** @type {HTMLElement} */ (document.getElementById('val-theme-intensity')),
                          sliderBrightness: /** @type {HTMLInputElement} */ (document.getElementById('slider-theme-brightness')),
                          valBrightness: /** @type {HTMLElement} */ (document.getElementById('val-theme-brightness')),

                          createPlaylistModal: /** @type {HTMLElement} */ (document.getElementById('create-playlist-modal')),
                          newPlaylistInput: /** @type {HTMLInputElement} */ (document.getElementById('new-playlist-input')),
                          btnCancelNewPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-new-playlist')),
                          btnConfirmNewPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-new-playlist')),

                          addToPlaylistModal: /** @type {HTMLElement} */ (document.getElementById('add-to-playlist-modal')),
                          playlistPickList: /** @type {HTMLElement} */ (document.getElementById('playlist-pick-list')),
                          btnCancelAddPlaylist: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-add-playlist')),

                          // Android: a stand-in that plays through the native player (mobile/native-audio.ts)
                          nativeAudio: (window.UrielAudioElement && window.UrielAudioElement(/** @type {HTMLAudioElement} */ (document.getElementById('native-audio')))) || document.getElementById('native-audio'),

                          btnAddCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-add-custom-lyrics')),
                          btnSyncLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-sync-lyrics')),
                          customLyricsModal: /** @type {HTMLElement} */ (document.getElementById('custom-lyrics-modal')),
                          customLyricsTextarea: /** @type {HTMLTextAreaElement} */ (document.getElementById('custom-lyrics-textarea')),
                          customLyricsTrackTitle: /** @type {HTMLElement} */ (document.getElementById('custom-lyrics-track-title')),
                          customLyricsTrackArtist: /** @type {HTMLElement} */ (document.getElementById('custom-lyrics-track-artist')),
                          btnCloseCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-custom-lyrics')),
                          btnCancelCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-custom-lyrics')),
                          btnSaveCustomLyrics: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-custom-lyrics')),
                          syncModeOverlay: /** @type {HTMLElement} */ (document.getElementById('sync-mode-overlay')),
                          syncModeLyrics: /** @type {HTMLElement} */ (document.getElementById('sync-mode-lyrics')),
                          syncProgressText: /** @type {HTMLElement} */ (document.getElementById('sync-progress-text')),
                          btnRestartSync: /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart-sync')),
                          btnSaveSync: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-sync')),
                          btnCancelSync: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-sync')),

                          btnEditCurrentTrack: /** @type {HTMLButtonElement} */ (document.getElementById('btn-edit-current-track')),
                          renameTrackModal: /** @type {HTMLElement} */ (document.getElementById('rename-track-modal')),
                          inputRenameTitle: /** @type {HTMLInputElement} */ (document.getElementById('rename-track-title')),
                          inputRenameArtist: /** @type {HTMLInputElement} */ (document.getElementById('rename-track-artist')),
                          btnCancelRenameTrack: /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-rename-track')),
                          btnConfirmRenameTrack: /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-rename-track')),

                          btnRefreshVibe: /** @type {HTMLButtonElement} */ (document.getElementById('btn-refresh-vibe'))
  };
  // ---- the system media controls, the server's play state and Discord (app/mediaSession.js) ----
  const mediaSessionPart = /** @type {UrielMediaSessionPart} */ ({});
  window.UrielApp.mediaSession({ el, getTrackThumbUrl, pauseSmooth, playNext, playPrev, state, togglePlayPause, updateSyncedLyricsHighlight }, mediaSessionPart);
  const { sendStateToServer } = mediaSessionPart;
  const { getMediaArtwork, updateMediaPositionState, updateDiscordPresence, updateMediaSession, handleMediaCommand, registerMediaActions, discordPresenceOn } = mediaSessionPart;

  // ---- "Available offline" marks (app/offline.js) ----
  const offlinePart = /** @type {UrielOfflinePart} */ ({});
  window.UrielApp.offline({ capMap, el, getTrackCanonicalId, state }, offlinePart);
  const { offlineKey, offlineState, checkOffline, offlineChanged } = offlinePart;
  const OFFLINE_ICON = offlinePart.OFFLINE_ICON;

  // ---- painting the theme: cover colours, the mesh, the cover background, light and dark (app/theme.js) ----
  const themePart = /** @type {UrielThemePart} */ ({});
  window.UrielApp.theme({ activeSiteTheme, coverAnalysisCache, currentUiAlpha, DEFAULT_UI_ALPHA, el, generateM3Palette, getAdv, getCoverDominantColors, getTrackThumbUrl, hexToRgb, hslToHex, mixHex, refreshCachedThemeColors, relLuminance, rgbToHsl, setUiAlphaViaSlider, state, syncSiteThemeCards }, themePart);
  const { smoothThemeSwap } = themePart;
  const { analyzeCover, setCoverBg, registerFx, applyFxClip, updateFxVisibility, refreshMeshCover, redrawMesh, updateMeshGradient, updateThemeFromState, effectiveMode } = themePart;


  // ---- Download dialog → "Trim best part": keep only part of a song (app/trim.js) ----
  const trimPart = /** @type {UrielTrimPart} */ ({});
  window.UrielApp.trim({ T, el, getTrackCanonicalId, getTrackToDownload, isSameTrack, playNext, playSmooth, playTrack, playback, primaryColor, queueFinished, safeJson, showToast, state }, trimPart);
  const { getTrackTrim, enforceTrackTrim, showDownloadPane, prepareTrimPane, forgetTrackTrims } = trimPart;

  /** @type {const} */ (['Vocal', 'Air', 'Bass']).forEach(type => {
    const slider = el[/** @type {const} */ (`sliderHq${type}`)];
    if (slider) {
      slider.min = '-50';
      slider.max = '50';
      slider.value = state.hqSettings[type.toLowerCase()];
    }
  });

  if (el.sliderScale) el.sliderScale.value = String(state.uiScale);
  if (el.valScale) el.valScale.textContent = `${state.uiScale}%`;

  const savedFontScale = localStorage.getItem('uriel_font_scale') || '100';
  const fontVal = parseInt(savedFontScale, 10) || 100;
  if (el.sliderFontScale) el.sliderFontScale.value = fontVal.toString();
  if (el.valFontScale) el.valFontScale.textContent = `${fontVal}%`;
  document.documentElement.style.setProperty('--font-scale', ((fontVal / 100) * 0.95 * 1.25).toString());

  const savedRadius = localStorage.getItem('uriel_corner_radius') || '16';
  if (el.sliderCornerRadius) el.sliderCornerRadius.value = savedRadius;
  if (el.valCornerRadius) el.valCornerRadius.textContent = savedRadius === '16' ? 'Default' : `${savedRadius}px`;
  document.documentElement.style.setProperty('--md-shape-corner-l', `${savedRadius}px`);
  document.documentElement.style.setProperty('--md-shape-corner-m', `${Math.max(0, parseInt(savedRadius) - 4)}px`);

  applyReducedMotionSetting();

  const savedBannerBlur = parseInt(localStorage.getItem('uriel_banner_blur') || '3', 10);
  const savedBannerOpacity = parseInt(localStorage.getItem('uriel_banner_opacity') || '100', 10);
  const savedBannerFade = parseInt(localStorage.getItem('uriel_banner_fade') || '38', 10);

  document.documentElement.style.setProperty('--banner-blur', `${savedBannerBlur}px`);
  document.documentElement.style.setProperty('--banner-opacity', `${savedBannerOpacity / 100}`);
  document.documentElement.style.setProperty('--banner-fade-base', `${savedBannerFade}%`);

  function applyUiOpacity() {
    const rawUi = parseInt(localStorage.getItem('uriel_ui_alpha') || DEFAULT_UI_ALPHA, 10);
    const rawText = parseInt(localStorage.getItem('uriel_text_alpha') || '100', 10);
    const uiAlpha = Math.max(20, Math.min(100, isNaN(rawUi) ? 100 : rawUi));
    const textAlpha = Math.max(1, Math.min(100, isNaN(rawText) ? 100 : rawText));

    document.documentElement.style.setProperty('--ui-alpha', `${uiAlpha}%`);
    document.documentElement.style.setProperty('--text-alpha', `${textAlpha}%`);

    if (el.sliderUiAlpha) el.sliderUiAlpha.value = String(uiAlpha);
    if (el.valUiAlpha) el.valUiAlpha.textContent = `${uiAlpha}%`;
    if (el.sliderTextAlpha) el.sliderTextAlpha.value = String(textAlpha);
    if (el.valTextAlpha) el.valTextAlpha.textContent = `${textAlpha}%`;
  }

  applyUiOpacity();

  updateThemeFromState();

  if (state.themeMode !== 'auto') {
    if (el.sliderIntensity) el.sliderIntensity.value = String(state.themeIntensity);
    if (el.valIntensity) el.valIntensity.textContent = state.themeIntensity + '%';
    if (el.sliderBrightness) el.sliderBrightness.value = String(state.themeBrightness);
    if (el.valBrightness) el.valBrightness.textContent = state.themeBrightness + '%';
  }

  const sidebarEl = document.querySelector('.sidebar');

  // ---- the side rail's drawer: presets and playlists (app/railDrawer.js) ----
  window.UrielApp.railDrawer({ el, renderPlaylistsList, renderPresets, sidebarEl, updatePresetsFade });

  const resumeAudioOnce = () => {
    initAudioContext();
    document.removeEventListener('click', resumeAudioOnce);
    document.removeEventListener('keydown', resumeAudioOnce);
  };
  document.addEventListener('click', resumeAudioOnce);
  document.addEventListener('keydown', resumeAudioOnce);

  // ---- press ripples and holding a song for its menu (app/touch.js) ----
  window.UrielApp.touch({ el });

  // ---- renaming the playing song (app/renameTrack.js) ----
  window.UrielApp.renameTrack({ closeModal, el, openModal, renderQueueView, sendStateToServer, showToast, state, Tm, updateMediaSession, updateNowPlayingUI });

  const audioEngine = new window.UrielAudioEngine();
  window.audioEngine = audioEngine;
  // Paused on a phone with the app in the background, the context is left running: a resume() there may not
  // settle until the app is opened again, so play from the lock screen or the notification stayed silent (#24)
  audioEngine.keepRunning = () => !!(document.hidden && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  viz.animationFrameId = null;

  let levelAvgDb = -120;
  function normalizeEnabled() { return localStorage.getItem('uriel_audio_normalize') === '1'; }
  function resetLevelWatcher() { levelAvgDb = -120; if (audioEngine && audioEngine.setNormalizeGainDb) audioEngine.setNormalizeGainDb(0); }
  // the phone app has no Web Audio graph (see mobile-ui.ts), so nothing to measure there
  const isPhoneApp = document.documentElement.classList.contains('is-mobile');

  // ---- yt-dlp and ffmpeg: checking for them and installing them (app/tools.js) ----
  const toolsPart = /** @type {UrielToolsPart} */ ({});
  window.UrielApp.tools({ I18N, closeModal, createWavyProgress, isPhoneApp, openModal, state }, toolsPart);
  const { checkToolsStatus } = toolsPart;
  const { toolsReady } = toolsPart;
  checkToolsStatus(true);
  // when to look up the next song: phones download it whole, so halfway through; the computer only needs
  // a stream URL (a few seconds of yt-dlp), so in the last 45 seconds (#16)
  function nextPrefetchDue(/** @type {number} */ cur, /** @type {number} */ dur) {
    if (!(dur > 0) || !(cur >= 0)) return false;
    // the computer looks the next song up once this one has played 10 s (a quick skip costs nothing), so
    // it starts at once (Riff 44); phones download whole songs, so they wait until halfway
    return isPhoneApp ? cur / dur > 0.5 : cur >= 10 || dur - cur <= 45;
  }
  window.addEventListener('uriel:storage-full', () => showToast(Tm('Storage is full: some changes could not be saved'), 'error'));
  // a library only some features need, added to the page the first time one asks for it
  /** @type {Record<string, Promise<void>>} */
  const scriptLoads = {};
  function loadScriptOnce(/** @type {string} */ src) {
    return scriptLoads[src] || (scriptLoads[src] = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.onload = () => resolve();
      tag.onerror = () => { delete scriptLoads[src]; tag.remove(); reject(new Error(`${src} did not load`)); };
      document.head.appendChild(tag);
    }));
  }

  // <audio>/<img> can't send the token header the fetch wrapper adds, so local-server media URLs carry it
  const tokenUrl = (/** @type {string} */ u) => {
    const t = window.electronAPI && window.electronAPI.serverToken;
    return t ? `${u}${u.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}` : u;
  };
  if (!isPhoneApp) setInterval(() => {
    if (!normalizeEnabled()) {
      if (levelAvgDb > -120) resetLevelWatcher();
      return;
    }
    const audio = el.nativeAudio;
    if (!audioEngine || !audioEngine.getLevelDb || !audio || audio.paused || !state.isPlaying) return;
    const db = audioEngine.getLevelDb();
    if (db > -50) {
      levelAvgDb = levelAvgDb <= -120 ? db : levelAvgDb + (db - levelAvgDb) * 0.05;
      const gainDb = Math.max(-9, Math.min(9, -17 - levelAvgDb));
      audioEngine.setNormalizeGainDb(gainDb);
    }
  }, 100);

  // ---- sound presets (app/presets.js) ----
  const presetsPart = /** @type {UrielPresetsPart} */ ({});
  function renderPresets() { return presetsPart.renderPresets(); }
  function updatePresetsFade() { return presetsPart.updatePresetsFade(); }
  window.UrielApp.presets({ applyAudioSettings, closeModal, defaultPresets, el, escapeHtml, I18N, initAudioContext, normalizePreset, openModal, persistSoundSettings, state, syncSettingsSlidersToState }, presetsPart);
  const { updateFade, saveCustomPreset, renameCustomPreset, deleteCustomPreset } = presetsPart;

  // ---- per-song speed, pitch and volume (issue #11) (app/trackAudio.js) ----
  const trackAudioPart = /** @type {UrielTrackAudioPart} */ ({});
  window.UrielApp.trackAudio({ applyAudioSettings, getTrackCanonicalId, initAudioContext, renderPresets, safeJson, showToast, state, syncSettingsSlidersToState, T, Tm }, trackAudioPart);
  const { effectiveAudioSettings, setTempoValues, onTrackAudioTrackChange } = trackAudioPart;

  syncSettingsSlidersToState();
  updateHqRouting();
  renderPresets();

  function initAudioContext() {
    // the Web Audio graph needs the real element (on Android el.nativeAudio may stand in for it)
    audioEngine.init(el.nativeAudio.webElement || el.nativeAudio);
    
    if (audioEngine.ctx && audioEngine.needsResume()) {
      audioEngine.ctx.resume().catch(() => {});
    }
    
    audioEngine.setHqEnabled(state.hqEnabled);
    audioEngine.setHqSettings(state.hqSettings);
    audioEngine.setAudioSettings(effectiveAudioSettings());
    audioEngine.setVolume(state.volume, state.isMuted);
    
    startVisualizers();
  }

  function updateHqRouting() {
    audioEngine.setHqEnabled(state.hqEnabled);
    if (el.btnToggleHqAudio) el.btnToggleHqAudio.classList.toggle('active', !!state.hqEnabled);
    if (el.hqPanelWrapper) el.hqPanelWrapper.classList.toggle('expanded', !!state.hqEnabled);
    if (el.hqEnhancerCard) el.hqEnhancerCard.classList.toggle('is-expanded', !!state.hqEnabled);
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let soundSettingsSaveTimer = null;
  function persistSoundSettings() {
    if (!soundPersistenceEnabled) return;
    if (soundSettingsSaveTimer) clearTimeout(soundSettingsSaveTimer);
    soundSettingsSaveTimer = setTimeout(() => {
      soundSettingsSaveTimer = null;
      try {
        localStorage.setItem('uriel_hq_enabled', state.hqEnabled ? '1' : '0');
        localStorage.setItem('uriel_hq_settings', JSON.stringify(state.hqSettings));
        localStorage.setItem('uriel_audio_settings', JSON.stringify(state.audioSettings));
        localStorage.setItem('uriel_active_preset', state.activePresetId || '');
      } catch (e) {
        console.warn('Failed to save sound settings', e);
      }
    }, 300);
  }

  function applyHqSettings() {
    updateHqRouting();
    audioEngine.setHqSettings(state.hqSettings);
    persistSoundSettings();
  }
  
  function applyAudioSettings() {
    audioEngine.setAudioSettings(effectiveAudioSettings());
    audioEngine.setVolume(state.volume, state.isMuted);
    audioEngine.applySettings(el.nativeAudio.webElement || el.nativeAudio);
    persistSoundSettings();
    
    if (el.settingsModifiedDot) {
      if (audioEngine.isModified()) {
        el.settingsModifiedDot.classList.remove('hidden');
      } else {
        el.settingsModifiedDot.classList.add('hidden');
      }
    }
  }


  // ---- the visualizers and the render loop (app/visualizer.js) ----
  const visualizerPart = /** @type {UrielVisualizerPart} */ ({});
  window.UrielApp.visualizer({ audioEngine, cancelVizFrame, dimColor, el, formatDuration, isPhoneApp, miniLyricsShown, nextPrefetchDue, playback, prefetchNextQueueTrack, primaryColor, scheduleVizFrame, state, updateMiniLyricsHighlight, updateSyncedLyricsHighlight, viz }, visualizerPart);
  const { startVisualizers } = visualizerPart;
  const { resizeCanvases } = visualizerPart;

  let trimTimer = 0;
  function handleVisibilityChange(/** @type {boolean} */ visible) {
    state.isWindowVisible = visible;
    syncBgVideoPlayback();
    if (audioEngine && audioEngine.setHidden) audioEngine.setHidden(!visible);
    if (!visible) {
      stopLyricsScroll();
      stopGradientLoop();
      cancelVizFrame();
      pauseCacheBars();
      document.body.classList.add('app-paused');
      document.body.classList.add('hidden-window');
      if (getAdv('trim_bg', true)) {
        clearTimeout(trimTimer);
        // wait a bit so quick alt-tabs don't throw away decoded images we're about to redraw
        trimTimer = window.setTimeout(() => {
          if (!state.isWindowVisible && window.electronAPI && window.electronAPI.trimMemory) window.electronAPI.trimMemory();
        }, 10000);
      }
    } else {
      document.body.classList.remove('app-paused');
      document.body.classList.remove('hidden-window');
      resizeCanvases();
      // the daily mixes wait while the window is hidden (#16): make them now if they're still missing
      try { if (spHomeReady && isSpotifyHome() && !readDailyMixes()) renderMadeForYou(); } catch (e) {}
      viz.hasDrawnPausedFrame = false;
      if (state.isPlaying || playback.isDraggingScrubber) startVisualizers();
      resumeCacheBars();
      if (typeof updateLyricsPadding === 'function') {
        const syncOnRestore = () => {
          updateLyricsPadding();
          state.forceSnapLyrics = true;
          state.forceLyricsScroll = true;
          state.lastActiveLyricIdx = -1;
          if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
        };
        syncOnRestore();
        requestAnimationFrame(syncOnRestore);
        setTimeout(syncOnRestore, 80);
        setTimeout(syncOnRestore, 220);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    handleVisibilityChange(!document.hidden);
  });

  if (window.electronAPI && window.electronAPI.onWindowVisibility) {
    window.electronAPI.onWindowVisibility((/** @type {boolean} */ visible) => handleVisibilityChange(visible));
  }
  // WKWebView doesn't always fire visibilitychange on lock/home; the native app-state event does
  try {
    const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (capApp && capApp.addListener) capApp.addListener('appStateChange', (/** @type {{ isActive?: boolean }} */ s) => handleVisibilityChange(!!(s && s.isActive)));
  } catch (_) {}

  function applyVisualEffects() {
    const v = state.vfx;

    if (el.coverContainer) {
      el.coverContainer.classList.toggle('vinyl-mode', !!v.vinylSpin);
      el.coverContainer.classList.toggle('spinning', !!v.vinylSpin && state.isPlaying);
    }
    document.body.classList.toggle('vfx-spotlight-on', !!v.lyricsSpotlight);
    syncVisualSettingsUI();
  }

  function syncVisualSettingsUI() {
    const v = state.vfx;
    const vfxList = [
      { id: 'vfx-pulse', key: 'bassPulse' },
      { id: 'vfx-vinyl', key: 'vinylSpin' },
      { id: 'vfx-spotlight', key: 'lyricsSpotlight' }
    ];

    vfxList.forEach(item => {
      const card = document.getElementById(`card-${item.id}`);
      const badge = document.getElementById(`badge-${item.id}`);
      const btn = document.getElementById(`toggle-${item.id}`);
      const isEnabled = v[item.key];

      if (card) card.classList.toggle('enabled', !!isEnabled);
      if (badge) badge.textContent = T(isEnabled ? 'on' : 'off');
      if (btn) {
        btn.classList.toggle('active', !!isEnabled);
        
      }
    });
  }

  const EQ_BAND_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

  function syncSettingsSlidersToState() {
    const s = effectiveAudioSettings();
    // the engine dropdown is plain markup that always said hqmusic-3, whatever engine was saved or reset to
    const engine = state.hqSettings && state.hqSettings.engine;
    if (engine) {
      if (el.hqEngineSelect) el.hqEngineSelect.value = engine;
      const opts = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#hq-engine-menu .m3-dropdown-option'));
      opts.forEach((o) => o.classList.toggle('selected', o.dataset.value === engine));
      const picked = [...opts].find(o => o.dataset.value === engine);
      const label = document.getElementById('hq-engine-label');
      if (picked && label) label.textContent = picked.textContent;
    }
    if (el.sliderSpeed) el.sliderSpeed.value = s.speed;
    if (el.valSpeed) el.valSpeed.textContent = `${s.speed.toFixed(2)}x`;

    if (el.sliderSpeedPitch) el.sliderSpeedPitch.value = s.speedPitch;
    if (el.valSpeedPitch) el.valSpeedPitch.textContent = `${s.speedPitch.toFixed(2)}x`;

    if (el.sliderPitch) el.sliderPitch.value = s.pitch;
    if (el.valPitch) el.valPitch.textContent = `${s.pitch > 0 ? '+' : ''}${s.pitch} st`;

    if (el.sliderReverb) el.sliderReverb.value = s.reverb;
    if (el.valReverb) el.valReverb.textContent = `${s.reverb}%`;

    if (el.sliderDistortion) el.sliderDistortion.value = s.distortion;
    if (el.valDistortion) el.valDistortion.textContent = `${s.distortion}%`;

    if (el.sliderGain) el.sliderGain.value = String(Math.round(s.volume * 100));
    if (el.valGain) el.valGain.textContent = `${Math.round(s.volume * 100)}%`;

    if (el.sliderEcho) el.sliderEcho.value = s.echo;
    if (el.valEcho) el.valEcho.textContent = `${s.echo}%`;

    const eq = s.eq || { low: 0, mid: 0, high: 0 };
    if (el.sliderEqLow) el.sliderEqLow.value = eq.low;
    if (el.valEqLow) el.valEqLow.textContent = `${eq.low > 0 ? '+' : ''}${eq.low} dB`;
    if (el.sliderEqMid) el.sliderEqMid.value = eq.mid;
    if (el.valEqMid) el.valEqMid.textContent = `${eq.mid > 0 ? '+' : ''}${eq.mid} dB`;
    if (el.sliderEqHigh) el.sliderEqHigh.value = eq.high;
    if (el.valEqHigh) el.valEqHigh.textContent = `${eq.high > 0 ? '+' : ''}${eq.high} dB`;

    const bands = s.eqBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (el.eqBands) {
      const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (el.eqBands.querySelectorAll('.eq-band-range'));
      const valLabels = el.eqBands.querySelectorAll('.eq-band-val');
      inputs.forEach((input, i) => {
        const v = bands[i] !== undefined ? bands[i] : 0;
        input.value = String(v);
        if (valLabels[i]) valLabels[i].textContent = `${v > 0 ? '+' : ''}${v} dB`;
      });
    }

    if (state.hqSettings) {
      if (el.sliderHqVocal) { el.sliderHqVocal.value = state.hqSettings.vocal; if (el.valHqVocal) el.valHqVocal.textContent = `${state.hqSettings.vocal > 0 ? '+' : ''}${state.hqSettings.vocal}%`; }
      if (el.sliderHqAir) { el.sliderHqAir.value = state.hqSettings.air; if (el.valHqAir) el.valHqAir.textContent = `${state.hqSettings.air > 0 ? '+' : ''}${state.hqSettings.air}%`; }
      if (el.sliderHqBass) { el.sliderHqBass.value = state.hqSettings.bass; if (el.valHqBass) el.valHqBass.textContent = `${state.hqSettings.bass > 0 ? '+' : ''}${state.hqSettings.bass}%`; }
      if (el.hqPresetChips) el.hqPresetChips.forEach((/** @type {HTMLElement} */ c) => c.classList.toggle('active', c.dataset.preset === state.hqSettings.preset));
    }
  }

  // ---- the playing song in the player bar and Now playing, and the banners (app/nowPlaying.js) ----
  const nowPlayingPart = /** @type {UrielNowPlayingPart} */ ({});
  /** @param {UrielTrack} track */
  function updateNowPlayingUI(track) { return nowPlayingPart.updateNowPlayingUI(track); }
  window.UrielApp.nowPlaying({ analyzeCover, applyVisualEffects, el, formatDuration, getMediaArtwork, getTrackCanonicalId, getTrackThumbUrl, highlightPlayingRow, m3cSetImage, nextPlayerArt, refreshMeshCover, rememberTrackArt, setCoverBg, state, updateFavoriteIcon, updateMediaSession, updateThemeFromState, updateTvKaraokeMeta }, nowPlayingPart);
  const shownThumbs = nowPlayingPart.shownThumbs;

  function getTrackCanonicalId(/** @type {UrielTrack} */ track) {
    if (!track) return '';
    const platform = track.platform || state.platform || 'yt';
    if (track.id) return `${platform}:${track.id}`;
    if (track.url || track.videoId) return `${platform}:${track.url || track.videoId}`;
    const t = (track.title || '').trim().toLowerCase();
    const a = (track.artist || '').trim().toLowerCase();
    const d = Math.round(Number(track.duration) || 0);
    return `${platform}:${t}|${a}|${d}`;
  }

  function isSameTrack(/** @type {UrielTrack | null} */ a, /** @type {UrielTrack | null} */ b) {
    if (!a || !b) return false;
    return getTrackCanonicalId(a) === getTrackCanonicalId(b);
  }

  function matchesTrackQuery(/** @type {UrielTrack} */ track, /** @type {string} */ query) {
    if (!query) return true;
    return normalizeSearch(track && track.title).includes(query) || normalizeSearch(track && track.artist).includes(query);
  }

  // a song's own pictures and banner effects (Track art dialog), kept in uriel_track_art by song id
  /** @type {{ raw: string, parsed: Record<string, UrielTrackArt> }} */
  const trackArtCache = { raw: '', parsed: {} };
  /** @returns {UrielTrackArt} */
  function getTrackArt(/** @type {UrielTrack} */ t) {
    try {
      // every list row asks while it is built: parse only when the saved text changed (Sync and backups write it too)
      const raw = localStorage.getItem('uriel_track_art') || '{}';
      if (trackArtCache.raw !== raw) {
        trackArtCache.parsed = JSON.parse(raw);
        trackArtCache.raw = raw;
      }
      return trackArtCache.parsed[getTrackCanonicalId(t)] || {};
    } catch (e) {
      return {};
    }
  }

  function setTrackArt(/** @type {UrielTrack} */ t, /** @type {UrielTrackArt | null} */ patch) {
    /** @type {Record<string, UrielTrackArt>} */
    let all = {};
    try {
      all = JSON.parse(localStorage.getItem('uriel_track_art') || '{}');
    } catch (e) {}
    const id = getTrackCanonicalId(t);
    if (!id) return;
    /** @type {Record<string, unknown>} */
    const cur = { ...(all[id] || {}), ...patch };
    for (const k in cur) if (!cur[k]) delete cur[k];
    if (Object.keys(cur).length) all[id] = cur; else delete all[id];
    localStorage.setItem('uriel_track_art', JSON.stringify(all));
  }

  // ---- Crossfade: the old song plays out on a second player while the next one starts (app/crossfade.js) ----
  const crossfadePart = /** @type {UrielCrossfadePart} */ ({});
  window.UrielApp.crossfade({ audioEngine, el, isPhoneApp, playNext, playback, queueFinished, state, usingHls: () => !!playback.hls }, crossfadePart);
  const { crossfadeSeconds, canOverlap, prepareCrossfade, crossfadePrepared, crossfadeFadeIn, crossfadeOnTrackChange, cancelEndFade, dropCrossfadePrep, pauseCrossfadeTail, resumeCrossfadeTail } = crossfadePart;

  function flipAnimate(/** @type {(HTMLElement | null)[] | null} */ elements, /** @type {() => void} */ mutateFn, duration = 380) {
    const validElements = /** @type {HTMLElement[]} */ ((elements || []).filter((item) => item && item.getBoundingClientRect));
    const firstRects = new Map();
    validElements.forEach((/** @type {HTMLElement} */ item) => {
      firstRects.set(item, item.getBoundingClientRect());
    });

    validElements.forEach((/** @type {HTMLElement} */ item) => {
      item.style.transition = 'none';
      item.style.transform = 'none';
    });

    if (typeof mutateFn === 'function') {
      mutateFn();
    }

    /** @type {HTMLElement[]} */
    const animatingElements = [];
    validElements.forEach((/** @type {HTMLElement} */ item) => {
      const first = firstRects.get(item);
      const last = item.getBoundingClientRect();
      if (!first || !last) return;
      if ((first.width === 0 && first.height === 0) || (last.width === 0 && last.height === 0)) return;

      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        item.style.transform = `translate(${dx}px, ${dy}px)`;
        animatingElements.push(item);
      } else {
        item.style.transform = '';
        item.style.transition = '';
      }
    });

    if (animatingElements.length === 0) return;

    animatingElements.forEach(item => item.offsetHeight);

    requestAnimationFrame(() => {
      animatingElements.forEach(item => {
        item.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1)`;
        item.style.transform = '';

        let cleaned = false;
        const cleanUp = () => {
          if (cleaned) return;
          cleaned = true;
          item.removeEventListener('transitionend', onEnd);
          item.style.transition = '';
          item.style.transform = '';
        };
        const onEnd = (/** @type {TransitionEvent} */ e) => {
          if (e.target !== item || e.propertyName !== 'transform') return;
          cleanUp();
        };
        item.addEventListener('transitionend', onEnd);
        setTimeout(cleanUp, duration + 50);
      });
    });
  }

  // ---- the synced lyrics view and translating lyrics (app/lyricsView.js) ----
  const lyricsViewPart = /** @type {UrielLyricsViewPart} */ ({});
  function updateSyncedLyricsHighlight(/** @type {number} */ currentTime) { return lyricsViewPart.updateSyncedLyricsHighlight(currentTime); }
  window.UrielApp.lyricsView({ capMap, lyricsSourcePref, el, fetchAndUpgradeWords, flipAnimate, getAdv, I18N, isPhoneApp, lineTimedWords, lyricWordSpans, miniLyricsShown, renderMiniLyrics, sendStateToServer, state, syncTvLayout, timedWordIndex, updateMiniLyricsHighlight, viz }, lyricsViewPart);
  const { updateLyricsPadding, stopLyricsScroll, stopGradientLoop } = lyricsViewPart;
  const { setLyricsEmpty, loadSyncedLyrics, getLyricsWordStyle, renderLyricsView, fetchAndApplyTranslation, updateLyricsTranslationUI, getLineStartTime, getLineEndTime, getLyricsEase, getLyricsSpeed, applyLyricsEase, getLyricsGradientTightness, applyLyricsGradientTightness, animateLyricsScroll, updateActiveGradient } = lyricsViewPart;
  const TRANSLATION_LANGUAGES = lyricsViewPart.TRANSLATION_LANGUAGES;

  // ---- the TV karaoke and its settings (app/tvKaraoke.js) ----
  const tvKaraokePart = /** @type {UrielTvKaraokePart} */ ({});
  /** @param {boolean} [forcedNoLyrics] */
  function syncTvLayout(forcedNoLyrics) { return tvKaraokePart.syncTvLayout(forcedNoLyrics); }
  function updateTvKaraokeMeta() { return tvKaraokePart.updateTvKaraokeMeta(); }
  window.UrielApp.tvKaraoke({ applyTrackBannerFx, audioEngine, el, ensureSfFontLoaded, fontVal, getTrackArt, getTrackThumbUrl, isPhoneApp, playNext, playPrev, renderLyricsView, resizeCanvases, setPlayPauseState, setTvkAmbient, SF_FONT_STACK, showToast, startVisualizers, state, stopLyricsScroll, syncTvkAmbientPlayback, syncTvkProgress, T, Tf, Tm, toggleFavoriteTrack, togglePlayPause, updateLyricsPadding, updatePlayPauseButton, updateSyncedLyricsHighlight, viz }, tvKaraokePart);
  const { syncTvBanner } = tvKaraokePart;
  const { openTvKaraoke, closeTvKaraoke, initTvk, resetTvIdleTimer, updateTvkOutput, updateTvkVisualizerSetting, updateTvkVisualizerLyricsSetting, updateTvkVisualizerOpacity } = tvKaraokePart;

  // ---- Settings > Tracks > Output device (app/outputDevice.js) ----
  window.UrielApp.outputDevice({ audioEngine, el, isPhoneApp, showToast, state, T, Tf, Tm, updateTvkOutput });

  // ---- your own lyrics and timing them (app/lyricsEditor.js) ----
  const lyricsEditorPart = /** @type {UrielLyricsEditorPart} */ ({});
  window.UrielApp.lyricsEditor({ animateLyricsScroll, closeModal, el, loadSyncedLyrics, openModal, playSmooth, showToast, state, Tm }, lyricsEditorPart);
  const { handleSyncLineClick } = lyricsEditorPart;
  const syncState = lyricsEditorPart.syncState;

  // ---- playing songs: streams, recovery, play and pause, the queue and the progress bar (app/playback.js) ----
  const playbackPart = /** @type {UrielPlaybackPart} */ ({});
  function playTrack(/** @type {UrielTrack} */ track, /** @type {UrielTrack[] | null} */ queueList = null, startIndex = -1, /** @type {string | null} */ context = null) { return playbackPart.playTrack(track, queueList, startIndex, context); }
  function pauseSmooth() { return playbackPart.pauseSmooth(); }
  function playSmooth() { return playbackPart.playSmooth(); }
  function togglePlayPause() { return playbackPart.togglePlayPause(); }
  function queueFinished() { return playbackPart.queueFinished(); }
  function playNext() { return playbackPart.playNext(); }
  function playPrev() { return playbackPart.playPrev(); }
  function prefetchNextQueueTrack() { return playbackPart.prefetchNextQueueTrack(); }
  window.UrielApp.playback({ applyAudioSettings, applyM3Cover, audioEngine, cancelEndFade, canOverlap, crossfadeFadeIn, crossfadeOnTrackChange, crossfadePrepared, crossfadeSeconds, dropCrossfadePrep, el, emitPluginEvent, enforceTrackTrim, extendMyWaveQueue, formatDuration, getTrackCanonicalId, getTrackNormalizedKey, getTrackTrim, initAudioContext, isBlocked, isPhoneApp, isSameTrack, loadScriptOnce, loadSyncedLyrics, m3cDraw, m3cEnabled, m3cStart, miniLyricsShown, nextPrefetchDue, offlineChanged, onTrackAudioTrackChange, pauseCrossfadeTail, playback, prepareCrossfade, recordWaveSkip, registerMediaActions, renderHistoryView, renderQueueView, resetLevelWatcher, resumeCrossfadeTail, saveQueueState, sendStateToServer, showToast, sourceOverride, startVisualizers, state, stopLyricsScroll, syncTvkProgress, Tm, tokenUrl, toolsReady, updateDiscordPresence, updateMediaPositionState, updateMediaSession, updateMiniLyricsHighlight, updateNowPlayingUI, updatePlayPauseButton, updateQueueBadge, updateSleepTimerUI, updateSyncedLyricsHighlight, visualizerPart, viz }, playbackPart);
  const { showPlayFailure } = playbackPart;
  const { shuffleQueue, unshuffleQueue, restoreQueueAt, adoptQueueAt, skipUnplayable, retryFresh } = playbackPart;

  const Lib = window.UrielLibrary;

  // ---- playing albums, saved albums and rating Daily Mixes (app/albums.js) ----
  const albumsPart = /** @type {UrielAlbumsPart} */ ({});
  window.UrielApp.albums({ el, escapeHtml, getTrackNormalizedKey, isSameTrack, Lib, normalizeImportText, openArtistProfile, playback, playTrack, pool, refreshStacks, renderAlbumCards, renderQueueView, safeArray, safeJson, showToast, shuffleQueue, sortedLibrary, state, switchView, Tm, toSeconds, updateNavIndicator, updateQueueBadge }, albumsPart);
  const { playAlbumFrom } = albumsPart;
  const { fetchArtistCardForSearch, resolveAlbumTrack, getSavedAlbums, setSavedAlbums, updateAlbumsCount, renderSavedAlbums, applyShowAlbums, updateSaveAlbumButton, getMixFeedback, showAlbumExtras } = albumsPart;

  // ---- the album page and downloading a whole album (app/album.js) ----
  const albumPart = /** @type {UrielAlbumPart} */ ({});
  window.UrielApp.album({ Lib, T, Tf, Tm, createTrackRow, escapeHtml, getCoverDominantColors, getSavedAlbums, getTrackCanonicalId, highlightPlayingRow, openArtistProfile, openDownloadAllModal, openTrackArtist, playAlbumFrom, playTrack, resolveAlbumTrack, setSavedAlbums, showAlbumExtras, showToast, state, switchView, updateFade }, albumPart);
  const { openAlbum } = albumPart;

  function updateRowFade(/** @type {HTMLElement | null} */ row) {
    if (!row) return;
    const maxScroll = row.scrollWidth - row.clientWidth;
    if (maxScroll <= 0) {
      row.classList.remove('fade-left', 'fade-right');
      return;
    }
    row.classList.toggle('fade-left', row.scrollLeft > 4);
    row.classList.toggle('fade-right', row.scrollLeft < maxScroll - 4);
  }
  window.updateRowFade = updateRowFade;

  // one window listener for all rows: each search added its own, which kept every old album row alive
  const fadeRows = new Set();
  window.addEventListener('resize', () => {
    fadeRows.forEach(r => { if (r.isConnected) updateRowFade(r); else fadeRows.delete(r); });
  }, { passive: true });

  // a mouse wheel over a sideways row scrolls the row while it can still go that way; at its ends the page
  // scrolls on (Ctrl+wheel is zoom, left alone)
  function wheelRowSideways(/** @type {HTMLElement} */ row, /** @type {WheelEvent} */ e) {
    if (e.ctrlKey || e.defaultPrevented || row.scrollWidth <= row.clientWidth + 1) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if ((delta < 0 && row.scrollLeft > 0) || (delta > 0 && row.scrollLeft < row.scrollWidth - row.clientWidth - 1)) {
      e.preventDefault();
      glideRowBy(row, e.deltaMode === 1 ? delta * 40 : delta);
    }
  }
  // Each wheel tick adds to where the row is heading (#41). A smooth scrollBy per tick started over from wherever the
  // row was, so ticks arriving faster than it moved were lost: a fast flick went about 6% of the way.
  function glideRowBy(/** @type {HTMLElement} */ row, /** @type {number} */ px) {
    const max = row.scrollWidth - row.clientWidth;
    const from = (row._glideRaf ? row._glideTo : row.scrollLeft) || 0;
    row._glideTo = Math.max(0, Math.min(max, from + px));
    if (row._glideRaf) return;
    row.style.scrollBehavior = 'auto'; // the row's CSS would otherwise animate each step of this animation too
    let last = performance.now();
    const step = (/** @type {number} */ now) => {
      const left = (row._glideTo || 0) - row.scrollLeft;
      if (Math.abs(left) < 1) {
        row.scrollLeft = row._glideTo || 0;
        row._glideRaf = 0;
        row.style.scrollBehavior = '';
        return;
      }
      const move = left * (1 - Math.exp(-(now - last) / 70));
      last = now;
      row.scrollLeft += Math.abs(move) < 1 ? Math.sign(left) : move;
      row._glideRaf = requestAnimationFrame(step);
    };
    row._glideRaf = requestAnimationFrame(step);
  }
  // rows drawn without bindHorizontalWheel (For you: artists and songs, Your playlists, an artist's namesakes)
  // scrolled the whole page under the wheel (#10): one listener for all of them
  const SIDEWAYS_ROWS = '.fy-row, .home-pl-row, .sp-row, .search-albums-row';
  document.addEventListener('wheel', (e) => {
    const row = e.target && /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(SIDEWAYS_ROWS)) : null;
    if (row && !row._wheelBound) wheelRowSideways(row, e);
  }, { passive: false });
  function bindHorizontalWheel(/** @type {HTMLElement} */ row) {
    if (!row || row._wheelBound) return;
    row._wheelBound = true;
    row.addEventListener('wheel', (/** @type {WheelEvent} */ e) => wheelRowSideways(row, e), { passive: false });

    row.addEventListener('scroll', () => updateRowFade(row), { passive: true });
    fadeRows.add(row);
    updateRowFade(row);
  }
  window.bindHorizontalWheel = bindHorizontalWheel;

  // ---- the search results page (app/search.js) ----
  const searchPart = /** @type {UrielSearchPart} */ ({});
  window.UrielApp.search({ Tm, bindHorizontalWheel, el, escapeHtml, fetchArtistCardForSearch, getAdv, importSharedPlaylist, openAlbum, renderTracks, showToast, state, switchView, syncHomeAmbientVisibility, updateRowFade }, searchPart);
  const { performSearch } = searchPart;

  // ---- selecting several songs (app/multiSelect.js) ----
  const multiSelectPart = /** @type {UrielMultiSelectPart} */ ({});
  window.UrielApp.multiSelect({ el, getTrackCanonicalId, matchesTrackQuery, openPlaylistDetail, renderFavoritesView, state }, multiSelectPart);
  const { exitMultiSelect } = multiSelectPart;
  const { updateMultiSelectBar, rerenderMultiSelectView, startMultiSelect, toggleTrackSelection, multiSelectSourceTracks } = multiSelectPart;
  const multiSel = multiSelectPart.multiSel;

  // ---- blocked artists and songs (from Riff 43.1) (app/blocks.js) ----
  const blocksPart = /** @type {UrielBlocksPart} */ ({});
  function isBlocked(/** @type {UrielTrack} */ track) { return blocksPart.isBlocked(track); }
  window.UrielApp.blocks({ I18N, Lib, showToast, T, Tm, updateArtistBlockButton }, blocksPart);
  const { getBlocks, toggleBlockArtist, toggleBlockSong, renderBlockedSettings } = blocksPart;

  // ---- song rows, the song menu and the action menus (app/trackRows.js) ----
  const trackRowsPart = /** @type {UrielTrackRowsPart} */ ({});
  function createTrackRow(/** @type {UrielTrack} */ track, /** @type {number} */ idx, /** @type {string} */ currentCanonicalId, /** @type {string} */ context, /** @type {UrielTrack[]} */ tracks, /** @type {HTMLElement} */ container) { return trackRowsPart.createTrackRow(track, idx, currentCanonicalId, context, tracks, container); }
  function renderTracks(/** @type {HTMLElement} */ container, /** @type {UrielTrack[]} */ tracks, context = 'search') { return trackRowsPart.renderTracks(container, tracks, context); }
  function highlightPlayingRow() { return trackRowsPart.highlightPlayingRow(); }
  window.UrielApp.trackRows({ canReorder, checkOffline, copyText, dragGrip, el, escapeHtml, formatDuration, getBlocks, getTrackCanonicalId, getTrackThumbUrl, I18N, isBlocked, isPhoneApp, isSameTrack, Lib, listThumb, multiSel, OFFLINE_ICON, offlineKey, offlineState, openAddToPlaylistModal, openDownloadModal, openTrackArtist, openTrackArtModal, playTrack, removeTrackFromCurrentPlaylist, renderBlockedSettings, renderLocalView, rowTitle, sharePlaylist, shownThumbs, showToast, songRadioEnabled, sortTracksFor, startSongRadio, state, T, Tf, THUMB_FALLBACK, Tm, toggleBlockArtist, toggleBlockSong, toggleFavoriteTrack, toggleTrackSelection, topMomentMenuItem, otherVersionMenuItem, trackArtCandidates, updateArtistBlockButton, updateLocalBadge, updateQueueBadge }, trackRowsPart);
  const { showActionMenu } = trackRowsPart;
  const { isFavoriteSong } = trackRowsPart;

  // ---- top moment: a pin on the progress bar that jumps to a song's best part (app/topMoment.js) ----
  const topMomentPart = /** @type {UrielTopMomentPart} */ ({});
  function topMomentMenuItem(/** @type {UrielTrack} */ track) { return topMomentPart.topMomentMenuItem(track); }
  window.UrielApp.topMoment({ el, formatDuration, getTrackCanonicalId, isSameTrack, showActionMenu, showToast, state, Tf, Tm }, topMomentPart);

  // ---- Find another version: a better source for a song YouTube got wrong (app/otherVersion.js) ----
  const otherVersionPart = /** @type {UrielOtherVersionPart} */ ({});
  function sourceOverride(/** @type {UrielTrack | null} */ track) { return otherVersionPart.sourceOverride(track); }
  function otherVersionMenuItem(/** @type {UrielTrack} */ track) { return otherVersionPart.otherVersionMenuItem(track); }
  window.UrielApp.otherVersion({ getTrackCanonicalId, playTrack, showToast, state, Tm }, otherVersionPart);

  // ---- the artist page and following artists (app/artist.js) ----
  const artistPart = /** @type {UrielArtistPart} */ ({});
  function openArtistProfile(/** @type {string} */ name, /** @type {{ id?: string, video?: string }} */ o = {}) { return artistPart.openArtistProfile(name, o); }
  function openTrackArtist(/** @type {UrielTrack} */ track) { return artistPart.openTrackArtist(track); }
  function renderAlbumCards(/** @type {HTMLElement} */ container, /** @type {UrielAlbum[]} */ albums, /** @type {(album: UrielAlbum) => string} */ subOf) { return artistPart.renderAlbumCards(container, albums, subOf); }
  function updateArtistBlockButton() { return artistPart.updateArtistBlockButton(); }
  window.UrielApp.artist({ I18N, Lib, capMap, closeModal, el, escapeHtml, getBlocks, getCoverDominantColors, isPhoneApp, openAlbum, openModal, playTrack, renderFollowedArtists, renderTracks, safeArray, showToast, state, switchView, toggleBlockArtist }, artistPart);
  const { compactCount, getFollowedArtists, setFollowedArtists, updateFollowButton } = artistPart;

  // ---- the library lists: favourites, history, the queue and your own files (app/library.js) ----
  const libraryPart = /** @type {UrielLibraryPart} */ ({});
  function toggleFavoriteTrack(/** @type {UrielTrack} */ track) { return libraryPart.toggleFavoriteTrack(track); }
  function updateFavoriteIcon() { return libraryPart.updateFavoriteIcon(); }
  function sortTracksFor(/** @type {string} */ kind, /** @type {UrielTrack[]} */ tracks) { return libraryPart.sortTracksFor(kind, tracks); }
  function renderFavoritesView() { return libraryPart.renderFavoritesView(); }
  function renderHistoryView() { return libraryPart.renderHistoryView(); }
  function updateQueueBadge() { return libraryPart.updateQueueBadge(); }
  function renderQueueView() { return libraryPart.renderQueueView(); }
  function updateLocalBadge() { return libraryPart.updateLocalBadge(); }
  function renderLocalView(forceFetch = true) { return libraryPart.renderLocalView(forceFetch); }
  /** @template {{ name: string }} I @param {string} kind @param {I[]} items @returns {I[]} */
  function sortedLibrary(kind, items) { return libraryPart.sortedLibrary(kind, items); }
  window.UrielApp.library({ showRecommendations, artistPlays, el, isFavoriteSong, isPhoneApp, matchesTrackQuery, renderArtistsTab, renderPlaylistsList, renderSavedAlbums, renderTracks, scheduleQueueSave, showToast, state, Tm, tokenUrl }, libraryPart);
  const { updateFavoritesBadge, getTrackSortMode, setTrackSortMode, stampAddedAt, syncSortDropdown, setupSortDropdown, getLibrarySort, importLocalFiles } = libraryPart;

  // ---- "Recommended for you" under playlists and Liked songs (app/recommendations.js) ----
  const recommendationsPart = /** @type {UrielRecommendationsPart} */ ({});
  function showRecommendations(/** @type {'playlist' | 'favorites'} */ kind, /** @type {UrielPlaylist | undefined} */ pl) { return recommendationsPart.showRecommendations(kind, pl); }
  window.UrielApp.recommendations({ getTrackThumbUrl, isBlocked, isSameTrack, listThumb, openPlaylistDetail, playTrack, renderFavoritesView, renderPlaylistsList, stampAddedAt, state, T, toggleFavoriteTrack }, recommendationsPart);

  // ---- song covers: picking one, the fallbacks, and saving the ones that worked (app/covers.js) ----
  const coversPart = /** @type {UrielCoversPart} */ ({});
  function listThumb(/** @type {string} */ url) { return coversPart.listThumb(url); }
  function trackArtCandidates(/** @type {UrielTrack | null} */ track) { return coversPart.trackArtCandidates(track); }
  function nextPlayerArt(/** @type {UrielTrack} */ track, /** @type {HTMLImageElement} */ img) { return coversPart.nextPlayerArt(track, img); }
  function getTrackThumbUrl(/** @type {UrielTrack | null} */ track) { return coversPart.getTrackThumbUrl(track); }
  function rowTitle(/** @type {UrielTrack} */ track) { return coversPart.rowTitle(track); }
  /** @param {string | undefined} canonicalId @param {string} url */
  function rememberTrackArt(canonicalId, url) { return coversPart.rememberTrackArt(canonicalId, url); }
  window.UrielApp.covers({ getAdv, getTrackArt, getTrackCanonicalId, isPhoneApp, state, tokenUrl }, coversPart);
  const { trackYoutubeId, nextTrackArt } = coversPart;
  const YT_THUMB = coversPart.YT_THUMB;

  // Phones move rows by a grip at their end. A held row worked only upwards: moving down, Android took the
  // gesture for a scroll and cancelled the drag (or scrolled the list under it). The grip has touch-action: none,
  // so a finger on it is never a scroll; the rest of the row still scrolls the list and opens the menu on a hold.
  function canReorder(/** @type {string} */ list) {
    if (!isPhoneApp) return false;
    if (list === 'queue') return true;
    if (list === 'playlists') return getLibrarySort('playlists') === 'custom';
    if (list === 'favorites') return !(el.favoritesSearchInput && el.favoritesSearchInput.value.trim()) && getTrackSortMode('favorites') === 'manual';
    if (list === 'playlist') return !(el.playlistSearchInput && el.playlistSearchInput.value.trim()) && getTrackSortMode('playlist') === 'manual';
    return false;
  }
  function dragGrip() {
    const g = document.createElement('span');
    g.className = 'drag-grip';
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle><circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle><circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle></svg>';
    return g;
  }

  // ---- playlists: the list, a playlist's page and the playlist dialogs (app/playlists.js) ----
  const playlistsPart = /** @type {UrielPlaylistsPart} */ ({});
  function renderPlaylistsList() { return playlistsPart.renderPlaylistsList(); }
  function openPlaylistDetail(/** @type {string} */ playlistId) { return playlistsPart.openPlaylistDetail(playlistId); }
  function sharePlaylist(/** @type {{ name: string, tracks: UrielTrack[] } | undefined} */ pl) { return playlistsPart.sharePlaylist(pl); }
  function importSharedPlaylist(/** @type {string} */ text) { return playlistsPart.importSharedPlaylist(text); }
  function removeTrackFromCurrentPlaylist(/** @type {UrielTrack} */ track) { return playlistsPart.removeTrackFromCurrentPlaylist(track); }
  function openAddToPlaylistModal(/** @type {UrielTrack | null} */ track, /** @type {UrielTrack[] | null} */ many = null) { return playlistsPart.openAddToPlaylistModal(track, many); }
  window.UrielApp.playlists({ showRecommendations, canReorder, closeModal, downloadedInFolder, dragGrip, el, escapeHtml, exitMultiSelect, formatDuration, getCoverDominantColors, getLibrarySort, getTrackCanonicalId, getTrackSortMode, getTrackThumbUrl, I18N, isBlocked, isFavoriteSong, isPhoneApp, isSameTrack, matchesTrackQuery, multiSel, multiSelectSourceTracks, nextTrackArt, offlineChanged, openModal, playTrack, renderPlaylistDuplicateButton, renderTracks, rerenderMultiSelectView, setShuffle, setTrackSortMode, setupSortDropdown, showActionMenu, showToast, songRadioEnabled, sortedLibrary, sortTracksFor, stampAddedAt, startMultiSelect, startSongRadio, state, switchView, syncPlaylistFromSource, syncSortDropdown, T, Tf, Tm, trackArtCandidates, updateFavoriteIcon, updateFavoritesBadge, updateMultiSelectBar, updateQueueBadge }, playlistsPart);
  const { renderPlaylistCover, createPlaylist } = playlistsPart;
  const { refreshPlaylistDownloads, deleteCurrentPlaylist } = playlistsPart;

  // ---- dragging rows to reorder lists (app/reorder.js) ----
  window.UrielApp.reorder({ el, getLibrarySort, getTrackSortMode, isPhoneApp, state, updateQueueBadge });

  // ---- moving between views and the side nav (app/navigation.js) ----
  const navigationPart = /** @type {UrielNavigationPart} */ ({});
  function switchView(/** @type {string} */ viewName) { return navigationPart.switchView(viewName); }
  function refreshStacks() { return navigationPart.refreshStacks(); }
  function updateNavIndicator(/** @type {boolean} */ animate) { return navigationPart.updateNavIndicator(animate); }
  window.UrielApp.navigation({ checkToolsStatus, el, enterSettings, exitMultiSelect, highlightPlayingRow, isSpotifyHome, loadForYou, multiSel, openPanelDrawer, refreshYtSignin, renderArtistsTab, renderBlockedSettings, renderFavoritesView, renderHistoryView, renderLocalView, renderQueueView, renderSavedAlbums, renderSpotifyHome, state, syncHomeAmbientVisibility, updateDeviceMusicUI, updateDownloadCaptionPath, updateDownloadFolderUI, updateFxVisibility, updateMusicFolderUI, updateOfflineStorageUI }, navigationPart);

  // ---- the play / pause button (app/playButton.js) ----
  const playButtonPart = /** @type {UrielPlayButtonPart} */ ({});
  function setPlayPauseState(/** @type {boolean} */ playing, animate = true) { return playButtonPart.setPlayPauseState(playing, animate); }
  function updatePlayPauseButton(/** @type {boolean} */ isPlaying, isBuffering = false) { return playButtonPart.updatePlayPauseButton(isPlaying, isBuffering); }
  window.UrielApp.playButton({ el }, playButtonPart);

  function formatDuration(/** @type {number | undefined} */ sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  if (window.electronAPI) {
    if (el.btnMinimize) el.btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
    if (el.btnMaximize) el.btnMaximize.addEventListener('click', () => window.electronAPI.maximizeWindow());
    if (el.btnClose) el.btnClose.addEventListener('click', () => window.electronAPI.closeWindow());
  }

  if (el.navDiscover) el.navDiscover.addEventListener('click', () => switchView('discover'));
  if (el.navFavorites) el.navFavorites.addEventListener('click', () => switchView('favorites'));
  if (el.navAlbums) el.navAlbums.addEventListener('click', () => switchView('albums'));
  const navArtistsBtn = document.getElementById('nav-artists');
  if (navArtistsBtn) navArtistsBtn.addEventListener('click', () => switchView('artists'));
  if (el.navLocal) el.navLocal.addEventListener('click', () => switchView('local'));
  if (el.navHistory) el.navHistory.addEventListener('click', () => switchView('history'));
  if (el.navQueue) el.navQueue.addEventListener('click', () => switchView('queue'));
  if (el.navSettings) el.navSettings.addEventListener('click', () => switchView('settings'));

  if (el.btnAddLocalFiles) el.btnAddLocalFiles.addEventListener('click', () => importLocalFiles());
  // a whole folder (and its subfolders) at once: computers and Android, iPhones pick files
  const btnAddLocalFolder = document.getElementById('btn-add-local-folder');
  const canAddFolder = !isPhoneApp || (window.Capacitor && window.Capacitor.getPlatform() === 'android');
  if (btnAddLocalFolder && canAddFolder && window.electronAPI) {
    btnAddLocalFolder.hidden = false;
    btnAddLocalFolder.addEventListener('click', () => importLocalFiles({ folder: true }));
  }
  if (el.btnAddLocalFilesEmpty) el.btnAddLocalFilesEmpty.addEventListener('click', () => importLocalFiles());


  // ---- the slide-over drawer: Now playing and Queue (app/panelDrawer.js) ----
  const panelDrawerPart = /** @type {UrielPanelDrawerPart} */ ({});
  function openPanelDrawer(/** @type {string} */ tab) { return panelDrawerPart.openPanelDrawer(tab); }
  window.UrielApp.panelDrawer({ el, renderQueueView, resizeCanvases, startVisualizers, state, viz }, panelDrawerPart);
  const { showPlayingInQueue } = panelDrawerPart;

  if (el.searchInput) {
    el.searchInput.addEventListener('input', (/** @type {Event} */ e) => {
      const val = /** @type {HTMLInputElement} */ (e.target).value;
      if (window.UrielShare && window.UrielShare.payloadFrom(val)) { performSearch(val); return; }
      if (val && el.searchClearBtn) {
        el.searchClearBtn.classList.remove('hidden');
      } else if (el.searchClearBtn) {
        el.searchClearBtn.classList.add('hidden');
      }
      if (!val.trim()) {
        if (el.discoverEmpty) el.discoverEmpty.classList.remove('hidden');
        if (el.searchResultsContainer) el.searchResultsContainer.classList.add('hidden');
        const artistCardContainer = document.getElementById('search-artist-card-container');
        if (artistCardContainer) artistCardContainer.innerHTML = '';
        if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
      }
    });

    el.searchInput.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter') {
        const val = el.searchInput.value.trim();
        if (val) performSearch(val);
      } else if (e.key === 'Escape') {
        el.searchInput.value = '';
        if (el.searchClearBtn) el.searchClearBtn.classList.add('hidden');
        if (el.discoverEmpty) el.discoverEmpty.classList.remove('hidden');
        if (el.searchResultsContainer) el.searchResultsContainer.classList.add('hidden');
        const artistCardContainer = document.getElementById('search-artist-card-container');
        if (artistCardContainer) artistCardContainer.innerHTML = '';
        if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
      }
    });
  }

  if (el.searchIconBtn) {
    el.searchIconBtn.addEventListener('click', () => {
      const val = el.searchInput ? el.searchInput.value.trim() : '';
      if (val) performSearch(val);
    });
  }

  if (el.searchClearBtn) {
    el.searchClearBtn.addEventListener('click', () => {
      if (el.searchInput) el.searchInput.value = '';
      el.searchClearBtn.classList.add('hidden');
      if (el.discoverEmpty) el.discoverEmpty.classList.remove('hidden');
      if (el.searchResultsContainer) el.searchResultsContainer.classList.add('hidden');
      const artistCardContainer = document.getElementById('search-artist-card-container');
      if (artistCardContainer) artistCardContainer.innerHTML = '';
      if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
    });
  }


  // Settings: keep the sound settings between starts (the flag is read when they are saved)
  const btnPersistSound = document.getElementById('btn-persist-sound-settings');
  if (btnPersistSound) {
    btnPersistSound.classList.toggle('active', soundPersistenceEnabled);
    btnPersistSound.addEventListener('click', () => {
      const next = !btnPersistSound.classList.contains('active');
      btnPersistSound.classList.toggle('active', next);
      soundPersistenceEnabled = next;
      localStorage.setItem('uriel_persist_sound_settings', next ? '1' : '0');
      if (next) persistSoundSettings();
    });
  }

  // ---- the search engine buttons and the player bar's buttons and volume (app/playerBar.js) ----
  const playerBarPart = /** @type {UrielPlayerBarPart} */ ({});
  function setShuffle(/** @type {boolean} */ on) { return playerBarPart.setShuffle(on); }
  window.UrielApp.playerBar({ applyAudioSettings, el, performSearch, persistSoundSettings, playNext, playPrev, renderHistoryView, renderQueueView, showPlayingInQueue, shuffleQueue, state, T, toggleFavoriteTrack, togglePlayPause, unshuffleQueue, updateQueueBadge }, playerBarPart);
  const { setPlatform } = playerBarPart;
  const { updateEngineWidthVar, persistVolumeState, syncVolumeControls } = playerBarPart;

  // ---- the sound settings: HQ audio, the effect sliders and the EQ (app/soundSettings.js) ----
  window.UrielApp.soundSettings({ applyAudioSettings, applyHqSettings, closeModal, el, EQ_BAND_LABELS, initAudioContext, openModal, persistSoundSettings, refreshStacks, renderPresets, setTempoValues, state, updateHqRouting });

  // the active card follows the theme; applyTheme calls this before the cards' part has started
  function syncSiteThemeCards() {
    const site = activeSiteTheme();
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.site-theme-card')).forEach((c) => {
      const on = c.dataset.siteTheme === 'system' ? state.siteTheme === 'system' : !!site && c.dataset.siteTheme === site.id;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  }

  // ---- the app theme cards and the System theme (app/themeCards.js) ----
  const themeCardsPart = /** @type {UrielThemeCardsPart} */ ({});
  window.UrielApp.themeCards({ activeSiteTheme, SITE_THEMES, smoothThemeSwap, state, syncSiteThemeCards, updateThemeFromState }, themeCardsPart);
  const { setSiteTheme } = themeCardsPart;
  const { applySystemColors } = themeCardsPart;

  // ---- Settings → Interface: switches, theme mode, font, search box and sliders (app/interfaceSettings.js) ----
  window.UrielApp.interfaceSettings({ applyFont, applyScale, applySystemColors, effectiveMode, el, hslToHex, isPhoneApp, refreshCachedThemeColors, resizeCanvases, setSiteTheme, state, updateEngineWidthVar, updateThemeFromState });

  function syncBgVideoPlayback() {
    const v = /** @type {HTMLVideoElement} */ (document.querySelector('#custom-bg video'));
    if (!v) return;
    const hidden = document.hidden || document.body.classList.contains('perf');
    if (hidden) v.pause(); else v.play().catch(() => {});
  }
  document.addEventListener('visibilitychange', syncBgVideoPlayback);
  if (window.electronAPI && window.electronAPI.onWindowVisibility) window.electronAPI.onWindowVisibility(() => syncBgVideoPlayback());

  function currentUiAlpha() { return Number(/** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')).value); }
  function setUiAlphaViaSlider(/** @type {number} */ v) { const s = /** @type {HTMLInputElement} */ (document.getElementById('slider-ui-alpha')); if (!s) return; s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }

  // ---- Settings → Background: your own picture or video, the cover background and the mesh (app/background.js) ----
  const backgroundPart = /** @type {UrielBackgroundPart} */ ({});
  window.UrielApp.background({ applyFxClip, currentUiAlpha, getAdv, getTrackThumbUrl, PALETTE_STYLES, registerFx, setCoverBg, setUiAlphaViaSlider, showToast, state, syncBgVideoPlayback, Tm, updateThemeFromState }, backgroundPart);
  const { updateCustomBg, onBackgroundChanged } = backgroundPart;

  // text-only changes (the playbar clock, counters) can't add a slider or a switch: skip the document scan for them
  const addsElements = (/** @type {MutationRecord[]} */ muts) => muts.some((/** @type {MutationRecord} */ m) => Array.prototype.some.call(m.addedNodes, (n) => n.nodeType === 1));

  // ---- the effect and track switches in Settings (app/effectSettings.js) ----
  window.UrielApp.effectSettings({ addsElements, applyFxClip, applyReducedMotionSetting, applyShowAlbums, applyUiOpacity, DEFAULT_UI_ALPHA, discordPresenceOn, el, getAdv, getTrackThumbUrl, initHomeHero, listThumb, loadHomePage, onBackgroundChanged, redrawMesh, refreshMeshCover, refreshStacks, renderLyricsView, setAdv, setCoverBg, showToast, sidebarEl, state, switchView, systemPrefersReducedMotion, Tm, updateAlbumsCount, updateCustomBg, updateDiscordPresence, updateMeshGradient, updateNavIndicator, updateThemeFromState, viz });

  // ---- the animated cover beside the player bar (app/m3Cover.js) ----
  const m3CoverPart = /** @type {UrielM3CoverPart} */ ({});
  function m3cEnabled() { return m3CoverPart.m3cEnabled(); }
  function m3cSetImage(/** @type {string} */ url) { return m3CoverPart.m3cSetImage(url); }
  function m3cDraw(/** @type {number} */ now) { return m3CoverPart.m3cDraw(now); }
  function m3cStart() { return m3CoverPart.m3cStart(); }
  function applyM3Cover() { return m3CoverPart.applyM3Cover(); }
  window.UrielApp.m3Cover({ el, getTrackThumbUrl, isPhoneApp, primaryColor, state, viz }, m3CoverPart);
  const { m3cInit } = m3CoverPart;

  // ---- performance mode, the battery saver, the visualizer and progress bar settings (app/performance.js) ----
  const performancePart = /** @type {UrielPerformancePart} */ ({});
  window.UrielApp.performance({ applyM3Cover, audioEngine, isPhoneApp, showToast, startVisualizers, state, syncBgVideoPlayback, Tm, updateTvkVisualizerLyricsSetting, updateTvkVisualizerOpacity, updateTvkVisualizerSetting, viz }, performancePart);
  const { applyPerfMode } = performancePart;

  // ---- Settings: the categories, back on phones, and search (app/settings.js) ----
  const settingsPart = /** @type {UrielSettingsPart} */ ({});
  function enterSettings() { return settingsPart.enterSettings(); }
  window.UrielApp.settings({ el, refreshStacks, reloadPluginsList }, settingsPart);

  // ---- Ctrl+Shift+R turns every plugin off (app/themes.js) ----
  window.UrielApp.themes({ Tm, showToast, stopAllPlugins, renderPluginCards });

  // ---- plugins and the custom CSS editor (app/plugins.js) ----
  const pluginsPart = /** @type {UrielPluginsPart} */ ({});
  function emitPluginEvent(/** @type {string} */ event, /** @type {unknown} */ data = undefined) { return pluginsPart.emitPluginEvent(event, data); }
  function reloadPluginsList() { return pluginsPart.reloadPluginsList(); }
  function stopAllPlugins() { return pluginsPart.stopAllPlugins(); }
  function renderPluginCards() { return pluginsPart.renderPluginCards(); }
  window.UrielApp.plugins({ showToast, Tm, state, el, T }, pluginsPart);
  const { loadPlugins } = pluginsPart;

  // ---- slider ticks and the look of the switches (app/controls.js) ----
  window.UrielApp.controls({ addsElements });

  // ---- the app window: media keys, the welcome's choices, compact layout, mini player (app/desktop.js) ----
  const desktopPart = /** @type {UrielDesktopPart} */ ({});
  window.UrielApp.desktop({ handleMediaCommand, onBackgroundChanged, setSiteTheme, showToast, SITE_THEMES, state, Tf, Tm, updateCustomBg }, desktopPart);
  const { toggleMiniWindow } = desktopPart;

  // ---- Settings → Interface → Language, the picker (app/language.js) ----
  window.UrielApp.language({ I18N, TRANSLATION_LANGUAGES, Tm, showToast });

  // ---- Settings → Lyrics: auto-translate and how synced lyrics move and look (app/lyricsSettings.js) ----
  window.UrielApp.lyricsSettings({ TRANSLATION_LANGUAGES, applyLyricsEase, applyLyricsGradientTightness, el, fetchAndApplyTranslation, getLyricsEase, getLyricsGradientTightness, getLyricsSpeed, getLyricsWordStyle, renderLyricsView, state, updateActiveGradient, updateLyricsTranslationUI, updateSyncedLyricsHighlight });

  if (el.btnResetAudio) {
    el.btnResetAudio.addEventListener('click', () => {
      state.activePresetId = 'p_default';
      state.audioSettings = { speed: 1.0, speedPitch: 1.0, pitch: 0, reverb: 0, distortion: 0, volume: 1.0, echo: 0, eq: { low: 0, mid: 0, high: 0 }, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
      state.hqSettings = { engine: 'hqmusic-3', preset: 'studio', vocal: 0, air: 0, bass: 0 };
      state.hqEnabled = false;
      syncSettingsSlidersToState();
      applyAudioSettings();
      applyHqSettings();
      renderPresets();
      showToast(Tm('Audio settings reset'), 'info');
    });
  }

  const toggleNormalize = document.getElementById('toggle-normalize');
  if (toggleNormalize) {
    const isNorm = localStorage.getItem('uriel_audio_normalize') === '1';
    toggleNormalize.classList.toggle('active', isNorm);
    toggleNormalize.addEventListener('click', () => {
      const active = !toggleNormalize.classList.contains('active');
      toggleNormalize.classList.toggle('active', active);
      localStorage.setItem('uriel_audio_normalize', active ? '1' : '0');
      if (!active) resetLevelWatcher();
    });
  }

  if (window.electronAPI && window.electronAPI.getAppVersion) {
    window.electronAPI.getAppVersion().then((/** @type {string} */ v) => {
      const a = document.getElementById('about-version'); if (a) a.textContent = 'Version ' + v;
      const t = document.querySelector('.settings-version-tag'); if (t) t.textContent = 'v' + v;
    }).catch(() => {});
  }

  // ---- keyboard shortcuts (app/shortcuts.js) ----
  window.UrielApp.shortcuts({ applyAudioSettings, closeModal, closeTvKaraoke, el, handleSyncLineClick, openTvKaraoke, persistVolumeState, playNext, playPrev, resetTvIdleTimer, state, switchView, syncState, syncVolumeControls, toggleMiniWindow, togglePlayPause });

  function createWavyProgress(/** @type {HTMLElement} */ container) {
    const W = 240, H = 12, WL = 16; let d = `M0 ${H/2}`;
    for (let x = 0; x < W; x += WL) d += ` q ${WL/4} ${-H/2} ${WL/2} 0 t ${WL/2} 0`;
    container.innerHTML = `<svg class="wavy" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="wavy-track" pathLength="100" d="${d}"/><path class="wavy-fill" pathLength="100" d="${d}"/></svg>`;
    // the fill is cut to the progress, not drawn as a dash: with a stroke that doesn't stretch, Chrome measures dashes
    // in screen pixels, so a dash "the path's length" long was shorter than the bar. 0% showed a piece filled at the
    // right end that emptied as it went, and 100% filled only half
    const fill = /** @type {HTMLElement} */ (container.querySelector('.wavy-fill'));
    const set = (/** @type {number} */ p) => { fill.style.clipPath = `inset(0 ${100 - Math.max(0, Math.min(100, p))}% 0 0)`; };
    set(0);
    return { set };
  }
  window.createWavyProgress = createWavyProgress;

  /** @template T, R */
  async function pool(/** @type {T[]} */ items, /** @type {number} */ n, /** @type {(item: T, index: number) => Promise<R>} */ fn) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await fn(items[cur], cur);
      }
    }
    const workers = Array.from({ length: Math.min(n, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  // tidying names for matching and reading lengths: shared with the importers (import-core.js)
  function normalizeImportText(/** @type {string | undefined} */ str) { return window.UrielImportCore.normalizeImportText(str); }
  function toSeconds(/** @type {unknown} */ dur) { return window.UrielImportCore.toSeconds(dur); }

  // ---- importing from Spotify, Apple Music, YouTube Music and links (app/imports.js) ----
  const importsPart = /** @type {UrielImportsPart} */ ({});
  function refreshYtSignin() { return importsPart.refreshYtSignin(); }
  function syncPlaylistFromSource(/** @type {UrielPlaylist} */ pl) { return importsPart.syncPlaylistFromSource(pl); }
  window.UrielApp.imports({ normalizeImportText, state, pool, escapeHtml, T, openModal, closeModal, getTrackCanonicalId, stampAddedAt, createWavyProgress, updateFavoritesBadge, updateFavoriteIcon, renderFavoritesView, createPlaylist, showToast, renderPlaylistsList, I18N, Tm, isSameTrack, openPlaylistDetail, isFavoriteSong, importSharedPlaylist, setPlatform, el }, importsPart);
  const { matchSpotifyTracks } = importsPart;

  // ---- downloads: one song, a whole playlist or album, and the queue (app/downloads.js) ----
  const downloadsPart = /** @type {UrielDownloadsPart} */ ({});
  function openDownloadModal(/** @type {UrielTrack} */ track) { return downloadsPart.openDownloadModal(track); }
  function openDownloadAllModal(/** @type {UrielDownloadJob | UrielPlaylist | undefined} */ playlist) { return downloadsPart.openDownloadAllModal(playlist); }
  function updateDownloadCaptionPath() { return downloadsPart.updateDownloadCaptionPath(); }
  function downloadedInFolder(/** @type {UrielTrack[]} */ tracks) { return downloadsPart.downloadedInFolder(tracks); }
  // the song the download dialog is open for (the dialog's Trim pane works on it)
  function getTrackToDownload() { return downloadsPart.getTrackToDownload(); }
  window.UrielApp.downloads({ I18N, T, Tf, Tm, audioEngine, closeModal, el, formatDuration, isPhoneApp, isSameTrack, multiSel, offlineChanged, openModal, prepareTrimPane, refreshPlaylistDownloads, showDownloadPane, showToast, sortTracksFor, state, toolsReady }, downloadsPart);

  updateFavoritesBadge();
  fetch(`http://127.0.0.1:${state.serverPort}/api/library`).then(r => r.json()).then(data => {
    state.localTracks = data;
    updateLocalBadge();
  }).catch(() => {});
  renderPlaylistsList();
  renderPresets();
  syncSettingsSlidersToState();
  applyVisualEffects();

  // ---- My Wave, Jump back in and For you on Home (app/wave.js) ----
  const wavePart = /** @type {UrielWavePart} */ ({});
  function getTrackNormalizedKey(/** @type {string | undefined} */ artist, /** @type {string | undefined} */ title) { return wavePart.getTrackNormalizedKey(artist, title); }
  function recordWaveSkip(/** @type {UrielTrack} */ track) { return wavePart.recordWaveSkip(track); }
  function extendMyWaveQueue() { return wavePart.extendMyWaveQueue(); }
  function getCoverDominantColors(/** @type {string} */ url) { return wavePart.getCoverDominantColors(url); }
  function syncHomeAmbientVisibility() { return wavePart.syncHomeAmbientVisibility(); }
  function initHomeHero() { return wavePart.initHomeHero(); }
  /** @param {boolean} [force] */
  function loadForYou(force) { return wavePart.loadForYou(force); }
  function loadHomePage(isRefresh = false) { return wavePart.loadHomePage(isRefresh); }
  window.UrielApp.wave({ capMap, el, escapeHtml, getAdv, getBlocks, getMixFeedback, getTrackCanonicalId, getTrackThumbUrl, homeReady: () => spHomeReady, I18N, isBlocked, isPhoneApp, isSpotifyHome, Lib, listThumb, offlineState, openArtistProfile, performSearch, playTrack, renderMadeForYou, renderQueueView, safeJson, showToast, state, T, THUMB_FALLBACK, Tm, trackArtCandidates, updateQueueBadge }, wavePart);
  const { computeTasteProfile } = wavePart;
  const { normalizeArtistName, getWaveAvoid, warmHomeSongs } = wavePart;
  const analysisCache = wavePart.analysisCache;

  // ---- the Artists tab (#10): the artists you follow, like the Albums tab; Settings > Tracks > Show Artists tab ----
  function updateArtistsCount() {
    const n = getFollowedArtists().filter((a) => a && a.name).length;
    const badge = document.getElementById('artists-count');
    if (badge) badge.textContent = String(n);
    const sub = document.getElementById('artists-subtitle');
    if (sub) sub.textContent = n === 1 ? T('1 artist followed') : Tf('{0} artists followed', n);
  }
  function renderArtistsTab() {
    const grid = document.getElementById('followed-artists-grid');
    if (!grid) return;
    const list = getFollowedArtists().filter((a) => a && a.name);
    updateArtistsCount();
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = `<div class="empty-hint">${escapeHtml(T('No artists yet. Open an artist and tap Follow to see them here.'))}</div>`;
      return;
    }
    sortedLibrary('artists', list).forEach((a) => grid.appendChild(followedArtistCard(a)));
    if (state.serverPort) fetchFollowedMeta(list);
  }
  const btnShowArtists = document.getElementById('btn-show-artists');
  function applyShowArtists() {
    const show = localStorage.getItem('uriel_show_artists') === '1';
    document.body.classList.toggle('hide-artists-tab', !show);
    const nav = document.getElementById('nav-artists');
    if (nav) nav.classList.toggle('nav-collapsed', !show);
    if (btnShowArtists) btnShowArtists.classList.toggle('active', show);
    if (!show && state.currentView === 'artists') switchView('discover');
    updateArtistsCount();
    refreshStacks();
    updateNavIndicator(false);
  }
  if (btnShowArtists) {
    btnShowArtists.addEventListener('click', () => {
      localStorage.setItem('uriel_show_artists', localStorage.getItem('uriel_show_artists') === '1' ? '0' : '1');
      applyShowArtists();
    });
  }
  applyShowArtists();

  // ---- the Home rows: the layout, quick picks, Daily Mixes, Trending now, your artists (app/home.js) ----
  const home = /** @type {UrielHomePart} */ ({});
  function isSpotifyHome() { return home.isSpotifyHome(); }
  function renderFollowedArtists() { return home.renderFollowedArtists(); }
  function renderMadeForYou() { return home.renderMadeForYou(); }
  function readDailyMixes() { return home.readDailyMixes(); }
  function artistPlays(/** @type {string} */ name) { return home.artistPlays(name); }
  function followedArtistCard(/** @type {UrielArtist} */ a) { return home.followedArtistCard(a); }
  function fetchFollowedMeta(/** @type {UrielArtist[]} */ list) { return home.fetchFollowedMeta(list); }
  function renderSpotifyHome() { return home.renderSpotifyHome(); }
  var spHomeReady = false;
  window.UrielApp.home({
    state, Lib, escapeHtml, getAdv, playTrack, safeJson, showToast, compactCount, getFollowedArtists, getTrackThumbUrl, bindHorizontalWheel, updateRowFade, switchView, getTrackCanonicalId, listThumb, openPlaylistDetail, renderPlaylistCover, computeTasteProfile, normalizeArtistName, getWaveAvoid, isBlocked, openAlbum, warmHomeSongs, openArtistProfile, setFollowedArtists, updateArtistsCount, renderArtistsTab, syncHomeAmbientVisibility,
    homeReady: () => spHomeReady, getWaveTracks: () => wavePart.getWaveTracks(),
  }, home);
  spHomeReady = true;
  home.applyHomeLayout();

  // ---- Settings → Storage: the cache, music on this device, folders and offline songs (app/storage.js) ----
  const storagePart = /** @type {UrielStoragePart} */ ({});
  /** @param {Record<string, unknown>} [change] */
  function updateDeviceMusicUI(change) { return storagePart.updateDeviceMusicUI(change); }
  function updateOfflineStorageUI() { return storagePart.updateOfflineStorageUI(); }
  function updateMusicFolderUI() { return storagePart.updateMusicFolderUI(); }
  function updateDownloadFolderUI() { return storagePart.updateDownloadFolderUI(); }
  // the window can be hidden before this part has started
  function pauseCacheBars() { if (storagePart.pauseCacheBars) storagePart.pauseCacheBars(); }
  function resumeCacheBars() { if (storagePart.resumeCacheBars) storagePart.resumeCacheBars(); }
  // savePlaylists is defined further down, so it is looked up when a restore saves, not now
  window.UrielApp.storage({ T, Tf, Tm, closeModal, createPlaylist, el, escapeHtml, getTrackThumbUrl, getTrackToDownload, isSameTrack, listThumb, offlineChanged, openModal, openPlaylistDetail, renderLocalView, savePlaylists: () => savePlaylists(), showToast, stampAddedAt, state, updateDownloadCaptionPath }, storagePart);

  const btnOpenShortcuts = document.getElementById('btn-open-shortcuts');
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const btnCloseShortcutsModal = document.getElementById('btn-close-shortcuts-modal');
  if (btnOpenShortcuts && shortcutsModal) btnOpenShortcuts.addEventListener('click', () => openModal(shortcutsModal));
  if (btnCloseShortcutsModal && shortcutsModal) btnCloseShortcutsModal.addEventListener('click', () => closeModal(shortcutsModal));

  const btnCopyDiagnostics = document.getElementById('btn-copy-diagnostics');
  if (btnCopyDiagnostics) {
    btnCopyDiagnostics.addEventListener('click', async () => {
      const api = window.electronAPI || {};
      let text = '';
      try {
        if (typeof api.getDiagnostics === 'function') text = await api.getDiagnostics();
        else {
          // phones: no main process to ask, so the app's own details and its error log
          text = [`Uriel ${(window.URIEL_BUILD && window.URIEL_BUILD.version) || ''} (${(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'})`,
            navigator.userAgent, `Language ${navigator.language}`, '--- log ---', window.UrielLog ? window.UrielLog.text() : 'no log'].join('\n');
        }
      } catch (e) { text = `Diagnostics failed: ${(e instanceof Error ? e.message : String(e))}`; }
      if (await copyText(text)) showToast(Tm('Diagnostics copied. Paste it into your report'), 'info');
      else showToast(Tm("Couldn't copy the diagnostics"), 'error');
    });
  }

  const btnOpenLogs = document.getElementById('btn-open-logs');
  if (btnOpenLogs) {
    btnOpenLogs.addEventListener('click', async () => {
      const api = window.electronAPI || {};
      if (typeof api.openLogsFolder === 'function') api.openLogsFolder();
      // phones have no folder to open: share the log instead
      else if (typeof api.shareText === 'function') {
        const res = await api.shareText('Uriel error log', window.UrielLog ? window.UrielLog.text() : 'no log');
        if (res === 'copied') showToast(Tm('Log copied to clipboard'), 'info');
      }
    });
  }

  // the clipboard: the desktop app's own (always allowed), else the page's, else the old select-and-copy
  async function copyText(/** @type {string} */ text) {
    const api = window.electronAPI || {};
    try { if (typeof api.copyText === 'function') { await api.copyText(text); return true; } } catch (e) {}
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  // ---- the Track art dialog: a song's own cover and banner (app/trackArt.js) ----
  const trackArtPart = /** @type {UrielTrackArtPart} */ ({});
  function openTrackArtModal(/** @type {UrielTrack} */ track, /** @type {HTMLElement | null} */ triggerEl = null) { return trackArtPart.openTrackArtModal(track, triggerEl); }
  function applyTrackBannerFx(/** @type {UrielTrackArt | null} */ art) { return trackArtPart.applyTrackBannerFx(art); }
  window.UrielApp.trackArt({ I18N, LiquidMotion, T, Tm, YT_THUMB, analysisCache, closeModal, coverAnalysisCache, el, getTrackArt, getTrackCanonicalId, getTrackThumbUrl, isSameTrack, listThumb, m3cSetImage, nextTrackArt, setTrackArt, showToast, state, syncTvBanner, trackArtCandidates, trackYoutubeId, updateMediaSession, updateThemeFromState }, trackArtPart);

  // ---- who wrote and produced the song, under its lyrics (app/credits.js) ----
  window.UrielApp.credits({ state, T });

  // Search results: All / Songs / Artists / Albums (from Riff 43.1). Only shows or hides the sections, so the
  // choice stays for the next search.
  (function initSearchFilterChips() {
    const box = el.searchResultsContainer;
    const chips = document.getElementById('search-filter-chips');
    if (!box || !chips) return;
    chips.addEventListener('click', (e) => {
      const chip = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('.chip-btn[data-filter]'));
      if (!chip) return;
      box.dataset.filter = chip.dataset.filter;
      chips.querySelectorAll('.chip-btn').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    });
  })();

  // The mouse's back button goes back like the page's own Back button (from Riff 43.1; computers)
  (function initMouseBack() {
    if (isPhoneApp) return;
    const back = (/** @type {MouseEvent} */ e) => {
      if (e.button !== 3) return;
      e.preventDefault();
      if (e.type !== 'mouseup') return;
      if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
      const btn = ['btn-back-artist', 'btn-back-album', 'btn-back-playlists', 'btn-settings-back']
        .map((id) => document.getElementById(id)).find((b) => b && b.offsetParent !== null && b.closest('.content-view.active'));
      if (btn) { btn.click(); return; }
      if (state.previousView && state.previousView !== state.currentView && state.currentView !== 'discover') switchView(state.previousView);
    };
    window.addEventListener('mousedown', back, true);
    window.addEventListener('mouseup', back, true);
  })();

  loadPlugins();
  loadHomePage();
  initHomeHero();
  resizeCanvases();
  updateOfflineStorageUI();
  updateMusicFolderUI();
  updateDownloadFolderUI();
  checkToolsStatus(false);
  setLyricsEmpty(true);
  updateLyricsTranslationUI();
  enterSettings();
  refreshStacks();
  requestAnimationFrame(() => requestAnimationFrame(refreshStacks));
  initTvk();
  if (typeof m3cInit === 'function') m3cInit();
  requestAnimationFrame(() => requestAnimationFrame(() => updateNavIndicator(false)));

  // ---- the sleep timer (app/sleepTimer.js) ----
  const sleepTimerPart = /** @type {UrielSleepTimerPart} */ ({});
  function updateSleepTimerUI() { return sleepTimerPart.updateSleepTimerUI(); }
  window.UrielApp.sleepTimer({ Tm, audioEngine, el, pauseSmooth, showToast, state }, sleepTimerPart);

  /** @type {ReturnType<typeof setTimeout> | null} */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let queueSaveTimer = null;

  function saveQueueState() {
    if (!state._queueRestored) return;
    try {
      // the song brought back from last time isn't loaded until it plays: its place is still the one it was saved at
      // (going to the background before playing used to save 0, and the song then started over)
      const loaded = el.nativeAudio && el.nativeAudio.src;
      const position = loaded ? (Number.isFinite(el.nativeAudio.currentTime) ? el.nativeAudio.currentTime : 0) : (Number(state.queueRestorePosition) || 0);
      // up to 1000 songs around the current one: a queue made from a long Liked Songs list was megabytes, filled
      // the browser storage and made every save fail and retry (seconds, on each pause and on closing)
      const all = Array.isArray(state.queue) ? state.queue : [];
      const idx = Math.max(0, state.queueIndex);
      const from = all.length > 1000 ? Math.max(0, Math.min(idx - 100, all.length - 1000)) : 0;
      localStorage.setItem('uriel_queue_state', JSON.stringify({
        queue: from || all.length > 1000 ? all.slice(from, from + 1000) : all,
        queueIndex: state.queueIndex - from,
        currentTrack: state.currentTrack,
        position
      }));
    } catch (e) {}
  }

  function scheduleQueueSave() {
    if (queueSaveTimer) clearTimeout(queueSaveTimer);
    queueSaveTimer = setTimeout(saveQueueState, 600);
  }

  function restoreQueueState() {
    state._queueRestored = true;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('uriel_queue_state') || 'null');
    } catch (e) {}
    if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) return;
    if (state.currentTrack) return;
    state.queue = saved.queue;
    state.queueIndex = Number.isInteger(saved.queueIndex) && saved.queueIndex >= 0 && saved.queueIndex < saved.queue.length
      ? saved.queueIndex
      : 0;
    state.queueHistory = [state.queueIndex];
    const track = saved.currentTrack && typeof saved.currentTrack === 'object' ? saved.currentTrack : state.queue[state.queueIndex];
    state.queueRestorePosition = Number(saved.position) || 0;
    state.currentTrack = track || null;
    if (state.currentTrack) updateNowPlayingUI(state.currentTrack);
    onTrackAudioTrackChange();
    updateQueueBadge();
    if (el.queueCount) {
      el.queueCount.classList.remove('restored');
      void el.queueCount.offsetWidth;
      el.queueCount.classList.add('restored');
    }
    renderQueueView();
  }

  window.addEventListener('beforeunload', saveQueueState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveQueueState();
  });
  // and every so often while it plays: a phone ends the app without either of those, and the song started over
  setInterval(() => { if (state.isPlaying) saveQueueState(); }, 15000);

  function openAudioTab(/** @type {string} */ name) {
    const tab = /** @type {HTMLElement} */ (document.querySelector(`.audio-tab[data-audio-tab="${name}"]`));
    if (tab) tab.click();
    if (el.audioSettingsModal) openModal(el.audioSettingsModal);
    refreshStacks();
  }

  // ---- the command palette, Ctrl+K (app/palette.js) ----
  window.UrielApp.palette({ T, Tf, closeModal, el, escapeHtml, getTrackCanonicalId, matchesTrackQuery, openAudioTab, openModal, openPlaylistDetail, performSearch, playTrack, state, switchView, updateLocalBadge });

  function renderPlaylistDuplicateButton(/** @type {UrielPlaylist} */ pl) {
    if (!el.btnDedupePlaylist || !pl) return;
    const duplicates = pl.tracks.length - dedupeTracks(pl.tracks, isSameTrack, getTrackCanonicalId).length;
    el.btnDedupePlaylist.classList.toggle('hidden', duplicates === 0);
    if (el.btnDedupePlaylistLabel) {
      el.btnDedupePlaylistLabel.textContent = duplicates === 1 ? 'Remove 1 duplicate' : `Remove ${duplicates} duplicates`;
    }
  }

  function removePlaylistDuplicates() {
    const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
    if (!pl) return;
    const before = pl.tracks.length;
    pl.tracks = dedupeTracks(pl.tracks, isSameTrack, getTrackCanonicalId);
    const removed = before - pl.tracks.length;
    if (!removed) return;
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    openPlaylistDetail(pl.id);
    renderPlaylistsList();
    showToast(removed === 1 ? Tm('Removed 1 duplicate') : Tm('Removed {0} duplicates', removed));
  }

  if (el.btnDedupePlaylist) el.btnDedupePlaylist.addEventListener('click', removePlaylistDuplicates);

  // ======================= Riff 43: player & look =======================
  // Everything below is from Riff 43, fitted to Uriel. Variables are `var` because code above (lyrics, the
  // player events) can call these functions before this part of the file has run.

  // a Settings dropdown (trigger + menu of .m3-dropdown-option) that saves its value under `key`
  function wireSettingDropdown(/** @type {string} */ id, /** @type {string} */ key, /** @type {string} */ fallback, /** @type {(value: string) => void} */ onPick) {
    const dd = document.getElementById(`${id}-dropdown`);
    const trigger = document.getElementById(`${id}-trigger`);
    const menu = document.getElementById(`${id}-menu`);
    const label = document.getElementById(`${id}-label`);
    if (!dd || !trigger || !menu) return;
    const show = (/** @type {string} */ val) => {
      /** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('.m3-dropdown-option')).forEach((o) => {
        const sel = o.dataset.value === val;
        o.classList.toggle('selected', sel);
        if (sel && label) label.textContent = o.textContent;
      });
    };
    show(localStorage.getItem(key) || fallback);
    trigger.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('open'); });
    /** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('.m3-dropdown-option')).forEach((o) => o.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem(key, String(o.dataset.value));
      show(o.dataset.value || '');
      dd.classList.remove('open');
      if (onPick) onPick(o.dataset.value || '');
    }));
    document.addEventListener('click', () => dd.classList.remove('open'));
  }

  // ---- hiding the titlebar, intensity on the background, icon packs, the icon on the Home button (app/look.js) ----
  var { applyIconPack } = window.UrielApp.look({ isPhoneApp, getAdv, setAdv, updateThemeFromState, showToast, escapeHtml, Tm, wireSettingDropdown });

  // ---- playbar visualizer: compact (right of the bar) or wide behind the bar; bars or one liquid wave ----
  (function setupBarVisualizer() {
    const group = document.getElementById('bar-viz-pos-group');
    const applyPos = (/** @type {string | undefined} */ pos) => {
      document.body.classList.toggle('bar-viz-behind', pos === 'behind' && !isPhoneApp);
      if (group) /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.theme-mode-btn')).forEach((b) => b.classList.toggle('active', b.dataset.barVizPos === pos));
      resizeCanvases();
      if (state.isPlaying) startVisualizers();
    };
    applyPos(localStorage.getItem('uriel_bar_viz_pos') || 'behind');
    if (group) /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.theme-mode-btn')).forEach((b) => b.addEventListener('click', () => {
      localStorage.setItem('uriel_bar_viz_pos', String(b.dataset.barVizPos));
      applyPos(b.dataset.barVizPos);
    }));

    const slider = /** @type {HTMLInputElement} */ (document.getElementById('slider-bar-viz-opacity'));
    const val = document.getElementById('val-bar-viz-opacity');
    const applyOpacity = (/** @type {string} */ v) => {
      const n = Math.max(5, Math.min(85, parseInt(v, 10) || 22));
      document.documentElement.style.setProperty('--bar-viz-opacity', String(n / 100));
      if (val) val.textContent = `${n}%`;
      if (slider && String(slider.value) !== String(n)) slider.value = String(n);
    };
    applyOpacity(localStorage.getItem('uriel_bar_viz_opacity') || '22');
    if (slider) slider.addEventListener('input', (e) => { localStorage.setItem('uriel_bar_viz_opacity', /** @type {HTMLInputElement} */ (e.target).value); applyOpacity(/** @type {HTMLInputElement} */ (e.target).value); });

    const btns = /** @type {HTMLElement[]} */ ([document.getElementById('btn-viz-connected'), document.getElementById('btn-tvk-viz-connected')].filter(Boolean));
    const sync = () => btns.forEach((b) => b.classList.toggle('active', viz.connected));
    btns.forEach((b) => b.addEventListener('click', () => {
      viz.connected = !viz.connected;
      localStorage.setItem('uriel_viz_connected', viz.connected ? '1' : '0');
      sync();
    }));
    sync();
  })();

  // ---- song radio and sharing the playing song (app/radio.js) ----
  const radioPart = /** @type {UrielRadioPart} */ ({});
  function songRadioEnabled() { return radioPart.songRadioEnabled(); }
  function startSongRadio(/** @type {UrielTrack[]} */ seeds) { return radioPart.startSongRadio(seeds); }
  window.UrielApp.radio({ Lib, state, getBlocks, isBlocked, Tm, showToast, isSameTrack, updateQueueBadge, playTrack, el, I18N, sharePlaylist }, radioPart);

  // ---- the fullscreen karaoke, lyrics under the mini player, the lyrics source and word timings (app/lyrics.js) ----
  const lyricsPart = /** @type {UrielLyricsPart} */ ({});
  function miniLyricsShown() { return lyricsPart.miniLyricsShown(); }
  function updateMiniLyricsHighlight(/** @type {number} */ currentTime) { return lyricsPart.updateMiniLyricsHighlight(currentTime); }
  function renderMiniLyrics() { return lyricsPart.renderMiniLyrics(); }
  function lyricsSourcePref() { return lyricsPart.lyricsSourcePref(); }
  function fetchAndUpgradeWords(/** @type {string} */ title, /** @type {string} */ artist, /** @type {number} */ token) { return lyricsPart.fetchAndUpgradeWords(title, artist, token); }
  function lyricWordSpans(/** @type {UrielLyricLine} */ line) { return lyricsPart.lyricWordSpans(line); }
  function lineTimedWords(/** @type {UrielLyricLine} */ line) { return lyricsPart.lineTimedWords(line); }
  function timedWordIndex(/** @type {UrielTimedWord[]} */ timed, /** @type {number} */ t) { return lyricsPart.timedWordIndex(timed, t); }
  function setTvkAmbient(/** @type {boolean} */ on) { return lyricsPart.setTvkAmbient(on); }
  function syncTvkAmbientPlayback() { return lyricsPart.syncTvkAmbientPlayback(); }
  function syncTvkProgress(/** @type {number} */ cur, /** @type {number} */ dur) { return lyricsPart.syncTvkProgress(cur, dur); }
  window.UrielApp.lyrics({ state, formatDuration, el, updateMediaPositionState, rgbToHsl, hexToRgb, hslToHex, getTrackThumbUrl, isPhoneApp, resetTvIdleTimer, getAdv, getLineStartTime, getLineEndTime, escapeHtml, fetchAndApplyTranslation, renderLyricsView, updateSyncedLyricsHighlight, loadSyncedLyrics, wireSettingDropdown, getTvIdleTimer: () => tvKaraokePart.getTvIdleTimer() }, lyricsPart);

  // ---- stream timeout: a song that has loaded nothing for this long is given up on ----
  (function setupStreamTimeout() {
    const slider = /** @type {HTMLInputElement} */ (document.getElementById('slider-stream-timeout'));
    const val = document.getElementById('val-stream-timeout');
    const seconds = () => Math.max(5, Math.min(30, parseInt(localStorage.getItem('uriel_stream_timeout') || '12', 10) || 12));
    const show = () => { if (val) val.textContent = `${seconds()}s`; if (slider) slider.value = String(seconds()); };
    show();
    if (slider) slider.addEventListener('input', (e) => { localStorage.setItem('uriel_stream_timeout', /** @type {HTMLInputElement} */ (e.target).value); show(); });
    const audio = el.nativeAudio;
    if (!audio) return;
    // checked once a second while a song with a source is loading; anything new buffered counts as progress
    /** @type {ReturnType<typeof setInterval> | null} */
    let poll = null;
    let token = -1;
    let lastProgressAt = 0;
    let lastBuffered = -1;
    const stop = () => { if (poll) clearInterval(poll); poll = null; };
    const bufferedEnd = () => { try { const b = audio.buffered; return b.length ? b.end(b.length - 1) : 0; } catch (e) { return 0; } };
    const giveUp = () => {
      stop();
      if (playback.hls) { try { playback.hls.destroy(); } catch (e) {} playback.hls = null; }
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
      state.isPlaying = false;
      document.body.classList.remove('is-playing');
      if (retryFresh(token, state.currentTrack)) return;
      updatePlayPauseButton(false, false);
      if (!skipUnplayable(token, state.currentTrack)) showPlayFailure(Tm('This song took too long to load. Try again or skip.'));
    };
    const arm = () => {
      stop();
      if (!state.trackLoading || !state.currentTrack || state.currentTrack.platform === 'local') return;
      if (!audio.getAttribute('src') && !playback.hls) return;
      token = state.loadToken;
      lastProgressAt = Date.now();
      lastBuffered = -1;
      poll = setInterval(() => {
        if (token !== state.loadToken || !state.trackLoading || (!audio.paused && audio.currentTime > 0)) { stop(); return; }
        const b = bufferedEnd() + audio.readyState * 1e-3;
        if (b !== lastBuffered) { lastBuffered = b; lastProgressAt = Date.now(); return; }
        if (Date.now() - lastProgressAt > seconds() * 1000) giveUp();
      }, 1000);
    };
    audio.addEventListener('loadstart', () => setTimeout(arm, 0));
    audio.addEventListener('playing', stop);
  })();

  // ======================= end of Riff 43: player & look =======================

  restoreQueueState();

  emitPluginEvent('ready');

  // ---- Core API for the iPhone interface (mobile/ui), which draws its own screens on this engine ----
  const savePlaylists = () => { localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists)); renderPlaylistsList(); window.dispatchEvent(new Event('uriel:library')); };
  window.UrielCore = {
    state,
    audio: el.nativeAudio,
    base: () => `http://127.0.0.1:${state.serverPort}`,
    thumb: (/** @type {UrielTrack} */ t) => getTrackThumbUrl(t),
    playTrack: (/** @type {UrielTrack} */ track, /** @type {UrielTrack[]} */ list, /** @type {number} */ index) => playTrack(track, list || null, typeof index === 'number' ? index : -1),
    togglePlay: () => togglePlayPause(),
    restoreAt: (/** @type {number} */ index, /** @type {number} */ position, /** @type {boolean} */ play) => restoreQueueAt(index, position, play),
    adoptAt: (/** @type {number} */ index) => adoptQueueAt(index),
    resumeAudio: () => audioEngine && audioEngine.resumeAudioContext && audioEngine.resumeAudioContext(),
    next: () => playNext(),
    prev: () => playPrev(),
    seek: (/** @type {number} */ sec) => { if (isFinite(sec)) el.nativeAudio.currentTime = Math.max(0, sec); },
    toggleShuffle: () => { if (el.btnShuffle) el.btnShuffle.click(); return state.isShuffle; },
    toggleRepeat: () => { if (el.btnRepeat) el.btnRepeat.click(); return state.repeatMode; },
    isFavorite: (/** @type {UrielTrack} */ t) => isFavoriteSong(t),
    toggleFavorite: (/** @type {UrielTrack} */ t) => { toggleFavoriteTrack(t); window.dispatchEvent(new Event('uriel:library')); return isFavoriteSong(t); },
    createPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ tracks = []) {
      if (!name || !name.trim()) return null;
      const pl = { id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: name.trim(), tracks: tracks.slice() };
      state.playlists.push(pl);
      savePlaylists();
      return pl;
    },
    renamePlaylist(/** @type {string} */ id, /** @type {string} */ name) { const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === id); if (pl && name && name.trim()) { pl.name = name.trim(); savePlaylists(); } },
    deletePlaylist(/** @type {string} */ id) { state.playlists = state.playlists.filter((/** @type {UrielPlaylist} */ p) => p.id !== id); savePlaylists(); },
    addToPlaylist(/** @type {string} */ id, /** @type {UrielTrack} */ track) {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === id);
      if (!pl || pl.tracks.some((/** @type {UrielTrack} */ t) => isSameTrack(t, track))) return false;
      pl.tracks.push(track);
      savePlaylists();
      return true;
    },
    removeFromPlaylist(/** @type {string} */ id, /** @type {UrielTrack} */ track) { const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === id); if (pl) { pl.tracks = pl.tracks.filter((/** @type {UrielTrack} */ t) => !isSameTrack(t, track)); savePlaylists(); } },
    playNextInQueue(/** @type {UrielTrack} */ track) {
      const at = Math.max(0, state.queueIndex + 1);
      state.queue.splice(at, 0, track);
      updateQueueBadge();
      window.dispatchEvent(new Event('uriel:queue'));
    },
    addToQueue(/** @type {UrielTrack} */ track) { state.queue.push(track); updateQueueBadge(); window.dispatchEvent(new Event('uriel:queue')); },
    isSameTrack: (/** @type {UrielTrack | null} */ a, /** @type {UrielTrack | null} */ b) => isSameTrack(a, b),
    formatDuration: (/** @type {number | undefined} */ s) => formatDuration(s),
    toast: (/** @type {UrielText} */ msg, /** @type {string} */ kind) => showToast(msg, kind),
    refreshBackground: () => updateCustomBg(),
    // for lastfm.js and backup.js (Last.fm dialog, playlist files, backups)
    openModal: (/** @type {HTMLElement | null} */ m) => openModal(m),
    closeModal: (/** @type {HTMLElement | null} */ m) => closeModal(m),
    importPlaylist(/** @type {string} */ name, /** @type {UrielTrack[]} */ tracks, { cover = '', description = '' } = {}) {
      const pl = createPlaylist(name, tracks || [], cover, { open: false });
      if (pl && description) { pl.description = description; localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists)); }
      if (pl) window.dispatchEvent(new Event('uriel:library'));
      return pl;
    },
    openPlaylist: (/** @type {string} */ id) => openPlaylistDetail(id),
    // songs known only by title and artist, found on YouTube like a Spotify import
    matchTracks: (/** @type {Partial<UrielImportSong>[]} */ list, /** @type {((done: number, total: number) => void) | undefined} */ onProgress) => matchSpotifyTracks(list, onProgress),
    // sync.js wrote these keys with what another device had; show it without a restart
    reloadFromStorage(/** @type {string[]} */ keys) {
      const has = (/** @type {string} */ k) => keys.includes(k);
      if (has('devsize_playlists')) {
        state.playlists = safeArray('devsize_playlists');
        renderPlaylistsList();
        if (state.currentView === 'playlist-detail' && state.currentPlaylistId) {
          if (state.playlists.some((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId)) openPlaylistDetail(state.currentPlaylistId);
          else switchView('local');
        }
      }
      if (has('devsize_favorites')) {
        state.favorites = dedupeFavoriteTracks(safeArray('devsize_favorites'));
        updateFavoritesBadge();
        updateFavoriteIcon();
        if (state.currentView === 'favorites') renderFavoritesView();
      }
      if (has('devsize_history')) {
        state.history = safeArray('devsize_history');
        if (state.currentView === 'history') renderHistoryView();
      }
      // saved albums and followed artists from another device
      if (has('uriel_saved_albums')) {
        updateAlbumsCount();
        if (state.currentView === 'albums') renderSavedAlbums();
        if (state.currentView === 'album') updateSaveAlbumButton();
      }
      if (has('uriel_followed_artists')) {
        renderFollowedArtists();
        if (state.currentView === 'artist') updateFollowButton();
      }
      if (['uriel_theme_mode', 'uriel_theme_accent', 'uriel_theme_intensity', 'uriel_theme_brightness', 'uriel_palette_style', 'uriel_site_theme'].some(has)) {
        state.siteTheme = localStorage.getItem('uriel_site_theme') ?? 'halloween';
        state.themeMode = localStorage.getItem('uriel_theme_mode') || 'dark';
        state.themeAccent = localStorage.getItem('uriel_theme_accent') || '#6750A4';
        state.themeIntensity = parseInt(localStorage.getItem('uriel_theme_intensity') || '0', 10);
        state.themeBrightness = parseInt(localStorage.getItem('uriel_theme_brightness') || '50', 10);
        state.paletteStyle = localStorage.getItem('uriel_palette_style') || 'classic';
        updateThemeFromState();
      }
      if (has('uriel_font')) {
        state.riffFont = localStorage.getItem('uriel_font') || 'google';
        applyFont(state.riffFont);
      }
      if (has('uriel_track_trims')) forgetTrackTrims();
      if (has('uriel_icon_pack')) applyIconPack(localStorage.getItem('uriel_icon_pack') || 'material');
      if (has('uriel_adv_intensity_bg')) updateThemeFromState();
      if (keys.some((/** @type {string} */ k) => k === 'devsize_playlists' || k === 'devsize_favorites')) window.dispatchEvent(new Event('uriel:library'));
    },
  };
  window.dispatchEvent(new Event('uriel:ready'));
});
