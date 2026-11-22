// What the shared and desktop scripts hand each other through `window`: in the page they are plain scripts, not
// modules (mobile/types.d.ts has the phone layer's own). For the JavaScript type-check (tsconfig.js.json) only.
// The big ones stay loose until the file that makes them moves to TypeScript.
export {};

declare global {
  // the download progress server.js reports for a song being saved (shared/app.js listens)
  interface WindowEventMap {
    'uriel:dl-progress': CustomEvent<{ id: string; done: number; total: number }>;
  }
  interface Window {
    // app.js
    UrielCore: any;
    showSettingsCategory?: (cat: string) => void;
    UrielSettingsBack?: () => boolean;
    // desktop/preload.js on computers, mobile/electron-api.ts on phones
    electronAPI: any;
    // the phone app
    Capacitor?: { getPlatform(): string; isNativePlatform?(): boolean; Plugins?: any };
    UrielAppUpdater?: any;
    UrielAppIcon?: any;
    // the parts app.js is split into (shared/app/), each a function app.js calls once as it starts
    UrielApp?: any;
    // set by app.js for the other scripts and the inline handlers in index.html
    LiquidMotion?: any;
    t?: (key: string, ...args: any[]) => string;
    applyI18n?: (lang: string) => void;
    audioEngine?: any;
    bindHorizontalWheel?: (el: HTMLElement) => void;
    createWavyProgress?: any;
    openAlbum?: any;
    openTrackArtModal?: any;
    openTvKaraoke?: () => void;
    closeTvKaraoke?: () => void;
    playSmooth?: any;
    pauseSmooth?: any;
    setSiteTheme?: any;
    toggleMiniWindow?: () => void;
    toggleRepeat?: () => void;
    toggleShuffle?: () => void;
    updateFade?: any;
    updateRowFade?: any;
    urielArtNext?: (img: HTMLImageElement) => void;
    // the phone layer (mobile/bridge.ts, mobile/device-music.ts)
    UrielAudioElement?: (real: HTMLAudioElement) => any;
    UrielDeviceMusic?: any;
    UrielLog?: any;
    // shared/app/boot.js
    __riffFetchPatched?: boolean;
    __riffLogError?: (level: string, message: string, stack?: string | null) => void;

    // shared/*.js, each under its own name
    UrielSync?: any;
    UrielSyncCore?: any;
    UrielEncore?: any;
    UrielProfiles?: UrielProfilesApi;
    UrielLibraryStore?: any;
    UrielI18n?: any;
    UrielLyricsMatch?: any;
    UrielLyricsSources?: any;
    UrielUpdates?: any;
    UrielUpdateCore?: any;
    UrielTrim?: any;
    UrielTrackAudio?: any;
    UrielPlaybackRecovery?: any;
    UrielNowPlaying?: any;
    UrielLastfm?: any;
    UrielDownloadBatch?: any;
    UrielBackup?: any;
    UrielShare?: any;
    UrielImportCore?: any;
    UrielAudioEngine?: any;
    UrielLibrary?: any;
    RiffShapes?: any;
    trackMatch?: any;
    URIEL_BUILD?: { sha?: string; [key: string]: unknown };

    // libraries loaded when first needed (shared/assets)
    Peer?: any;
    Hls?: any;
    monaco?: any;
    qrcode?: any;
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }

  // what app.js keeps on its own elements between calls
  interface Element {
    _wheelBound?: boolean;
    _isDraggingReorder?: boolean;
    _lastStartIndex?: number;
    _lastEndIndex?: number;
    _closeTimer?: ReturnType<typeof setTimeout> | null;
    _glideRaf?: number;
    _glideTo?: number;
    _hasInitialRendered?: boolean;
    _rowMeasuredFor?: number;
    _ticking?: boolean;
    _vScrollHandler?: ((e: Event) => void) | null;
    __artRemember?: unknown;
    _pendingMedia?: unknown;
    _lyricDist?: number;
    _fadeBound?: boolean;
    _renderedQueue?: unknown[] | null;
    _renderedLen?: number;
    _rowHeight?: number;
    _morphAnim?: Animation | null;
    _m3cHoverBound?: boolean;
    _focusedIndex?: number;
    _targetIndex?: number;
    _hasToggleListener?: boolean;
    __artTrack?: unknown;
    __artTried?: unknown;
  }

  // A song as the app keeps it (queue, favorites, history, playlists). Services add their own fields, so the rest
  // stay loose; mobile/types.d.ts has the phone layer's view of the same thing.
  interface UrielTrack {
    id: string;
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    thumbnail?: string;
    platform?: string;
    url?: string;
    isLocal?: boolean;
    addedAt?: number;
    playedAt?: number;
    [field: string]: any;
  }
  interface UrielPlaylist {
    id: string;
    name: string;
    tracks: UrielTrack[];
    cover?: string;
    description?: string;
    [field: string]: any;
  }
  // Tm('...', ...): words translated when shown, so a toast or label follows the language
  interface UrielI18nMessage {
    i18n: string;
    args: unknown[];
    toString(): string;
  }
  type UrielText = string | UrielI18nMessage;
  // an album, single, EP or Daily Mix card from a search, an artist page or home
  interface UrielAlbum {
    id: string;
    title?: string;
    artist?: string;
    cover?: string;
    year?: string | number;
    type?: string;
    trackCount?: number;
    gridCovers?: string[];
    tracks?: UrielTrack[];
    source?: string;
    [field: string]: any;
  }
  interface UrielArtist {
    id?: string;
    name: string;
    subtitle?: string;
    avatar?: string;
    banner?: string;
    fans?: number;
    fansText?: string;
    [field: string]: any;
  }
  // a row of the song menu and the other small menus (showActionMenu)
  interface UrielMenuItem {
    label: string;
    run: () => void;
    danger?: boolean;
    [field: string]: unknown;
  }
  // /api/for-you: the For you rows on Home
  interface UrielHomeSection {
    type?: string;
    title: string;
    items?: UrielArtist[];
    tracks?: UrielTrack[];
  }
  interface UrielForYou {
    success?: boolean;
    genres?: string[];
    sections?: UrielHomeSection[];
  }
  // a playlist, album or selection being downloaded, or waiting for its turn
  interface UrielDownloadJob {
    name: string;
    tracks: UrielTrack[];
    resolve?: ((t: UrielTrack) => Promise<UrielTrack | null>) | null;
    onProgress?: (done: number, total: number) => void;
    onDone?: (done: number, total: number) => void;
    checking?: boolean;
    retry?: boolean;
    [field: string]: unknown;
  }
  interface UrielDownloadProgress {
    text?: string;
    fraction?: number | null;
    error?: boolean;
    note?: boolean;
  }
  // what the first-run window (desktop/welcome) picked
  interface UrielWelcomeResult {
    theme?: { preset?: string; h?: string; b?: number };
    toggles?: Record<string, boolean>;
    background?: string;
    spotify?: { url?: string };
  }
  // a song in the offline audio cache (/api/offline-list)
  interface UrielOfflineEntry {
    id?: string;
    cleanId?: string;
    title?: string;
    artist?: string;
    duration?: number;
    thumbnail?: string;
    localThumbnail?: string;
    lastPlayed?: number;
  }
  // a lyric line; words come with their times when the source has them
  interface UrielLyricLine {
    time: number;
    text: string;
    words?: unknown[];
    _timed?: UrielTimedWord[] | null;
    _timedFor?: unknown[];
  }
  interface UrielTimedWord {
    text: string;
    start: number;
    end: number;
  }
  // what each part of app.js (shared/app/) hands back to it
  interface UrielPluginsPart {
    emitPluginEvent(event: string, data?: unknown): void;
    reloadPluginsList(): Promise<void>;
    clearCssEditor(): void;
    stopAllPlugins(): void;
    renderPluginCards(): void;
    loadPlugins(): Promise<void>;
  }
  interface UrielImportsPart {
    refreshYtSignin(): Promise<void>;
    matchSpotifyTracks(list: UrielTrack[], onProgress: (done: number, total: number) => void): Promise<UrielTrack[] & { failStats?: unknown }>;
  }
  interface UrielRadioPart {
    songRadioEnabled(): boolean;
    startSongRadio(seeds: UrielTrack[]): Promise<void>;
  }
  interface UrielLyricsPart {
    miniLyricsShown(): boolean;
    updateMiniLyricsHighlight(currentTime: number): void;
    renderMiniLyrics(): void;
    lyricsSourcePref(): string;
    fetchAndUpgradeWords(title: string, artist: string, token: number): Promise<void>;
    lyricWordSpans(line: UrielLyricLine): string;
    lineTimedWords(line: UrielLyricLine): UrielTimedWord[] | null;
    timedWordIndex(timed: UrielTimedWord[], t: number): number;
    setTvkAmbient(on: boolean): void;
    syncTvkAmbientPlayback(): void;
    syncTvkProgress(cur: number, dur: number): void;
  }
  interface UrielHomePart {
    isSpotifyHome(): boolean;
    renderFollowedArtists(): void;
    renderMadeForYou(): void;
    readDailyMixes(): { day: string; mixes: UrielAlbum[] } | null;
    artistPlays(name: string): number;
    followedArtistCard(a: UrielArtist): HTMLElement;
    fetchFollowedMeta(list: UrielArtist[]): Promise<void>;
    renderSpotifyHome(): void;
    applyHomeLayout(): void;
  }
  // the bits of hls.js the player uses (it comes from the CDN, untyped)
  interface UrielHls {
    on(event: string, fn: (evt: string, info: { fatal?: boolean; type?: string; details?: string }) => void): void;
    loadSource(url: string): void;
    attachMedia(media: HTMLMediaElement): void;
    recoverMediaError(): void;
    destroy(): void;
    _urielRecovered?: boolean;
  }
  // /api/stream's answer: where to play a song from
  interface UrielStreamInfo {
    success?: boolean;
    streamUrl: string;
    proxyUrl?: string;
    isHls?: boolean;
    isLocal?: boolean;
    [field: string]: unknown;
  }
  interface UrielPreset {
    id: string;
    name: string;
    settings: Record<string, any>;
    [field: string]: any;
  }
  // app.js's state: the fields most of the app reads are typed, the rest stay loose
  interface UrielAppState {
    platform: string;
    currentView: string;
    previousView: string;
    currentPlaylistId: string | null;
    queue: UrielTrack[];
    queueIndex: number;
    unshuffledQueue: UrielTrack[] | null;
    currentTrack: UrielTrack | null;
    isPlaying: boolean;
    isMuted: boolean;
    volume: number;
    repeatMode: string;
    isRepeat: boolean;
    isShuffle: boolean;
    favorites: UrielTrack[];
    history: UrielTrack[];
    playlists: UrielPlaylist[];
    localTracks: UrielTrack[];
    loadToken: number;
    serverPort: number;
    [field: string]: any;
  }

  // a profile and window.UrielProfiles (profiles-core.js)
  interface UrielProfile { id: string; name: string; color: string; emoji: string; created: number; [field: string]: any }
  interface UrielProfilesApi {
    id: string;
    current(): UrielProfile;
    list(): UrielProfile[];
    create(opts: { name?: unknown; color?: unknown; emoji?: unknown }): UrielProfile;
    update(id: string, patch: { name?: unknown; color?: unknown; emoji?: unknown }): any;
    remove(id: string): boolean;
    open(id: string): any;
    peek(id: string, key: string): string | null;
    isDevice(key: string): boolean;
    COLORS: string[];
  }

  // what app.js hands each of its parts (shared/app/*.js): the common ones typed, the rest as app.js has them
  interface UrielAppDeps {
    isPhoneApp: boolean;
    state: UrielAppState;
    el: any;
    Tm: (key: string, ...args: any[]) => string;
    showToast: (message: string, kind?: string) => void;
    escapeHtml: (value: unknown) => string;
    [name: string]: any;
  }

  // newer than the DOM types here, or only in some browsers
  interface HTMLMediaElement {
    webkitPreservesPitch?: boolean;
    mozPreservesPitch?: boolean;
  }
  interface CSSStyleDeclaration {
    objectViewBox: string;
  }
  // Chromium only, both checked before use
  interface Navigator {
    getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener(type: string, fn: () => void): void }>;
    connection?: { saveData?: boolean; type?: string; effectiveType?: string };
  }

  // helpers the page loads as plain scripts before app.js (each also exports itself for the tests)
  const normalizeSearch: typeof import('./search-text').normalizeSearch;
  const isRtlText: typeof import('./lyrics-rtl').isRtlText;
  const dedupeTracks: typeof import('./library-tools').dedupeTracks;
  const TRACK_SORT_MODES: typeof import('./track-sort').TRACK_SORT_MODES;
  const sortTracks: typeof import('./track-sort').sortTracks;
  const backfillAddedAt: typeof import('./track-sort').backfillAddedAt;
  const librarySortMode: typeof import('./track-sort').librarySortMode;
  const sortLibrary: typeof import('./track-sort').sortLibrary;
  const isSameSong: typeof import('./track-sort').isSameSong;
  const dedupeFavoriteTracks: typeof import('./track-sort').dedupeFavoriteTracks;
  const favoriteIndex: typeof import('./track-sort').favoriteIndex;
  // hls.js, loaded with the first HLS stream
  const Hls: any;
}
