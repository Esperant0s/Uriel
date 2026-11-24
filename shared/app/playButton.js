// @ts-check
// The play / pause button: its icon morphing between the two, and the loading ring while a song buffers.
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielPlayButtonPart} out */
window.UrielApp.playButton = function ({ el }, out) {
  function setPlayPauseState(/** @type {boolean} */ playing, animate = true) {
    const btn = el.btnPlayPause;
    const tvkBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-tvk-play'));

    const tvkPlay = document.getElementById('tvk-play-icon');
    const tvkPause = document.getElementById('tvk-pause-icon');
    if (tvkPlay && tvkPlay.getAnimations) {
      try { tvkPlay.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    }
    if (tvkPause && tvkPause.getAnimations) {
      try { tvkPause.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    }
    if (el.playIcon && el.playIcon.getAnimations) {
      try { el.playIcon.getAnimations().forEach((/** @type {Animation} */ a) => a.cancel()); } catch (e) {}
    }
    if (el.pauseIcon && el.pauseIcon.getAnimations) {
      try { el.pauseIcon.getAnimations().forEach((/** @type {Animation} */ a) => a.cancel()); } catch (e) {}
    }

    if (tvkBtn) {
      const isTvkPlaying = tvkBtn.classList.contains('playing');
      if (tvkBtn._morphAnim) {
        try { tvkBtn._morphAnim.cancel(); } catch (e) {}
        tvkBtn._morphAnim = null;
      }
      const H = 56;
      const pausedW = H;
      const pausedR = H / 2;
      const playingW = Math.round(H * 1.39);
      const playingR = 20;

      tvkBtn.classList.toggle('playing', !!playing);

      if (animate && isTvkPlaying !== !!playing) {
        const cs = window.getComputedStyle(tvkBtn);
        const curW = parseFloat(cs.width) || (isTvkPlaying ? playingW : pausedW);
        const curR = parseFloat(cs.borderRadius) || (isTvkPlaying ? playingR : pausedR);

        const targetW = playing ? playingW : pausedW;
        const targetR = playing ? playingR : pausedR;
        const mid1W = playing ? targetW * 1.10 : targetW * 0.90;
        const mid2W = playing ? targetW * 0.97 : targetW * 1.03;

        const keyframes = [
          { width: `${curW}px`, borderRadius: `${curR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
          { width: `${mid1W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.45 },
          { width: `${mid2W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.72 },
          { width: `${targetW}px`, borderRadius: `${targetR}px`, offset: 1 }
        ];

        tvkBtn._morphAnim = tvkBtn.animate(keyframes, { duration: 340, easing: 'linear' });
      }
    }

    if (!btn) return;
    const isCurrentlyPlaying = btn.classList.contains('playing');
    if (btn._morphAnim) {
      try { btn._morphAnim.cancel(); } catch (e) {}
      btn._morphAnim = null;
    }

    const H = 48;
    const pausedW = H;
    const pausedR = H / 2;
    const playingW = Math.round(H * 1.45);
    const playingR = Math.round(H * 0.38);

    btn.classList.toggle('playing', !!playing);

    if (animate && isCurrentlyPlaying !== !!playing) {
      const cs = window.getComputedStyle(btn);
      const curW = parseFloat(cs.width) || (isCurrentlyPlaying ? playingW : pausedW);
      const curR = parseFloat(cs.borderRadius) || (isCurrentlyPlaying ? playingR : pausedR);

      const targetW = playing ? playingW : pausedW;
      const targetR = playing ? playingR : pausedR;
      const mid1W = playing ? targetW * 1.10 : targetW * 0.90;
      const mid2W = playing ? targetW * 0.97 : targetW * 1.03;

      const keyframes = [
        { width: `${curW}px`, borderRadius: `${curR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        { width: `${mid1W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.45 },
        { width: `${mid2W}px`, borderRadius: `${targetR}px`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.72 },
        { width: `${targetW}px`, borderRadius: `${targetR}px`, offset: 1 }
      ];

      btn._morphAnim = btn.animate(keyframes, { duration: 340, easing: 'linear' });
    }
  }

  function updatePlayPauseButton(/** @type {boolean} */ isPlaying, isBuffering = false) {
    const actuallyPlaying = !!(isPlaying || (el.nativeAudio && !el.nativeAudio.paused && !el.nativeAudio.ended));
    const tvkBtn = document.getElementById('btn-tvk-play');
    const tvkPlayIcon = document.getElementById('tvk-play-icon');
    const tvkPauseIcon = document.getElementById('tvk-pause-icon');
    const tvkPlaySpinner = document.getElementById('tvk-play-spinner');
    if (tvkBtn) {
      if (isBuffering) {
        tvkBtn.classList.add('buffering');
        if (tvkPlaySpinner) tvkPlaySpinner.classList.remove('hidden');
        if (tvkPlayIcon) tvkPlayIcon.classList.add('hidden');
        if (tvkPauseIcon) tvkPauseIcon.classList.add('hidden');
      } else {
        tvkBtn.classList.remove('buffering');
        if (tvkPlaySpinner) tvkPlaySpinner.classList.add('hidden');
        if (tvkPlayIcon) tvkPlayIcon.classList.remove('hidden');
        if (tvkPauseIcon) tvkPauseIcon.classList.remove('hidden');
      }
    }
    if (isBuffering) {
      if (el.btnPlayPause) el.btnPlayPause.classList.add('buffering');
      if (el.playbarSpinner) el.playbarSpinner.classList.remove('hidden');
      if (el.playIcon) el.playIcon.classList.add('hidden');
      if (el.pauseIcon) el.pauseIcon.classList.add('hidden');
      setPlayPauseState(true, true);
    } else {
      if (el.btnPlayPause) el.btnPlayPause.classList.remove('buffering');
      if (el.playbarSpinner) el.playbarSpinner.classList.add('hidden');
      if (el.playIcon) el.playIcon.classList.remove('hidden');
      if (el.pauseIcon) el.pauseIcon.classList.remove('hidden');
      setPlayPauseState(actuallyPlaying, true);
    }
  }

  setPlayPauseState(false, false);

  /** @type {UrielPlayButtonPart} */
  const api = { setPlayPauseState, updatePlayPauseButton };
  Object.assign(out, api);
};
