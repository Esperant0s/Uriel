// Runs Uriel's own server.js inside the iOS app and makes app.js think it is talking to the
// desktop backend on 127.0.0.1. Loaded before app.js.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import store = require('./shims/store');
import http = require('./shims/http');
import fs = require('./shims/fs');
import cacheLimitModule = require('./cache-limit');
const { enforceCacheLimit } = cacheLimitModule;
import electronAPI = require('./electron-api');
import nativeAudio = require('./native-audio');
import liveActivity = require('./live-activity');
import mediaControls = require('./media-controls');
import deviceMusic = require('./device-music');
import appIcon = require('./app-icon');
import systemBars = require('./system-bars');
import appUpdater = require('./app-updater');
import backgroundAudio = require('./background-audio');
import audioInterruption = require('./audio-interruption');

// the parts of shared/server.js (still JavaScript) used here; it is loaded once the file index is ready
interface ServerModule { startServer(port: number): void; getServerToken(): string; setDeviceSongs(songs: object[]): void }
type Answer = Awaited<ReturnType<typeof http.dispatch>>;

// ---- error log ("Fehlerlog teilen" in Settings): last 300 warnings/errors, kept across restarts ----
const LOG_KEY = 'uriel_debug_log';
const logLines: string[] = (() => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; } })();
let logSaveTimer: ReturnType<typeof setTimeout> | undefined;
function urielLog(level: string, msg: unknown): void {
  logLines.push(`${new Date().toISOString()} ${level.toUpperCase()} ${String(msg).slice(0, 500)}`);
  if (logLines.length > 300) logLines.splice(0, logLines.length - 300);
  clearTimeout(logSaveTimer);
  logSaveTimer = setTimeout(() => { try { localStorage.setItem(LOG_KEY, JSON.stringify(logLines)); } catch (e) {} }, 500);
}
for (const level of ['warn', 'error'] as const) {
  const orig = console[level].bind(console);
  // a cyclic object made JSON.stringify throw, which turned every such log call into an exception
  const str = (a: unknown): string => { if (a instanceof Error && a.stack) return a.stack; if (typeof a !== 'object') return String(a); try { return JSON.stringify(a); } catch (e) { return String(a); } };
  console[level] = (...args: unknown[]) => { urielLog(level, args.map(str).join(' ')); orig(...args); };
}
window.addEventListener('error', (e) => urielLog('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => urielLog('error', `unhandled: ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`));
// for mobile-ui.ts (a plain script): trim the song cache right after the limit is lowered
window.UrielCache = { enforceLimit: () => enforceCacheLimit() };
window.UrielLog = {
  add: urielLog,
  text: () => [`Uriel ${navigator.userAgent}`, `platform: ${Capacitor.getPlatform()}`, ...logLines].join('\n'),
  clear: () => { logLines.length = 0; try { localStorage.removeItem(LOG_KEY); } catch (e) {} },
};

const PORT = 38472;
const BASE = `http://127.0.0.1:${PORT}/`;
const MIME: Record<string, string> = { '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.opus': 'audio/ogg', '.webm': 'audio/webm', '.flac': 'audio/flac', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const mimeOf = (p: string): string | undefined => MIME[(p.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase()];

// ---- outbound HTTP without CORS ----
// In the app, CapacitorHttp has already replaced window.fetch with native networking.
// In a desktop browser (dev harness) requests go through the dev server's /__proxy.
const pageFetch = window.fetch.bind(window);
const plainHeaders = (h: HeadersInit | undefined): Record<string, string> => (h instanceof Headers ? Object.fromEntries(h.entries()) : { ...(h as Record<string, string> || {}) });
async function toPlain(input: RequestInfo | URL, init: RequestInit = {}): Promise<[string, RequestInit]> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    // A Request silently drops "forbidden" headers like User-Agent; youtubei.js passes the real
    // ones (its client User-Agent included) in `init`, so those win.
    const body = init.body !== undefined ? init.body : ['GET', 'HEAD'].includes(input.method) ? undefined : await input.clone().text();
    return [input.url, { method: init.method || input.method, headers: { ...plainHeaders(input.headers), ...plainHeaders(init.headers) }, body, signal: init.signal || input.signal }];
  }
  return [String(input), { ...init, headers: plainHeaders(init.headers) }];
}
// Every outside request gets a deadline. Android's native HTTP has none and iOS waits up to 10 minutes, so one
// stalled request (network switch, captive portal) kept a song "loading" until the app was restarted.
const REQUEST_DEADLINE_MS = 30000;
globalThis.__urielFetch = async (input, init) => {
  const [url, opts] = await toPlain(input, init);
  const timeout = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_DEADLINE_MS) : null;
  if (timeout) opts.signal = opts.signal && AbortSignal.any ? AbortSignal.any([opts.signal, timeout]) : (opts.signal || timeout);
  let request: Promise<Response>;
  if (Capacitor.isNativePlatform()) request = pageFetch(url, opts);
  else {
    const { headers, ...rest } = opts;
    request = pageFetch(`/__proxy?url=${encodeURIComponent(url)}`, { ...rest, headers: { 'x-fwd-headers': JSON.stringify(headers || {}) } });
  }
  // native POSTs ignore the signal, so the deadline is also enforced here
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`request timed out: ${url.slice(0, 80)}`)), REQUEST_DEADLINE_MS + 1000); });
  try { return await Promise.race([request, deadline]); } finally { clearTimeout(timer); }
};

