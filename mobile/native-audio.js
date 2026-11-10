// Android: the page's <audio> element, played by the native player (android/.../PlayerService.kt, Media3/ExoPlayer).
//
// shared/app.js plays everything through one <audio> element. On Android this object takes its place: it has the
// same properties, methods and events app.js uses, and sends the songs to the native player, which keeps playing in
// the background, answers earbuds and Bluetooth, and starts the last song again from earbuds once Uriel was closed.
//
// The sound settings (Enhance, EQ, Effects, Normalize volume) run in the native player too (EffectsProcessor.kt): this
// sends them along. The old song's last seconds during a crossfade play in a second native player (NativeTail).
// Only a stream the native player can't open (hls.js, a blob) still plays through the real element ("web").
const { registerPlugin } = require('@capacitor/core');
const { cachedName, thumbName, fileOfUrl } = require('./song-files');

// the element's events app.js and the rest listen to, passed on from the real element while it plays
const EVENTS = ['loadstart', 'emptied', 'loadedmetadata', 'loadeddata', 'durationchange', 'canplay', 'canplaythrough',
  'play', 'playing', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'timeupdate', 'ended', 'error', 'ratechange',
  'volumechange', 'progress', 'suspend', 'abort'];
const STATE = { IDLE: 1, LOADING: 2, READY: 3, ENDED: 4 };
// HTMLMediaElement error codes
const ERR = { NETWORK: 2, DECODE: 3, SRC_NOT_SUPPORTED: 4 };

class NativeAudio extends EventTarget {
  constructor(web, player) {
    super();
    // the real element: it plays while sound effects are on, and the Web Audio graph stays attached to it
    this.webElement = web;
    this.player = player;
    this.backend = 'native';
    this._src = '';
    this._real = '';
    this._load = 0;
    this._pending = null;
    this._sent = false;
    this._startAt = 0;
    this._wantPlay = false;
    this._paused = true;
    this._playing = false;
    this._ended = false;
    this._error = null;
    this._ready = false;
    this._duration = NaN;
    this._pos = 0;
    this._posAt = Date.now();
    this._rate = 1;
    this._pitchKept = true;
    this._volume = 1;
    this._preload = 'auto';
    this._cmdAt = 0;
    this._seekAt = 0;
    this._adopted = false;
    this._timer = null;
    this._sentSpeed = '';
    this._sentVolume = -1;
    this._sentEffects = '';

    for (const type of EVENTS) {
      web.addEventListener(type, () => { if (this.backend === 'web') this._fire(type, true); });
    }
    player.addListener('state', (s) => this._onState(s || {}));
    player.addListener('error', (e) => this._onError(e || {}));
    // the native player may already be playing (earbuds started it): media-controls.js carries on from it
    this.attached = Promise.resolve().then(() => player.attach()).catch(() => ({}));
    // sound settings change from many places: looked at once a second, and before each song
    const watch = setInterval(() => this._watchSettings(), 1000);
    if (watch && watch.unref) watch.unref();
  }

  // ---- what app.js reads and sets ----

  get src() { return this.backend === 'web' ? this.webElement.src : this._src; }
  set src(v) { this._setSrc(v == null ? '' : String(v)); }
  get currentSrc() { return this.backend === 'web' ? this.webElement.currentSrc : this._real; }
  get paused() { return this.backend === 'web' ? this.webElement.paused : this._paused; }
  get ended() { return this.backend === 'web' ? this.webElement.ended : this._ended; }
  get error() { return this.backend === 'web' ? this.webElement.error : this._error; }
  get duration() { return this.backend === 'web' ? this.webElement.duration : this._duration; }
  get readyState() { return this.backend === 'web' ? this.webElement.readyState : (this._ready ? 4 : 0); }
  get networkState() { return this.backend === 'web' ? this.webElement.networkState : (this._src ? (this._ready ? 1 : 2) : 0); }
  get preload() { return this._preload; }
  set preload(v) { this._preload = v; try { this.webElement.preload = v; } catch (e) {} }
  get sinkId() { return this.webElement.sinkId; }
  setSinkId(id) { return this.webElement.setSinkId ? this.webElement.setSinkId(id) : Promise.resolve(); }
  get muted() { return this.webElement.muted; }
  set muted(v) { this.webElement.muted = v; this._watchSettings(); }
  get buffered() { return this.backend === 'web' ? this.webElement.buffered : this._range(); }
  get seekable() { return this.backend === 'web' ? this.webElement.seekable : this._range(); }
  _range() {
    const end = Number.isFinite(this._duration) ? this._duration : 0;
    return { length: end ? 1 : 0, start: () => 0, end: () => end };
  }

