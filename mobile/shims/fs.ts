// Node `fs` for the iOS build. server.js mixes sync and async calls, so every file lives in an
// in-memory index (text files keep their contents; audio/images only size + mtime) and writes go
// through to the store in the background. init() must finish before server.js is required.
import path = require('path');
import store = require('./store');

// a file or folder in the index; `text` is held for the small text files server.js reads with readFileSync
interface FsNode { isDir: boolean; size: number; mtimeMs: number; text?: string }
type FileData = string | Uint8Array | ArrayBuffer;
// the fake response of the http shim: a file piped into it becomes a file URL
interface PipeTarget { __pipeFile?: (vpath: string) => void }

const TEXT_EXT = /\.(json|lrc|txt)$/i;
const nodes = new Map<string, FsNode>();
let chain: Promise<unknown> = Promise.resolve();
// a failed write (storage full) used to look saved until the next launch: log it and tell the app
const persist = (fn: () => Promise<unknown>) => {
  chain = chain.then(fn).catch((e) => {
    console.warn('[fs] persist failed', e);
    try { window.dispatchEvent(new CustomEvent('uriel:storage-error', { detail: String((e && e.message) || e) })); } catch (_) {}
  });
  return chain;
};

const norm = (p: string) => path.resolve('/', String(p).replace(/\\/g, '/'));
const err = (code: string, p: string) => Object.assign(new Error(`${code}: ${p}`), { code, path: p });

function ensureParents(p: string) {
  let dir = path.dirname(p);
  while (dir && dir !== '/' && !nodes.has(dir)) {
    nodes.set(dir, { isDir: true, size: 0, mtimeMs: Date.now() });
    dir = path.dirname(dir);
  }
}

function makeStat(n: FsNode) {
  return {
    size: n.size, mtimeMs: n.mtimeMs, mtime: new Date(n.mtimeMs), atimeMs: n.mtimeMs, ctimeMs: n.mtimeMs,
    isFile: () => !n.isDir, isDirectory: () => n.isDir,
  };
}

function childrenOf(dir: string) {
  const prefix = dir === '/' ? '/' : dir + '/';
  const out: [string, FsNode][] = [];
  for (const [p, n] of nodes) {
    if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/') && p !== dir) out.push([path.basename(p), n]);
  }
  return out;
}

function toText(data: FileData, enc?: string) {
  if (typeof data === 'string') return data;
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  return String(data);
}

function bytesOf(data: FileData) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function writeSyncImpl(p: string, data: FileData) {
  p = norm(p);
  ensureParents(p);
  const isText = TEXT_EXT.test(p) || typeof data === 'string';
  const bytes = bytesOf(data);
  nodes.set(p, { isDir: false, size: bytes.length, mtimeMs: Date.now(), text: isText ? toText(data) : undefined });
  return persist(() => (isText ? store.writeText(p, toText(data)) : store.writeBytes(p, bytes)));
}

function removeTree(p: string) {
  for (const k of [...nodes.keys()]) if (k === p || k.startsWith(p + '/')) nodes.delete(k);
}

// a folder's entry, as fs.readdirSync(…, { withFileTypes: true }) gives them
interface DirEntry { name: string; isFile(): boolean; isDirectory(): boolean }
function readdirSync(p: string, opts: { withFileTypes: true }): DirEntry[];
function readdirSync(p: string, opts?: { withFileTypes?: false }): string[];
function readdirSync(p: string, opts?: { withFileTypes?: boolean }): string[] | DirEntry[];
function readdirSync(p: string, opts?: { withFileTypes?: boolean }): string[] | DirEntry[] {
  p = norm(p);
  if (!nodes.has(p)) throw err('ENOENT', p);
  const kids = childrenOf(p);
  if (opts && opts.withFileTypes) return kids.map(([name, n]) => ({ name, isFile: () => !n.isDir, isDirectory: () => n.isDir }));
  return kids.map(([name]) => name);
}

