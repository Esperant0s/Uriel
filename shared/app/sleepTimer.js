// @ts-check
// The sleep timer: pause after some minutes (fading out) or at the end of the song, with the time left shown in the
// player. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielSleepTimerPart} out */
window.UrielApp.sleepTimer = function ({ Tm, audioEngine, el, pauseSmooth, showToast, state }, out) {
  /** @type {ReturnType<typeof setInterval> | null} */
  let sleepTimerInterval = null;

  function syncSleepTimerButtons(/** @type {string | null} */ value) {
    if (!el.sleepTimerStatus) return;
    const panel = el.sleepTimerStatus.closest('.audio-panel');
    if (!panel) return;
    /** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('[data-sleep-minutes]')).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sleepMinutes === value);
    });
  }

  function updateSleepTimerUI() {
    if (!el.sleepTimerStatus) return;
    if (!state.sleepTimer) {
      el.sleepTimerStatus.textContent = 'Off';
      el.sleepTimerStatus.classList.remove('active');
      syncSleepTimerButtons(null);
      return;
    }
    el.sleepTimerStatus.classList.add('active');
    if (state.sleepTimer.mode === 'end') {
      el.sleepTimerStatus.textContent = 'End of song';
      syncSleepTimerButtons('end');
      return;
    }
    syncSleepTimerButtons(String(state.sleepTimer.minutes));
    const left = Math.max(0, state.sleepTimer.endsAt - Date.now());
    const mins = Math.floor(left / 60000);
    const secs = Math.floor((left % 60000) / 1000);
    el.sleepTimerStatus.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function fadeOutAndPause() {
    const from = state.isMuted ? 0 : state.volume;
    // nobody hears a fade in the background, and background timers run late: stop right away
    if (!from || !audioEngine || !audioEngine.setVolume || document.hidden) {
      pauseSmooth();
      return;
    }
    // timer steps, not animation frames: a minimized window or a locked phone gets no frames, so the fade
    // never finished and the music played on after the timer said "Off"
    const started = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - started) / 4000);
      audioEngine.setVolume(from * (1 - k), false);
      if (k < 1) {
        setTimeout(step, 50);
        return;
      }
      pauseSmooth();
      // once pauseSmooth has stopped the song (280 ms), or it plays a moment at full volume
      setTimeout(() => audioEngine.setVolume(state.volume, state.isMuted), 300);
    };
    step();
  }

  function setSleepTimer(/** @type {string | undefined} */ value) {
    if (sleepTimerInterval) {
      clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
    }
    if (value === 'off') {
      state.sleepTimer = null;
      updateSleepTimerUI();
      return;
    }
    if (value === 'end') {
      state.sleepTimer = { mode: 'end' };
      updateSleepTimerUI();
      showToast(Tm('Sleep timer: end of song'));
      return;
    }
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    state.sleepTimer = { mode: 'minutes', minutes, endsAt: Date.now() + minutes * 60000 };
    updateSleepTimerUI();
    showToast(Tm('Sleep timer: {0} min', minutes));
    sleepTimerInterval = setInterval(() => {
      if (!state.sleepTimer || state.sleepTimer.mode !== 'minutes') return;
      if (state.sleepTimer.endsAt > Date.now()) {
        if (!document.hidden) updateSleepTimerUI();
        return;
      }
      if (sleepTimerInterval) clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
      state.sleepTimer = null;
      updateSleepTimerUI();
      fadeOutAndPause();
    }, 1000);
  }

  if (el.sleepTimerStatus) {
    const sleepPanel = el.sleepTimerStatus.closest('.audio-panel');
    if (sleepPanel) {
      /** @type {NodeListOf<HTMLElement>} */ (sleepPanel.querySelectorAll('[data-sleep-minutes]')).forEach((btn) => {
        btn.addEventListener('click', () => setSleepTimer(btn.dataset.sleepMinutes));
      });
    }
  }

  /** @type {UrielSleepTimerPart} */
  const api = { updateSleepTimerUI };
  Object.assign(out, api);
};
