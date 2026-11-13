// Types the phone layer shares: what shared/app.js (still JavaScript) offers it, the native plugins, and the
// things the phone layer hangs on `window` for the rest of the app.

import type { PluginListenerHandle } from '@capacitor/core';

declare global {
  // A song as app.js keeps it: found by search, in a playlist, the queue or History
  interface Track {
    id: string;
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    thumbnail?: string;
    platform?: string;
    url?: string;
    playedAt?: number;
    [key: string]: unknown;
  }

  type RepeatMode = 'off' | 'all' | 'one';

  // app.js's `state`, as far as the phone layer reads it
  interface CoreState {
    currentTrack: Track | null;
    queue: Track[];
    queueIndex: number;
    isPlaying: boolean;
    isShuffle: boolean;
    isRepeat?: boolean;
    repeatMode?: RepeatMode;
    trackLoading?: boolean;
    pausedByUser?: boolean;
    queueRestorePosition?: number;
    favorites?: Track[];
    history?: Track[];
    serverPort?: number;
    lyricsMode?: string;
    [key: string]: unknown;
  }

  // The few properties, methods and events of an <audio> element app.js uses: the real element, or on Android its
  // native stand-in (mobile/native-audio.ts)
  type AppAudio = HTMLAudioElement | import('./native-audio').Audio;

  // window.UrielCore (the end of shared/app.js)
  interface UrielCoreApi {
    state: CoreState;
    audio: AppAudio;
    base(): string;
    thumb(t: Track): string;
    playTrack(track: Track, list?: Track[] | null, index?: number): unknown;
    togglePlay(): void;
    restoreAt(index: number, position: number, play: boolean): boolean;
    adoptAt(index: number): boolean;
    resumeAudio(): unknown;
    next(): void;
    prev(): void;
    seek(seconds: number): void;
    toggleShuffle(): boolean;
    toggleRepeat(): RepeatMode | undefined;
    isSameTrack(a: Track, b: Track): boolean;
    toast(message: string, kind?: string): void;
    [key: string]: unknown;
  }

  // shared/audio-engine.js, as far as the phone layer reads it
  interface AudioEngineLike {
    volume: number;
    isMuted: boolean;
    hqEnabled?: boolean;
    hqSettings?: { engine?: string; bass?: number; vocal?: number; air?: number };
    audioSettings?: {
      volume?: number; reverb?: number; echo?: number; distortion?: number;
      eq?: { low?: number; mid?: number; high?: number };
      eqBands?: number[];
    };
    setVolume(volume: number, isMuted: boolean): unknown;
    __urielNative?: boolean;
    // mobile-ui.ts keeps the element here instead of building a Web Audio graph
    __element?: HTMLMediaElement;
  }

  // ---- native plugins (android/.../*.java|kt, ios/App/App/*.swift) ----

  type Listen<E> = (event: E) => void;
  type AddListener<Events> = <K extends keyof Events>(name: K, cb: Listen<Events[K]>) => Promise<PluginListenerHandle>;

  // what PlayerService.kt tells about its player
  interface NativePlayerState {
    item?: string;
    state?: number;
    playWhenReady?: boolean;
    playing?: boolean;
    position?: number;
    duration?: number;
    rate?: number;
    at?: number;
    // the number of the page's last request the player has done (native-audio.ts)
    seq?: number;
  }
  interface NativeTailState { id?: string; state?: number; playing?: boolean; position?: number; duration?: number; at?: number; error?: string }
  // a song as the native side shows it, and starts it again later
  interface NativeSongInfo {
    qi: number;
    title: string;
    artist: string;
    album: string;
    artwork: string;
    duration: number;
    cache: string;
    thumb: string;
    path?: string;
    load?: number;
  }
  // where the native player is when the page starts
  interface NativeSnapshot { item?: Partial<NativeSongInfo>; position?: number; duration?: number; playing?: boolean; ended?: boolean }
  interface SoundSettings {
    hq: boolean; hqEngine: string; hqBass: number; hqVocal: number; hqAir: number;
    eq: { low: number; mid: number; high: number };
    eqBands: number[];
    reverb: number; echo: number; distortion: number; volume: number; normalize: boolean;
  }
  type MediaAction = 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'shuffle' | 'repeat' | 'cancel-downloads';
  interface MediaActionEvent { action?: MediaAction; position?: number }

  // UrielPlayerPlugin.kt
  interface UrielPlayerPlugin {
    attach(): Promise<NativeSnapshot>;
    load(o: { path: string; url: string; item: Partial<NativeSongInfo>; startAt: number; play: boolean; seq: number }): Promise<void>;
    play(o: { seq: number }): Promise<void>;
    pause(o: { seq: number; done?: boolean }): Promise<void>;
    seek(o: { position: number; seq: number }): Promise<void>;
    setSpeed(o: { speed: number; preservePitch: boolean }): Promise<void>;
    setVolume(o: { volume: number }): Promise<void>;
    setModes(o: { shuffle: boolean; repeat: string }): Promise<void>;
    setEffects(o: SoundSettings): Promise<void>;
    setMixing(o: { mix: boolean }): Promise<void>;
    clear(): Promise<void>;
    tailLoad(o: { id: string; path: string; url: string; startAt: number }): Promise<void>;
    tailSet(o: { id: string; play?: boolean; position?: number; volume?: number; speed?: number; preservePitch?: boolean }): Promise<void>;
    tailStop(o: { id: string }): Promise<void>;
    addListener: AddListener<{ state: NativePlayerState; error: { code?: number; message?: string }; action: MediaActionEvent; tail: NativeTailState }>;
  }

  interface IslandStatus { supported?: boolean; vendor?: string; defaultOn?: boolean; notifications?: boolean; promoted?: boolean }
  // what ColdPlayer.java got to, for the page to carry on from
  interface NativeHandover { qi?: number; title?: string; artist?: string; position?: number; playing?: boolean; live?: boolean; ended?: boolean; needsApp?: boolean }

  // MediaControlsPlugin.java
  interface UrielMediaPlugin {
    update(o: Record<string, unknown>): Promise<void>;
    takeStartPlay(): Promise<{ start?: boolean; background?: boolean; native?: NativeHandover }>;
    moveToBack(): Promise<void>;
    downloading(o: { active: boolean; title: string; done: number; total: number; percent: number }): Promise<void>;
    islandStatus(): Promise<IslandStatus>;
    allowIsland(o?: { settings?: boolean }): Promise<IslandStatus>;
    backgroundStatus(): Promise<{ unrestricted?: boolean }>;
    allowBackground(): Promise<{ unrestricted?: boolean }>;
    scanFile(o: { path: string }): Promise<void>;
    stop(): Promise<void>;
    addListener: AddListener<{ action: MediaActionEvent }>;
  }

  // mobile/bridge.ts swaps <audio src> and <img src> addresses of the in-app server for real file URLs: the address
  // app.js gave, and the lookup still under way
  interface Element { __urielSrc?: string; __urielPending?: Promise<void> | null }

  // ---- window ----

  interface Window {
    UrielCore: UrielCoreApi;
    audioEngine?: AudioEngineLike;
    UrielAudioEngine?: { prototype: AudioEngineLike & { init(el?: HTMLMediaElement): void; _applyMasterVolume(): void } };
    // app.js asks for its element through this (Android: the native stand-in)
    UrielAudioElement?: (web: HTMLAudioElement | null) => import('./native-audio').Audio | null;
    __urielResolveLocal?: (url: string) => Promise<string>;
    // the error log people can share from Settings (mobile/bridge.ts)
    UrielLog?: { add(level: string, message: unknown): void; text(): string; clear(): void };
    UrielIsland?: {
      status(): Promise<IslandStatus>;
      enabled(status?: IslandStatus): boolean;
      setEnabled(on: boolean): void;
      allow(opts?: { settings?: boolean }): Promise<IslandStatus>;
      refresh(): void;
    };
    UrielBackground?: { allowed(): Promise<boolean>; allow(): Promise<boolean> };
    UrielProfiles?: { list(): { id: string }[]; peek(id: string, key: string): string | null; [key: string]: unknown };
    UrielLibraryStore?: { store?: { mode(): string }; [key: string]: unknown };
    URIEL_BUILD?: Record<string, unknown>;
    // the song cache, for the storage limit in Settings (mobile/bridge.ts)
    UrielCache?: { enforceLimit(): void };
    UrielLiveActivity?: { enabled(): boolean; available(): Promise<boolean>; setEnabled(on: boolean): void };
    UrielDeviceMusic?: { rescan(ask?: boolean): Promise<number> };
    UrielAppIcon?: { set(style: string): Promise<boolean | 'custom'> };
    UrielAppUpdater?: {
      supported(): Promise<boolean>;
      download(update: unknown, onProgress?: (p: { received?: number; total?: number }) => void): Promise<{ ok: boolean; version?: string; error?: string }>;
      install(): Promise<{ ok: boolean; error?: string }>;
    };
    // from the shared scripts (still JavaScript): shared/i18n.js, encore.js, sync.js and app.js's Settings
    UrielI18n?: { T(message: string): string; Tm(message: string, ...args: unknown[]): string };
    UrielEncore?: { close(): void };
    UrielSync?: object;
    UrielSettingsBack?: () => boolean;
    // what app.js calls where the computer has Electron's preload (mobile/electron-api.ts)
    electronAPI: ReturnType<typeof import('./electron-api')>;
  }

  // Every network call of the phone layer: native HTTP in the app, the dev proxy in a browser (mobile/bridge.ts)
  // eslint-disable-next-line no-var
  var __urielFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  // where server.js keeps its secrets on a phone (mobile/bridge.ts)
  // eslint-disable-next-line no-var
  var __urielVault: (name: string) => { read(): unknown; write(value: unknown): void };
  // set by the phone bundle for server.js (mobile/bridge.ts)
  // eslint-disable-next-line no-var
  var __urielPlaysOpus: boolean | undefined;
}

export {};
