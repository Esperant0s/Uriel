// @ts-check
// Crossfade (#22, #29): the last seconds of a song move to a second player (the "tail") that plays them out while
// fading, and the next song starts at once and fades in. Falls back to a plain fade-out where a song can't be
// opened twice. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielCrossfadePart} out */
window.UrielApp.crossfade = function ({ audioEngine, el, isPhoneApp, playNext, playback, queueFinished, state, usingHls }, out) {
  // undoes the Crossfade fade-out of the playing song (a seek back, a pause, a skip, the queue ending)
  function cancelEndFade() {
    if (!playback.crossfadeTriggered) return;
    playback.crossfadeTriggered = false;
    if (audioEngine && audioEngine.masterGain && audioEngine.ctx) {
      try { audioEngine.masterGain.gain.cancelScheduledValues(audioEngine.ctx.currentTime); } catch (e) {}
      audioEngine._applyMasterVolume();
    }
  }

  // ---- Crossfade with overlap (#29) ----
  // The #22 fix let the song fade out to its real end, but the next one only started on 'ended', so Crossfade
  // sounded like no crossfade at all. Now the last X seconds of the song move to a second player (the "tail",
  // the same file opened again and seeked to that point before it's needed), which keeps playing to the song's
  // real end (or its trim end) while fading out; the main player goes on to the next song at once, which fades
  // in. Everything else (queue, now playing, scrobbling, media session) follows the main player as for any
  // next song. Falls back to the plain fade-out when the song can't be opened twice (hls.js / blob sources),
  // and on iPhones, where a player's volume can't be changed (so neither song could fade).
  // prep: the second player, opened at the crossfade point and waiting; tail: the old song fading out on it
  /** @typedef {{ el: HTMLAudioElement, token: number, point: number, end: number, ready: boolean, timer: number, started?: boolean, matchRate?: () => void }} CrossfadePrep */
  /** @typedef {{ el: HTMLAudioElement, end: number, point: number, level: number, loop: number }} CrossfadeTail */
  /** @type {{ prep: CrossfadePrep | null, tail: CrossfadeTail | null, handingOver: boolean, fadeInTimer: number }} */
  const xfade = { prep: null, tail: null, handingOver: false, fadeInTimer: 0 };
  const crossfadeSeconds = () => parseInt(localStorage.getItem('uriel_crossfade') || '0', 10) || 0;
  /** @type {boolean | null} */
  let volumeWorks = null;
  function elementVolumeWorks() {
    if (volumeWorks === null) {
      try { const t = new Audio(); t.volume = 0.5; volumeWorks = Math.abs(t.volume - 0.5) < 0.01; } catch (e) { volumeWorks = false; }
    }
    return volumeWorks;
  }
  function canOverlap(/** @type {HTMLAudioElement | null} */ a) {
    if (!a || usingHls()) return false;
    const src = a.currentSrc || '';
    if (!src || /^(blob|data):/.test(src)) return false;
    return elementVolumeWorks();
  }
  // the level the song plays at: on computers the engine's master volume (the tail skips the effects chain)
  function tailLevel() {
    if (!audioEngine) return 1;
    if (audioEngine.isMuted) return 0;
    if (isPhoneApp) return 1;
    // Gain at 0 is a real setting (silent), not a missing one
    const gain = Number(audioEngine.audioSettings && audioEngine.audioSettings.volume);
    const v = (Number(audioEngine.volume) || 0) * (Number.isFinite(gain) ? gain : 1);
    return Math.max(0, Math.min(1, v));
  }
  function disposeTailEl(/** @type {HTMLAudioElement | null} */ t) {
    if (!t) return;
    try { t.pause(); t.removeAttribute('src'); t.load(); } catch (e) {}
  }
  function dropCrossfadePrep() {
    const p = xfade.prep;
    xfade.prep = null;
    if (p) { clearTimeout(p.timer); disposeTailEl(p.el); }
  }
  // ends the old song's tail: at its end, or quickly (`fadeSec`) on a skip
  function stopCrossfadeTail(fadeSec = 0) {
    const t = xfade.tail;
    if (!t) return;
    xfade.tail = null;
    clearInterval(t.loop);
    if (!(fadeSec > 0) || t.el.paused) { disposeTailEl(t.el); return; }
    const from = t.el.volume;
    const started = performance.now();
    const step = setInterval(() => {
      const p = (performance.now() - started) / (fadeSec * 1000);
      if (p >= 1) { clearInterval(step); disposeTailEl(t.el); return; }
      try { t.el.volume = from * (1 - p); } catch (e) {}
    }, 30);
  }
  function resumeCrossfadeTail() {
    const t = xfade.tail;
    if (t && t.el.paused) Promise.resolve(t.el.play()).then(null, () => { if (xfade.tail === t) stopCrossfadeTail(0); });
  }
  function crossfadeTailRemaining() {
    const t = xfade.tail;
    if (!t) return 0;
    return Math.max(0, (t.end - (t.el.currentTime || 0)) / (t.el.playbackRate || 1));
  }
  // the second player opened at the crossfade point, ready before it's needed
  function prepareCrossfade(/** @type {number} */ point, /** @type {number} */ end) {
    const a = el.nativeAudio;
    dropCrossfadePrep();
    // Android: a second native player (mobile/native-audio.ts), since the song doesn't play in the page there
    const t = a.createTail ? a.createTail() : new Audio();
    /** @type {CrossfadePrep} */
    const p = { el: t, token: state.loadToken, point, end, ready: false, timer: 0 };
    xfade.prep = p;
    try {
      t.preload = 'auto';
      if (a.crossOrigin) t.crossOrigin = a.crossOrigin;
      t.volume = 0;
      // loading the song resets playbackRate to defaultPlaybackRate (1), so the tail played at normal speed and
      // pitch however the song was set (#36): set both, and again once it has loaded (WebKit resets it late)
      const matchRate = () => {
        const rate = a.playbackRate || 1;
        t.defaultPlaybackRate = rate;
        t.playbackRate = rate;
        if ('preservesPitch' in a) t.preservesPitch = a.preservesPitch;
        if ('webkitPreservesPitch' in a) t.webkitPreservesPitch = a.webkitPreservesPitch;
      };
      matchRate();
      p.matchRate = matchRate;
      if (a.sinkId && typeof t.setSinkId === 'function') t.setSinkId(a.sinkId).catch(() => {});
      t.addEventListener('loadedmetadata', () => { matchRate(); try { t.currentTime = point; } catch (e) {} }, { once: true });
      t.addEventListener('seeked', () => { if (xfade.prep === p) p.ready = true; }, { once: true });
      t.addEventListener('error', () => { if (xfade.prep === p) dropCrossfadePrep(); }, { once: true });
      t.src = a.currentSrc;
    } catch (e) { dropCrossfadePrep(); return; }
    // timeupdate comes only every quarter second or so: a timer starts the overlap on time
    const arm = () => {
      clearTimeout(p.timer);
      const wait = Math.max(0, ((point - (a.currentTime || 0)) / (a.playbackRate || 1)) * 1000);
      p.timer = window.setTimeout(() => {
        if (xfade.prep !== p) return;
        if ((a.currentTime || 0) < point - 0.03) { arm(); return; }
        startCrossfade();
      }, wait);
    };
    arm();
  }
  // the main player is at the point: the tail takes over the old song, the main player goes on to the next one
  function startCrossfade() {
    const a = el.nativeAudio;
    const p = xfade.prep;
    if (!p || p.started) return;
    p.started = true;
    clearTimeout(p.timer);
    const fallback = () => {
      if (xfade.prep === p) dropCrossfadePrep();
      if (p.token !== state.loadToken || a.paused || playback.crossfadeTriggered) return;
      // the plain fade-out of #22: the song still plays to its end, the next one starts on 'ended'
      playback.crossfadeTriggered = true;
      if (audioEngine) audioEngine.fadeOut(Math.max(0.3, (p.end - a.currentTime) / (a.playbackRate || 1)));
    };
    // My Wave on its last song: the next one is still being fetched, so moving on would start nothing and the
    // tail would play this same song again over it
    const waveAtEnd = state.myWaveActive && state.queueIndex >= state.queue.length - 1;
    // "end of song" picked after the tail was opened: this song has to be the last
    const sleepAtEnd = state.sleepTimer && state.sleepTimer.mode === 'end';
    if (!p.ready || p.token !== state.loadToken || a.paused || state.isRepeat || queueFinished() || waveAtEnd || sleepAtEnd) { fallback(); return; }
    const t = p.el;
    const level = tailLevel();
    try { t.currentTime = Math.min(p.end, a.currentTime + 0.02); } catch (e) {}
    if (p.matchRate) p.matchRate(); // the speed may have changed since the tail was opened
    t.volume = 0; // silent until the main player lets go, or the two would play the same seconds twice
    const played = t.play();
    Promise.resolve(played).then(() => {
      if (xfade.prep !== p || p.token !== state.loadToken || a.paused) { if (xfade.prep === p) dropCrossfadePrep(); else disposeTailEl(t); return; }
      xfade.prep = null;
      stopCrossfadeTail(0);
      t.volume = level;
      /** @type {CrossfadeTail} */
      const tail = { el: t, end: p.end, point: p.point, level, loop: 0 };
      xfade.tail = tail;
      // fade out along the song's own time, so a pause holds the fade where it is
      tail.loop = window.setInterval(() => {
        if (xfade.tail !== tail) { clearInterval(tail.loop); return; }
        const cur = t.currentTime || 0;
        if (t.ended || cur >= tail.end - 0.02) { stopCrossfadeTail(0); return; }
        try { t.volume = tail.level * window.UrielTrim.fadeOutGain((cur - tail.point) / (tail.end - tail.point)); } catch (e) {}
      }, 40);
      playback.crossfadeFadeInPending = true;
      xfade.handingOver = true;
      state._isNaturalEnding = true;
      try { playNext(); } finally { state._isNaturalEnding = false; xfade.handingOver = false; }
    }, () => fallback());
  }
  // the next song fades in while the tail fades out: through the engine on computers, the volume on phones
  function crossfadeFadeIn() {
    const X = crossfadeSeconds();
    const secs = Math.max(0.5, crossfadeTailRemaining() || X / 2);
    if (!isPhoneApp) { if (X > 0 && audioEngine) audioEngine.fadeIn(secs); return; }
    if (!elementVolumeWorks()) return;
    const a = el.nativeAudio;
    const started = performance.now();
    clearInterval(xfade.fadeInTimer);
    // On a timer, like the tail's fade-out, not on frames: a phone with the screen off draws almost none, and the
    // song came in in a few audible steps (it used to jump to full only at the end, before that).
    const tick = () => {
      const p = (performance.now() - started) / (secs * 1000);
      try { a.volume = p >= 1 ? 1 : window.UrielTrim.fadeInGain(p); } catch (e) {}
      if (p >= 1) clearInterval(xfade.fadeInTimer);
    };
    xfade.fadeInTimer = window.setInterval(tick, 40);
    tick();
  }
  // anything but the crossfade itself starting a song (a skip, a pick, Previous) ends the tail quickly
  function crossfadeOnTrackChange() {
    dropCrossfadePrep();
    if (xfade.handingOver) {
      // the next song starts silent and fades in once it plays ('playing' -> crossfadeFadeIn)
      if (isPhoneApp && elementVolumeWorks()) { try { el.nativeAudio.volume = 0; } catch (e) {} }
      else if (audioEngine && audioEngine.masterGain && audioEngine.ctx) {
        try { audioEngine.masterGain.gain.cancelScheduledValues(audioEngine.ctx.currentTime); audioEngine.masterGain.gain.setValueAtTime(0.001, audioEngine.ctx.currentTime); } catch (e) {}
      }
      return;
    }
    stopCrossfadeTail(0.25);
    clearInterval(xfade.fadeInTimer);
    // a song that ended after the plain fade-out still fades the next one in ('ended' set it)
    if (state._isNaturalEnding) return;
    playback.crossfadeFadeInPending = false;
    if (isPhoneApp && elementVolumeWorks()) { try { el.nativeAudio.volume = 1; } catch (e) {} }
  }

  // a pause during a crossfade holds the old song's tail too (the fade follows its time, so it resumes in place)
  function pauseCrossfadeTail() { if (xfade.tail) { try { xfade.tail.el.pause(); } catch (e) {} } }
  // the second player is already opened for this song's crossfade
  const crossfadePrepared = () => !!xfade.prep;

  // Settings → Crossfade: how many seconds the songs overlap
  const sliderCrossfade = /** @type {HTMLInputElement} */ (document.getElementById('slider-crossfade'));
  const valCrossfade = document.getElementById('val-crossfade');
  if (sliderCrossfade) {
    const cf = parseInt(localStorage.getItem('uriel_crossfade') || '0', 10);
    sliderCrossfade.value = String(cf);
    if (valCrossfade) valCrossfade.textContent = cf > 0 ? `${cf}s` : 'Off';
    sliderCrossfade.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      if (valCrossfade) valCrossfade.textContent = v > 0 ? `${v}s` : 'Off';
      localStorage.setItem('uriel_crossfade', String(v));
    });
  }

  /** @type {UrielCrossfadePart} */
  const api = {
    crossfadeSeconds, canOverlap, prepareCrossfade, crossfadePrepared, crossfadeFadeIn, crossfadeOnTrackChange,
    cancelEndFade, dropCrossfadePrep, pauseCrossfadeTail, resumeCrossfadeTail,
  };
  Object.assign(out, api);
};
