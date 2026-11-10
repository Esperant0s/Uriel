# ADR-0001: Evolving Uriel's architecture

**Status:** Proposed
**Date:** 2026-11-03
**Deciders:** Esperant0s (maintainer)

## Context

Uriel is a music player for Windows, macOS, Linux (Electron), Android and iPhone (Capacitor). One web front end
runs everywhere; a local HTTP server does the work the page can't (finding streams, downloading, files, lyrics).

| Part | Today | Size |
|---|---|---|
| Front end | `app.js`, one `DOMContentLoaded` closure | 21,149 lines, 598 listeners, 338 direct `localStorage` calls |
| Styles | `styles.css` + `mobile/mobile.css` | 9,079 + 602 lines |
| Local server | `server.js`, one request handler with an `if` per route | 7,134 lines, 54 routes |
| Phones | the same `server.js`, run in the WebView through Node shims (`mobile/shims/*`) | 16 shims |
| Library data | `localStorage` (playlists, favorites, history, queue, Encore), per profile | browser cap ≈ 5 MB |
| Streams | desktop: yt-fast (one innertube request) → yt-dlp → other uploads → SoundCloud; phones: `mobile/extract.ts` | two pipelines |
| Sync | PeerJS (public broker `0.peerjs.com`, STUN only) | |
| Releases | GitHub Actions: rolling `*-latest` builds per push, versioned releases per tag; unsigned | |
| Tests | `node --test`, 343 tests | many assert on source text, few on behaviour |

What has gone wrong in practice, all in the last weeks:

- **Ordering bugs in the one big closure.** Code that runs early (playTrack at start-up) reaching a `const`
  declared 6,000 lines later; fixes had to move declarations around by hand.
- **Changes in one place breaking unrelated tests**, because tests count occurrences of strings in `server.js`
  and `app.js` (e.g. "exactly 2 calls of `fastYouTubeStream`").
- **Storage pressure.** `localStorage` filled up for long histories; `app.js` now patches
  `Storage.prototype.setItem` to free space and retry. Every playlist edit re-serialises all playlists.
- **Streams are the weakest link.** YouTube's "confirm you're not a bot" blocked both the yt-dlp route and the
  fast lookup; each pipeline grew its own retry rules (and the phone one has none of the desktop's).
- **Performance problems hidden in global CSS**: a single rule gave every button its own GPU layer.
- **Two sessions editing the same 20k-line file** at once, with work landing in each other's commits.

## Decision

Keep the stack (Electron + Capacitor + one web front end + the shared local server) and evolve it in place
(Option B): pull pieces out of `app.js` and `server.js` into small modules behind clear interfaces, one at a
time, with behaviour tests, starting where it hurts most: storage and stream resolution.

## Options Considered

### Option A: Keep everything as it is

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low now, rising with every feature |
| Cost | None now; each change keeps getting slower and riskier |
| Scalability | Library size capped by `localStorage`; one file for every feature |
| Team familiarity | High (it's what exists) |

**Pros:** no migration work; nothing to relearn.
**Cons:** the problems above keep recurring; the storage cap is a hard limit for big libraries; parallel work
on the same files keeps colliding.

### Option B: Evolve in place: modules, a storage layer, one stream resolver (recommended)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium, spread over many small steps |
| Cost | A few days per area; each step ships on its own |
| Scalability | Removes the storage cap; features stop sharing one scope |
| Team familiarity | High: same languages, same build, the pattern already exists (`library-pages.js`, `track-sort.js`, `update-core.js` are pure modules with real tests) |

**Pros:** every step is small and reversible; the app keeps shipping; the existing module pattern and esbuild
(already used for phones) carry it.
**Cons:** `app.js` stays large for a while; needs discipline to keep new code out of it.

### Option C: Rewrite the front end in a framework (React, Vue, Svelte)

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | Weeks to months before parity; two apps in parallel meanwhile |
| Scalability | Good once done |
| Team familiarity | Lower; the code's knowledge lives in the current file's comments |

**Pros:** components and state management from the start.
**Cons:** stops feature work; a rewrite loses the many small fixes baked into today's code (the comments in
`app.js` record dozens of them); high risk for a one-maintainer fork.

## Trade-off Analysis

The pain comes from **shared scope and shared storage**, not from the choice of web technologies. B removes
both a piece at a time, and every piece is testable as it leaves (the modules that already left have the best
tests in the repo). C would fix the same things at many times the cost and risk. A is only free short-term.

## Consequences

- **Easier:** testing behaviour instead of source text; two people (or sessions) working on different features
  without touching the same file; big libraries; one place to fix stream problems for every platform.
- **Harder:** a module boundary has to be designed for each extracted piece; the bundling step that phones use
  becomes part of the desktop build too.
- **To revisit:** whether `server.js` should stay one process for the phone shims once routes are modules;
  code signing for Windows and macOS (unsigned builds warn on every install and every update).

## Action Items

1. [x] **Storage layer** (`library-store.js`): playlists, favorites and history in IndexedDB on every
   platform, moved from `localStorage` on first start; small settings stay in `localStorage`. Done under the raw
   store profiles-core.js already routes every key through, so the rest of the app still calls `localStorage`
   (read into memory at start-up, written back in the background). Removes the 5 MB cap. Still to do: the queue
   and Encore (read before start-up waits, and saved as the page closes), and one record per playlist instead
   of rewriting the whole list on every edit.
2. [x] **One stream resolver** (`stream-resolver.js`): an ordered list of strategies (cache, fast lookup,
   yt-dlp, other uploads, SoundCloud) with one health rule ("YouTube is blocking: skip its strategies for N
   minutes") shared by desktop and phones. See the system design in `docs/design/playback-resolution.md`.
3. [ ] **Route table for `server.js`**: `routes/stream.js`, `routes/library.js`, `routes/downloads.js`,
   `routes/lyrics.js`, `routes/imports.js`, registered in one table; the shims keep working unchanged.
4. [ ] **Extract `app.js` by feature**, leaf features first (settings sections, imports, Encore, karaoke), each
   as a module with an `init(core)` entry point and its own tests. New features go in modules from now on.
5. [ ] **Replace source-text tests** with behaviour tests as each area moves; add one end-to-end smoke test that
   starts the desktop app, opens every page and checks for page errors (scripts for this exist from the
   performance work).
6. [ ] **Sync reachability**: document that devices behind strict NATs can't link (no TURN relay since
   PeerJS's shut down), or add a self-hosted TURN option in Settings → Sync.
7. [ ] **Code signing** for Windows and macOS when there's budget for certificates.
