// @ts-check
// Settings → Lyrics: translating lyrics (on or off, automatically, into which language), and how synced lyrics move and look (the easing, speed,
// word style and how tight the sung-word gradient is). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.lyricsSettings = function ({ TRANSLATION_LANGUAGES, applyLyricsEase, applyLyricsGradientTightness, el, fetchAndApplyTranslation, getLyricsEase, getLyricsGradientTightness, getLyricsSpeed, getLyricsWordStyle, renderLyricsView, state, updateActiveGradient, updateLyricsTranslationUI, updateSyncedLyricsHighlight }) {
  if (el.btnTrEnabled) {
    el.btnTrEnabled.addEventListener('click', () => {
      state.trEnabled = !state.trEnabled;
      localStorage.setItem('uriel_tr_enabled', String(state.trEnabled));
      updateLyricsTranslationUI();
      if (!state.trEnabled) {
        state.trActive = false;
        state.currentTranslations = null;
        renderLyricsView();
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      } else if (state.trAuto) {
        state.trActive = true;
        updateLyricsTranslationUI();
        fetchAndApplyTranslation();
      }
    });
  }

  const trLangDropdown = document.getElementById('tr-lang-dropdown');
  const trLangTrigger = document.getElementById('tr-lang-trigger');
  const trLangLabel = document.getElementById('tr-lang-label');
  const trLangMenu = document.getElementById('tr-lang-menu');
  const trLangList = document.getElementById('tr-lang-list');
  const trLangSearch = /** @type {HTMLInputElement} */ (document.getElementById('tr-lang-search'));

  if (trLangDropdown && trLangTrigger && trLangMenu) {
    const curLang = state.trLang || 'en';
    if (trLangList) {
      trLangList.innerHTML = '';
      const frag = document.createDocumentFragment();
      TRANSLATION_LANGUAGES.forEach((/** @type {{ code: string, name: string, flag: string }} */ item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'm3-dropdown-option';
        btn.dataset.value = item.code;
        const text = `${item.flag} ${item.name} (${item.code})`;
        btn.textContent = text;
        if (item.code === curLang) {
          btn.classList.add('selected');
          if (trLangLabel) trLangLabel.textContent = text;
        }
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.trLang = item.code;
          localStorage.setItem('uriel_tr_lang', state.trLang);
          if (trLangLabel) trLangLabel.textContent = text;
          /** @type {NodeListOf<HTMLElement>} */ (trLangMenu.querySelectorAll('.m3-dropdown-option')).forEach((o) => o.classList.remove('selected'));
          btn.classList.add('selected');
          if (el.selectTrLang) el.selectTrLang.value = item.code;
          trLangDropdown.classList.remove('open');
          if (state.trActive) {
            fetchAndApplyTranslation();
          }
        });
        frag.appendChild(btn);
      });
      trLangList.appendChild(frag);

      if (el.selectTrLang) {
        el.selectTrLang.innerHTML = '';
        TRANSLATION_LANGUAGES.forEach((/** @type {{ code: string, name: string, flag: string }} */ item) => {
          const opt = document.createElement('option');
          opt.value = item.code;
          opt.textContent = `${item.flag} ${item.name} (${item.code})`;
          el.selectTrLang.appendChild(opt);
        });
        el.selectTrLang.value = curLang;
      }
    }

    if (trLangSearch) {
      trLangSearch.addEventListener('click', (e) => e.stopPropagation());
      trLangSearch.addEventListener('input', (e) => {
        const q = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase().trim();
        if (!trLangList) return;
        /** @type {NodeListOf<HTMLElement>} */ (trLangList.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
          const text = (opt.textContent || '').toLowerCase();
          const code = (opt.dataset.value || '').toLowerCase();
          opt.style.display = (!q || text.includes(q) || code.includes(q)) ? '' : 'none';
        });
      });
      trLangSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          trLangDropdown.classList.remove('open');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstVisible = /** @type {HTMLElement} */ (trLangList ? trLangList.querySelector('.m3-dropdown-option:not([style*="display: none"])') : null);
          if (firstVisible) firstVisible.click();
        }
      });
    }

    trLangTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = trLangDropdown.classList.toggle('open');
      if (isOpen && trLangSearch) {
        trLangSearch.value = '';
        if (trLangList) {
          /** @type {NodeListOf<HTMLElement>} */ (trLangList.querySelectorAll('.m3-dropdown-option')).forEach((opt) => opt.style.display = '');
        }
        setTimeout(() => trLangSearch.focus(), 50);
      }
    });

    document.addEventListener('click', () => {
      trLangDropdown.classList.remove('open');
    });
  }

  if (el.btnTrAuto) {
    el.btnTrAuto.addEventListener('click', () => {
      state.trAuto = !state.trAuto;
      localStorage.setItem('uriel_tr_auto', String(state.trAuto));
      updateLyricsTranslationUI();
      if (state.trEnabled && state.trAuto && !state.trActive) {
        state.trActive = true;
        updateLyricsTranslationUI();
        fetchAndApplyTranslation();
      }
    });
  }

  const lyricsEaseDropdown = document.getElementById('lyrics-ease-dropdown');
  const lyricsEaseTrigger = document.getElementById('lyrics-ease-trigger');
  const lyricsEaseLabel = document.getElementById('lyrics-ease-label');
  const lyricsEaseMenu = document.getElementById('lyrics-ease-menu');

  if (lyricsEaseDropdown && lyricsEaseTrigger && lyricsEaseMenu) {
    const curEase = getLyricsEase();
    /** @type {NodeListOf<HTMLElement>} */ (lyricsEaseMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      const isSel = opt.dataset.value === curEase;
      opt.classList.toggle('selected', isSel);
      if (isSel && lyricsEaseLabel) lyricsEaseLabel.textContent = opt.textContent;
    });

    lyricsEaseTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      lyricsEaseDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (lyricsEaseMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        localStorage.setItem('uriel_lyrics_ease', String(val));
        if (lyricsEaseLabel) lyricsEaseLabel.textContent = opt.textContent;
        lyricsEaseMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.toggle('selected', o === opt));
        applyLyricsEase();
        lyricsEaseDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      lyricsEaseDropdown.classList.remove('open');
    });
  }

  const sliderLyricsSpeed = /** @type {HTMLInputElement} */ (document.getElementById('slider-lyrics-speed'));
  const valLyricsSpeed = document.getElementById('val-lyrics-speed');
  if (sliderLyricsSpeed && valLyricsSpeed) {
    const currentSpeed = getLyricsSpeed();
    sliderLyricsSpeed.value = String(Math.round(currentSpeed * 10));
    valLyricsSpeed.textContent = `${currentSpeed.toFixed(1)}x`;

    sliderLyricsSpeed.addEventListener('input', () => {
      const val = parseInt(sliderLyricsSpeed.value, 10) / 10;
      valLyricsSpeed.textContent = `${val.toFixed(1)}x`;
      localStorage.setItem('uriel_lyrics_speed', val.toString());
      applyLyricsEase();
    });
  }

  const lyricsWordStyleDropdown = document.getElementById('lyrics-wordstyle-dropdown');
  const lyricsWordStyleTrigger = document.getElementById('lyrics-wordstyle-trigger');
  const lyricsWordStyleLabel = document.getElementById('lyrics-wordstyle-label');
  const lyricsWordStyleMenu = document.getElementById('lyrics-wordstyle-menu');

  if (lyricsWordStyleDropdown && lyricsWordStyleTrigger && lyricsWordStyleMenu) {
    const curStyle = getLyricsWordStyle();
    /** @type {NodeListOf<HTMLElement>} */ (lyricsWordStyleMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      const isSel = opt.dataset.value === curStyle;
      opt.classList.toggle('selected', isSel);
      if (isSel && lyricsWordStyleLabel) lyricsWordStyleLabel.textContent = opt.textContent;
    });

    lyricsWordStyleTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      lyricsWordStyleDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (lyricsWordStyleMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        localStorage.setItem('uriel_lyrics_word_style', String(val));
        if (lyricsWordStyleLabel) lyricsWordStyleLabel.textContent = opt.textContent;
        lyricsWordStyleMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.toggle('selected', o === opt));
        lyricsWordStyleDropdown.classList.remove('open');
        renderLyricsView();
        if (el.nativeAudio) updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      });
    });

    document.addEventListener('click', () => {
      lyricsWordStyleDropdown.classList.remove('open');
    });
  }

  const sliderLyricsTightness = /** @type {HTMLInputElement} */ (document.getElementById('slider-lyrics-tightness'));
  const valLyricsTightness = document.getElementById('val-lyrics-tightness');
  if (sliderLyricsTightness && valLyricsTightness) {
    const currentTightness = getLyricsGradientTightness();
    sliderLyricsTightness.value = String(currentTightness);
    valLyricsTightness.textContent = `${currentTightness}%`;

    sliderLyricsTightness.addEventListener('input', () => {
      const val = parseInt(sliderLyricsTightness.value, 10);
      valLyricsTightness.textContent = `${val}%`;
      localStorage.setItem('uriel_lyrics_gradient_tightness', val.toString());
      localStorage.setItem('uriel_gradient_tight', val.toString());
      applyLyricsGradientTightness();
      updateActiveGradient();
    });
  }
};
