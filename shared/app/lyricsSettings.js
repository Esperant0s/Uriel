// @ts-check
// Settings → Lyrics: translating lyrics automatically, and how synced lyrics move and look (the easing, speed,
// word style and how tight the sung-word gradient is). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.lyricsSettings = function ({ applyLyricsEase, applyLyricsGradientTightness, el, fetchAndApplyTranslation, getLyricsEase, getLyricsGradientTightness, getLyricsSpeed, getLyricsWordStyle, renderLyricsView, state, updateActiveGradient, updateLyricsTranslationUI, updateSyncedLyricsHighlight }) {
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