// ---- secrets server.js keeps (the Last.fm logins) ----
// In the WebView's own storage, which only Uriel can read; not under /data, which on iPhone is the Uriel folder
// the Files app shows (and backs up). One entry per device (profiles-core.js lists uriel_secret_ as a device key)
// holding each profile's login, like lastfm-auth.enc on desktop. Never synced, never in an account export.
globalThis.__urielVault = (name: string) => {
  const key = `uriel_secret_${String(name).replace(/[^a-z0-9_]/gi, '')}`;
  return {
    read() {
      const raw = localStorage.getItem(key);
      if (raw == null) throw Object.assign(new Error('nothing saved'), { code: 'ENOENT' });
      return JSON.parse(raw);
    },
    write(value: unknown) { localStorage.setItem(key, JSON.stringify(value)); },
  };
};

// ---- the in-app "server" ----
let server: ServerModule | null = null;
async function start(): Promise<void> {
  await fs.init();
  server = require('../shared/server.js') as ServerModule;
  server.startServer(PORT);
}
const ready = start();

function call(url: string, init: RequestInit = {}): Promise<Answer> {
  return ready.then(() => http.dispatch({
    url: url.slice(BASE.length - 1),
    method: init.method || 'GET',
    // there's no socket to protect in-app, but server.js checks its CSRF token, so every call carries it
    headers: { ...plainHeaders(init.headers), 'x-uriel-token': server!.getServerToken() },
    body: typeof init.body === 'string' ? init.body : '',
    signal: init.signal,
  }));
}
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

const fileUrls = new Map<string, Promise<string>>();
async function fileUrlFor(vpath: string): Promise<string> {
  if (!fileUrls.has(vpath)) {
    await fs._flush(); // a just-written file must reach disk before the WebView reads it
    fileUrls.set(vpath, store.fileUrl(vpath, mimeOf(vpath)));
  }
  return fileUrls.get(vpath)!;
}

// Turns an app.js URL like http://127.0.0.1:38472/api/local-track?id=x into something the WebView can load.
async function resolveLocalUrl(u: string): Promise<string> {
  const r = await call(u);
  if (r.file) return fileUrlFor(r.file);
  throw new Error(`no file behind ${u} (${r.status})`);
}

// the native player (mobile/native-audio.ts) loads songs by file, not through <audio src>
window.__urielResolveLocal = resolveLocalUrl;

window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : undefined;
  if (!url || !url.startsWith(BASE)) return pageFetch(input, init);
  const started = Date.now();
  // app.js aborts the previous song's lookup on every skip; that now also stops its download (see http shim)
  if (init.signal && init.signal.aborted) throw abortError();
  let r = await call(url, init);
  if (r.aborted || (init.signal && init.signal.aborted)) throw abortError();
  // loading a song can fail on a passing YouTube/network hiccup; one quiet retry fixes most of them.
  // A slow failure already went through every download route, so repeating it only burns data and battery.
  if (r.status >= 500 && url.includes('/api/stream-info') && Date.now() - started < 6000) {
    urielLog('warn', `stream-info failed (${r.status}), retrying: ${r.body.slice(0, 120)}`);
    await new Promise((res) => setTimeout(res, 1200));
    // a skip during the wait or the retry is a cancel, not a failed song
    if (init.signal && init.signal.aborted) throw abortError();
    r = await call(url, init);
    if (r.aborted || (init.signal && init.signal.aborted)) throw abortError();
  }
  if (r.file) return pageFetch(await fileUrlFor(r.file));
  return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, String(v)])) });
};

