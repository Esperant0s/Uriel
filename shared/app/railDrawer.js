// @ts-check
// The drawer that slides out of the side rail with the sound presets or the playlists, and closing it (its
// button, Escape, a click outside it). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.railDrawer = function ({ el, renderPlaylistsList, renderPresets, sidebarEl, updatePresetsFade }) {
  const railDrawer = document.getElementById('rail-drawer');
  const btnTogglePresets = document.getElementById('btn-toggle-presets-drawer');
  const btnTogglePlaylists = document.getElementById('btn-toggle-playlists-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-rail-drawer');
  const sectionPresets = document.getElementById('drawer-section-presets');
  const sectionPlaylists = document.getElementById('drawer-section-playlists');
  const drawerTitle = document.getElementById('rail-drawer-title');

  /** @type {string | null} */
  let openDrawerState = null;
  /** @type {string | null} */
  let activeDrawerMode = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let railDrawerCloseTimeout = null;

  /** @param {HTMLElement} [triggerBtn] */

  function applyDrawerState(triggerBtn) {
    if (!railDrawer) return;

    if (!openDrawerState) {
      if (activeDrawerMode !== null) {
        if (sidebarEl) sidebarEl.classList.remove('has-drawer-open');
        if (btnTogglePresets) btnTogglePresets.classList.remove('active');
        if (btnTogglePlaylists) btnTogglePlaylists.classList.remove('active');
        activeDrawerMode = null;
        if (railDrawerCloseTimeout) {
          clearTimeout(railDrawerCloseTimeout);
          railDrawerCloseTimeout = null;
        }
        railDrawer.classList.remove('open');
        railDrawerCloseTimeout = setTimeout(() => {
          railDrawer.classList.add('hidden');
          railDrawerCloseTimeout = null;
        }, 200);
      }
    } else {
      const isPresets = openDrawerState === 'presets';
      const trigger = triggerBtn || (isPresets ? btnTogglePresets : btnTogglePlaylists);

      if (btnTogglePresets) btnTogglePresets.classList.toggle('active', isPresets);
      if (btnTogglePlaylists) btnTogglePlaylists.classList.toggle('active', !isPresets);
      railDrawer.classList.toggle('drawer-presets-mode', isPresets);

      if (activeDrawerMode === null) {
        activeDrawerMode = openDrawerState;
        if (railDrawerCloseTimeout) {
          clearTimeout(railDrawerCloseTimeout);
          railDrawerCloseTimeout = null;
        }
        railDrawer.classList.remove('hidden');
        void railDrawer.offsetWidth;
        railDrawer.classList.add('open');
        if (sectionPresets) sectionPresets.style.display = isPresets ? 'flex' : 'none';
        if (sectionPlaylists) sectionPlaylists.style.display = isPresets ? 'none' : 'flex';
        if (drawerTitle) drawerTitle.textContent = isPresets ? 'Presets' : 'Playlists';
        if (el.btnSavePresetDialog) el.btnSavePresetDialog.style.display = isPresets ? 'inline-flex' : 'none';
        if (el.btnNewPlaylist) el.btnNewPlaylist.style.display = isPresets ? 'none' : 'inline-flex';
        if (sidebarEl) sidebarEl.classList.add('has-drawer-open');
        if (isPresets) {
          renderPresets();
          requestAnimationFrame(updatePresetsFade);
        } else {
          renderPlaylistsList();
        }
      } else if (activeDrawerMode !== openDrawerState) {
        activeDrawerMode = openDrawerState;
        const outgoing = isPresets ? sectionPlaylists : sectionPresets;
        const incoming = isPresets ? sectionPresets : sectionPlaylists;

        if (outgoing) outgoing.classList.add('section-switching-out');
        setTimeout(() => {
          if (outgoing) {
            outgoing.style.display = 'none';
            outgoing.classList.remove('section-switching-out');
          }
          if (drawerTitle) drawerTitle.textContent = isPresets ? 'Presets' : 'Playlists';
          railDrawer.classList.toggle('drawer-presets-mode', isPresets);
          if (el.btnSavePresetDialog) el.btnSavePresetDialog.style.display = isPresets ? 'inline-flex' : 'none';
          if (el.btnNewPlaylist) el.btnNewPlaylist.style.display = isPresets ? 'none' : 'inline-flex';
          if (incoming) {
            incoming.style.display = 'flex';
            incoming.classList.add('section-switching-in');
            setTimeout(() => incoming.classList.remove('section-switching-in'), 200);
            if (isPresets) {
              renderPresets();
              requestAnimationFrame(updatePresetsFade);
            } else {
              renderPlaylistsList();
            }
          }
        }, 120);
      }
    }
  }

  function openDrawer(/** @type {string} */ mode, /** @type {HTMLElement} */ triggerBtn) {
    openDrawerState = mode;
    applyDrawerState(triggerBtn);
  }

  function closeDrawer() {
    openDrawerState = null;
    applyDrawerState();
  }

  if (btnTogglePresets) {
    btnTogglePresets.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawerState = openDrawerState === 'presets' ? null : 'presets';
      applyDrawerState(btnTogglePresets);
    });
  }

  if (btnTogglePlaylists) {
    btnTogglePlaylists.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawerState = openDrawerState === 'playlists' ? null : 'playlists';
      applyDrawerState(btnTogglePlaylists);
    });
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => closeDrawer());
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDrawerState) closeDrawer();
  });

  document.addEventListener('click', (e) => {
    if (openDrawerState && railDrawer) {
      if (!railDrawer.contains(/** @type {Node} */ (e.target)) &&
        (!btnTogglePresets || !btnTogglePresets.contains(/** @type {Node} */ (e.target))) &&
        (!btnTogglePlaylists || !btnTogglePlaylists.contains(/** @type {Node} */ (e.target)))) {
        closeDrawer();
      }
    }
  });
};
