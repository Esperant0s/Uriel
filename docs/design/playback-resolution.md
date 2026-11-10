# Playback resolution: one stream resolver for every platform

**Status:** Implemented in `stream-resolver.js` (desktop and phones), follows ADR-0001 action item 2
**Date:** 2026-11-03

How Uriel turns "play this song" into an audio URL, today two separate pipelines (desktop `server.js`, phones
`mobile/extract.ts`), as one resolver with shared health rules.

## 1. Requirements

### Functional
- Given a song (platform, id or URL, title, artist, duration), return something playable: a local file, a cached
  file, or a stream URL with the headers it needs.
- Try, in a sensible order: the offline cache; the fast YouTube lookup (one innertube request); yt-dlp
  (desktop, optionally with the user's YouTube sign-in); other uploads of the same song; SoundCloud.
- Never return a preview, a remix or a clip of the wrong length (the current matching rules stay).
- Prepare the next song in the background, without competing with the song being started.

### Non-functional
| Goal | Target | Measured today (desktop, 2026-11-03) |
|---|---|---|
| Start a cached or local song | < 100 ms | 2-3 ms |
| Start a song YouTube serves normally | < 2 s | lookup 0.7 s + first audio 0.3-0.5 s |
| Start a song only SoundCloud has | < 5 s | 2.1 s once a block is known, 7.4 s for the first song after it |
| Give up when nothing works | < 5 s | 0.3 s once a block is known (27-30 s before the resolver) |
| Requests to YouTube per start | ≤ 3 when blocked, ≤ 2 normally | up to 8 before the bot pause |
| Same behaviour on phones | yes | yes: same resolver, the phone strategy list |

### Constraints
- One maintainer; JavaScript only; must run in Node (desktop server) and in a WebView through shims (phones).
- No server of Uriel's own: everything runs on the user's device, from the user's IP address.
- YouTube changes its clients and its bot checks without notice; the resolver must degrade, not break.

## 2. High-level design

```
              play(song) / prefetch(song)
                         │
                ┌────────▼─────────┐
                │  StreamResolver   │  one per process (server.js on desktop, the WebView on phones)
                │  ─ in-flight map  │  same song asked twice → one lookup
                │  ─ result cache   │  URL + expiry (googlevideo links expire ~6 h)
                └────────┬─────────┘
                         │ strategies in order, each: canHandle(song, health) → attempt(song, budget)
   ┌──────────┬──────────┼──────────────┬────────────────┬──────────────┐
   ▼          ▼          ▼              ▼                ▼              ▼
 local/    fastLookup  ytDlp          otherUploads     soundcloud     (later: more)
 offline   (innertube) (desktop only;  (search, then    (search,
 cache                  cookies if     fastLookup /     length check)
                        signed in)     ytDlp each)
                         │
                ┌────────▼─────────┐
                │   HealthBoard     │  per source: ok | blocked(until) | failing(count)
                │                   │  shared by every strategy and by prefetch
                └───────────────────┘
```

**API**

```js
const resolver = createResolver({ strategies, health, clock, log });
await resolver.resolve(song, { reason: 'play' | 'prefetch', deadlineMs: 5000, signal });
// -> { url, headers, isLocal, source: 'cache'|'fast'|'yt-dlp'|'other-upload'|'soundcloud', tried: [...] }
// or throws ResolveError { code: 'unavailable' | 'blocked' | 'aborted', tried: [...] }
```

Each strategy is a small object, so desktop and phones differ only in the list they pass:

```js
{ name: 'ytDlp', source: 'youtube', platforms: ['desktop'],
  canHandle: (song, health) => song.platform === 'youtube' && !health.blocked('youtube-ytdlp'),
  attempt: async (song, { budgetMs, signal }) => ({ url, headers }) /* or throw */ }
```

## 3. Deep dive

### Health board (the part that fixes "slow, then fails")
- `blocked(source, until)`: set when a strategy sees a definite refusal ("Sign in to confirm you're not a bot",
  HTTP 429). Two YouTube sources, because they fail separately: `youtube-fast` (innertube) and
  `youtube-ytdlp`. Blocked sources are skipped by `canHandle`, so a blocked song goes straight to SoundCloud.
- `failing(source)`: consecutive soft failures (timeouts, 5xx); after 3, the source waits 1, 2, 4… minutes
  (capped at 10) before it's tried again: exponential backoff instead of hammering.
- Reset: a success clears a source; signing in to YouTube clears `youtube-ytdlp`; a network change
  (`online` event on phones, `powerMonitor` resume on desktop) clears everything.
- Prefetch reads the board but never writes `blocked` on its own (a background lookup shouldn't take YouTube
  away from the song the user taps next), and it doesn't run at all while a YouTube source is blocked.

### Time budget
- `resolve()` has one deadline (5 s for play, 15 s for prefetch). Each attempt gets
  `min(strategy.maxMs, timeLeft)`; when time is up the resolver stops and reports what it tried.
- Typical costs, for ordering: cache 0 s, fast lookup 0.7 s, yt-dlp 2-2.5 s, SoundCloud search + resolve
  3-4 s, other uploads 0.7 s each (fast) or 2 s each (yt-dlp). So: cache → fast → yt-dlp → other uploads (fast
  only, at most 2) → SoundCloud, with SoundCloud started early when YouTube is already known to be blocked.

### Caching and dedup
- In-flight map keyed by canonical song id: a prefetch and a tap for the same song share one lookup (exists
  today as `downloadInFlight` / `streamUrlCache`).
- Result cache: URL + `expire` from the googlevideo query string, minus a 5-minute margin; dropped on a 403.
- The offline audio cache stays the first strategy; it's what makes repeat plays instant.

### Errors
- One error shape (`ResolveError`) with the list of attempts; the page shows one message per code:
  `blocked` → "YouTube is asking to confirm you're not a bot. Turn on Play with my YouTube sign-in"
  (desktop) or "Try again later" (phones); `unavailable` → "Couldn't play this song".
- Every attempt is logged once with source, duration and outcome: the debug log answers "why was this slow".

## 4. Scale and reliability
- Load is one user: the risk isn't volume but **being blocked**. The resolver's job is to keep requests to
  YouTube low (dedup, backoff, no prefetch while blocked) and to make the block cheap when it happens.
- Failover order is the strategy list; SoundCloud is the only non-YouTube source today.
- Monitoring: the attempt log plus a counter per source in Settings → About → Copy diagnostics
  ("youtube-fast: 41 ok, 3 blocked; yt-dlp: 2 ok, 6 blocked; soundcloud: 4 ok").

## 5. Trade-offs
| Decision | Gain | Cost |
|---|---|---|
| Strategy list instead of hard-coded steps | phones and desktop share rules; new sources are one object | one more layer to read |
| Separate health per YouTube route | the fast lookup can still work while yt-dlp is blocked (it did, this morning) | two flags to reason about |
| Skip blocked sources for 10 min | fails in ~2 s instead of ~30 s; fewer requests that keep the block alive | a song that YouTube would have served again sooner waits up to 10 min (signing in clears it) |
| Prefetch never sets `blocked` | background work can't take YouTube away from the next tap | a block is noticed one tap later |
| Keep yt-dlp (desktop) | handles ciphered formats and many sites | a 40 MB binary, ~2 s per run |

## 6. What to revisit as it grows
- A second non-YouTube source (Bandcamp, Internet Archive) would make blocks matter less than any tuning.
- Proof-of-origin tokens for the innertube clients, if YouTube starts requiring them for the fast lookup.
- Sharing the health board between devices through sync ("YouTube blocked this network an hour ago").

## Migration
1. Extract `HealthBoard` from the ad-hoc flags already in `server.js` (`ytBotBlockedUntil`) and `yt-fast.js`
   (`botUntil`); unit-test it with a fake clock.
2. Wrap today's steps in `handleStreamInfo` as strategies without changing their order; behaviour tests with
   fake strategies (no network).
3. Point `prefetchTrack` and the download path at the resolver.
4. Give `mobile/extract.ts` the same resolver with the phone strategy list (fast lookup → SoundCloud).