// <audio src> and <img src> pointing at the local server get swapped for real file URLs.
function patchSrc(proto: HTMLMediaElement | HTMLImageElement): void {
  const desc = Object.getOwnPropertyDescriptor(proto, 'src');
  const getSrc = desc && desc.get;
  const setSrc = desc && desc.set;
  if (!getSrc || !setSrc) return;
  Object.defineProperty(proto, 'src', {
    configurable: true,
    get(this: HTMLElement): string { return this.__urielSrc !== undefined ? this.__urielSrc : getSrc.call(this); },
    set(this: HTMLElement, value: unknown) {
      const v = String(value);
      if (!v.startsWith(BASE)) { this.__urielSrc = undefined; this.__urielPending = null; setSrc.call(this, v); return; }
      this.__urielSrc = v;
      this.__urielPending = resolveLocalUrl(v)
        .then((real) => { if (this.__urielSrc === v) setSrc.call(this, real); })
        .catch((e: unknown) => { console.warn('[uriel]', e instanceof Error ? e.message : e); if (this.__urielSrc === v) this.dispatchEvent(new Event('error')); });
    },
  });
}
patchSrc(HTMLMediaElement.prototype);
patchSrc(HTMLImageElement.prototype);

// app.js unloads a song with removeAttribute('src'); forget the local URL too, or `audio.src` keeps reporting
// the old song (so play/pause thought one was loaded) and a late file lookup could load it back in
const realRemoveAttribute = Element.prototype.removeAttribute;
Element.prototype.removeAttribute = function (this: Element, name: string): void {
  if (this.__urielSrc !== undefined && String(name).toLowerCase() === 'src') { this.__urielSrc = undefined; this.__urielPending = null; }
  return realRemoveAttribute.call(this, name);
};

const realPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function (this: HTMLMediaElement): Promise<void> {
  return this.__urielPending ? this.__urielPending.then(() => realPlay.call(this)) : realPlay.call(this);
};

// <img src="..."> written as HTML strings never hit the setter above.
new MutationObserver((muts) => {
  for (const m of muts) {
    const nodes: Node[] = m.type === 'attributes' ? [m.target] : [...m.addedNodes].flatMap((n) => (n instanceof Element ? [n, ...n.querySelectorAll('img')] : []));
    for (const n of nodes) {
      if (n instanceof HTMLImageElement && n.__urielSrc === undefined) {
        const raw = n.getAttribute('src') || '';
        if (raw.startsWith(BASE)) n.src = raw;
      }
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

// Android hardware back: close whatever is on top instead of quitting the app.
// On Home it backgrounds the app (music keeps playing) rather than closing it.
if (Capacitor.getPlatform() === 'android') {
  // app.js plays through the native player (android/.../PlayerService.kt) in place of its <audio> element
  window.UrielAudioElement = nativeAudio;
  // YouTube songs download as Opus (WebM) instead of AAC (shims/child_process.ts)
  globalThis.__urielPlaysOpus = true;
  const visible = (el: Element | null): el is HTMLElement => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const click = (id: string) => { const b = document.getElementById(id); if (b) b.click(); };
  App.addListener('backButton', () => {
    if (window.UrielEncore && document.querySelector('.encore')) { window.UrielEncore.close(); return; }
    const modal = [...document.querySelectorAll<HTMLElement>('.modal-backdrop')].reverse().find((m) => visible(m) && m.classList.contains('visible'));
    if (modal) {
      const closeBtn = modal.querySelector<HTMLElement>('[id^="btn-close"], [id^="btn-cancel"], .modal-close');
      if (closeBtn) closeBtn.click(); else modal.click();
      return;
    }
    const tv = document.getElementById('tv-karaoke');
    if (visible(tv)) { click('btn-close-tv-karaoke'); return; }
    const drawer = document.getElementById('rail-drawer');
    if (visible(drawer)) { click('btn-close-rail-drawer'); return; }
    if (document.body.classList.contains('np-open')) { click('btn-close-right-panel'); return; }
    // Settings: out of the search, then out of the open category back to the list of categories
    if (window.UrielSettingsBack && window.UrielSettingsBack()) return;
    const home = document.getElementById('nav-discover');
    if (home && !home.classList.contains('active')) { home.click(); return; }
    App.minimizeApp();
  });
}

// uriel://link?code=… (the QR code in Settings → Sync, scanned with the camera) opens the app; sync.js links it
{
  const deliver = (url: string | undefined) => {
    // muriel:// too: links and QR codes made before the rename (and the Sync page) still use it
    if (!url || !/^(?:uriel|muriel):/i.test(url)) return;
    const go = () => window.dispatchEvent(new CustomEvent('uriel:deeplink', { detail: url }));
    if (window.UrielSync) go(); else window.addEventListener('uriel:ready', () => setTimeout(go, 300), { once: true });
  };
  App.addListener('appUrlOpen', (e) => deliver(e && e.url));
  App.getLaunchUrl().then((r) => deliver(r && r.url)).catch(() => {});
}

window.electronAPI = electronAPI({ ready, port: PORT, fs, fileUrlFor });
liveActivity();
mediaControls();
// (asked for only once the server is running)
deviceMusic(() => server!);
appIcon();
systemBars();
appUpdater();
backgroundAudio();
audioInterruption();
document.documentElement.classList.add('is-mobile', Capacitor.getPlatform() === 'android' ? 'is-android' : 'is-ios');