  get currentTime() {
    if (this.backend === 'web') return this.webElement.currentTime;
    if (!this._playing) return this._pos;
    const t = this._pos + ((Date.now() - this._posAt) / 1000) * this._rate;
    return Number.isFinite(this._duration) ? Math.min(t, this._duration) : t;
  }
  set currentTime(v) {
    if (this.backend === 'web') { this.webElement.currentTime = v; return; }
    const to = Math.max(0, Number(v) || 0);
    this._pos = to;
    this._posAt = Date.now();
    this._seekAt = Date.now();
    this._ended = false;
    this._fire('seeking');
    if (!this._sent) { this._startAt = to; this._fire('seeked'); return; }
    const load = this._load;
    this.player.seek({ position: to }).catch(() => {}).then(() => {
      if (load !== this._load || this.backend !== 'native') return;
      this._fire('seeked');
      this._fire('timeupdate');
    });
  }

  get playbackRate() { return this.backend === 'web' ? this.webElement.playbackRate : this._rate; }
  set playbackRate(v) { this.webElement.playbackRate = v; this._watchSettings(); }
  get defaultPlaybackRate() { return this.webElement.defaultPlaybackRate; }
  set defaultPlaybackRate(v) { this.webElement.defaultPlaybackRate = v; }
  get preservesPitch() { return this.webElement.preservesPitch; }
  set preservesPitch(v) { this.webElement.preservesPitch = v; this._watchSettings(); }
  get volume() { return this.backend === 'web' ? this.webElement.volume : this._volume; }
  set volume(v) {
    this._volume = Math.max(0, Math.min(1, Number(v)));
    try { this.webElement.volume = this._volume; } catch (e) {}
    this._watchSettings();
    this._fire('volumechange');
  }

  getAttribute(name) { return String(name).toLowerCase() === 'src' ? (this.src || null) : this.webElement.getAttribute(name); }
  hasAttribute(name) { return String(name).toLowerCase() === 'src' ? !!this.src : this.webElement.hasAttribute(name); }
  setAttribute(name, value) {
    if (String(name).toLowerCase() === 'src') this.src = value;
    else this.webElement.setAttribute(name, value);
  }
  removeAttribute(name) {
    if (String(name).toLowerCase() !== 'src') { this.webElement.removeAttribute(name); return; }
    if (this.backend === 'web') { this.webElement.removeAttribute('src'); return; }
    this._load++;
    this._reset('');
    this.player.clear().catch(() => {});
  }
  canPlayType(type) { return this.webElement.canPlayType(type); }

  load() {
    if (this.backend === 'web') { this.webElement.load(); return; }
    if (this._src) this._setSrc(this._src);
  }

  play() {
    if (this.backend === 'web') return this.webElement.play();
    if (!this._src) return Promise.reject(new DOMException('There is no song to play.', 'NotSupportedError'));
    if (this._error) return Promise.reject(new DOMException(this._error.message || 'The song failed to load.', 'NotSupportedError'));
    const load = this._load;
    this._wantPlay = true;
    this._cmdAt = Date.now();
    if (this._ended) { this._ended = false; this._pos = 0; this._posAt = Date.now(); }
    if (this._paused) { this._paused = false; this._fire('play'); }
    return Promise.resolve(this._pending).then(() => {
      if (load !== this._load || this.backend !== 'native' || !this._wantPlay) return;
      if (this._error) throw new DOMException(this._error.message || 'The song failed to load.', 'NotSupportedError');
      return this.player.play();
    }).then(() => undefined);
  }

