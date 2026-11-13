// @ts-check
// Importing music from elsewhere: Spotify (a link, the export files or a login), Apple Music (a link or the export
// files), the YouTube sign-in for importing from YouTube Music, and import by link (Yandex and others). Part of
// app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
window.UrielApp.imports = function ({ normalizeImportText, state, pool, escapeHtml, T, openModal, closeModal, getTrackCanonicalId, stampAddedAt, createWavyProgress, updateFavoritesBadge, updateFavoriteIcon, renderFavoritesView, createPlaylist, showToast, renderPlaylistsList, I18N, Tm, isSameTrack, openPlaylistDetail, isFavoriteSong, importSharedPlaylist, setPlatform, el }, out) {
  Object.assign(out, {
    refreshYtSignin, matchSpotifyTracks,
  });

  const Core = window.UrielImportCore;
  const { normalizeForMatch, parseAppleExportCSV, parseAppleExportJSON } = Core;

  // the artist has to match as well as the title, covers / live / sped-up uploads lose (#18; track-match.js)
  const pickBestMatch = (sp, results) => window.trackMatch.pickBestMatch(sp, results);

  async function matchSpotifyTracks(list, onProgress) {
    const total = Array.isArray(list) ? list.length : 0;
    let completed = 0;
    let errorCount = 0;
    let nomatchCount = 0;
    let aborted = false;
    const errorMap = {};

    if (typeof onProgress === 'function') onProgress(0, total);

    async function searchCandidates(q, plat = state.platform || 'youtube') {
      const sRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(q)}&platform=${plat}&limit=8`);
      const sData = await sRes.json();
      if (sData && sData.success && Array.isArray(sData.tracks)) {
        return sData.tracks.slice(0, 8);
      }
      throw new Error((sData && sData.error) || `Status ${sRes.status}`);
    }

    const results = await pool(list || [], 6, async (t) => {
      if (aborted) return null;
      let matched = null;
      let lastErr = null;
      let hadCandidates = false;

      // YouTube Music's song results (artist-tagged official audio) first, then the chosen source
      const plat = state.platform || 'youtube';
      const platforms = plat === 'soundcloud' ? ['soundcloud'] : Array.from(new Set(['ytmusic', plat]));
      const queries = window.trackMatch.matchQueries(t);
      const q1 = queries[0] || '';
      outer: for (const p of platforms) {
        for (const q of queries) {
          if (aborted) break outer;
          try {
            const r = await searchCandidates(q, p);
            hadCandidates = true;
            matched = pickBestMatch(t, r);
            if (matched) break outer;
          } catch (e) {
            lastErr = e.message || String(e);
          }
        }
      }

      const fullText = `${t.artist || ''} ${t.title || ''}`;
      if (!matched && !aborted && /[а-яёіїєґ]/i.test(fullText)) {
        const q3 = normalizeForMatch(fullText);
        if (q3 && q3 !== q1) {
          try {
            const r3 = await searchCandidates(q3);
            hadCandidates = true;
            matched = pickBestMatch(t, r3);
          } catch (e) {
            lastErr = e.message || String(e);
          }
        }
      }

      completed++;
      if (!matched) {
        if (!hadCandidates && lastErr) {
          errorCount++;
          errorMap[lastErr] = (errorMap[lastErr] || 0) + 1;
        } else {
          nomatchCount++;
        }
      }

      if (completed <= 8 && completed === errorCount) {
        if (completed === 8) {
          aborted = true;
        }
      }

      if (typeof onProgress === 'function') onProgress(completed, total);
      return matched;
    });

    if (aborted) {
      throw new Error('search_unresponsive');
    }

    let commonError = '';
    let maxErrCount = 0;
    for (const [k, v] of Object.entries(errorMap)) {
      if (v > maxErrCount) {
        maxErrCount = v;
        commonError = k;
      }
    }

    const matchedTracks = results.filter(Boolean);
    matchedTracks.failStats = {
      errors: errorCount,
      nomatch: nomatchCount,
      commonError
    };
    return matchedTracks;
  }

  const spotifyModal = /** @type {any} */ (document.getElementById('spotify-import-modal'));
  const btnOpenSpotifyImport = /** @type {any} */ (document.getElementById('btn-open-spotify-import'));
  const btnCancelSpotifyImport = /** @type {any} */ (document.getElementById('btn-cancel-spotify-import'));
  const btnConfirmSpotifyImport = /** @type {any} */ (document.getElementById('btn-confirm-spotify-import'));
  const spotifyImportUrl = /** @type {any} */ (document.getElementById('spotify-import-url'));
  const spotifyImportTarget = /** @type {any} */ (document.getElementById('spotify-import-target'));
  const spotifyTargetDropdown = /** @type {any} */ (document.getElementById('spotify-target-dropdown'));
  const spotifyTargetTrigger = /** @type {any} */ (document.getElementById('spotify-target-trigger'));
  const spotifyTargetLabel = /** @type {any} */ (document.getElementById('spotify-target-label'));
  const spotifyTargetMenu = /** @type {any} */ (document.getElementById('spotify-target-menu'));
  const spotifyProgressWrap = /** @type {any} */ (document.getElementById('spotify-import-progress-wrap'));
  const spotifyWavyContainer = /** @type {any} */ (document.getElementById('spotify-import-wavy-container'));
  const spotifyProgressLabel = /** @type {any} */ (document.getElementById('spotify-import-progress-label'));
  const spotifyStatus = /** @type {any} */ (document.getElementById('spotify-import-status'));
  const spotifyLinkError = /** @type {any} */ (document.getElementById('spotify-link-error'));
  const spotifyBtnIcon = /** @type {any} */ (document.getElementById('spotify-import-btn-icon'));
  const spotifyBtnText = /** @type {any} */ (document.getElementById('spotify-import-btn-text'));

  const spModesContainer = /** @type {any} */ (document.getElementById('sp-modes'));
  const btnSpPickFiles = /** @type {any} */ (document.getElementById('btn-sp-pick-files'));
  const spFileInput = /** @type {any} */ (document.getElementById('sp-file-input'));
  const spFileInfo = /** @type {any} */ (document.getElementById('sp-file-info'));
  const spChkLikes = /** @type {any} */ (document.getElementById('sp-chk-likes'));
  const spChkPlaylists = /** @type {any} */ (document.getElementById('sp-chk-playlists'));
  const spClientIdInput = /** @type {any} */ (document.getElementById('sp-client-id'));
  const btnSpLogin = /** @type {any} */ (document.getElementById('btn-sp-login'));
  const spRedirectUri = /** @type {any} */ (document.getElementById('sp-redirect-uri'));
  const spLoginStatus = /** @type {any} */ (document.getElementById('sp-login-status'));
  const spChkLikes2 = /** @type {any} */ (document.getElementById('sp-chk-likes-2'));
  const spChkPlaylists2 = /** @type {any} */ (document.getElementById('sp-chk-playlists-2'));
  let currentSpotifyImportMode = 'link';
  let parsedSpotifyExport = { likes: [], playlists: [] };
  let spLoginPollTimer = null;
  let spotifyConnected = false;
  const spotifyHeaders = { 'X-Uriel-Token': window.electronAPI?.serverToken || '' };

  async function checkSpotifyAuthStatus() {
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/spotify-status`, { headers: spotifyHeaders });
      const data = await res.json();
      spotifyConnected = !!data.connected;
      if (spLoginStatus) {
        if (spotifyConnected) {
          spLoginStatus.textContent = data.error ? `Connected · ${data.error}` : 'Connected';
          spLoginStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
        } else {
          spLoginStatus.textContent = data.error || 'Not connected';
          spLoginStatus.style.color = data.error ? 'var(--md-sys-color-error, #ba1a1a)' : 'var(--md-sys-color-outline)';
        }
      }
      if (currentSpotifyImportMode === 'login' && btnConfirmSpotifyImport && btnConfirmSpotifyImport.dataset.action !== 'done') {
        btnConfirmSpotifyImport.disabled = !spotifyConnected;
      }
    } catch (e) {}
  }

  const IMPORT_ICONS = {
    lock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    search: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    network: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
    restricted: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    unknown: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  // what went wrong, with its picture (import-core.js decides which)
  function classifyImportError(provider, statusOrError, body) {
    const info = Core.classifyImportError(provider, statusOrError, body, navigator.onLine);
    return { ...info, icon: IMPORT_ICONS[info.icon] };
  }

  function showImportError(containerEl, errInfo) {
    if (!containerEl) return;
    containerEl.innerHTML = `
      <div class="import-error-icon">${errInfo.icon}</div>
      <div class="import-error-content">
        <div class="import-error-title">${escapeHtml(T(errInfo.title))}</div>
        <div class="import-error-hint">${escapeHtml(errInfo.hint ? T(errInfo.hint) : '')}</div>
      </div>
    `;
    containerEl.classList.remove('hidden');
  }

  function clearImportError(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    containerEl.classList.add('hidden');
  }

  function setSpotifyImportMode(mode) {
    currentSpotifyImportMode = mode || 'link';
    if (spModesContainer) {
      spModesContainer.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === currentSpotifyImportMode);
      });
    }
    clearImportError(spotifyLinkError);
    if (spotifyModal) {
      spotifyModal.querySelectorAll('.sp-pane').forEach(pane => {
        pane.classList.toggle('hidden', pane.dataset.mode !== currentSpotifyImportMode);
      });
    }
    if (spotifyStatus) {
      spotifyStatus.classList.add('hidden');
      spotifyStatus.textContent = '';
      spotifyStatus.style.color = '';
    }
    if (currentSpotifyImportMode === 'login') {
      checkSpotifyAuthStatus();
    } else {
      if (btnConfirmSpotifyImport && btnConfirmSpotifyImport.dataset.action !== 'done') {
        btnConfirmSpotifyImport.disabled = false;
      }
    }
  }

  if (spModesContainer) {
    spModesContainer.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        setSpotifyImportMode(btn.dataset.mode);
      });
    });
  }

  if (spClientIdInput) {
    const savedId = localStorage.getItem('uriel_spotify_client_id') || '';
    spClientIdInput.value = savedId;
    if (btnSpLogin) {
      btnSpLogin.disabled = !/^[a-f0-9]{32}$/i.test(savedId.trim());
    }
    spClientIdInput.addEventListener('input', () => {
      const val = spClientIdInput.value.trim();
      localStorage.setItem('uriel_spotify_client_id', val);
      if (btnSpLogin) {
        btnSpLogin.disabled = !/^[a-f0-9]{32}$/i.test(val);
      }
    });
  }

  if (btnSpLogin) {
    btnSpLogin.addEventListener('click', async () => {
      const clientId = spClientIdInput ? spClientIdInput.value.trim() : '';
      if (!/^[a-f0-9]{32}$/i.test(clientId)) {
        if (spLoginStatus) {
          spLoginStatus.textContent = 'Invalid Client ID';
          spLoginStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        }
        return;
      }

      if (spLoginStatus) {
        spLoginStatus.textContent = 'Starting login...';
        spLoginStatus.style.color = 'var(--md-sys-color-on-surface-variant)';
      }

      try {
        const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/spotify-auth-start?clientId=${encodeURIComponent(clientId)}`, { headers: spotifyHeaders });
        const data = await res.json();
        if (!data.success) {
          if (spLoginStatus) {
            spLoginStatus.textContent = data.error || 'Failed to start auth';
            spLoginStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
          }
          return;
        }

        if (spRedirectUri && data.redirectUri) {
          spRedirectUri.textContent = data.redirectUri;
        }

        if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
          window.electronAPI.openExternal(data.url);
        } else {
          window.open(data.url, '_blank');
        }

        if (spLoginStatus) {
          spLoginStatus.textContent = 'Waiting for login in browser...';
          spLoginStatus.style.color = 'var(--md-sys-color-on-surface-variant)';
        }

        if (spLoginPollTimer) clearInterval(spLoginPollTimer);
        let elapsed = 0;
        spLoginPollTimer = setInterval(async () => {
          elapsed += 2000;
          if (elapsed > 180000) {
            clearInterval(spLoginPollTimer);
            spLoginPollTimer = null;
            if (spLoginStatus) {
              spLoginStatus.textContent = 'Login timed out';
              spLoginStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
            }
            return;
          }
          try {
            const sRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/spotify-status`, { headers: spotifyHeaders });
            const sData = await sRes.json();
            if (sData.connected) {
              clearInterval(spLoginPollTimer);
              spLoginPollTimer = null;
              spotifyConnected = true;
              if (spLoginStatus) {
                spLoginStatus.textContent = sData.error ? `Connected · ${sData.error}` : 'Connected';
                spLoginStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
              }
              if (currentSpotifyImportMode === 'login' && btnConfirmSpotifyImport) {
                btnConfirmSpotifyImport.disabled = false;
              }
            } else if (sData.error) {
              clearInterval(spLoginPollTimer);
              spLoginPollTimer = null;
              if (spLoginStatus) {
                spLoginStatus.textContent = sData.error;
                spLoginStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
              }
              return;
            }
          } catch (e) {}
        }, 2000);
      } catch (err) {
        if (spLoginStatus) {
          spLoginStatus.textContent = err.message || 'Error connecting to server';
          spLoginStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        }
      }
    });
  }

  if (btnSpPickFiles && spFileInput) {
    btnSpPickFiles.addEventListener('click', () => spFileInput.click());
    spFileInput.addEventListener('change', async () => {
      parsedSpotifyExport = { likes: [], playlists: [] };
      const files = Array.from(spFileInput.files || []);
      if (!files.length) {
        if (spFileInfo) spFileInfo.textContent = 'No files selected';
        return;
      }
      const names = [];
      for (const file of files) {
        names.push(file.name);
        try {
          const text = await file.text();
          const got = Core.parseSpotifyExport(JSON.parse(text));
          parsedSpotifyExport.likes.push(...got.likes);
          parsedSpotifyExport.playlists.push(...got.playlists);
        } catch (e) {}
      }
      parsedSpotifyExport.likes = Core.uniqueSongs(parsedSpotifyExport.likes);
      if (spFileInfo) spFileInfo.textContent = names.join(', ');
    });
  }

  if (spotifyTargetTrigger && spotifyTargetDropdown) {
    spotifyTargetTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      spotifyTargetDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      spotifyTargetDropdown.classList.remove('open');
    });
  }

  function openSpotifyImportModal() {
    if (!spotifyModal) return;
    if (spLoginPollTimer) { clearInterval(spLoginPollTimer); spLoginPollTimer = null; }
    setSpotifyImportMode('link');
    parsedSpotifyExport = { likes: [], playlists: [] };
    if (spFileInput) spFileInput.value = '';
    if (spFileInfo) spFileInfo.textContent = 'No files selected';
    if (spChkLikes) { spChkLikes.checked = true; spChkLikes.disabled = false; }
    if (spChkPlaylists) { spChkPlaylists.checked = true; spChkPlaylists.disabled = false; }
    if (spChkLikes2) { spChkLikes2.checked = true; spChkLikes2.disabled = false; }
    if (spChkPlaylists2) { spChkPlaylists2.checked = true; spChkPlaylists2.disabled = false; }
    if (btnSpPickFiles) btnSpPickFiles.disabled = false;
    const savedId = localStorage.getItem('uriel_spotify_client_id') || '';
    if (spClientIdInput) spClientIdInput.value = savedId;
    if (btnSpLogin) btnSpLogin.disabled = !/^[a-f0-9]{32}$/i.test(savedId.trim());
    if (spRedirectUri) spRedirectUri.textContent = `http://127.0.0.1:${state.serverPort || 38472}/api/spotify-callback`;
    if (spotifyImportUrl) {
      spotifyImportUrl.value = '';
      spotifyImportUrl.disabled = false;
    }
    clearImportError(spotifyLinkError);
    if (spotifyTargetTrigger) spotifyTargetTrigger.disabled = false;
    if (spotifyImportTarget) {
      spotifyImportTarget.disabled = false;
      spotifyImportTarget.innerHTML = '<option value="new">New playlist (Spotify name)</option>';
      state.playlists.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        spotifyImportTarget.appendChild(opt);
      });
      spotifyImportTarget.value = 'new';
    }
    if (spotifyTargetMenu) {
      spotifyTargetMenu.innerHTML = '<button class="m3-dropdown-option selected" data-value="new" type="button">New playlist (Spotify name)</button>';
      if (spotifyTargetLabel) spotifyTargetLabel.textContent = 'New playlist (Spotify name)';
      state.playlists.forEach(p => {
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'm3-dropdown-option';
        opt.dataset.value = p.id;
        opt.textContent = p.name || 'untitled';
        spotifyTargetMenu.appendChild(opt);
      });
      spotifyTargetMenu.querySelectorAll('.m3-dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          if (spotifyImportTarget) spotifyImportTarget.value = val;
          if (spotifyTargetLabel) spotifyTargetLabel.textContent = opt.textContent;
          spotifyTargetMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          if (spotifyTargetDropdown) spotifyTargetDropdown.classList.remove('open');
        });
      });
    }
    if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
    if (spotifyWavyContainer) spotifyWavyContainer.innerHTML = '';
    if (spotifyStatus) {
      spotifyStatus.classList.add('hidden');
      spotifyStatus.textContent = '';
      spotifyStatus.style.color = '';
    }
    if (btnConfirmSpotifyImport) {
      btnConfirmSpotifyImport.disabled = false;
      if (spotifyBtnIcon) spotifyBtnIcon.classList.remove('hidden');
      if (spotifyBtnText) spotifyBtnText.textContent = 'Import from Spotify';
      btnConfirmSpotifyImport.dataset.action = 'import';
    }
    if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
    openModal(spotifyModal);
    if (spotifyImportUrl) spotifyImportUrl.focus();
  }

  function closeSpotifyImportModal() {
    if (spLoginPollTimer) { clearInterval(spLoginPollTimer); spLoginPollTimer = null; }
    if (spotifyModal) closeModal(spotifyModal);
  }

  const importErrorText = (err, fallback = 'Failed to import tracks') => (err && err.message === 'search_unresponsive'
    ? 'Search is not responding, so the import stopped. Try again later; nothing gets added twice. If it keeps happening, open Settings -> About -> Copy diagnostics and send it with your report.'
    : (err && err.message) || fallback);

  // adds the songs that aren't favorites yet (one pass with a Set; comparing every pair froze big imports)
  function mergeIntoFavorites(tracks) {
    const have = new Set(state.favorites.map(getTrackCanonicalId));
    let added = 0;
    for (const track of tracks || []) {
      const id = getTrackCanonicalId(track);
      if (have.has(id)) continue;
      have.add(id);
      state.favorites.push(stampAddedAt(track));
      added++;
    }
    return added;
  }

  async function runSpotifyImport({ likes = [], playlists = [], skippedPlaylists = [] }) {
    const likesToImport = likes || [];
    const playlistsToImport = playlists || [];
    const totalItemsCount = likesToImport.length + playlistsToImport.reduce((acc, p) => acc + (p.tracks ? p.tracks.length : 0), 0);

    if (totalItemsCount === 0) {
      if (spotifyStatus) {
        spotifyStatus.textContent = 'No tracks found to import';
        spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        spotifyStatus.classList.remove('hidden');
      }
      return;
    }

    if (spotifyStatus) spotifyStatus.classList.add('hidden');
    if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = true;
    if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = true;
    if (btnSpPickFiles) btnSpPickFiles.disabled = true;
    if (btnSpLogin) btnSpLogin.disabled = true;
    if (spChkLikes) spChkLikes.disabled = true;
    if (spChkPlaylists) spChkPlaylists.disabled = true;
    if (spChkLikes2) spChkLikes2.disabled = true;
    if (spChkPlaylists2) spChkPlaylists2.disabled = true;

    if (spotifyProgressWrap) spotifyProgressWrap.classList.remove('hidden');
    if (spotifyProgressLabel) spotifyProgressLabel.textContent = `0 / ${totalItemsCount}`;
    const wavy = spotifyWavyContainer ? createWavyProgress(spotifyWavyContainer) : { set() {} };
    wavy.set(0);

    if (totalItemsCount > 2000 && spotifyStatus) {
      spotifyStatus.textContent = `This will take a while (${totalItemsCount} tracks)`;
      spotifyStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
      spotifyStatus.classList.remove('hidden');
    }


    let globalCompleted = 0;
    let totalFoundCount = 0;
    try {
      if (likesToImport.length > 0) {
        const foundLikes = await matchSpotifyTracks(likesToImport, (completed) => {
          const cur = globalCompleted + completed;
          wavy.set(Math.round((cur / totalItemsCount) * 100));
          if (spotifyProgressLabel) spotifyProgressLabel.textContent = `${cur} / ${totalItemsCount}`;
        });
        globalCompleted += likesToImport.length;
        totalFoundCount += foundLikes.length;
        const addedFav = mergeIntoFavorites(foundLikes) > 0;
        if (addedFav) {
          localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
          updateFavoritesBadge();
          updateFavoriteIcon();
          if (state.currentView === 'favorites') renderFavoritesView();
        }
      }

      if (playlistsToImport.length > 0) {
        // match every playlist before creating any: a failure half way left some behind, and a retry made them twice
        const matched = [];
        for (const pl of playlistsToImport) {
          const found = await matchSpotifyTracks(pl.tracks || [], (completed) => {
            const cur = globalCompleted + completed;
            wavy.set(Math.round((cur / totalItemsCount) * 100));
            if (spotifyProgressLabel) spotifyProgressLabel.textContent = `${cur} / ${totalItemsCount}`;
          });
          globalCompleted += (pl.tracks || []).length;
          totalFoundCount += found.length;
          matched.push([pl, found]);
        }
        matched.forEach(([pl, found]) => createPlaylist(pl.name, found, pl.cover || ''));
      }

      const notFound = totalItemsCount - totalFoundCount;
      if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
      const finishMsg = (notFound > 0
        ? `Imported ${totalFoundCount} tracks (${notFound} skipped)`
        : `Imported ${totalFoundCount} tracks`) + (skippedPlaylists.length ? `; ${skippedPlaylists.length} Spotify playlists unavailable` : '');
      if (spotifyStatus) {
        spotifyStatus.textContent = finishMsg;
        spotifyStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
        spotifyStatus.classList.remove('hidden');
      }
      if (typeof showToast === 'function') showToast(finishMsg, 'success');

      if (btnConfirmSpotifyImport) {
        btnConfirmSpotifyImport.disabled = false;
        if (spotifyBtnIcon) spotifyBtnIcon.classList.add('hidden');
        if (spotifyBtnText) spotifyBtnText.textContent = 'Done';
        btnConfirmSpotifyImport.dataset.action = 'done';
      }
      if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
    } catch (err) {
      if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
      if (spotifyStatus) {
        spotifyStatus.textContent = importErrorText(err);
        spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        spotifyStatus.classList.remove('hidden');
      }
      if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
      if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
    } finally {
      if (btnSpPickFiles) btnSpPickFiles.disabled = false;
      if (btnSpLogin && spClientIdInput) btnSpLogin.disabled = !/^[a-f0-9]{32}$/i.test(spClientIdInput.value.trim());
      if (spChkLikes) spChkLikes.disabled = false;
      if (spChkPlaylists) spChkPlaylists.disabled = false;
      if (spChkLikes2) spChkLikes2.disabled = false;
      if (spChkPlaylists2) spChkPlaylists2.disabled = false;
    }
  }

  async function handleSpotifyFileImport() {
    const doLikes = !!(spChkLikes && spChkLikes.checked);
    const doPlaylists = !!(spChkPlaylists && spChkPlaylists.checked);

    if (!doLikes && !doPlaylists) {
      if (spotifyStatus) {
        spotifyStatus.textContent = 'Select at least Liked songs or Playlists';
        spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        spotifyStatus.classList.remove('hidden');
      }
      return;
    }

    const likesToImport = doLikes ? (parsedSpotifyExport.likes || []) : [];
    const playlistsToImport = doPlaylists ? (parsedSpotifyExport.playlists || []) : [];
    if (!likesToImport.length && !playlistsToImport.length) {
      if (spotifyStatus) {
        spotifyStatus.textContent = 'No tracks found in the selected files';
        spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        spotifyStatus.classList.remove('hidden');
      }
      return;
    }
    await runSpotifyImport({ likes: likesToImport, playlists: playlistsToImport });
  }

  async function handleSpotifyLoginImport() {
    const doLikes = !!(spChkLikes2 && spChkLikes2.checked);
    const doPlaylists = !!(spChkPlaylists2 && spChkPlaylists2.checked);

    if (!doLikes && !doPlaylists) {
      if (spotifyStatus) {
        spotifyStatus.textContent = 'Select at least Liked songs or Playlists';
        spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        spotifyStatus.classList.remove('hidden');
      }
      return;
    }

    if (spotifyStatus) {
      spotifyStatus.textContent = 'Fetching Spotify library...';
      spotifyStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
      spotifyStatus.classList.remove('hidden');
    }
    if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = true;
    if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = true;

    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/spotify-library?likes=${doLikes ? 1 : 0}&playlists=${doPlaylists ? 1 : 0}`, { headers: spotifyHeaders });
      const data = await res.json();
      if (!data.success) {
        if (spotifyStatus) {
          spotifyStatus.textContent = data.error || 'Failed to fetch Spotify library';
          spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
          spotifyStatus.classList.remove('hidden');
        }
        if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
        if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
        return;
      }

      if (!(data.likes?.length || data.playlists?.some(pl => pl.tracks?.length))) {
        if (spotifyStatus) {
          spotifyStatus.textContent = data.partial
            ? `No available tracks to import. ${(data.skippedPlaylists || []).map(pl => `${pl.name}: ${pl.error}`).join('; ')}`
            : 'No tracks found in your Spotify library';
          spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
          spotifyStatus.classList.remove('hidden');
        }
        if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
        if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
        return;
      }
      if (data.partial) {
        const skipped = data.skippedPlaylists || [];
        const details = skipped.map(pl => `• ${pl.name}: ${pl.error}`).join('\n');
        if (!window.confirm(`${skipped.length} Spotify playlist(s) could not be read:\n${details}\n\nImport the available tracks only?`)) {
          if (spotifyStatus) {
            spotifyStatus.textContent = 'Partial import cancelled';
            spotifyStatus.classList.remove('hidden');
          }
          if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
          if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
          return;
        }
      }
      await runSpotifyImport({ likes: data.likes || [], playlists: data.playlists || [], skippedPlaylists: data.skippedPlaylists || [] });
    } catch (err) {
      if (spotifyStatus) {
        spotifyStatus.textContent = err.message || 'Failed to fetch Spotify library';
        spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
        spotifyStatus.classList.remove('hidden');
      }
      if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
      if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
    }
  }

  async function handleSpotifyImportAction() {
    if (btnConfirmSpotifyImport && btnConfirmSpotifyImport.dataset.action === 'done') {
      closeSpotifyImportModal();
      return;
    }

    if (currentSpotifyImportMode === 'file') {
      return handleSpotifyFileImport();
    }

    if (currentSpotifyImportMode === 'login') {
      return handleSpotifyLoginImport();
    }

    const url = spotifyImportUrl ? spotifyImportUrl.value.trim() : '';
    if (!url) {
      const errInfo = classifyImportError('spotify', 404, 'invalid spotify playlist url');
      showImportError(spotifyLinkError, errInfo);
      return;
    }

    clearImportError(spotifyLinkError);
    if (spotifyStatus) {
      spotifyStatus.classList.add('hidden');
      spotifyStatus.textContent = '';
    }
    if (spotifyImportUrl) spotifyImportUrl.disabled = true;
    if (spotifyImportTarget) spotifyImportTarget.disabled = true;
    if (spotifyTargetTrigger) spotifyTargetTrigger.disabled = true;
    if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = true;
    if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = true;

    if (spotifyProgressWrap) spotifyProgressWrap.classList.remove('hidden');
    if (spotifyProgressLabel) spotifyProgressLabel.textContent = '0 / 0';
    const wavy = spotifyWavyContainer ? createWavyProgress(spotifyWavyContainer) : { set() {} };
    wavy.set(0);

    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/spotify-import?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.tracks) || data.tracks.length === 0) {
        if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
        const errInfo = classifyImportError('spotify', res.status, data);
        showImportError(spotifyLinkError, errInfo);
        if (spotifyImportUrl) spotifyImportUrl.disabled = false;
        if (spotifyImportTarget) spotifyImportTarget.disabled = false;
        if (spotifyTargetTrigger) spotifyTargetTrigger.disabled = false;
        if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
        if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
        return;
      }

      const tracks = data.tracks;
      const total = tracks.length;
      if (spotifyProgressLabel) spotifyProgressLabel.textContent = `0 / ${total}`;

      let foundTracks;
      try {
        foundTracks = await matchSpotifyTracks(tracks, (completed, tot) => {
          wavy.set(Math.round((completed / tot) * 100));
          if (spotifyProgressLabel) spotifyProgressLabel.textContent = `${completed} / ${tot}`;
        });
      } catch (err) {
        if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
        const msg = importErrorText(err, 'Import failed');
        if (spotifyStatus) {
          spotifyStatus.textContent = msg;
          spotifyStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
          spotifyStatus.classList.remove('hidden');
        }
        if (typeof showToast === 'function') showToast(msg, 'error');
        if (spotifyImportUrl) spotifyImportUrl.disabled = false;
        if (spotifyImportTarget) spotifyImportTarget.disabled = false;
        if (spotifyTargetTrigger) spotifyTargetTrigger.disabled = false;
        if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
        if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
        return;
      }
      const notFound = total - foundTracks.length;

      const targetVal = spotifyImportTarget ? spotifyImportTarget.value : 'new';
      if (targetVal === 'new') {
        createPlaylist(data.name || 'Spotify Playlist', foundTracks, data.cover || '');
      } else {
        const pl = state.playlists.find(p => p.id === targetVal);
        if (pl) {
          if (!pl.cover && data.cover) pl.cover = data.cover;
          const existingIds = new Set(pl.tracks.map(t => t.id));
          const newTracks = foundTracks.filter(t => !existingIds.has(t.id));
          pl.tracks.push(...newTracks.map(stampAddedAt));
          localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
          renderPlaylistsList();
        }
      }

      if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
      let finishMsg = `Imported ${foundTracks.length} tracks.`;
      if (notFound > 0) {
        finishMsg = `Imported ${foundTracks.length} tracks. ${notFound} not found.`;
        const fs = foundTracks.failStats || {};
        if (fs.errors > notFound / 2 && fs.commonError) {
          finishMsg += ` Search errors: ${fs.commonError}`;
        }
      }
      if (window.__riffLogError) window.__riffLogError('INFO', 'Import summary: ' + finishMsg);
      if (spotifyStatus) {
        spotifyStatus.textContent = finishMsg;
        spotifyStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
        spotifyStatus.classList.remove('hidden');
      }
      if (typeof showToast === 'function') showToast(finishMsg, 'success');

      if (btnConfirmSpotifyImport) {
        btnConfirmSpotifyImport.disabled = false;
        if (spotifyBtnIcon) spotifyBtnIcon.classList.add('hidden');
        if (spotifyBtnText) spotifyBtnText.textContent = 'Done';
        btnConfirmSpotifyImport.dataset.action = 'done';
      }
      if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
    } catch (err) {
      if (spotifyProgressWrap) spotifyProgressWrap.classList.add('hidden');
      const errInfo = classifyImportError('spotify', err, err.message);
      showImportError(spotifyLinkError, errInfo);
      if (spotifyImportUrl) spotifyImportUrl.disabled = false;
      if (spotifyImportTarget) spotifyImportTarget.disabled = false;
      if (spotifyTargetTrigger) spotifyTargetTrigger.disabled = false;
      if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.disabled = false;
      if (btnCancelSpotifyImport) btnCancelSpotifyImport.disabled = false;
    }
  }

  if (btnOpenSpotifyImport) btnOpenSpotifyImport.addEventListener('click', openSpotifyImportModal);
  if (btnCancelSpotifyImport) btnCancelSpotifyImport.addEventListener('click', closeSpotifyImportModal);
  if (btnConfirmSpotifyImport) btnConfirmSpotifyImport.addEventListener('click', handleSpotifyImportAction);
  if (spotifyImportUrl) {
    spotifyImportUrl.addEventListener('input', () => clearImportError(spotifyLinkError));
    spotifyImportUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSpotifyImportAction();
      }
    });
  }

  const appleModal = /** @type {any} */ (document.getElementById('apple-import-modal'));
  const btnOpenAppleImport = /** @type {any} */ (document.getElementById('btn-open-apple-import'));
  const btnCancelAppleImport = /** @type {any} */ (document.getElementById('btn-cancel-apple-import'));
  const btnConfirmAppleImport = /** @type {any} */ (document.getElementById('btn-confirm-apple-import'));
  const appleImportUrl = /** @type {any} */ (document.getElementById('apple-import-url'));
  const appleLinkError = /** @type {any} */ (document.getElementById('apple-link-error'));
  const appleImportTarget = /** @type {any} */ (document.getElementById('apple-import-target'));
  const appleTargetDropdown = /** @type {any} */ (document.getElementById('apple-target-dropdown'));
  const appleTargetTrigger = /** @type {any} */ (document.getElementById('apple-target-trigger'));
  const appleTargetLabel = /** @type {any} */ (document.getElementById('apple-target-label'));
  const appleTargetMenu = /** @type {any} */ (document.getElementById('apple-target-menu'));
  const appleModesContainer = /** @type {any} */ (document.getElementById('apple-modes'));
  const btnApplePickFiles = /** @type {any} */ (document.getElementById('btn-apple-pick-files'));
  const appleFileInput = /** @type {any} */ (document.getElementById('apple-file-input'));
  const appleFileInfo = /** @type {any} */ (document.getElementById('apple-file-info'));
  const appleChkContainer = /** @type {any} */ (document.getElementById('apple-chk-container'));
  const appleChkLikes = /** @type {any} */ (document.getElementById('apple-chk-likes'));
  const appleChkPlaylists = /** @type {any} */ (document.getElementById('apple-chk-playlists'));
  const appleFileSummary = /** @type {any} */ (document.getElementById('apple-file-summary'));
  const appleProgressWrap = /** @type {any} */ (document.getElementById('apple-import-progress-wrap'));
  const appleWavyContainer = /** @type {any} */ (document.getElementById('apple-import-wavy-container'));
  const appleProgressLabel = /** @type {any} */ (document.getElementById('apple-import-progress-label'));
  const appleStatus = /** @type {any} */ (document.getElementById('apple-import-status'));
  const appleBtnIcon = /** @type {any} */ (document.getElementById('apple-import-btn-icon'));
  const appleBtnText = /** @type {any} */ (document.getElementById('apple-import-btn-text'));

  let currentAppleImportMode = 'link';
  let parsedAppleExport = { likes: [], playlists: [] };

  function setAppleImportMode(mode) {
    currentAppleImportMode = mode || 'link';
    if (appleModesContainer) {
      appleModesContainer.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === currentAppleImportMode);
      });
    }
    clearImportError(appleLinkError);
    if (appleModal) {
      appleModal.querySelectorAll('.sp-pane').forEach(pane => {
        pane.classList.toggle('hidden', pane.dataset.mode !== currentAppleImportMode);
      });
    }
    if (appleStatus) {
      appleStatus.classList.add('hidden');
      appleStatus.textContent = '';
      appleStatus.style.color = '';
    }
    if (btnConfirmAppleImport && btnConfirmAppleImport.dataset.action !== 'done') {
      btnConfirmAppleImport.disabled = false;
    }
  }

  if (appleModesContainer) {
    appleModesContainer.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        setAppleImportMode(btn.dataset.mode);
      });
    });
  }

  if (btnApplePickFiles && appleFileInput) {
    btnApplePickFiles.addEventListener('click', () => {
      appleFileInput.click();
    });

    appleFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      parsedAppleExport = { likes: [], playlists: [] };
      const names = [];
      for (const file of files) {
        names.push(file.name);
        try {
          const text = await file.text();
          if (file.name.toLowerCase().endsWith('.json')) {
            const json = JSON.parse(text);
            const res = parseAppleExportJSON(json);
            parsedAppleExport.likes.push(...res.likes);
            parsedAppleExport.playlists.push(...res.playlists);
          } else {
            const res = parseAppleExportCSV(text);
            parsedAppleExport.likes.push(...res.likes);
            parsedAppleExport.playlists.push(...res.playlists);
          }
        } catch (err) {}
      }
      if (appleFileInfo) appleFileInfo.textContent = names.join(', ');

      const hasLikes = parsedAppleExport.likes.length > 0;
      const hasPlaylists = parsedAppleExport.playlists.length > 0;

      if (hasLikes && hasPlaylists) {
        if (appleChkContainer) appleChkContainer.classList.remove('hidden');
        if (appleChkLikes) { appleChkLikes.checked = true; appleChkLikes.disabled = false; }
        if (appleChkPlaylists) { appleChkPlaylists.checked = true; appleChkPlaylists.disabled = false; }
        if (appleFileSummary) {
          appleFileSummary.classList.remove('hidden');
          appleFileSummary.textContent = `Found ${parsedAppleExport.likes.length} liked songs and ${parsedAppleExport.playlists.length} playlists`;
        }
      } else {
        if (appleChkContainer) appleChkContainer.classList.add('hidden');
        if (appleFileSummary) {
          appleFileSummary.classList.remove('hidden');
          if (hasPlaylists) {
            const totalTracks = parsedAppleExport.playlists.reduce((acc, p) => acc + (p.tracks ? p.tracks.length : 0), 0);
            appleFileSummary.textContent = `Found ${parsedAppleExport.playlists.length} playlists (${totalTracks} tracks)`;
          } else if (hasLikes) {
            appleFileSummary.textContent = `Found ${parsedAppleExport.likes.length} liked tracks`;
          } else {
            appleFileSummary.textContent = 'No tracks found in selected files';
          }
        }
      }
    });
  }

  if (appleTargetTrigger && appleTargetDropdown) {
    appleTargetTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      appleTargetDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      appleTargetDropdown.classList.remove('open');
    });
  }

  function openAppleImportModal() {
    if (!appleModal) return;
    setAppleImportMode('link');
    parsedAppleExport = { likes: [], playlists: [] };
    if (appleFileInput) appleFileInput.value = '';
    if (appleFileInfo) appleFileInfo.textContent = 'No files selected';
    if (appleChkContainer) appleChkContainer.classList.add('hidden');
    if (appleChkLikes) { appleChkLikes.checked = true; appleChkLikes.disabled = false; }
    if (appleChkPlaylists) { appleChkPlaylists.checked = true; appleChkPlaylists.disabled = false; }
    if (appleFileSummary) { appleFileSummary.classList.add('hidden'); appleFileSummary.textContent = ''; }
    if (btnApplePickFiles) btnApplePickFiles.disabled = false;
    if (appleImportUrl) {
      appleImportUrl.value = '';
      appleImportUrl.disabled = false;
    }
    clearImportError(appleLinkError);
    if (appleTargetTrigger) appleTargetTrigger.disabled = false;
    if (appleImportTarget) {
      appleImportTarget.disabled = false;
      appleImportTarget.innerHTML = '<option value="new">New playlist (Apple Music name)</option>';
      state.playlists.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        appleImportTarget.appendChild(opt);
      });
      appleImportTarget.value = 'new';
    }
    if (appleTargetMenu) {
      appleTargetMenu.innerHTML = '<button class="m3-dropdown-option selected" data-value="new" type="button">New playlist (Apple Music name)</button>';
      if (appleTargetLabel) appleTargetLabel.textContent = 'New playlist (Apple Music name)';
      state.playlists.forEach(p => {
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'm3-dropdown-option';
        opt.dataset.value = p.id;
        opt.textContent = p.name || 'untitled';
        appleTargetMenu.appendChild(opt);
      });
      appleTargetMenu.querySelectorAll('.m3-dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          if (appleImportTarget) appleImportTarget.value = val;
          if (appleTargetLabel) appleTargetLabel.textContent = opt.textContent;
          appleTargetMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          if (appleTargetDropdown) appleTargetDropdown.classList.remove('open');
        });
      });
    }
    if (appleProgressWrap) appleProgressWrap.classList.add('hidden');
    if (appleWavyContainer) appleWavyContainer.innerHTML = '';
    if (appleStatus) {
      appleStatus.classList.add('hidden');
      appleStatus.textContent = '';
      appleStatus.style.color = '';
    }
    if (btnConfirmAppleImport) {
      btnConfirmAppleImport.disabled = false;
      if (appleBtnIcon) appleBtnIcon.classList.remove('hidden');
      if (appleBtnText) appleBtnText.textContent = 'Import from Apple Music';
      btnConfirmAppleImport.dataset.action = 'import';
    }
    if (btnCancelAppleImport) btnCancelAppleImport.disabled = false;
    openModal(appleModal);
    if (appleImportUrl) appleImportUrl.focus();
  }

  function closeAppleImportModal() {
    if (appleModal) closeModal(appleModal);
  }

  async function handleAppleImportAction() {
    if (btnConfirmAppleImport && btnConfirmAppleImport.dataset.action === 'done') {
      closeAppleImportModal();
      return;
    }

    if (currentAppleImportMode === 'file') {
      const hasLikes = parsedAppleExport.likes.length > 0;
      const hasPlaylists = parsedAppleExport.playlists.length > 0;
      let likesToImport = [];
      let playlistsToImport = [];

      if (hasLikes && hasPlaylists) {
        if (appleChkLikes && appleChkLikes.checked) likesToImport = parsedAppleExport.likes;
        if (appleChkPlaylists && appleChkPlaylists.checked) playlistsToImport = parsedAppleExport.playlists;
      } else if (hasPlaylists) {
        playlistsToImport = parsedAppleExport.playlists;
      } else if (hasLikes) {
        likesToImport = parsedAppleExport.likes;
      }

      const totalItemsCount = likesToImport.length + playlistsToImport.reduce((acc, p) => acc + (p.tracks ? p.tracks.length : 0), 0);
      if (totalItemsCount === 0) {
        if (appleStatus) {
          appleStatus.textContent = 'No tracks selected or found to import';
          appleStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
          appleStatus.classList.remove('hidden');
        }
        return;
      }

      if (btnConfirmAppleImport) btnConfirmAppleImport.disabled = true;
      if (btnCancelAppleImport) btnCancelAppleImport.disabled = true;
      if (btnApplePickFiles) btnApplePickFiles.disabled = true;
      if (appleChkLikes) appleChkLikes.disabled = true;
      if (appleChkPlaylists) appleChkPlaylists.disabled = true;

      if (appleProgressWrap) appleProgressWrap.classList.remove('hidden');
      if (appleProgressLabel) appleProgressLabel.textContent = `0 / ${totalItemsCount}`;
      const wavy = appleWavyContainer ? createWavyProgress(appleWavyContainer) : { set() {} };
      wavy.set(0);


      let globalCompleted = 0;
      let totalFoundCount = 0;
      try {
        if (likesToImport.length > 0) {
          const foundLikes = await matchSpotifyTracks(likesToImport, (completed) => {
            const cur = globalCompleted + completed;
            wavy.set(Math.round((cur / totalItemsCount) * 100));
            if (appleProgressLabel) appleProgressLabel.textContent = `${cur} / ${totalItemsCount}`;
          });
          globalCompleted += likesToImport.length;
          totalFoundCount += foundLikes.length;
          const addedFav = mergeIntoFavorites(foundLikes) > 0;
          if (addedFav) {
            localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
            updateFavoritesBadge();
            updateFavoriteIcon();
            if (state.currentView === 'favorites') renderFavoritesView();
          }
        }

        if (playlistsToImport.length > 0) {
          // match every playlist before creating any (see the Spotify import)
          const matched = [];
          for (const pl of playlistsToImport) {
            const found = await matchSpotifyTracks(pl.tracks || [], (completed) => {
              const cur = globalCompleted + completed;
              wavy.set(Math.round((cur / totalItemsCount) * 100));
              if (appleProgressLabel) appleProgressLabel.textContent = `${cur} / ${totalItemsCount}`;
            });
            globalCompleted += (pl.tracks || []).length;
            totalFoundCount += found.length;
            matched.push([pl, found]);
          }
          matched.forEach(([pl, found]) => createPlaylist(pl.name, found, pl.cover || ''));
        }

        const notFound = totalItemsCount - totalFoundCount;
        if (appleProgressWrap) appleProgressWrap.classList.add('hidden');
        const finishMsg = notFound > 0
          ? `Imported ${totalFoundCount} tracks (${notFound} skipped)`
          : `Imported ${totalFoundCount} tracks`;
        if (appleStatus) {
          appleStatus.textContent = finishMsg;
          appleStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
          appleStatus.classList.remove('hidden');
        }
        if (typeof showToast === 'function') showToast(finishMsg, 'success');

        if (btnConfirmAppleImport) {
          btnConfirmAppleImport.disabled = false;
          if (appleBtnIcon) appleBtnIcon.classList.add('hidden');
          if (appleBtnText) appleBtnText.textContent = 'Done';
          btnConfirmAppleImport.dataset.action = 'done';
        }
        if (btnCancelAppleImport) btnCancelAppleImport.disabled = false;
      } catch (err) {
        if (appleProgressWrap) appleProgressWrap.classList.add('hidden');
        if (appleStatus) {
          appleStatus.textContent = importErrorText(err);
          appleStatus.style.color = 'var(--md-sys-color-error, #ba1a1a)';
          appleStatus.classList.remove('hidden');
        }
        if (btnConfirmAppleImport) btnConfirmAppleImport.disabled = false;
        if (btnCancelAppleImport) btnCancelAppleImport.disabled = false;
      } finally {
        if (btnApplePickFiles) btnApplePickFiles.disabled = false;
        if (appleChkLikes) appleChkLikes.disabled = false;
        if (appleChkPlaylists) appleChkPlaylists.disabled = false;
      }
      return;
    }

    const url = appleImportUrl ? appleImportUrl.value.trim() : '';
    if (!url) {
      const errInfo = classifyImportError('apple', 404, 'invalid apple music playlist url');
      showImportError(appleLinkError, errInfo);
      return;
    }

    clearImportError(appleLinkError);
    if (appleStatus) {
      appleStatus.classList.add('hidden');
      appleStatus.textContent = '';
    }
    if (appleImportUrl) appleImportUrl.disabled = true;
    if (appleImportTarget) appleImportTarget.disabled = true;
    if (appleTargetTrigger) appleTargetTrigger.disabled = true;
    if (btnConfirmAppleImport) btnConfirmAppleImport.disabled = true;
    if (btnCancelAppleImport) btnCancelAppleImport.disabled = true;

    if (appleProgressWrap) appleProgressWrap.classList.remove('hidden');
    if (appleProgressLabel) appleProgressLabel.textContent = '0 / 0';
    const wavy = appleWavyContainer ? createWavyProgress(appleWavyContainer) : { set() {} };
    wavy.set(0);

    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/apple-import?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.tracks) || data.tracks.length === 0) {
        if (appleProgressWrap) appleProgressWrap.classList.add('hidden');
        const errInfo = classifyImportError('apple', res.status, data);
        showImportError(appleLinkError, errInfo);
        if (appleImportUrl) appleImportUrl.disabled = false;
        if (appleImportTarget) appleImportTarget.disabled = false;
        if (appleTargetTrigger) appleTargetTrigger.disabled = false;
        if (btnConfirmAppleImport) btnConfirmAppleImport.disabled = false;
        if (btnCancelAppleImport) btnCancelAppleImport.disabled = false;
        return;
      }

      const tracks = data.tracks;
      const total = tracks.length;
      if (appleProgressLabel) appleProgressLabel.textContent = `0 / ${total}`;

      const foundTracks = await matchSpotifyTracks(tracks, (completed, tot) => {
        wavy.set(Math.round((completed / tot) * 100));
        if (appleProgressLabel) appleProgressLabel.textContent = `${completed} / ${tot}`;
      });
      const notFound = total - foundTracks.length;

      const targetVal = appleImportTarget ? appleImportTarget.value : 'new';
      if (targetVal === 'new') {
        createPlaylist(data.name || 'Apple Music Playlist', foundTracks, data.cover || '');
      } else {
        const pl = state.playlists.find(p => p.id === targetVal);
        if (pl) {
          if (!pl.cover && data.cover) pl.cover = data.cover;
          const existingIds = new Set(pl.tracks.map(t => t.id));
          const newTracks = foundTracks.filter(t => !existingIds.has(t.id));
          pl.tracks.push(...newTracks.map(stampAddedAt));
          localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
          renderPlaylistsList();
        }
      }

      if (appleProgressWrap) appleProgressWrap.classList.add('hidden');
      let finishMsg = notFound > 0
        ? `Imported ${foundTracks.length} tracks (${notFound} skipped)`
        : `Imported ${foundTracks.length} tracks`;
      if (data.hasMore) {
        finishMsg += `. Imported the first ${tracks.length} tracks. Use Export files to import everything.`;
      }
      if (appleStatus) {
        appleStatus.textContent = finishMsg;
        appleStatus.style.color = 'var(--md-sys-color-primary, #6750A4)';
        appleStatus.classList.remove('hidden');
      }
      if (typeof showToast === 'function') showToast(finishMsg, 'success');

      if (btnConfirmAppleImport) {
        btnConfirmAppleImport.disabled = false;
        if (appleBtnIcon) appleBtnIcon.classList.add('hidden');
        if (appleBtnText) appleBtnText.textContent = 'Done';
        btnConfirmAppleImport.dataset.action = 'done';
      }
      if (btnCancelAppleImport) btnCancelAppleImport.disabled = false;
    } catch (err) {
      if (appleProgressWrap) appleProgressWrap.classList.add('hidden');
      const errInfo = classifyImportError('apple', err, err.message);
      showImportError(appleLinkError, errInfo);
      if (appleImportUrl) appleImportUrl.disabled = false;
      if (appleImportTarget) appleImportTarget.disabled = false;
      if (appleTargetTrigger) appleTargetTrigger.disabled = false;
      if (btnConfirmAppleImport) btnConfirmAppleImport.disabled = false;
      if (btnCancelAppleImport) btnCancelAppleImport.disabled = false;
    }
  }

  if (btnOpenAppleImport) btnOpenAppleImport.addEventListener('click', openAppleImportModal);
  if (btnCancelAppleImport) btnCancelAppleImport.addEventListener('click', closeAppleImportModal);
  if (btnConfirmAppleImport) btnConfirmAppleImport.addEventListener('click', handleAppleImportAction);
  if (appleImportUrl) {
    appleImportUrl.addEventListener('input', () => clearImportError(appleLinkError));
    appleImportUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAppleImportAction();
      }
    });
  }

  const linkImportModal = /** @type {any} */ (document.getElementById('link-import-modal'));
  const btnOpenLinkImport = /** @type {any} */ (document.getElementById('btn-open-link-import'));
  const btnCancelLinkImport = /** @type {any} */ (document.getElementById('btn-cancel-link-import'));
  const btnConfirmLinkImport = /** @type {any} */ (document.getElementById('btn-confirm-link-import'));
  const linkImportUrl = /** @type {any} */ (document.getElementById('link-import-url'));
  const linkImportStatus = /** @type {any} */ (document.getElementById('link-import-status'));
  const linkImportError = /** @type {any} */ (document.getElementById('link-import-error'));
  const linkImportTitle = /** @type {any} */ (document.getElementById('link-import-title'));
  const linkModesContainer = /** @type {any} */ (document.getElementById('link-modes'));
  const linkImportProgressWrap = /** @type {any} */ (document.getElementById('link-import-progress-wrap'));
  const linkImportProgressLabel = /** @type {any} */ (document.getElementById('link-import-progress-label'));
  const linkImportWavyContainer = /** @type {any} */ (document.getElementById('link-import-wavy-container'));
  const btnGoogleLogin = /** @type {any} */ (document.getElementById('btn-google-login'));
  const btnGoogleLogout = /** @type {any} */ (document.getElementById('btn-google-logout'));
  const googleLoginStatus = /** @type {any} */ (document.getElementById('google-login-status'));
  const googleChkLikes = /** @type {any} */ (document.getElementById('google-chk-likes'));
  const googleChkPlaylists = /** @type {any} */ (document.getElementById('google-chk-playlists'));
  let currentLinkImportMode = 'link';
  let currentLinkImportPlatform = '';
  let googleConnected = false;
  // YouTube / YouTube Music "Log in" (desktop): the Google login lives in its own browser storage in main.js
  // (google-library.js), one per profile; this page only learns whether it is logged in and gets the songs back
  const googleApi = () => (window.electronAPI && typeof window.electronAPI.googleImportLibrary === 'function' && !window.electronAPI.isMobile ? window.electronAPI : null);
  const googleProfile = () => (window.UrielProfiles && window.UrielProfiles.id) || 'default';

  // Settings → Integrations → YouTube → "Play with my YouTube sign-in" (computers: yt-dlp uses the Google login of
  // the library import, so songs play while YouTube is asking this address to prove it isn't a bot)
  const ytSigninToggle = /** @type {any} */ (document.getElementById('toggle-yt-signin'));
  const ytSigninBtn = /** @type {any} */ (document.getElementById('btn-yt-signin'));
  const ytSigninStatus = /** @type {any} */ (document.getElementById('yt-signin-status'));
  const YT_SIGNIN_HINT = ytSigninStatus ? ytSigninStatus.textContent : '';
  function showYtSignin(st) {
    if (!ytSigninToggle || !st) return;
    ytSigninToggle.classList.toggle('active', !!st.enabled);
    if (ytSigninBtn) ytSigninBtn.hidden = !!st.loggedIn;
    if (ytSigninStatus) {
      I18N.text(ytSigninStatus, st.error || (st.enabled ? 'On: songs are looked up with your YouTube sign-in' : YT_SIGNIN_HINT));
    }
  }
  async function refreshYtSignin() {
    const api = window.electronAPI;
    if (!ytSigninToggle || !api || !api.ytSigninStatus) return;
    try { showYtSignin(await api.ytSigninStatus(googleProfile())); } catch (e) {}
  }
  if (ytSigninToggle && window.electronAPI && window.electronAPI.ytSigninSet) {
    ytSigninToggle.addEventListener('click', async () => {
      const api = window.electronAPI;
      const enabled = !ytSigninToggle.classList.contains('active');
      // turning it on without a sign-in: sign in first (the same Google window as the library import)
      if (enabled) {
        const st = await api.ytSigninStatus(googleProfile()).catch(() => null);
        if (!st || !st.loggedIn) {
          const r = await api.googleLogin(googleProfile()).catch(() => null);
          if (!r || !r.loggedIn) { refreshYtSignin(); return; }
        }
      }
      try {
        const st = await api.ytSigninSet({ enabled, profile: googleProfile() });
        showYtSignin(st);
        if (enabled && st && st.enabled) showToast(Tm('Songs now play with your YouTube sign-in'), 'success');
      } catch (e) { refreshYtSignin(); }
    });
    if (ytSigninBtn) ytSigninBtn.addEventListener('click', async () => {
      await window.electronAPI.googleLogin(googleProfile()).catch(() => null);
      refreshYtSignin();
    });
    refreshYtSignin();
  }

  function setLinkStatus(text, isError) {
    if (!linkImportStatus) return;
    linkImportStatus.textContent = text || '';
    linkImportStatus.style.color = isError ? 'var(--md-sys-color-error, #ba1a1a)' : 'var(--md-sys-color-primary, #6750A4)';
    linkImportStatus.classList.toggle('hidden', !text);
  }

  function setLinkImportBusy(busy, label) {
    if (linkImportUrl) linkImportUrl.disabled = busy;
    if (btnConfirmLinkImport) {
      btnConfirmLinkImport.disabled = busy || (currentLinkImportMode === 'login' && !googleConnected);
      btnConfirmLinkImport.textContent = label || (busy ? 'Loading…' : 'Import');
    }
    if (btnCancelLinkImport) btnCancelLinkImport.disabled = busy;
    ['link-target-trigger', 'google-target-trigger', 'btn-google-login', 'btn-google-logout'].forEach((id) => { const b = /** @type {any} */ (document.getElementById(id)); if (b) b.disabled = busy; });
  }

  // "Import into": a new playlist, or one of yours (the hidden <select> holds the choice)
  function fillImportTarget(prefix, newLabel) {
    const sel = /** @type {any} */ (document.getElementById(`${prefix}-import-target`));
    const menu = /** @type {any} */ (document.getElementById(`${prefix}-target-menu`));
    const label = /** @type {any} */ (document.getElementById(`${prefix}-target-label`));
    const drop = /** @type {any} */ (document.getElementById(`${prefix}-target-dropdown`));
    const trigger = /** @type {any} */ (document.getElementById(`${prefix}-target-trigger`));
    if (!sel || !menu) return;
    sel.innerHTML = '';
    menu.innerHTML = '';
    const add = (value, text, selected) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      sel.appendChild(opt);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm3-dropdown-option' + (selected ? ' selected' : '');
      b.dataset.value = value;
      b.textContent = text;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        sel.value = value;
        if (label) label.textContent = text;
        menu.querySelectorAll('.m3-dropdown-option').forEach((o) => o.classList.toggle('selected', o === b));
        if (drop) drop.classList.remove('open');
      });
      menu.appendChild(b);
    };
    add('new', newLabel, true);
    state.playlists.forEach((p) => add(p.id, p.name || 'untitled', false));
    sel.value = 'new';
    if (label) label.textContent = newLabel;
    if (trigger && drop && !trigger._targetBound) {
      trigger._targetBound = true;
      trigger.addEventListener('click', (e) => { e.stopPropagation(); drop.classList.toggle('open'); });
      document.addEventListener('click', () => drop.classList.remove('open'));
    }
  }

  // songs into the playlist picked under "Import into" (or a new one, opened unless several come in a row);
  // returns how many went in
  function addImportedTracks(targetId, name, tracks, cover, open = true) {
    const target = targetId && targetId !== 'new' ? state.playlists.find((p) => p.id === targetId) : null;
    if (!target) {
      const pl = createPlaylist(name || 'Imported playlist', tracks, cover || '', { open });
      return pl ? pl.tracks.length : 0;
    }
    if (!target.cover && cover) target.cover = cover;
    const fresh = tracks.filter((t) => !target.tracks.some((x) => isSameTrack(x, t)));
    target.tracks.push(...fresh.map(stampAddedAt));
    localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    renderPlaylistsList();
    if (state.currentView === 'playlist-detail' && state.currentPlaylistId === target.id) openPlaylistDetail(target.id);
    return fresh.length;
  }

  function updateGoogleAuthUI() {
    if (googleLoginStatus) {
      googleLoginStatus.textContent = googleConnected ? 'Connected' : 'Not connected';
      googleLoginStatus.style.color = googleConnected ? 'var(--md-sys-color-primary, #6750A4)' : 'var(--md-sys-color-outline)';
    }
    if (btnGoogleLogin) btnGoogleLogin.textContent = googleConnected ? 'Switch account' : 'Log in with Google';
    if (btnGoogleLogout) btnGoogleLogout.classList.toggle('hidden', !googleConnected);
    if (currentLinkImportMode === 'login' && btnConfirmLinkImport && btnConfirmLinkImport.dataset.action !== 'done') btnConfirmLinkImport.disabled = !googleConnected;
  }

  async function checkGoogleAuthStatus() {
    const api = googleApi();
    try { googleConnected = !!(api && (await api.googleAuthStatus(googleProfile())).loggedIn); } catch (e) { googleConnected = false; }
    updateGoogleAuthUI();
  }

  function setLinkImportMode(mode) {
    currentLinkImportMode = mode === 'login' && googleApi() ? 'login' : 'link';
    if (linkModesContainer) linkModesContainer.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === currentLinkImportMode));
    if (linkImportModal) linkImportModal.querySelectorAll('.link-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.mode !== currentLinkImportMode));
    clearImportError(linkImportError);
    setLinkStatus('');
    if (btnConfirmLinkImport && btnConfirmLinkImport.dataset.action !== 'done') {
      btnConfirmLinkImport.textContent = 'Import';
      btnConfirmLinkImport.disabled = currentLinkImportMode === 'login' && !googleConnected;
    }
    if (currentLinkImportMode === 'login') checkGoogleAuthStatus();
  }

  if (linkModesContainer) linkModesContainer.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setLinkImportMode(b.dataset.mode)));

  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
      const api = googleApi();
      if (!api) return;
      if (googleLoginStatus) { googleLoginStatus.textContent = 'Logging in…'; googleLoginStatus.style.color = 'var(--md-sys-color-on-surface-variant)'; }
      try { googleConnected = !!(await api.googleLogin(googleProfile())).loggedIn; } catch (e) {}
      updateGoogleAuthUI();
      // Google often refuses sign-ins inside an app window ("This browser or app may not be secure", #10):
      // say so, and point to what still works without a login
      if (!googleConnected && googleLoginStatus) {
        googleLoginStatus.textContent = T('Not connected. If Google said this browser or app may not be secure, it blocks sign-ins inside apps: import your public playlists with their link instead.');
      }
    });
  }
  if (btnGoogleLogout) {
    btnGoogleLogout.addEventListener('click', async () => {
      const api = googleApi();
      try { if (api) await api.googleLogout(googleProfile()); } catch (e) {}
      googleConnected = false;
      updateGoogleAuthUI();
    });
  }

  function openLinkImportModal(platform = '') {
    if (!linkImportModal) return;
    currentLinkImportPlatform = platform || '';
    clearImportError(linkImportError);
    const titles = { youtube: 'Import from YouTube', ytmusic: 'Import from YouTube Music', soundcloud: 'Import from SoundCloud', yandex: 'Import from Yandex Music' };
    if (linkImportTitle) linkImportTitle.textContent = T(titles[platform] || 'Import from link');
    // logging in to Google works for YouTube and YouTube Music, and only in the desktop app
    if (linkModesContainer) linkModesContainer.classList.toggle('hidden', !(googleApi() && (platform === 'youtube' || platform === 'ytmusic')));
    if (linkImportUrl) {
      linkImportUrl.value = '';
      linkImportUrl.disabled = false;
      if (platform === 'youtube') {
        linkImportUrl.placeholder = T('Paste a YouTube playlist or video link');
      } else if (platform === 'ytmusic') {
        linkImportUrl.placeholder = T('Paste a YouTube Music link');
      } else if (platform === 'soundcloud') {
        linkImportUrl.placeholder = T('Paste a SoundCloud playlist or track link');
      } else if (platform === 'yandex') {
        linkImportUrl.placeholder = T('Paste a Yandex Music playlist, album or song link');
      } else {
        linkImportUrl.placeholder = T('Paste a YouTube, YouTube Music, SoundCloud or Yandex Music link');
      }
    }
    fillImportTarget('link', T('New playlist'));
    fillImportTarget('google', T('Separate playlists'));
    if (linkImportProgressWrap) linkImportProgressWrap.classList.add('hidden');
    if (linkImportWavyContainer) linkImportWavyContainer.innerHTML = '';
    if (btnConfirmLinkImport) btnConfirmLinkImport.dataset.action = 'import';
    setLinkImportMode('link');
    setLinkImportBusy(false);
    openModal(linkImportModal);
    if (linkImportUrl) linkImportUrl.focus();
  }

  function closeLinkImportModal() {
    if (linkImportModal) closeModal(linkImportModal);
  }

  function linkImportDone(message) {
    if (linkImportProgressWrap) linkImportProgressWrap.classList.add('hidden');
    setLinkImportBusy(false, 'Done');
    if (btnConfirmLinkImport) { btnConfirmLinkImport.disabled = false; btnConfirmLinkImport.dataset.action = 'done'; }
    setLinkStatus(message);
    showToast(message, 'success');
  }

  function linkImportProgress() {
    if (linkImportProgressWrap) linkImportProgressWrap.classList.remove('hidden');
    if (linkImportProgressLabel) linkImportProgressLabel.textContent = '0 / 0';
    const wavy = linkImportWavyContainer ? createWavyProgress(linkImportWavyContainer) : { set() {} };
    wavy.set(0);
    return (done, total) => {
      wavy.set(total ? Math.round((done / total) * 100) : 0);
      if (linkImportProgressLabel) linkImportProgressLabel.textContent = `${done} / ${total}`;
    };
  }

  // Yandex Music: the server reads the playlist (titles and artists), then each song is found on YouTube
  async function handleYandexLinkImport(url) {
    const progress = linkImportProgress();
    const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/yandex-import?url=${encodeURIComponent(url)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !Array.isArray(data.tracks) || !data.tracks.length) {
      if (linkImportProgressWrap) linkImportProgressWrap.classList.add('hidden');
      showImportError(linkImportError, classifyImportError('link', res.status, data));
      setLinkImportBusy(false);
      return;
    }
    progress(0, data.tracks.length);
    let found;
    try {
      found = await matchSpotifyTracks(data.tracks, progress);
    } catch (err) {
      if (linkImportProgressWrap) linkImportProgressWrap.classList.add('hidden');
      setLinkStatus(importErrorText(err, 'Import failed'), true);
      setLinkImportBusy(false);
      return;
    }
    const target = /** @type {any} */ (document.getElementById('link-import-target'));
    const added = addImportedTracks(target ? target.value : 'new', data.name || 'Yandex Music playlist', found, data.cover || '');
    const missing = data.tracks.length - found.length;
    linkImportDone(missing > 0 ? `Imported ${added} tracks. ${missing} not found on YouTube.` : `Imported ${added} tracks.`);
  }

  async function handleGoogleLoginImport() {
    const api = googleApi();
    if (!api) return;
    const doLikes = !!(googleChkLikes && googleChkLikes.checked);
    const doPlaylists = !!(googleChkPlaylists && googleChkPlaylists.checked);
    if (!doLikes && !doPlaylists) { setLinkStatus('Pick liked songs, playlists or both', true); return; }
    clearImportError(linkImportError);
    setLinkImportBusy(true);
    setLinkStatus('Reading your library…');
    try {
      const res = await api.googleImportLibrary({ profile: googleProfile(), platform: currentLinkImportPlatform === 'ytmusic' ? 'ytmusic' : 'youtube', doLikes, doPlaylists });
      if (!res || !res.success) {
        const loggedOut = !!(res && res.code === 'not_logged_in');
        if (loggedOut) googleConnected = false;
        setLinkImportBusy(false);
        updateGoogleAuthUI();
        setLinkStatus(loggedOut ? 'Google logged Uriel out. Log in again.' : `Couldn't read your library: ${(res && res.error) || 'try again later'}`, true);
        return;
      }
      const likes = Array.isArray(res.likes) ? res.likes : [];
      const playlists = Array.isArray(res.playlists) ? res.playlists : [];
      const total = likes.length + playlists.reduce((n, p) => n + (Array.isArray(p.tracks) ? p.tracks.length : 0), 0);
      if (!total) { setLinkStatus('No songs found to import', true); setLinkImportBusy(false); return; }
      const progress = linkImportProgress();
      let done = 0;
      // liked songs become favorites of the open profile
      let newFavorites = 0;
      for (const t of likes) {
        if (!isFavoriteSong(t)) { state.favorites.push(stampAddedAt(t)); newFavorites++; }
        progress(++done, total);
      }
      if (newFavorites) {
        localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
        updateFavoritesBadge();
        updateFavoriteIcon();
        if (state.currentView === 'favorites') renderFavoritesView();
        window.dispatchEvent(new Event('uriel:library'));
      }
      const target = /** @type {any} */ (document.getElementById('google-import-target'));
      const targetId = target ? target.value : 'new';
      let added = 0;
      for (const pl of playlists) {
        const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
        if (tracks.length) added += addImportedTracks(targetId, pl.name, tracks, pl.cover || '', false);
        done += tracks.length;
        progress(done, total);
      }
      const parts = [];
      if (doLikes) parts.push(`${newFavorites} new favorite${newFavorites === 1 ? '' : 's'}`);
      if (doPlaylists) parts.push(`${playlists.length} playlist${playlists.length === 1 ? '' : 's'} (${added} tracks)`);
      linkImportDone(`Imported ${parts.join(' and ')}.`);
    } catch (err) {
      if (linkImportProgressWrap) linkImportProgressWrap.classList.add('hidden');
      setLinkImportBusy(false);
      setLinkStatus("Couldn't read your library. Check your connection and try again.", true);
    }
  }

  async function handleLinkImportAction() {
    if (btnConfirmLinkImport && btnConfirmLinkImport.dataset.action === 'done') { closeLinkImportModal(); return; }
    if (currentLinkImportMode === 'login') { await handleGoogleLoginImport(); return; }
    clearImportError(linkImportError);
    const url = linkImportUrl ? linkImportUrl.value.trim() : '';
    if (window.UrielShare && window.UrielShare.payloadFrom(url)) { closeLinkImportModal(); importSharedPlaylist(url); return; }
    if (!url) {
      const errInfo = classifyImportError('link', 404, 'unsupported link');
      showImportError(linkImportError, errInfo);
      return;
    }

    setLinkStatus('');
    setLinkImportBusy(true);

    try {
      if (/^https?:\/\/(?:[\w-]+\.)*music\.yandex\./i.test(url) || (currentLinkImportPlatform === 'yandex' && /yandex\./i.test(url))) {
        await handleYandexLinkImport(url);
        return;
      }
      if (url.includes('soundcloud.com')) setPlatform('soundcloud', false);
      else if (url.includes('music.youtube.com')) setPlatform('ytmusic', false);
      else if (url.includes('youtube.com') || url.includes('youtu.be')) setPlatform('youtube', false);

      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/playlist-import?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || !data.success || !Array.isArray(data.tracks) || data.tracks.length === 0) {
        const errInfo = classifyImportError('link', res.status, data);
        showImportError(linkImportError, errInfo);
        setLinkImportBusy(false);
        return;
      }
      const target = /** @type {any} */ (document.getElementById('link-import-target'));
      const targetId = target ? target.value : 'new';
      const added = addImportedTracks(targetId, data.name, data.tracks, data.cover || '');
      showToast(`Imported ${added} tracks`, 'success');
      closeLinkImportModal();
    } catch (err) {
      if (linkImportProgressWrap) linkImportProgressWrap.classList.add('hidden');
      const errInfo = classifyImportError('link', err, err.message);
      showImportError(linkImportError, errInfo);
      setLinkImportBusy(false);
    }
  }

  const linkImportBtns = document.querySelectorAll('.btn-open-link-import, #btn-open-link-import');
  linkImportBtns.forEach((/** @type {HTMLElement} */ btn) => {
    btn.addEventListener('click', () => {
      // the round buttons in "Create playlist" open the importer in its place
      if (el.createPlaylistModal && el.createPlaylistModal.contains(btn)) closeModal(el.createPlaylistModal);
      if (btn.dataset.platform && btn.dataset.platform !== 'yandex') setPlatform(btn.dataset.platform, false);
      openLinkImportModal(btn.dataset.platform || '');
    });
  });
  // "Create playlist" → import from Spotify / Apple Music: the same dialogs as in Settings → Integrations
  [['btn-cpm-spotify', 'btn-open-spotify-import'], ['btn-cpm-apple', 'btn-open-apple-import']].forEach(([from, to]) => {
    const b = /** @type {any} */ (document.getElementById(from));
    if (b) b.addEventListener('click', () => {
      if (el.createPlaylistModal) closeModal(el.createPlaylistModal);
      const target = /** @type {any} */ (document.getElementById(to));
      if (target) target.click();
    });
  });
  if (btnCancelLinkImport) btnCancelLinkImport.addEventListener('click', closeLinkImportModal);
  if (btnConfirmLinkImport) btnConfirmLinkImport.addEventListener('click', handleLinkImportAction);
  if (linkImportUrl) {
    linkImportUrl.addEventListener('input', () => clearImportError(linkImportError));
    linkImportUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleLinkImportAction();
      }
    });
  }
};
