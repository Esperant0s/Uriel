// iPhone: keeps Uriel running in the background between two songs.
// iOS lets an app run in the background only while it plays something. Between two songs nothing does:
// the next one is still downloading, or one that can't play is being skipped. iOS then suspended Uriel
// within seconds, and the next song didn't start until the app was opened again. So while a song is on
// its way (app.js `state.trackLoading`), a second <audio> element loops a second of silence. Downloads need the
// same: with the screen locked and nothing playing, a batch of songs stopped after the first few seconds.
import { Capacitor } from '@capacitor/core';

// a stuck download shouldn't keep the phone busy for good (each request gives up after 30s anyway)
const MAX_MS = 3 * 60 * 1000;
// a download keeps it going for as long as it gets anywhere: this long after the last progress at most
const DOWNLOAD_IDLE_MS = 10 * 60 * 1000;

// one second of 16-bit mono silence as a WAV file
function silentWav(rate = 8000) {
  const bytes = rate * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, bytes, true);
  return new Blob([v.buffer], { type: 'audio/wav' });
}

function backgroundAudio(): void {
  if (Capacitor.getPlatform() !== 'ios') return;
  const core = () => window.UrielCore;
  let silence: HTMLAudioElement | null = null;
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  let downloading = false;

  function start(ms: number) {
    if (!silence) {
      silence = new Audio();
      silence.loop = true;
      silence.preload = 'auto';
      silence.src = URL.createObjectURL(silentWav());
    }
    if (!silence.paused) return;
    silence.play().catch(() => {});
    clearTimeout(capTimer);
    capTimer = setTimeout(stop, ms);
  }

  function stop() {
    clearTimeout(capTimer);
    capTimer = undefined;
    if (silence && !silence.paused) silence.pause();
  }

  function sync() {
    const c = core();
    if (c && (c.state.trackLoading || downloading) && c.audio.paused) start(downloading ? DOWNLOAD_IDLE_MS : MAX_MS); else stop();
  }

  // a download that's getting somewhere pushes the cap back
  function downloadMoved() {
    if (!downloading || !silence || silence.paused) return;
    clearTimeout(capTimer);
    capTimer = setTimeout(stop, DOWNLOAD_IDLE_MS);
  }

  function hook() {
    const c = core();
    if (!c || !c.audio) return;
    window.addEventListener('uriel:loading', sync);
    window.addEventListener('uriel:downloads', (e) => {
      downloading = !!(e as CustomEvent<{ active?: boolean }>).detail?.active;
      sync();
      downloadMoved();
    });
    window.addEventListener('uriel:dl-progress', downloadMoved);
    ['play', 'playing', 'pause'].forEach((ev) => c.audio.addEventListener(ev, sync));
  }
  if (window.UrielCore) hook(); else window.addEventListener('uriel:ready', hook, { once: true });
}

export = backgroundAudio;