  pause() {
    if (this.backend === 'web') { this.webElement.pause(); return; }
    this._wantPlay = false;
    this._cmdAt = Date.now();
    if (this._paused) return;
    this._pos = this.currentTime;
    this._posAt = Date.now();
    this._paused = true;
    this._playing = false;
    this._stopTimer();
    if (this._sent) this.player.pause().catch(() => {});
    this._fire('pause');
  }

  // ---- for app.js and media-controls.js ----

  // hls.js needs a real element (and Web Audio): this song plays there
  useWeb() {
    if (this.backend === 'web') return;
    this._load++;
    this._reset('');
    this.player.clear().catch(() => {});
    this._setBackend('web');
  }

  // The native player was playing (or holding) a song when the page started (earbuds started it while Uriel was
  // closed): the page carries on with it as if it had loaded it. s: what attach() answered.
  adopt(s) {
    if (!s || !s.item) return false;
    this._setBackend('native');
    this._load++;
    this._reset('native:' + (s.item.title || 'song'));
    this._adopted = true;
    this._sent = true;
    this._ready = s.duration > 0;
    this._duration = s.duration > 0 ? s.duration : NaN;
    this._pos = Number(s.position) || 0;
    this._posAt = Date.now();
    this._ended = !!s.ended;
    if (this._ready) { this._fire('durationchange'); this._fire('loadedmetadata'); this._fire('canplay'); }
    if (s.playing) {
      this._paused = false;
      this._wantPlay = true;
      this._playing = true;
      this._fire('play');
      this._fire('playing');
      this._startTimer();
    }
    return true;
  }

  // ---- inside ----

  // which player plays changed: media-controls.js hands the notification and the session to it
  _setBackend(b) {
    if (this.backend === b) return;
    this.backend = b;
    setTimeout(() => window.dispatchEvent(new Event('uriel:backend')), 0);
  }

  _reset(src) {
    this._src = src;
    this._real = '';
    this._pending = null;
    this._sent = false;
    this._startAt = 0;
    this._adopted = false;
    this._error = null;
    this._ended = false;
    this._ready = false;
    this._duration = NaN;
    this._pos = 0;
    this._posAt = Date.now();
    this._playing = false;
    this._stopTimer();
    // a new song stops the old one: an <audio> element is paused once its source changes
    if (!this._paused) { this._paused = true; this._fire('pause'); }
  }

