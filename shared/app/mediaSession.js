// @ts-check
// What the system knows about the playing song: the lock screen / media keys (Media Session), the play state
// sent to the local server, and Show on Discord. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielMediaSessionPart} out */
window.UrielApp.mediaSession = function ({ el, getTrackThumbUrl, pauseSmooth, playNext, playPrev, state, togglePlayPause, updateSyncedLyricsHighlight }, out) {
  function sendStateToServer(currentWordText = '', wordIndex = -1, lineIndex = -1) {
    if (!state.currentTrack) return;
    fetch(`http://127.0.0.1:${state.serverPort}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: state.currentTrack.title,
        artist: state.currentTrack.artist,
        isPlaying: state.isPlaying,
        word: currentWordText,
        wordIndex: wordIndex,
        lineIndex: lineIndex
      })
    }).catch(() => {});
  }

  function getMediaArtwork(/** @type {string | undefined} */ thumb) {
    if (!thumb || typeof thumb !== 'string') return [];
    const trimmed = thumb.trim();
    if (!trimmed) return [];
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:')) {
      return [];
    }
    let type = 'image/jpeg';
    if (trimmed.startsWith('data:image/png') || /\.png(\?|$)/i.test(trimmed)) type = 'image/png';
    else if (trimmed.startsWith('data:image/webp') || /\.webp(\?|$)/i.test(trimmed)) type = 'image/webp';
    else if (trimmed.startsWith('data:image/gif') || /\.gif(\?|$)/i.test(trimmed)) type = 'image/gif';
    return [
      { src: trimmed, sizes: '96x96', type },
      { src: trimmed, sizes: '128x128', type },
      { src: trimmed, sizes: '192x192', type },
      { src: trimmed, sizes: '256x256', type },
      { src: trimmed, sizes: '512x512', type }
    ];
  }

  function updateMediaPositionState() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    try {
      const audio = (state.secondaryAudio && !state.secondaryAudio.paused) ? state.secondaryAudio : el.nativeAudio;
      const pos = window.UrielNowPlaying.positionState(audio, state.currentTrack && state.currentTrack.duration);
      if (pos) navigator.mediaSession.setPositionState(pos);
      else navigator.mediaSession.setPositionState();
    } catch (_) {}
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let discordPresenceClearTimer = null;
  // off unless turned on in Settings (it tells everyone on Discord what you're listening to)
  const discordPresenceOn = () => localStorage.getItem('uriel_discord_presence') === 'true';
  function updateDiscordPresence() {
    const api = window.electronAPI;
    if (!api) return;
    if (!discordPresenceOn()) return;
    if (!state.currentTrack) {
      if (discordPresenceClearTimer) clearTimeout(discordPresenceClearTimer);
      discordPresenceClearTimer = setTimeout(() => {
        discordPresenceClearTimer = null;
        if (!state.currentTrack && api.discordPresenceClear) api.discordPresenceClear();
      }, 1500);
      return;
    }
    if (discordPresenceClearTimer) {
      clearTimeout(discordPresenceClearTimer);
      discordPresenceClearTimer = null;
    }
    if (!api.discordPresenceUpdate) return;

    const track = state.currentTrack;
    const audio = (state.secondaryAudio && !state.secondaryAudio.paused) ? state.secondaryAudio : el.nativeAudio;
    const duration = Number(track.duration) > 0
      ? Number(track.duration)
      : (audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    const position = audio && Number.isFinite(audio.currentTime) && audio.currentTime >= 0
      ? audio.currentTime
      : 0;
    const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(track) : '') || track.thumbnail || '';
    const isRemoteUrl = (/** @type {unknown} */ value) => typeof value === 'string' && /^https?:\/\//i.test(value) && !value.includes('127.0.0.1');
    const link = typeof track.url === 'string' && /^https:\/\//i.test(track.url) ? track.url : '';
    api.discordPresenceUpdate({
      title: track.title || 'Unknown Song',
      artist: track.artist || 'Unknown Artist',
      duration,
      position,
      isPlaying: !!state.isPlaying,
      thumbnail: isRemoteUrl(thumb) ? thumb : '',
      url: link
    });
  }

  function updateMediaSession() {
    updateDiscordPresence();
    if (!('mediaSession' in navigator)) return;
    if (state.currentTrack) {
      const rawTitle = (typeof state.currentTrack.title === 'string' ? state.currentTrack.title.trim() : '');
      const rawArtist = (typeof state.currentTrack.artist === 'string' ? state.currentTrack.artist.trim() : '');
      const rawAlbum = (typeof state.currentTrack.album === 'string' ? state.currentTrack.album.trim() : '');
      const title = rawTitle || 'Unknown song';
      const artist = rawArtist || 'Unknown artist';
      const thumb = (typeof getTrackThumbUrl === 'function' ? getTrackThumbUrl(state.currentTrack) : '') || state.currentTrack.thumbnail || '';
      const artwork = getMediaArtwork(thumb);
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album: rawAlbum,
        artwork
      });
      updateMediaPositionState();
    } else {
      navigator.mediaSession.metadata = null;
    }
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  }

  /** @type {Record<string, string>} */
  const MEDIA_GROUP = { toggle: 'pp', play: 'pp', pause: 'pp', next: 'next', prev: 'prev', stop: 'stop' };
  let lastMedia = { g: '', t: 0 };
  function handleMediaCommand(/** @type {string} */ cmd, /** @type {string} */ src) {
    const g = MEDIA_GROUP[cmd];
    if (!g) return;
    const now = performance.now();
    if (lastMedia.g === g && now - lastMedia.t < 350) return;
    lastMedia = { g, t: now };
    if (cmd === 'toggle') togglePlayPause();
    // togglePlayPause also handles a restored session that has no audio loaded yet (lock screen / headset play)
    else if (cmd === 'play') { if (!state.isPlaying) togglePlayPause(); }
    else if (cmd === 'pause') { if (state.isPlaying) pauseSmooth(); }
    else if (cmd === 'next') playNext();
    else if (cmd === 'prev') playPrev();
    else if (cmd === 'stop') { if (state.isPlaying) pauseSmooth(); }
  }

  // Lock screen / Control Center / headset buttons. iOS forgets these whenever one song is unloaded for the
  // next, and with none registered it shows its own ±15 s skip buttons instead of previous / next (the
  // "songs act like podcasts" report), so they are registered again every time a song starts.
  const mediaActions = {
    play: () => handleMediaCommand('play', 'session'),
    pause: () => handleMediaCommand('pause', 'session'),
    previoustrack: () => handleMediaCommand('prev', 'session'),
    nexttrack: () => handleMediaCommand('next', 'session'),
    stop: () => handleMediaCommand('stop', 'session'),
    seekto: (/** @type {MediaSessionActionDetails} */ details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        const audio = (state.secondaryAudio && !state.secondaryAudio.paused) ? state.secondaryAudio : el.nativeAudio;
        if (audio) audio.currentTime = details.seekTime;
        if (typeof updateSyncedLyricsHighlight === 'function') {
          updateSyncedLyricsHighlight(details.seekTime);
        }
        updateMediaPositionState();
        updateDiscordPresence();
      }
    },
    // skip buttons take the place of previous / next on the iPhone lock screen
    seekbackward: null,
    seekforward: null,
  };
  function registerMediaActions() {
    if (!('mediaSession' in navigator)) return;
    for (const [action, handler] of Object.entries(mediaActions)) {
      // one action the browser doesn't know must not stop the others
      try { navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), handler); } catch (_) {}
    }
  }
  registerMediaActions();

  /** @type {UrielMediaSessionPart} */
  const api = { sendStateToServer, getMediaArtwork, updateMediaPositionState, updateDiscordPresence, updateMediaSession, handleMediaCommand, registerMediaActions, discordPresenceOn };
  Object.assign(out, api);
};
