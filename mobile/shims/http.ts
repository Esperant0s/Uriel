// `http.createServer` for the iOS build: there is no socket. The bridge calls dispatch() with a
// request and gets back { status, headers, body, file } where `file` is set when a route piped a file.
import { EventEmitter } from 'events';
import https = require('./https');

type Chunk = string | Uint8Array;
type Headers = Record<string, string>;
// what a request is piped into
interface Sink { write(c: Chunk): unknown; end(): unknown }
interface FakeRequest extends EventEmitter {
  url: string;
  method: string;
  headers: Headers;
  pipe<T extends Sink>(dest: T): T;
  resume(): FakeRequest;
  destroy(): FakeRequest;
}
interface FakeResponse extends EventEmitter {
  statusCode: number;
  _headers: Record<string, string | number>;
  headersSent: boolean;
  setHeader(k: string, v: string | number): void;
  getHeader(k: string): string | number | undefined;
  writeHead(status: number, h?: Record<string, string | number>): FakeResponse;
  write(c: Chunk): boolean;
  end(c?: Chunk): void;
  // fs.createReadStream(…).pipe(res) ends here: the file itself is the answer (shims/fs.ts)
  __pipeFile(vpath: string): void;
}
// server.js's request handler
type Handler = (req: FakeRequest, res: FakeResponse) => unknown;
// a call from the page to the in-app server, and its answer
interface Call { url: string; method?: string; headers?: Headers; body?: string; signal?: AbortSignal | null }
interface Answer { status: number; headers: Record<string, string | number>; body: string; file?: string; aborted?: boolean }
interface FakeServer extends EventEmitter {
  listening: boolean;
  _port?: number;
  listen(port: number, host?: string, cb?: () => void): FakeServer;
  address(): { port: number | undefined };
}

let handler: Handler | null = null;

function dispatch({ url, method = 'GET', headers = {}, body = '', signal }: Call): Promise<Answer> {
  return new Promise((resolve) => {
    const req: FakeRequest = Object.assign(new EventEmitter(), {
      url,
      method: method.toUpperCase(),
      headers: { host: '127.0.0.1', ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) },
      pipe<T extends Sink>(dest: T) { if (body) dest.write(body); dest.end(); return dest; },
      // server.js calls these on an oversized body (413) and an aborted upload; without them that path threw
      resume: () => req,
      destroy: () => req,
    });

    let chunks = '';
    let done = false;
    const finish = (extra?: Partial<Answer>) => {
      if (done) return;
      done = true;
      resolve({ status: res.statusCode, headers: res._headers, body: chunks, ...extra });
    };
    const res: FakeResponse = Object.assign(new EventEmitter(), {
      statusCode: 200,
      _headers: {} as Record<string, string | number>,
      headersSent: false,
      setHeader(k: string, v: string | number) { res._headers[k.toLowerCase()] = v; },
      getHeader(k: string) { return res._headers[k.toLowerCase()]; },
      writeHead(status: number, h?: Record<string, string | number>) {
        res.statusCode = status;
        if (h) for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
        res.headersSent = true;
        return res;
      },
      write(c: Chunk) { chunks += typeof c === 'string' ? c : new TextDecoder().decode(c); return true; },
      end(c?: Chunk) { if (c) res.write(c); finish(); },
      __pipeFile(vpath: string) { finish({ file: vpath }); },
    });

    // the caller gave up (skipped song): like a closed socket, the route hears 'close' before it answered
    if (signal) {
      const onAbort = () => { if (done) return; req.emit('aborted'); req.emit('close'); finish({ status: 499, aborted: true }); };
      if (signal.aborted) setTimeout(onAbort, 0); else signal.addEventListener('abort', onAbort, { once: true });
    }
    Promise.resolve(handler!(req, res)).catch((e: unknown) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(String((e instanceof Error && e.message) || e));
    });
    setTimeout(() => {
      if (body) req.emit('data', body);
      req.emit('end');
    }, 0);
  });
}

export = {
  createServer(h: Handler): FakeServer {
    handler = h;
    const server: FakeServer = Object.assign(new EventEmitter(), {
      listening: false,
      listen(port: number, _host?: string, cb?: () => void) { server.listening = true; server._port = port; if (cb) setTimeout(cb, 0); return server; },
      address: () => ({ port: server._port }),
    });
    return server;
  },
  request: https.request,
  get: https.get,
  dispatch,
};