  _setSrc(v) {
    const load = ++this._load;
    const wasWeb = this.backend === 'web';
    if (!v) { this.removeAttribute('src'); return; }
    // a song only the real element can open
    const web = /^(blob|data|mediasource):/i.test(v);
    if (web) {
      if (!wasWeb) { this._reset(''); this.player.clear().catch(() => {}); }
      this._setBackend('web');
      this.webElement.src = v;
      return;
    }
    if (wasWeb) {
      try { this.webElement.pause(); this.webElement.removeAttribute('src'); this.webElement.load(); } catch (e) {}
      this._setBackend('native');
    }
    this._reset(v);
    this._wantPlay = false;
    this._fire('emptied');
    this._fire('loadstart');
    const resolve = window.__urielResolveLocal;
    const local = typeof resolve === 'function' && /^http:\/\/127\.0\.0\.1:\d+\//.test(v);
    this._pending = Promise.resolve(local ? resolve(v) : v).then((real) => {
      if (load !== this._load) return;
      const path = fileOfUrl(real);
      if (!path && !/^https?:\/\//i.test(real)) throw new Error(`can't play ${String(real).slice(0, 40)}`);
      this._real = real;
      this._sendSettings(true);
      const item = { ...this._describe(), load };
      const startAt = this._startAt;
      this._sent = true;
      return this.player.load({ path, url: path ? '' : real, item, startAt, play: this._wantPlay });
    }).catch((e) => {
      if (load !== this._load) return;
      this._failed(ERR.SRC_NOT_SUPPORTED, (e && e.message) || String(e));
    });
  }

  // what the notification and lock screen show for the song, and what PlayerService needs to start it again later
  _describe() {
    const c = window.UrielCore;
    const t = c && c.state && c.state.currentTrack;
    if (!t) return {};
    let art = '';
    try { art = (c.thumb && c.thumb(t)) || t.thumbnail || ''; } catch (e) { art = t.thumbnail || ''; }
    const q = Array.isArray(c.state.queue) ? c.state.queue : [];
    const same = (x) => x === t || (!!x && !!c.isSameTrack && c.isSameTrack(x, t));
    return {
      qi: same(q[c.state.queueIndex]) ? c.state.queueIndex : q.findIndex(same),
      title: t.title || '', artist: t.artist || '', album: t.album || '',
      artwork: /^https:\/\//.test(art) ? art : '', duration: Number(t.duration) || 0,
      cache: cachedName(t), thumb: thumbName(t),
    };
  }

  _onState(s) {
    if (this.backend !== 'native') return;
    let item = {};
    try { item = JSON.parse(s.item || '{}') || {}; } catch (e) {}
    // news about an earlier song
    if (!(item.load === this._load || (this._adopted && item.load === undefined))) return;
    const at = Number(s.at) || Date.now();
    // stale: from before the page's last play / pause, or its last seek
    const freshCmd = at >= this._cmdAt;
    if (at >= this._seekAt) { this._pos = Number(s.position) || 0; this._posAt = at; }
    if (s.rate > 0) this._rate = s.rate;
    if (s.duration > 0 && s.duration !== this._duration) {
      this._duration = s.duration;
      this._fire('durationchange');
    }
    if (!this._ready && (s.state === STATE.READY || s.state === STATE.ENDED || s.duration > 0)) {
      this._ready = true;
      this._fire('loadedmetadata');
      this._fire('loadeddata');
      this._fire('canplay');
      this._fire('canplaythrough');
    }
    if (s.state === STATE.ENDED) {
      if (this._ended) return;
      this._ended = true;
      this._playing = false;
      this._stopTimer();
      if (Number.isFinite(this._duration)) this._pos = this._duration;
      if (!this._paused) { this._paused = true; this._fire('pause'); }
      this._fire('timeupdate');
      this._fire('ended');
      return;
    }
    if (!freshCmd) return;
    if (s.playing && !this._playing) {
      this._playing = true;
      // another app gave the sound back: the native player plays again by itself
      if (this._paused) { this._paused = false; this._wantPlay = true; this._fire('play'); }
      this._fire('playing');
      this._startTimer();
    } else if (!s.playing && this._playing) {
      this._playing = false;
      this._stopTimer();
      if (s.state === STATE.LOADING && s.playWhenReady) this._fire('waiting');
    }
    // the native player paused by itself (a call, another app's sound, headphones gone): the page hears a pause
    if (!s.playWhenReady && !this._paused && this._sent) {
      this._paused = true;
      this._wantPlay = false;
      this._fire('pause');
    }
  }

  _onError(e) {
    if (this.backend !== 'native' || !this._sent) return;
    // ExoPlayer's codes: 2xxx input/output (a missing file, the network), 3xxx parsing, 4xxx decoding
    const code = Number(e.code) || 0;
    const kind = code >= 4000 && code < 5000 ? ERR.DECODE : code >= 2000 && code < 3000 && code !== 2005 ? ERR.NETWORK : ERR.SRC_NOT_SUPPORTED;
    this._failed(kind, e.message || 'playback failed');
  }

  _failed(code, message) {
    this._error = { code, message, MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 };
    this._playing = false;
    this._stopTimer();
    if (!this._paused) { this._paused = true; this._fire('pause'); }
    this._fire('error');
  }

  _startTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._fire('timeupdate'), 250);
    if (this._timer && this._timer.unref) this._timer.unref();
  }

  _stopTimer() {
    clearInterval(this._timer);
    this._timer = null;
  }

  // HTML media events come after the call that caused them
  _fire(type, now = false) {
    if (now) { this.dispatchEvent(new Event(type)); return; }
    setTimeout(() => this.dispatchEvent(new Event(type)), 0);
  }

  // Speed and pitch (audio-engine.js sets them on the real element), the volume and the sound settings reach the
  // native player.
  _sendSettings(force = false) {
    const w = this.webElement;
    const rate = Number(w.playbackRate) || 1;
    const keep = w.preservesPitch !== false;
    const speed = `${rate}|${keep}`;
    if (force || speed !== this._sentSpeed) {
      this._sentSpeed = speed;
      this._rate = rate;
      this.player.setSpeed({ speed: rate, preservePitch: keep }).catch(() => {});
    }
    // Phones have no volume slider (the phone's own buttons do that): only mute counts, which mobile-ui.js puts on
    // the real element. The app's saved volume (85% unless changed on a computer) must not turn the phone down.
    // A song's own volume is part of the sound settings (it may go above 100%).
    const v = Math.max(0, Math.min(1, this._volume * (w.muted ? 0 : 1)));
    if (force || Math.abs(v - this._sentVolume) > 0.001) {
      this._sentVolume = v;
      this.player.setVolume({ volume: v }).catch(() => {});
    }
    const effects = JSON.stringify(soundSettings());
    if (force || effects !== this._sentEffects) {
      this._sentEffects = effects;
      this.player.setEffects(JSON.parse(effects)).catch(() => {});
    }
  }

  _watchSettings() {
    const e = window.audioEngine;
    // the volume slider and mute reach the native player at once
    if (e && !e.__urielNative) {
      e.__urielNative = true;
      const setVolume = e.setVolume.bind(e);
      e.setVolume = (...args) => { const r = setVolume(...args); if (this.backend === 'native') this._sendSettings(); return r; };
    }
    if (this.backend === 'native') this._sendSettings();
  }

  // The second player of a crossfade (app.js prepareCrossfade): the old song's last seconds, fading out while this
  // one fades the next song in. A real <audio> element would take the sound away from the native player.
  createTail() {
    return new NativeTail(this.player);
  }
}

