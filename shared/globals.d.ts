// What the shared and desktop scripts hand each other through `window`: in the page they are plain scripts, not
// modules (mobile/types.d.ts has the phone layer's own). For the JavaScript type-check (tsconfig.js.json) only.
// The big ones stay loose until the file that makes them moves to TypeScript.
export {};

declare global {
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
    // shared/app/boot.js
    __riffFetchPatched?: boolean;
    __riffLogError?: (level: string, message: string, stack?: string | null) => void;

    // shared/*.js, each under its own name
    UrielSync?: any;
    UrielSyncCore?: any;
    UrielEncore?: any;
    UrielProfiles?: any;
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
    RiffShapes?: any;
    trackMatch?: any;
    URIEL_BUILD?: { sha?: string; [key: string]: unknown };

    // libraries loaded when first needed (shared/assets)
    Peer?: any;
    qrcode?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}
