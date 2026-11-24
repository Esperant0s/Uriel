// @ts-check
// The sound and visual settings dialogs: their tabs, HQ audio and its engine, the speed, pitch, reverb,
// distortion, gain and echo sliders, and the 3-band and 10-band EQ. Part of app.js, which calls this once as
// it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.soundSettings = function ({ applyAudioSettings, applyHqSettings, closeModal, el, EQ_BAND_LABELS, initAudioContext, openModal, persistSoundSettings, refreshStacks, renderPresets, setTempoValues, state, updateHqRouting }) {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.audio-tab')).forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.audio-tab').forEach((t) => t.classList.toggle('active', t === tab));
      /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.audio-panel')).forEach((p) => p.classList.toggle('active', p.dataset.audioPanel === tab.dataset.audioTab));
    });
  });

  if (el.btnOpenSettings) {
    el.btnOpenSettings.addEventListener('click', () => {
      const tempoTab = /** @type {HTMLElement} */ (document.querySelector('.audio-tab[data-audio-tab="tempo"]') || document.querySelector('.audio-tab'));
      if (tempoTab) tempoTab.click();
      if (el.audioSettingsModal) openModal(el.audioSettingsModal);
      refreshStacks();
    });
  }

  if (el.btnCloseSettings) {
    el.btnCloseSettings.addEventListener('click', () => {
      if (el.audioSettingsModal) closeModal(el.audioSettingsModal);
    });
  }

  if (el.audioSettingsModal) {
    el.audioSettingsModal.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.audioSettingsModal) closeModal(el.audioSettingsModal);
    });
  }

  if (el.btnOpenVisualSettings) {
    el.btnOpenVisualSettings.addEventListener('click', () => {
      if (el.visualSettingsModal) openModal(el.visualSettingsModal);
    });
  }

  if (el.btnCloseVisualSettings) {
    el.btnCloseVisualSettings.addEventListener('click', () => {
      if (el.visualSettingsModal) closeModal(el.visualSettingsModal);
    });
  }

  if (el.visualSettingsModal) {
    el.visualSettingsModal.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (e.target === el.visualSettingsModal) closeModal(el.visualSettingsModal);
    });
  }

  if (el.btnToggleHqAudio) {
    el.btnToggleHqAudio.addEventListener('click', () => {
      state.hqEnabled = !state.hqEnabled;
      el.btnToggleHqAudio.classList.toggle('active', state.hqEnabled);
      
      if (el.hqPanelWrapper) {
        el.hqPanelWrapper.classList.toggle('expanded', state.hqEnabled);
        if (el.hqEnhancerCard) el.hqEnhancerCard.classList.toggle('is-expanded', state.hqEnabled);
      }
      initAudioContext();
      updateHqRouting();
      persistSoundSettings();
    });
  }

  if (el.hqPresetChips) {
    el.hqPresetChips.forEach((/** @type {HTMLElement} */ chip) => {
      chip.addEventListener('click', () => {
        el.hqPresetChips.forEach((/** @type {HTMLElement} */ c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.hqSettings.preset = chip.dataset.preset;

        let v = 0, a = 0, b = 0;
        if (state.hqSettings.preset === 'studio') { v = 0; a = 0; b = 0; }
        else if (state.hqSettings.preset === 'vinyl') { v = 15; a = -15; b = 25; }
        else if (state.hqSettings.preset === 'concert') { v = -10; a = 30; b = 15; }

        if (el.sliderHqVocal) { el.sliderHqVocal.value = String(v); el.valHqVocal.textContent = (v > 0 ? '+' : '') + v + '%'; state.hqSettings.vocal = v; }
        if (el.sliderHqAir) { el.sliderHqAir.value = String(a); el.valHqAir.textContent = (a > 0 ? '+' : '') + a + '%'; state.hqSettings.air = a; }
        if (el.sliderHqBass) { el.sliderHqBass.value = String(b); el.valHqBass.textContent = (b > 0 ? '+' : '') + b + '%'; state.hqSettings.bass = b; }

        applyHqSettings();
      });
    });
  }

  /** @type {const} */ (['Vocal', 'Air', 'Bass']).forEach(type => {
    const slider = el[/** @type {const} */ (`sliderHq${type}`)];
    const valDisplay = el[/** @type {const} */ (`valHq${type}`)];
    if (slider) {
      slider.addEventListener('input', (/** @type {Event} */ e) => {
        const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
        if (valDisplay) valDisplay.textContent = (val > 0 ? '+' : '') + val + '%';
        state.hqSettings[type.toLowerCase()] = val;
        if (el.hqPresetChips) el.hqPresetChips.forEach((/** @type {HTMLElement} */ c) => c.classList.remove('active'));
        applyHqSettings();
      });
    }
  });

  if (el.hqEngineSelect) {
    el.hqEngineSelect.addEventListener('change', (/** @type {Event} */ e) => {
      state.hqSettings.engine = /** @type {HTMLInputElement} */ (e.target).value;
      applyHqSettings();
    });
  }

  const hqDropdown = document.getElementById('hq-engine-dropdown');
  const hqTrigger = document.getElementById('hq-engine-trigger');
  const hqLabel = document.getElementById('hq-engine-label');
  const hqMenu = document.getElementById('hq-engine-menu');

  if (hqTrigger && hqDropdown && hqMenu) {
    hqTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      hqDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (hqMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value || '';
        if (hqLabel) hqLabel.textContent = opt.textContent;
        hqMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        if (el.hqEngineSelect) {
          el.hqEngineSelect.value = val;
          el.hqEngineSelect.dispatchEvent(new Event('change'));
        }
        hqDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      hqDropdown.classList.remove('open');
    });
  }

  if (el.sliderSpeed) {
    el.sliderSpeed.addEventListener('input', (/** @type {Event} */ e) => {
      const val = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
      setTempoValues({ speed: val, speedPitch: 1.0 });
      if (el.sliderSpeedPitch) el.sliderSpeedPitch.value = '1';
      if (el.valSpeedPitch) el.valSpeedPitch.textContent = '1.00x';
      if (el.valSpeed) el.valSpeed.textContent = `${val.toFixed(2)}x`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderSpeedPitch) {
    el.sliderSpeedPitch.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
      setTempoValues({ speedPitch: val, speed: 1.0 });
      if (el.sliderSpeed) el.sliderSpeed.value = '1';
      if (el.valSpeed) el.valSpeed.textContent = '1.00x';
      if (el.valSpeedPitch) el.valSpeedPitch.textContent = `${val.toFixed(2)}x`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderPitch) {
    el.sliderPitch.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      setTempoValues({ pitch: val });
      if (el.valPitch) el.valPitch.textContent = `${val > 0 ? '+' : ''}${val} st`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderReverb) {
    el.sliderReverb.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.audioSettings.reverb = val;
      if (el.valReverb) el.valReverb.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderDistortion) {
    el.sliderDistortion.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.audioSettings.distortion = val;
      if (el.valDistortion) el.valDistortion.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderGain) {
    el.sliderGain.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      setTempoValues({ volume: val / 100 });
      if (el.valGain) el.valGain.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  if (el.sliderEcho) {
    el.sliderEcho.addEventListener('input', (/** @type {Event} */ e) => {
      initAudioContext();
      const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      state.audioSettings.echo = val;
      if (el.valEcho) el.valEcho.textContent = `${val}%`;
      state.activePresetId = null;
      applyAudioSettings();
      renderPresets();
    });
  }

  /** @type {const} */ ([['low', 'Low'], ['mid', 'Mid'], ['high', 'High']]).forEach(([band, cap]) => {
    const slider = el[/** @type {const} */ (`sliderEq${cap}`)];
    const valEl = el[/** @type {const} */ (`valEq${cap}`)];
    if (slider) {
      slider.addEventListener('input', (/** @type {Event} */ e) => {
        initAudioContext();
        const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
        if (!state.audioSettings.eq) state.audioSettings.eq = { low: 0, mid: 0, high: 0 };
        state.audioSettings.eq[band] = val;
        if (valEl) valEl.textContent = `${val > 0 ? '+' : ''}${val} dB`;
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });
      slider.addEventListener('dblclick', () => {
        initAudioContext();
        slider.value = '0';
        if (!state.audioSettings.eq) state.audioSettings.eq = { low: 0, mid: 0, high: 0 };
        state.audioSettings.eq[band] = 0;
        if (valEl) valEl.textContent = '0 dB';
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });
    }
  });

  function init10BandEqUI() {
    if (!el.eqBands) return;

    el.eqBands.innerHTML = '';
    const currentBands = state.audioSettings.eqBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    EQ_BAND_LABELS.forEach((/** @type {string} */ freqLabel, /** @type {number} */ i) => {
      const col = document.createElement('div');
      col.className = 'eq-band';

      const valSpan = document.createElement('span');
      valSpan.className = 'eq-band-val';
      const initialVal = currentBands[i] !== undefined ? currentBands[i] : 0;
      valSpan.textContent = `${initialVal > 0 ? '+' : ''}${initialVal} dB`;

      const sliderBox = document.createElement('div');
      sliderBox.className = 'eq-slider-box';

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'eq-band-range';
      input.min = '-12';
      input.max = '12';
      input.step = '1';
      input.value = String(initialVal);
      sliderBox.appendChild(input);

      const freqSpan = document.createElement('span');
      freqSpan.className = 'eq-band-freq';
      freqSpan.textContent = freqLabel;

      input.addEventListener('input', (e) => {
        initAudioContext();
        const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
        if (!Array.isArray(state.audioSettings.eqBands)) {
          state.audioSettings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
        state.audioSettings.eqBands[i] = val;
        valSpan.textContent = `${val > 0 ? '+' : ''}${val} dB`;
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });

      input.addEventListener('dblclick', () => {
        initAudioContext();
        input.value = '0';
        if (!Array.isArray(state.audioSettings.eqBands)) {
          state.audioSettings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
        state.audioSettings.eqBands[i] = 0;
        valSpan.textContent = '0 dB';
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });

      col.appendChild(valSpan);
      col.appendChild(sliderBox);
      col.appendChild(freqSpan);
      el.eqBands.appendChild(col);
    });

    if (el.btnResetEqBands) {
      el.btnResetEqBands.addEventListener('click', () => {
        initAudioContext();
        state.audioSettings.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (el.eqBands.querySelectorAll('.eq-band-range'));
        const valLabels = el.eqBands.querySelectorAll('.eq-band-val');
        inputs.forEach((input, i) => {
          input.value = '0';
          if (valLabels[i]) valLabels[i].textContent = '0 dB';
        });
        state.activePresetId = null;
        applyAudioSettings();
        renderPresets();
      });
    }
  }

  init10BandEqUI();
};
