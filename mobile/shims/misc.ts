// Small Node built-ins: url.parse, os, string_decoder.
const os = { homedir: () => '/data', tmpdir: () => '/data/tmp', platform: () => 'ios', arch: () => 'arm64', cpus: () => [], EOL: '\n' };

function parse(u: string, parseQuery?: boolean) {
  const x = new URL(u, 'http://127.0.0.1');
  const query = parseQuery ? Object.fromEntries(x.searchParams.entries()) : x.search.slice(1);
  return { pathname: x.pathname, query, search: x.search, href: x.href, host: x.host, hostname: x.hostname };
}

class StringDecoder {
  private readonly d = new TextDecoder();
  write(c: string | Uint8Array): string { return typeof c === 'string' ? c : this.d.decode(c, { stream: true }); }
  end(c?: string | Uint8Array): string { return c ? this.write(c) : ''; }
}

export = { os, url: { parse, URL, URLSearchParams }, string_decoder: { StringDecoder } };
