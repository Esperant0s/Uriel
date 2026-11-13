// Android: the page's <audio> element, played by the native player (android/.../PlayerService.kt, Media3/ExoPlayer).
//
// shared/app.js plays everything through one <audio> element. On Android this object takes its place: it has the
// same properties, methods and events app.js uses, and sends the songs to the native player, which keeps playing in
// the background, answers earbuds and Bluetooth, and starts the last song again from earbuds once Uriel was closed.
//
// The sound settings (Enhance, EQ, Effects, Normalize volume) run in the native player too (EffectsProcessor.kt): this
// sends them along. The old song's last seconds during a crossfade play in a second native player (NativeTail).
// Only a stream the native player can't open (hls.js, a blob) still plays through the real element ("web").
import { registerPlugin } from '@capacitor/core';
import songFilesModule = require('./song-files');
const { cachedName, thumbName, fileOfUrl } = songFilesModule;

// the element's events app.js and the rest listen to, passed on from the real element while it plays
const EVENTS = ['loadstart', 'emptied', 'loadedmetadata', 'loadeddata', 'durationchange', 'canplay', 'canplaythrough',
  'play', 'playing', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'timeupdate', 'ended', 'error', 'ratechange',
  'volumechange', 'progress', 'suspend', 'abort'];
const STATE = { IDLE: 1, LOADING: 2, READY: 3, ENDED: 4 } as const;
// HTMLMediaElement error codes
const ERR = { NETWORK: 2, DECODE: 3, SRC_NOT_SUPPORTED: 4 } as const;

// which player a song plays in: the native one, or the page's real <audio> element
type Backend = 'native' | 'web';
// what `error` holds after a failed song: the part of a MediaError app.js reads
interface PlaybackError { code: number; message: string; MEDIA_ERR_NETWORK: 2; MEDIA_ERR_DECODE: 3; MEDIA_ERR_SRC_NOT_SUPPORTED: 4 }
type Timer = ReturnType<typeof setInterval>;
// a timer that doesn't keep Node (the tests) running; browsers have plain numbers
const background = (t: Timer): Timer => { if (typeof t === 'object' && t && 'unref' in t) t.unref(); return t; };

class NativeAudio extends EventTarget {
  // the real element: a stream only it can open plays there, and audio-engine.js sets speed and mute on it
  readonly webElement: HTMLAudioElement;
  readonly player: UrielPlayerPlugin;
  backend: Backend = 'native';
  // the native player may already be playing (earbuds started it): media-controls.ts carries on from it
  readonly attached: Promise<NativeSnapshot>;
  // the address app.js gave, and the file or stream behind it
  private _src = '';
  private _real = '';
  // counts the songs given to the native player: its news says which one it is about
  private _load = 0;
  private _pending: Promise<void> | null = null;
  private _sent = false;
  private _startAt = 0;
  private _wantPlay = false;
  private _paused = true;
  private _playing = false;
  private _ended = false;
  private _error: PlaybackError | null = null;
  private _ready = false;
  private _duration = NaN;
  // where the song was at `_posAt`; the time since is counted here
  private _pos = 0;
  private _posAt = Date.now();
  private _rate = 1;
  private _volume = 1;
  private _preload: HTMLMediaElement['preload'] = 'auto';
  // Counts what the page asked of the player (load, play, pause, seek). Each request goes out with its number and
  // the player's news carries the number of the last one it has done: news with an older number was read before
  // the player got to what the page asked, so it doesn't say where things stand. Going by the clock instead let a
  // "not playing yet" that the player read just after play() was asked count as the player pausing by itself: the
  // next song paused as it started, mostly with the screen off, where the phone is slow to pass the request on.
  private _seq = 0;
  private _adopted = false;
  private _timer: Timer | null = null;
  private _sentSpeed = '';
  private _sentVolume = -1;
  private _sentEffects = '';
  private _sentMix: boolean | null = null;

