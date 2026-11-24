// @ts-check
// Touch and press feedback: the ripple on buttons (on release for a finger, so a swipe doesn't light them up),
// and holding a finger on a song to open its menu. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.touch = function ({ el }) {
  const PRESS_MIN = 180;
  document.addEventListener('pointerdown', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button, .chip-btn, .mix-card, .track-row, .nav-item, .rail-icon-btn, .preset-chip');
    if (!el) return;
    el.classList.add('pressed');
    const t0 = performance.now();
    const release = () => {
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      setTimeout(() => el.classList.remove('pressed'), Math.max(0, PRESS_MIN - (performance.now() - t0)));
    };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
  }, true);

  const RIPPLE_SEL = '.btn-pill-primary, .btn-outline-pill, .btn-icon-pill, .chip-btn, .control-btn, .rail-icon-btn, .preset-chip, .theme-mode-btn, .nav-item, .settings-nav-btn, .audio-tab, .titlebar-btn, .mix-card, .track-row';
  // A finger landing on a button may be starting a scroll, and it rests a moment before it moves, so no delay tells
  // the two apart: a finger's ripple shows when it lifts after a real tap. Started on pointerdown (and then after a
  // 120 ms wait), every swipe that began on a button or a song lit it up as if it were pressed. Scrolling also fades
  // out any ripple already showing. The mouse ripples on press as before.
  /** @type {{ el: HTMLElement, x: number, y: number, id: number } | null} */
  let pendingRipple = null;
  const dropRipple = () => { pendingRipple = null; };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || document.body.classList.contains('perf')) return;
    const el = /** @type {HTMLButtonElement} */ (/** @type {HTMLElement} */ (e.target).closest(RIPPLE_SEL));
    if (!el || el.disabled) return;
    if (e.pointerType === 'mouse') { spawnRipple(el, e.clientX, e.clientY); return; }
    pendingRipple = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
  }, true);
  document.addEventListener('pointermove', (e) => {
    const p = pendingRipple;
    if (p && e.pointerId === p.id && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) dropRipple();
  }, true);
  const fadeRipples = () => {
    dropRipple();
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.ripple-host > .ripple')).forEach((r) => { r.style.transition = 'opacity .15s'; r.style.opacity = '0'; setTimeout(() => r.remove(), 160); });
  };
  document.addEventListener('pointercancel', fadeRipples, true);
  document.addEventListener('scroll', () => { if (pendingRipple || document.querySelector('.ripple-host > .ripple')) fadeRipples(); }, true);
  document.addEventListener('pointerup', (e) => {
    const p = pendingRipple;
    if (!p || e.pointerId !== p.id) return;
    dropRipple();
    spawnRipple(p.el, p.x, p.y);
  }, true);
  function spawnRipple(/** @type {HTMLElement} */ el, /** @type {number} */ x, /** @type {number} */ y) {
    let host = el.querySelector(':scope > .ripple-host');
    if (!host) {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      host = document.createElement('span'); host.className = 'ripple-host'; el.appendChild(host);
    }
    const r = el.getBoundingClientRect();
    const size = Math.hypot(Math.max(x - r.left, r.right - x), Math.max(y - r.top, r.bottom - y)) * 2;
    const d = document.createElement('span'); d.className = 'ripple';
    d.style.cssText = `width:${size}px;height:${size}px;left:${x - r.left - size / 2}px;top:${y - r.top - size / 2}px`;
    host.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  // Holding a finger on a song opens its menu. iOS never sends 'contextmenu' for a held finger, and
  // Android sends it mid-hold, where it fights hold-to-reorder, so the menu opens on release instead.
  const TOUCH_HOLD_MS = 450;
  (() => {
    /** @type {{ row: Element, id: number, x: number, y: number, moved: boolean, fired: boolean, native: boolean, timer?: number } | null} */
    let hold = null;
    const end = () => {
      if (!hold) return;
      clearTimeout(hold.timer);
      hold.row.classList.remove('is-held');
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      hold = null;
    };
    const openMenu = (/** @type {{ row: Element, x: number, y: number }} */ h) => {
      // swallow the click this release turns into, it would start the song
      const swallow = (/** @type {Event} */ ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 400);
      const ev = /** @type {MouseEvent & { urielHold?: boolean }} */ (new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: h.x, clientY: h.y }));
      ev.urielHold = true;
      h.row.dispatchEvent(ev);
    };
    const move = (/** @type {PointerEvent} */ e) => {
      if (!hold || e.pointerId !== hold.id || Math.hypot(e.clientX - hold.x, e.clientY - hold.y) <= 8) return;
      hold.moved = true;
      if (!hold.fired) end();
    };
    const up = (/** @type {PointerEvent} */ e) => {
      if (!hold || e.pointerId !== hold.id) return;
      const h = hold; end();
      if (h.fired && !h.moved) openMenu(h);
    };
    // Android can cancel the pointer right after its own long-press event; that still counts as a hold
    const cancel = (/** @type {PointerEvent} */ e) => {
      if (!hold || e.pointerId !== hold.id) return;
      const h = hold; end();
      if (h.fired && h.native && !h.moved) openMenu(h);
    };
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const row = /** @type {HTMLElement} */ (e.target).closest('.track-row');
      if (!row || /** @type {HTMLElement} */ (e.target).closest('button, input, select, a, .drag-grip')) return;
      end();
      hold = { row, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, fired: false, native: false };
      hold.timer = window.setTimeout(() => {
        if (!hold) return;
        hold.fired = true;
        row.classList.add('is-held');
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
      }, TOUCH_HOLD_MS);
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', cancel, true);
    }, true);
    document.addEventListener('contextmenu', (/** @type {MouseEvent & { urielHold?: boolean }} */ e) => {
      if (!hold || e.urielHold || !/** @type {HTMLElement} */ (e.target).closest || !/** @type {HTMLElement} */ (e.target).closest('.track-row')) return;
      hold.native = true;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  })();
};
