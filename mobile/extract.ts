// In-app replacement for the parts of yt-dlp Uriel uses: YouTube/YouTube Music search,
// SoundCloud search, and resolving a track page to a direct audio URL.
// All network calls go through globalThis.__urielFetch (native HTTP in the app, dev proxy in a browser).
import { Innertube, Platform, Constants } from 'youtubei.js/web';

// ---- what this gives back, shaped like yt-dlp's JSON (shared/server.js reads it as such) ----
interface Thumb { url: string; width?: number; height?: number }
interface Entry {
  id: string; title: string; uploader?: string; channel?: string; channel_id?: string; artists?: string[];
  duration: number; thumbnails: Thumb[]; webpage_url?: string; playable?: boolean;
}
// where a song's audio is: a plain file, or an HLS playlist whose pieces are joined (shims/child_process.ts)
interface ResolvedAudio {
  url: string; headers: Record<string, string>; ext: string;
  kind?: 'hls'; container?: 'mp3' | 'fmp4';
  // the full-quality Opus file, where YouTube lists it
  opus?: { url: string; size: number } | null;
  artist?: string; title?: string; duration?: number;
}

// ---- the parts of YouTube's and SoundCloud's answers read here ----
type Text = string | { text?: string; toString(): string } | null | undefined;
interface YtAuthor { name?: Text; id?: string }
interface YtVideo {
  id?: string; type?: string; title?: Text; name?: Text; author?: YtAuthor; duration?: { seconds?: number };
  thumbnails?: Thumb[]; thumbnail?: { contents?: Thumb[] }; artists?: { name?: string; channel_id?: string }[];
  // the newer playlist layout ("LockupView")
  content_id?: string; content_type?: string;
  metadata?: { title?: Text; metadata?: { metadata_rows?: { metadata_parts?: { text?: Text }[] }[] } };
  content_image?: { image?: Thumb[]; overlays?: { badges?: { text?: string }[] }[] };
}
interface YtPlaylistPage { info?: { title?: Text }; videos?: YtVideo[]; items?: YtVideo[]; has_continuation?: boolean; getContinuation(): Promise<YtPlaylistPage> }
interface YtFormat { itag?: number; url?: string; contentLength?: string }
interface YtPlayerAnswer {
  streamingData?: { hlsManifestUrl?: string; adaptiveFormats?: YtFormat[] };
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { author?: string; title?: string; lengthSeconds?: string };
}
interface ScTranscoding { url?: string; snipped?: boolean; format?: { mime_type?: string; protocol?: string } }
interface ScTrack {
  id: number | string; kind?: string; title?: string; user?: { username?: string }; full_duration?: number; duration?: number;
  artwork_url?: string; permalink_url?: string; policy?: string; media?: { transcodings?: ScTranscoding[] };
  track_authorization?: string; tracks?: ScTrack[];
}
// a transcoding Uriel can play, and how
interface ScCandidate { tc: ScTranscoding; rank: number; ext: string; kind?: 'hls'; container?: 'mp3' | 'fmp4' }

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// youtubei.js needs a JS evaluator for signature deciphering (only used when a client returns ciphered URLs)
Platform.shim.eval = async (data, env) => {
  const props = [];
  if (env.n) props.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
  if (env.sig) props.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
  return new Function(`${data.output}\nreturn { ${props.join(', ')} }`)();
};

let ytPromise: Promise<Innertube> | null = null;
function yt(): Promise<Innertube> {
  if (!ytPromise) {
    ytPromise = Innertube.create({ generate_session_locally: true, fetch: (input, init) => globalThis.__urielFetch(input, init) })
      .catch((e) => { ytPromise = null; throw e; });
  }
  return ytPromise;
}