// What the sound settings are right now, for EffectsProcessor.kt: audio-engine.js keeps them (the playing song's own
// included), the Normalize volume switch is app.js's.
function soundSettings() {
  const e = window.audioEngine || {};
  const s = e.audioSettings || {};
  const hq = e.hqSettings || {};
  let normalize = false;
  try { normalize = localStorage.getItem('uriel_audio_normalize') === '1'; } catch (err) {}
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    hq: !!e.hqEnabled, hqEngine: hq.engine || 'hqmusic-3', hqBass: num(hq.bass), hqVocal: num(hq.vocal), hqAir: num(hq.air),
    eq: { low: num(s.eq && s.eq.low), mid: num(s.eq && s.eq.mid), high: num(s.eq && s.eq.high) },
    eqBands: Array.from({ length: 10 }, (_, i) => num(Array.isArray(s.eqBands) ? s.eqBands[i] : 0)),
    reverb: num(s.reverb), echo: num(s.echo), distortion: num(s.distortion), volume: num(s.volume, 1), normalize,
  };
}

// The few things app.js does with a crossfade's second <audio> element, on a second native player.
let tailCount = 0;
class NativeTail extends EventTarget {
  constructor(player) {
    super();
    this.player = player;
    this.id = `tail${++tailCount}`;
    this.preload = 'auto';
    this._src = '';
    this._sent = false;
    this._startAt = 0;
    this._pos = 0;
    this._posAt = Date.now();
    this._playing = false;
    this._wantPlay = false;
    this._rate = 1;
    this._pitchKept = true;
    this._volume = 1;
    this._duration = NaN;
    this._ready = false;
    this.ended = false;
    this._listener = null;
    this._waiting = [];
  }

