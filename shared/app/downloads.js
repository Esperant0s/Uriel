// @ts-check
// Downloads: the dialog for one song (format, quality, trim, or the processed audio as WAV), a playlist or album at
// once, and the queue of downloads waiting their turn. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielDownloadsPart} out */
window.UrielApp.downloads = function ({ I18N, T, Tf, Tm, audioEngine, closeModal, el, formatDuration, isPhoneApp, isSameTrack, multiSel, offlineChanged, openModal, prepareTrimPane, refreshPlaylistDownloads, showDownloadPane, showToast, sortTracksFor, state, toolsReady }, out) {
  /** @type {UrielTrack | null} */
  let trackToDownload = null;
  /** @type {UrielDownloadJob | null} */
  let downloadBatch = null;
  /** @type {AbortController | null} */
  let downloadAbort = null;
  // what the running download is for: the batch object or the track. The dialog is shared, so a playlist download
  // left running (Escape only hides the dialog) must not be cancelled from a single song's dialog, or the reverse
  /** @type {UrielDownloadJob | UrielTrack | null} */
  let downloadAbortFor = null;
  // phones keep their own choice: they used to save 'mp3' here without offering formats, and start on Original
  const FORMAT_KEY = isPhoneApp ? 'uriel_download_format_phone' : 'uriel_download_format';
  const PHONE_FORMATS = ['original', 'm4a', 'mp3', 'flac'];
  let selectedFormat = localStorage.getItem(FORMAT_KEY) || (isPhoneApp ? 'original' : 'mp3');
  if (isPhoneApp && !PHONE_FORMATS.includes(selectedFormat)) selectedFormat = 'original';
  let selectedQuality = '0';

  let singleFailed = false; // the phone's dialog: the last try for this song failed
  let singleSaved = false; // ...or the song is in Downloads already
  function setDownloadProgress(/** @type {UrielDownloadProgress | null} */ p) {
    const box = document.getElementById('download-progress');
    if (!box) return;
    box.classList.toggle('hidden', !p);
    if (!p) return;
    box.classList.toggle('is-error', !!p.error);
    box.classList.toggle('is-note', !!p.note);
    box.classList.toggle('is-waiting', p.fraction == null && !p.error && !p.note);
    /** @type {HTMLElement} */ (document.getElementById('download-progress-text')).textContent = p.text || '';
    const fill = /** @type {HTMLElement} */ (document.getElementById('download-progress-fill'));
    fill.style.width = p.fraction == null ? '' : `${Math.round(Math.max(0, Math.min(1, p.fraction)) * 100)}%`;
  }
  // running on a phone: the page shows progress, and Cancel and "keep going" take the place of the download button
  function setDownloadRunning(/** @type {boolean} */ on) {
    if (!isPhoneApp) return;
    if (el.btnConfirmDownload) el.btnConfirmDownload.style.display = on ? 'none' : '';
    const hide = document.getElementById('btn-hide-download');
    if (hide) hide.classList.toggle('hidden', !on);
  }
  // the phone keeps the app awake and shows a notification while this is on (mobile/media-controls.ts)
  function announceDownloads(/** @type {boolean} */ active, info = {}) {
    window.dispatchEvent(new CustomEvent('uriel:downloads', { detail: { active, ...info } }));
  }
  function updateDownloadBtnLabel() {
    if (!el.downloadBtnText) return;
    const waits = !!downloadAbort && downloadAbortFor !== (downloadBatch || trackToDownload);
    if (downloadBatch) {
      const b = downloadBatch;
      const count = b.missing != null ? b.missing : b.tracks.length;
      if (el.btnConfirmDownload && !(downloadAbort && downloadAbortFor === b)) el.btnConfirmDownload.disabled = !!b.checking || count === 0;
      el.downloadBtnText.textContent = b.checking ? T('Checking…')
        : count === 0 ? T('All downloaded')
          : waits ? Tf('Add {0} to the download queue', count)
            : b.retry ? Tf('Retry failed ({0})', count) : `Download ${count} song${count === 1 ? '' : 's'}`;
    } else if (waits) {
      el.downloadBtnText.textContent = T('Add to the download queue');
    } else {
      const name = selectedFormat === 'original' ? T('Original') : selectedFormat.toUpperCase();
      el.downloadBtnText.textContent = singleFailed ? T('Try again') : singleSaved ? T('Download again') : `${T('Download')} ${name}`;
    }
  }

  // the bitrate only means something for a format that's encoded: not Original or a lossless one, and on phones
  // only MP3 is (M4A there is YouTube's own AAC, as it came)
  function updateLosslessQualityState() {
    const section = document.getElementById('download-quality-section');
    const encoded = isPhoneApp ? selectedFormat === 'mp3' : ['mp3', 'm4a', 'opus'].includes(selectedFormat);
    if (section) section.classList.toggle('hidden', !encoded);
  }

  // what goes into the saved file's tags besides title and artist
  function tagQuery(/** @type {UrielTrack} */ t, /** @type {UrielDownloadJob | null} */ batch) {
    const album = batch && batch.album ? /** @type {UrielAlbum} */ (batch.album) : null;
    const q = {
      thumbnail: t.thumbnail || (album && album.cover) || '',
      album: (album && album.title) || t.album || '',
      track: album && t.no ? t.no : '',
      year: (album && album.year) || t.year || '',
    };
    return Object.entries(q).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`).join('');
  }

  async function updateDownloadCaptionPath() {
    const elPath = document.getElementById('download-caption-path');
    if (!elPath) return;
    try {
      if (window.electronAPI && window.electronAPI.getDownloadDir) {
        const info = await window.electronAPI.getDownloadDir();
        if (info && info.dir) {
          elPath.textContent = info.dir;
          return;
        }
      }
    } catch (e) {
      console.warn('getDownloadDir failed', e);
    }
    elPath.textContent = '~/Downloads';
  }

  function openDownloadModal(/** @type {UrielTrack} */ track) {
    if (!track || !el.downloadModal) return;
    trackToDownload = track;
    downloadBatch = null;
    el.downloadModal.classList.remove('batch-mode');
    singleFailed = false;
    singleSaved = false;
    if (!downloadAbort || downloadAbortFor !== track) showIdleDownload();
    if (isPhoneApp && track.platform !== 'local') {
      downloadedInFolder([track]).then(([have]) => {
        if (!have || trackToDownload !== track || downloadAbort) return;
        singleSaved = true;
        updateDownloadBtnLabel();
        setDownloadProgress({ text: T('This song is already in your downloads.'), note: true });
      }, () => {});
    }
    const modalTitle = document.getElementById('download-modal-title');
    if (modalTitle) modalTitle.textContent = 'Download song';
    if (el.downloadPreviewTitle) el.downloadPreviewTitle.textContent = track.title || 'untitled';
    if (el.downloadPreviewArtist) el.downloadPreviewArtist.textContent = track.artist || 'unknown artist';

    const trimStartEl = /** @type {HTMLInputElement} */ (document.getElementById('trim-start'));
    const trimEndEl = /** @type {HTMLInputElement} */ (document.getElementById('trim-end'));
    if (trimStartEl) trimStartEl.value = '0:00';
    if (trimEndEl) {
      const dur = (isSameTrack(track, state.currentTrack) && el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0)
        ? Math.round(el.nativeAudio.duration)
        : (track.duration && Number(track.duration) > 0 ? Math.round(Number(track.duration)) : null);
      trimEndEl.value = dur ? formatDuration(dur) : '';
    }
    prepareTrimPane(track);

    if (track.thumbnail) {
      if (el.downloadPreviewThumb) {
        el.downloadPreviewThumb.src = track.thumbnail;
        el.downloadPreviewThumb.style.display = 'block';
      }
      if (el.downloadPreviewFallback) el.downloadPreviewFallback.style.display = 'none';
    } else {
      if (el.downloadPreviewThumb) el.downloadPreviewThumb.style.display = 'none';
      if (el.downloadPreviewFallback) el.downloadPreviewFallback.style.display = 'flex';
    }

    updateDownloadBtnLabel();
    updateLosslessQualityState();
    updateDownloadCaptionPath();

    const btnDeleteOfflineTrack = document.getElementById('btn-delete-offline-track');
    if (btnDeleteOfflineTrack) {
      btnDeleteOfflineTrack.classList.add('hidden');
      if (track && track.id) {
        fetch(`http://127.0.0.1:${state.serverPort}/api/check-cache?id=${encodeURIComponent(track.id)}`)
          .then(r => r.json())
          .then(res => {
            // only for the song the dialog still shows: a late answer for an earlier one would offer to delete the wrong file
            if (res.cached && trackToDownload === track) {
              btnDeleteOfflineTrack.classList.remove('hidden');
            }
          })
          .catch(() => {});
      }
    }

    openModal(el.downloadModal);
  }

  // a playlist, all favorites or the selected songs: { name, tracks }
  function openDownloadAllModal(/** @type {UrielDownloadJob | UrielPlaylist | undefined} */ playlist, title = 'Download playlist') {
    if (!el.downloadModal) return;
    const tracks = (playlist && Array.isArray(playlist.tracks) ? playlist.tracks : []).filter((/** @type {UrielTrack} */ t) => t.platform !== 'local');
    if (!playlist || !tracks.length) {
      showToast(Tm('No songs to download here (songs from your own files are already on this device)'), 'info');
      return;
    }
    trackToDownload = null;
    const name = playlist.name || 'Playlist';
    // two playlists can share a name, so a download is known by its key (playlist id, album:<id>, favorites...)
    const key = String(playlist.key || ('id' in playlist && playlist.id) || name);
    // the same playlist downloading already: its dialog comes back with the progress
    const running = downloadAbort && downloadAbortFor && downloadAbortFor.tracks && downloadAbortFor.key === key ? /** @type {UrielDownloadJob} */ (downloadAbortFor) : null;
    downloadBatch = running || { name, key, tracks, album: playlist.album, resolve: playlist.resolve, onStart: playlist.onStart, onProgress: playlist.onProgress, onDone: playlist.onDone, checking: true };
    if (!running) showIdleDownload();
    const batchShown = downloadBatch;
    el.downloadModal.classList.add('batch-mode');
    showDownloadPane('download');
    const modalTitle = document.getElementById('download-modal-title');
    if (modalTitle) modalTitle.textContent = title;
    if (el.downloadPreviewTitle) el.downloadPreviewTitle.textContent = playlist.name || 'Playlist';
    if (el.downloadPreviewThumb) el.downloadPreviewThumb.style.display = 'none';
    if (el.downloadPreviewFallback) el.downloadPreviewFallback.style.display = 'none';
    updateDownloadBtnLabel();
    updateLosslessQualityState();
    updateDownloadCaptionPath();
    openModal(el.downloadModal);
    if (running) return;
    // how many are already in the Downloads folder (they're skipped): the dialog says "Checking" until it knows,
    // instead of the playlist's whole count first
    if (el.downloadPreviewArtist) I18N.text(el.downloadPreviewArtist, 'Checking what is already downloaded…');
    downloadedInFolder(tracks).then((present) => {
      if (downloadBatch !== batchShown) return;
      const have = present.filter(Boolean).length;
      batchShown.missing = tracks.length - have;
      if (el.downloadPreviewArtist) {
        if (!have) I18N.text(el.downloadPreviewArtist, tracks.length === 1 ? '1 song' : '{0} songs', tracks.length);
        else if (have >= tracks.length) I18N.text(el.downloadPreviewArtist, 'All {0} songs are already downloaded', tracks.length);
        else I18N.text(el.downloadPreviewArtist, '{0} of {1} already downloaded · {2} to go', have, tracks.length, tracks.length - have);
      }
    }, () => {
      if (downloadBatch === batchShown && el.downloadPreviewArtist) I18N.text(el.downloadPreviewArtist, "Couldn't check what is already downloaded: all {0} will be downloaded", tracks.length);
    }).finally(() => {
      if (downloadBatch !== batchShown) return;
      batchShown.checking = false;
      updateDownloadBtnLabel();
    });
  }

  // why songs of a batch failed, under its summary (they used to go only to the console)
  function showFailures(/** @type {{ item: UrielTrack, error: unknown }[]} */ failed) {
    const list = document.getElementById('download-failures');
    if (!list) return;
    list.classList.toggle('hidden', !failed.length);
    list.replaceChildren(...failed.slice(0, 20).map((f) => {
      const li = document.createElement('li');
      li.textContent = `${f.item.title || f.item.url || ''}: ${f.error instanceof Error ? f.error.message : String(f.error || '')}`;
      return li;
    }));
    if (failed.length > 20) {
      const li = document.createElement('li');
      li.textContent = Tf('and {0} more', failed.length - 20);
      list.append(li);
    }
  }

  // the dialog ready for a new download: no progress, its button showing (a running one goes on without it)
  function showIdleDownload() {
    setDownloadProgress(null);
    showFailures([]);
    setDownloadRunning(false);
    if (el.btnConfirmDownload) { el.btnConfirmDownload.style.display = ''; el.btnConfirmDownload.disabled = false; }
  }

  function setDownloadFormat(/** @type {string} */ fmt) {
    selectedFormat = fmt || (isPhoneApp ? 'original' : 'mp3');
    localStorage.setItem(FORMAT_KEY, selectedFormat);
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.format-chip')).forEach((c) => {
      c.classList.toggle('active', c.dataset.format === selectedFormat);
    });
    updateDownloadBtnLabel();
    updateLosslessQualityState();
  }

  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.format-chip')).forEach((chip) => {
    chip.addEventListener('click', () => {
      setDownloadFormat(chip.dataset.format || '');
    });
  });

  setDownloadFormat(selectedFormat);

  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.quality-chip')).forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.quality-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedQuality = chip.dataset.quality || selectedQuality;
    });
  });


  function cancelCurrentDownload() {
    if (downloadAbort && downloadAbortFor === (downloadBatch || trackToDownload)) {
      // Cancel stops what waits behind it too
      clearQueue();
      try { downloadAbort.abort(); } catch (_) {}
      downloadAbort = null;
      const curSpinner = el.downloadSpinner || document.getElementById('download-spinner');
      if (curSpinner) curSpinner.innerHTML = '';
      if (el.btnConfirmDownload) {
        el.btnConfirmDownload.style.display = '';
        el.btnConfirmDownload.disabled = false;
      }
      setDownloadProgress(null);
      setDownloadRunning(false);
      announceDownloads(false);
      updateDownloadBtnLabel();
      showToast(Tm('Download cancelled'), 'info');
      if (el.downloadModal) closeModal(el.downloadModal);
      return true;
    }
    return false;
  }

  // X only closes the dialog: a running download goes on and says when it's done (Muriel #48). Cancel stops it.
  if (el.btnCloseDownloadModal) {
    el.btnCloseDownloadModal.addEventListener('click', () => {
      if (el.downloadModal) closeModal(el.downloadModal);
    });
  }

  if (el.btnCancelDownload) {
    el.btnCancelDownload.addEventListener('click', () => {
      if (!cancelCurrentDownload()) {
        if (el.downloadModal) closeModal(el.downloadModal);
      }
    });
  }

  const btnHideDownload = document.getElementById('btn-hide-download');
  if (btnHideDownload) btnHideDownload.addEventListener('click', () => { if (el.downloadModal) closeModal(el.downloadModal); });
  // Cancel in the phone's download notification
  window.addEventListener('uriel:cancel-downloads', () => {
    if (!downloadAbort) return;
    if (!cancelCurrentDownload()) {
      clearQueue();
      try { downloadAbort.abort(); } catch (_) {}
      downloadAbort = null;
      updateDownloadBtnLabel();
    }
    setDownloadProgress(null);
    setDownloadRunning(false);
    announceDownloads(false);
  });

  if (el.btnPlaybarMore) {
    el.btnPlaybarMore.addEventListener('click', () => {
      if (state.currentTrack) {
        openDownloadModal(state.currentTrack);
      } else {
        showToast(Tm('No song currently playing'), 'info');
      }
    });
  }

  function parseTimeInputToSeconds(/** @type {string} */ str) {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) {
      const val = parseFloat(s);
      return isNaN(val) ? null : Math.max(0, val);
    }
    const parts = s.split(':').map(p => p.trim());
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const sec = parseFloat(parts[1]);
      if (!isNaN(m) && !isNaN(sec) && m >= 0 && sec >= 0) {
        return m * 60 + sec;
      }
    } else if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const sec = parseFloat(parts[2]);
      if (!isNaN(h) && !isNaN(m) && !isNaN(sec) && h >= 0 && m >= 0 && sec >= 0) {
        return h * 3600 + m * 60 + sec;
      }
    }
    return null;
  }

  function trimAudioBuffer(/** @type {BaseAudioContext} */ ctx, /** @type {AudioBuffer} */ buffer, /** @type {number} */ startSec, /** @type {number | null} */ endSec) {
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const totalDuration = buffer.duration;
    const start = Math.max(0, Math.min(startSec || 0, totalDuration));
    const end = (endSec !== null && endSec !== undefined && endSec > start)
      ? Math.min(endSec, totalDuration)
      : totalDuration;

    if (start <= 0 && end >= totalDuration) {
      return buffer;
    }

    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const length = Math.max(1, endSample - startSample);

    const trimmed = ctx.createBuffer(numChannels, length, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = trimmed.getChannelData(ch);
      dstData.set(srcData.subarray(startSample, startSample + length));
    }
    return trimmed;
  }

  function audioBufferToWav(/** @type {AudioBuffer} */ buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const length = buffer.length;
    const dataSize = length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeStr = (/** @type {number} */ offset, /** @type {string} */ str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    // each channel's samples fetched once (getChannelData per sample froze the window for seconds), written
    // interleaved; WAV is little-endian like every machine the app runs on
    const out = new Int16Array(arrayBuffer, 44, length * numChannels);
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0, o = ch; i < length; i++, o += numChannels) {
        const sample = Math.max(-1, Math.min(1, data[i]));
        out[o] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  // which of `tracks` are already in the Downloads folder (the offline cache doesn't count): an array of booleans
  async function downloadedInFolder(/** @type {UrielTrack[]} */ tracks) {
    /** @type {boolean[]} */
    const out = [];
    for (let i = 0; i < tracks.length; i += 500) {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/downloaded-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filesOnly: true, tracks: tracks.slice(i, i + 500).map((/** @type {UrielTrack} */ t) => ({ title: t.title || '', artist: t.artist || '', id: String(t.id || ''), duration: Number(t.duration) || 0 })) }),
      });
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.downloaded)) throw new Error('downloaded-status failed');
      out.push(...data.downloaded.map(Boolean));
    }
    return out;
  }

  // Downloads asked for while another one runs wait here and start one after another (Muriel #48). A song waits as
  // a one-song batch.
  /** @type {UrielDownloadJob[]} */
  const downloadQueue = [];
  function queueDownload(/** @type {UrielDownloadJob} */ batch) {
    const key = batch.key || batch.name;
    const running = downloadAbortFor && 'tracks' in downloadAbortFor && downloadAbortFor.key === key;
    if (running || downloadQueue.some((q) => q.key === key)) {
      showToast(Tm('This is already in the download queue'), 'info');
      return;
    }
    // it keeps the format picked now, not whatever the dialog shows when its turn comes
    downloadQueue.push({ name: batch.name, key, tracks: batch.tracks, album: batch.album, resolve: batch.resolve, onStart: batch.onStart, onProgress: batch.onProgress, onDone: batch.onDone, format: batch.format || selectedFormat, quality: batch.quality || selectedQuality });
    if (typeof batch.onStart === 'function') batch.onStart();
    if (el.downloadModal) closeModal(el.downloadModal);
    showToast(Tm('Added to the download queue ({0} waiting)', downloadQueue.length), 'info');
  }
  // Cancel drops what waits too; an album's button stops saying it's downloading
  function clearQueue() {
    for (const q of downloadQueue.splice(0)) if (typeof q.onDone === 'function') q.onDone(0, q.tracks.length);
  }
  function startNextDownload() {
    if (downloadAbort || !downloadQueue.length) return;
    const next = /** @type {UrielDownloadJob} */ (downloadQueue.shift());
    showToast(Tm('Downloading {0}', next.name || T('Playlist')), 'info');
    runBatchDownload(next);
  }

  // One playlist, album or selection: the songs not in the Downloads folder yet, two at a time. Started by the dialog,
  // or from the queue when the one before it ends (startNextDownload).
  async function runBatchDownload(/** @type {UrielDownloadJob} */ batch) {
    // the dialog may show another download by the time this one reports back
    const shown = () => downloadBatch === batch;
    if (shown() && el.btnConfirmDownload) el.btnConfirmDownload.disabled = true;
    const format = String(batch.format || selectedFormat);
    const quality = String(batch.quality || selectedQuality);
    if (typeof batch.onStart === 'function') batch.onStart();
    try {
      let lastDir = null;
      // Cancel/X used to only hide the dialog while every song kept downloading
      const batchAbort = new AbortController();
      downloadAbort = batchAbort;
      downloadAbortFor = batch;
      const total = batch.tracks.length;
      if (shown()) setDownloadProgress({ text: T('Checking what is already downloaded…') });
      // songs already in the Downloads folder aren't downloaded again (#29)
      const present = await downloadedInFolder(batch.tracks).catch((e) => {
        console.warn('downloaded-status failed', e);
        return null;
      });
      const tracks = present ? batch.tracks.filter((/** @type {UrielTrack} */ _, /** @type {number} */ i) => !present[i]) : batch.tracks;
      const skipped = total - tracks.length;
      // how far each song under way is (0..1), by the id its progress comes with (phones): the bar moves during
      // each song, not only when one is done. MP3 and FLAC are half download, half converting.
      /** @type {Map<string, number>} */
      const underWay = new Map();
      const converts = isPhoneApp && (format === 'mp3' || format === 'flac');
      let last = { done: 0, failed: 0 };
      const setProgress = (/** @type {{ done: number, failed: number }} */ p) => {
        last = p;
        const partial = [...underWay.values()].reduce((n, v) => n + Math.min(v, 0.99), 0);
        const fraction = tracks.length ? Math.min(1, (p.done + p.failed + partial) / tracks.length) : 0;
        const label = Tf('Downloading {0}/{1}', Math.min(tracks.length, p.done + p.failed + 1), tracks.length) + (p.failed ? ` · ${Tf('{0} failed', p.failed)}` : '');
        if (el.downloadBtnText && shown()) el.downloadBtnText.textContent = label;
        if (shown()) setDownloadProgress({ text: label, fraction });
        announceDownloads(true, { title: batch.name || '', done: p.done + p.failed, total: tracks.length, percent: Math.round(fraction * 100) });
        if (typeof batch.onProgress === 'function') batch.onProgress(p.done + p.failed, tracks.length);
      };
      const onPart = (/** @type {WindowEventMap['uriel:dl-progress']} */ e) => {
        if (batchAbort.signal.aborted || !e.detail || !e.detail.total) return;
        const f = e.detail.done / e.detail.total;
        underWay.set(e.detail.id, converts ? (e.detail.stage === 'convert' ? 0.5 + f / 2 : f / 2) : f);
        setProgress(last);
      };
      window.addEventListener('uriel:dl-progress', onPart);
      batchAbort.signal.addEventListener('abort', () => window.removeEventListener('uriel:dl-progress', onPart));
      setDownloadRunning(true);
      setProgress({ done: 0, failed: 0 });
      const downloadOne = async (/** @type {UrielTrack} */ t, /** @type {{ fresh: boolean }} */ o) => {
        /** @type {UrielTrack} */
        let src = t;
        try {
          await downloadSong(t, o, (/** @type {UrielTrack} */ s) => { src = s; });
        } finally {
          // done or failed: it counts as a whole song from here (setProgress follows right after)
          for (const k of [...underWay.keys()]) if (String(src.id || t.id || '').includes(k)) underWay.delete(k);
        }
      };
      const downloadSong = async (/** @type {UrielTrack} */ t, /** @type {{ fresh: boolean }} */ { fresh }, /** @type {(s: UrielTrack) => void} */ onSource) => {
        // an album's songs are found on YouTube first (the file keeps the album's title and artist)
        let src = t;
        if (typeof batch.resolve === 'function') {
          const found = await batch.resolve(t).catch(() => null);
          if (found && found.url) src = { ...t, url: found.url, id: found.id || t.id };
        }
        onSource(src);
        const downloadUrl = `http://127.0.0.1:${state.serverPort}/api/download?url=${encodeURIComponent(src.url || '')}&id=${encodeURIComponent(src.id || '')}&title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&format=${format}&quality=${quality}&platform=${encodeURIComponent(src.platform || t.platform || 'youtube')}&duration=${encodeURIComponent(t.duration || 0)}&songId=${encodeURIComponent(t.id || '')}${tagQuery(t, batch)}${fresh ? '&fresh=1' : ''}`;
        const res = await fetch(downloadUrl, { signal: batchAbort.signal });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { throw Object.assign(new Error(text || 'server error'), { status: res.status }); }
        if (!data.success) throw Object.assign(new Error(data.error || 'Failed to download'), { status: res.status });
        if (data.directory) lastDir = data.directory;
        offlineChanged(t, true);
      };
      const result = tracks.length ? await window.UrielDownloadBatch.runDownloadBatch(tracks, downloadOne, {
        concurrency: 2, signal: batchAbort.signal, onProgress: setProgress,
      }) : { done: [], failed: [], aborted: batchAbort.signal.aborted };
      for (const f of result.failed) console.error('Download failed:', f.item.title || f.item.url || '', f.error instanceof Error ? f.error.message : f.error);
      const done = result.done.length;
      const failedTracks = result.failed.map((/** @type {{ item: UrielTrack }} */ f) => f.item);
      window.removeEventListener('uriel:dl-progress', onPart);
      if (shown()) { el.btnConfirmDownload.disabled = false; setDownloadRunning(false); setDownloadProgress(null); }
      announceDownloads(false);
      if (downloadAbort === batchAbort) downloadAbort = null;
      if (typeof batch.onDone === 'function') batch.onDone(done + skipped, total);
      // the playlist page's "12 of 40 downloaded" and its Download button follow
      if (state.currentView === 'playlist-detail') refreshPlaylistDownloads(state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId));
      // on phones the server answers with the app's internal path (/data/Downloads); name the real folder
      if (isPhoneApp && lastDir) {
        try { lastDir = (await window.electronAPI.getDownloadDir()).dir || lastDir; } catch (e) {}
      }
      if (batchAbort.signal.aborted) {
        // cancelCurrentDownload already closed the dialog; another one may be open by now
        if (done) showToast(lastDir ? Tm('Stopped. {0} of {1} songs were downloaded to {2}', done, tracks.length, lastDir) : Tm('Stopped. {0} of {1} songs were downloaded', done, tracks.length), 'info');
        return;
      }
      const summary = [Tf('{0} downloaded', done)];
      if (skipped) summary.push(Tf('{0} already downloaded', skipped));
      if (failedTracks.length) summary.push(Tf('{0} failed', failedTracks.length));
      if (!shown()) {
        showToast(summary.join(' · '), failedTracks.length ? 'error' : 'success');
        return;
      }
      if (failedTracks.length) {
        // the dialog stays open with the summary; its button now retries just the failed songs
        downloadBatch = { ...batch, tracks: failedTracks, retry: true, missing: undefined, checking: false };
        if (el.downloadPreviewArtist) el.downloadPreviewArtist.textContent = summary.join(' · ');
        showFailures(result.failed);
        updateDownloadBtnLabel();
        showToast(Tm('Downloaded {0}/{1} ({2} failed)', done + skipped, total, failedTracks.length), 'error');
        return;
      }
      downloadBatch = null;
      if (el.downloadModal) closeModal(el.downloadModal);
      showToast(lastDir ? Tm('Downloaded {0} songs to {1}', done, lastDir) + (skipped ? ` (${summary.slice(1).join(', ')})` : '') : summary.join(' · '), 'success');
    } finally {
      startNextDownload();
    }
  }

  if (el.btnConfirmDownload) {
    el.btnConfirmDownload.addEventListener('click', async () => {
      if (downloadBatch) {
        // another download is running: this one waits its turn
        if (downloadAbort && downloadAbortFor !== downloadBatch) { queueDownload(downloadBatch); return; }
        if (!(await toolsReady(['yt-dlp', 'ffmpeg']))) return;
        runBatchDownload(downloadBatch);
        return;
      }
      if (!trackToDownload) return;
      if (!(await toolsReady(['yt-dlp', 'ffmpeg']))) return;
      const t = trackToDownload;

      const trimStartEl = /** @type {HTMLInputElement} */ (document.getElementById('trim-start'));
      const trimEndEl = /** @type {HTMLInputElement} */ (document.getElementById('trim-end'));
      const rawStart = trimStartEl ? trimStartEl.value.trim() : '';
      const rawEnd = trimEndEl ? trimEndEl.value.trim() : '';

      const parsedStart = parseTimeInputToSeconds(rawStart);
      const startSec = (parsedStart !== null && parsedStart >= 0) ? parsedStart : 0;
      const endSec = rawEnd ? parseTimeInputToSeconds(rawEnd) : null;

      const applyEffects = !isPhoneApp && Boolean(/** @type {HTMLInputElement | null} */ (document.getElementById('download-apply-effects'))?.checked);
      // another download is running: this song waits its turn (a trimmed one can't: the queue saves whole songs)
      if (downloadAbort && downloadAbortFor !== t) {
        const fullSong = startSec === 0 && (endSec === null || !t.duration || endSec >= Number(t.duration) - 1);
        if ((!fullSong || applyEffects) && !isPhoneApp) { showToast(Tm('A trimmed song or one with effects can only be downloaded when the others are done'), 'info'); return; }
        queueDownload({ name: t.title || T('Track'), key: `song:${t.id || t.url}`, tracks: [t] });
        return;
      }

      if (endSec !== null && endSec <= startSec) {
        showToast(Tm('Trim end must be after start'), 'error');
        return;
      }

      if (el.btnConfirmDownload) {
        el.btnConfirmDownload.disabled = true;
        el.btnConfirmDownload.style.display = 'none';
      }
      const spinnerEl = el.downloadSpinner || document.getElementById('download-spinner');
      if (spinnerEl && !isPhoneApp) {
        spinnerEl.innerHTML = `
          <div class="m3-spinner-container" style="width: 32px; height: 32px; padding: 4px; background: transparent;">
            <svg class="m3-circular-progress" viewBox="0 0 48 48" style="width: 24px; height: 24px;">
              <circle class="m3-spinner-track" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
              <circle class="m3-spinner-head" cx="24" cy="24" r="18" fill="none" stroke-width="4" stroke="var(--md-sys-color-primary)"></circle>
            </svg>
          </div>
        `;
      }

      if (!isPhoneApp) showToast(Tm('Downloading: {0}', `${t.title || T('Song')} (${selectedFormat === 'original' ? T('Original') : '.' + selectedFormat})`), 'info');
      // its own controller: Cancel clears the shared one, and a download started after this one replaces it
      const singleAbort = new AbortController();
      downloadAbort = singleAbort;
      downloadAbortFor = t;

      try {
        // The server saves the song (yt-dlp or the cache on the PC, mobile/save-download.ts on phones), with retries,
        // tags and cover. Only the PC's audio effects need the song decoded and rendered here (below), and a song
        // from the PC's own files.
        if (isPhoneApp || (!applyEffects && t.platform !== 'local')) {
          if (t.platform === 'local') throw new Error('This song is already on your phone');
          const trim = isPhoneApp ? '' : `${startSec > 0 ? `&start=${startSec}` : ''}${endSec !== null ? `&end=${endSec}` : ''}`;
          singleFailed = false;
          const onTrack = () => trackToDownload === t;
          const showing = (/** @type {UrielDownloadProgress} */ p) => { if (onTrack()) setDownloadProgress(p); };
          const onPart = (/** @type {WindowEventMap['uriel:dl-progress']} */ e) => {
            if (!singleAbort.signal.aborted && e.detail && e.detail.total && (!t.id || String(t.id).includes(e.detail.id))) {
              const percent = e.detail.done / e.detail.total;
              showing({ text: Tf(e.detail.stage === 'convert' ? 'Converting {0}%' : 'Downloading {0}%', Math.round(percent * 100)), fraction: percent });
              announceDownloads(true, { title: t.title || '', total: 1, done: 0, percent: Math.round(percent * 100), converting: e.detail.stage === 'convert' });
            }
          };
          window.addEventListener('uriel:dl-progress', onPart);
          // the PC's yt-dlp says how far it is through the server (phones send uriel:dl-progress)
          const poll = isPhoneApp || !t.id ? 0 : window.setInterval(async () => {
            try {
              const p = await (await fetch(`http://127.0.0.1:${state.serverPort}/api/download-progress?id=${encodeURIComponent(t.id)}`)).json();
              if (singleAbort.signal.aborted || !p || !p.stage) return;
              showing(p.stage === 'convert' ? { text: T('Saving…') } : { text: Tf('Downloading {0}%', p.percent), fraction: p.percent / 100 });
            } catch (e) {}
          }, 1000);
          setDownloadRunning(true);
          showing({ text: T('Finding the song…') });
          announceDownloads(true, { title: t.title || '', total: 1, done: 0 });
          /** @type {{ filename?: string, [field: string]: unknown } | null} */
          let saved = null;
          let result;
          try {
            result = await window.UrielDownloadBatch.runDownloadBatch([t], async (/** @type {UrielTrack} */ _, /** @type {{ fresh: boolean }} */ { fresh }) => {
              const r = await fetch(`http://127.0.0.1:${state.serverPort}/api/download?url=${encodeURIComponent(t.url || '')}&id=${encodeURIComponent(t.id || '')}&title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&format=${selectedFormat}&quality=${selectedQuality}&platform=${encodeURIComponent(t.platform || 'youtube')}&duration=${encodeURIComponent(t.duration || 0)}${tagQuery(t, null)}${trim}${fresh ? '&fresh=1' : ''}`, { signal: singleAbort.signal });
              const d = await r.json();
              if (!d.success) throw Object.assign(new Error(d.error || 'Download failed'), { status: r.status });
              saved = d;
            }, { concurrency: 1, retries: 1, finalPass: false, signal: singleAbort.signal, backoff: { baseMs: 1500, rateBaseMs: 3000 } });
          } finally {
            window.clearInterval(poll);
            window.removeEventListener('uriel:dl-progress', onPart);
            announceDownloads(false);
          }
          if (result.aborted) return;
          if (!saved) throw (result.failed[0] && result.failed[0].error) || new Error('Download failed');
          offlineChanged(t, true);
          let folder = '';
          if (isPhoneApp) { try { folder = (await window.electronAPI.getDownloadDir()).dir || ''; } catch (e) {} }
          const done = /** @type {{ filename?: string, note?: string, directory?: string }} */ (saved);
          const message = done.note ? done.note
            : folder ? Tm('Saved to {0}', folder)
              : !isPhoneApp && done.directory ? Tm('Download complete: saved to {0}', `${done.directory}/${done.filename}`)
                : Tm('Download complete: saved as {0}', done.filename);
          showToast(message, done.note ? 'info' : 'success');
          if (el.downloadModal && downloadAbort === singleAbort && onTrack()) closeModal(el.downloadModal);
          return;
        }
        let audioSourceUrl = null;
        const isCurrent = isSameTrack(t, state.currentTrack);
        if (isCurrent && el.nativeAudio && el.nativeAudio.src && !el.nativeAudio.src.startsWith('blob:')) {
          audioSourceUrl = el.nativeAudio.src;
        }

        if (!audioSourceUrl && t.platform === 'local' && t.id) {
          audioSourceUrl = `http://127.0.0.1:${state.serverPort}/api/library-file?id=${encodeURIComponent(t.id)}`;
        }

        if (!audioSourceUrl && t.id) {
          try {
            const checkRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/check-cache?id=${encodeURIComponent(t.id)}`, { signal: singleAbort.signal });
            const checkData = await checkRes.json();
            if (checkData && checkData.cached) {
              audioSourceUrl = `http://127.0.0.1:${state.serverPort}/api/local-track?id=${encodeURIComponent(t.id)}`;
            }
          } catch (_) {}
        }

        if (!audioSourceUrl) {
          const streamInfoUrl = `http://127.0.0.1:${state.serverPort}/api/stream-info?url=${encodeURIComponent(t.url || '')}&id=${encodeURIComponent(t.id || '')}&platform=${t.platform || 'youtube'}&title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&duration=${encodeURIComponent(t.duration || 0)}`;
          const streamRes = await fetch(streamInfoUrl, { signal: singleAbort.signal });
          const streamData = await streamRes.json();
          if (!streamData || !streamData.success || (!streamData.streamUrl && !streamData.proxyUrl)) {
            throw new Error((streamData && streamData.error) || 'Failed to locate song audio stream');
          }
          audioSourceUrl = streamData.isLocal ? streamData.streamUrl : (streamData.proxyUrl || streamData.streamUrl);
        }

        let fetchUrl = audioSourceUrl;
        const isLoopback = fetchUrl.startsWith('http://127.0.0.1') || fetchUrl.startsWith('http://localhost');
        if (!isLoopback) {
          fetchUrl = `http://127.0.0.1:${state.serverPort}/api/audio-proxy?url=${encodeURIComponent(audioSourceUrl)}`;
        }

        const resFile = await fetch(fetchUrl, { signal: singleAbort.signal });
        if (!resFile.ok) throw new Error(`Failed to load audio (${resFile.status})`);
        const arrayBuffer = await resFile.arrayBuffer();

        if (singleAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const decodeCtx = audioEngine.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const decodedBuffer = await new Promise((resolve, reject) => {
          decodeCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        });

        if (singleAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        let bufferToProcess = decodedBuffer;
        if (startSec > 0 || (endSec !== null && endSec < decodedBuffer.duration)) {
          bufferToProcess = trimAudioBuffer(decodeCtx, decodedBuffer, startSec, endSec);
        }

        let finalBuffer = bufferToProcess;
        if (applyEffects) {
          const currentSettings = {
            ...state.audioSettings,
            volume: 1.0,
            eq: { ...(state.audioSettings.eq || {}) },
            eqBands: Array.isArray(state.audioSettings.eqBands) ? [...state.audioSettings.eqBands] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          };
          finalBuffer = await audioEngine.renderOffline(bufferToProcess, currentSettings);
        }

        if (singleAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const wavBlob = audioBufferToWav(finalBuffer);

        if (singleAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        // Original means the file as it came, which a song with effects can't be: it's saved lossless instead
        const encodeFormat = selectedFormat === 'original' ? 'flac' : selectedFormat;
        const encodeUrl = `http://127.0.0.1:${state.serverPort}/api/encode?title=${encodeURIComponent(t.title || 'untitled')}&artist=${encodeURIComponent(t.artist || 'unknown artist')}&format=${encodeFormat}&quality=${selectedQuality}&id=${encodeURIComponent(t.id || '')}${tagQuery(t, null)}`;
        const resEncode = await fetch(encodeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wavBlob,
          signal: singleAbort.signal
        });
        const textEncode = await resEncode.text();
        let dataEncode;
        try {
          dataEncode = JSON.parse(textEncode);
        } catch (e) {
          throw new Error(textEncode || 'Server error');
        }
        if (!dataEncode.success) throw new Error(dataEncode.error || 'Failed to encode');

        offlineChanged(t, true);
        showToast(Tm('Download complete: saved to {0}', `${dataEncode.directory ? dataEncode.directory + '/' : ''}${dataEncode.filename}`), 'info');
        if (el.downloadModal && downloadAbort === singleAbort) closeModal(el.downloadModal);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('Download error:', err);
        if (isPhoneApp && trackToDownload === t) {
          // the dialog stays open with the reason, and its button tries again
          singleFailed = true;
          setDownloadProgress({ text: message, error: true });
        } else {
          showToast(Tm('Download failed: {0}', message), 'error');
        }
      } finally {
        // cancelled (Cancel already reset the dialog) or replaced by a newer download: leave its state alone
        if (downloadAbort === singleAbort) {
          downloadAbort = null;
          const curSpinner = el.downloadSpinner || document.getElementById('download-spinner');
          if (curSpinner) curSpinner.innerHTML = '';
          if (el.btnConfirmDownload) {
            el.btnConfirmDownload.style.display = '';
            el.btnConfirmDownload.disabled = false;
          }
          setDownloadRunning(false);
          updateDownloadBtnLabel();
        }
        startNextDownload();
      }
    });
  }

  const btnDownloadPlaylist = document.getElementById('btn-download-playlist');
  if (btnDownloadPlaylist) {
    btnDownloadPlaylist.addEventListener('click', () => {
      const pl = (state.playlists || []).find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      openDownloadAllModal(pl);
    });
  }
  // downloaded songs play straight from the device: no waiting for them to load
  const btnDownloadFavorites = document.getElementById('btn-download-favorites');
  if (btnDownloadFavorites) {
    btnDownloadFavorites.addEventListener('click', () => {
      openDownloadAllModal({ name: 'Favorites', key: 'favorites', tracks: sortTracksFor('favorites', state.favorites || []) }, 'Download favorites');
    });
  }
  const btnMultiDownload = document.getElementById('multi-select-download');
  if (btnMultiDownload) {
    btnMultiDownload.addEventListener('click', () => {
      const tracks = [...multiSel.tracks.values()];
      if (!tracks.length) return;
      const key = 'sel:' + tracks.map((/** @type {UrielTrack} */ t) => t.id).join(',');
      openDownloadAllModal({ key, name: multiSel.context === 'favorites' ? 'Favorites' : ((state.playlists || []).find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId) || {}).name || 'Songs', tracks },
        `Download ${tracks.length} song${tracks.length === 1 ? '' : 's'}`);
    });
  }

  /** @type {UrielDownloadsPart} */
  const api = {
    openDownloadModal, openDownloadAllModal, updateDownloadCaptionPath, downloadedInFolder,
    getTrackToDownload: () => trackToDownload,
  };
  Object.assign(out, api);
};
