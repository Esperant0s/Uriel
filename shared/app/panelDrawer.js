// @ts-check
// The slide-over drawer: "Now playing" (cover + lyrics) and "Queue" tabs, closed by default, and dragging its
// edge to make it wider. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielPanelDrawerPart} out */
window.UrielApp.panelDrawer = function ({ el, renderQueueView, resizeCanvases, startVisualizers, state, viz }, out) {
  const btnToggleQueue = document.getElementById('btn-toggle-queue');
  const drawerTabs = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.drawer-tab'));
  function syncDrawerUI() {
    const open = state.isRightPanelOpen;
    if (open && !viz.animationFrameId) { viz.hasDrawnPausedFrame = false; startVisualizers(); }
    if (el.rightPanel) el.rightPanel.classList.toggle('hidden', !open);
    drawerTabs.forEach((t) => {
      const on = t.dataset.drawerTab === state.drawerTab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-pressed', String(on));
    });
    const now = document.getElementById('drawer-now');
    const queue = document.getElementById('drawer-queue');
    if (now) now.classList.toggle('hidden', state.drawerTab !== 'now');
    if (queue) queue.classList.toggle('hidden', state.drawerTab !== 'queue');
    if (el.btnToggleLyricsPanel) el.btnToggleLyricsPanel.classList.toggle('active', open && state.drawerTab === 'now');
    if (btnToggleQueue) btnToggleQueue.classList.toggle('active', open && state.drawerTab === 'queue');
  }
  function openPanelDrawer(/** @type {string} */ tab) {
    state.drawerTab = tab || state.drawerTab;
    state.isRightPanelOpen = true;
    syncDrawerUI();
    // drawn once the pane shows: while hidden it has no height, and the list drew only its first rows
    if (state.drawerTab === 'queue') { renderQueueView(); showPlayingInQueue(); }
    setTimeout(resizeCanvases, 150);
  }
  // the queue opens on the song playing (the one before it just above), not on songs that played long ago
  function showPlayingInQueue() {
    const pane = document.getElementById('drawer-queue-scroll');
    const list = /** @type {HTMLElement} */ (el.queueTracksList);
    if (!pane || !list || state.queueIndex < 0) return;
    const listTop = list.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    pane.scrollTop = listTop + Math.max(0, state.queueIndex - 1) * (list._rowHeight || 64);
  }
  function closePanelDrawer() {
    state.isRightPanelOpen = false;
    syncDrawerUI();
  }
  function togglePanelDrawer(/** @type {string} */ tab) {
    if (state.isRightPanelOpen && state.drawerTab === tab) closePanelDrawer(); else openPanelDrawer(tab);
  }
  if (el.btnToggleLyricsPanel) el.btnToggleLyricsPanel.addEventListener('click', () => togglePanelDrawer('now'));
  if (btnToggleQueue) btnToggleQueue.addEventListener('click', () => togglePanelDrawer('queue'));
  if (el.btnCloseRightPanel) el.btnCloseRightPanel.addEventListener('click', closePanelDrawer);
  drawerTabs.forEach((t) => t.addEventListener('click', () => openPanelDrawer(t.dataset.drawerTab || '')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isRightPanelOpen && !document.querySelector('.modal-backdrop:not(.hidden)')) closePanelDrawer();
  });
  syncDrawerUI();

  (function initPanelResize() {
    const edge = document.getElementById('panel-resize-edge');
    const panel = el.rightPanel || document.getElementById('right-panel');
    if (!edge || !panel) return;

    const savedWidth = localStorage.getItem('uriel_right_panel_width');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (w >= 260 && w <= 720) {
        panel.style.width = `${w}px`;
        panel.style.setProperty('--right-panel-width', `${w}px`);
      }
    }

    let startX = 0;
    let startW = 0;
    let pendingW = 0;
    let raf = 0;

    const limits = () => ({ min: 260, max: Math.min(720, window.innerWidth - 300) });

    edge.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      edge.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startW = panel.getBoundingClientRect().width;
      pendingW = Math.round(startW);
      edge.classList.add('dragging');
      document.body.classList.add('is-resizing-panel');
      e.preventDefault();
    });

    edge.addEventListener('pointermove', (e) => {
      if (!edge.hasPointerCapture(e.pointerId)) return;
      const { min, max } = limits();
      pendingW = Math.max(min, Math.min(max, Math.round(startW + (startX - e.clientX))));
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          panel.style.width = `${pendingW}px`;
          panel.style.setProperty('--right-panel-width', `${pendingW}px`);
        });
      }
    });

    const stopDrag = (/** @type {PointerEvent} */ e) => {
      if (!edge.hasPointerCapture(e.pointerId)) return;
      try { edge.releasePointerCapture(e.pointerId); } catch (_) {}
      edge.classList.remove('dragging');
      document.body.classList.remove('is-resizing-panel');
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (pendingW >= 260 && pendingW <= 720) {
        localStorage.setItem('uriel_right_panel_width', pendingW.toString());
      }
      if (typeof resizeCanvases === 'function') resizeCanvases();
    };

    edge.addEventListener('pointerup', stopDrag);
    edge.addEventListener('pointercancel', stopDrag);

    edge.addEventListener('dblclick', () => {
      panel.style.width = '340px';
      panel.style.setProperty('--right-panel-width', '340px');
      localStorage.setItem('uriel_right_panel_width', '340px');
      if (typeof resizeCanvases === 'function') resizeCanvases();
    });
  })();

  /** @type {UrielPanelDrawerPart} */
  const api = { openPanelDrawer, showPlayingInQueue };
  Object.assign(out, api);
};
