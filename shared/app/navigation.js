// @ts-check
// Moving between views (Home, Favorites, the Albums and Artists tabs, your files, History, Settings...), the
// stacked rounded corners of the side nav and Settings lists, and the indicator that slides to the active nav
// item. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielNavigationPart} out */
window.UrielApp.navigation = function ({ checkToolsStatus, el, enterSettings, exitMultiSelect, highlightPlayingRow, isSpotifyHome, loadForYou, multiSel, openPanelDrawer, refreshYtSignin, renderArtistsTab, renderBlockedSettings, renderFavoritesView, renderHistoryView, renderLocalView, renderQueueView, renderSavedAlbums, renderSpotifyHome, state, syncHomeAmbientVisibility, updateDeviceMusicUI, updateDownloadCaptionPath, updateDownloadFolderUI, updateFxVisibility, updateMusicFolderUI, updateOfflineStorageUI }, out) {
  function switchView(/** @type {string} */ viewName) {
    // the queue lives in the drawer now, not in its own page
    if (viewName === 'queue') { openPanelDrawer('queue'); return; }
    state.currentView = viewName;
    if (multiSel.active) {
      const keep = (viewName === 'playlist-detail' && multiSel.context === 'playlist') || (viewName === 'favorites' && multiSel.context === 'favorites');
      if (!keep) exitMultiSelect(false);
    }

    requestAnimationFrame(() => {
      document.querySelectorAll('.no-enter-anim').forEach(c => c.classList.remove('no-enter-anim'));
      [el.viewDiscover, el.viewFavorites, el.viewAlbums, document.getElementById('view-artists'), el.viewLocal, el.viewHistory, el.viewQueue, el.viewPlaylistDetail, el.viewAlbum, el.viewArtist, el.viewSettings].forEach(v => {
        if (v) v.classList.remove('active');
      });

        [el.navDiscover, el.navFavorites, el.navAlbums, document.getElementById('nav-artists'), el.navLocal, el.navHistory, el.navQueue, el.navSettings].forEach(n => {
          if (n) n.classList.remove('active');
        });

          if (viewName === 'discover') {
            if (el.viewDiscover) el.viewDiscover.classList.add('active');
            if (el.navDiscover) el.navDiscover.classList.add('active');
            loadForYou();
            if (isSpotifyHome()) renderSpotifyHome();
          } else if (viewName === 'favorites') {
            if (el.viewFavorites) el.viewFavorites.classList.add('active');
            if (el.navFavorites) el.navFavorites.classList.add('active');
            renderFavoritesView();
          } else if (viewName === 'albums') {
            if (el.viewAlbums) el.viewAlbums.classList.add('active');
            if (el.navAlbums) el.navAlbums.classList.add('active');
            renderSavedAlbums();
          } else if (viewName === 'artists') {
            const v = document.getElementById('view-artists');
            const n = document.getElementById('nav-artists');
            if (v) v.classList.add('active');
            if (n) n.classList.add('active');
            renderArtistsTab();
          } else if (viewName === 'local') {
            if (el.viewLocal) el.viewLocal.classList.add('active');
            if (el.navLocal) el.navLocal.classList.add('active');
            renderLocalView();
          } else if (viewName === 'history') {
            if (el.viewHistory) el.viewHistory.classList.add('active');
            if (el.navHistory) el.navHistory.classList.add('active');
            renderHistoryView();
          } else if (viewName === 'queue') {
            if (el.viewQueue) el.viewQueue.classList.add('active');
            if (el.navQueue) el.navQueue.classList.add('active');
            renderQueueView();
          } else if (viewName === 'playlist-detail') {
            if (el.viewPlaylistDetail) el.viewPlaylistDetail.classList.add('active');
          } else if (viewName === 'album') {
            if (el.viewAlbum) el.viewAlbum.classList.add('active');
          } else if (viewName === 'artist') {
            if (el.viewArtist) el.viewArtist.classList.add('active');
          } else if (viewName === 'settings') {
            if (el.viewSettings) el.viewSettings.classList.add('active');
            if (el.navSettings) el.navSettings.classList.add('active');
            enterSettings();
            renderBlockedSettings(); // a linked device may have changed it
            updateOfflineStorageUI();
            updateDeviceMusicUI();
            if (typeof refreshYtSignin === 'function') refreshYtSignin(); // signed in or out from the import window
            updateMusicFolderUI();
  updateDownloadFolderUI();
  updateDownloadCaptionPath();
            checkToolsStatus(false);
          }

          // next frame: the new view gets laid out once, then the indicator reads where the item is
          requestAnimationFrame(() => updateNavIndicator(true));

          highlightPlayingRow();
          if (typeof syncHomeAmbientVisibility === 'function') syncHomeAmbientVisibility();
          updateFxVisibility();
    });
  }

  function applyStackedRadius(/** @type {Element | Element[] | null} */ container, /** @type {string | null} */ itemSelector, /** @type {boolean} */ horizontal) {
    if (!container) return;
    const raw = Array.isArray(container) ? container : [...container.querySelectorAll(itemSelector || '*')];
    const items = raw.filter((n) => n.getBoundingClientRect().height > 1 && getComputedStyle(n).display !== 'none');
    const stackClasses = ['stack-only', 'stack-first', 'stack-mid', 'stack-last'];
    items.forEach((n, i) => {
      const target = items.length === 1 ? 'stack-only' : i === 0 ? 'stack-first' : i === items.length - 1 ? 'stack-last' : 'stack-mid';
      const needH = !!horizontal;
      if (n.classList.contains('stack-h') !== needH) n.classList.toggle('stack-h', needH);
      stackClasses.forEach((cls) => {
        if (cls === target) {
          if (!n.classList.contains(cls)) n.classList.add(cls);
        } else {
          if (n.classList.contains(cls)) n.classList.remove(cls);
        }
      });
    });
  }
  let stackRetry = false;
  function refreshStacks() {
    const sNav = document.querySelector('.sidebar-nav');
    if (sNav) {
      const all = [...sNav.querySelectorAll('.nav-item')];
      const visible = all.filter((n) => n.getBoundingClientRect().height > 1 && getComputedStyle(n).display !== 'none');
      if (all.length > 0 && visible.length === 0) {
        if (!stackRetry) {
          stackRetry = true;
          requestAnimationFrame(() => { stackRetry = false; refreshStacks(); });
        }
        return;
      }
      const div = sNav.querySelector('.rail-divider');
      if (div) {
        const divIdx = [...sNav.children].indexOf(div);
        applyStackedRadius(all.filter((n) => [...sNav.children].indexOf(n) < divIdx), null, false);
        applyStackedRadius(all.filter((n) => [...sNav.children].indexOf(n) > divIdx), null, false);
      } else {
        applyStackedRadius(all, null, false);
      }
    }
    applyStackedRadius(/** @type {HTMLElement} */ (document.querySelector('.settings-nav')), '.settings-nav-btn', false);
    applyStackedRadius(/** @type {HTMLElement} */ (document.getElementById('audio-tabs')), '.audio-tab', false);
  }

  let stackRaf = 0;
  const stackObserver = new MutationObserver(() => { if (stackRaf) return; stackRaf = requestAnimationFrame(() => { stackRaf = 0; refreshStacks(); }); });
  ['.sidebar-nav', '.settings-nav', '#audio-tabs'].forEach((s) => { const n = document.querySelector(s); if (n) stackObserver.observe(n, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true }); });

  let navIndicatorTimer = 0;
  let navIndicatorReady = false;
  function navIndicatorRadius(/** @type {HTMLElement} */ active) {
    const r = getComputedStyle(active).borderRadius;
    if (r && parseFloat(r) > 0) return r;
    return getComputedStyle(document.documentElement).getPropertyValue('--stack-mid').trim() || '14px';
  }
  // (the nav's stacked corners are refreshStacks' job, run by stackObserver when the nav changes: calling it here
  // measured every nav item right after a view switch, forcing an extra layout of the page)
  function updateNavIndicator(/** @type {boolean} */ animate) {
    const ind = el.navActiveIndicator;
    if (!ind) return;
    const active = /** @type {HTMLElement} */ (document.querySelector('.sidebar-nav .nav-item.active'));
    if (!active || !active.offsetParent) { ind.classList.add('is-hidden'); return; }
    const nav = /** @type {HTMLElement} */ (active.closest('.sidebar-nav'));
    const nr = nav.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    if (!r.height) return;
    const top = Math.round(r.top - nr.top + (r.height - 48) / 2);
    ind.classList.remove('is-hidden');
    clearTimeout(navIndicatorTimer);
    if (!animate || !navIndicatorReady) {
      ind.style.transition = 'opacity 0.2s ease';
      ind.style.height = '48px';
      ind.style.transform = `translateY(${top}px)`;
      ind.style.borderRadius = navIndicatorRadius(active);
      navIndicatorReady = true;
      return;
    }
    const curTop = new DOMMatrix(getComputedStyle(ind).transform).m42;
    const curH = ind.getBoundingClientRect().height || 48;
    const curBottom = curTop + curH;
    const newTop = Math.min(curTop, top);
    const newBottom = Math.max(curBottom, top + 48);
    ind.style.transition = 'transform 0.26s cubic-bezier(0.3, 0, 0.8, 0.15), height 0.26s cubic-bezier(0.3, 0, 0.8, 0.15), opacity 0.2s ease';
    ind.style.transform = `translateY(${newTop}px)`;
    ind.style.height = `${newBottom - newTop}px`;
    ind.style.borderRadius = '24px';
    navIndicatorTimer = window.setTimeout(() => {
      ind.style.transition = 'transform 0.34s cubic-bezier(0.2, 0, 0, 1), height 0.34s cubic-bezier(0.2, 0, 0, 1), border-radius 0.34s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease';
      ind.style.transform = `translateY(${top}px)`;
      ind.style.height = '48px';
      ind.style.borderRadius = navIndicatorRadius(active);
    }, 260);
  }

  window.addEventListener('resize', () => updateNavIndicator(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => updateNavIndicator(false));
  const sidebarNavElem = document.querySelector('.sidebar-nav');
  if (sidebarNavElem) {
    refreshStacks();
    new ResizeObserver(() => updateNavIndicator(false)).observe(sidebarNavElem);
  }

  /** @type {UrielNavigationPart} */
  const api = { switchView, refreshStacks, updateNavIndicator };
  Object.assign(out, api);
};
