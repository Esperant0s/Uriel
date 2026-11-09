// Android "now playing" controls: the notification, lock screen, quick-settings media player and headset
// buttons. Android's WebView doesn't turn navigator.mediaSession into system controls the way iOS does,
// so the song and play state go to a native media session (android/.../MediaControlsPlugin.java) and its
// buttons come back here.
const { Capacitor, registerPlugin } = require('@capacitor/core');
const { cachedName, thumbName, playingPath } = require('./song-files');

module.exports = function mediaControls() {
  if (Capacitor.getPlatform() !== 'android') return;
  const plugin = registerPlugin('UrielMedia');
  const core = () => window.UrielCore;
  let pending = 0;
  // The song in the island at the top of the screen (Android 16+, a "Live Update" beside the playback notification;
  // see MediaControlsPlugin). 'on' / 'off' once picked in Settings; until then the phone's default: on for vivo,
  // whose Origin Island won't take Uriel's playback notification itself.
  const ISLAND = 'uriel_android_island';
  const islandMode = () => { const v = localStorage.getItem(ISLAND); return v === 'on' || v === 'off' ? v : 'auto'; };

  const artOf = (c, t) => {
    let art = '';
    try { art = (c.thumb && c.thumb(t)) || t.thumbnail || ''; } catch (e) { art = t.thumbnail || ''; }
    return /^https:\/\//.test(art) ? art : '';
  };
  const songInfo = (c, t, qi, cache = cachedName(t)) => ({
    qi, title: t.title || '', artist: t.artist || '', album: t.album || '', artwork: artOf(c, t),
    duration: Number(t.duration) || 0, cache, thumb: thumbName(t),
  });

  // What earbuds can play while the page isn't running (ColdPlayer.java): this song, and the songs after it in the
  // queue that are saved on the phone (wrapping round with repeat or shuffle on, as the queue does).
  function forEarbuds(c, t, a) {
    const st = c.state;
    const q = Array.isArray(st.queue) ? st.queue : [];
    // the song brought back from last time is a copy, not the queue's own object
    const same = (x) => x === t || (!!x && !!c.isSameTrack && c.isSameTrack(x, t));
    const qi = same(q[st.queueIndex]) ? st.queueIndex : q.findIndex(same);
    const resume = songInfo(c, t, qi);
    // a downloaded song or one on the phone plays from where it is; one still loading isn't this song's file yet
    const where = !resume.cache && a.src && !st.trackLoading ? playingPath(a) : '';
    if (where) resume.path = where;
    const upcoming = [];
    // a song played outside the queue: nothing comes after it
    if (qi < 0) return { resume, upcoming };
    const wrap = st.repeatMode === 'all' || st.isShuffle;
    for (let k = 1; k < q.length && k <= 300 && upcoming.length < 30; k++) {
      let i = qi + k;
      if (i >= q.length) { if (!wrap) break; i -= q.length; }
      if (i === qi || !q[i]) continue;
      // only the songs saved on the phone, looked up before anything else about them
      const cache = cachedName(q[i]);
      if (cache) upcoming.push(songInfo(c, q[i], i, cache));
    }
    return { resume, upcoming };
  }

  function send() {
    pending = 0;
    const c = core();
    const t = c && c.state.currentTrack;
    const a = c && c.audio;
    if (!t || !a) return;
    const art = artOf(c, t);
    const duration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(t.duration) || 0;
    // the song brought back from last time isn't loaded yet: where it will start
    const position = a.src ? a.currentTime || 0 : Number(c.state.queueRestorePosition) || 0;
    let earbuds = {};
    try {
      earbuds = forEarbuds(c, t, a);
      // while a song loads the element still tells the last song's place: this one starts from its top
      earbuds.resumePosition = c.state.trackLoading ? 0 : Math.min(position, duration || Infinity);
    } catch (e) {}
    // the native player shows the song itself (its own notification and session): this side keeps the island, the
    // place for earbuds and staying awake while the next song loads
    const external = a.backend === 'native';
    if (a.player) a.player.setModes({ shuffle: !!c.state.isShuffle, repeat: c.state.repeatMode || (c.state.isRepeat ? 'one' : 'off') }).catch(() => {});
    plugin.update({
      ...earbuds,
      external,
      title: t.title || '',
      artist: t.artist || '',
      album: t.album || '',
      artwork: art,
      duration,
      position: Math.min(position, duration || Infinity),
      playing: !!c.state.isPlaying,
      // between two songs nothing plays, but Uriel still has to stay in the foreground (see MediaControlsPlugin)
      loading: !c.state.isPlaying && !!c.state.trackLoading,
      rate: a.playbackRate || 1,
      shuffle: !!c.state.isShuffle,
      repeat: c.state.repeatMode || (c.state.isRepeat ? 'one' : 'off'), // 'off', 'all' or 'one'
      island: islandMode(),
    }).catch(() => {});
  }
  // several events arrive together on a song change; send once
  const update = () => { if (!pending) pending = setTimeout(send, 80); };

  // For the island row in Settings (mobile-ui.js). status(): { supported (Android 16+), vendor ('vivo', 'oplus',
  // 'xiaomi', 'samsung', 'honor' or 'other'), defaultOn, notifications (allowed), promoted (the phone's switch for
  // live updates) }. allow(): asks for notifications or opens that switch, whichever is missing; resolves with status.
  const ask = (method, ...args) => Promise.resolve().then(() => plugin[method](...args)).then((s) => s || {}).catch(() => ({}));
  const island = window.UrielIsland = {
    status: () => ask('islandStatus'),
    enabled: (status) => (islandMode() === 'auto' ? !!(status && status.defaultOn) : islandMode() === 'on'),
    setEnabled: (on) => { localStorage.setItem(ISLAND, on ? 'on' : 'off'); update(); },
    allow: (opts) => ask('allowIsland', opts),
    // back from the phone's settings: a switch turned on there shows the island right away
    refresh: () => update(),
  };

  // Some phones stop apps in the background to save battery, music or not. For the "Play in the background"
  // row in Settings (mobile-ui.js), and asked once by itself when the first song starts.
  const background = window.UrielBackground = {
    allowed: () => plugin.backgroundStatus().then((r) => !!(r && r.unrestricted)).catch(() => true),
    // resolves with the answer once the system dialog is closed
    allow: () => plugin.allowBackground().then((r) => !!(r && r.unrestricted)).catch(() => false),
  };
  const ASKED = 'uriel_bg_asked';
  // Android 13+ shows an app's notifications only once it asked for them; many phones hide the playback notification
  // too, and then there is no play button after a game or a call took the music (#25). The island needs them as
  // well. Asked once, after the battery question (the key is older than this: phones asked for the island aren't
  // asked again). Before Android 13 notifications are on unless turned off, and then this does nothing.
  const NOTIFY_ASKED = 'uriel_island_asked';
  const askNotificationsOnce = () => island.status().then((s) => {
    if (s.notifications !== false || localStorage.getItem(NOTIFY_ASKED) || document.hidden) return;
    localStorage.setItem(NOTIFY_ASKED, '1');
    return island.allow({ settings: false });
  });
  const askOnce = () => {
    const first = localStorage.getItem(ASKED) || document.hidden ? Promise.resolve()
      : (localStorage.setItem(ASKED, '1'), background.allowed().then((ok) => { if (!ok) return background.allow(); }));
    first.then(askNotificationsOnce).catch(() => {});
  };

  function hook() {
    const c = core();
    if (!c || !c.audio) return;
    window.addEventListener('uriel:track', update);
    window.addEventListener('uriel:loading', update);
    window.addEventListener('uriel:modes', update);
    // the native player stepped aside for sound effects, or back: the other one shows the song now
    window.addEventListener('uriel:backend', update);
    ['playing', 'pause', 'seeked', 'ratechange', 'durationchange', 'ended'].forEach((ev) => c.audio.addEventListener(ev, update));
    c.audio.addEventListener('playing', askOnce, { once: true });
    window.addEventListener('uriel:downloads', ({ detail: d = {} }) => {
      Promise.resolve().then(() => plugin.downloading({ active: !!d.active, title: d.title || '', done: d.done || 0, total: d.total || 0, percent: d.percent == null ? -1 : d.percent })).catch(() => {});
    });
    // earbuds or a headset asked for music: the last song, or from the top of favourites if there is none yet
    const startMusic = () => {
      const c = core();
      const st = c.state;
      if (st.currentTrack) { if (!st.isPlaying) c.togglePlay(); return true; }
      const list = (st.favorites && st.favorites.length ? st.favorites : st.history) || [];
      if (!list.length) return false;
      c.playTrack(list[0], list, 0);
      return true;
    };
    // Earbuds played songs saved on the phone while the page wasn't running (ColdPlayer.java): carry on from the same
    // song and place. Playing if it still played just now, or if earbuds opened the app for music. True when done.
    const takeOver = (n, start) => {
      const c = core();
      const st = c.state;
      const q = Array.isArray(st.queue) ? st.queue : [];
      const same = (t) => !!t && (t.title || '') === (n.title || '') && (t.artist || '') === (n.artist || '');
      const i = Number.isInteger(n.qi) && same(q[n.qi]) ? n.qi : q.findIndex(same);
      if (i < 0 || !c.restoreAt) return false;
      const play = n.live ? !!n.playing : !!start;
      if (!n.ended) return c.restoreAt(i, Number(n.position) || 0, play);
      // its songs ran out after this one: the next one, from the page (after the queue's end, from its top, as Play
      // does on the page once the queue has ended)
      if (!c.restoreAt(i, 0, false)) return false;
      if (play) c.next();
      return true;
    };
    // opened for earbuds or a headset that asked for music while Uriel wasn't running (MediaButtonReceiver): play
    // and when earbuds opened it (not a person), it steps back out of sight once the music plays, as Spotify's would
    // The native player (PlayerService.kt) already has a song: earbuds started it while Uriel was closed, or it played
    // on after the app was. The page carries on with it, playing or paused, without loading anything.
    const a0 = c.audio;
    const adoptNative = () => Promise.resolve(a0.attached).then((s) => {
      if (!s || !s.item || !a0.adopt || !c.adoptAt) return false;
      const st = c.state;
      const q = Array.isArray(st.queue) ? st.queue : [];
      const same = (t) => !!t && (t.title || '') === (s.item.title || '') && (t.artist || '') === (s.item.artist || '');
      const i = Number.isInteger(s.item.qi) && same(q[s.item.qi]) ? s.item.qi : q.findIndex(same);
      // a song no longer in the queue: the page's own song stands
      if (i < 0 || !c.adoptAt(i)) { if (a0.player) a0.player.clear().catch(() => {}); return false; }
      return a0.adopt(s);
    }).catch(() => false);
    Promise.resolve(a0.attached ? adoptNative() : false).then((adopted) => plugin.takeStartPlay().then(({ start, background, native } = {}) => {
      let taken = !!adopted;
      try { if (!taken) taken = !!native && takeOver(native, start); } catch (e) {}
      if (!start || !(taken || startMusic()) || !background) return;
      c.audio.addEventListener('playing', () => Promise.resolve().then(() => plugin.moveToBack()).catch(() => {}), { once: true });
    })).catch(() => {});
    // Uriel just started with last time's song on screen but nothing playing: Android only sends earbud and
    // headset taps to a media session that is switched on, and until now that happened when a song first played,
    // so a tap went nowhere (or to another app) until a song was started by hand. Paused, with the song.
    if (core().state.currentTrack) update();
    const onAction = ({ action, position } = {}) => {
      const st = core().state;
      if (action === 'cancel-downloads') { window.dispatchEvent(new Event('uriel:cancel-downloads')); return; }
      if (action === 'play') { if (!st.isPlaying && !startMusic()) update(); }
      else if (action === 'pause') { if (st.isPlaying) core().togglePlay(); }
      else if (action === 'next') core().next();
      else if (action === 'prev') core().prev();
      else if (action === 'seek' && Number.isFinite(position)) core().seek(position);
      else if (action === 'shuffle') core().toggleShuffle();
      else if (action === 'repeat') core().toggleRepeat();
      // the native side already counts play / next / previous as playing; if nothing started, it hears so
      update();
    };
    plugin.addListener('action', onAction);
    // the native player's buttons: the notification, lock screen, earbuds and Bluetooth (PlayerService.kt)
    if (c.audio.player) c.audio.player.addListener('action', onAction);
  }
  if (window.UrielCore) hook(); else window.addEventListener('uriel:ready', hook, { once: true });
};
