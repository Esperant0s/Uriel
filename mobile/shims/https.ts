// `https.get/request` over fetch. In the iOS app CapacitorHttp patches fetch to native HTTP,
// so there is no CORS; in the browser test harness the bridge routes it through a dev proxy.
import { EventEmitter } from 'events';

type Chunk = string | Uint8Array;
// the options of Node's https.request that server.js uses
interface RequestOptions {
  protocol?: string; hostname?: string; host?: string; path?: string; method?: string; timeout?: number;
  headers?: Record<string, string>;
}
// what a response is piped into
interface Sink { write(c: Chunk): unknown; end(): unknown }
interface FakeResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  setEncoding(): FakeResponse;
  resume(): FakeResponse;
  destroy(): FakeResponse;
  pipe<T extends Sink>(dest: T): T;
}
type OnResponse = (res: FakeResponse) => void;
interface FakeRequest extends EventEmitter {
  setTimeout(ms: number, fn?: () => void): FakeRequest;
  write(c: Chunk): boolean;
  destroy(e?: Error): void;
  end(c?: Chunk): FakeRequest;
}
type Target = string | URL | RequestOptions;

function normalizeArgs(a: Target, b?: RequestOptions | OnResponse, c?: OnResponse): { url: string; opts: RequestOptions; cb?: OnResponse } {
  if (typeof a === 'string' || a instanceof URL) {
    if (typeof b === 'function') return { url: String(a), opts: {}, cb: b };
    return { url: String(a), opts: b || {}, cb: c };
  }
  const opts = a || {};
  return { url: `${opts.protocol || 'https:'}//${opts.hostname || opts.host}${opts.path || '/'}`, opts, cb: typeof b === 'function' ? b : c };
}

function request(a: Target, b?: RequestOptions | OnResponse, c?: OnResponse): FakeRequest {
  const { url, opts, cb } = normalizeArgs(a, b, c);
  const ctrl = new AbortController();
  let body = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent = false;
  const armTimeout = (ms?: number) => {
    clearTimeout(timer);
    if (ms) timer = setTimeout(() => req.emit('timeout'), ms);
  };

  const req: FakeRequest = Object.assign(new EventEmitter(), {
    setTimeout(ms: number, fn?: () => void) { if (fn) req.on('timeout', fn); armTimeout(ms); return req; },
    write(chunk: Chunk) { body += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk); return true; },
    destroy(e?: Error) { clearTimeout(timer); ctrl.abort(); req.emit('error', e || new Error('socket hang up')); },
    end(chunk?: Chunk) {
      if (chunk) req.write(chunk);
      if (sent) return req;
      sent = true;
      const headers = { ...(opts.headers || {}) };
      delete headers['Content-Length']; delete headers['content-length']; delete headers.host; delete headers.Host;
      const method = (opts.method || 'GET').toUpperCase();
      globalThis.__urielFetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal: ctrl.signal })
        .then(async (r) => {
          const text = await r.text();
          clearTimeout(timer);
          const res: FakeResponse = Object.assign(new EventEmitter(), {
            statusCode: r.status,
            headers: Object.fromEntries([...r.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])),
            setEncoding: () => res,
            // the body is already in memory: draining (non-2xx answers) and dropping (oversized ones) are no-ops,
            // but server.js calls them, and a throw there skipped the resolve and hung the caller
            resume: () => res,
            destroy: () => res,
            pipe<T extends Sink>(dest: T) { dest.write(text); dest.end(); return dest; },
          });
          if (cb) cb(res);
          req.emit('response', res);
          setTimeout(() => { res.emit('data', text); res.emit('end'); }, 0);
        })
        .catch((e: unknown) => { clearTimeout(timer); if ((e as { name?: string } | null)?.name !== 'AbortError') req.emit('error', e); });
      return req;
    },
  });
  armTimeout(opts.timeout);
  return req;
}

function get(a: Target, b?: RequestOptions | OnResponse, c?: OnResponse): FakeRequest {
  const req = request(a, b, c);
  req.end();
  return req;
}

export = { request, get };
