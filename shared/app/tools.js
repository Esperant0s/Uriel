// @ts-check
// yt-dlp and ffmpeg: whether they are on this computer, installing the missing ones with a progress bar, and asking
// for them again when a feature needs one. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielToolsPart} out */
window.UrielApp.tools = function ({ I18N, closeModal, createWavyProgress, isPhoneApp, openModal, state }, out) {
  /** @type {{ ytDlp?: boolean, ffmpeg?: boolean, progress?: { status?: string, tool?: string, percent?: number, error?: string }, [field: string]: unknown } | null} */
  let toolsKnown = null; // the last /api/tools-status answer (updateToolsUI)
  let toolsAskedAt = 0;
  /** @type {ReturnType<typeof setInterval> | null} */
  let toolsPollInterval = null;
  /** @type {ReturnType<typeof createWavyProgress> | null} */
  let toolsWavyYt = null;
  /** @type {ReturnType<typeof createWavyProgress> | null} */
  let toolsWavyFf = null;

  /** @type {Record<string, string>} */
  const STATUS_ICONS = {
    pending: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--md-sys-color-outline);"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    downloading: '<svg class="g-spinner" style="width: 18px; height: 18px;" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/></svg>',
    done: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: #4cd964;"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--md-sys-color-error, #ff5449);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  function updateToolsUI(/** @type {NonNullable<typeof toolsKnown>} */ data) {
    toolsKnown = data;
    const statusText = document.getElementById('tools-status-text');
    const btnInstall = /** @type {HTMLButtonElement} */ (document.getElementById('btn-install-tools'));
    if (!data) return;

    const prog = data.progress || {};
    const status = prog.status || 'idle';
    const tool = prog.tool || '';
    const pct = typeof prog.percent === 'number' ? prog.percent : 0;
    const errorMsg = prog.error || '';

    let ytdlpStatus = 'pending';
    let ffmpegStatus = 'pending';
    let activeTool = null;
    let activePercent = 0;

    if (status === 'done' || (data.ytDlp && data.ffmpeg)) {
      ytdlpStatus = 'done';
      ffmpegStatus = 'done';
    } else if (status === 'error') {
      if (tool === 'yt-dlp') {
        ytdlpStatus = 'error';
        ffmpegStatus = data.ffmpeg ? 'done' : 'pending';
      } else if (tool === 'ffmpeg') {
        ytdlpStatus = 'done';
        ffmpegStatus = 'error';
      } else {
        ytdlpStatus = data.ytDlp ? 'done' : 'error';
        ffmpegStatus = data.ffmpeg ? 'done' : 'error';
      }
    } else if (status === 'downloading') {
      if (tool === 'yt-dlp') {
        ytdlpStatus = 'downloading';
        ffmpegStatus = data.ffmpeg ? 'done' : 'pending';
        activeTool = 'yt-dlp';
        activePercent = pct;
      } else if (tool === 'ffmpeg') {
        ytdlpStatus = 'done';
        ffmpegStatus = 'downloading';
        activeTool = 'ffmpeg';
        activePercent = pct;
      }
    } else {
      ytdlpStatus = data.ytDlp ? 'done' : 'pending';
      ffmpegStatus = data.ffmpeg ? 'done' : 'pending';
    }

    const iconYt = document.getElementById('tools-icon-ytdlp');
    const iconFf = document.getElementById('tools-icon-ffmpeg');
    if (iconYt) iconYt.innerHTML = STATUS_ICONS[ytdlpStatus] || STATUS_ICONS.pending;
    if (iconFf) iconFf.innerHTML = STATUS_ICONS[ffmpegStatus] || STATUS_ICONS.pending;

    const pctYt = document.getElementById('tools-pct-ytdlp');
    const pctFf = document.getElementById('tools-pct-ffmpeg');
    if (pctYt) {
      pctYt.textContent = ytdlpStatus === 'downloading' ? `${activePercent}%` : (ytdlpStatus === 'done' ? 'Ready' : (ytdlpStatus === 'error' ? 'Failed' : ''));
    }
    if (pctFf) {
      pctFf.textContent = ffmpegStatus === 'downloading' ? `${activePercent}%` : (ffmpegStatus === 'done' ? 'Ready' : (ffmpegStatus === 'error' ? 'Failed' : ''));
    }

    const wrapYt = document.getElementById('tools-wavy-ytdlp');
    const wrapFf = document.getElementById('tools-wavy-ffmpeg');
    if (activeTool === 'yt-dlp') {
      if (wrapYt) {
        wrapYt.style.display = 'block';
        if (!toolsWavyYt && typeof createWavyProgress === 'function') toolsWavyYt = createWavyProgress(wrapYt);
        if (toolsWavyYt) toolsWavyYt.set(activePercent);
      }
      if (wrapFf) wrapFf.style.display = 'none';
    } else if (activeTool === 'ffmpeg') {
      if (wrapYt) wrapYt.style.display = 'none';
      if (wrapFf) {
        wrapFf.style.display = 'block';
        if (!toolsWavyFf && typeof createWavyProgress === 'function') toolsWavyFf = createWavyProgress(wrapFf);
        if (toolsWavyFf) toolsWavyFf.set(activePercent);
      }
    } else {
      if (wrapYt) wrapYt.style.display = 'none';
      if (wrapFf) wrapFf.style.display = 'none';
    }

    const errEl = document.getElementById('tools-error-msg');
    const btnDownload = /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-install-tools'));
    const btnRetry = document.getElementById('btn-retry-tools');
    const btnDismiss = document.getElementById('btn-dismiss-tools-modal');

    if (errEl) {
      if (status === 'error' && errorMsg) {
        errEl.textContent = errorMsg;
        errEl.style.display = 'block';
      } else {
        errEl.style.display = 'none';
      }
    }

    if (status === 'error') {
      if (btnRetry) btnRetry.style.display = 'inline-flex';
      if (btnDownload) btnDownload.style.display = 'none';
      if (btnDismiss) btnDismiss.textContent = 'Close';
    } else if (status === 'downloading') {
      if (btnRetry) btnRetry.style.display = 'none';
      if (btnDownload) {
        btnDownload.style.display = 'inline-flex';
        btnDownload.disabled = true;
        btnDownload.textContent = 'Downloading...';
      }
      if (btnDismiss) btnDismiss.textContent = 'Not now';
    } else if (status === 'done' || (data.ytDlp && data.ffmpeg)) {
      if (btnRetry) btnRetry.style.display = 'none';
      if (btnDownload) btnDownload.style.display = 'none';
      if (btnDismiss) btnDismiss.textContent = 'Close';
    } else {
      if (btnRetry) btnRetry.style.display = 'none';
      if (btnDownload) {
        btnDownload.style.display = 'inline-flex';
        btnDownload.disabled = false;
        btnDownload.textContent = 'Download';
      }
      if (btnDismiss) btnDismiss.textContent = 'Not now';
    }

    if (statusText) {
      if (status === 'downloading') {
        statusText.textContent = `Downloading ${tool || 'tools'} ${pct}%`;
        if (btnInstall) {
          btnInstall.classList.remove('hidden');
          btnInstall.disabled = true;
        }
      } else if (data.ytDlp && data.ffmpeg) {
        statusText.textContent = 'Installed';
        if (btnInstall) {
          btnInstall.classList.add('hidden');
          btnInstall.disabled = false;
        }
      } else {
        const missing = [];
        if (!data.ytDlp) missing.push('yt-dlp');
        if (!data.ffmpeg) missing.push('ffmpeg');
        statusText.textContent = `Missing: ${missing.join(', ')}`;
        if (btnInstall) {
          btnInstall.classList.remove('hidden');
          btnInstall.disabled = false;
        }
      }
    }
  }

  function pollToolsStatus() {
    if (toolsPollInterval) return;
    toolsPollInterval = setInterval(async () => {
      if (document.hidden || !state.isWindowVisible) return;
      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/tools-status`);
        const data = await res.json();
        updateToolsUI(data);
        if (data.progress && (data.progress.status === 'done' || data.progress.status === 'error')) {
          if (toolsPollInterval) clearInterval(toolsPollInterval);
          toolsPollInterval = null;
          // on a fresh install the home page loaded before yt-dlp existed and is showing its retry button
          const retryHome = data.progress.status === 'done' && document.getElementById('btn-retry-vibe');
          if (retryHome) retryHome.click();
        }
      } catch (e) {}
    }, 1000);
  }

  function startToolsInstall() {
    const btnInstall = /** @type {HTMLButtonElement} */ (document.getElementById('btn-install-tools'));
    if (btnInstall) btnInstall.disabled = true;

    const modal = document.getElementById('tools-install-modal');
    if (modal) openModal(modal);

    const errEl = document.getElementById('tools-error-msg');
    if (errEl) errEl.style.display = 'none';
    const btnRetry = document.getElementById('btn-retry-tools');
    if (btnRetry) btnRetry.style.display = 'none';
    const btnDownload = /** @type {HTMLButtonElement} */ (document.getElementById('btn-confirm-install-tools'));
    if (btnDownload) {
      btnDownload.style.display = 'inline-flex';
      btnDownload.disabled = true;
      btnDownload.textContent = 'Downloading...';
    }

    fetch(`http://127.0.0.1:${state.serverPort}/api/tools-install`, { method: 'POST' }).catch(() => {});
    pollToolsStatus();
  }

  async function checkToolsStatus(promptUser = false) {
    if (!state.serverPort) return;
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/tools-status`);
      const data = await res.json();
      updateToolsUI(data);

      if (data.progress && data.progress.status === 'downloading') {
        pollToolsStatus();
      } else if (promptUser && (!data.ytDlp || !data.ffmpeg) && !localStorage.getItem('uriel_tools_reminder_off')) {
        showToolsReminder(data);
      }
    } catch (e) {}
  }

  // name only what is missing, and what it is for: a tool already on this computer (in PATH, a package manager's
  // folder or Uriel's old folder) is shown as Ready and isn't downloaded again
  function showToolsReminder(/** @type {NonNullable<typeof toolsKnown>} */ data) {
    const modal = document.getElementById('tools-install-modal');
    const desc = document.getElementById('tools-modal-desc');
    if (desc) {
      if (!data.ytDlp && !data.ffmpeg) I18N.text(desc, 'yt-dlp lets Uriel find and play songs from YouTube, and ffmpeg lets it save them as MP3, FLAC and the other formats. Download both (~400 MB)?');
      else if (!data.ytDlp) I18N.text(desc, 'yt-dlp lets Uriel find and play songs from YouTube. Download it? ffmpeg is already installed.');
      else I18N.text(desc, 'ffmpeg lets Uriel save songs as MP3, FLAC and the other formats. Download it? yt-dlp is already installed.');
    }
    toolsAskedAt = Date.now();
    if (modal) openModal(modal);
  }

  // A feature that needs a missing tool asks again, even after "Not now". False when one is missing.
  async function toolsReady(/** @type {string[]} */ need) {
    if (isPhoneApp || !toolsKnown) return true;
    const lacks = (/** @type {NonNullable<typeof toolsKnown>} */ d) => need.some((/** @type {string} */ n) => (n === 'yt-dlp' ? !d.ytDlp : !d.ffmpeg));
    if (!lacks(toolsKnown)) return true;
    // installed some other way since the last look?
    try { updateToolsUI(await (await fetch(`http://127.0.0.1:${state.serverPort}/api/tools-status`)).json()); } catch (e) {}
    if (!lacks(toolsKnown)) return true;
    if (toolsKnown.progress && toolsKnown.progress.status === 'downloading') return false;
    // once in a while, not on every song of a queue that keeps failing
    if (Date.now() - toolsAskedAt > 30000) showToolsReminder(toolsKnown);
    return false;
  }

  const btnInstallTools = document.getElementById('btn-install-tools');
  if (btnInstallTools) {
    btnInstallTools.addEventListener('click', () => {
      startToolsInstall();
    });
  }

  const toolsModal = document.getElementById('tools-install-modal');
  const btnConfirmInstallTools = document.getElementById('btn-confirm-install-tools');
  const btnDismissToolsModal = document.getElementById('btn-dismiss-tools-modal');
  const btnCloseToolsModal = document.getElementById('btn-close-tools-modal');
  const btnRetryTools = document.getElementById('btn-retry-tools');

  if (btnConfirmInstallTools) {
    btnConfirmInstallTools.addEventListener('click', () => {
      startToolsInstall();
    });
  }

  if (btnRetryTools) {
    btnRetryTools.addEventListener('click', () => {
      startToolsInstall();
    });
  }

  // "Not now" is remembered: no more reminders when Uriel starts, only when something needs the tool (toolsReady)
  for (const b of [btnDismissToolsModal, btnCloseToolsModal]) {
    if (b && toolsModal) b.addEventListener('click', () => {
      localStorage.setItem('uriel_tools_reminder_off', '1');
      closeModal(toolsModal);
    });
  }

  /** @type {UrielToolsPart} */
  const api = { checkToolsStatus, toolsReady };
  Object.assign(out, api);
};
