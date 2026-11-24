// @ts-check
// Performance: performance mode and the battery saver, the visualizer settings (the wave on the bar, the
// animated cover, the TV visualizer) and how the progress bar looks. Part of app.js, which calls this once as
// it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielPerformancePart} out */
window.UrielApp.performance = function ({ applyM3Cover, audioEngine, isPhoneApp, showToast, startVisualizers, state, syncBgVideoPlayback, Tm, updateTvkVisualizerLyricsSetting, updateTvkVisualizerOpacity, updateTvkVisualizerSetting, viz }, out) {
  const btnWavyProgress = document.getElementById('btn-wavy-progress');
  function updateWavyProgressUI() {
    const isWavy = localStorage.getItem('uriel_wavy_progress') !== 'false';
    const isPerf = document.body.classList.contains('perf');
    document.body.classList.toggle('no-wavy', isPerf ? true : !isWavy);
    if (btnWavyProgress) {
      btnWavyProgress.classList.toggle('active', isWavy);
    }
  }

  const btnProgressKnob = document.getElementById('btn-progress-knob');
  function updateProgressKnobUI() {
    const isHidden = localStorage.getItem('uriel_progress_knob') === 'false';
    document.body.classList.toggle('no-knob', isHidden);
    if (btnProgressKnob) {
      btnProgressKnob.classList.toggle('active', !isHidden);
    }
  }

  const btnProgressBg = document.getElementById('btn-progress-bg');
  function updateProgressBgUI() {
    const isHidden = localStorage.getItem('uriel_progress_bg') === 'false';
    document.body.classList.toggle('no-progress-bg', isHidden);
    if (btnProgressBg) {
      btnProgressBg.classList.toggle('active', !isHidden);
    }
  }

  // auto battery saver: perf mode while a laptop runs on battery (the stored setting is left alone)
  let batterySaver = false;
  function storedPerfMode() { const v = localStorage.getItem('uriel_perf_mode'); return v === '1' || v === 'true'; }
  function applyPerfMode(/** @type {boolean} */ on) {
    on = !!on || batterySaver;
    document.body.classList.toggle('perf', on);
    const isWavy = localStorage.getItem('uriel_wavy_progress') !== 'false';
    document.body.classList.toggle('no-wavy', on ? true : !isWavy);
    syncBgVideoPlayback();
    applyM3Cover();
  }
  const btnBarWave = document.getElementById('btn-bar-wave');
  const barWaveOn = localStorage.getItem('uriel_bar_wave') !== '0';
  function applyBarWave(/** @type {boolean} */ on) {
    document.body.classList.toggle('bar-wave-off', !on);
    const vc = document.getElementById('visualizer-container');
    if (vc) {
      vc.style.display = on ? '' : 'none';
      vc.style.pointerEvents = on ? '' : 'none';
    }
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('visualizer-canvas'));
    if (canvas) {
      canvas.style.pointerEvents = on ? '' : 'none';
      if (!on) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    const needBassPulse = !!(state.vfx && state.vfx.bassPulse);
    if (!on) {
      if (audioEngine && audioEngine.setAnalyserEnabled && !needBassPulse) {
        audioEngine.setAnalyserEnabled(false);
      }
    } else {
      if (audioEngine && audioEngine.setAnalyserEnabled && state.isPlaying) {
        audioEngine.setAnalyserEnabled(true);
      }
      if (state.isPlaying) {
        startVisualizers();
      }
    }
  }
  applyBarWave(barWaveOn);
  if (btnBarWave) {
    btnBarWave.classList.toggle('active', barWaveOn);
    btnBarWave.addEventListener('click', () => {
      const next = !btnBarWave.classList.contains('active');
      btnBarWave.classList.toggle('active', next);
      localStorage.setItem('uriel_bar_wave', next ? '1' : '0');
      applyBarWave(next);
    });
  }

  const toggleM3Cover = document.getElementById('toggle-m3-cover');
  if (toggleM3Cover) {
    const saved = localStorage.getItem('uriel_m3_cover');
    const isM3On = saved !== '0';
    toggleM3Cover.classList.toggle('active', isM3On);
    toggleM3Cover.addEventListener('click', () => {
      const next = !toggleM3Cover.classList.contains('active');
      toggleM3Cover.classList.toggle('active', next);
      localStorage.setItem('uriel_m3_cover', next ? '1' : '0');
      applyM3Cover();
    });
  }

  updateTvkVisualizerSetting(localStorage.getItem('uriel_tvk_visualizer') !== 'false');
  updateTvkVisualizerLyricsSetting(localStorage.getItem('uriel_tvk_visualizer_lyrics') === 'true');
  updateTvkVisualizerOpacity(parseInt(localStorage.getItem('uriel_tvk_visualizer_opacity') || '85', 10));

  const btnPerfMode = document.getElementById('btn-perf-mode');
  const initialPerfMode = localStorage.getItem('uriel_perf_mode') === '1' || localStorage.getItem('uriel_perf_mode') === 'true';
  applyPerfMode(initialPerfMode);
  // the battery saver had no switch: on battery it forced performance mode with no way back
  const btnBatterySaver = document.getElementById('btn-battery-saver');
  const batterySaverWanted = () => localStorage.getItem('uriel_battery_saver') !== '0';
  /** @type {{ level: number, charging: boolean } | null} */
  let batteryRef = null;
  const syncBatterySaver = () => {
    const next = !!(batteryRef && batteryRef.charging === false && batterySaverWanted());
    if (next === batterySaver) return;
    batterySaver = next;
    applyPerfMode(storedPerfMode());
  };
  if (btnBatterySaver) {
    btnBatterySaver.classList.toggle('active', batterySaverWanted());
    btnBatterySaver.addEventListener('click', () => {
      const next = !btnBatterySaver.classList.contains('active');
      btnBatterySaver.classList.toggle('active', next);
      localStorage.setItem('uriel_battery_saver', next ? '1' : '0');
      syncBatterySaver();
    });
  }
  if (!isPhoneApp && typeof navigator.getBattery === 'function') {
    navigator.getBattery().then((b) => {
      batteryRef = b;
      syncBatterySaver();
      b.addEventListener('chargingchange', syncBatterySaver);
    }).catch(() => {});
  } else {
    const row = document.getElementById('setting-battery-saver');
    if (row) row.style.display = 'none';
  }
  if (btnPerfMode) {
    btnPerfMode.classList.toggle('active', initialPerfMode);
    btnPerfMode.addEventListener('click', () => {
      const next = !btnPerfMode.classList.contains('active');
      btnPerfMode.classList.toggle('active', next);
      localStorage.setItem('uriel_perf_mode', next ? '1' : '0');
      applyPerfMode(next);
    });
  }

  if (btnWavyProgress) {
    btnWavyProgress.addEventListener('click', () => {
      const isWavy = localStorage.getItem('uriel_wavy_progress') !== 'false';
      const next = !isWavy;
      localStorage.setItem('uriel_wavy_progress', next ? 'true' : 'false');
      updateWavyProgressUI();
      viz.hasDrawnPausedFrame = false;
    });
  }

  if (btnProgressKnob) {
    btnProgressKnob.addEventListener('click', () => {
      const isKnob = localStorage.getItem('uriel_progress_knob') !== 'false';
      const next = !isKnob;
      localStorage.setItem('uriel_progress_knob', next ? 'true' : 'false');
      updateProgressKnobUI();
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId && typeof startVisualizers === 'function') startVisualizers();
    });
  }

  if (btnProgressBg) {
    btnProgressBg.addEventListener('click', () => {
      const isBg = localStorage.getItem('uriel_progress_bg') !== 'false';
      const next = !isBg;
      localStorage.setItem('uriel_progress_bg', next ? 'true' : 'false');
      updateProgressBgUI();
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId && typeof startVisualizers === 'function') startVisualizers();
    });
  }

  updateWavyProgressUI();
  updateProgressKnobUI();
  updateProgressBgUI();

  const btnTrayOnClose = document.getElementById('btn-tray-on-close');
  const storedTrayOnClose = localStorage.getItem('uriel_tray_on_close');
  const savedTrayOnClose = storedTrayOnClose !== null
    ? storedTrayOnClose === 'true'
    : /Windows|Mac/.test(navigator.userAgent);
  if (btnTrayOnClose) {
    btnTrayOnClose.classList.toggle('active', savedTrayOnClose);
    btnTrayOnClose.addEventListener('click', () => {
      const next = !btnTrayOnClose.classList.contains('active');
      btnTrayOnClose.classList.toggle('active', next);
      localStorage.setItem('uriel_tray_on_close', next ? 'true' : 'false');
      if (window.electronAPI && window.electronAPI.setTrayOnClose) {
        window.electronAPI.setTrayOnClose(next);
      }
    });
  }
  if (window.electronAPI && window.electronAPI.setTrayOnClose) {
    window.electronAPI.setTrayOnClose(savedTrayOnClose);
  }

  // no GPU acceleration on the first start: performance mode, said once
  if (localStorage.getItem('uriel_perf_mode') === null && window.electronAPI && window.electronAPI.getGpuCompositing) {
    window.electronAPI.getGpuCompositing().then((/** @type {string} */ status) => {
      if (status && !status.startsWith('enabled')) {
        localStorage.setItem('uriel_perf_mode', '1');
        applyPerfMode(true);
        if (btnPerfMode) btnPerfMode.classList.add('active');
        showToast(Tm('Performance mode enabled: no GPU acceleration detected. You can turn it off in Settings'));
      }
    }).catch(() => {});
  }

  /** @type {UrielPerformancePart} */
  const api = { applyPerfMode };
  Object.assign(out, api);
};
