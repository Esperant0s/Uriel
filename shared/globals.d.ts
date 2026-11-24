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
    // what app.js hands the other scripts at its end (the phone layer has its own view of it in mobile/types.d.ts)
    UrielCore: {
      state: UrielAppState;
      audio: HTMLAudioElement;
      thumb(t: UrielTrack): string;
      playTrack(track: UrielTrack, list?: UrielTrack[] | null, index?: number): unknown;
      toast(message: UrielText, kind?: string): void;
      reloadFromStorage(keys: string[]): void;
      togglePlay(): void;
      seek(seconds: number): void;
      base(): string;
      openModal(m: HTMLElement | null): void;
      closeModal(m: HTMLElement | null): void;
      importPlaylist(name: string, tracks: UrielTrack[], o?: { cover?: string; description?: string }): UrielPlaylist | null | undefined;
      matchTracks(list: Partial<UrielImportSong>[], onProgress?: (done: number, total: number) => void): Promise<UrielTrack[] & { failStats?: unknown }>;
      [key: string]: unknown;
    };
    showSettingsCategory?: (cat: string) => void;
    UrielSettingsBack?: () => boolean;
    // desktop/preload.js on computers, mobile/electron-api.ts on phones
    electronAPI: UrielElectronApi;
    // the phone app
    Capacitor?: { getPlatform(): string; isNativePlatform?(): boolean; Plugins?: { App?: { addListener?(event: string, fn: (state: { isActive?: boolean }) => void): unknown } } };
    // the phone app's own updater (mobile/app-updater.ts)
    UrielAppUpdater?: {
      supported(): Promise<boolean>;
      download(update: unknown, onProgress?: (p: { received?: number; total?: number }) => void): Promise<{ ok: boolean; version?: string; error?: string }>;
      install(): Promise<{ ok: boolean; error?: string }>;
    };
    UrielAppIcon?: { set(style: string): Promise<boolean | 'custom'> };
    // the parts app.js is split into, loaded before it; their deps stay loose (each takes the few it needs)
    UrielApp: {
      plugins(deps: Record<string, unknown>, out: UrielPluginsPart): void;
      imports(deps: Record<string, unknown>, out: UrielImportsPart): void;
      radio(deps: Record<string, unknown>, out: UrielRadioPart): void;
      artist(deps: Record<string, unknown>, out: UrielArtistPart): void;
      themes(deps: Record<string, unknown>, out: UrielThemesPart): void;
      settings(deps: Record<string, unknown>, out: UrielSettingsPart): void;
      album(deps: Record<string, unknown>, out: UrielAlbumPart): void;
      search(deps: Record<string, unknown>, out: UrielSearchPart): void;
      palette(deps: Record<string, unknown>): void;
      lyricsSettings(deps: Record<string, unknown>): void;
      downloads(deps: Record<string, unknown>, out: UrielDownloadsPart): void;
      storage(deps: Record<string, unknown>, out: UrielStoragePart): void;
      tools(deps: Record<string, unknown>, out: UrielToolsPart): void;
      trackArt(deps: Record<string, unknown>, out: UrielTrackArtPart): void;
      sleepTimer(deps: Record<string, unknown>, out: UrielSleepTimerPart): void;
      trim(deps: Record<string, unknown>, out: UrielTrimPart): void;
      crossfade(deps: Record<string, unknown>, out: UrielCrossfadePart): void;
      visualizer(deps: Record<string, unknown>, out: UrielVisualizerPart): void;
      multiSelect(deps: Record<string, unknown>, out: UrielMultiSelectPart): void;
      offline(deps: Record<string, unknown>, out: UrielOfflinePart): void;
      mediaSession(deps: Record<string, unknown>, out: UrielMediaSessionPart): void;
      playButton(deps: Record<string, unknown>, out: UrielPlayButtonPart): void;
      navigation(deps: Record<string, unknown>, out: UrielNavigationPart): void;
      renameTrack(deps: Record<string, unknown>): void;
      touch(deps: Record<string, unknown>): void;
      railDrawer(deps: Record<string, unknown>): void;
      trackAudio(deps: Record<string, unknown>, out: UrielTrackAudioPart): void;
      performance(deps: Record<string, unknown>, out: UrielPerformancePart): void;
      playerBar(deps: Record<string, unknown>, out: UrielPlayerBarPart): void;
      desktop(deps: Record<string, unknown>, out: UrielDesktopPart): void;
      controls(deps: Record<string, unknown>): void;
      playback(deps: Record<string, unknown>, out: UrielPlaybackPart): void;
      theme(deps: Record<string, unknown>, out: UrielThemePart): void;
      nowPlaying(deps: Record<string, unknown>, out: UrielNowPlayingPart): void;
      effectSettings(deps: Record<string, unknown>): void;
      interfaceSettings(deps: Record<string, unknown>): void;
      bannerSettings(deps: Record<string, unknown>): void;
      soundSettings(deps: Record<string, unknown>): void;
      themeCards(deps: Record<string, unknown>, out: UrielThemeCardsPart): void;
      panelDrawer(deps: Record<string, unknown>, out: UrielPanelDrawerPart): void;
      covers(deps: Record<string, unknown>, out: UrielCoversPart): void;
      shortcuts(deps: Record<string, unknown>): void;
      albums(deps: Record<string, unknown>, out: UrielAlbumsPart): void;
      presets(deps: Record<string, unknown>, out: UrielPresetsPart): void;
      library(deps: Record<string, unknown>, out: UrielLibraryPart): void;
      trackRows(deps: Record<string, unknown>, out: UrielTrackRowsPart): void;
      blocks(deps: Record<string, unknown>, out: UrielBlocksPart): void;
      themePalette(deps: Record<string, unknown>, out: UrielThemePalettePart): void;
      lyricsView(deps: Record<string, unknown>, out: UrielLyricsViewPart): void;
      playlists(deps: Record<string, unknown>, out: UrielPlaylistsPart): void;
      reorder(deps: Record<string, unknown>): void;
      wave(deps: Record<string, unknown>, out: UrielWavePart): void;
      tvKaraoke(deps: Record<string, unknown>, out: UrielTvKaraokePart): void;
      outputDevice(deps: Record<string, unknown>): void;
      lyricsEditor(deps: Record<string, unknown>, out: UrielLyricsEditorPart): void;
      background(deps: Record<string, unknown>, out: UrielBackgroundPart): void;
      m3Cover(deps: Record<string, unknown>, out: UrielM3CoverPart): void;
      language(deps: Record<string, unknown>): void;
      lyrics(deps: Record<string, unknown>, out: UrielLyricsPart): void;
      home(deps: Record<string, unknown>, out: UrielHomePart): void;
      look(deps: Record<string, unknown>): { applyIconPack(pack: string): void };
    };
    // set by app.js for the other scripts and the inline handlers in index.html
    LiquidMotion?: {
      open(element: HTMLElement, triggerEl: HTMLElement | null, axis?: string, onDone?: () => void): void;
      close(element: HTMLElement, onDone?: () => void): void;
    };
    t?: (key: string, ...args: unknown[]) => string;
    applyI18n?: (lang: string) => void;
    audioEngine?: InstanceType<typeof import("./audio-engine")>;
    bindHorizontalWheel?: (el: HTMLElement) => void;
    createWavyProgress?: (container: HTMLElement) => { set(percent: number): void };
    openAlbum?: (album: UrielAlbum) => Promise<void>;
    openTrackArtModal?: (track: UrielTrack, triggerEl?: HTMLElement | null) => void;
    openTvKaraoke?: () => void;
    closeTvKaraoke?: () => void;
    playSmooth?: () => Promise<void>;
    pauseSmooth?: () => void;
    setSiteTheme?: (id: string, apply?: boolean) => void;
    toggleMiniWindow?: () => void;
    toggleRepeat?: () => void;
    toggleShuffle?: () => void;
    updateFade?: (el: Element | null) => void;
    updateRowFade?: (row: HTMLElement | null) => void;
    urielArtNext?: (img: HTMLImageElement) => void;
    // the phone layer (mobile/bridge.ts, mobile/device-music.ts)
    UrielAudioElement?: (real: HTMLAudioElement) => any;
    UrielDeviceMusic?: { rescan(ask?: boolean): Promise<number> };
    UrielLog?: { add(level: string, message: unknown): void; text(): string; clear(): void };
    // shared/app/boot.js
    __riffFetchPatched?: boolean;
    __riffLogError?: (level: string, message: string, stack?: string | null) => void;

    // shared/*.js, each under its own name
    // sync.js; encore.js and profiles.js use it
    UrielSync?: {
      listenDbs(): unknown[];
      status(): unknown;
      link(...args: never[]): unknown;
      join(...args: never[]): unknown;
      handleLink(...args: never[]): unknown;
      stop(): void;
    };
    UrielSyncCore?: typeof import("./sync-core");
    UrielEncore?: {
      open(period?: string): void;
      stats(period: string): unknown;
      close(): void;
      compact(keepDays?: number): unknown;
      own(): unknown;
      refresh(): void;
    };
    UrielProfiles?: UrielProfilesApi;
    UrielLibraryStore: typeof import("./library-store");
    UrielI18n: typeof import("./i18n") & UrielI18nPage;
    UrielLyricsMatch?: typeof import("./lyrics-match");
    UrielLyricsSources: typeof import("./lyrics-sources");
    UrielUpdates?: { check(): unknown };
    UrielUpdateCore?: typeof import("./update-core");
    UrielTrim: typeof import("./track-trim");
    UrielTrackAudio: typeof import("./track-audio");
    UrielPlaybackRecovery: typeof import("./playback-recovery");
    UrielNowPlaying: typeof import("./now-playing");
    UrielLastfm?: typeof import("./lastfm-core");
    UrielDownloadBatch: typeof import("./download-batch");
    UrielBackup?: typeof import("./backup-core");
    UrielShare: typeof import("./share-link");
    UrielImportCore: typeof import("./import-core");
    UrielAudioEngine: typeof import("./audio-engine");
    UrielLibrary: typeof import("./library-pages");
    // m3shapes.js: the shapes the play button morphs between
    RiffShapes: {
      K: number;
      HOLD_MS: number;
      MORPH_MS: number;
      ease(t: number): number;
      ready(): boolean;
      profile(i: number): Float32Array;
      count(): number;
      next(current?: number): number;
      rebuild?(): string;
    };
    trackMatch: typeof import("./track-match");
    URIEL_BUILD?: { sha?: string; repo?: string; channel?: string; version?: string; run?: number; builtAt?: string; [key: string]: unknown };

    // libraries loaded when first needed (shared/assets)
    Peer?: new (id: string, opts?: object) => UrielPeer;
    Hls?: any;
    monaco?: any;
    // assets/qrcode.js
    qrcode?: (typeNumber: number, level: string) => { addData(text: string): void; make(): void; createSvgTag(o: { cellSize?: number; margin?: number; scalable?: boolean }): string };
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
  // a plugin file in the plugins folder (desktop/plugins.js reads its comment header)
  interface UrielPluginInfo {
    file: string;
    name?: string;
    author?: string;
    version?: string;
    description?: string;
    enabled?: boolean;
    code?: string;
    wrongExt?: boolean;
  }
  // the parts of PeerJS (assets/peerjs.min.js) sync.js uses
  interface UrielPeerConn {
    peer: string;
    on(event: 'open' | 'close', fn: () => void): void;
    on(event: 'data', fn: (msg: unknown) => void): void;
    on(event: 'error', fn: (err: { type?: string }) => void): void;
    on(event: 'iceStateChanged', fn: (state: string) => void): void;
    send(msg: unknown): void;
    close(): void;
  }
  interface UrielPeer {
    destroyed: boolean;
    disconnected: boolean;
    on(event: 'open' | 'disconnected', fn: () => void): void;
    on(event: 'connection', fn: (conn: UrielPeerConn) => void): void;
    on(event: 'error', fn: (err: { type?: string }) => void): void;
    connect(id: string, opts?: object): UrielPeerConn;
    reconnect(): void;
    destroy(): void;
  }
  // a song read from another service (an export file, a link, a login), before it is found here
  interface UrielImportSong {
    title: string;
    artist: string;
    duration?: number;
    album?: string;
  }
  interface UrielImportPlaylist {
    name: string;
    tracks: UrielImportSong[];
    cover?: string;
    error?: string;
  }
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
  // what i18n.js adds for the page on top of its pure part (module.exports)
  interface UrielI18nPage {
    readonly lang: string;
    T(s: string): string;
    Tf(template: string, ...args: unknown[]): string;
    Tm(template: string, ...args: unknown[]): UrielI18nMessage;
    Th(template: string, ...argsHtml: unknown[]): string;
    text(el: Element | null, template: UrielText, ...args: unknown[]): void;
    setLang(wanted: unknown): Promise<boolean>;
    connect(url: string): Promise<void>;
    ready(template?: unknown, ms?: number): Promise<void>;
    known(list: unknown[]): void;
    refresh(): void;
    strings(): string[];
  }
  type UrielDirResult = { ok?: boolean; success?: boolean; error?: string; dir?: string; reset?: boolean };
  // window.electronAPI: desktop/preload.js on computers, mobile/electron-api.ts on phones. What both give is
  // required; the rest is optional and checked for first. IPC answers are typed as main.js sends them.
  interface UrielElectronApi {
    isWindows: boolean;
    isMobile?: boolean;
    serverToken?: string;
    minimizeWindow(): void;
    maximizeWindow(): void;
    closeWindow(): void;
    getServerPort(): Promise<number>;
    getGpuCompositing(): Promise<string>;
    pickMedia(): Promise<string | null>;
    importAudioFiles(opts?: { folder?: boolean }): Promise<{ id: string; file: string; ext: string; name: string }[]>;
    onWindowVisibility(cb: (visible: boolean) => void): void;
    setZoomFactor(factor: number): void;
    getCacheSize(): Promise<{ audio: number; web: number; total: number }>;
    clearCache(): Promise<unknown>;
    getDataDir(): Promise<{ dir: string; defaultDir?: string; isCustom?: boolean }>;
    pickDataDir(): Promise<string | null>;
    setDataDir(dir: string, move: boolean): Promise<UrielDirResult>;
    getDownloadDir(): Promise<{ dir: string; isCustom?: boolean }>;
    pickDownloadDir(): Promise<string | null>;
    setDownloadDir(dir: string): Promise<UrielDirResult>;
    resetDownloadDir(): Promise<UrielDirResult>;
    restartApp(): void;
    setTrayOnClose(enabled: boolean): void;
    getAppVersion(): Promise<string>;
    getHwAccel(): Promise<boolean>;
    setHwAccel(on: boolean): void;
    trimMemory(): void;
    onMediaCommand(cb: (cmd: string) => void): void;
    toggleMiniWindow(): Promise<boolean>;
    setMiniLyrics?(enabled: boolean): Promise<unknown>;
    setMediaKeys(on: boolean): void;
    mediaKeysActive(): void;
    onWelcomeResult(cb: (d: UrielWelcomeResult | null) => void): void;
    saveTextFile(payload: { defaultName?: string; content?: string; kind?: string }): Promise<{ success?: boolean; canceled?: boolean; error?: string; [field: string]: unknown }>;
    shareText?(title: string, text: string): Promise<unknown>;
    copyText?(text: string): Promise<boolean>;
    getDiagnostics?(): Promise<string>;
    openExternal?(url: string): void;
    logError?(level: string, message: string, stack?: string | null): void;
    getAudioOutputInfo?(): Promise<{ name?: string; battery?: number } | null>;
    discordPresenceUpdate?(trackInfo: unknown): void;
    discordPresenceClear?(): void;
    updates?: NonNullable<Window['UrielAppUpdater']>;
    listPlugins?(): Promise<UrielPluginInfo[]>;
    setPluginEnabled?(file: string, on: boolean): void;
    disableAllPlugins?(): void;
    removePlugin?(file: string): void;
    googleLogin?(profile: string): Promise<{ loggedIn?: boolean; [field: string]: unknown }>;
    googleImportLibrary?(opts: Record<string, unknown>): Promise<{ success?: boolean; error?: string; [field: string]: unknown }>;
    ytSigninSet?(opts: { enabled: boolean; profile: string }): Promise<{ [field: string]: unknown }>;
    getSystemColors?(): Promise<{ dark?: boolean; accent?: string }>;
    getZoomFactor?(): number;
    welcomeFinish?(detail: unknown): void;
    getLauncherInfo?(): Promise<unknown>;
    openLogsFolder?(): void;
    openPluginsFolder?(): void;
    importPlugins?(): Promise<number>;
    setAppIcon?(src: string | null): Promise<unknown>;
    googleLogout?(profile: string): Promise<{ success?: boolean; error?: string }>;
    googleAuthStatus?(profile: string): Promise<{ loggedIn?: boolean; [field: string]: unknown }>;
    ytSigninStatus?(profile: string): Promise<{ [field: string]: unknown }>;
    // custom theme files: nothing provides these yet, app.js checks for them first
    getAppCss?(): Promise<string>;
    listThemes?(): Promise<{ id: string; name: string; css: string; enabled?: boolean; author?: string; description?: string }[]>;
    importThemes?(): Promise<{ id: string; name: string; css: string; enabled?: boolean; author?: string; description?: string }[]>;
    removeTheme?(id: string): Promise<unknown>;
    setThemeEnabled?(id: string, on: boolean): void;
    disableAllThemes?(): void;
  }
  // the computer app's electronAPI: code that has made sure it is on a computer (it found one of these) uses this
  type UrielDesktopApi = UrielElectronApi & Required<Pick<UrielElectronApi, 'logError' | 'listPlugins' | 'setPluginEnabled' |
    'disableAllPlugins' | 'removePlugin' | 'openPluginsFolder' | 'importPlugins' | 'googleLogin' | 'googleLogout' |
    'googleAuthStatus' | 'googleImportLibrary' | 'ytSigninStatus' | 'ytSigninSet'>>;
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
  // a song's own pictures and banner effects (the Track art dialog), kept in uriel_track_art by song id
  interface UrielBannerFx { blur: number; opacity: number; fade: number }
  interface UrielTrackArt { cover?: string; banner?: string; bannerFx?: UrielBannerFx & { enabled?: boolean } }
  interface UrielM3CoverPart {
    m3cEnabled(): boolean;
    m3cInit(): void;
    m3cSetImage(url: string): void;
    m3cDraw(now: number): void;
    m3cStart(): void;
    applyM3Cover(): void;
  }
  interface UrielBackgroundPart {
    updateCustomBg(): void;
    onBackgroundChanged(kind: string, enabled: boolean): void;
  }
  interface UrielSyncState { active: boolean; lines: { text: string; time: number | null }[]; currentIndex: number; song?: { title: string; artist: string } }
  interface UrielLyricsEditorPart {
    syncState: UrielSyncState;
    handleSyncLineClick(idx: number): void;
  }
  interface UrielTvKaraokePart {
    openTvKaraoke(): void;
    closeTvKaraoke(): void;
    initTvk(): void;
    resetTvIdleTimer(): void;
    getTvIdleTimer(): ReturnType<typeof setTimeout> | null;
    syncTvBanner(): void;
    syncTvLayout(forcedNoLyrics?: boolean): void;
    updateTvKaraokeMeta(): void;
    updateTvkOutput(): Promise<void>;
    updateTvkVisualizerSetting(enabled: boolean | string): void;
    updateTvkVisualizerLyricsSetting(enabled: boolean | string): void;
    updateTvkVisualizerOpacity(opacityVal: string | number): void;
  }
  interface UrielTasteProfile {
    trackCount: number;
    topArtists: string[];
    dominantScript: string;
    avgDuration: number | null;
    bpmLabel: null;
    energyLabel: null;
    seeds: { artist: string; title: string; id?: string; platform: string; weight: number }[];
  }
  interface UrielWavePart {
    analysisCache: Map<string, Record<string, unknown>>;
    getWaveTracks(): UrielTrack[];
    computeTasteProfile(maxSeeds?: number): Promise<UrielTasteProfile>;
    normalizeArtistName(name: string): string;
    getTrackNormalizedKey(artist: string | undefined, title: string | undefined): string;
    getWaveAvoid(): { keys: string[]; artists: string[] };
    recordWaveSkip(track: UrielTrack): void;
    extendMyWaveQueue(): Promise<boolean>;
    getCoverDominantColors(url: string): Promise<string[]>;
    syncHomeAmbientVisibility(): void;
    initHomeHero(): void;
    loadForYou(force?: boolean): Promise<void>;
    warmHomeSongs(tracks: UrielTrack[], n: number): void;
    loadHomePage(isRefresh?: boolean): Promise<boolean>;
  }
  interface UrielPlaylistsPart {
    renderPlaylistCover(container: HTMLElement, playlist: UrielPlaylist, size?: number): void;
    renderPlaylistsList(): void;
    createPlaylist(name: string, initialTracks?: UrielTrack[], cover?: string, opts?: { open?: boolean }): UrielPlaylist | null;
    openPlaylistDetail(playlistId: string): void;
    sharePlaylist(pl: { name: string; tracks: UrielTrack[] } | undefined): Promise<void>;
    refreshPlaylistDownloads(pl: UrielPlaylist | undefined): Promise<void>;
    importSharedPlaylist(text: string): Promise<boolean>;
    removeTrackFromCurrentPlaylist(track: UrielTrack): void;
    deleteCurrentPlaylist(): void;
    openAddToPlaylistModal(track: UrielTrack | null, many?: UrielTrack[] | null): void;
  }
  interface UrielLyricsViewPart {
    TRANSLATION_LANGUAGES: { code: string; name: string; flag: string }[];
    setLyricsEmpty(isEmpty: boolean): void;
    loadSyncedLyrics(title: string, artist: string, token: number): Promise<void>;
    getLyricsWordStyle(): string;
    renderLyricsView(): void;
    updateLyricsPadding(): void;
    fetchAndApplyTranslation(): Promise<void>;
    updateLyricsTranslationUI(): void;
    getLineStartTime(idx: number): number;
    getLineEndTime(idx: number): number;
    getLyricsEase(): string;
    getLyricsSpeed(): number;
    applyLyricsEase(): void;
    getLyricsGradientTightness(): number;
    applyLyricsGradientTightness(): void;
    stopLyricsScroll(): void;
    animateLyricsScroll(container: HTMLElement, target: number): void;
    updateActiveGradient(): void;
    stopGradientLoop(): void;
    updateSyncedLyricsHighlight(currentTime: number): void;
  }
  interface UrielSiteTheme { id: string; name: string; tag: string; bg: string; bg2: string; bg3: string; text: string; accent: string; accent2: string; pop: string }
  interface UrielThemePalettePart {
    PALETTE_STYLES: Record<string, { label: string; secHueShift: number; tertHueShift: number; priSatScale: number; surfSatScale: number; contSatScale: number }>;
    SITE_THEMES: UrielSiteTheme[];
    activeSiteTheme(): UrielSiteTheme | null;
    generateM3Palette(hexColor: string, mode: string, intensity: number, brightness: number): void;
  }
  interface UrielBlocks { rawA: string | null; rawS: string | null; artists: string[]; songs: UrielTrack[] }
  interface UrielBlocksPart {
    getBlocks(): UrielBlocks;
    isBlocked(track: UrielTrack): boolean;
    toggleBlockArtist(name: string): void;
    toggleBlockSong(track: UrielTrack): void;
    renderBlockedSettings(): void;
  }
  interface UrielTrackRowsPart {
    createTrackRow(track: UrielTrack, idx: number, currentCanonicalId: string, context: string, tracks: UrielTrack[], container: HTMLElement): HTMLElement;
    renderTracks(container: HTMLElement, tracks: UrielTrack[], context?: string): void;
    highlightPlayingRow(): void;
    isFavoriteSong(track: UrielTrack): boolean;
    showActionMenu(x: number, y: number, items: UrielMenuItem[], aboveY?: number): void;
  }
  interface UrielLibraryPart {
    toggleFavoriteTrack(track: UrielTrack): void;
    updateFavoriteIcon(): void;
    updateFavoritesBadge(): void;
    getTrackSortMode(kind: string): string;
    setTrackSortMode(kind: string, mode: string): void;
    sortTracksFor(kind: string, tracks: UrielTrack[]): UrielTrack[];
    stampAddedAt(track: UrielTrack): UrielTrack;
    renderFavoritesView(): void;
    syncSortDropdown(kind: string): void;
    setupSortDropdown(kind: string, selectEl: HTMLSelectElement): void;
    getLibrarySort(kind: string): string;
    renderHistoryView(): void;
    updateQueueBadge(): void;
    renderQueueView(): void;
    updateLocalBadge(): void;
    renderLocalView(forceFetch?: boolean): Promise<void>;
    sortedLibrary<I extends { name: string }>(kind: string, items: I[]): I[];
    importLocalFiles(opts?: { folder?: boolean }): Promise<void>;
  }
  interface UrielPresetsPart {
    renderPresets(): void;
    updateFade(el: Element | null): void;
    updatePresetsFade(): void;
    saveCustomPreset(name: string): void;
    renameCustomPreset(id: string, newName: string): void;
    deleteCustomPreset(id: string): void;
  }
  interface UrielAlbumsPart {
    fetchArtistCardForSearch(query: string, token: number, searchTracks: UrielTrack[]): Promise<void>;
    resolveAlbumTrack(album: UrielAlbum, t: UrielTrack): Promise<UrielTrack | null>;
    playAlbumFrom(album: UrielAlbum, tracks: UrielTrack[], startIndex?: number): Promise<void>;
    getSavedAlbums(): UrielAlbum[];
    setSavedAlbums(list: UrielAlbum[]): void;
    updateAlbumsCount(): void;
    renderSavedAlbums(): void;
    applyShowAlbums(): void;
    updateSaveAlbumButton(): void;
    getMixFeedback(): ReturnType<typeof import("./library-pages")["cleanFeedback"]>;
    showAlbumExtras(album: UrielAlbum): void;
  }
  interface UrielCoversPart {
    YT_THUMB: RegExp;
    listThumb(url: string): string;
    trackYoutubeId(track: UrielTrack): string;
    trackArtCandidates(track: UrielTrack | null): string[];
    nextPlayerArt(track: UrielTrack, img: HTMLImageElement): string;
    getTrackThumbUrl(track: UrielTrack | null): string;
    rowTitle(track: UrielTrack): string;
    nextTrackArt(img: HTMLImageElement): boolean;
    rememberTrackArt(canonicalId: string | undefined, url: string): void;
  }
  interface UrielPanelDrawerPart {
    openPanelDrawer(tab: string): void;
    showPlayingInQueue(): void;
  }
  interface UrielThemeCardsPart {
    setSiteTheme(id: string, apply?: boolean): void;
    applySystemColors(): Promise<void>;
  }
  interface UrielNowPlayingPart {
    shownThumbs: Set<string | null>;
    updateNowPlayingUI(track: UrielTrack): void;
    updateRightPanelBanner(thumbUrl: string): void;
    updatePlaylistDetailBanner(thumbUrl: string): void;
  }
  interface UrielCoverColors { accent: string; accent2: string; luminance: number; saturation: number }
  interface UrielThemePart {
    analyzeCover(imgSrc: string): Promise<UrielCoverColors>;
    setCoverBg(url: string): void;
    registerFx(el: HTMLElement | null, kind: string, viewEl: HTMLElement | null): void;
    applyFxClip(): void;
    updateFxVisibility(): void;
    refreshMeshCover(): Promise<void>;
    redrawMesh(): void;
    updateMeshGradient(accentHex: string, accent2Hex: string, mode: string): void;
    smoothThemeSwap(fn: () => void): void;
    updateThemeFromState(): void;
    meshLayer(): string;
    effectiveMode(): string;
  }
  interface UrielPlaybackPart {
    playTrack(track: UrielTrack, queueList?: UrielTrack[] | null, startIndex?: number, context?: string | null): Promise<void>;
    shuffleQueue(): void;
    unshuffleQueue(): void;
    pauseSmooth(): void;
    playSmooth(): Promise<void>;
    togglePlayPause(): void;
    restoreQueueAt(index: number, position: number, play: boolean): void;
    adoptQueueAt(index: number): void;
    queueFinished(): boolean;
    playNext(): void;
    playPrev(): void;
    prefetchNextQueueTrack(): void;
    skipUnplayable(token: number, track: UrielTrack | null): boolean;
    retryFresh(token: number, track: UrielTrack | null): boolean;
    showPlayFailure(message: UrielText, type?: string): void;
  }
  interface UrielDesktopPart {
    toggleMiniWindow(): Promise<void>;
  }
  interface UrielPlayerBarPart {
    setPlatform(platform: string, triggerSearch?: boolean): void;
    updateEngineWidthVar(): void;
    setShuffle(on: boolean): void;
    persistVolumeState(): void;
    syncVolumeControls(): void;
  }
  interface UrielPerformancePart {
    applyPerfMode(on: boolean): void;
  }
  interface UrielTrackAudioPart {
    effectiveAudioSettings(): UrielAppState['audioSettings'];
    setTempoValues(values: Record<string, number>): void;
    onTrackAudioTrackChange(): void;
  }
  interface UrielNavigationPart {
    switchView(viewName: string): void;
    refreshStacks(): void;
    updateNavIndicator(animate: boolean): void;
  }
  interface UrielPlayButtonPart {
    setPlayPauseState(playing: boolean, animate?: boolean): void;
    updatePlayPauseButton(isPlaying: boolean, isBuffering?: boolean): void;
  }
  interface UrielMediaSessionPart {
    sendStateToServer(currentWordText?: string, wordIndex?: number, lineIndex?: number): void;
    getMediaArtwork(thumb: string | undefined): MediaImage[];
    updateMediaPositionState(): void;
    updateDiscordPresence(): void;
    updateMediaSession(): void;
    handleMediaCommand(cmd: string, src: string): void;
    registerMediaActions(): void;
    discordPresenceOn(): boolean;
  }
  interface UrielOfflinePart {
    OFFLINE_ICON: string;
    offlineKey(t: UrielTrack): string;
    offlineState(t: UrielTrack): boolean;
    checkOffline(tracks: UrielTrack[]): void;
    offlineChanged(track?: UrielTrack, on?: boolean): void;
  }
  interface UrielMultiSelectPart {
    multiSel: { active: boolean; context: string; tracks: Map<string, UrielTrack> };
    updateMultiSelectBar(): void;
    rerenderMultiSelectView(): void;
    exitMultiSelect(rerender?: boolean): void;
    startMultiSelect(context: string): void;
    toggleTrackSelection(track: UrielTrack, row: HTMLElement): void;
    multiSelectSourceTracks(): UrielTrack[];
  }
  interface UrielVisualizerPart {
    startVisualizers(): void;
    resizeCanvases(): void;
    resetLevelHistory(): void;
    resetScrubber(): void;
  }
  interface UrielCrossfadePart {
    crossfadeSeconds(): number;
    canOverlap(a: HTMLAudioElement | null): boolean;
    prepareCrossfade(point: number, end: number): void;
    crossfadePrepared(): boolean;
    crossfadeFadeIn(): void;
    crossfadeOnTrackChange(): void;
    cancelEndFade(): void;
    dropCrossfadePrep(): void;
    pauseCrossfadeTail(): void;
    resumeCrossfadeTail(): void;
  }
  interface UrielTrimPart {
    getTrackTrim(track: UrielTrack): { start: number; end: number } | null;
    enforceTrackTrim(): boolean;
    showDownloadPane(which: string): void;
    prepareTrimPane(track: UrielTrack): void;
    forgetTrackTrims(): void;
  }
  interface UrielSleepTimerPart {
    updateSleepTimerUI(): void;
  }
  interface UrielTrackArtPart {
    openTrackArtModal(track: UrielTrack, triggerEl?: HTMLElement | null): void;
    applyTrackBannerFx(art: UrielTrackArt | null): void;
  }
  interface UrielToolsPart {
    checkToolsStatus(promptUser?: boolean): Promise<void>;
    toolsReady(need: string[]): Promise<boolean>;
  }
  interface UrielStoragePart {
    updateDeviceMusicUI(change?: Record<string, unknown>): Promise<void>;
    updateOfflineStorageUI(): Promise<void>;
    updateMusicFolderUI(): Promise<void>;
    updateDownloadFolderUI(): Promise<void>;
    pauseCacheBars(): void;
    resumeCacheBars(): void;
  }
  interface UrielDownloadsPart {
    openDownloadModal(track: UrielTrack): void;
    openDownloadAllModal(playlist: UrielDownloadJob | UrielPlaylist | undefined): void;
    updateDownloadCaptionPath(): Promise<void>;
    downloadedInFolder(tracks: UrielTrack[]): Promise<boolean[]>;
    getTrackToDownload(): UrielTrack | null;
  }
  interface UrielSearchPart {
    performSearch(query: string): Promise<void>;
  }
  interface UrielAlbumPart {
    openAlbum(album: UrielAlbum): Promise<void>;
  }
  interface UrielSettingsPart {
    enterSettings(): void;
  }
  interface UrielThemesPart {
    applyCustomStyles(): void;
    loadCustomThemes(): Promise<void>;
    renderThemeCards(): void;
  }
  interface UrielArtistPart {
    compactCount(n: number): string;
    getFollowedArtists(): { name: string; id?: string; avatar?: string; fans?: number; [field: string]: unknown }[];
    setFollowedArtists(list: { name: string; [field: string]: unknown }[]): void;
    openArtistProfile(name: string, o?: { id?: string; video?: string }): Promise<void>;
    openTrackArtist(track: UrielTrack): void;
    renderAlbumCards(container: HTMLElement, albums: UrielAlbum[], subOf: (album: UrielAlbum) => string): void;
    updateFollowButton(): void;
    updateArtistBlockButton(): void;
  }
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
    matchSpotifyTracks(list: Partial<UrielImportSong>[], onProgress?: (done: number, total: number) => void): Promise<UrielTrack[] & { failStats?: unknown }>;
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
    settings: Record<string, unknown>;
    [field: string]: unknown;
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
    syncedLyrics: UrielLyricLine[];
    [field: string]: any;
  }

  // a profile and window.UrielProfiles (profiles-core.js)
  interface UrielProfile { id: string; name: string; color: string; emoji: string; created: number; [field: string]: unknown }
  interface UrielProfilesApi {
    id: string;
    current(): UrielProfile;
    list(): UrielProfile[];
    create(opts: { name?: unknown; color?: unknown; emoji?: unknown }): UrielProfile;
    update(id: string, patch: { name?: unknown; color?: unknown; emoji?: unknown }): UrielProfile | null;
    remove(id: string): boolean;
    open(id: string): boolean;
    peek(id: string, key: string): string | null;
    isDevice(key: string): boolean;
    COLORS: string[];
  }

  // what app.js hands each of its parts (shared/app/*.js): the common ones typed, the rest as app.js has them
  interface UrielAppDeps {
    isPhoneApp: boolean;
    state: UrielAppState;
    el: any;
    Tm: (key: string, ...args: unknown[]) => UrielI18nMessage;
    showToast: (message: UrielText, kind?: string, duration?: number | null) => void;
    escapeHtml: (value: unknown) => string;
    [name: string]: any;
  }

  // newer than the DOM types here, or only in some browsers
  interface AudioContext {
    sinkId?: string;
    setSinkId?(id: string): Promise<void>;
  }
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