const ytId = (u: unknown): string | null => {
  const m = String(u).match(/(?:v=|youtu\.be\/|\/shorts\/|^)([\w-]{11})(?:[&?#]|$)/);
  return m ? m[1] : null;
};
const thumbs = (arr: Thumb[] | undefined): Thumb[] => (arr || []).map((t) => ({ url: t.url, width: t.width, height: t.height })).sort((a, b) => (a.width || 0) - (b.width || 0));
const text = (t: Text): string => (t == null ? '' : typeof t === 'string' ? t : t.text || t.toString());

async function youtubeSearch(query: string, limit: number): Promise<Entry[]> {
  const r = await (await yt()).search(query, { type: 'video' });
  return ((r.videos || []) as unknown as YtVideo[]).filter((v) => v.id).slice(0, limit).map((v) => ({
    id: v.id as string,
    title: text(v.title),
    uploader: text(v.author && v.author.name),
    channel: text(v.author && v.author.name),
    channel_id: v.author && v.author.id,
    duration: (v.duration && v.duration.seconds) || 0,
    thumbnails: thumbs(v.thumbnails),
    webpage_url: `https://www.youtube.com/watch?v=${v.id}`,
  }));
}

async function ytMusicSearch(query: string, limit: number): Promise<Entry[]> {
  const r = await (await yt()).music.search(query, { type: 'song' });
  const items = ((r.contents || []) as unknown as { contents?: YtVideo[] }[]).flatMap((c) => c.contents || []).filter((x) => x.id);
  return items.slice(0, limit).map((s) => ({
    id: s.id as string,
    title: text(s.title || s.name),
    artists: (s.artists || []).map((a) => a.name).filter((n): n is string => !!n),
    // the lead artist's channel, like yt-dlp's channel_id (several artists can share a name)
    channel_id: (s.artists || []).map((a) => a.channel_id).find(Boolean),
    duration: (s.duration && s.duration.seconds) || 0,
    thumbnails: thumbs(s.thumbnails || (s.thumbnail && s.thumbnail.contents)),
    webpage_url: `https://www.youtube.com/watch?v=${s.id}`,
  }));
}

// ---- YouTube audio ----
// Primary: the visionOS client's audio-only HLS (itag 234, ~128 kbps AAC; Opus on Android, see below). Its segments download
// without a proof-of-origin token, unlike direct googlevideo files, which now 403 after the first MB
// for most clients. Same approach yt-dlp uses. Needs a visitor id or YouTube asks to "sign in".
const VOS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
let visitorId: string | null = null;
let visitorAt = 0;
// a fresh id is fetched at most every 10 minutes: under YouTube's bot check every tap (and every retry and
// alternate upload) used to download the whole YouTube homepage again
const VISITOR_REFRESH_MS = 10 * 60 * 1000;
const visitorIsFresh = () => !!visitorId && Date.now() - visitorAt < VISITOR_REFRESH_MS;
async function getVisitorId(force: boolean): Promise<string | null> {
  if (visitorId && (!force || visitorIsFresh())) return visitorId;
  const html = await (await globalThis.__urielFetch('https://www.youtube.com/', { headers: { 'User-Agent': VOS_UA, 'Accept-Language': 'en-US' } })).text();
  visitorId = (html.match(/"VISITOR_DATA":"([^"]+)"/) || [])[1] || null;
  visitorAt = Date.now();
  return visitorId;
}

async function youtubeHlsAudio(id: string): Promise<ResolvedAudio> {
  for (const force of [false, true]) {
    const visitor = await getVisitorId(force);
    const body = {
      context: { client: { clientName: 'VISIONOS', clientVersion: '1.02', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1', userAgent: VOS_UA, osName: 'visionOS', osVersion: '26.5.23O471', hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0, visitorData: visitor || undefined } },
      videoId: id, contentCheckOk: true, racyCheckOk: true,
    };
    const headers: Record<string, string> = { 'User-Agent': VOS_UA, 'Content-Type': 'application/json', 'X-Youtube-Client-Name': '101', 'X-Youtube-Client-Version': '1.02', Origin: 'https://www.youtube.com' };
    if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
    const j = await (await globalThis.__urielFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers, body: JSON.stringify(body) })).json() as YtPlayerAnswer;
    const master = j.streamingData && j.streamingData.hlsManifestUrl;
    if (!master) {
      // stale visitor id: try once with a new one, unless the current one is new already (then a refresh won't help)
      if (j.playabilityStatus && j.playabilityStatus.status === 'LOGIN_REQUIRED' && !force && !visitorIsFresh()) continue;
      throw new Error((j.playabilityStatus && j.playabilityStatus.reason) || 'no HLS stream');
    }
    const m3u = await (await globalThis.__urielFetch(master, { headers: { 'User-Agent': VOS_UA } })).text();
    const pick = (itag: number) => (m3u.match(new RegExp(`#EXT-X-MEDIA:[^\\n]*URI="([^"]+/itag/${itag}/[^"]*)"`)) || [])[1];
    const playlist = pick(234) || pick(233);
    if (!playlist) throw new Error('no audio rendition');
    const d = j.videoDetails || {};
    // The same answer lists the full-quality Opus file (itag 251, ~130-160 kbps) as a plain link. For this
    // client it downloads without a proof-of-origin token (yt-dlp has no GVS token policy for visionos).
    // Phones that play Opus try it first and fall back to the HLS AAC if it fails (shims/child_process.ts).
    const f251 = ((j.streamingData && j.streamingData.adaptiveFormats) || []).find((f) => f.itag === 251 && f.url && Number(f.contentLength) > 0);
    const opus = f251 && f251.url ? { url: f251.url, size: Number(f251.contentLength) } : null;
    return { kind: 'hls', url: playlist, headers: { 'User-Agent': VOS_UA }, ext: 'aac', opus, artist: (d.author || '').replace(/\s*-\s*Topic$/i, ''), title: d.title, duration: Number(d.lengthSeconds) || 0 };
  }
  throw new Error('YouTube refused the request');
}

// Fallback: direct m4a (itag 140). Works for videos YouTube doesn't gate yet.
async function youtubeAudio(id: string): Promise<ResolvedAudio> {
  try { return await youtubeHlsAudio(id); } catch (e) { console.warn('[uriel] HLS route failed, trying direct', e instanceof Error ? e.message : e); }
  const y = await yt();
  let lastErr: unknown = null;
  for (const client of ['IOS', 'MWEB', 'TV'] as const) {
    try {
      const info = await y.getBasicInfo(id, { client });
      const formats = (info.streaming_data && info.streaming_data.adaptive_formats || []).filter((f) => f.has_audio && !f.has_video);
      const pick = formats.filter((f) => /mp4/.test(f.mime_type)).sort((a, b) => b.bitrate - a.bitrate)[0] || formats.sort((a, b) => b.bitrate - a.bitrate)[0];
      if (!pick) throw new Error('no audio format');
      const url = pick.url || await pick.decipher(y.session.player);
      // googlevideo ties the URL to the client that asked for it; download with the same User-Agent
      // (not every client in youtubei.js's list has one)
      const known = Constants.CLIENTS[client];
      const ua = ('USER_AGENT' in known && known.USER_AGENT) || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
      return { url, headers: { 'User-Agent': ua }, ext: /mp4/.test(pick.mime_type) ? 'm4a' : 'webm', artist: text(info.basic_info.author).replace(/\s*-\s*Topic$/i, ''), title: info.basic_info.title, duration: info.basic_info.duration };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('could not extract audio stream');
}

// ---- SoundCloud (public api-v2 with the web client's client_id) ----
// finding it downloads a script of about 3 MB, so it is kept between starts; scApi reads a new one when it's refused
const SC_ID_KEY = 'uriel_sc_client_id';
let scClientId: string | null = null;
async function scId(force: boolean): Promise<string> {
  if (!scClientId && !force) { try { scClientId = localStorage.getItem(SC_ID_KEY); } catch (e) {} }
  if (scClientId && !force) return scClientId;
  const html = await (await globalThis.__urielFetch('https://soundcloud.com/', { headers: { 'User-Agent': DESKTOP_UA } })).text();
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]).reverse();
  for (const s of scripts) {
    const m = (await (await globalThis.__urielFetch(s)).text()).match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{20,})"/);
    if (m) {
      scClientId = m[1];
      try { localStorage.setItem(SC_ID_KEY, scClientId); } catch (e) {}
      return scClientId;
    }
  }
  throw new Error('SoundCloud client id not found');
}

async function scApi<T>(path: string): Promise<T> {
  for (const force of [false, true]) {
    const id = await scId(force);
    const r = await globalThis.__urielFetch(`https://api-v2.soundcloud.com${path}${path.includes('?') ? '&' : '?'}client_id=${id}`, { headers: { 'User-Agent': DESKTOP_UA } });
    if (r.status === 401 || r.status === 403) continue; // client_id rotated
    if (!r.ok) throw new Error(`SoundCloud ${r.status}`);
    return r.json() as Promise<T>;
  }
  throw new Error('SoundCloud refused the request');
}

const scEntry = (t: ScTrack): Entry => ({
  id: String(t.id),
  title: t.title || '',
  uploader: t.user && t.user.username,
  duration: Math.round((t.full_duration || t.duration || 0) / 1000),
  thumbnails: t.artwork_url ? [{ url: t.artwork_url.replace('-large.', '-t500x500.') }] : [],
  webpage_url: t.permalink_url,
});

// SoundCloud Go+ songs only stream a 30-second preview without a subscription
const isPreview = (t: ScTrack): boolean => t.policy === 'SNIP' || ((t.media && t.media.transcodings) || []).some((x) => x.snipped);

// Major-label songs are often streamed only encrypted (DRM): they can't play anywhere outside SoundCloud's own
// player, so search leaves them out instead of offering a song that fails with "could not extract audio stream".
const isPlayable = (t: ScTrack): boolean => !isPreview(t) && scCandidates((t.media && t.media.transcodings) || []).length > 0;

async function soundcloudSearch(query: string, limit: number): Promise<Entry[]> {
  // ask for more than needed: a good share of the results can be previews or DRM-only
  const r = await scApi<{ collection?: ScTrack[] }>(`/search/tracks?q=${encodeURIComponent(query)}&limit=${Math.min(50, limit * 3)}`);
  return (r.collection || []).filter((t) => t.kind === 'track' && isPlayable(t)).slice(0, limit).map((t) => ({ ...scEntry(t), playable: true }));
}

// The api only resolves canonical https://soundcloud.com/... links. The app's Share button gives
// on.soundcloud.com short links (and the mobile site m.soundcloud.com ones): those answered "SoundCloud 404".
async function scCanonicalUrl(pageUrl: string): Promise<string> {
  let u: URL;
  try { u = new URL(String(pageUrl).trim()); } catch (_) { return String(pageUrl); }
  if (u.hostname === 'on.soundcloud.com') {
    const r = await globalThis.__urielFetch(u.href, { headers: { 'User-Agent': DESKTOP_UA } });
    let target = r.url && !/^https?:\/\/on\.soundcloud\.com/.test(r.url) ? r.url : '';
    if (!target) {
      const html = await r.text().catch(() => '');
      target = (html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) || html.match(/property="og:url"[^>]+content="([^"]+)"/) || [])[1] || '';
    }
    if (!target) throw new Error('SoundCloud short link could not be opened');
    u = new URL(target);
  }
  if (/(^|\.)soundcloud\.com$/.test(u.hostname)) u.hostname = 'soundcloud.com';
  // share links carry tracking parameters (si, utm_*, ref…); a secret link keeps its token in the path
  return `https://soundcloud.com${u.pathname.replace(/\/+$/, '')}`;
}

// Which of a track's transcodings Uriel can play, best first. Many tracks no longer have a progressive MP3,
// only HLS: plain HLS (MP3 segments, or AAC in fragmented MP4) is downloaded segment by segment and joined;
// encrypted HLS (ctr-/cbc-encrypted-hls) needs DRM and can't be played outside SoundCloud's own player.
function scCandidates(list: ScTranscoding[]): ScCandidate[] {
  const mime = (x: ScTranscoding) => String((x.format && x.format.mime_type) || '').toLowerCase();
  const proto = (x: ScTranscoding) => String((x.format && x.format.protocol) || '');
  const kind = (x: ScTranscoding): Omit<ScCandidate, 'tc'> | null => {
    if (proto(x) === 'progressive') return { rank: 0, ext: 'mp3' };
    if (proto(x) !== 'hls') return null; // encrypted or unknown
    // audio/mpegurl is an adaptive master playlist, not MP3 segments (and its stream url answers 404)
    if (/audio\/mpeg(?!url)/.test(mime(x))) return { rank: 1, kind: 'hls', container: 'mp3', ext: 'mp3' };
    if (/audio\/mp4|mp4a|aac/.test(mime(x))) return { rank: 2, kind: 'hls', container: 'fmp4', ext: 'm4a' };
    return null; // e.g. Opus in Ogg segments
  };
  return list
    .filter((x) => x && x.url && !x.snipped)
    .map((x): ScCandidate | null => { const k = kind(x); return k && { tc: x, ...k }; })
    .filter((c): c is ScCandidate => !!c)
    .sort((a, b) => a.rank - b.rank);
}

async function soundcloudAudio(pageUrl: string): Promise<ResolvedAudio> {
  const t = await scApi<ScTrack>(`/resolve?url=${encodeURIComponent(await scCanonicalUrl(pageUrl))}`);
  if (isPreview(t)) throw new Error('SoundCloud only has a 30-second preview of this song');
  const list = (t.media && t.media.transcodings) || [];
  if (!list.length) throw new Error('no SoundCloud stream');
  const candidates = scCandidates(list);
  if (!candidates.length) throw new Error('SoundCloud only offers this song encrypted (DRM), it can\'t be played here');
  const auth = t.track_authorization ? `?track_authorization=${t.track_authorization}` : '';
  const info = { artist: t.user && t.user.username, title: t.title, duration: Math.round((t.duration || 0) / 1000) };
  let lastErr: unknown = null;
  for (const c of candidates) {
    try {
      const { url } = await scApi<{ url?: string }>((c.tc.url || '').replace('https://api-v2.soundcloud.com', '') + auth);
      if (!url) throw new Error('no SoundCloud stream URL');
      const headers = { 'User-Agent': DESKTOP_UA };
      return c.kind === 'hls' ? { kind: 'hls', container: c.container, url, headers, ext: c.ext, ...info } : { url, headers, ext: c.ext, ...info };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no SoundCloud stream');
}

// Resolve anything yt-dlp would accept as a target: a URL, ytsearch1:, scsearch1:.
async function resolveAudio(target: unknown): Promise<ResolvedAudio> {
  const s = String(target);
  let m = s.match(/^(yt|sc)search\d*:(.*)$/);
  if (m) {
    const hit = (m[1] === 'sc' ? await soundcloudSearch(m[2], 1) : await youtubeSearch(m[2], 1))[0];
    if (!hit) throw new Error('no search results');
    return resolveAudio(hit.webpage_url);
  }
  if (/soundcloud\.com/.test(s)) return soundcloudAudio(s);
  const id = ytId(s);
  if (id) return youtubeAudio(id);
  throw new Error(`unsupported target ${s}`);
}

// ---- playlists (link import): yt-dlp-style { title, entries } ----
async function youtubePlaylist(listId: string, limit: number): Promise<{ title: string; entries: Entry[] }> {
  const y = await yt();
  let page = await y.getPlaylist(listId) as unknown as YtPlaylistPage;
  const title = text(page.info && page.info.title) || 'Playlist';
  const entries: Entry[] = [];
  const parseDur = (s: string | undefined) => String(s || '').split(':').map(Number).reduce((acc, n) => acc * 60 + (n || 0), 0);
  const take = (p: YtPlaylistPage) => (p.videos || p.items || []).forEach((v) => {
    if (entries.length >= limit) return;
    if (v.type === 'LockupView') {
      // newer playlist layout: id in content_id, title/channel in metadata, duration as a thumbnail badge
      if (v.content_type && v.content_type !== 'VIDEO') return;
      const md = v.metadata || {};
      const rows = (md.metadata && md.metadata.metadata_rows) || [];
      const channel = rows[0] && rows[0].metadata_parts && rows[0].metadata_parts[0] ? text(rows[0].metadata_parts[0].text) : '';
      const badge = ((v.content_image && v.content_image.overlays) || []).flatMap((o) => o.badges || [])[0];
      if (!v.content_id) return;
      entries.push({
        id: v.content_id, title: text(md.title), uploader: channel, channel,
        duration: parseDur(badge && badge.text), thumbnails: thumbs(v.content_image && v.content_image.image), webpage_url: `https://www.youtube.com/watch?v=${v.content_id}`,
      });
      return;
    }
    if (!v.id) return;
    entries.push({
      id: v.id, title: text(v.title), uploader: text(v.author && v.author.name), channel: text(v.author && v.author.name),
      duration: (v.duration && v.duration.seconds) || 0, thumbnails: thumbs(v.thumbnails), webpage_url: `https://www.youtube.com/watch?v=${v.id}`,
    });
  });
  take(page);
  while (entries.length < limit && page.has_continuation) {
    page = await page.getContinuation();
    take(page);
  }
  return { title, entries };
}

async function soundcloudPlaylist(pageUrl: string, limit: number): Promise<{ title: string; entries: Entry[] }> {
  const set = await scApi<ScTrack>(`/resolve?url=${encodeURIComponent(await scCanonicalUrl(pageUrl))}`);
  if (set.kind === 'track') return { title: set.title || '', entries: [scEntry(set)] };
  const tracks = (set.tracks || []).slice(0, limit);
  // long sets only carry full data for the first few tracks; fetch the rest by id
  const missing = tracks.filter((t) => !t.title).map((t) => t.id);
  const full = new Map(tracks.filter((t) => t.title).map((t) => [t.id, t]));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = await scApi<ScTrack[]>(`/tracks?ids=${missing.slice(i, i + 50).join(',')}`).catch((): ScTrack[] => []);
    (batch || []).forEach((t) => full.set(t.id, t));
  }
  return { title: set.title || 'SoundCloud playlist', entries: tracks.map((t) => full.get(t.id)).filter((t): t is ScTrack => !!t).map(scEntry) };
}

async function playlist(pageUrl: unknown, limit = 500): Promise<{ title: string; entries: Entry[] }> {
  const s = String(pageUrl);
  if (/soundcloud\.com/.test(s)) return soundcloudPlaylist(s, limit);
  const list = (s.match(/[?&]list=([\w-]+)/) || [])[1];
  if (list) return youtubePlaylist(list, limit);
  const id = ytId(s);
  if (id) {
    const a = await youtubeAudio(id);
    return { title: a.title || '', entries: [{ id, title: a.title || '', uploader: a.artist, duration: a.duration || 0, thumbnails: [], webpage_url: `https://www.youtube.com/watch?v=${id}` }] };
  }
  throw new Error(`unsupported link ${s}`);
}

export = { youtubeSearch, ytMusicSearch, soundcloudSearch, resolveAudio, playlist, scCandidates, scCanonicalUrl, isPlayable };
