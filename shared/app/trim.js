// @ts-check
// "Trim best part" (the Download dialog): keep only part of a song, set by dragging on its waveform; playback skips
// the rest. Part of app.js, which calls this early, since the player asks for a song's trim from the start.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielTrimPart} out */
window.UrielApp.trim = function ({ T, el, getTrackCanonicalId, getTrackToDownload, isSameTrack, playNext, playSmooth, playTrack, playback, primaryColor, queueFinished, safeJson, showToast, state }, out) {
  // ---- Download dialog → "Trim best part": keep only part of a song; playback skips the rest ----
  /** @type {Record<string, { start: number, end: number, updatedAt?: number }> | null} */
  var trackTrims = null;
  var trimDraft = { start: 0, end: 180, dur: 180 };
  var TRIM_BARS = 84;
  var trimPeaks = new Map();
  function allTrackTrims() {
    if (!trackTrims) trackTrims = /** @type {Record<string, { start: number, end: number, updatedAt?: number }>} */ (safeJson('uriel_track_trims', {}) || {});
    return trackTrims;
  }
  function getTrackTrim(/** @type {UrielTrack} */ track) {
    const id = track ? getTrackCanonicalId(track) : '';
    return id ? allTrackTrims()[id] || null : null;
  }
  function saveTrackTrim(/** @type {UrielTrack} */ track, /** @type {{ start: number, end: number } | null} */ trim) {
    const id = track ? getTrackCanonicalId(track) : '';
    if (!id) return;
    const all = allTrackTrims();
    if (trim) all[id] = { ...trim, updatedAt: Date.now() }; else delete all[id];
    localStorage.setItem('uriel_track_trims', JSON.stringify(all));
  }
  window.addEventListener('storage', (e) => { if (!e.key || /uriel_track_trims$/.test(e.key)) trackTrims = null; });
  // called on every timeupdate: before the kept part, jump to it; after it, the song is over
  function enforceTrackTrim() {
    const a = el.nativeAudio;
    if (!a || !state.currentTrack || playback.isDraggingScrubber || !window.UrielTrim) return false;
    const trim = getTrackTrim(state.currentTrack);
    const action = window.UrielTrim.trimAction(trim, a.currentTime);
    if (action === 'start' && trim) { a.currentTime = trim.start; return true; }
    if (action !== 'end' || a.paused) return false;
    if (state.isRepeat && trim) { a.currentTime = trim.start; return true; }
    if ((state.sleepTimer && state.sleepTimer.mode === 'end') || queueFinished()) {
      a.pause();
      a.dispatchEvent(new Event('ended'));
      return true;
    }
    if (playback.crossfadeTriggered) playback.crossfadeFadeInPending = true;
    state._isNaturalEnding = true;
    try { playNext(); } finally { state._isNaturalEnding = false; }
    return true;
  }
  if (el.nativeAudio) {
    // a trimmed song starts at its trim
    const toTrimStart = () => {
      const trim = state.currentTrack && window.UrielTrim ? getTrackTrim(state.currentTrack) : null;
      if (window.UrielTrim && window.UrielTrim.trimAction(trim, el.nativeAudio.currentTime) === 'start' && trim) el.nativeAudio.currentTime = trim.start;
    };
    el.nativeAudio.addEventListener('loadedmetadata', toTrimStart);
    el.nativeAudio.addEventListener('play', toTrimStart);
  }
  function showDownloadPane(/** @type {string} */ which) {
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.dl-mode-tab')).forEach((t) => t.classList.toggle('active', t.dataset.dlTab === which));
    const dl = document.getElementById('dl-pane-download');
    const tr = document.getElementById('dl-pane-trim');
    if (dl) dl.classList.toggle('hidden', which !== 'download');
    if (tr) tr.classList.toggle('hidden', which !== 'trim');
    if (which === 'trim') { sizeTrimCanvas(); updateTrimmerUI(); }
  }
  function prepareTrimPane(/** @type {UrielTrack} */ track) {
    const a = el.nativeAudio;
    const dur = isSameTrack(track, state.currentTrack) && a && Number.isFinite(a.duration) && a.duration > 0
      ? a.duration
      : (Number(track.duration) > 0 ? Number(track.duration) : 180);
    const saved = getTrackTrim(track);
    trimDraft = { start: saved ? Math.max(0, saved.start) : 0, end: saved ? Math.min(dur, saved.end) : dur, dur };
    const reset = document.getElementById('btn-cc-reset');
    if (reset) reset.classList.toggle('hidden', !saved);
    showDownloadPane('download');
    // a saved trim also fills in the download's trim (computers: ffmpeg cuts the file)
    if (saved) {
      const s = /** @type {HTMLInputElement} */ (document.getElementById('trim-start'));
      const e = /** @type {HTMLInputElement} */ (document.getElementById('trim-end'));
      if (s) s.value = window.UrielTrim.formatPreciseTime(trimDraft.start);
      if (e) e.value = window.UrielTrim.formatPreciseTime(trimDraft.end);
    }
  }
  function sizeTrimCanvas() {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('capcut-wave-canvas'));
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  // the bars: the song's real waveform when it is on this device (decoded at a low sample rate, so a long song
  // stays small), else a stand-in shape
  function trimWavePeaks(/** @type {UrielTrack} */ track) {
    const id = getTrackCanonicalId(track);
    if (trimPeaks.has(id)) return trimPeaks.get(id);
    const peaks = window.UrielTrim.placeholderPeaks(id, TRIM_BARS);
    trimPeaks.set(id, peaks);
    if (trimPeaks.size > 30) trimPeaks.delete(trimPeaks.keys().next().value);
    (async () => {
      try {
        let url = '';
        if (track.platform === 'local' && track.id) url = `http://127.0.0.1:${state.serverPort}/api/library-file?id=${encodeURIComponent(track.id)}`;
        else if (track.id) {
          const r = await fetch(`http://127.0.0.1:${state.serverPort}/api/check-cache?id=${encodeURIComponent(track.id)}`);
          const c = await r.json();
          if (c && c.cached) url = `http://127.0.0.1:${state.serverPort}/api/local-track?id=${encodeURIComponent(track.id)}`;
        }
        if (!url) return;
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > 60e6) return;
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Offline) return;
        const audio = await new Offline(1, 1, 8000).decodeAudioData(buf);
        trimPeaks.set(id, window.UrielTrim.wavePeaks(audio.getChannelData(0), TRIM_BARS));
        const shown = getTrackToDownload();
        if (shown && getTrackCanonicalId(shown) === id) renderTrimWave();
      } catch (e) {}
    })();
    return peaks;
  }
  function renderTrimWave() {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('capcut-wave-canvas'));
    const track = getTrackToDownload();
    if (!canvas || !track) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const peaks = trimWavePeaks(track);
    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, w, h);
    const dur = Math.max(1, trimDraft.dur);
    const from = trimDraft.start / dur;
    const to = trimDraft.end / dur;
    const step = w / TRIM_BARS;
    const barW = step * 0.6;
    for (let i = 0; i < TRIM_BARS; i++) {
      const at = i / (TRIM_BARS - 1);
      ctx.fillStyle = at >= from - 0.01 && at <= to + 0.01 ? (primaryColor() || '#a8c7fa') : 'rgba(255, 255, 255, 0.22)';
      const barH = Math.max(6 * dpr, (peaks[i] || 0.3) * (h - 16 * dpr));
      ctx.beginPath();
      ctx.roundRect(i * step + (step - barW) / 2, (h - barH) / 2, barW, barH, 2 * dpr);
      ctx.fill();
    }
  }
  function updateTrimmerUI() {
    const T = window.UrielTrim;
    if (!T) return;
    const dur = Math.max(1, trimDraft.dur);
    const startPct = (trimDraft.start / dur) * 100;
    const endPct = (trimDraft.end / dur) * 100;
    const set = (/** @type {string} */ id, /** @type {(n: HTMLElement) => void} */ fn) => { const n = document.getElementById(id); if (n) fn(n); };
    set('cc-mask-left', (/** @type {HTMLElement} */ n) => { n.style.width = `${startPct}%`; });
    set('cc-mask-right', (/** @type {HTMLElement} */ n) => { n.style.width = `${100 - endPct}%`; });
    set('cc-selection-box', (/** @type {HTMLElement} */ n) => { n.style.left = `${startPct}%`; n.style.width = `${Math.max(0, endPct - startPct)}%`; });
    const s = T.formatPreciseTime(trimDraft.start);
    const e = T.formatPreciseTime(trimDraft.end);
    set('cc-trim-start-val', (/** @type {HTMLElement} */ n) => { n.textContent = s; });
    set('cc-trim-end-val', (/** @type {HTMLElement} */ n) => { n.textContent = e; });
    set('cc-trim-dur-val', (/** @type {HTMLElement} */ n) => { n.textContent = T.formatPreciseTime(Math.max(0, trimDraft.end - trimDraft.start)); });
    set('cc-float-left', (/** @type {HTMLElement} */ n) => { n.textContent = s; });
    set('cc-float-right', (/** @type {HTMLElement} */ n) => { n.textContent = e; });
    renderTrimWave();
    updateTrimPlayhead();
  }
  function updateTrimPlayhead() {
    const head = document.getElementById('cc-playhead');
    if (!head) return;
    const track = getTrackToDownload();
    const same = track && state.currentTrack && isSameTrack(state.currentTrack, track);
    head.style.display = same ? '' : 'none';
    if (same && el.nativeAudio) head.style.left = `${Math.max(0, Math.min(100, ((el.nativeAudio.currentTime || 0) / Math.max(1, trimDraft.dur)) * 100))}%`;
  }
  (function setupTrimmer() {
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.dl-mode-tab')).forEach((tab) => tab.addEventListener('click', () => showDownloadPane(tab.dataset.dlTab || '')));
    const stage = document.getElementById('capcut-wave-stage');
    if (!stage) return;
    const minKeep = window.UrielTrim ? window.UrielTrim.MIN_KEEP : 1;
    const ratioAt = (/** @type {PointerEvent} */ e) => { const r = stage.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0; };
    const dragHandle = (/** @type {HTMLElement | null} */ handle, /** @type {string} */ side) => {
      if (!handle) return;
      let dragging = false;
      handle.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => { e.stopPropagation(); dragging = true; handle.setPointerCapture(e.pointerId); handle.classList.add('dragging'); });
      handle.addEventListener('pointermove', (/** @type {PointerEvent} */ e) => {
        if (!dragging) return;
        const t = Math.round(ratioAt(e) * trimDraft.dur * 10) / 10;
        if (side === 'start') trimDraft.start = Math.max(0, Math.min(t, trimDraft.end - minKeep));
        else trimDraft.end = Math.min(trimDraft.dur, Math.max(t, trimDraft.start + minKeep));
        updateTrimmerUI();
      });
      const stop = (/** @type {PointerEvent} */ e) => { if (!dragging) return; dragging = false; try { handle.releasePointerCapture(e.pointerId); } catch (_) {} handle.classList.remove('dragging'); };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    };
    dragHandle(document.getElementById('cc-handle-left'), 'start');
    dragHandle(document.getElementById('cc-handle-right'), 'end');
    // tap the waveform to listen from there
    const playFrom = async (/** @type {number} */ t) => {
      const track = getTrackToDownload();
      if (!track || !el.nativeAudio) return;
      if (!isSameTrack(state.currentTrack, track)) await playTrack(track);
      el.nativeAudio.currentTime = t;
      if (el.nativeAudio.paused) playSmooth();
    };
    stage.addEventListener('pointerdown', (e) => { if (!/** @type {HTMLElement} */ (e.target).closest('.cc-handle')) playFrom(ratioAt(e) * trimDraft.dur); });
    const btnPreview = document.getElementById('btn-cc-preview');
    if (btnPreview) btnPreview.addEventListener('click', () => playFrom(trimDraft.start));
    const btnSave = document.getElementById('btn-cc-save');
    const btnReset = document.getElementById('btn-cc-reset');
    if (btnSave) btnSave.addEventListener('click', () => {
      const track = getTrackToDownload();
      if (!track) return;
      const trim = window.UrielTrim.normalizeTrim(trimDraft.start, trimDraft.end, trimDraft.dur);
      saveTrackTrim(track, trim);
      if (btnReset) btnReset.classList.toggle('hidden', !trim);
      const T = window.UrielTrim;
      showToast(trim ? `Trim saved: ${T.formatPreciseTime(trim.start)} – ${T.formatPreciseTime(trim.end)}` : 'That keeps the whole song, so there is no trim', trim ? 'success' : 'info');
      if (trim) {
        const s = /** @type {HTMLInputElement} */ (document.getElementById('trim-start'));
        const e = /** @type {HTMLInputElement} */ (document.getElementById('trim-end'));
        if (s) s.value = T.formatPreciseTime(trim.start);
        if (e) e.value = T.formatPreciseTime(trim.end);
        if (state.currentTrack && isSameTrack(state.currentTrack, track) && el.nativeAudio) {
          const t = el.nativeAudio.currentTime;
          if (t < trim.start || t > trim.end) el.nativeAudio.currentTime = trim.start;
        }
      }
    });
    if (btnReset) btnReset.addEventListener('click', () => {
      const track = getTrackToDownload();
      if (!track) return;
      saveTrackTrim(track, null);
      trimDraft.start = 0;
      trimDraft.end = trimDraft.dur;
      updateTrimmerUI();
      btnReset.classList.add('hidden');
      showToast('Trim removed', 'info');
    });
    if (el.nativeAudio) el.nativeAudio.addEventListener('timeupdate', () => {
      const pane = document.getElementById('dl-pane-trim');
      if (pane && !pane.classList.contains('hidden') && el.downloadModal && !el.downloadModal.classList.contains('hidden')) updateTrimPlayhead();
    });
  })();

  // another device or profile wrote the trims (sync): read them again when next asked
  function forgetTrackTrims() { trackTrims = null; }

  /** @type {UrielTrimPart} */
  const api = { getTrackTrim, enforceTrackTrim, showDownloadPane, prepareTrimPane, forgetTrackTrims };
  Object.assign(out, api);
};
