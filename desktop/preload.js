// @ts-check
const { contextBridge, ipcRenderer, webFrame } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  // only Uriel's own pages get the token (main.js also stops the window from navigating anywhere else)
  serverToken: (() => {
    if (location.protocol !== 'file:') return '';
    const arg = process.argv.find((a) => a.startsWith('--uriel-token='));
    return arg ? arg.slice('--uriel-token='.length) : '';
  })(),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getSystemColors: () => ipcRenderer.invoke('get-system-colors'),
  getGpuCompositing: () => ipcRenderer.invoke('get-gpu-compositing'),
  pickMedia: () => ipcRenderer.invoke('pick-media'),
  importAudioFiles: (/** @type {any} */ opts) => ipcRenderer.invoke('import-audio-files', opts && opts.folder ? { folder: true } : undefined),
  onWindowVisibility: (/** @type {(visible: boolean) => void} */ callback) => {
    ipcRenderer.on('window-visibility', (event, visible) => callback(visible));
  },
  setZoomFactor: (/** @type {number} */ factor) => {
    try {
      webFrame.setZoomFactor(factor);
    } catch (e) {}
  },
  getZoomFactor: () => {
    try {
      return webFrame.getZoomFactor();
    } catch (e) {
      return 1.0;
    }
  },

  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  pickDataDir: () => ipcRenderer.invoke('pick-data-dir'),
  setDataDir: (/** @type {string} */ dir, /** @type {boolean} */ move) => ipcRenderer.invoke('set-data-dir', { dir, move }),
  getDownloadDir: () => ipcRenderer.invoke('get-download-dir'),
  pickDownloadDir: () => ipcRenderer.invoke('pick-download-dir'),
  setDownloadDir: (/** @type {string} */ dir) => ipcRenderer.invoke('set-download-dir', { dir }),
  resetDownloadDir: () => ipcRenderer.invoke('set-download-dir', { reset: true }),
  restartApp: () => ipcRenderer.send('restart-app'),
  setTrayOnClose: (/** @type {boolean} */ enabled) => ipcRenderer.send('set-tray-on-close', enabled),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getHwAccel: () => ipcRenderer.invoke('get-hw-accel'),
  setHwAccel: (/** @type {boolean} */ v) => ipcRenderer.send('set-hw-accel', v),
  trimMemory: () => { try { webFrame.clearCache(); } catch (e) {} },
  onMediaCommand: (/** @type {(value: any) => void} */ cb) => ipcRenderer.on('media-command', (e, cmd) => cb(cmd)),
  toggleMiniWindow: () => ipcRenderer.invoke('toggle-mini-window'),
  setMiniLyrics: (/** @type {boolean} */ enabled) => ipcRenderer.invoke('set-mini-lyrics', enabled),
  isWindows: process.platform === 'win32',
  setMediaKeys: (/** @type {boolean} */ v) => ipcRenderer.send('set-media-keys', v),
  mediaKeysActive: () => ipcRenderer.send('media-keys-active'),
  welcomeFinish: (/** @type {any} */ detail) => ipcRenderer.send('welcome-finish', detail),
  onWelcomeResult: (/** @type {(value: any) => void} */ cb) => ipcRenderer.on('welcome-result', (e, d) => cb(d)),
  getLauncherInfo: () => ipcRenderer.invoke('launcher-info'),
  listPlugins: () => ipcRenderer.invoke('plugins-list'),
  setPluginEnabled: (/** @type {string} */ file, /** @type {boolean} */ on) => ipcRenderer.send('plugins-set-enabled', file, on),
  disableAllPlugins: () => ipcRenderer.send('plugins-disable-all'),
  openPluginsFolder: () => ipcRenderer.send('plugins-open-folder'),
  removePlugin: (/** @type {string} */ file) => ipcRenderer.send('plugins-remove', file),
  importPlugins: () => ipcRenderer.invoke('plugins-import'),
  discordPresenceUpdate: (/** @type {any} */ trackInfo) => ipcRenderer.send('discord-presence-update', trackInfo),
  discordPresenceClear: () => ipcRenderer.send('discord-presence-clear'),
  openExternal: (/** @type {string} */ u) => ipcRenderer.send('open-external', u),
  // in-app updates (desktop-updater.js): download the new build with progress, then put it in and restart
  updates: {
    supported: () => ipcRenderer.invoke('updater-supported'),
    download: (/** @type {any} */ update, /** @type {(p: any) => void} */ onProgress) => {
      const listener = (/** @type {Electron.IpcRendererEvent} */ e, /** @type {any} */ p) => { if (onProgress) onProgress(p); };
      ipcRenderer.on('updater-progress', listener);
      return ipcRenderer.invoke('updater-download').finally(() => ipcRenderer.removeListener('updater-progress', listener));
    },
    install: () => ipcRenderer.invoke('updater-install'),
  },
  logError: (/** @type {string} */ level, /** @type {string} */ message, /** @type {string | null} */ stack) => ipcRenderer.send('log-error', { level, message, stack }),
  openLogsFolder: () => ipcRenderer.send('open-logs-folder'),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
  copyText: (/** @type {string} */ text) => ipcRenderer.invoke('copy-text', text),
  getAudioOutputInfo: () => ipcRenderer.invoke('get-audio-output-info'),
  // YouTube / YouTube Music library import (google-library.js) and playlist files / backups (backup.js)
  googleLogin: (/** @type {string} */ profile) => ipcRenderer.invoke('google-login', profile),
  googleLogout: (/** @type {string} */ profile) => ipcRenderer.invoke('google-logout', profile),
  googleAuthStatus: (/** @type {string} */ profile) => ipcRenderer.invoke('google-auth-status', profile),
  // Settings → Integrations → YouTube: yt-dlp plays with that Google login (google-library.js)
  ytSigninStatus: (/** @type {string} */ profile) => ipcRenderer.invoke('yt-signin-status', profile),
  ytSigninSet: (/** @type {any} */ opts) => ipcRenderer.invoke('yt-signin-set', opts),
  setAppIcon: (/** @type {string} */ src) => ipcRenderer.invoke('set-app-icon', src),
  googleImportLibrary: (/** @type {any} */ opts) => ipcRenderer.invoke('google-import-library', opts),
  saveTextFile: (/** @type {any} */ payload) => ipcRenderer.invoke('save-text-file', payload),
});

// which computer this is, for controls that belong to one only (.windows-only in styles.css)
window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add(`platform-${process.platform}`));

// macOS uses the native traffic lights instead of the drawn window buttons: tag the page so CSS hides the drawn
// minimize/maximize/close, and hide the traffic lights whenever the titlebar itself is hidden
if (process.platform === 'darwin') {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('platform-darwin');
    const body = document.body;
    if (!body) return;
    /** @type {boolean | null} */
    let last = null;
    const sync = () => {
      const c = body.classList;
      const visible = !c.contains('mini') && (!c.contains('hide-titlebar') || c.contains('titlebar-peek'));
      if (visible === last) return;
      last = visible;
      ipcRenderer.send('set-window-buttons-visible', visible);
    };
    new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ['class'] });
    sync();
  });
}
