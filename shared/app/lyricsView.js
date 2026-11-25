// @ts-check
// The synced lyrics beside the player: loading them, drawing the lines, following the song (line by line or
// word by word, with the karaoke fill), the smooth scroll, and translating them. Part of app.js, which calls
// this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielLyricsViewPart} out */
window.UrielApp.lyricsView = function ({ capMap, lyricsSourcePref, el, fetchAndUpgradeWords, flipAnimate, getAdv, I18N, isPhoneApp, lineTimedWords, lyricWordSpans, miniLyricsShown, renderMiniLyrics, sendStateToServer, state, syncTvLayout, timedWordIndex, updateMiniLyricsHighlight, viz }, out) {
  function setLyricsEmpty(/** @type {boolean} */ isEmpty) {
    const panel = el.rightPanel || document.getElementById('right-panel');
    if (!panel) return;
    const currentlyEmpty = panel.classList.contains('lyrics-empty');
    if (currentlyEmpty === !!isEmpty) {
      syncTvLayout();
      return;
    }

    const hero = el.rightPanelArtworkBox || document.getElementById('right-panel-artwork-box');

    flipAnimate([hero], () => {
      panel.classList.toggle('lyrics-empty', !!isEmpty);
      syncTvLayout();
    }, 380);
    syncTvLayout(!!isEmpty);
  }

  async function loadSyncedLyrics(/** @type {string} */ title, /** @type {string} */ artist, /** @type {number} */ token) {
    if (el.lyricsContainer) {
      el.lyricsContainer.scrollTop = 0;
      el.lyricsContainer.style.transition = 'opacity 200ms cubic-bezier(0.2, 0, 0, 1)';
      el.lyricsContainer.style.opacity = '0';
    }
    if (typeof lyricsScrollRaf !== 'undefined' && lyricsScrollRaf) {
      cancelAnimationFrame(lyricsScrollRaf);
      lyricsScrollRaf = 0;
    }
    state.lastActiveLyricIdx = -1;
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;
    state.syncedLyrics = [];
    state.isCustomLyrics = false;
    // the previous song's translations were shown under the new song's lines until its own translation loaded
    state.currentTranslations = null;
    // the iPhone lock screen / Dynamic Island lyrics (mobile/live-activity.ts) follow state.syncedLyrics
    window.dispatchEvent(new Event('uriel:lyrics'));
    renderMiniLyrics();

    try {
      // skipping through songs fired one lookup (several lrclib requests) per song and got rate limited
      await new Promise(r => setTimeout(r, 350));
      if (token !== state.loadToken) return;
      const onlineParam = getAdv('online_lyrics', true) ? '1' : '0';
      const dur = state.currentTrack && (state.currentTrack.title || '') === title ? Math.round(Number(state.currentTrack.duration) || 0) : 0;
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&online=${onlineParam}${dur ? `&duration=${dur}` : ''}&source=${lyricsSourcePref()}`);
      const data = await res.json();

      if (token !== state.loadToken || (state.currentTrack && (state.currentTrack.title || '') !== title)) return;

      if (!data.success || !data.lyrics) {
        if (el.lyricsContainer) {
          el.lyricsContainer.innerHTML = '';
          el.lyricsContainer.scrollTop = 0;
          el.lyricsContainer.style.opacity = '1';
        }
        setLyricsEmpty(true);
        return;
      }

      state.isCustomLyrics = !!data.isCustom;

      const raw = data.lyrics;
      const lines = raw.split('\n');
      const parsed = [];
      const lrcRegex = /\[(\d+):(\d+(\.\d+)?)\](.*)/;

      for (const line of lines) {
        const match = lrcRegex.exec(line);
        if (match) {
          const min = parseInt(match[1], 10);
          const sec = parseFloat(match[2]);
          const raw = match[4].trim();
          // enhanced LRC: <mm:ss.xx> before each word gives that word its own time
          const words = raw.includes('<') && window.UrielLyricsSources ? window.UrielLyricsSources.parseEnhancedLrcWords(raw, min * 60 + sec + 4) : null;
          const text = words ? raw.replace(/<\d+:\d+(?:\.\d+)?>/g, '').replace(/\s+/g, ' ').trim() : raw;
          if (text) {
            parsed.push(words ? { time: min * 60 + sec, text, words } : { time: min * 60 + sec, text: text });
          }
        } else if (line.trim()) {
          parsed.push({ time: -1, text: line.trim() });
        }
      }

      if (parsed.length === 0) {
        if (el.lyricsContainer) {
          el.lyricsContainer.innerHTML = '';
          el.lyricsContainer.scrollTop = 0;
          el.lyricsContainer.style.opacity = '1';
        }
        setLyricsEmpty(true);
        return;
      }

      state.syncedLyrics = parsed;
      window.dispatchEvent(new Event('uriel:lyrics'));
      const hasSyncTimes = parsed.some(p => p.time >= 0);
      if (state.trEnabled && state.trAuto) {
        state.trActive = true;
        fetchAndApplyTranslation();
      } else {
        state.trActive = false;
        state.currentTranslations = null;
      }
      updateLyricsTranslationUI();
      renderLyricsView();
      setLyricsEmpty(false);
      if (el.lyricsContainer) {
        el.lyricsContainer.scrollTop = 0;
        el.lyricsContainer.style.opacity = '0';
        requestAnimationFrame(() => {
          el.lyricsContainer.style.transition = 'opacity 250ms cubic-bezier(0.2, 0, 0, 1)';
          el.lyricsContainer.style.opacity = '1';
        });
      }
      state.lastActiveLyricIdx = -1;
      state.forceLyricsScroll = true;
      state.forceSnapLyrics = true;
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      if (!data.isCustom) fetchAndUpgradeWords(title, artist, token);
    } catch (e) {
      if (token === state.loadToken) {
        if (el.lyricsContainer) {
          el.lyricsContainer.innerHTML = '';
          el.lyricsContainer.style.opacity = '1';
        }
        setLyricsEmpty(true);
      }
    }
  }

  function getLyricsWordStyle() { return localStorage.getItem('uriel_lyrics_word_style') === 'words' ? 'words' : 'gradient'; }
  function isGradientMode() { return state.lyricsMode === 'word' && getAdv('karaoke_words', true) && getLyricsWordStyle() === 'gradient'; }

  function renderLyricsView() {
    if (!el.lyricsContainer) return;
    if (state.syncedLyrics.length === 0) return;
    el.lyricsContainer.innerHTML = '';

    state.syncedLyrics.forEach((/** @type {{ time: number, text: string }} */ line, /** @type {number} */ index) => {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.id = `lyric-line-${index}`;
      if (isRtlText(line.text)) div.classList.add('rtl');

      if (isGradientMode()) {
        const fill = document.createElement('span');
        fill.className = 'lyric-fill';
        fill.textContent = line.text.replace(/<[^>]+>/g, '').trim();
        div.classList.add('gradient-line');
        div.appendChild(fill);
      } else if (getAdv('karaoke_words', true) && state.lyricsMode === 'word') {
        div.innerHTML = lyricWordSpans(line);
      } else {
        div.textContent = line.text;
      }

      if (state.trActive && state.currentTranslations && state.currentTranslations[index]) {
        const trDiv = document.createElement('div');
        trDiv.className = 'lyric-translation';
        trDiv.dir = 'auto';
        trDiv.textContent = state.currentTranslations[index];
        div.appendChild(trDiv);
      }

      if (line.time >= 0) {
        div.addEventListener('click', () => {
          const seekTime = getLineStartTime(index);
          if (el.nativeAudio && seekTime >= 0) el.nativeAudio.currentTime = seekTime;
        });
      }
      el.lyricsContainer.appendChild(div);
    });
    updateLyricsPadding();
    state.lastActiveLyricIdx = -1;
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;
    if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
  }

  function updateLyricsPadding() {
    const c = el.lyricsContainer;
    if (!c || !c.clientHeight) return;
    const pad = Math.round(c.clientHeight * 0.42);
    c.style.paddingTop = `${pad}px`;
    c.style.paddingBottom = `${pad}px`;
  }
  window.addEventListener('resize', () => {
    updateLyricsPadding();
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;
    state.lastActiveLyricIdx = -1;
    if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
  });
  if (window.ResizeObserver && el.lyricsContainer) {
    let lastObservedH = 0;
    new ResizeObserver((entries) => {
      const h = Math.round(entries[0]?.contentRect?.height || el.lyricsContainer.clientHeight || 0);
      if (h <= 0) {
        lastObservedH = 0;
        return;
      }
      if (Math.abs(h - lastObservedH) > 4) {
        lastObservedH = h;
        updateLyricsPadding();
        state.forceLyricsScroll = true;
        state.forceSnapLyrics = true;
        state.lastActiveLyricIdx = -1;
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      }
    }).observe(el.lyricsContainer);
  }

  const TRANSLATION_LANGUAGES = [
    { code: 'af', name: 'Afrikaans', flag: '🇿🇦' },
    { code: 'sq', name: 'Albanian', flag: '🇦🇱' },
    { code: 'am', name: 'Amharic', flag: '🇪🇹' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'hy', name: 'Armenian', flag: '🇦🇲' },
    { code: 'as', name: 'Assamese', flag: '🇮🇳' },
    { code: 'ay', name: 'Aymara', flag: '🇧🇴' },
    { code: 'az', name: 'Azerbaijani', flag: '🇦🇿' },
    { code: 'bm', name: 'Bambara', flag: '🇲🇱' },
    { code: 'eu', name: 'Basque', flag: '🇪🇸' },
    { code: 'be', name: 'Belarusian', flag: '🇧🇾' },
    { code: 'bn', name: 'Bengali', flag: '🇧🇩' },
    { code: 'bho', name: 'Bhojpuri', flag: '🇮🇳' },
    { code: 'bs', name: 'Bosnian', flag: '🇧🇦' },
    { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
    { code: 'ca', name: 'Catalan', flag: '🇪🇸' },
    { code: 'ceb', name: 'Cebuano', flag: '🇵🇭' },
    { code: 'ny', name: 'Chichewa', flag: '🇲🇼' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' },
    { code: 'zh-TW', name: 'Chinese (Traditional)', flag: '🇹🇼' },
    { code: 'co', name: 'Corsican', flag: '🇫🇷' },
    { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
    { code: 'cs', name: 'Czech', flag: '🇨🇿' },
    { code: 'da', name: 'Danish', flag: '🇩🇰' },
    { code: 'dv', name: 'Dhivehi', flag: '🇲🇻' },
    { code: 'doi', name: 'Dogri', flag: '🇮🇳' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'eo', name: 'Esperanto', flag: '🌐' },
    { code: 'et', name: 'Estonian', flag: '🇪🇪' },
    { code: 'ee', name: 'Ewe', flag: '🇬🇭' },
    { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
    { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'fy', name: 'Frisian', flag: '🇳🇱' },
    { code: 'gl', name: 'Galician', flag: '🇪🇸' },
    { code: 'ka', name: 'Georgian', flag: '🇬🇪' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'el', name: 'Greek', flag: '🇬🇷' },
    { code: 'gn', name: 'Guarani', flag: '🇵🇾' },
    { code: 'gu', name: 'Gujarati', flag: '🇮🇳' },
    { code: 'ht', name: 'Haitian Creole', flag: '🇭🇹' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
    { code: 'haw', name: 'Hawaiian', flag: '🇺🇸' },
    { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'hmn', name: 'Hmong', flag: '🇱🇦' },
    { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
    { code: 'is', name: 'Icelandic', flag: '🇮🇸' },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬' },
    { code: 'ilo', name: 'Ilocano', flag: '🇵🇭' },
    { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
    { code: 'ga', name: 'Irish', flag: '🇮🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'jw', name: 'Javanese', flag: '🇮🇩' },
    { code: 'kn', name: 'Kannada', flag: '🇮🇳' },
    { code: 'kk', name: 'Kazakh', flag: '🇰🇿' },
    { code: 'km', name: 'Khmer', flag: '🇰🇭' },
    { code: 'rw', name: 'Kinyarwanda', flag: '🇷🇼' },
    { code: 'gom', name: 'Konkani', flag: '🇮🇳' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'kri', name: 'Krio', flag: '🇸🇱' },
    { code: 'ku', name: 'Kurdish (Kurmanji)', flag: '🇹🇷' },
    { code: 'ckb', name: 'Kurdish (Sorani)', flag: '🇮🇶' },
    { code: 'ky', name: 'Kyrgyz', flag: '🇰🇬' },
    { code: 'lo', name: 'Lao', flag: '🇱🇦' },
    { code: 'la', name: 'Latin', flag: '🏛️' },
    { code: 'lv', name: 'Latvian', flag: '🇱🇻' },
    { code: 'ln', name: 'Lingala', flag: '🇨🇩' },
    { code: 'lt', name: 'Lithuanian', flag: '🇱🇹' },
    { code: 'lg', name: 'Luganda', flag: '🇺🇬' },
    { code: 'lb', name: 'Luxembourgish', flag: '🇱🇺' },
    { code: 'mk', name: 'Macedonian', flag: '🇲🇰' },
    { code: 'mai', name: 'Maithili', flag: '🇮🇳' },
    { code: 'mg', name: 'Malagasy', flag: '🇲🇬' },
    { code: 'ms', name: 'Malay', flag: '🇲🇾' },
    { code: 'ml', name: 'Malayalam', flag: '🇮🇳' },
    { code: 'mt', name: 'Maltese', flag: '🇲🇹' },
    { code: 'mi', name: 'Maori', flag: '🇳🇿' },
    { code: 'mr', name: 'Marathi', flag: '🇮🇳' },
    { code: 'mni-Mtei', name: 'Meiteilon (Manipuri)', flag: '🇮🇳' },
    { code: 'lus', name: 'Mizo', flag: '🇮🇳' },
    { code: 'mn', name: 'Mongolian', flag: '🇲🇳' },
    { code: 'my', name: 'Myanmar (Burmese)', flag: '🇲🇲' },
    { code: 'ne', name: 'Nepali', flag: '🇳🇵' },
    { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
    { code: 'or', name: 'Odia (Oriya)', flag: '🇮🇳' },
    { code: 'om', name: 'Oromo', flag: '🇪🇹' },
    { code: 'ps', name: 'Pashto', flag: '🇦🇫' },
    { code: 'fa', name: 'Persian', flag: '🇮🇷' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'pa', name: 'Punjabi', flag: '🇮🇳' },
    { code: 'qu', name: 'Quechua', flag: '🇵🇪' },
    { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'sm', name: 'Samoan', flag: '🇼🇸' },
    { code: 'sa', name: 'Sanskrit', flag: '🇮🇳' },
    { code: 'gd', name: 'Scots Gaelic', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
    { code: 'st', name: 'Sesotho', flag: '🇱🇸' },
    { code: 'sn', name: 'Shona', flag: '🇿🇼' },
    { code: 'sd', name: 'Sindhi', flag: '🇵🇰' },
    { code: 'si', name: 'Sinhala', flag: '🇱🇰' },
    { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
    { code: 'sl', name: 'Slovenian', flag: '🇸🇮' },
    { code: 'so', name: 'Somali', flag: '🇸🇴' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'su', name: 'Sundanese', flag: '🇮🇩' },
    { code: 'sw', name: 'Swahili', flag: '🇰🇪' },
    { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
    { code: 'tg', name: 'Tajik', flag: '🇹🇯' },
    { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
    { code: 'tt', name: 'Tatar', flag: '🇷🇺' },
    { code: 'te', name: 'Telugu', flag: '🇮🇳' },
    { code: 'th', name: 'Thai', flag: '🇹🇭' },
    { code: 'ti', name: 'Tigrinya', flag: '🇪🇷' },
    { code: 'ts', name: 'Tsonga', flag: '🇿🇦' },
    { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
    { code: 'tk', name: 'Turkmen', flag: '🇹🇲' },
    { code: 'ak', name: 'Twi (Akan)', flag: '🇬🇭' },
    { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
    { code: 'ur', name: 'Urdu', flag: '🇵🇰' },
    { code: 'ug', name: 'Uyghur', flag: '🇨🇳' },
    { code: 'uz', name: 'Uzbek', flag: '🇺🇿' },
    { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
    { code: 'cy', name: 'Welsh', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
    { code: 'xh', name: 'Xhosa', flag: '🇿🇦' },
    { code: 'yi', name: 'Yiddish', flag: '🇮🇱' },
    { code: 'yo', name: 'Yoruba', flag: '🇳🇬' },
    { code: 'zu', name: 'Zulu', flag: '🇿🇦' }
  ];

  const lyricsTranslationCache = new Map();

  // translations go line by line, so they belong to these exact lines: edited lyrics or another source get new ones
  function translationKey() {
    const t = state.currentTrack;
    const lines = (state.syncedLyrics || []).map((/** @type {{ time: number, text: string }} */ l) => l.text).join('\n');
    return `${(t && t.title) || ''}|${(t && t.artist) || ''}|${state.trLang || 'en'}`.toLowerCase() + '\n' + lines;
  }

  async function fetchAndApplyTranslation() {
    if (!state.currentTrack || !state.syncedLyrics || state.syncedLyrics.length === 0) return;
    const lang = state.trLang || 'en';
    const cacheKey = translationKey();

    if (lyricsTranslationCache.has(cacheKey)) {
      state.currentTranslations = lyricsTranslationCache.get(cacheKey);
      renderLyricsView();
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      return;
    }

    const texts = state.syncedLyrics.map((/** @type {{ time: number, text: string }} */ l) => l.text);
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, targetLang: lang })
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.translations)) {
        lyricsTranslationCache.set(cacheKey, data.translations);
        capMap(lyricsTranslationCache, 30);
        if (translationKey() === cacheKey && state.trActive) {
          state.currentTranslations = data.translations;
          renderLyricsView();
          if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
        }
      }
    } catch (e) {
      console.error('Translation error:', e);
    }
  }

  function updateLyricsTranslationUI() {
    if (el.btnTrEnabled) el.btnTrEnabled.classList.toggle('active', !!state.trEnabled);
    if (el.selectTrLang) el.selectTrLang.value = state.trLang || 'en';
    const trLangMenu = document.getElementById('tr-lang-menu');
    const trLangLabel = document.getElementById('tr-lang-label');
    const curLang = state.trLang || 'en';
    if (trLangMenu) {
      /** @type {NodeListOf<HTMLElement>} */ (trLangMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
        const isSel = opt.dataset.value === curLang;
        opt.classList.toggle('selected', isSel);
        if (isSel && trLangLabel) trLangLabel.textContent = opt.textContent;
      });
    }
    if (trLangLabel && (!trLangMenu || !trLangMenu.querySelector('.m3-dropdown-option.selected'))) {
      const found = TRANSLATION_LANGUAGES.find(l => l.code === curLang);
      if (found) trLangLabel.textContent = `${found.flag} ${found.name} (${found.code})`;
    }
    if (el.btnTrAuto) el.btnTrAuto.classList.toggle('active', !!state.trAuto);
    if (el.btnTranslateLyrics) {
      el.btnTranslateLyrics.classList.toggle('hidden', !state.trEnabled);
      el.btnTranslateLyrics.classList.toggle('active', !!state.trActive);
    }
  }

  const CUSTOM_SHIFT_LEAD_SECONDS = 4.0;

  function getLineStartTime(/** @type {number} */ idx) {
    const lines = state.syncedLyrics;
    if (idx < 0 || idx >= lines.length) return -1;
    const raw = lines[idx].time;
    if (raw < 0) return -1;
    if (!state.isCustomLyrics) return raw;
    for (let j = idx - 1; j >= 0; j--) {
      if (lines[j].time >= 0) return lines[j].time;
    }
    return Math.max(0, raw - CUSTOM_SHIFT_LEAD_SECONDS);
  }

  function getLineEndTime(/** @type {number} */ idx) {
    const start = getLineStartTime(idx);
    const lines = state.syncedLyrics;
    for (let j = idx + 1; j < lines.length; j++) {
      const t = getLineStartTime(j);
      if (t >= 0) return t;
    }
    return start + 4.0;
  }

  /** @type {Record<string, { css: string, fn: (t: number) => number }>} */
  const LYRIC_EASINGS = {
    inout: { css: 'cubic-bezier(0.65, 0, 0.35, 1)', fn: (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) },
    quad: { css: 'cubic-bezier(0.45, 0, 0.55, 1)', fn: (/** @type {number} */ t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) },
    sine: { css: 'cubic-bezier(0.37, 0, 0.63, 1)', fn: (/** @type {number} */ t) => -(Math.cos(Math.PI * t) - 1) / 2 },
    out: { css: 'cubic-bezier(0.22, 1, 0.36, 1)', fn: (/** @type {number} */ t) => 1 - Math.pow(1 - t, 4) },
    outsine: { css: 'cubic-bezier(0.39, 0.575, 0.565, 1)', fn: (/** @type {number} */ t) => Math.sin((t * Math.PI) / 2) },
    expo: { css: 'cubic-bezier(0.16, 1, 0.3, 1)', fn: (/** @type {number} */ t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)) },
    linear: { css: 'linear', fn: (/** @type {number} */ t) => t }
  };
  function getLyricsEase() {
    const v = localStorage.getItem('uriel_lyrics_ease') || '';
    return LYRIC_EASINGS[v] ? v : 'inout';
  }
  function getLyricsSpeed() {
    const v = parseFloat(localStorage.getItem('uriel_lyrics_speed') || '');
    return (v >= 0.5 && v <= 2.5) ? v : 1.0;
  }
  function applyLyricsEase() {
    const ease = LYRIC_EASINGS[getLyricsEase()] || LYRIC_EASINGS.inout;
    document.documentElement.style.setProperty('--lyric-ease', ease.css);
    const speed = getLyricsSpeed();
    document.documentElement.style.setProperty('--lyric-duration', `${(0.45 / speed).toFixed(2)}s`);
  }
  function getLyricsGradientTightness() {
    const v = parseInt(localStorage.getItem('uriel_lyrics_gradient_tightness') || localStorage.getItem('uriel_gradient_tight') || '', 10);
    return (v >= 0 && v <= 40) ? v : 2;
  }
  function applyLyricsGradientTightness() {
    const span = getLyricsGradientTightness();
    document.documentElement.style.setProperty('--lyric-gradient-span', `${span}%`);
    document.documentElement.style.setProperty('--lyric-gradient-full', `${100 + span}%`);
    document.documentElement.style.setProperty('--lyric-fw', `${span}%`);
  }
  let lyricsScrollRaf = 0;
  function stopLyricsScroll() {
    cancelAnimationFrame(lyricsScrollRaf);
    lyricsScrollRaf = 0;
  }
  function animateLyricsScroll(/** @type {HTMLElement} */ container, /** @type {number} */ target) {
    cancelAnimationFrame(lyricsScrollRaf);
    const from = container.scrollTop;
    const delta = target - from;
    if (Math.abs(delta) < 1) return;
    const ease = (LYRIC_EASINGS[getLyricsEase()] || LYRIC_EASINGS.inout).fn;
    const speed = getLyricsSpeed();
    const duration = Math.max(120, Math.min(750, Math.max(420, Math.abs(delta) * 1.2)) / speed);
    const start = performance.now();
    const step = (/** @type {number} */ now) => {
      const t = Math.min(1, (now - start) / duration);
      container.scrollTop = from + delta * ease(t);
      if (t < 1) lyricsScrollRaf = requestAnimationFrame(step);
    };
    lyricsScrollRaf = requestAnimationFrame(step);
  }
  if (el.lyricsContainer) ['wheel', 'touchstart', 'pointerdown'].forEach((ev) => el.lyricsContainer.addEventListener(ev, () => cancelAnimationFrame(lyricsScrollRaf), { passive: true }));
  applyLyricsEase();
  applyLyricsGradientTightness();

  const PUNCT_OR_SPACE_REGEX = /^[\s\p{P}]$/u;
  const CJK_REGEX = /^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]$/u;
  const MARK_REGEX = /^\p{M}$/u;
  const CYRILLIC_VOWELS = new Set('аеёиоуыэюяєіїўѣѵѫѧѩѭ');
  const LATIN_VOWEL_EXTRA = new Set(['æ', 'ø', 'œ', 'ı']);

  function getCharBaseWeight(/** @type {string} */ c) {
    if (PUNCT_OR_SPACE_REGEX.test(c)) return 0.4;
    if (CJK_REGEX.test(c)) return 3.0;
    if (MARK_REGEX.test(c)) return 3.0;
    const lower = c.toLowerCase();
    if (CYRILLIC_VOWELS.has(lower)) return 3.0;
    const base = c.normalize('NFD')[0].toLowerCase();
    if ('aeiouy'.includes(base) || LATIN_VOWEL_EXTRA.has(lower)) return 3.0;
    return 1.0;
  }

  /** @type {{ lineEl: Element | null, lineIdx: number, text: string, N: number, cumWeights: Float64Array | null, totalWeight: number }} */
  let gradientLineCache = {
    lineEl: null,
    lineIdx: -1,
    text: '',
    N: 0,
    cumWeights: null,
    totalWeight: 0
  };

  function getLineGradientWeights(/** @type {Element} */ lineEl, /** @type {number} */ idx, /** @type {string} */ text) {
    if (gradientLineCache.lineEl === lineEl && gradientLineCache.lineIdx === idx && gradientLineCache.text === text) {
      return gradientLineCache;
    }
    const chars = Array.from(text);
    const N = chars.length;
    if (N === 0) {
      gradientLineCache = { lineEl, lineIdx: idx, text, N: 0, cumWeights: null, totalWeight: 0 };
      return gradientLineCache;
    }
    const outroStart = Math.floor(N * 0.8);
    const cumWeights = new Float64Array(N + 1);
    cumWeights[0] = 0;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const baseW = getCharBaseWeight(chars[i]);
      const w = (i >= outroStart) ? baseW * 1.6 : baseW;
      total += w;
      cumWeights[i + 1] = total;
    }
    gradientLineCache = {
      lineEl,
      lineIdx: idx,
      text,
      N,
      cumWeights,
      totalWeight: total
    };
    return gradientLineCache;
  }

  let gradientRaf = 0;
  let gradientTimer = 0;
  function updateActiveGradient() {
    const lineEl = document.querySelector('.lyric-line.active.gradient-line');
    if (!lineEl || !el.nativeAudio) return;
    const fill = /** @type {HTMLElement} */ (lineEl.firstElementChild);
    if (!fill) return;

    const idx = parseInt(lineEl.id.replace('lyric-line-', ''), 10);
    const start = getLineStartTime(idx);
    const dur = Math.max(0.5, getLineEndTime(idx) - start);
    const t = el.nativeAudio.currentTime + (state.isCustomLyrics ? 0.25 : 0);
    const tau = Math.min(1, Math.max(0, (t - start) / dur));

    const text = fill.textContent || '';
    const cache = getLineGradientWeights(lineEl, idx, text);
    const timed = lineTimedWords(state.syncedLyrics[idx]);
    const timedK = timed ? window.UrielLyricsSources.timedProgress(timed, t) : null;

    let k = tau;
    if (timedK !== null) {
      k = timedK;
    } else if (cache.N > 0 && cache.totalWeight > 0) {
      if (tau <= 0) {
        k = 0;
      } else if (tau >= 1) {
        k = 1;
      } else {
        const tw = tau * cache.totalWeight;
        const cw = /** @type {Float64Array} */ (cache.cumWeights);
        const N = cache.N;
        let low = 0, high = N - 1;
        let i = 0;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (cw[mid + 1] <= tw) {
            low = mid + 1;
          } else if (cw[mid] > tw) {
            high = mid - 1;
          } else {
            i = mid;
            break;
          }
        }
        const charWeight = cw[i + 1] - cw[i];
        const pi = charWeight > 0 ? (tw - cw[i]) / charWeight : 0;
        k = Math.min(1, Math.max(0, (i + pi) / N));
      }
    }

    fill.style.setProperty('--k', k.toFixed(4));
  }
  function stopGradientLoop() {
    cancelAnimationFrame(gradientRaf);
    gradientRaf = 0;
    clearTimeout(gradientTimer);
    gradientTimer = 0;
  }
  function startGradientLoop() {
    if (gradientRaf || gradientTimer) return;
    const tick = () => {
      gradientRaf = 0;
      if (!state.isPlaying || !state.isWindowVisible || !isGradientMode()) return;
      updateActiveGradient();
      // the word fill restyles the lyrics each time: 30 fps on phones and the Settings cap here look just as smooth
      const fps = isPhoneApp ? 30 : viz.userFpsCap;
      if (!fps) { gradientRaf = requestAnimationFrame(tick); return; }
      gradientTimer = window.setTimeout(() => { gradientTimer = 0; gradientRaf = requestAnimationFrame(tick); }, Math.max(0, 1000 / fps - 7));
    };
    gradientRaf = requestAnimationFrame(tick);
  }

  function getLyricTargetScroll(/** @type {HTMLElement | null} */ activeEl, /** @type {HTMLElement | null} */ parent) {
    if (!activeEl || !parent) return 0;
    let top = 0;
    /** @type {HTMLElement | null} */
    let curr = activeEl;
    let reachedParent = false;
    while (curr) {
      if (curr === parent) {
        reachedParent = true;
        break;
      }
      top += curr.offsetTop;
      curr = /** @type {HTMLElement | null} */ (curr.offsetParent);
    }
    const parentH = parent.clientHeight;
    const lineH = activeEl.offsetHeight;
    if (!reachedParent) {
      const pR = parent.getBoundingClientRect(), lR = activeEl.getBoundingClientRect();
      if (pR.height > 0) {
        return Math.max(0, parent.scrollTop + (lR.top - pR.top) - (pR.height / 2) + (lR.height / 2));
      }
      return 0;
    }
    return Math.max(0, top - (parentH / 2) + (lineH / 2));
  }

  function updateSyncedLyricsHighlight(/** @type {number} */ currentTime) {
    if (miniLyricsShown()) updateMiniLyricsHighlight(currentTime);
    if (state.syncedLyrics.length === 0 || !state.isWindowVisible) return;
    const lookAhead = state.isCustomLyrics ? 0.25 : 0.0;
    const matchTime = currentTime + lookAhead;
    const activeIndex = window.UrielLyricsSources.activeLineIndex(state.syncedLyrics.length, getLineStartTime, matchTime, state.lastActiveLyricIdx);

    if (activeIndex >= 0 && state.isPlaying) {
      const currentLineTime = getLineStartTime(activeIndex);
      const nextLineTime = getLineEndTime(activeIndex);
      const lineDur = Math.max(0.5, nextLineTime - currentLineTime);
      const progress = Math.min(Math.max((matchTime - currentLineTime) / lineDur, 0), 0.999);

      // this runs every frame: split a line once, when it becomes the active one
      const activeLine = state.syncedLyrics[activeIndex];
      if (state.lyricWordsLine !== activeLine) {
        state.lyricWordsLine = activeLine;
        state.lyricWords = activeLine.text.replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean);
      }
      const words = state.lyricWords;
      const totalWords = words.length;
      const currentWordIndex = totalWords > 0 ? Math.floor(progress * totalWords) : 0;
      const activeWordText = totalWords > 0 ? words[currentWordIndex] : '';

      const stateKey = `${activeIndex}-${currentWordIndex}`;
      if (state.lastBroadcastStateKey !== stateKey) {
        state.lastBroadcastStateKey = stateKey;
        sendStateToServer(activeWordText, currentWordIndex, activeIndex);
      }
    }

    const parent = el.lyricsContainer;
    const hasLayout = !!(parent && parent.clientHeight >= 40);
    const lineChanged = state.lastActiveLyricIdx !== activeIndex || state.forceLyricsScroll;
    const shouldSnap = state.forceSnapLyrics;
    let targetY = null;
    const autoscroll = !(lineChanged || shouldSnap) || getAdv('lyrics_autoscroll', true);
    if (hasLayout && (lineChanged || shouldSnap) && autoscroll) {
      if (activeIndex >= 0) {
        const activeEl = document.getElementById(`lyric-line-${activeIndex}`);
        if (activeEl) {
          targetY = getLyricTargetScroll(activeEl, parent);
          state.forceLyricsScroll = false;
          state.forceSnapLyrics = false;
          state.lastActiveLyricIdx = activeIndex;
        }
      } else {
        targetY = 0;
        state.forceLyricsScroll = false;
        state.forceSnapLyrics = false;
        state.lastActiveLyricIdx = activeIndex;
      }
    } else if (hasLayout && (!state.forceLyricsScroll || !autoscroll)) {
      state.lastActiveLyricIdx = activeIndex;
      // with auto-scroll off nothing else clears these, and every frame would count as a new line
      if (!autoscroll) { state.forceLyricsScroll = false; state.forceSnapLyrics = false; }
    }

    const gradientMode = isGradientMode();
    const wordMode = !gradientMode && state.lyricsMode === 'word' && getAdv('karaoke_words', true);
    const activeLineEl = activeIndex >= 0 ? document.getElementById(`lyric-line-${activeIndex}`) : null;

    // Every line only needs touching when the active line changes (or the lines were rebuilt)
    if (lineChanged || activeLineEl !== state.lyricSweptEl) {
      state.lyricSweptEl = activeLineEl;
      state.lyricWordKey = null;
      /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.lyric-line')).forEach((lineEl, idx) => {
        if (lineChanged) {
          // the blur and fade stop changing 4 lines away: far lines keep their value and aren't restyled
          const dist = activeIndex >= 0 ? Math.min(Math.abs(idx - activeIndex), 5) : 0;
          if (lineEl._lyricDist !== dist) {
            lineEl._lyricDist = dist;
            lineEl.style.setProperty('--dist', String(dist));
          }
        }
        if (idx === activeIndex) {
          lineEl.classList.add('active');
          return;
        }
        lineEl.classList.remove('active');
        if (lineEl.classList.contains('gradient-line')) {
          lineEl.firstElementChild && /** @type {HTMLElement} */ (lineEl.firstElementChild).style.setProperty('--k', '0');
        }
        if (wordMode) {
          lineEl.querySelectorAll('.lyric-word').forEach(wSpan => {
            wSpan.className = idx < activeIndex ? 'lyric-word past-word' : 'lyric-word';
          });
        }
      });
    }

    if (activeLineEl && gradientMode) {
      // the running loop draws it; when it isn't running (paused, seeking) draw once here
      if (!gradientRaf && !gradientTimer) updateActiveGradient();
      startGradientLoop();
    } else if (activeLineEl && wordMode) {
      const currentLineTime = getLineStartTime(activeIndex);
      const lineDur = Math.max(0.5, getLineEndTime(activeIndex) - currentLineTime);
      const progress = Math.min(Math.max((matchTime - currentLineTime) / lineDur, 0), 0.999);
      const wordSpans = activeLineEl.querySelectorAll('.lyric-word');
      const totalWords = wordSpans.length;
      const timed = lineTimedWords(state.syncedLyrics[activeIndex]);
      const currentWordIndex = timed && timed.length === totalWords ? timedWordIndex(timed, matchTime) : Math.floor(progress * totalWords);
      if (state.lyricWordKey !== currentWordIndex) {
        state.lyricWordKey = currentWordIndex;
        wordSpans.forEach((wSpan, wIdx) => {
          if (wIdx < currentWordIndex) {
            wSpan.className = 'lyric-word past-word';
          } else if (wIdx === currentWordIndex) {
            wSpan.className = 'lyric-word active-word';
          } else {
            wSpan.className = 'lyric-word';
          }
        });
      }
    }

    if (targetY !== null && parent) {
      if (shouldSnap) {
        cancelAnimationFrame(lyricsScrollRaf);
        parent.scrollTop = targetY;
      } else {
        animateLyricsScroll(parent, targetY);
      }
    }
  }

  function updateLyricsModeButton() {
    if (!el.btnLyricsMode) return;
    const isWordEnabled = getAdv('karaoke_words', true);
    if (!isWordEnabled && state.lyricsMode === 'word') {
      state.lyricsMode = 'line';
    }
    I18N.text(el.btnLyricsMode.querySelector('span'), state.lyricsMode === 'word' ? 'Word' : 'Line');
  }

  if (el.btnLyricsMode) {
    updateLyricsModeButton();
    el.btnLyricsMode.addEventListener('click', () => {
      if (!getAdv('karaoke_words', true)) {
        state.lyricsMode = 'line';
        updateLyricsModeButton();
        return;
      }
      state.lyricsMode = state.lyricsMode === 'line' ? 'word' : 'line';
      updateLyricsModeButton();
      renderLyricsView();
      // word timings are only looked up for word-by-word karaoke
      if (state.lyricsMode === 'word' && state.currentTrack && !state.isCustomLyrics) fetchAndUpgradeWords(state.currentTrack.title || '', state.currentTrack.artist || '', state.loadToken);
      if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
    });
  }

  if (el.btnTranslateLyrics) {
    el.btnTranslateLyrics.addEventListener('click', () => {
      state.trActive = !state.trActive;
      updateLyricsTranslationUI();
      if (state.trActive) {
        fetchAndApplyTranslation();
      } else {
        state.currentTranslations = null;
        renderLyricsView();
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      }
    });
  }

  /** @type {UrielLyricsViewPart} */
  const api = { TRANSLATION_LANGUAGES, setLyricsEmpty, loadSyncedLyrics, getLyricsWordStyle, renderLyricsView, updateLyricsPadding, fetchAndApplyTranslation, updateLyricsTranslationUI, getLineStartTime, getLineEndTime, getLyricsEase, getLyricsSpeed, applyLyricsEase, getLyricsGradientTightness, applyLyricsGradientTightness, stopLyricsScroll, animateLyricsScroll, updateActiveGradient, stopGradientLoop, updateSyncedLyricsHighlight };
  Object.assign(out, api);
};