  get src() { return this._src; }
  set src(v) {
    this._src = String(v || '');
    const path = fileOfUrl(this._src);
    if (!path && !/^https?:\/\//i.test(this._src)) { setTimeout(() => this.dispatchEvent(new Event('error')), 0); return; }
    Promise.resolve(this.player.addListener('tail', (s) => this._onState(s || {}))).then((l) => {
      // let go of before it was listening
      if (!this._src) { if (l && l.remove) l.remove(); } else this._listener = l;
    });
    this._sent = true;
    this.player.tailLoad({ id: this.id, path, url: path ? '' : this._src, startAt: this._startAt })
      .then(() => this._set({ volume: this._volume, speed: this._rate, preservePitch: this._pitchKept }))
      .catch(() => this.dispatchEvent(new Event('error')));
  }
  get currentSrc() { return this._src; }
  get paused() { return !this._wantPlay; }
  get duration() { return this._duration; }

  get currentTime() {
    if (!this._playing) return this._pos;
    return this._pos + ((Date.now() - this._posAt) / 1000) * this._rate;
  }
  set currentTime(v) {
    const to = Math.max(0, Number(v) || 0);
    this._pos = to;
    this._posAt = Date.now();
    this._seekAt = Date.now();
    if (!this._sent) { this._startAt = to; return; }
    this._set({ position: to }).then(() => this.dispatchEvent(new Event('seeked')));
  }

  get volume() { return this._volume; }
  set volume(v) { this._volume = Math.max(0, Math.min(1, Number(v) || 0)); if (this._sent) this._set({ volume: this._volume }); }
  get playbackRate() { return this._rate; }
  set playbackRate(v) { this._rate = Number(v) || 1; if (this._sent) this._set({ speed: this._rate, preservePitch: this._pitchKept }); }
  get defaultPlaybackRate() { return this._rate; }
  set defaultPlaybackRate(v) {}
  get preservesPitch() { return this._pitchKept; }
  set preservesPitch(v) { this._pitchKept = v !== false; if (this._sent) this._set({ speed: this._rate, preservePitch: this._pitchKept }); }

  play() {
    if (!this._sent) return Promise.reject(new Error('no song'));
    this._wantPlay = true;
    return this._set({ play: true });
  }

  pause() {
    if (!this._wantPlay) return;
    this._pos = this.currentTime;
    this._posAt = Date.now();
    this._wantPlay = false;
    this._playing = false;
    if (this._sent) this._set({ play: false });
  }

  // app.js lets go of the element with pause(), removeAttribute('src'), load()
  removeAttribute(name) {
    if (String(name).toLowerCase() !== 'src') return;
    this._src = '';
    this._wantPlay = false;
    this._playing = false;
    if (this._listener && this._listener.remove) this._listener.remove();
    this._listener = null;
    if (this._sent) this.player.tailStop({ id: this.id }).catch(() => {});
    this._sent = false;
  }

  load() {}

  _set(what) {
    return this.player.tailSet({ id: this.id, ...what }).catch(() => {});
  }

  _onState(s) {
    if (s.id !== this.id || !this._src) return;
    if (s.error) { this.dispatchEvent(new Event('error')); return; }
    const at = Number(s.at) || Date.now();
    if (!(at < (this._seekAt || 0))) { this._pos = Number(s.position) || 0; this._posAt = at; }
    this._playing = !!s.playing;
    if (s.duration > 0) this._duration = s.duration;
    if (!this._ready && (s.state === STATE.READY || s.state === STATE.ENDED)) {
      this._ready = true;
      this.dispatchEvent(new Event('loadedmetadata'));
    }
    if (s.state === STATE.ENDED) { this.ended = true; this._playing = false; }
  }
}

// app.js asks for its element through this (Android only); null leaves it the real one
module.exports = function create(web) {
  if (!web) return null;
  try {
    return new NativeAudio(web, registerPlugin('UrielPlayer'));
  } catch (e) {
    return null;
  }
};
module.exports.soundSettings = soundSettings;