  constructor(web: HTMLAudioElement, player: UrielPlayerPlugin) {
    super();
    this.webElement = web;
    this.player = player;

    for (const type of EVENTS) {
      web.addEventListener(type, () => { if (this.backend === 'web') this._fire(type, true); });
    }
    player.addListener('state', (s) => this._onState(s || {}));
    player.addListener('error', (e) => this._onError(e || {}));
    this.attached = Promise.resolve().then(() => player.attach()).catch((): NativeSnapshot => ({}));
    // sound settings change from many places: looked at once a second, and before each song
    background(setInterval(() => this._watchSettings(), 1000));
  }

  // ---- what app.js reads and sets ----

  get src(): string { return this.backend === 'web' ? this.webElement.src : this._src; }
  set src(v: string | null | undefined) { this._setSrc(v == null ? '' : String(v)); }
  get currentSrc() { return this.backend === 'web' ? this.webElement.currentSrc : this._real; }
  get paused() { return this.backend === 'web' ? this.webElement.paused : this._paused; }
  get ended() { return this.backend === 'web' ? this.webElement.ended : this._ended; }
  get error(): MediaError | PlaybackError | null { return this.backend === 'web' ? this.webElement.error : this._error; }
  get duration() { return this.backend === 'web' ? this.webElement.duration : this._duration; }
  get readyState() { return this.backend === 'web' ? this.webElement.readyState : (this._ready ? 4 : 0); }
  get networkState() { return this.backend === 'web' ? this.webElement.networkState : (this._src ? (this._ready ? 1 : 2) : 0); }
  get preload() { return this._preload; }
  set preload(v: HTMLMediaElement['preload']) { this._preload = v; try { this.webElement.preload = v; } catch (e) {} }
  get sinkId() { return this.webElement.sinkId; }
  setSinkId(id: string): Promise<void> { return typeof this.webElement.setSinkId === 'function' ? this.webElement.setSinkId(id) : Promise.resolve(); }
  get muted() { return this.webElement.muted; }
  set muted(v: boolean) { this.webElement.muted = v; this._watchSettings(); }
  get buffered(): Pick<TimeRanges, 'length' | 'start' | 'end'> { return this.backend === 'web' ? this.webElement.buffered : this._range(); }
  get seekable(): Pick<TimeRanges, 'length' | 'start' | 'end'> { return this.backend === 'web' ? this.webElement.seekable : this._range(); }
  private _range() {
    const end = Number.isFinite(this._duration) ? this._duration : 0;
    return { length: end ? 1 : 0, start: () => 0, end: () => end };
  }

  get currentTime(): number {
    if (this.backend === 'web') return this.webElement.currentTime;
    if (!this._playing) return this._pos;
    const t = this._pos + ((Date.now() - this._posAt) / 1000) * this._rate;
    return Number.isFinite(this._duration) ? Math.min(t, this._duration) : t;
  }
  set currentTime(v: number) {
    if (this.backend === 'web') { this.webElement.currentTime = v; return; }
    const to = Math.max(0, Number(v) || 0);
    this._pos = to;
    this._posAt = Date.now();
    this._ended = false;
    this._fire('seeking');
    if (!this._sent) { this._startAt = to; this._fire('seeked'); return; }
    const load = this._load;
    this.player.seek({ position: to, seq: ++this._seq }).catch(() => {}).then(() => {
      if (load !== this._load || this.backend !== 'native') return;
      this._fire('seeked');
      this._fire('timeupdate');
    });
  }

