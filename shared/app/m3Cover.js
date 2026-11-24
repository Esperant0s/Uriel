// @ts-check
// The playing song's cover beside the player bar drawn on a canvas, with the Material 3 ring that moves while it
// plays. Off on phones and in performance mode. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielM3CoverPart} out */
window.UrielApp.m3Cover = function ({ el, getTrackThumbUrl, isPhoneApp, primaryColor, state, viz }, out) {
  const COVER_PX = 70;
  const CANVAS_PX = 120;
  const RING_GAP = 5;
  const RING_W = 2.4;

  /** @type {{ canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null, img: HTMLImageElement, imgReady: boolean, from: number, to: number, start: number, raf: number, last: number, phase: number, hoverProgress: number, isHovered: boolean }} */
  const m3c = { canvas: null, ctx: null, img: new Image(), imgReady: false, from: 0, to: 0, start: 0, raf: 0, last: 0, phase: 0, hoverProgress: 0, isHovered: false };
  // phones keep the plain cover: the animated ring doesn't fit the mini player and its loop costs battery
  function m3cEnabled() { return !isPhoneApp && localStorage.getItem('uriel_m3_cover') !== '0' && !document.body.classList.contains('perf'); }
  function m3cInit() {
    m3c.canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('m3c-canvas'));
    if (!m3c.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    m3c.canvas.width = CANVAS_PX * dpr;
    m3c.canvas.height = CANVAS_PX * dpr;
    m3c.ctx = /** @type {CanvasRenderingContext2D} */ (m3c.canvas.getContext('2d'));
    m3c.ctx.scale(dpr, dpr);
    m3c.ctx.imageSmoothingEnabled = true;
    m3c.ctx.imageSmoothingQuality = 'high';
    m3c.img.onload = () => { m3c.imgReady = true; m3cDraw(performance.now()); };
    if (el.playbarArtwork && el.playbarArtwork.src) {
      m3cSetImage(el.playbarArtwork.src);
    } else if (state.currentTrack) {
      m3cSetImage(getTrackThumbUrl(state.currentTrack));
    }
    const wrap = /** @type {HTMLElement} */ (document.getElementById('playbar-artwork-wrapper'));
    if (wrap && !wrap._m3cHoverBound) {
      wrap._m3cHoverBound = true;
      wrap.addEventListener('mouseenter', () => {
        m3c.isHovered = true;
        m3cStart();
      });
      wrap.addEventListener('mouseleave', () => {
        m3c.isHovered = false;
        m3cStart();
      });
    }
    applyM3Cover();
  }
  function m3cSetImage(/** @type {string} */ url) {
    m3c.imgReady = false;
    if (url) m3c.img.src = url;
  }
  function m3cShapeRadii(/** @type {number} */ now) {
    const S = window.RiffShapes;
    if (!S || !S.ready()) return null;
    if (!m3c.start) { m3c.start = now; m3c.from = 0; m3c.to = 0; }
    if (now - m3c.start >= S.HOLD_MS) { m3c.from = m3c.to; m3c.to = S.next(m3c.from); m3c.start = now; }
    const t = Math.min(1, (now - m3c.start) / S.MORPH_MS);
    return { a: S.profile(m3c.from), b: S.profile(m3c.to), e: S.ease(t) };
  }
  function m3cDraw(/** @type {number} */ now) {
    const ctx = m3c.ctx;
    const S = window.RiffShapes;
    if (!ctx || !S) return;
    const sh = m3cShapeRadii(now);
    if (!sh) return;
    const K = S.K;
    const hoverScale = 1 + m3c.hoverProgress * 0.16;
    const hoverLift = m3c.hoverProgress * 4;
    const cx = CANVAS_PX / 2;
    const cy = CANVAS_PX / 2 - hoverLift;
    const currentCover = COVER_PX * hoverScale;
    const scale = (currentCover / 2) / 160 * 1.02;
    const rot = (now / 36000) * Math.PI * 2;
    const radiusAt = (/** @type {number} */ shapeAngle) => {
      const f = ((shapeAngle + Math.PI) / (Math.PI * 2)) * K;
      const i0 = ((Math.floor(f) % K) + K) % K;
      const i1 = (i0 + 1) % K;
      const w = f - Math.floor(f);
      const r0 = sh.a[i0] + (sh.b[i0] - sh.a[i0]) * sh.e;
      const r1 = sh.a[i1] + (sh.b[i1] - sh.a[i1]) * sh.e;
      return (r0 + (r1 - r0) * w) * scale;
    };
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k <= K; k++) {
      const th = -Math.PI + (Math.PI * 2 * (k % K)) / K;
      const r = radiusAt(th);
      const x = cx + Math.cos(th + rot) * r;
      const y = cy + Math.sin(th + rot) * r;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    if (m3c.imgReady) {
      const iw = m3c.img.naturalWidth;
      const ih = m3c.img.naturalHeight;
      const side = Math.min(iw, ih);
      const imgSize = Math.ceil(currentCover * 1.06);
      ctx.drawImage(m3c.img, (iw - side) / 2, (ih - side) / 2, side, side, cx - imgSize / 2, cy - imgSize / 2, imgSize, imgSize);
    } else {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface-container-highest-solid') || '#444';
      ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    }
    ctx.restore();
    const audio = el.nativeAudio;
    const dur = audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const p = dur ? Math.min(1, Math.max(0, audio.currentTime / dur)) : 0;
    // the theme color is cached and refreshed on theme changes, like the scrubber's: no style read per frame
    const primary = primaryColor() || '#d0bcff';
    const STEPS = 240;
    const ringPoint = (/** @type {number} */ phi, /** @type {number} */ wave) => {
      const r = radiusAt(phi - rot) + RING_GAP + RING_W / 2 + wave;
      return [cx + Math.cos(phi) * r, cy + Math.sin(phi) * r];
    };
    const startPhi = -Math.PI / 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = RING_W;
    ctx.setLineDash([0.1, 5.5]);
    ctx.strokeStyle = primary;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    const restFrom = Math.round(p * STEPS);
    for (let s = restFrom; s <= STEPS; s++) {
      const [x, y] = ringPoint(startPhi + (Math.PI * 2 * s) / STEPS, 0);
      if (s === restFrom) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (p > 0) {
      ctx.beginPath();
      const playedSteps = Math.max(2, Math.round(p * STEPS));
      for (let s = 0; s <= playedSteps; s++) {
        const phi = startPhi + (Math.PI * 2 * s) / STEPS;
        const [x, y] = ringPoint(phi, Math.sin(phi * 26 + m3c.phase) * 1.5);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  function m3cLoop(/** @type {number} */ now) {
    m3c.raf = 0;
    if (!m3cEnabled() || document.hidden) return;

    const targetHover = m3c.isHovered ? 1 : 0;
    const diff = targetHover - m3c.hoverProgress;
    const isHoverAnimating = Math.abs(diff) > 0.002;
    if (isHoverAnimating) {
      m3c.hoverProgress += diff * 0.2;
    } else {
      m3c.hoverProgress = targetHover;
    }

    if (!state.isPlaying && !isHoverAnimating) {
      m3cDraw(now);
      return;
    }

    if (now - m3c.last >= Math.max(24, viz.userFpsCap ? 1000 / viz.userFpsCap - 1 : 0)) {
      m3c.last = now;
      if (state.isPlaying) m3c.phase += 0.18;
      m3cDraw(now);
    }
    // the hover grows a bit each frame, so it needs every frame; the morph only draws every 24 ms (or slower under
    // the Settings cap), so between those it waits on a timer instead of waking the page on every screen refresh
    if (isHoverAnimating) m3c.raf = requestAnimationFrame(m3cLoop);
    else m3c.raf = window.setTimeout(() => requestAnimationFrame(m3cLoop), Math.max(0, Math.max(24, viz.userFpsCap ? 1000 / viz.userFpsCap : 0) - 7));
  }
  function m3cStart() { if (!m3c.raf) m3c.raf = requestAnimationFrame(m3cLoop); }
  function applyM3Cover() {
    const on = m3cEnabled();
    document.body.classList.toggle('m3-cover-on', on);
    if (on) { m3cDraw(performance.now()); if (state.isPlaying || m3c.isHovered) m3cStart(); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyM3Cover(); });

  /** @type {UrielM3CoverPart} */
  const api = { m3cEnabled, m3cInit, m3cSetImage, m3cDraw, m3cStart, applyM3Cover };
  Object.assign(out, api);
};