const fs = {
  constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },

  async init() {
    const entries = await store.list();
    nodes.set('/data', { isDir: true, size: 0, mtimeMs: Date.now() });
    for (const e of entries) nodes.set(e.vpath, { isDir: e.isDir, size: e.size, mtimeMs: e.mtimeMs });
    await Promise.all(entries.filter((e) => !e.isDir && TEXT_EXT.test(e.vpath)).map(async (e) => {
      try { nodes.get(e.vpath)!.text = await store.readText(e.vpath); } catch (x) {}
    }));
  },

  // Called by the stream bridge after a native download lands on disk.
  _register(p: string, size: number) {
    p = norm(p);
    ensureParents(p);
    nodes.set(p, { isDir: false, size, mtimeMs: Date.now() });
  },
  _flush: () => chain,
  // A picked file (File/Blob) straight to disk, in pieces: never read into memory whole (store.writeBlob).
  // Resolves once it's written; if that failed, the file isn't there.
  _writeBlob(p: string, blob: Blob) {
    p = norm(p);
    ensureParents(p);
    nodes.set(p, { isDir: false, size: blob.size, mtimeMs: Date.now() });
    return persist(() => store.writeBlob(p, blob).catch((e) => { nodes.delete(p); throw e; }));
  },

  existsSync: (p: string) => nodes.has(norm(p)),
  accessSync: (p: string) => { if (!nodes.has(norm(p))) throw err('ENOENT', p); },
  chmodSync: () => {},

  mkdirSync(p: string) {
    p = norm(p);
    if (nodes.has(p)) return;
    ensureParents(p);
    nodes.set(p, { isDir: true, size: 0, mtimeMs: Date.now() });
    persist(() => store.mkdir(p));
  },
  mkdtempSync(prefix: string) {
    const p = norm(prefix + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(p);
    return p;
  },

  readFileSync(p: string, enc?: string) {
    const n = nodes.get(norm(p));
    if (!n || n.isDir) throw err('ENOENT', p);
    if (n.text === undefined) throw err('EIO', p + ' (binary file not held in memory)');
    return n.text;
  },
  writeFileSync: (p: string, data: FileData) => { writeSyncImpl(p, data); },

  statSync(p: string) {
    const n = nodes.get(norm(p));
    if (!n) throw err('ENOENT', p);
    return makeStat(n);
  },
  readdirSync,
  unlinkSync(p: string) {
    p = norm(p);
    if (!nodes.has(p)) throw err('ENOENT', p);
    nodes.delete(p);
    persist(() => store.remove(p, false));
  },
  rmSync(p: string) {
    p = norm(p);
    const n = nodes.get(p);
    if (!n) return;
    removeTree(p);
    persist(() => store.remove(p, n.isDir));
  },
  renameSync(a: string, b: string) {
    a = norm(a); b = norm(b);
    const n = nodes.get(a);
    if (!n) throw err('ENOENT', a);
    nodes.delete(a);
    ensureParents(b);
    nodes.set(b, { ...n, mtimeMs: Date.now() });
    persist(() => store.rename(a, b));
  },
  copyFileSync(a: string, b: string) {
    a = norm(a); b = norm(b);
    const n = nodes.get(a);
    if (!n) throw err('ENOENT', a);
    ensureParents(b);
    nodes.set(b, { ...n, mtimeMs: Date.now() });
    persist(() => store.copy(a, b));
  },

  // Audio/thumbnail routes pipe a file into the response; the fake response turns that into a file URL.
  createReadStream(p: string, opts?: { withFileTypes?: boolean }) {
    const vpath = norm(p);
    return { __vpath: vpath, on() { return this; }, pipe(dest: PipeTarget) { if (dest.__pipeFile) dest.__pipeFile(vpath); return dest; } };
  },
  createWriteStream() {
    throw err('ENOTSUP', 'createWriteStream');
  },
};

const promises = {
  stat: async (p: string) => fs.statSync(p),
  readdir: async (p: string, opts?: { withFileTypes?: boolean }) => readdirSync(p, opts),
  readFile: async (p: string, enc?: string) => fs.readFileSync(p, enc),
  writeFile: async (p: string, data: FileData) => { await writeSyncImpl(p, data); },
  unlink: async (p: string) => fs.unlinkSync(p),
  rename: async (a: string, b: string) => fs.renameSync(a, b),
  copyFile: async (a: string, b: string) => fs.copyFileSync(a, b),
  mkdir: async (p: string) => fs.mkdirSync(p),
  rmdir: async (p: string) => fs.rmSync(p),
  rm: async (p: string) => fs.rmSync(p),
  utimes: async (p: string) => { const n = nodes.get(norm(p)); if (n) n.mtimeMs = Date.now(); },
};

export = Object.assign(fs, { promises });