  get playbackRate(): number { return this.backend === 'web' ? this.webElement.playbackRate : this._rate; }
  set playbackRate(v: number) { this.webElement.playbackRate = v; this._watchSettings(); }
  get defaultPlaybackRate() { return this.webElement.defaultPlaybackRate; }
  set defaultPlaybackRate(v: number) { this.webElement.defaultPlaybackRate = v; }
  get preservesPitch() { return this.webElement.preservesPitch; }
  set preservesPitch(v: boolean) { this.webElement.preservesPitch = v; this._watchSettings(); }
  get volume(): number { return this.backend === 'web' ? this.webElement.volume : this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, Number(v)));
    try { this.webElement.volume = this._volume; } catch (e) {}
    this._watchSettings();
    this._fire('volumechange');
  }

  getAttribute(name: string): string | null { return String(name).toLowerCase() === 'src' ? (this.src || null) : this.webElement.getAttribute(name); }
  hasAttribute(name: string): boolean { return String(name).toLowerCase() === 'src' ? !!this.src : this.webElement.hasAttribute(name); }
  setAttribute(name: string, value: string): void {
    if (String(name).toLowerCase() === 'src') this.src = value;
    else this.webElement.setAttribute(name, value);
  }
  removeAttribute(name: string): void {
    if (String(name).toLowerCase() !== 'src') { this.webElement.removeAttribute(name); return; }
    if (this.backend === 'web') { this.webElement.removeAttribute('src'); return; }
    // app.js unloads the old song before it loads the next one (playTrack). The native player keeps it, paused,
    // until the next one takes its place: emptied, it lets go of its foreground service, and Android doesn't let
    // an app in the background start one again, nor have the sound without one (Android 15). The next song then
    // loaded and was paused by the phone at once: music stopped after a song or two with the screen off, until
    // the app was opened.
    const sent = this._sent;
    this._load++;
    this._reset('');
    // (done: Play on the earbuds must not bring this song back while the next one loads)
    if (sent) this.player.pause({ seq: ++this._seq, done: true }).catch(() => {});
  }
  canPlayType(type: string): CanPlayTypeResult { return this.webElement.canPlayType(type); }

  load(): void {
    if (this.backend === 'web') { this.webElement.load(); return; }
    if (this._src) this._setSrc(this._src);
  }

  play(): Promise<void> {
    if (this.backend === 'web') return this.webElement.play();
    if (!this._src) return Promise.reject(new DOMException('There is no song to play.', 'NotSupportedError'));
    if (this._error) return Promise.reject(new DOMException(this._error.message || 'The song failed to load.', 'NotSupportedError'));
    const load = this._load;
    this._wantPlay = true;
    // asked now, sent once the song is with the player: its news doesn't count until then
    this._seq++;
    if (this._ended) { this._ended = false; this._pos = 0; this._posAt = Date.now(); }
    if (this._paused) { this._paused = false; this._fire('play'); }
    return Promise.resolve(this._pending).then(() => {
      if (load !== this._load || this.backend !== 'native' || !this._wantPlay) return;
      if (this._error) throw new DOMException(this._error.message || 'The song failed to load.', 'NotSupportedError');
      return this.player.play({ seq: ++this._seq });
    }).then(() => undefined);
  }

  pause(): void {
    if (this.backend === 'web') { this.webElement.pause(); return; }
    this._wantPlay = false;
    if (this._paused) return;
    this._pos = this.currentTime;
    this._posAt = Date.now();
    this._paused = true;
    this._playing = false;
    this._stopTimer();
    if (this._sent) this.player.pause({ seq: ++this._seq }).catch(() => {});
    this._fire('pause');
  }

  // ---- for app.js and media-controls.ts ----

  // hls.js needs a real element (and Web Audio): this song plays there
  useWeb(): void {
    if (this.backend === 'web') return;
    this._load++;
    this._reset('');
    this.player.clear().catch(() => {});
    this._setBackend('web');
  }

  // The native player was playing (or holding) a song when the page started (earbuds started it while Uriel was
  // closed): the page carries on with it as if it had loaded it. s: what attach() answered.
  adopt(s: NativeSnapshot | null | undefined): boolean {
    if (!s || !s.item) return false;
    const duration = Number(s.duration) || 0;
    this._setBackend('native');
    this._load++;
    this._reset('native:' + (s.item.title || 'song'));
    this._adopted = true;
    this._sent = true;
    this._ready = duration > 0;
    this._duration = duration > 0 ? duration : NaN;
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

  // which player plays changed: media-controls.ts hands the notification and the session to it
  private _setBackend(b: Backend): void {
    if (this.backend === b) return;
    this.backend = b;
    setTimeout(() => window.dispatchEvent(new Event('uriel:backend')), 0);
  }

  private _reset(src: string): void {
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

  private _setSrc(v: string): void {
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
    this._seq++;
    this._fire('emptied');
    this._fire('loadstart');
    const resolve = window.__urielResolveLocal;
    const local = typeof resolve === 'function' && /^http:\/\/127\.0\.0\.1:\d+\//.test(v);
    this._pending = Promise.resolve(local ? resolve(v) : v).then((real): Promise<void> | undefined => {
      if (load !== this._load) return;
      const path = fileOfUrl(real);
      if (!path && !/^https?:\/\//i.test(real)) throw new Error(`can't play ${String(real).slice(0, 40)}`);
      this._real = real;
      this._sendSettings(true);
      const item = { ...this._describe(), load };
      const startAt = this._startAt;
      this._sent = true;
      return this.player.load({ path, url: path ? '' : real, item, startAt, play: this._wantPlay, seq: ++this._seq });
    }).catch((e: unknown) => {
      if (load !== this._load) return;
      this._failed(ERR.SRC_NOT_SUPPORTED, e instanceof Error ? e.message : String(e));
    });
  }

  // what the notification and lock screen show for the song, and what PlayerService needs to start it again later
  private _describe(): Partial<NativeSongInfo> {
    const c = window.UrielCore;
    const t = c && c.state && c.state.currentTrack;
    if (!t) return {};
    let art = '';
    try { art = (c.thumb && c.thumb(t)) || t.thumbnail || ''; } catch (e) { art = t.thumbnail || ''; }
    const q = Array.isArray(c.state.queue) ? c.state.queue : [];
    const same = (x: Track | undefined) => x === t || (!!x && !!c.isSameTrack && c.isSameTrack(x, t));
    return {
      qi: same(q[c.state.queueIndex]) ? c.state.queueIndex : q.findIndex(same),
      title: t.title || '', artist: t.artist || '', album: t.album || '',
      artwork: /^https:\/\//.test(art) ? art : '', duration: Number(t.duration) || 0,
      cache: cachedName(t), thumb: thumbName(t),
    };
  }

  private _onState(s: NativePlayerState): void {
    if (this.backend !== 'native') return;
    let item: Partial<NativeSongInfo> = {};
    const duration = Number(s.duration) || 0;
    try { item = JSON.parse(s.item || '{}') || {}; } catch (e) {}
    // news about an earlier song
    if (!(item.load === this._load || (this._adopted && item.load === undefined))) return;
    const at = Number(s.at) || Date.now();
    // the player has done everything the page asked: its news says where things stand (see _seq)
    const current = (Number(s.seq) || 0) === this._seq;
    if (current) { this._pos = Number(s.position) || 0; this._posAt = at; }
    if (s.rate && s.rate > 0) this._rate = s.rate;
    if (duration > 0 && duration !== this._duration) {
      this._duration = duration;
      this._fire('durationchange');
    }
    if (!this._ready && (s.state === STATE.READY || s.state === STATE.ENDED || duration > 0)) {
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
    if (!current) return;
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

  private _onError(e: { code?: number; message?: string }): void {
    if (this.backend !== 'native' || !this._sent) return;
    // ExoPlayer's codes: 2xxx input/output (a missing file, the network), 3xxx parsing, 4xxx decoding
    const code = Number(e.code) || 0;
    const kind = code >= 4000 && code < 5000 ? ERR.DECODE : code >= 2000 && code < 3000 && code !== 2005 ? ERR.NETWORK : ERR.SRC_NOT_SUPPORTED;
    this._failed(kind, e.message || 'playback failed');
  }

  private _failed(code: number, message: string): void {
    this._error = { code, message, MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 };
    this._playing = false;
    this._stopTimer();
    if (!this._paused) { this._paused = true; this._fire('pause'); }
    this._fire('error');
  }

  private _startTimer(): void {
    if (this._timer) return;
    this._timer = background(setInterval(() => this._fire('timeupdate'), 250));
  }

  private _stopTimer(): void {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  // HTML media events come after the call that caused them
  private _fire(type: string, now = false): void {
    if (now) { this.dispatchEvent(new Event(type)); return; }
    setTimeout(() => this.dispatchEvent(new Event(type)), 0);
  }

  // Speed and pitch (audio-engine.js sets them on the real element), the volume and the sound settings reach the
  // native player.
  private _sendSettings(force = false): void {
    const w = this.webElement;
    const rate = Number(w.playbackRate) || 1;
    const keep = w.preservesPitch !== false;
    const speed = `${rate}|${keep}`;
    if (force || speed !== this._sentSpeed) {
      this._sentSpeed = speed;
      this._rate = rate;
      this.player.setSpeed({ speed: rate, preservePitch: keep }).catch(() => {});
    }
    // Phones have no volume slider (the phone's own buttons do that): only mute counts, which mobile-ui.ts puts on
    // the real element. The app's saved volume (85% unless changed on a computer) must not turn the phone down.
    // A song's own volume is part of the sound settings (it may go above 100%).
    const v = Math.max(0, Math.min(1, this._volume * (w.muted ? 0 : 1)));
    if (force || Math.abs(v - this._sentVolume) > 0.001) {
      this._sentVolume = v;
      this.player.setVolume({ volume: v }).catch(() => {});
    }
    // "Play alongside other apps" in Settings (mobile-ui.ts)
    const mix = localStorage.getItem('uriel_mix_audio') === '1';
    if (force || mix !== this._sentMix) {
      this._sentMix = mix;
      this.player.setMixing({ mix }).catch(() => {});
    }
    const effects = JSON.stringify(soundSettings());
    if (force || effects !== this._sentEffects) {
      this._sentEffects = effects;
      this.player.setEffects(JSON.parse(effects)).catch(() => {});
    }
  }

  // (the tests call it to skip the once-a-second wait)
  _watchSettings(): void {
    const e = window.audioEngine;
    // the volume slider and mute reach the native player at once
    if (e && !e.__urielNative) {
      e.__urielNative = true;
      const setVolume = e.setVolume.bind(e);
      e.setVolume = (...args: Parameters<AudioEngineLike['setVolume']>) => { const r = setVolume(...args); if (this.backend === 'native') this._sendSettings(); return r; };
    }
    if (this.backend === 'native') this._sendSettings();
  }

  // The second player of a crossfade (app.js prepareCrossfade): the old song's last seconds, fading out while this
  // one fades the next song in. A real <audio> element would take the sound away from the native player.
  createTail(): NativeTail {
    return new NativeTail(this.player);
  }
}

// What the sound settings are right now, for EffectsProcessor.kt: audio-engine.js keeps them (the playing song's own
// included), the Normalize volume switch is app.js's.
function soundSettings(): SoundSettings {
  const e: Partial<AudioEngineLike> = window.audioEngine || {};
  const s = e.audioSettings || {};
  const hq = e.hqSettings || {};
  let normalize = false;
  try { normalize = localStorage.getItem('uriel_audio_normalize') === '1'; } catch (err) {}
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
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
  readonly player: UrielPlayerPlugin;
  readonly id = `tail${++tailCount}`;
  preload = 'auto';
  crossOrigin: string | null = null;
  ended = false;
  private _src = '';
  private _sent = false;
  private _startAt = 0;
  private _pos = 0;
  private _posAt = Date.now();
  private _seekAt = 0;
  private _playing = false;
  private _wantPlay = false;
  private _rate = 1;
  private _pitchKept = true;
  private _volume = 1;
  private _duration = NaN;
  private _ready = false;
  private _listener: { remove(): unknown } | null = null;

  constructor(player: UrielPlayerPlugin) {
    super();
    this.player = player;
  }

  get src(): string { return this._src; }
  set src(v: string) {
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

  get currentTime(): number {
    if (!this._playing) return this._pos;
    return this._pos + ((Date.now() - this._posAt) / 1000) * this._rate;
  }
  set currentTime(v: number) {
    const to = Math.max(0, Number(v) || 0);
    this._pos = to;
    this._posAt = Date.now();
    this._seekAt = Date.now();
    if (!this._sent) { this._startAt = to; return; }
    this._set({ position: to }).then(() => this.dispatchEvent(new Event('seeked')));
  }

  get volume(): number { return this._volume; }
  set volume(v: number) { this._volume = Math.max(0, Math.min(1, Number(v) || 0)); if (this._sent) this._set({ volume: this._volume }); }
  get playbackRate(): number { return this._rate; }
  set playbackRate(v: number) { this._rate = Number(v) || 1; if (this._sent) this._set({ speed: this._rate, preservePitch: this._pitchKept }); }
  get defaultPlaybackRate(): number { return this._rate; }
  // the rate is kept as set: nothing reloads it
  set defaultPlaybackRate(_v: number) {}
  get preservesPitch(): boolean { return this._pitchKept; }
  set preservesPitch(v: boolean) { this._pitchKept = v !== false; if (this._sent) this._set({ speed: this._rate, preservePitch: this._pitchKept }); }

  play(): Promise<void> {
    if (!this._sent) return Promise.reject(new Error('no song'));
    this._wantPlay = true;
    return this._set({ play: true });
  }

  pause(): void {
    if (!this._wantPlay) return;
    this._pos = this.currentTime;
    this._posAt = Date.now();
    this._wantPlay = false;
    this._playing = false;
    if (this._sent) this._set({ play: false });
  }

  // app.js lets go of the element with pause(), removeAttribute('src'), load()
  removeAttribute(name: string): void {
    if (String(name).toLowerCase() !== 'src') return;
    this._src = '';
    this._wantPlay = false;
    this._playing = false;
    if (this._listener && this._listener.remove) this._listener.remove();
    this._listener = null;
    if (this._sent) this.player.tailStop({ id: this.id }).catch(() => {});
    this._sent = false;
  }

  load(): void {}

  private _set(what: Omit<Parameters<UrielPlayerPlugin['tailSet']>[0], 'id'>): Promise<void> {
    return this.player.tailSet({ id: this.id, ...what }).catch(() => {});
  }

  private _onState(s: NativeTailState): void {
    if (s.id !== this.id || !this._src) return;
    if (s.error) { this.dispatchEvent(new Event('error')); return; }
    const at = Number(s.at) || Date.now();
    if (!(at < this._seekAt)) { this._pos = Number(s.position) || 0; this._posAt = at; }
    this._playing = !!s.playing;
    if (s.duration && s.duration > 0) this._duration = s.duration;
    if (!this._ready && (s.state === STATE.READY || s.state === STATE.ENDED)) {
      this._ready = true;
      this.dispatchEvent(new Event('loadedmetadata'));
    }
    if (s.state === STATE.ENDED) { this.ended = true; this._playing = false; }
  }
}

// app.js asks for its element through this (Android only); null leaves it the real one
function create(web: HTMLAudioElement | null): NativeAudio | null {
  if (!web) return null;
  try {
    return new NativeAudio(web, registerPlugin<UrielPlayerPlugin>('UrielPlayer'));
  } catch (e) {
    return null;
  }
}
create.soundSettings = soundSettings;

// the types, for the rest of the phone layer (types.d.ts)
declare namespace create {
  export type Audio = NativeAudio;
  export type Tail = NativeTail;
}

export = create;
