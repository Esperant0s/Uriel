// `dns.promises.lookup` for the iOS/Android build. A WebView has no resolver, so names are resolved
// over DNS-over-HTTPS (Cloudflare), keeping server.js's private-address (SSRF) check meaningful.
// an address as Node's dns.lookup gives it
interface Address { address: string; family: 4 | 6 }
type LookupDone = (err: unknown, address?: string, family?: number) => void;

async function query(host: string, type: 'A' | 'AAAA'): Promise<Address[]> {
  const r = await globalThis.__urielFetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
  const j = await r.json() as { Answer?: { type: number; data: string }[] };
  const want = type === 'A' ? 1 : 28;
  return (j.Answer || []).filter((a) => a.type === want).map((a): Address => ({ address: a.data, family: type === 'A' ? 4 : 6 }));
}

async function lookup(host: string, opts: { all: true }): Promise<Address[]>;
async function lookup(host: string, opts?: { all?: false }): Promise<Address>;
async function lookup(host: string, opts: { all?: boolean } = {}): Promise<Address | Address[]> {
  const none = (): Address[] => [];
  const [v4, v6] = await Promise.all([query(host, 'A').catch(none), query(host, 'AAAA').catch(none)]);
  const all = [...v4, ...v6];
  if (!all.length) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  return opts.all ? all : all[0];
}

// the callback form: always one address
function lookupCb(host: string, opts: object | LookupDone, cb?: LookupDone): void {
  const done = typeof opts === 'function' ? opts as LookupDone : cb;
  if (!done) return;
  lookup(host).then((r) => done(null, r.address, r.family), done);
}

export = { promises: { lookup }, lookup: lookupCb };
