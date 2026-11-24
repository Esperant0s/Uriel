// @ts-check
// Settings → Storage: the cache dialog with its animated bars, music on this device, the music and download folders,
// offline songs (removing them, and putting them back into a playlist after the library was wiped).
// Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielStoragePart} out */
window.UrielApp.storage = function ({ T, Tf, Tm, closeModal, createPlaylist, el, escapeHtml, getTrackThumbUrl, getTrackToDownload, isSameTrack, listThumb, offlineChanged, openModal, openPlaylistDetail, renderLocalView, savePlaylists, showToast, stampAddedAt, state, updateDownloadCaptionPath }, out) {
  const cacheModal = document.getElementById('cache-modal');
  const cacheModalCard = /** @type {HTMLElement} */ (document.querySelector('.cache-modal-card'));
  const btnCancelCache = /** @type {HTMLButtonElement} */ (document.getElementById('btn-cancel-cache'));
  const btnConfirmClearCache = /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-clear-cache'));
  const cacheAudioSize = /** @type {HTMLElement} */ (document.getElementById('cache-audio-size'));
  const cacheWebSize = /** @type {HTMLElement} */ (document.getElementById('cache-web-size'));

  const CACHE_BAR_MAX_BYTES = 4 * 1024 * 1024 * 1024;
  const CACHE_BAR_SAFE_STOP = 0.25;
  const CACHE_BAR_DANGER_STOP = 0.75;
  const CACHE_BAR_MIN_VISIBLE_PX = 4;

  /** @type {Record<string, { canvas: HTMLCanvasElement | null, current: number, from: number, to: number, t0: number, dur: number }>} */
  const cacheBars = {
    audio: { canvas: /** @type {HTMLCanvasElement | null} */ (document.getElementById('cache-audio-bar')), current: 0, from: 0, to: 0, t0: 0, dur: 0 },
    web: { canvas: /** @type {HTMLCanvasElement | null} */ (document.getElementById('cache-web-bar')), current: 0, from: 0, to: 0, t0: 0, dur: 0 }
  };
  let cacheRafId = 0;
  let cachePhase = 0;
  let cacheSpeed = 0.06;
  let cacheTargetSpeed = 0.06;
  let cacheBusy = false;
  let cacheColors = { primary: '#6750A4', dim: '#E6E0E9', warn: '#F9A825', error: '#B3261E' };

  function formatBytes(/** @type {number} */ bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function animateValue(/** @type {HTMLElement | null} */ obj, /** @type {number} */ start, /** @type {number} */ end, /** @type {number} */ duration) {
    /** @type {number | null} */
    let startTimestamp = null;
    const step = (/** @type {number} */ timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      if (obj) obj.textContent = formatBytes(Math.floor(progress * (end - start) + start));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  const cacheWait = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function readCacheColors() {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      primary: rootStyle.getPropertyValue('--md-sys-color-primary').trim() || '#6750A4',
      dim: rootStyle.getPropertyValue('--md-sys-color-surface-container-highest-solid').trim() || '#E6E0E9',
      warn: '#F9A825',
      error: rootStyle.getPropertyValue('--md-sys-color-error').trim() || '#B3261E'
    };
  }

  function setCacheBarTarget(/** @type {{ current: number, from: number, to: number, t0: number, dur: number }} */ bar, /** @type {number} */ bytes, /** @type {number} */ duration) {
    bar.from = bar.current;
    bar.to = bytes;
    bar.t0 = performance.now();
    bar.dur = duration;
  }

  function drawCacheBar(/** @type {HTMLCanvasElement | null} */ canvas, /** @type {number} */ bytes, /** @type {number} */ phase) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const lineW = 6;
    const pad = lineW / 2;
    const centerY = h / 2;
    const usable = Math.max(1, w - lineW);

    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(pad, centerY);
    ctx.lineTo(w - pad, centerY);
    ctx.strokeStyle = cacheColors.dim;
    ctx.stroke();

    if (bytes <= 0) return;
    const frac = Math.min(1, Math.max(0, bytes / CACHE_BAR_MAX_BYTES));
    const fillW = Math.max(frac * usable, CACHE_BAR_MIN_VISIBLE_PX);
    const endX = pad + fillW;

    const grad = ctx.createLinearGradient(pad, 0, w - pad, 0);
    grad.addColorStop(0, cacheColors.primary);
    grad.addColorStop(CACHE_BAR_SAFE_STOP, cacheColors.primary);
    grad.addColorStop((CACHE_BAR_SAFE_STOP + CACHE_BAR_DANGER_STOP) / 2, cacheColors.warn);
    grad.addColorStop(CACHE_BAR_DANGER_STOP, cacheColors.error);
    grad.addColorStop(1, cacheColors.error);

    const amplitude = 4;
    const freq = 0.12;
    ctx.beginPath();
    for (let x = pad; x <= endX; x++) {
      const distFromEnd = endX - x;
      const damping = Math.min(1, distFromEnd / 14);
      const distFromStart = x - pad;
      const startDamping = Math.min(1, distFromStart / 14);
      const snakeWave = Math.sin(x * freq - phase) + 0.4 * Math.sin(x * freq * 0.5 - phase * 1.5);
      const y = centerY + snakeWave * (amplitude * damping * startDamping);
      if (x === pad) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = grad;
    ctx.stroke();
  }

  function cacheFrame(/** @type {number} */ now) {
    if (document.hidden || !state.isWindowVisible || !cacheModal || !cacheModal.classList.contains('visible')) {
      cacheRafId = 0;
      return;
    }
    cacheSpeed += (cacheTargetSpeed - cacheSpeed) * 0.08;
    cachePhase += cacheSpeed;
    Object.keys(cacheBars).forEach((key) => {
      const bar = cacheBars[key];
      if (bar.dur > 0) {
        const p = Math.min(1, (now - bar.t0) / bar.dur);
        const ease = 1 - Math.pow(1 - p, 3);
        bar.current = bar.from + (bar.to - bar.from) * ease;
        if (p >= 1) bar.dur = 0;
      }
      drawCacheBar(bar.canvas, bar.current, cachePhase);
    });
    cacheRafId = requestAnimationFrame(cacheFrame);
  }

  function closeCacheModal() {
    if (!cacheModal) return;
    cacheModal.classList.remove('visible');
    setTimeout(() => {
      if (cacheModal.classList.contains('visible')) return;
      cacheModal.classList.add('hidden');
      if (cacheRafId) {
        cancelAnimationFrame(cacheRafId);
        cacheRafId = 0;
      }
      if (cacheModalCard) cacheModalCard.classList.remove('cleaning', 'finishing', 'done');
      if (btnConfirmClearCache) btnConfirmClearCache.disabled = false;
      if (btnCancelCache) btnCancelCache.disabled = false;
    }, 200);
  }

  document.addEventListener('click', async (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('#btn-open-clear-cache');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (!cacheModal || cacheBusy) return;

    cacheColors = readCacheColors();
    cacheSpeed = 0.06;
    cacheTargetSpeed = 0.06;
    Object.keys(cacheBars).forEach((key) => {
      const bar = cacheBars[key];
      bar.current = 0;
      bar.from = 0;
      bar.to = 0;
      bar.dur = 0;
    });
    if (cacheAudioSize) { cacheAudioSize.textContent = 'calculating...'; cacheAudioSize.dataset.val = '0'; }
    if (cacheWebSize) { cacheWebSize.textContent = 'calculating...'; cacheWebSize.dataset.val = '0'; }

    cacheModal.classList.remove('hidden');
    requestAnimationFrame(() => cacheModal.classList.add('visible'));
    if (!cacheRafId) cacheRafId = requestAnimationFrame(cacheFrame);

    let sizes = { audio: 0, web: 0 };
    try {
      if (window.electronAPI && window.electronAPI.getCacheSize) {
        sizes = await window.electronAPI.getCacheSize();
      }
    } catch (err) {
      console.warn('getCacheSize failed', err);
    }
    if (cacheAudioSize) { cacheAudioSize.textContent = formatBytes(sizes.audio); cacheAudioSize.dataset.val = String(sizes.audio); }
    if (cacheWebSize) { cacheWebSize.textContent = formatBytes(sizes.web); cacheWebSize.dataset.val = String(sizes.web); }
    setCacheBarTarget(cacheBars.audio, sizes.audio, 900);
    setCacheBarTarget(cacheBars.web, sizes.web, 900);
  });

  if (btnCancelCache) {
    btnCancelCache.addEventListener('click', () => {
      if (cacheBusy) return;
      closeCacheModal();
    });
  }

  if (btnConfirmClearCache) {
    btnConfirmClearCache.addEventListener('click', async () => {
      if (cacheBusy) return;
      cacheBusy = true;
      btnConfirmClearCache.disabled = true;
      if (btnCancelCache) btnCancelCache.disabled = true;

      cacheModalCard.classList.add('cleaning');
      cacheTargetSpeed = 0.2;

      const startAudio = parseInt(cacheAudioSize.dataset.val || '0', 10);
      const startWeb = parseInt(cacheWebSize.dataset.val || '0', 10);
      animateValue(cacheAudioSize, startAudio, 0, 1500);
      animateValue(cacheWebSize, startWeb, 0, 1500);
      setCacheBarTarget(cacheBars.audio, 0, 1500);
      setCacheBarTarget(cacheBars.web, 0, 1500);

      const startedAt = Date.now();
      try {
        await window.electronAPI.clearCache();
      } catch (err) {
        console.warn('clearCache failed', err);
        // nothing was cleared: say so instead of finishing the "cleared" animation
        cacheModalCard.classList.remove('cleaning');
        cacheTargetSpeed = 0;
        cacheBusy = false;
        closeCacheModal();
        showToast(Tm("Couldn't clear the cache"), 'error');
        return;
      }
      offlineChanged();
      await cacheWait(Math.max(0, 1500 - (Date.now() - startedAt)));

      cacheModalCard.classList.add('finishing');
      cacheTargetSpeed = 0;
      await cacheWait(350);

      cacheModalCard.classList.remove('cleaning', 'finishing');
      cacheModalCard.classList.add('done');
      cacheAudioSize.dataset.val = '0';
      cacheWebSize.dataset.val = '0';
      await cacheWait(1200);

      cacheBusy = false;
      closeCacheModal();
    });
  }

  // Settings → Storage → Music on this device (server.js /api/device-music, device-library.js)
  /** @param {Record<string, unknown>} [change] */
  async function updateDeviceMusicUI(change) {
    const toggle = document.getElementById('toggle-device-music');
    const status = document.getElementById('device-music-status');
    const hiddenRow = document.getElementById('device-music-hidden-row');
    const hiddenText = document.getElementById('device-music-hidden');
    if (!toggle || !state.serverPort) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/device-music`, change
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) } : undefined);
      const data = await res.json();
      if (!data || !data.success) return;
      toggle.classList.toggle('active', !!data.enabled);
      if (status) {
        const where = data.folders && data.folders.length ? Tf(' in {0}', data.folders.join(', ')) : '';
        status.textContent = data.enabled
          ? (data.count ? Tf('{0} songs found', data.count) + where : T('No songs found yet') + where)
          : T('Off: only songs you add yourself are in My files');
      }
      if (hiddenRow) hiddenRow.classList.toggle('hidden', !data.hidden);
      if (hiddenText) hiddenText.textContent = Tf('{0} found songs taken out of My files', data.hidden);
      if (change && state.currentView === 'local') renderLocalView(true);
    } catch (e) {}
  }
  const toggleDeviceMusic = document.getElementById('toggle-device-music');
  if (toggleDeviceMusic) toggleDeviceMusic.addEventListener('click', async () => {
    const enabled = !toggleDeviceMusic.classList.contains('active');
    await updateDeviceMusicUI({ enabled });
    // phones: turning it on asks for the permission again (if Android still can) and looks at the music now
    if (enabled && window.UrielDeviceMusic) {
      await window.UrielDeviceMusic.rescan(true);
      updateDeviceMusicUI();
      if (state.currentView === 'local') renderLocalView(true);
    }
  });
  // a phone's first look at its music finishes after the app has started
  window.addEventListener('uriel:device-music', () => { if (state.currentView === 'local') renderLocalView(true); });
  const btnDeviceMusicUnhide = document.getElementById('btn-device-music-unhide');
  if (btnDeviceMusicUnhide) btnDeviceMusicUnhide.addEventListener('click', () => updateDeviceMusicUI({ unhide: true }));

  async function updateOfflineStorageUI() {
    const elSize = document.getElementById('offline-library-size');
    if (!elSize) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/offline-library`);
      const data = await res.json();
      if (data && data.success) {
        elSize.textContent = `${data.count} song${data.count === 1 ? '' : 's'} (${formatBytes(data.totalBytes)})`;
      } else {
        elSize.textContent = '0 songs (0 B)';
      }
    } catch (e) {
      elSize.textContent = 'Unavailable';
    }
  }

  async function updateMusicFolderUI() {
    const elPath = document.getElementById('music-folder-path');
    if (!elPath) return;
    try {
      if (window.electronAPI && window.electronAPI.getDataDir) {
        const info = await window.electronAPI.getDataDir();
        if (info && info.dir) {
          elPath.textContent = info.isCustom ? info.dir : `${info.dir} (default)`;
          return;
        }
      }
    } catch (e) {
      console.warn('getDataDir failed', e);
    }
    elPath.textContent = T('Unavailable');
  }

  const btnChangeMusicFolder = /** @type {HTMLButtonElement} */ (document.getElementById('btn-change-music-folder'));
  if (btnChangeMusicFolder) {
    btnChangeMusicFolder.addEventListener('click', async () => {
      if (!window.electronAPI || !window.electronAPI.pickDataDir) return;
      if (btnChangeMusicFolder.disabled) return;
      let info = null;
      try { info = await window.electronAPI.getDataDir(); } catch (e) {}
      const dir = await window.electronAPI.pickDataDir();
      if (!dir) return;
      if (info && info.dir && dir === info.dir) {
        showToast(Tm('This is already the music folder'));
        return;
      }
      const move = window.confirm(
        T('Move your existing music to the new folder?') + '\n\n' +
        T('OK: move all downloaded and imported files, then restart Uriel.') + '\n' +
        T('Cancel: switch to the new folder without moving (files stay in the old one).')
      );
      btnChangeMusicFolder.disabled = true;
      const originalLabel = btnChangeMusicFolder.textContent;
      btnChangeMusicFolder.textContent = move ? 'Moving...' : 'Switching...';
      showToast(move ? Tm('Moving your music, this may take a while...') : Tm('Switching music folder...'));
      let res = null;
      try {
        res = await window.electronAPI.setDataDir(dir, move);
      } catch (e) {
        res = { ok: false, error: (e instanceof Error ? e.message : String(e)) };
      }
      if (!res || !res.ok) {
        showToast((res && res.error) || Tm('Could not change the music folder'), 'error');
        btnChangeMusicFolder.disabled = false;
        btnChangeMusicFolder.textContent = originalLabel;
        return;
      }
      btnChangeMusicFolder.textContent = 'Restarting...';
      showToast(Tm('Restarting Uriel...'));
      setTimeout(() => { if (window.electronAPI.restartApp) window.electronAPI.restartApp(); }, 400);
    });
  }

  async function updateDownloadFolderUI() {
    const elPath = document.getElementById('download-folder-path');
    const btnReset = document.getElementById('btn-reset-download-folder');
    if (elPath) {
      try {
        if (window.electronAPI && window.electronAPI.getDownloadDir) {
          const info = await window.electronAPI.getDownloadDir();
          if (info && info.dir) {
            elPath.textContent = info.isCustom ? info.dir : `${info.dir} (default)`;
            if (btnReset) btnReset.classList.toggle('hidden', !info.isCustom);
            return;
          }
        }
      } catch (e) {
        console.warn('getDownloadDir failed', e);
      }
      elPath.textContent = T('Unavailable');
    }
    if (btnReset) btnReset.classList.add('hidden');
  }

  const btnChangeDownloadFolder = /** @type {HTMLButtonElement} */ (document.getElementById('btn-change-download-folder'));
  if (btnChangeDownloadFolder) {
    btnChangeDownloadFolder.addEventListener('click', async () => {
      if (!window.electronAPI || !window.electronAPI.pickDownloadDir) return;
      if (btnChangeDownloadFolder.disabled) return;
      let info = null;
      try { info = await window.electronAPI.getDownloadDir(); } catch (e) {}
      const dir = await window.electronAPI.pickDownloadDir();
      if (!dir) return;
      if (info && info.dir && dir === info.dir) {
        showToast(Tm('This is already the download folder'));
        return;
      }
      btnChangeDownloadFolder.disabled = true;
      let res = null;
      try {
        res = await window.electronAPI.setDownloadDir(dir);
      } catch (e) {
        res = { ok: false, error: (e instanceof Error ? e.message : String(e)) };
      }
      btnChangeDownloadFolder.disabled = false;
      if (!res || !res.ok) {
        showToast((res && res.error) || Tm('Could not change the download folder'), 'error');
        return;
      }
      updateDownloadFolderUI();
      updateDownloadCaptionPath();
      showToast(Tm('Downloads will be saved to {0}', res.dir));
    });
  }

  const btnResetDownloadFolder = /** @type {HTMLButtonElement} */ (document.getElementById('btn-reset-download-folder'));
  if (btnResetDownloadFolder) {
    btnResetDownloadFolder.addEventListener('click', async () => {
      if (!window.electronAPI || !window.electronAPI.resetDownloadDir) return;
      if (btnResetDownloadFolder.disabled) return;
      btnResetDownloadFolder.disabled = true;
      let res = null;
      try {
        res = await window.electronAPI.resetDownloadDir();
      } catch (e) {
        res = { ok: false, error: (e instanceof Error ? e.message : String(e)) };
      }
      btnResetDownloadFolder.disabled = false;
      if (!res || !res.ok) {
        showToast((res && res.error) || Tm('Could not reset the download folder'), 'error');
        return;
      }
      updateDownloadFolderUI();
      showToast(Tm('Download folder reset to default'));
    });
  }

  const btnDeleteOfflineTrack = document.getElementById('btn-delete-offline-track');
  if (btnDeleteOfflineTrack) {
    btnDeleteOfflineTrack.addEventListener('click', async () => {
      const track = getTrackToDownload();
      if (!track || !track.id) return;
      try {
        const r = await fetch(`http://127.0.0.1:${state.serverPort}/api/offline-delete?id=${encodeURIComponent(track.id)}`, { method: 'POST' });
        if (!r.ok) throw new Error(`offline-delete answered ${r.status}`);
        offlineChanged(track, false);
        showToast(Tm('Song removed from offline cache'));
        updateOfflineStorageUI();
        if (el.downloadModal) closeModal(el.downloadModal);
      } catch (e) {
        showToast(Tm('Failed to delete offline song'));
      }
    });
  }

  const btnClearOffline = document.getElementById('btn-clear-offline');
  const clearOfflineModal = document.getElementById('clear-offline-modal');
  const btnCancelClearOffline = document.getElementById('btn-cancel-clear-offline');
  const btnConfirmClearOffline = document.getElementById('btn-confirm-clear-offline');

  if (btnClearOffline && clearOfflineModal) {
    btnClearOffline.addEventListener('click', () => {
      openModal(clearOfflineModal);
    });
  }
  if (btnCancelClearOffline && clearOfflineModal) {
    btnCancelClearOffline.addEventListener('click', () => {
      closeModal(clearOfflineModal);
    });
  }
  if (btnConfirmClearOffline && clearOfflineModal) {
    btnConfirmClearOffline.addEventListener('click', async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${state.serverPort}/api/clear-offline-library`, { method: 'POST' });
        if (!r.ok) throw new Error(`clear-offline-library answered ${r.status}`);
        offlineChanged();
        showToast(Tm('Offline library cleared'));
        updateOfflineStorageUI();
      } catch (e) {
        showToast(Tm('Failed to clear offline library'));
      }
      closeModal(clearOfflineModal);
    });
  }

  // #46: offline songs outlive a wiped library (their names and covers are saved next to the files), so they can
  // be put back into a playlist
  const restoreOfflineModal = document.getElementById('restore-offline-modal');
  const restoreOfflineList = /** @type {HTMLElement} */ (document.getElementById('restore-offline-list'));
  const restoreOfflineTarget = /** @type {HTMLSelectElement} */ (document.getElementById('restore-offline-target'));
  const restoreOfflineAll = /** @type {HTMLInputElement} */ (document.getElementById('restore-offline-all'));
  const restoreOfflineCount = /** @type {HTMLElement} */ (document.getElementById('restore-offline-count'));
  /** @type {UrielTrack[]} */
  let restoreOfflineTracks = [];

  // the saved platform can't be trusted (catalog songs were saved as SoundCloud), so the id decides: a YouTube
  // video keeps its link, anything else (catalog songs, SoundCloud) gets a YouTube search like catalog songs have,
  // so it still plays once its file is gone. Until then the file is found by its id.
  function offlineEntryToTrack(/** @type {UrielOfflineEntry} */ e) {
    const id = String(e.id || e.cleanId);
    const title = e.title || id;
    const artist = e.artist || 'Unknown artist';
    const t = { id, title, artist, duration: Number(e.duration) || 0, thumbnail: e.thumbnail || '', platform: 'youtube' };
    if (/^[\w-]{11}$/.test(id) && !/^\d+$/.test(id)) return { ...t, url: `https://www.youtube.com/watch?v=${id}` };
    const q = `${artist} - ${title} official audio`;
    return { ...t, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, searchQuery: q };
  }

  function updateRestoreOfflineCount() {
    const boxes = [.../** @type {NodeListOf<HTMLInputElement>} */ (restoreOfflineList.querySelectorAll('input[type=checkbox]'))];
    const n = boxes.filter((b) => b.checked).length;
    restoreOfflineAll.checked = n === boxes.length && n > 0;
    restoreOfflineCount.textContent = String(Tm('Select all ({0} of {1})', n, boxes.length));
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-restore-offline')).disabled = n === 0;
  }

  async function openRestoreOffline() {
    restoreOfflineList.innerHTML = `<div class="empty-hint">${escapeHtml(T('Loading...'))}</div>`;
    restoreOfflineTarget.innerHTML = `<option value="">${escapeHtml(T('New playlist'))}</option>` +
      state.playlists.map((/** @type {UrielPlaylist} */ pl) => `<option value="${escapeHtml(pl.id)}">${escapeHtml(pl.name)}</option>`).join('');
    openModal(restoreOfflineModal);
    let entries = [];
    try {
      const data = await (await fetch(`http://127.0.0.1:${state.serverPort}/api/offline-library`)).json();
      entries = (data && data.tracks) || [];
    } catch (e) {}
    entries.sort((/** @type {UrielOfflineEntry} */ a, /** @type {UrielOfflineEntry} */ b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    restoreOfflineTracks = entries.map(offlineEntryToTrack);
    if (!entries.length) {
      restoreOfflineList.innerHTML = `<div class="empty-hint">${escapeHtml(T('No offline songs found'))}</div>`;
      updateRestoreOfflineCount();
      return;
    }
    restoreOfflineList.innerHTML = entries.map((/** @type {UrielOfflineEntry} */ e, /** @type {number} */ i) => {
      const t = restoreOfflineTracks[i];
      return `<label class="restore-offline-row"><input type="checkbox" class="m3-checkbox" data-i="${i}" checked>` +
        `<img src="${escapeHtml(listThumb(getTrackThumbUrl(t)) || e.localThumbnail || '')}" alt="" loading="lazy">` +
        `<span class="restore-offline-text"><span>${escapeHtml(t.title)}</span><span>${escapeHtml(t.artist)}</span></span></label>`;
    }).join('');
    updateRestoreOfflineCount();
  }

  if (restoreOfflineModal) {
    /** @type {HTMLElement} */ (document.getElementById('btn-restore-offline')).addEventListener('click', openRestoreOffline);
    /** @type {HTMLElement} */ (document.getElementById('btn-cancel-restore-offline')).addEventListener('click', () => closeModal(restoreOfflineModal));
    restoreOfflineList.addEventListener('change', updateRestoreOfflineCount);
    restoreOfflineAll.addEventListener('change', () => {
      /** @type {NodeListOf<HTMLInputElement>} */ (restoreOfflineList.querySelectorAll('input[type=checkbox]')).forEach((b) => { b.checked = restoreOfflineAll.checked; });
      updateRestoreOfflineCount();
    });
    /** @type {HTMLElement} */ (document.getElementById('btn-confirm-restore-offline')).addEventListener('click', () => {
      const picked = [.../** @type {NodeListOf<HTMLElement>} */ (restoreOfflineList.querySelectorAll('input[type=checkbox]:checked'))].map((b) => restoreOfflineTracks[Number(b.dataset.i)]);
      if (!picked.length) return;
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === restoreOfflineTarget.value);
      closeModal(restoreOfflineModal);
      if (!pl) {
        createPlaylist(T('Restored songs'), picked);
        showToast(Tm('Restored {0} songs', picked.length));
        return;
      }
      const fresh = picked.filter((t) => !pl.tracks.some((/** @type {UrielTrack} */ have) => isSameTrack(have, t)));
      fresh.forEach((t) => pl.tracks.push(stampAddedAt(t)));
      savePlaylists();
      if (state.currentPlaylistId === pl.id) openPlaylistDetail(pl.id);
      showToast(Tm('Added {0} songs to {1}', fresh.length, pl.name));
    });
  }

  // the window was hidden or shown again: the bars only animate while someone can see them
  function pauseCacheBars() { if (cacheRafId) { cancelAnimationFrame(cacheRafId); cacheRafId = 0; } }
  function resumeCacheBars() { if (cacheModal && cacheModal.classList.contains('visible') && !cacheRafId) cacheRafId = requestAnimationFrame(cacheFrame); }

  /** @type {UrielStoragePart} */
  const api = { updateDeviceMusicUI, updateOfflineStorageUI, updateMusicFolderUI, updateDownloadFolderUI, pauseCacheBars, resumeCacheBars };
  Object.assign(out, api);
};
