// @ts-check
// One way to find a playable stream for a song, on every platform (docs/design/playback-resolution.md).
// server.js passes the list of strategies it has (computers: fast lookup, yt-dlp, other uploads, SoundCloud;
// phones: the in-app download, other uploads, SoundCloud) and they all share one health board, so the rules for
// "YouTube is turning us away" and "this source keeps failing" live in one place. No network in here: the
// strategies do that, which is what lets test/stream-resolver.test.js drive it with fakes and a fake clock.

const BLOCK_MS = 10 * 60 * 1000; // "confirm you're not a bot" lasts a while for the whole address
const SOFT_FAILS = 3; // timeouts / errors in a row before a source rests
const REST_MS = [60e3, 120e3, 240e3, 480e3, 600e3];

// Per source ('youtube-fast', 'youtube-ytdlp', 'soundcloud', ...): blocked until, resting until, counts.
function createHealth({ now = () => Date.now() } = {}) {
  const sources = new Map();
  const get = (src) => {
    if (!sources.has(src)) sources.set(src, { blockedUntil: 0, restUntil: 0, fails: 0, rests: 0, ok: 0, blocked: 0, failed: 0 });
    return sources.get(src);
  };
  return {
    blocked(src) { if (!src) return false; const s = get(src); return now() < s.blockedUntil || now() < s.restUntil; },
    block(src, ms = BLOCK_MS) { const s = get(src); s.blockedUntil = now() + ms; s.blocked++; },
    // a soft failure: after SOFT_FAILS in a row the source rests 1, 2, 4, 8, then 10 minutes
    fail(src) {
      const s = get(src);
      s.failed++;
      if (++s.fails < SOFT_FAILS) return;
      s.restUntil = now() + REST_MS[Math.min(s.rests, REST_MS.length - 1)];
      s.rests++;
      s.fails = 0;
    },
    ok(src) { const s = get(src); s.ok++; s.fails = 0; s.rests = 0; s.restUntil = 0; s.blockedUntil = 0; },
    // signing in to YouTube, or the network changing: try again at once
    reset(src) { for (const [k, s] of sources) if (!src || k === src) { s.blockedUntil = 0; s.restUntil = 0; s.fails = 0; s.rests = 0; } },
    stats() {
      const out = {};
      for (const [k, s] of sources) out[k] = { ok: s.ok, blocked: s.blocked, failed: s.failed, waiting: Math.max(0, Math.max(s.blockedUntil, s.restUntil) - now()) };
      return out;
    },
  };
}

class ResolveError extends Error {
  constructor(code, tried) {
    super(code === 'blocked' ? 'blocked' : code === 'aborted' ? 'aborted' : 'unavailable');
    this.code = code;
    this.tried = tried;
  }
}

const sourceOf = (s, song) => (typeof s.source === 'function' ? s.source(song) : s.source) || null;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timed out'), { timeout: true })), ms); })])
    .finally(() => clearTimeout(timer));
}

// strategies: [{ name, source, maxMs, canHandle(song, health), attempt(song, { budgetMs, health, signal }) }]
//   attempt resolves to a result ({ url, headers } or { local: true }) or to null for "not here"; throws to fail
// isBlocked(error): true for a definite refusal ("confirm you're not a bot", HTTP 429)
/** @param {{ strategies: any[], health?: any, isBlocked?: (e: any) => boolean, now?: () => number, log?: (song: any, tried: any[]) => void }} o */
function createResolver({ strategies, health = createHealth(), isBlocked = () => false, now = () => Date.now(), log = () => {} }) {
  const inFlight = new Map();

  /** @param {any} song @param {{ reason?: string, deadlineMs?: number, signal?: AbortSignal }} [o] */
  async function run(song, { reason = 'play', deadlineMs = 30000, signal } = {}) {
    const start = now();
    const tried = [];
    let sawBlock = false;
    for (const s of strategies) {
      if (signal && signal.aborted) throw new ResolveError('aborted', tried);
      if (s.canHandle && !s.canHandle(song, health)) continue;
      const src = sourceOf(s, song);
      if (health.blocked(src)) { tried.push({ name: s.name, outcome: 'skipped' }); sawBlock = true; continue; }
      const left = deadlineMs - (now() - start);
      if (left <= 0) { tried.push({ name: s.name, outcome: 'no time' }); break; }
      const budgetMs = Math.min(s.maxMs || left, left);
      const t0 = now();
      try {
        const result = await withTimeout(Promise.resolve(s.attempt(song, { budgetMs, health, signal, reason })), budgetMs);
        if (result && (result.url || result.local)) {
          if (src) health.ok(src);
          tried.push({ name: s.name, outcome: 'ok', ms: now() - t0 });
          log(song, tried);
          return { ...result, source: s.name, tried };
        }
        tried.push({ name: s.name, outcome: 'none', ms: now() - t0 });
      } catch (e) {
        if (isBlocked(e)) {
          sawBlock = true;
          // a background lookup never takes a source away from the song the listener taps next
          if (src && reason !== 'prefetch') health.block(src);
          tried.push({ name: s.name, outcome: 'blocked', ms: now() - t0 });
        } else {
          if (src) health.fail(src);
          tried.push({ name: s.name, outcome: e && e.timeout ? 'timeout' : 'error', ms: now() - t0, error: e && e.message });
        }
      }
    }
    log(song, tried);
    throw new ResolveError(sawBlock ? 'blocked' : 'unavailable', tried);
  }

  return {
    health,
    // the same song asked for twice at once (a prefetch and a tap) shares one lookup
    resolve(song, opts = {}) {
      const key = song && song.key;
      if (key && inFlight.has(key)) return inFlight.get(key);
      const p = run(song, opts).finally(() => { if (key) inFlight.delete(key); });
      if (key) inFlight.set(key, p);
      return p;
    },
  };
}

module.exports = { createHealth, createResolver, ResolveError, BLOCK_MS, SOFT_FAILS, REST_MS };
