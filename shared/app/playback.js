// @ts-check
// Playing songs: starting one (finding its stream, HLS, the proxy and fresh-link fallbacks), getting a stream
// back after a drop mid-song, fading play and pause, the queue (next, previous, shuffle, what happens at its
// end), looking up the next song ahead, and the player's audio events and progress bar. Part of app.js, which
// calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielPlaybackPart} out */
window.UrielApp.playback = function ({ applyAudioSettings, applyM3Cover, audioEngine, cancelEndFade, canOverlap, crossfadeFadeIn, crossfadeOnTrackChange, crossfadePrepared, crossfadeSeconds, dropCrossfadePrep, el, emitPluginEvent, enforceTrackTrim, extendMyWaveQueue, formatDuration, getTrackCanonicalId, getTrackNormalizedKey, getTrackTrim, initAudioContext, isBlocked, isPhoneApp, isSameTrack, loadScriptOnce, loadSyncedLyrics, m3cDraw, m3cEnabled, m3cStart, miniLyricsShown, nextPrefetchDue, offlineChanged, onTrackAudioTrackChange, pauseCrossfadeTail, playback, prepareCrossfade, recordWaveSkip, registerMediaActions, renderHistoryView, renderQueueView, resetLevelWatcher, resumeCrossfadeTail, saveQueueState, sendStateToServer, showToast, startVisualizers, state, stopLyricsScroll, syncTvkProgress, Tm, tokenUrl, toolsReady, updateDiscordPresence, updateMediaPositionState, updateMediaSession, updateMiniLyricsHighlight, updateNowPlayingUI, updatePlayPauseButton, updateQueueBadge, updateSleepTimerUI, updateSyncedLyricsHighlight, visualizerPart, viz }, out) {
  function pushPlayHistory(/** @type {UrielTrack} */ track) {
    if (!track) return;
    const h = state.playHistory || (state.playHistory = []);
    if (h.length && h[h.length - 1].id === track.id) return;
    h.push(track);
    if (h.length > 100) h.shift();
  }
  let navigatingBack = false;

  // every song that has played since Uriel opened (any queue, shuffle or not), by id and by artist + title, so the
  // same song from another list or source counts too: shuffle leaves them for last
  const sessionPlayed = new Set();
  const playedThisSession = (/** @type {UrielTrack} */ t) => !!t && (sessionPlayed.has(getTrackCanonicalId(t)) || sessionPlayed.has(getTrackNormalizedKey(t.artist, t.title)));
  function notePlayedThisSession(/** @type {UrielTrack | null} */ t) {
    if (!t) return;
    const id = getTrackCanonicalId(t);
    if (id) sessionPlayed.add(id);
    if (t.title) sessionPlayed.add(getTrackNormalizedKey(t.artist, t.title));
  }

  // Shuffle mixes the queue itself: the playing song goes first and the rest follow in a random order, so the
  // queue shows what plays next and Next just takes the following song. It used to pick a random song at each
  // Next, so the queue only ever showed the playlist's own order. Songs heard earlier this session go last.
  // The array is changed in place: a My Wave or radio top-up still loading for it keeps its place.
  function shuffleQueue() {
    const q = state.queue;
    if (state.queueIndex < 0 || q.length < 2) return;
    if (!state.unshuffledQueue) state.unshuffledQueue = q.slice();
    const mix = (/** @type {UrielTrack[]} */ list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const rest = q.filter((/** @type {UrielTrack} */ t, /** @type {number} */ i) => i !== state.queueIndex);
    const order = [q[state.queueIndex], ...mix(rest.filter((/** @type {UrielTrack} */ t) => !playedThisSession(t))), ...mix(rest.filter(playedThisSession))];
    order.forEach((t, i) => { q[i] = t; });
    state.queueIndex = 0;
    state.queueHistory = [0];
  }

  // back to the order from before shuffle; songs added since keep their place after it
  function unshuffleQueue() {
    const before = state.unshuffledQueue;
    state.unshuffledQueue = null;
    const q = state.queue;
    if (!before || !q.length) return;
    // counted, not just looked up: the same song can be in the queue twice
    const left = new Map();
    q.forEach((/** @type {UrielTrack} */ t) => left.set(t, (left.get(t) || 0) + 1));
    const order = [];
    for (const t of [...before, ...q]) {
      if (left.get(t) > 0) { order.push(t); left.set(t, left.get(t) - 1); }
    }
    const current = q[state.queueIndex];
    order.forEach((t, i) => { q[i] = t; });
    state.queueIndex = Math.max(0, q.indexOf(current));
    state.queueHistory = [state.queueIndex];
  }

  // A song that can't be played used to stop a whole playlist. When playing through a list (or after Next)
  // it is skipped instead; several failures in a row (offline, say) still stop.
  const SKIP_CONTEXTS = new Set(['playlist', 'favorites', 'album', 'queue', 'history', 'local', 'artist']);
  let advancing = false; // true while playNext starts the next song
  let skipOnFailToken = -1; // loadToken of the song that gets skipped if it fails
  let failStreak = 0;
  // true from the moment a song is asked for until it plays (or fails for good). Nothing is audible in
  // between, so the phone apps keep themselves running on this (mobile/background-audio.ts, media-controls.ts).
  function setTrackLoading(/** @type {boolean} */ on) {
    if (!!state.trackLoading === on) return;
    state.trackLoading = on;
    window.dispatchEvent(new Event('uriel:loading'));
  }
  // Nothing is playing any more: without this a failed start left is-playing on, and the background and cover
  // animations kept running with no sound
  function stopAfterFailure() {
    state.isPlaying = false;
    document.body.classList.remove('is-playing');
    if (el.coverContainer) el.coverContainer.classList.remove('spinning');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updatePlayPauseButton(false, false);
  }
  // The toast goes away after a few seconds; the player keeps saying why it is sitting at 0:00 until the next song.
  /** @param {UrielText} message */
  function showPlayFailure(message, type = 'error') {
    showToast(message, type, 8000);
    if (!el.playbarArtist) return;
    el.playbarArtist.textContent = String(Tm("Couldn't play"));
    el.playbarArtist.title = String(message);
    el.playbarArtist.classList.add('play-failed');
  }
  // every failure path asks this; a false answer means nothing else will be loaded, so loading is over
  function skipUnplayable(/** @type {number} */ token, /** @type {UrielTrack | null} */ track) {
    if (token !== state.loadToken) return false;
    if (token !== skipOnFailToken) { setTrackLoading(false); return false; }
    if (state.queue.length < 2 || failStreak >= Math.min(5, state.queue.length - 1)) { failStreak = 0; setTrackLoading(false); return false; }
    failStreak++;
    showToast(track && track.title ? Tm('Couldn\'t play "{0}", playing the next one', track.title) : Tm("Couldn't play this song, playing the next one"), 'info');
    setTimeout(() => { if (token === state.loadToken) playNext(); }, 1200);
    return true;
  }

  async function playTrack(/** @type {UrielTrack} */ track, /** @type {UrielTrack[] | null} */ queueList = null, startIndex = -1, /** @type {string | null} */ context = null) {
    if (!track || !el.nativeAudio) return;
    // a song that is cached or saved still plays without yt-dlp, so this only reminds
    if (track.platform !== 'local') toolsReady(['yt-dlp']);
    resetLevelWatcher();
    visualizerPart.resetLevelHistory();
    if (state.currentTrack && state.currentTrack.id !== track.id && !navigatingBack) pushPlayHistory(state.currentTrack);
    if (state.currentTrack) offlineChanged(state.currentTrack);
    // a new list that isn't My Wave's ends My Wave: it isn't topped up with wave songs, and its skips don't count
    if (queueList && queueList !== state.queue && context !== 'wave') state.myWaveActive = false;

    if (!state._isNaturalEnding && state.myWaveActive && state.currentTrack && !isSameTrack(state.currentTrack, track)) {
      const curId = (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(state.currentTrack) : '') || state.currentTrack.id;
      if (state._skipRecordedFor !== curId) {
        const cur = (el.nativeAudio && typeof el.nativeAudio.currentTime === 'number') ? el.nativeAudio.currentTime : 0;
        if (cur < 12 && typeof recordWaveSkip === 'function') {
          recordWaveSkip(state.currentTrack);
        }
      }
    }
    state._skipRecordedFor = null;

    if (context !== 'album') playback.albumRunId++;
    cancelEndFade();
    crossfadeOnTrackChange();
    state.nextTrackPrefetched = false;
    initAudioContext();
    el.nativeAudio.preload = 'auto';

    try {
      el.nativeAudio.pause();
      el.nativeAudio.removeAttribute('src');
      el.nativeAudio.load();
    } catch (e) {}

    if (playback.hls) {
      try { playback.hls.destroy(); } catch (e) {}
      playback.hls = null;
    }

    state.isPlaying = false;
    updatePlayPauseButton(false, true);
    sendStateToServer();

    if (el.lyricsContainer) el.lyricsContainer.scrollTop = 0;
    stopLyricsScroll();
    state.lastActiveLyricIdx = -1;
    state.forceLyricsScroll = true;
    state.forceSnapLyrics = true;

    if (el.timeCurrent) el.timeCurrent.textContent = '0:00';
    if (el.timeDuration) el.timeDuration.textContent = formatDuration(track.duration || 0);
    visualizerPart.resetScrubber();

    state.loadToken++;
    state.queueRestorePosition = 0; // a place in the song before this one (Play reads it before it gets here)
    const currentToken = state.loadToken;
    if (advancing || SKIP_CONTEXTS.has(context || '')) skipOnFailToken = currentToken;
    setTrackLoading(true);

    if (state.currentAbortController) {
      state.currentAbortController.abort();
    }
    state.currentAbortController = new AbortController();
    const signal = state.currentAbortController.signal;

    state.currentTrack = track;
    emitPluginEvent('trackchange', track);
    onTrackAudioTrackChange();
    state.currentTrackContext = context;
    state.currentTrackIndexInContext = startIndex;

    if (queueList) {
      // a tap on a song in the queue itself keeps the queue's order
      const newList = queueList !== state.queue;
      state.queue = [...queueList];
      if (startIndex >= 0 && startIndex < state.queue.length && isSameTrack(state.queue[startIndex], track)) {
        state.queueIndex = startIndex;
      } else {
        state.queueIndex = state.queue.findIndex((/** @type {UrielTrack} */ t) => isSameTrack(t, track));
      }
      if (state.queueIndex === -1) {
        state.queue.unshift(track);
        state.queueIndex = 0;
      }
      state.queueHistory = [state.queueIndex];
      if (newList) {
        state.unshuffledQueue = null;
        // My Wave is topped up as it plays; mixing only the first few songs of it means nothing
        if (state.isShuffle && context !== 'wave') shuffleQueue();
      }
    } else {
      const existingIndex = state.queue.findIndex((/** @type {UrielTrack} */ t) => isSameTrack(t, track));
      if (existingIndex === -1) {
        state.queue.push(track);
        state.queueIndex = state.queue.length - 1;
      } else {
        state.queueIndex = existingIndex;
      }
      state.queueHistory = [state.queueIndex];
    }
    updateQueueBadge();

    track.playedAt = Date.now();
    state.history = state.history.filter((/** @type {UrielTrack} */ t) => !isSameTrack(t, track));
    state.history.unshift(track);
    if (state.history.length > 100) state.history.pop();
    localStorage.setItem('devsize_history', JSON.stringify(state.history));
    if (state.currentView === 'history') renderHistoryView();

    updateNowPlayingUI(track);
    updatePlayPauseButton(false, true);

    loadSyncedLyrics(track.title || '', track.artist || '', currentToken);

    try {
      if (track.platform === 'local') {
        const streamUrl = tokenUrl(`http://127.0.0.1:${state.serverPort}/api/library-file?id=${encodeURIComponent(track.id)}`);
        if (currentToken !== state.loadToken) return;
        el.nativeAudio.preload = 'auto';
        el.nativeAudio.src = streamUrl;
        playSmooth();
        applyAudioSettings();
        return;
      }

      let resolvedUrl = track.url;
      let resolvedId = track.id;

      if ((!resolvedUrl && !resolvedId) || (resolvedUrl && resolvedUrl.includes('/results?search_query='))) {
        if (track.searchQuery) {
          // a song already on this device plays from there at once; only otherwise is its video searched for
          if (await attachStream(track, resolvedUrl, resolvedId, currentToken, signal, false, true)) {
            applyAudioSettings();
            return;
          }
          if (currentToken !== state.loadToken) return;
          try {
            const searchRes = await fetch(`http://127.0.0.1:${state.serverPort}/api/search?q=${encodeURIComponent(track.searchQuery)}&platform=youtube&limit=1`, { signal });
            const sData = await searchRes.json();
            // another song started while this one was searched for: leave that one alone
            if (currentToken !== state.loadToken) return;
            const cur = state.currentTrack;
            if (cur && sData.success && sData.tracks && sData.tracks[0]) {
              resolvedUrl = sData.tracks[0].url;
              resolvedId = sData.tracks[0].id;
              cur.id = resolvedId;
              cur.url = resolvedUrl;
              if (!cur.thumbnail && sData.tracks[0].thumbnail) cur.thumbnail = sData.tracks[0].thumbnail;
            }
          } catch (e) {}
        }
      }

      if (!await attachStream(track, resolvedUrl, resolvedId, currentToken, signal, false)) return;
      applyAudioSettings();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (currentToken === state.loadToken) {
        logPlaybackIssue('Song playback notice', err);
        if (retryFresh(currentToken, track)) return;
        stopAfterFailure();
        if (!skipUnplayable(currentToken, track)) showPlayFailure((err instanceof Error && err.message) || Tm('Could not load audio stream'));
      }
    }
  }

  // Looks the song up (/api/stream-info) and gives its stream to the audio element. Resolves false when
  // another song was started meanwhile; throws when there is nothing to play. localOnly: only a copy on this
  // device counts, and without one it resolves false.
  /** @param {UrielTrack} track @param {string | undefined} resolvedUrl @param {string | undefined} resolvedId @param {number} currentToken @param {AbortSignal} signal @param {boolean} fresh */
  async function attachStream(track, resolvedUrl, resolvedId, currentToken, signal, fresh, localOnly = false) {
    const streamInfoUrl = `http://127.0.0.1:${state.serverPort}/api/stream-info?url=${encodeURIComponent(resolvedUrl || '')}&id=${encodeURIComponent(resolvedId || '')}${fresh ? '&fresh=1' : ''}${localOnly || navigator.onLine === false ? '&localOnly=1' : ''}&platform=${track.platform || state.platform}&title=${encodeURIComponent(track.title || '')}&artist=${encodeURIComponent(track.artist || '')}&duration=${encodeURIComponent(track.duration || 0)}&thumbnail=${encodeURIComponent(track.thumbnail || '')}`;
    const res = await fetch(streamInfoUrl, { signal });
    const data = await res.json();

    if (currentToken !== state.loadToken) return false;
    if (localOnly && !(data && data.success)) return false;

    // a downloaded, cached or device copy plays: the song is available offline
    if (data && data.success && data.isLocal) { try { offlineChanged(track, true); } catch (e) {} }

    if (!data || !data.success || !data.streamUrl) {
      // offline only saved copies are looked up (above), so this answers at once instead of trying every source
      if (!navigator.onLine) throw new Error(String(Tm('Offline: this song is not available in local cache')));
      throw new Error((data && data.error) || 'Failed to extract audio stream');
    }

    if (playback.hls) {
      playback.hls.destroy();
      playback.hls = null;
    }

    el.nativeAudio.preload = 'auto';

    // hls.js (600 KB) loads with the first HLS stream instead of with the app
    if (data.isHls && !window.Hls) {
      await loadScriptOnce('assets/hls.min.js').catch(() => {});
      if (currentToken !== state.loadToken) return false;
    }
    if (data.isHls && window.Hls && Hls.isSupported()) {
      const created = /** @type {UrielHls} */ (new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000 }));
      playback.hls = created;
      created.loadSource(data.streamUrl);
      // hls.js needs the real element: this song plays there (mobile/native-audio.ts)
      if (el.nativeAudio.useWeb) el.nativeAudio.useWeb();
      created.attachMedia(el.nativeAudio.webElement || el.nativeAudio);
      created.on(Hls.Events.MANIFEST_PARSED, () => {
        if (currentToken === state.loadToken) {
          playSmooth();
        }
      });
      // without this a dead HLS stream just sat on the loading spinner
      created.on(Hls.Events.ERROR, (/** @type {string} */ evt, /** @type {{ fatal?: boolean, type?: string, details?: string }} */ info) => {
        if (!info || !info.fatal || currentToken !== state.loadToken) return;
        const hls = created;
        if (info.type === Hls.ErrorTypes.MEDIA_ERROR && !hls._urielRecovered) {
          hls._urielRecovered = true;
          try { hls.recoverMediaError(); return; } catch (e) {}
        }
        if (recoverMidSong(currentToken, track)) return;
        try { hls.destroy(); } catch (e) {}
        if (playback.hls === hls) playback.hls = null;
        state.isPlaying = false;
        document.body.classList.remove('is-playing');
        updatePlayPauseButton(false, false);
        if (retryFresh(currentToken, track)) return;
        if (!skipUnplayable(currentToken, track)) showPlayFailure(Tm('Could not play this song. Try again or skip.'));
      });
    } else {
      // #17: a YouTube media URL is bound to the player client yt-dlp resolved it with; Chromium fetching it
      // with its own headers got "Format error" (code 4). On desktop it plays through the local proxy,
      // which fetches with yt-dlp's headers; the direct URL stays as a fallback.
      const src = pickStreamSrc(data);
      proxyFallback = src !== data.streamUrl ? null : { token: currentToken, track, url: data.proxyUrl || '' };
      el.nativeAudio.src = src;
      playSmooth();
    }
    return true;
  }

  function isGoogleVideoUrl(/** @type {string} */ u) {
    try { const h = new URL(u).hostname; return h === 'googlevideo.com' || h.endsWith('.googlevideo.com'); } catch (e) { return false; }
  }
  // the src the audio element gets for a /api/stream-info answer (same rule as stream-source.js): phones
  // play downloaded files and keep the URL they were given
  function pickStreamSrc(/** @type {UrielStreamInfo} */ data) {
    const isMobile = !!(window.electronAPI && window.electronAPI.isMobile);
    if (!isMobile && !data.isHls && !data.isLocal && data.proxyUrl && isGoogleVideoUrl(data.streamUrl)) return data.proxyUrl;
    return data.streamUrl;
  }
  // a direct (not proxied) stream that failed to load is tried once through the local proxy before a fresh lookup
  /** @type {{ token: number, track: UrielTrack, url: string } | null} */
  let proxyFallback = null;
  function tryProxyFallback(/** @type {number} */ token, /** @type {UrielTrack} */ track) {
    const fb = proxyFallback;
    proxyFallback = null;
    if (!fb || !fb.url || fb.token !== token || token !== state.loadToken || fb.track !== track || track !== state.currentTrack) return false;
    if (window.electronAPI && window.electronAPI.isMobile) return false;
    const me = el.nativeAudio.error;
    if (!me || (me.code !== 4 && me.code !== 2)) return false;
    console.warn('Track playback: direct stream failed, trying the local proxy');
    el.nativeAudio.src = fb.url;
    playSmooth();
    return true;
  }

  // A song that fails the first time (the lookup, the audio element on its URL, or nothing arriving) is
  // looked up once more, afresh, before the listener is told: the first failure was usually passing (a
  // shared lookup that failed, a remembered stream URL YouTube no longer serves) and Retry then played it.
  let freshRetryToken = -1;
  // One line for the console and the app log: what failed, with the DOMException's name and message and
  // the audio element's state (error code, readyState, networkState, which host it was loading from).
  /** @param {HTMLAudioElement} audio */
  function describeMediaState(audio) {
    if (!audio) return 'no audio element';
    let host = '';
    try { const s = audio.currentSrc || audio.src; host = s ? new URL(s).host : '(none)'; } catch (e) { host = '(bad url)'; }
    const me = audio.error;
    return `mediaError=${me ? me.code + (me.message ? ' ' + me.message : '') : 'none'} readyState=${audio.readyState} networkState=${audio.networkState} paused=${audio.paused} src=${host}${playback.hls ? ' hls' : ''}`;
  }
  /** @param {string} what @param {unknown} err */
  function logPlaybackIssue(what, err) {
    const e = /** @type {{ name?: string, message?: string } | null} */ (err);
    const desc = e ? `${e.name || 'Error'}: ${e.message || String(e)}` : 'no details';
    const line = `${what}: ${desc} | ${describeMediaState(el.nativeAudio)} | load=${state.loadToken}`;
    console.warn(line);
    try { if (window.__riffLogError) window.__riffLogError('WARN', line, null); } catch (e) {}
    return line;
  }
  /** @param {number} token @param {UrielTrack | null} track */
  function retryFresh(token, track) {
    if (resumeAt && resumeAt.token === token) return recoverMidSong(token, track);
    if (token !== state.loadToken || freshRetryToken === token || !state.trackLoading || !track || track !== state.currentTrack || track.platform === 'local') return false;
    if (!navigator.onLine) return false;
    freshRetryToken = token;
    console.warn('Track playback: retrying with a fresh lookup');
    if (playback.hls) { try { playback.hls.destroy(); } catch (e) {} playback.hls = null; }
    try { el.nativeAudio.pause(); el.nativeAudio.removeAttribute('src'); el.nativeAudio.load(); } catch (e) {}
    setTrackLoading(true);
    const signal = state.currentAbortController ? state.currentAbortController.signal : undefined;
    attachStream(track, track.url, track.id, token, signal, true).then((ok) => { if (ok) applyAudioSettings(); }, (err) => {
      if (err && err.name === 'AbortError') return;
      if (token !== state.loadToken) return;
      logPlaybackIssue('Song playback notice (fresh retry)', err);
      stopAfterFailure();
      if (!skipUnplayable(token, track)) showPlayFailure((err && err.message) || Tm('Could not load audio stream'));
    });
    return true;
  }

  // A song that was playing and lost its stream continues where it stopped (playback-recovery.js). When it won't
  // come back the song is unloaded, so that Play looks it up again at the same place. False: not for this path.
  const midSongRecovery = window.UrielPlaybackRecovery.createMidSongRecovery();
  let midSongLookup = -1; // loadToken of the look-up under way
  /** @type {{ token: number, track: UrielTrack, pos: number } | null} */
  let waitingForNet = null;
  /** @type {{ token: number, pos: number } | null} */
  let resumeAt = null;
  function unloadAtPosition(/** @type {number} */ pos) {
    const a = el.nativeAudio;
    if (playback.hls) { try { playback.hls.destroy(); } catch (e) {} playback.hls = null; }
    try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {}
    state.queueRestorePosition = pos;
    state.isPlaying = false;
    document.body.classList.remove('is-playing');
  }
  function recoverMidSong(/** @type {number} */ token, /** @type {UrielTrack | null} */ track) {
    if (token !== state.loadToken || !track || track !== state.currentTrack) return false;
    // a look-up that came back with a stream that fails too is still the same recovery, with the same place to continue
    const resuming = !!resumeAt && resumeAt.token === token;
    if (state.trackLoading && !resuming) return false;
    if (midSongLookup === token || (waitingForNet && waitingForNet.token === token)) return true;
    const a = el.nativeAudio;
    const pos = resuming && resumeAt ? resumeAt.pos : (a.currentTime || 0);
    // nearly over anyway: on to the next song rather than the same one from the start
    if (a.duration && pos > 1 && !window.UrielPlaybackRecovery.resumePosition(pos, a.duration)) { resumeAt = null; playNext(); return true; }
    const action = midSongRecovery.decide({ song: token, local: track.platform === 'local', online: navigator.onLine });
    if (action === 'give-up') {
      resumeAt = null;
      if (track.platform === 'local') return false;
      // it stops here rather than skipping on: a song that played until now is rarely the problem, the connection is
      unloadAtPosition(pos);
      setTrackLoading(false);
      updatePlayPauseButton(false, false);
      showToast(Tm('Could not play this song. Try again or skip.'), 'error');
      return true;
    }
    if (action === 'wait-online') {
      resumeAt = null;
      setTrackLoading(false);
      waitingForNet = { token, track, pos };
      updatePlayPauseButton(true, true);
      showToast(Tm('Connection lost. The song continues when it is back.'));
      return true;
    }
    if (!resuming) { resumeStream(token, track, pos); return true; }
    midSongLookup = token; // a connection that is only just coming back gets a moment between tries
    setTimeout(() => {
      if (midSongLookup === token) midSongLookup = -1;
      if (token === state.loadToken && track === state.currentTrack) resumeStream(token, track, pos);
    }, 3000);
    return true;
  }
  function resumeStream(/** @type {number} */ token, /** @type {UrielTrack} */ track, /** @type {number} */ pos) {
    console.warn('Track playback: stream lost, looking it up again');
    midSongLookup = token;
    resumeAt = { token, pos };
    setTrackLoading(true); // nothing is audible until it continues (phones keep themselves running on this)
    updatePlayPauseButton(true, true);
    const signal = state.currentAbortController ? state.currentAbortController.signal : undefined;
    attachStream(track, track.url, track.id, token, signal, true).then((ok) => {
      if (midSongLookup === token) midSongLookup = -1;
      if (ok) applyAudioSettings();
    }, (err) => {
      if (midSongLookup === token) midSongLookup = -1;
      if ((err && err.name === 'AbortError') || token !== state.loadToken) return;
      logPlaybackIssue('Song playback notice (mid-song look-up)', err);
      recoverMidSong(token, track);
    });
  }
  window.addEventListener('online', () => {
    const w = waitingForNet;
    waitingForNet = null;
    if (!w || w.token !== state.loadToken || w.track !== state.currentTrack) return;
    if (!state.isPlaying || el.nativeAudio.paused) { unloadAtPosition(w.pos); updatePlayPauseButton(false, false); return; } // paused meanwhile: it stays paused
    resumeStream(w.token, w.track, w.pos);
  });

  let hasNotifiedMediaKeysActive = false;
  let smoothFadeToken = 0;
  let isAppClosing = false;
  window.addEventListener('beforeunload', () => { isAppClosing = true; });

  function pauseSmooth() {
    const curToken = ++smoothFadeToken;
    state.isPlaying = false;
    // a pause someone asked for: not undone when another app's sound ends (mobile/audio-interruption.ts)
    state.pausedByUser = true;
    setTrackLoading(false);
    updatePlayPauseButton(false, false);
    document.body.classList.remove('is-playing');
    if (el.coverContainer) el.coverContainer.classList.remove('spinning');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    sendStateToServer();
    updateMediaSession();
    // a pause during a crossfade holds the old song's tail too (the fade follows its time, so it resumes in place)
    dropCrossfadePrep();
    pauseCrossfadeTail();

    const audio = el.nativeAudio;
    if (isAppClosing || !audio || audio.paused) {
      if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
        try {
          audioEngine.fadeGain.gain.cancelScheduledValues(audioEngine.ctx.currentTime);
          audioEngine.fadeGain.gain.setValueAtTime(0, audioEngine.ctx.currentTime);
        } catch (e) {}
      }
      if (audio) {
        try { audio.pause(); } catch (e) {}
      }
      if (state.secondaryAudio) {
        try { state.secondaryAudio.pause(); } catch (e) {}
      }
      if (audioEngine && audioEngine.flushEffects) {
        audioEngine.flushEffects();
      }
      return;
    }

    if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
      try {
        const ct = audioEngine.ctx.currentTime;
        audioEngine.fadeGain.gain.cancelScheduledValues(ct);
        audioEngine.fadeGain.gain.setTargetAtTime(0, ct, 0.06);
      } catch (e) {}
    }

    setTimeout(() => {
      if (curToken !== smoothFadeToken) return;
      if (audio) {
        try { audio.pause(); } catch (e) {}
      }
      if (state.secondaryAudio) {
        try { state.secondaryAudio.pause(); } catch (e) {}
      }
      if (audioEngine && audioEngine.flushEffects) {
        audioEngine.flushEffects();
      }
    }, 280);
  }

  async function playSmooth() {
    const curToken = ++smoothFadeToken;
    state.isPlaying = true;
    state.pausedByUser = false;
    document.body.classList.add('is-playing');
    updatePlayPauseButton(true, false);
    if (el.coverContainer && state.vfx.vinylSpin) el.coverContainer.classList.add('spinning');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    sendStateToServer();
    updateMediaSession();

    resumeCrossfadeTail();
    initAudioContext();
    if (audioEngine && audioEngine.ctx && audioEngine.needsResume()) {
      // in a backgrounded WebView resume() can hang until the app is opened; don't let it hold play() back (#24).
      // The 'play' / 'playing' handlers ask the context to resume again.
      await Promise.race([audioEngine.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
    }
    if (curToken !== smoothFadeToken) return;

    if (playback.crossfadeFadeInPending) {
      if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
        try {
          audioEngine.fadeGain.gain.cancelScheduledValues(audioEngine.ctx.currentTime);
          audioEngine.fadeGain.gain.setValueAtTime(1, audioEngine.ctx.currentTime);
        } catch (e) {}
      }
    } else {
      if (audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
        try {
          const ct = audioEngine.ctx.currentTime;
          audioEngine.fadeGain.gain.cancelScheduledValues(ct);
          audioEngine.fadeGain.gain.setValueAtTime(0, ct);
        } catch (e) {}
      }
    }

    if (el.nativeAudio) {
      const loadTok = state.loadToken;
      const playSrc = el.nativeAudio.currentSrc || el.nativeAudio.src;
      el.nativeAudio.play().catch((/** @type {unknown} */ e) => {
        // "[object DOMException]" told nobody anything (#17): say which one, and what the element was doing
        logPlaybackIssue('Play error', e);
        // AbortError: our own pause() or a newer src/load() interrupted this play(), not a failure
        if (e instanceof Error && e.name === 'AbortError') return;
        // a newer song (or a newer play/pause) took over meanwhile
        if (loadTok !== state.loadToken || curToken !== smoothFadeToken) return;
        if ((el.nativeAudio.currentSrc || el.nativeAudio.src) !== playSrc && !playback.hls) return;
        // a media error also fires the element's 'error' event, which retries / tells the listener itself
        if (el.nativeAudio.error) return;
        if (!el.nativeAudio.paused) return;
        // anything else (NotAllowedError, NotSupportedError without a media error): look it up afresh once
        if (retryFresh(loadTok, state.currentTrack)) return;
        // a refused play() (no gesture yet, source gone) left the button showing pause on a silent player.
        state.isPlaying = false;
        setTrackLoading(false);
        document.body.classList.remove('is-playing');
        updatePlayPauseButton(false, false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      });
    }

    if (!playback.crossfadeFadeInPending && audioEngine && audioEngine.fadeGain && audioEngine.ctx) {
      try {
        const ct = audioEngine.ctx.currentTime;
        audioEngine.fadeGain.gain.setTargetAtTime(1, ct, 0.05);
      } catch (e) {}
    }
  }

  window.pauseSmooth = pauseSmooth;
  window.playSmooth = playSmooth;

  let queueEndedToken = -1; // the song the queue ended on with repeat off, see the 'ended' handler
  function togglePlayPause() {
    if (!state.currentTrack) {
      if (state.queue.length > 0) playTrack(state.queue[0]);
      else if (el.nativeAudio && el.nativeAudio.src) {
        if (state.isPlaying) pauseSmooth();
        else playSmooth();
      }
      return;
    }
    if (state.isPlaying) {
      pauseSmooth();
      saveQueueState();
    } else if (queueEndedToken === state.loadToken && el.nativeAudio && el.nativeAudio.ended) {
      queueEndedToken = -1;
      playNext();
    } else if (el.nativeAudio && !el.nativeAudio.src && state.currentTrack) {
      const resumeAt = state.queueRestorePosition || 0;
      state.queueRestorePosition = 0;
      playTrack(state.currentTrack, state.queue, state.queueIndex);
      // playTrack bumps loadToken before its first await: a skip before the song loads must not seek the next one
      const resumeToken = state.loadToken;
      if (resumeAt > 3) {
        const seekOnce = () => {
          el.nativeAudio.removeEventListener('loadedmetadata', seekOnce);
          if (resumeToken !== state.loadToken) return;
          if (!el.nativeAudio.duration || resumeAt < el.nativeAudio.duration - 5) el.nativeAudio.currentTime = resumeAt;
        };
        el.nativeAudio.addEventListener('loadedmetadata', seekOnce);
      }
    } else {
      playSmooth();
    }
  }

  // The phone's earbuds played songs while this page wasn't running (mobile/media-controls.ts, ColdPlayer.java), and
  // may have got further in the queue: carry on from that song and place, as if it had played here. Only before
  // anything is loaded here (the page has just started). False when it can't.
  function restoreQueueAt(/** @type {number} */ index, /** @type {number} */ position, /** @type {boolean} */ play) {
    const t = state.queue[index];
    if (!t || state.isPlaying || (el.nativeAudio && el.nativeAudio.src)) return false;
    state.queueIndex = index;
    state.queueHistory = [index];
    state.currentTrack = t;
    state.queueRestorePosition = Math.max(0, Number(position) || 0);
    updateNowPlayingUI(t);
    onTrackAudioTrackChange();
    updateQueueBadge();
    renderQueueView();
    saveQueueState();
    if (play) togglePlayPause();
    return true;
  }

  // The native player was already playing a song of the queue when this page started (earbuds started it while
  // Uriel was closed; mobile/media-controls.ts): the page shows it as its own, without loading anything.
  function adoptQueueAt(/** @type {number} */ index) {
    const t = state.queue[index];
    if (!t || state.isPlaying) return false;
    state.queueIndex = index;
    state.queueHistory = [index];
    state.currentTrack = t;
    state.queueRestorePosition = 0;
    updateNowPlayingUI(t);
    onTrackAudioTrackChange();
    updateQueueBadge();
    renderQueueView();
    return true;
  }

  // With repeat off, the queue plays once: true while the last song of it plays. Repeat 'all' starts over
  // instead, and My Wave keeps adding songs.
  function queueFinished() {
    const q = state.queue;
    if (state.repeatMode !== 'off' || state.myWaveActive || !q.length) return false;
    return state.queueIndex >= q.length - 1;
  }

  function recordPlayedIndex(/** @type {number} */ idx) {
    if (typeof idx !== 'number' || idx < 0) return;
    const h = state.queueHistory;
    if (h[h.length - 1] !== idx) h.push(idx);
    if (h.length > 200) h.shift();
  }

  function playNext() {
    advancing = true;
    try { playNextSong(); } finally { advancing = false; }
  }

  function playNextSong() {
    if (state.queue.length === 0) return;

    if (!state._isNaturalEnding && state.myWaveActive && state.currentTrack) {
      const cur = (el.nativeAudio && typeof el.nativeAudio.currentTime === 'number') ? el.nativeAudio.currentTime : 0;
      if (cur < 12 && typeof recordWaveSkip === 'function') {
        recordWaveSkip(state.currentTrack);
        state._skipRecordedFor = (typeof getTrackCanonicalId === 'function' ? getTrackCanonicalId(state.currentTrack) : '') || state.currentTrack.id;
      }
    }

    let nextIdx = state.queueIndex + 1;
    while (nextIdx < state.queue.length && isBlocked(state.queue[nextIdx])) nextIdx++;
    if (nextIdx >= state.queue.length) {
      if (state.myWaveActive && typeof extendMyWaveQueue === 'function') {
        const tok = state.loadToken;
        setTrackLoading(true); // the next songs are still being picked
        const done = () => { if (tok === state.loadToken) setTrackLoading(false); };
        extendMyWaveQueue().then((/** @type {boolean} */ added) => {
          if (added && tok === state.loadToken && state.queueIndex + 1 < state.queue.length) {
            playNext();
          } else done();
        }, done);
        return;
      }
      nextIdx = 0;
      while (nextIdx < state.queueIndex && isBlocked(state.queue[nextIdx])) nextIdx++;
    }
    state.queueIndex = nextIdx;
    recordPlayedIndex(nextIdx);
    playTrack(state.queue[nextIdx]);

    if (state.myWaveActive && state.queueIndex >= state.queue.length - 3 && typeof extendMyWaveQueue === 'function') {
      extendMyWaveQueue();
    }
  }

  function playPrev() {
    if (el.nativeAudio && el.nativeAudio.currentTime > 3) {
      el.nativeAudio.currentTime = 0;
      return;
    }
    {
      const h = state.playHistory || [];
      if (h.length) {
        const prev = h.pop();
        navigatingBack = true;
        try { playTrack(prev); } finally { navigatingBack = false; }
        const prevIdx = state.queue.findIndex((/** @type {UrielTrack} */ t) => t.id === prev.id || isSameTrack(t, prev));
        if (prevIdx !== -1) state.queueIndex = prevIdx;
        return;
      }
    }
    if (state.queue.length === 0) return;

    const h = state.queueHistory;
    if (h.length > 1) {
      h.pop();
      const prevIdx = h[h.length - 1];
      if (prevIdx >= 0 && prevIdx < state.queue.length) {
        state.queueIndex = prevIdx;
        playTrack(state.queue[prevIdx]);
        return;
      }
      h.push(state.queueIndex);
    }

    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.queue.length - 1;
    state.queueIndex = prevIdx;
    state.queueHistory = [prevIdx];
    playTrack(state.queue[prevIdx]);
  }

  // Each look-up starts yt-dlp, which can run a JavaScript runtime at full CPU (#16). The song that plays next
  // is looked up first; the one after it (Riff 0.6) 20 s later, at background priority, so a run of skips
  // stays instant without two look-ups racing. Phones download whole songs, so they start halfway through.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let secondPrefetch;
  function prefetchNextQueueTrack() {
    const coming = (state.queue || []).slice(state.queueIndex + 1).filter((/** @type {UrielTrack} */ t) => !isBlocked(t)).slice(0, 2);
    const ask = (/** @type {UrielTrack | undefined} */ t, /** @type {boolean} */ first) => {
      if (!t || t.platform === 'local' || !(t.url || t.id)) return;
      const q = `url=${encodeURIComponent(t.url || '')}&id=${encodeURIComponent(t.id || '')}&platform=${t.platform || state.platform}&title=${encodeURIComponent(t.title || '')}&artist=${encodeURIComponent(t.artist || '')}&duration=${encodeURIComponent(t.duration || 0)}&thumbnail=${encodeURIComponent(t.thumbnail || '')}`;
      fetch(`http://127.0.0.1:${state.serverPort}/api/${isPhoneApp ? 'stream-info' : 'prefetch'}?${q}${first ? '&next=1' : ''}`).catch(() => {});
    };
    ask(coming[0], true);
    clearTimeout(secondPrefetch);
    // the phone warms up the next two itself as a song starts (see 'playing' below)
    if (!isPhoneApp && coming[1]) {
      const token = state.loadToken;
      secondPrefetch = setTimeout(() => { if (token === state.loadToken) ask(coming[1], false); }, 20000);
    }
  }

  if (el.nativeAudio) {
    el.nativeAudio.addEventListener('error', () => {
      // only an error on the song that is actually loaded counts (unloading one between songs is not a failure)
      if (!state.currentTrack || (!el.nativeAudio.src && !playback.hls)) return;
      logPlaybackIssue('Audio element error', null);
      if (recoverMidSong(state.loadToken, state.currentTrack)) return;
      state.isPlaying = false;
      document.body.classList.remove('is-playing');
      if (tryProxyFallback(state.loadToken, state.currentTrack)) return;
      if (retryFresh(state.loadToken, state.currentTrack)) return;
      updatePlayPauseButton(false, false);
      if (skipUnplayable(state.loadToken, state.currentTrack)) return;
      if (state.currentTrack.platform === 'local') showPlayFailure(Tm('File missing from library'), 'info');
      else showPlayFailure(Tm('Could not play this song. Try again or skip.'));
    });

    el.nativeAudio.addEventListener('waiting', () => {
      updatePlayPauseButton(state.isPlaying, true);
      if (!el.nativeAudio.paused) watchStall();
    });
    el.nativeAudio.addEventListener('stalled', () => { if (!el.nativeAudio.paused) watchStall(); });
    ['playing', 'pause', 'emptied'].forEach((ev) => el.nativeAudio.addEventListener(ev, clearStall));

    // A stream that stops delivering mid-song (an expired or throttled link) is looked up afresh after 12 s
    // and continues where it stopped, instead of spinning forever (Riff 44)
    /** @type {ReturnType<typeof setTimeout> | null} */
    let stallTimer = null;
    function clearStall() { if (stallTimer) clearTimeout(stallTimer); stallTimer = null; }
    function watchStall() {
      clearStall();
      const token = state.loadToken;
      const track = state.currentTrack;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        const a = el.nativeAudio;
        if (token !== state.loadToken || track !== state.currentTrack || a.paused || a.readyState >= 3) return;
        if (!track || track.platform === 'local' || state.trackLoading) return;
        recoverMidSong(token, track);
      }, 12000);
    }

    // whichever look-up brings the stream back (a failed one is tried again): it continues at the saved place
    el.nativeAudio.addEventListener('loadedmetadata', () => {
      const r = resumeAt;
      if (!r || r.token !== state.loadToken) return;
      const pos = window.UrielPlaybackRecovery.resumePosition(r.pos, el.nativeAudio.duration);
      if (pos) el.nativeAudio.currentTime = pos;
    });

    el.nativeAudio.addEventListener('playing', () => {
      notePlayedThisSession(state.currentTrack);
      resumeAt = null;
      failStreak = 0;
      state.isPlaying = true;
      setTrackLoading(false);
      registerMediaActions();
      document.body.classList.add('is-playing');
      updatePlayPauseButton(true, false);
      // phones warm up the next two songs (staggered) so skipping or a slow network never leaves a gap;
      // the computer looks up the next two from prefetchNextQueueTrack, once this one has played 10 s (#16)
      const upcoming = !isPhoneApp ? [] : [1, 2].map(ahead => state.queue && state.queue[state.queueIndex + ahead]);
      upcoming.forEach((nextTrack, k) => {
        if (nextTrack && nextTrack.url && nextTrack.platform !== 'local') {
          setTimeout(() => {
            fetch(`http://127.0.0.1:${state.serverPort}/api/prefetch?url=${encodeURIComponent(nextTrack.url || '')}&id=${encodeURIComponent(nextTrack.id || '')}&platform=${nextTrack.platform || state.platform}&title=${encodeURIComponent(nextTrack.title || '')}&artist=${encodeURIComponent(nextTrack.artist || '')}&duration=${encodeURIComponent(nextTrack.duration || 0)}&thumbnail=${encodeURIComponent(nextTrack.thumbnail || '')}`).catch(() => {});
          }, 2000 + k * 6000);
        }
      });
    });

    el.nativeAudio.addEventListener('canplay', () => {
      updatePlayPauseButton(state.isPlaying, false);
    });

    el.nativeAudio.addEventListener('play', () => {
      emitPluginEvent('play');
      if (!hasNotifiedMediaKeysActive) {
        hasNotifiedMediaKeysActive = true;
        if (window.electronAPI && window.electronAPI.mediaKeysActive) {
          window.electronAPI.mediaKeysActive();
        }
      }
      updatePlayPauseButton(true, false);
      if (!state.isPlaying) {
        state.isPlaying = true;
        document.body.classList.add('is-playing');
        if (el.coverContainer && state.vfx.vinylSpin) el.coverContainer.classList.add('spinning');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
        sendStateToServer();
        updateMediaSession();
      }
      updateMediaPositionState();
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId) startVisualizers();
      if (audioEngine) {
        if (audioEngine.resumeAudioContext) audioEngine.resumeAudioContext();
        audioEngine._applyMasterVolume();
      }
      if (playback.crossfadeFadeInPending) {
        playback.crossfadeFadeInPending = false;
        crossfadeFadeIn();
      }
      sendStateToServer();
      updateMediaSession();
      if (typeof m3cStart === 'function') m3cStart();
    });

    el.nativeAudio.addEventListener('pause', () => {
      if (!el.nativeAudio.ended) cancelEndFade();
      emitPluginEvent('pause');
      updatePlayPauseButton(false, false);
      if (state.isPlaying) {
        state.isPlaying = false;
        document.body.classList.remove('is-playing');
        if (el.coverContainer) el.coverContainer.classList.remove('spinning');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        sendStateToServer();
        updateMediaSession();
      }
      updateMediaPositionState();
      if (audioEngine) {
        if (audioEngine.suspendAudioContextDebounced) audioEngine.suspendAudioContextDebounced(5000);
        if (audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(false);
      }
      if (typeof applyM3Cover === 'function') applyM3Cover();
    });

    el.nativeAudio.addEventListener('ended', () => {
      updatePlayPauseButton(false, false);
      if (state.sleepTimer && state.sleepTimer.mode === 'end') {
        state.sleepTimer = null;
        updateSleepTimerUI();
        return;
      }
      if (audioEngine) {
        if (audioEngine.suspendAudioContextDebounced) audioEngine.suspendAudioContextDebounced(5000);
        if (audioEngine.setAnalyserEnabled) audioEngine.setAnalyserEnabled(false);
      }
      // a song that faded out (Crossfade) hands over to one that fades in
      const fadedOut = playback.crossfadeTriggered && !state.isRepeat && !queueFinished();
      if (!fadedOut) cancelEndFade();
      if (state.isRepeat) {
        el.nativeAudio.currentTime = 0;
        playSmooth();
      } else if (queueFinished()) {
        // repeat is off and that was the last song: stop here; play starts the queue over
        queueEndedToken = state.loadToken;
        saveQueueState();
      } else {
        if (fadedOut) playback.crossfadeFadeInPending = true;
        state._isNaturalEnding = true;
        try {
          playNext();
        } finally {
          state._isNaturalEnding = false;
        }
      }
    });

    // speed / pitch (Sound settings) for every song: iPhones put playbackRate back to 1 once a new song
    // has loaded, which undid the settings applied when it started loading (issue #5)
    const keepPlaybackRate = () => {
      if (!audioEngine || !audioEngine.playbackFor) return;
      const { rate, preservePitch } = audioEngine.playbackFor();
      const a = el.nativeAudio;
      if (Math.abs(a.playbackRate - rate) > 0.001 || a.preservesPitch !== preservePitch) audioEngine.applySettings(a);
    };
    ['loadedmetadata', 'canplay', 'playing'].forEach(ev => el.nativeAudio.addEventListener(ev, keepPlaybackRate));

    // The iPhone's Now Playing widget moves its progress bar on its own from the last position and rate it was
    // given. Told only at play / pause, it kept the rate WebKit had reset to 1 before the song's speed was put
    // back (a sped-up song's bar lagged), and a length that wasn't known yet (#26). Tell it again whenever any
    // of them changes, and now and then while playing.
    let positionSentAt = 0;
    const sendPosition = () => { positionSentAt = Date.now(); updateMediaPositionState(); };
    ['ratechange', 'durationchange', 'loadedmetadata', 'seeked', 'playing'].forEach(ev => el.nativeAudio.addEventListener(ev, sendPosition));
    el.nativeAudio.addEventListener('timeupdate', () => {
      if (!el.nativeAudio.paused && Date.now() - positionSentAt > 10000) sendPosition();
    });

    el.nativeAudio.addEventListener('durationchange', () => {
      const audio = el.nativeAudio;
      if (state.currentTrack && Number.isFinite(audio.duration) && audio.duration > 1) {
        const newDur = Math.round(audio.duration);
        if (Math.abs(audio.duration - (state.currentTrack.duration || 0)) > 1.5) {
          state.currentTrack.duration = newDur;
          const tid = state.currentTrack.id;
          if (Array.isArray(state.queue)) {
            state.queue.forEach((t) => { if (t && t.id === tid) t.duration = newDur; });
          }
          if (Array.isArray(state.playlists)) {
            state.playlists.forEach((p) => {
              if (p && Array.isArray(p.tracks)) {
                p.tracks.forEach((/** @type {UrielTrack} */ t) => { if (t && t.id === tid) t.duration = newDur; });
              }
            });
          }
        }
        if (el.timeDuration) el.timeDuration.textContent = formatDuration(newDur);
      }
      updateMediaPositionState();
    });

    el.nativeAudio.addEventListener('seeked', () => {
      cancelEndFade(); // timeupdate fades again from here if the seek stayed inside the last seconds
      updateMediaPositionState();
      updateDiscordPresence();
      state.forceLyricsScroll = true;
      state.forceSnapLyrics = true;
      state.lastActiveLyricIdx = -1;
      if (state.isRightPanelOpen || state.isTvKaraokeOpen) {
        updateSyncedLyricsHighlight(el.nativeAudio.currentTime || 0);
      }
    });

    let lastTimeupdateSec = -1;
    el.nativeAudio.addEventListener('timeupdate', () => {
      if (enforceTrackTrim()) return;
      const cur = (el.nativeAudio && Number.isFinite(el.nativeAudio.currentTime)) ? el.nativeAudio.currentTime : 0;
      const dur = (el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0)
        ? el.nativeAudio.duration
        : (state.currentTrack && Number.isFinite(state.currentTrack.duration) ? state.currentTrack.duration : 0);
      if (state.isTvKaraokeOpen) syncTvkProgress(cur, dur);
      if (miniLyricsShown()) updateMiniLyricsHighlight(cur);

      // Crossfade (off by default): fade the song out over its last X seconds while it keeps playing; the
      // 'ended' handler starts the next one, which fades in. This used to skip to the next song X seconds before
      // the end, which cut every song short by the crossfade length (#22).
      // With overlap (#29) the last X seconds move to a second player that plays them to the end while the next
      // song starts (prepareCrossfade); the song itself is never cut short.
      const X = crossfadeSeconds();
      if (X > 0 && !playback.crossfadeTriggered && !state.isRepeat && !el.nativeAudio.paused && audioEngine && !audioEngine.isLiveStream(el.nativeAudio) && window.UrielTrim) {
        const trim = state.currentTrack ? getTrackTrim(state.currentTrack) : null;
        const end = trim && window.UrielTrim.isActive(trim) ? Math.min(trim.end, dur) : dur;
        const sleepAtEnd = state.sleepTimer && state.sleepTimer.mode === 'end';
        const step = !sleepAtEnd && canOverlap(el.nativeAudio) && !queueFinished() ? window.UrielTrim.crossfadeStep(cur, end, X, el.nativeAudio.playbackRate) : null;
        if (step && !crossfadePrepared()) {
          const point = window.UrielTrim.crossfadePoint(end, X);
          if (point !== null) prepareCrossfade(point, end);
        } else if (!step && !crossfadePrepared()) {
          const fade = window.UrielTrim.endFadeSeconds(cur, end, X, el.nativeAudio.playbackRate);
          if (fade > 0) {
            playback.crossfadeTriggered = true;
            audioEngine.fadeOut(fade);
          }
        }
      }

      if (state.isPlaying && nextPrefetchDue(cur, dur) && !state.nextTrackPrefetched) {
        state.nextTrackPrefetched = true;
        prefetchNextQueueTrack();
      }

      if (!state.isPlaying && typeof m3cDraw === 'function' && typeof m3cEnabled === 'function' && m3cEnabled()) {
        m3cDraw(performance.now());
      }

      if (playback.isDraggingScrubber || state.isPlaying) return;
      const roundedSec = Math.floor(cur);
      if (lastTimeupdateSec === roundedSec) return;
      lastTimeupdateSec = roundedSec;
      if (state.isRightPanelOpen || state.isTvKaraokeOpen) {
        updateSyncedLyricsHighlight(cur);
      }
      if (el.timeCurrent) el.timeCurrent.textContent = formatDuration(cur);
      if (el.timeDuration) el.timeDuration.textContent = formatDuration(dur);
    });
  }


  function updateScrubberPositionFromEvent(/** @type {PointerEvent} */ e) {
    if (!el.scrubberTrack) return 0;
    const rect = el.scrubberTrack.getBoundingClientRect();
    const padLeft = 5.5;
    const trackWidth = rect.width - 2 * padLeft;
    let pos = trackWidth > 0 ? (e.clientX - rect.left - padLeft) / trackWidth : 0;
    pos = Math.max(0, Math.min(1, pos));
    const dur = (el.nativeAudio && Number.isFinite(el.nativeAudio.duration) && el.nativeAudio.duration > 0)
      ? el.nativeAudio.duration
      : (state.currentTrack && Number.isFinite(state.currentTrack.duration) ? state.currentTrack.duration : 0);
    const targetTime = pos * dur;

    state.scrubberDragTargetTime = targetTime;
    if (el.timeCurrent) el.timeCurrent.textContent = formatDuration(targetTime);
    return targetTime;
  }

  // Pointer events (not mouse events) so a finger drag scrubs too: on Android a touch drag never fires
  // mousemove, only the tap's synthesized mousedown/mouseup, so only tapping used to seek (#21).
  /** @type {number | null} */
  let scrubberPointerId = null;
  if (el.scrubberTrack) {
    el.scrubberTrack.style.touchAction = 'none';
    el.scrubberTrack.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      playback.isDraggingScrubber = true;
      scrubberPointerId = e.pointerId;
      try { el.scrubberTrack.setPointerCapture(e.pointerId); } catch (_) {}
      viz.hasDrawnPausedFrame = false;
      if (!viz.animationFrameId) startVisualizers();
      el.scrubberTrack.classList.add('dragging');
      updateScrubberPositionFromEvent(e);
    });
  }

  window.addEventListener('pointermove', (e) => {
    if (!playback.isDraggingScrubber || e.pointerId !== scrubberPointerId) return;
    updateScrubberPositionFromEvent(e);
  });

  const endScrub = (/** @type {PointerEvent} */ e, /** @type {boolean} */ commit) => {
    if (!playback.isDraggingScrubber || e.pointerId !== scrubberPointerId) return;
    playback.isDraggingScrubber = false;
    scrubberPointerId = null;
    if (el.scrubberTrack) el.scrubberTrack.classList.remove('dragging');
    const targetTime = commit ? updateScrubberPositionFromEvent(e) : state.scrubberDragTargetTime;
    if (targetTime !== undefined && !isNaN(targetTime) && el.nativeAudio) {
      el.nativeAudio.currentTime = targetTime;
      updateMediaPositionState();
    }
    state.scrubberDragTargetTime = undefined;
  };
  window.addEventListener('pointerup', (e) => endScrub(e, true));
  window.addEventListener('pointercancel', (e) => endScrub(e, false));

  /** @type {UrielPlaybackPart} */
  const api = { playTrack, shuffleQueue, unshuffleQueue, pauseSmooth, playSmooth, togglePlayPause, restoreQueueAt, adoptQueueAt, queueFinished, playNext, playPrev, prefetchNextQueueTrack, skipUnplayable, retryFresh, showPlayFailure };
  Object.assign(out, api);
};
