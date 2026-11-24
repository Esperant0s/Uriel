// @ts-check
// The visualizers: the small one beside the player bar, the wide one behind it (bars or one liquid wave), the TV
// karaoke's, and the render loop that also moves the progress bar's knob and the synced lyrics. Off in
// performance mode; phones have no analyser. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielVisualizerPart} out */
window.UrielApp.visualizer = function ({ audioEngine, cancelVizFrame, dimColor, el, formatDuration, isPhoneApp, miniLyricsShown, nextPrefetchDue, playback, prefetchNextQueueTrack, primaryColor, scheduleVizFrame, state, updateMiniLyricsHighlight, updateSyncedLyricsHighlight, viz }, out) {
  let cachedTrackWidth = 0;
  let cachedTrackHeight = 40;
  let cachedTvkWidth = 0;
  let cachedTvkHeight = 0;
  /** @type {Float32Array | null} */
  let tvkSmoothedHeights = null;
  /** @type {Float32Array | null} */
  let vizPrev = null;
  function vizSettings() {
    const smooth = Math.min(0.95, Math.max(0, (parseInt(localStorage.getItem('uriel_viz_smooth') || '70', 10)) / 100));
    const sens = Math.min(3, Math.max(0.3, (parseInt(localStorage.getItem('uriel_viz_sens') || '100', 10)) / 100));
    return { smooth, sens };
  }

  // ---- Riff 43: visualizer drawn wide behind the player bar, and the "connected" (one liquid wave) style ----
  // Same analyser and frame cap as the other visualizers; off in performance mode, and phones have no analyser.
  function isVizConnectedMode() { return viz.connected; }
  /** @type {Float32Array | null} */
  let barBgSmoothed = null;
  let barBgW = 0;
  let BAR_BG_H = 88;
  /** @type {ReturnType<typeof vizSettings> | null} */
  let barBgSettings = null;
  let barBgSettingsAt = 0;
  function drawConnectedLiquidWave(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ w, /** @type {number} */ h, /** @type {number[] | Float32Array} */ heights, /** @type {string | CanvasGradient} */ color) {
    const rawN = heights.length;
    if (!rawN || w <= 0 || h <= 0) return;
    // few bars (mini, karaoke): mirror them so the wave rises in the middle
    let pts;
    if (rawN < 40) {
      const half = Math.min(18, rawN);
      pts = new Float32Array(half * 2);
      for (let i = 0; i < half; i++) { pts[half - 1 - i] = heights[i] || 0; pts[half + i] = heights[i] || 0; }
    } else {
      pts = Float32Array.from(heights);
    }
    const n = pts.length;
    const stepX = w / (n + 1);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    let px = 0;
    let py = h;
    for (let i = 0; i <= n; i++) {
      let x = w;
      let y = h;
      if (i < n) {
        const avg = (pts[Math.max(0, i - 2)] * 0.12 + pts[Math.max(0, i - 1)] * 0.24 + pts[i] * 0.28 + pts[Math.min(n - 1, i + 1)] * 0.24 + pts[Math.min(n - 1, i + 2)] * 0.12);
        const taper = Math.pow(Math.sin(((i + 0.5) / n) * Math.PI), 0.65);
        x = (i + 1) * stepX;
        y = h - Math.max(0, Math.min(h - 4, Math.max(0, avg - 3.5) * taper));
      }
      const midX = (px + x) * 0.5;
      ctx.bezierCurveTo(midX, py, midX, y, x, y);
      px = x;
      py = y;
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function clearBarBgVisualizer(/** @type {CanvasRenderingContext2D} */ ctx) {
    barBgSmoothed = null;
    if (barBgW) ctx.clearRect(0, 0, barBgW, BAR_BG_H);
  }
  function drawBarBgVisualizer(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {Uint8Array} */ data) {
    const w = barBgW;
    const h = BAR_BG_H;
    if (!w || !data) return;
    const now = performance.now();
    if (!barBgSettings || now - barBgSettingsAt > 1000) { barBgSettings = vizSettings(); barBgSettingsAt = now; }
    const { smooth, sens } = barBgSettings;
    const half = 26;
    const minH = 3;
    // a quiet backdrop: the bars stay in the lower part of the bar, under the time labels and seek bar
    const capH = Math.round(h * 0.42);
    if (!barBgSmoothed) barBgSmoothed = new Float32Array(half).fill(minH);
    let any = false;
    for (let i = 0; i < half; i++) {
      let target = minH;
      if (state.isPlaying) {
        const raw = (((data[i * 2] || 0) + (data[Math.min(data.length - 1, i * 2 + 1)] || 0)) * 0.5) * sens;
        target = minH + Math.pow(Math.min(1, Math.max(0, raw / 255)), 1.25) * (capH - minH);
      }
      barBgSmoothed[i] = barBgSmoothed[i] * smooth + target * (1 - smooth);
      if (barBgSmoothed[i] > minH + 0.5) any = true;
    }
    ctx.clearRect(0, 0, w, h);
    if (!any && !state.isPlaying) { barBgSmoothed = null; return; }
    const count = half * 2;
    const sym = new Float32Array(count);
    for (let i = 0; i < half; i++) { sym[half - 1 - i] = barBgSmoothed[i]; sym[half + i] = barBgSmoothed[i]; }
    const base = primaryColor() || '#ffffff';
    // fade out toward the top so the tallest bars melt away before they reach the controls
    const color = ctx.createLinearGradient(0, h, 0, h - capH);
    color.addColorStop(0, base);
    color.addColorStop(1, 'transparent');
    if (viz.connected) { drawConnectedLiquidWave(ctx, w, h, sym, color); return; }
    const gap = 2;
    const barW = Math.max(2, (w - gap * (count - 1)) / count);
    const startX = Math.max(0, (w - (count * barW + gap * (count - 1))) / 2);
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const barH = Math.max(2, Math.min(capH, sym[i]));
      ctx.beginPath();
      ctx.roundRect(startX + i * (barW + gap), h - barH, barW, barH, 3);
      ctx.fill();
    }
  }

  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    if (el.scrubberTrack) {
      let scrubberCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('squiggly-canvas'));
      if (!scrubberCanvas) {
        scrubberCanvas = document.createElement('canvas');
        scrubberCanvas.id = 'squiggly-canvas';
        scrubberCanvas.className = 'squiggly-canvas';
        el.scrubberTrack.appendChild(scrubberCanvas);
      }
      const rect = el.scrubberTrack.getBoundingClientRect();
      // measured while the playbar is still hidden the width is 0, which left a 0px canvas behind
      const rw = rect.width || el.scrubberTrack.clientWidth || 300;
      cachedTrackWidth = rw;
      cachedTrackHeight = Math.max(40, rect.height);
      viz.hasDrawnPausedFrame = false;
      scrubberCanvas.width = Math.round(rw * dpr);
      scrubberCanvas.height = Math.round(Math.max(40, rect.height) * dpr);
      scrubberCanvas.style.width = '100%';
      scrubberCanvas.style.height = `${Math.max(40, rect.height)}px`;
      const ctx = /** @type {CanvasRenderingContext2D} */ (scrubberCanvas.getContext('2d'));
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    }
    if (el.visualizerCanvas) {
      el.visualizerCanvas.width = 60 * dpr;
      el.visualizerCanvas.height = 24 * dpr;
      el.visualizerCanvas.style.width = '60px';
      el.visualizerCanvas.style.height = '24px';
      const ctx = el.visualizerCanvas.getContext('2d');
      if (ctx) {
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    }
    const tvkCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('tvk-visualizer-canvas'));
    if (tvkCanvas) {
      const cssW = Math.min(760, Math.max(360, Math.round(window.innerWidth * 0.64)));
      const cssH = Math.min(84, Math.max(52, Math.round(window.innerHeight * 0.085)));
      cachedTvkWidth = cssW;
      cachedTvkHeight = cssH;
      tvkCanvas.width = Math.round(cssW * dpr);
      tvkCanvas.height = Math.round(cssH * dpr);
      tvkCanvas.style.width = `${cssW}px`;
      tvkCanvas.style.height = `${cssH}px`;
      const ctx = tvkCanvas.getContext('2d');
      if (ctx) {
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    }
    const barBgCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playbar-bg-visualizer'));
    // phones draw it behind the mini player only with Settings → Visualizer on (Android, mobile-ui.ts)
    if (barBgCanvas && el.playbar && (!isPhoneApp || document.body.classList.contains('phone-viz'))) {
      // the canvas covers the whole player bar (see .playbar-bg-visualizer)
      barBgW = Math.max(200, el.playbar.clientWidth);
      BAR_BG_H = Math.max(40, el.playbar.clientHeight || 88);
      barBgCanvas.width = Math.round(barBgW * dpr);
      barBgCanvas.height = Math.round(BAR_BG_H * dpr);
      const bctx = barBgCanvas.getContext('2d');
      if (bctx) { bctx.resetTransform(); bctx.scale(dpr, dpr); }
    }
  }
  window.addEventListener('resize', resizeCanvases);
  setTimeout(resizeCanvases, 100);
  window.addEventListener('uriel:phone-viz', () => { resizeCanvases(); if (state.isPlaying) startVisualizers(); });

  let smoothAmplitude = 0;
  let smoothPhase = 0;
  let scrubPhase = 0;
  let scrubProgress = 0;
  /** @type {number | null} */
  let scrubPrevKnobX = null;
  let scrubKnobAnim = 0;
  let scrubLastTime = 0;
  let lastDisplayedSec = -1;

  let lastFrameTime = 0;
  function startVisualizers() {
    if (!state.isWindowVisible) return;
    cancelVizFrame();

    const analyserNode = audioEngine && audioEngine.getAnalyserNode ? audioEngine.getAnalyserNode() : null;
    const miniCanvas = el.visualizerCanvas;
    const miniCtx = miniCanvas ? miniCanvas.getContext('2d') : null;
    const tvkCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('tvk-visualizer-canvas'));
    const tvkCtx = tvkCanvas ? tvkCanvas.getContext('2d') : null;
    const barBgCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playbar-bg-visualizer'));
    const barBgCtx = barBgCanvas ? barBgCanvas.getContext('2d') : null;

    let bufferLength = analyserNode ? analyserNode.frequencyBinCount : 0;
    let freqData = bufferLength > 0 ? new Uint8Array(bufferLength) : null;

    /** @param {number} timestamp */
    function renderLoop(timestamp) {
      if (document.hidden || !state.isWindowVisible) {
        viz.animationFrameId = null;
        if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(false);
        return;
      }

      if (!state.isPlaying && !playback.isDraggingScrubber) {
        if (viz.hasDrawnPausedFrame) {
          viz.animationFrameId = null;
          if (audioEngine && audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(false);
          return;
        }
        viz.hasDrawnPausedFrame = true;
      } else {
        viz.hasDrawnPausedFrame = false;
      }

      // phones: with the player sheet closed nothing this loop draws is on screen (the mini player
      // follows timeupdate), so stop until the sheet or TV lyrics open again
      if (isPhoneApp && !state.isRightPanelOpen && !state.isTvKaraokeOpen && !document.body.classList.contains('phone-viz')) {
        viz.animationFrameId = null;
        return;
      }

      const fpsCap = document.body.classList.contains('perf') ? 30 : isPhoneApp ? 20 : viz.userFpsCap;
      viz.animationFrameId = scheduleVizFrame(renderLoop, fpsCap);
      if (fpsCap && timestamp - lastFrameTime < 1000 / fpsCap - 1) return;
      lastFrameTime = timestamp;

      const isVisualizerVisible = miniCanvas && miniCanvas.offsetParent !== null && !document.hidden;
      const isTvkVisualizerVisible = state.isTvKaraokeOpen && tvkCanvas && tvkCanvas.offsetParent !== null && !document.hidden;
      const needBassPulse = !!(state.vfx && state.vfx.bassPulse);
      const isBehindVizVisible = !!(barBgCanvas && !state.isTvKaraokeOpen && barBgCanvas.offsetParent !== null);

      if (!document.body.classList.contains('perf') && (isVisualizerVisible || isTvkVisualizerVisible || isBehindVizVisible || needBassPulse)) {
        // Android's native player sends its own bars (mobile/native-audio.ts); the analyser hears nothing of it
        const nativeBars = isPhoneApp && el.nativeAudio && el.nativeAudio.vizData;
        if (nativeBars) {
          if (!freqData || freqData.length !== nativeBars.length) freqData = new Uint8Array(nativeBars.length);
          freqData.set(nativeBars);
        } else if (!freqData && audioEngine && audioEngine.getAnalyserNode) {
          const an = audioEngine.getAnalyserNode();
          if (an && an.frequencyBinCount) {
            freqData = new Uint8Array(an.frequencyBinCount);
          }
        }
        if (freqData && (nativeBars || (audioEngine && audioEngine.getFrequencyData))) {
          if (!nativeBars) audioEngine.getFrequencyData(freqData);

          let bassEnergy = (freqData[0] + freqData[1] + freqData[2] + freqData[3]) / (4 * 255);

          if (needBassPulse) {
            const scaleMul = 1.0 + (bassEnergy * 0.035);
            const targetTransform = `scale(${scaleMul.toFixed(3)})`;
            if (el.coverContainer && el.coverContainer.style.transform !== targetTransform) {
              el.coverContainer.style.transform = targetTransform;
            }
          } else {
            if (el.coverContainer && el.coverContainer.style.transform) el.coverContainer.style.transform = '';
          }

          if (miniCtx && miniCanvas && isVisualizerVisible) {
            miniCtx.clearRect(0, 0, 60, 24);
            if (state.isPlaying) {
              const barCount = 12;
              const barWidth = 3;
              const gap = 2;
              const startX = (60 - (barCount * (barWidth + gap))) / 2;
              const connected = isVizConnectedMode();
              /** @type {number[] | null} */
              const heights = connected ? [] : null;

              for (let i = 0; i < barCount; i++) {
                const val = freqData[i * 2] || 0;
                let barHeight = (val / 255) * (24 - 4);
                if (barHeight < 2) barHeight = 2;
                if (connected) { /** @type {number[]} */ (heights).push(barHeight); continue; }

                const x = startX + i * (barWidth + gap);
                const y = 24 - barHeight;

                miniCtx.fillStyle = '#ffffff';
                miniCtx.beginPath();
                miniCtx.roundRect(x, y, barWidth, barHeight, 2);
                miniCtx.fill();
              }
              if (connected && heights) drawConnectedLiquidWave(miniCtx, 60, 24, heights, '#ffffff');
            }
          }

          if (tvkCtx && tvkCanvas && isTvkVisualizerVisible) {
            if (!cachedTvkWidth && typeof resizeCanvases === 'function') {
              resizeCanvases();
            }
            const w = cachedTvkWidth || (tvkCanvas.width / (window.devicePixelRatio || 1)) || 600;
            const h = cachedTvkHeight || (tvkCanvas.height / (window.devicePixelRatio || 1)) || 64;

            tvkCtx.clearRect(0, 0, w, h);

            if (state.isPlaying && freqData) {
              const data = freqData;
              const { smooth, sens } = vizSettings();
              if (!vizPrev || vizPrev.length !== data.length) vizPrev = new Float32Array(data.length);
              for (let i = 0; i < data.length; i++) {
                const v = Math.min(255, data[i] * sens);
                vizPrev[i] = vizPrev[i] * smooth + v * (1 - smooth);
              }

              const barCount = 28;
              if (!tvkSmoothedHeights || tvkSmoothedHeights.length !== barCount) {
                tvkSmoothedHeights = new Float32Array(barCount);
              }

              const gap = Math.max(3, Math.min(6, Math.round(w / 115)));
              const totalGap = gap * (barCount - 1);
              const barWidth = Math.max(4, Math.floor((w - totalGap) / barCount));
              const usedWidth = barCount * barWidth + totalGap;
              const startX = Math.max(0, (w - usedWidth) / 2);
              const minHeight = 4;
              const usableHeight = Math.max(10, h - minHeight - 2);
              const connected = isVizConnectedMode();

              for (let i = 0; i < barCount; i++) {
                const b0 = i * 2;
                const b1 = Math.min(63, b0 + 1);
                const raw = ((vizPrev[b0] || 0) + (vizPrev[b1] || 0)) * 0.5;

                const norm = raw / 255;
                const compressed = Math.pow(norm, 1.3) * 0.78;
                const targetHeight = minHeight + compressed * usableHeight;

                const barH = targetHeight;
                tvkSmoothedHeights[i] = barH;
                if (connected) continue;

                const x = startX + i * (barWidth + gap);
                const y = h - barH;

                tvkCtx.fillStyle = '#ffffff';
                tvkCtx.beginPath();
                tvkCtx.roundRect(x, y, barWidth, barH, Math.min(barWidth / 2, 3));
                tvkCtx.fill();
              }
              if (connected) {
                tvkCtx.save();
                tvkCtx.translate(startX, 0);
                drawConnectedLiquidWave(tvkCtx, usedWidth, h, tvkSmoothedHeights, '#ffffff');
                tvkCtx.restore();
              }
            } else if (tvkSmoothedHeights) {
              let anyActive = false;
              const barCount = tvkSmoothedHeights.length;
              const gap = Math.max(3, Math.min(6, Math.round(w / 115)));
              const totalGap = gap * (barCount - 1);
              const barWidth = Math.max(4, Math.floor((w - totalGap) / barCount));
              const usedWidth = barCount * barWidth + totalGap;
              const startX = Math.max(0, (w - usedWidth) / 2);
              const minHeight = 4;
              const connected = isVizConnectedMode();

              for (let i = 0; i < barCount; i++) {
                tvkSmoothedHeights[i] += (minHeight - tvkSmoothedHeights[i]) * 0.15;
                if (tvkSmoothedHeights[i] > minHeight + 0.5) anyActive = true;
                if (connected) continue;

                const barH = tvkSmoothedHeights[i];
                const x = startX + i * (barWidth + gap);
                const y = h - barH;

                tvkCtx.fillStyle = '#ffffff';
                tvkCtx.beginPath();
                tvkCtx.roundRect(x, y, barWidth, barH, Math.min(barWidth / 2, 3));
                tvkCtx.fill();
              }
              if (connected) {
                tvkCtx.save();
                tvkCtx.translate(startX, 0);
                drawConnectedLiquidWave(tvkCtx, usedWidth, h, tvkSmoothedHeights, '#ffffff');
                tvkCtx.restore();
              }
              if (!anyActive) {
                tvkSmoothedHeights = null;
              }
            }
          }

          if (barBgCtx && isBehindVizVisible) drawBarBgVisualizer(barBgCtx, freqData);
        }
      } else {
        if (audioEngine && audioEngine.setAnalyserEnabled && !needBassPulse) audioEngine.setAnalyserEnabled(false);
        if (el.coverContainer && el.coverContainer.style.transform) el.coverContainer.style.transform = '';
        if (miniCtx && miniCanvas) miniCtx.clearRect(0, 0, 60, 24);
        if (tvkCtx && tvkCanvas) {
          const w = cachedTvkWidth || (tvkCanvas.width / (window.devicePixelRatio || 1)) || 500;
          const h = cachedTvkHeight || (tvkCanvas.height / (window.devicePixelRatio || 1)) || 64;
          tvkCtx.clearRect(0, 0, w, h);
        }
        if (barBgCtx) clearBarBgVisualizer(barBgCtx);
      }

      let scrubberCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('squiggly-canvas'));
      if (scrubberCanvas && el.scrubberTrack) {
        const sCtx = /** @type {CanvasRenderingContext2D} */ (scrubberCanvas.getContext('2d'));
        const sw = cachedTrackWidth || (el.scrubberTrack ? el.scrubberTrack.clientWidth : 0);
        const sh = cachedTrackHeight || 40;
        sCtx.clearRect(0, 0, sw, sh);

        const dt = scrubLastTime === 0 ? 0.016 : Math.min((timestamp - scrubLastTime) / 1000, 0.1);
        scrubLastTime = timestamp;

        const dur = (el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0)
          ? el.nativeAudio.duration
          : (state.currentTrack && Number.isFinite(state.currentTrack.duration) ? state.currentTrack.duration : 0);
        let cur = (el.nativeAudio && Number.isFinite(el.nativeAudio.currentTime)) ? el.nativeAudio.currentTime : 0;

        if (playback.isDraggingScrubber && state.scrubberDragTargetTime !== undefined) {
          cur = state.scrubberDragTargetTime;
          const t = formatDuration(cur);
          if (el.timeCurrent && el.timeCurrent.textContent !== t) el.timeCurrent.textContent = t;
        } else if (state.isPlaying) {
          const roundedSec = Math.floor(cur);
          if (lastDisplayedSec !== roundedSec) {
            lastDisplayedSec = roundedSec;
            const t = formatDuration(cur);
            if (el.timeCurrent && el.timeCurrent.textContent !== t) el.timeCurrent.textContent = t;
          }
          if (dur > 0 && el.timeDuration) {
            const d = formatDuration(dur);
            if (el.timeDuration.textContent !== d) el.timeDuration.textContent = d;
          }
          if (nextPrefetchDue(cur, dur) && !state.nextTrackPrefetched) {
            state.nextTrackPrefetched = true;
            prefetchNextQueueTrack();
          }
          if (state.isRightPanelOpen || state.isTvKaraokeOpen) {
            updateSyncedLyricsHighlight(cur);
          } else if (miniLyricsShown()) {
            updateMiniLyricsHighlight(cur);
          }
        }

        const targetProgress = dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0;
        const followSpeed = playback.isDraggingScrubber ? 32 : 45;
        scrubProgress += (targetProgress - scrubProgress) * Math.min(1, dt * followSpeed);

        const targetAnim = playback.isDraggingScrubber ? 1 : 0;
        scrubKnobAnim += (targetAnim - scrubKnobAnim) * Math.min(1, Math.max(0, dt * 16));
        // a NaN here sticks for good and roundRect throws on a negative radius
        scrubKnobAnim = Math.max(0, Math.min(1, Number.isFinite(scrubKnobAnim) ? scrubKnobAnim : 0));
        const curKnobW = 7.5 + (9.0 - 7.5) * scrubKnobAnim;
        const curKnobH = 24 + (32 - 24) * scrubKnobAnim;
        const curKnobR = Math.max(0, 3.75 + (4.5 - 3.75) * scrubKnobAnim);

        const padLeft = 5.5;
        const padRight = 5.5;
        const trackWidth = sw - padLeft - padRight;
        const knobCenterX = padLeft + scrubProgress * trackWidth;

        if (scrubPrevKnobX === null) scrubPrevKnobX = knobCenterX;
        const deltaX = knobCenterX - scrubPrevKnobX;
        scrubPrevKnobX = knobCenterX;

        const k = (2 * Math.PI) / 42;

        if (playback.isDraggingScrubber) {
          scrubPhase += deltaX * k;
        } else if (state.isPlaying) {
          scrubPhase += 3.5 * dt;
        }

        const noKnob = document.body.classList.contains('no-knob');
        const capRadius = 9.5 / 2;
        const knobLeft = knobCenterX - curKnobW / 2;
        const waveStart = padLeft;
        const waveEnd = noKnob ? knobCenterX : (knobLeft - 4.5 - capRadius);

        const inactiveStart = noKnob ? knobCenterX : (knobCenterX + (curKnobW / 2) + 4);
        const inactiveEnd = sw - padRight;

        const primary = primaryColor();
        const dim = dimColor();

        const centerY = sh / 2;

        const showProgressBg = localStorage.getItem('uriel_progress_bg') !== 'false';
        if (showProgressBg && inactiveEnd > inactiveStart) {
          sCtx.save();
          sCtx.globalAlpha = 0.3;
          sCtx.beginPath();
          sCtx.lineWidth = 11;
          sCtx.lineCap = 'round';
          sCtx.strokeStyle = dim;
          sCtx.moveTo(inactiveStart, centerY);
          sCtx.lineTo(inactiveEnd, centerY);
          sCtx.stroke();
          sCtx.restore();
        }

        if (waveEnd > waveStart) {
          sCtx.beginPath();
          sCtx.lineWidth = 9.5;
          sCtx.lineCap = 'round';
          sCtx.lineJoin = 'round';
          sCtx.strokeStyle = primary;

          if (document.body.classList.contains('no-wavy')) {
            sCtx.moveTo(waveStart, centerY);
            sCtx.lineTo(waveEnd, centerY);
            sCtx.stroke();
          } else {
            const step = 2;
            for (let x = waveStart; x <= waveEnd; x += step) {
              const angle = scrubPhase - (waveEnd - x) * k;
              const y = centerY + Math.sin(angle) * 5;
              if (x === waveStart) {
                sCtx.moveTo(x, y);
              } else {
                sCtx.lineTo(x, y);
              }
            }

            const finalY = centerY + Math.sin(scrubPhase) * 5;
            sCtx.lineTo(waveEnd, finalY);
            sCtx.stroke();
          }
        }

        if (!noKnob) {
          sCtx.beginPath();
          sCtx.roundRect(knobLeft, centerY - curKnobH / 2, curKnobW, curKnobH, curKnobR);
          sCtx.fillStyle = primary;
          sCtx.fill();
        }
      }
    }
    renderLoop(0);
  }

  // a new song: the bars start from silence and the knob from the start
  function resetLevelHistory() { vizPrev = null; }
  function resetScrubber() { scrubPrevKnobX = null; scrubProgress = 0; }

  /** @type {UrielVisualizerPart} */
  const api = { startVisualizers, resizeCanvases, resetLevelHistory, resetScrubber };
  Object.assign(out, api);
};
