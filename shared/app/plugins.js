// @ts-check
// Plugins (computers: JavaScript files in the plugins folder, run with the Uriel API) and the custom CSS editor
// (Monaco). Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
window.UrielApp.plugins = function ({ showToast, Tm, state, el, T, applyCustomStyles }, out) {
  Object.assign(out, {
    emitPluginEvent, reloadPluginsList, clearCssEditor, stopAllPlugins, renderPluginCards, loadPlugins,
  });

  const loadedPlugins = new Map();
  const pluginListeners = [];
  function emitPluginEvent(event, data) {
    pluginListeners.filter((l) => l.event === event).forEach((l) => { try { l.cb(data); } catch (e) { reportPluginError(l.file, e); } });
  }
  function reportPluginError(file, e) {
    console.error('[plugin ' + file + ']', e);
    showToast(Tm('Plugin {0} failed: {1}', file, e && e.message ? e.message : e), 'error');
  }
  function createPluginApi(p) {
    const prefix = `uriel_plugin_${p.file}_`;
    return {
      plugin: { file: p.file, name: p.name, author: p.author, version: p.version },
      on(event, cb) {
        const l = { event, cb, file: p.file };
        pluginListeners.push(l);
        return () => { const i = pluginListeners.indexOf(l); if (i >= 0) pluginListeners.splice(i, 1); };
      },
      toast: (message, type) => showToast(String(message), type || 'info'),
      addStyle(css) {
        const s = document.createElement('style');
        s.dataset.urielCustom = 'plugin';
        s.dataset.plugin = p.file;
        s.textContent = css;
        document.head.appendChild(s);
        return () => s.remove();
      },
      storage: {
        get: (k, d) => { const v = localStorage.getItem(prefix + k); return v === null ? d : JSON.parse(v); },
        set: (k, v) => localStorage.setItem(prefix + k, JSON.stringify(v))
      },
      getTrack: () => state.currentTrack,
      isPlaying: () => state.isPlaying,
      audio: () => el.nativeAudio,
      query: (sel) => document.querySelector(sel)
    };
  }
  function runPlugin(p) {
    if (loadedPlugins.has(p.file)) return;
    try {
      const api = createPluginApi(p);
      const fn = new Function('Uriel', 'plugin', `${p.code}\n//# sourceURL=uriel-plugin-${p.file}`);
      const result = fn(api, api.plugin);
      loadedPlugins.set(p.file, { stop: result && typeof result.stop === 'function' ? result.stop : null });
    } catch (e) { reportPluginError(p.file, e); }
  }
  function stopPlugin(p, silent) {
    const entry = loadedPlugins.get(p.file);
    try { if (entry && entry.stop) entry.stop(); } catch (e) { reportPluginError(p.file, e); }
    for (let i = pluginListeners.length - 1; i >= 0; i--) if (pluginListeners[i].file === p.file) pluginListeners.splice(i, 1);
    document.querySelectorAll(`style[data-plugin="${p.file}"]`).forEach((n) => n.remove());
    const hadStop = !!(entry && entry.stop);
    loadedPlugins.delete(p.file);
    if (!silent && !hadStop) showToast(Tm('Restart Uriel to fully unload "{0}"', p.name), 'info');
  }
  let pluginsCache = [];
  function renderPluginCards() {
    const list = document.getElementById('plugins-list');
    if (!list) return;
    list.innerHTML = '';
    if (!pluginsCache.length) {
      const empty = document.createElement('div');
      empty.className = 'ct-empty';
      empty.textContent = 'No plugins. Put .js files into the plugins folder or click Add.';
      empty.dataset.i18n = '';
      list.appendChild(empty);
      return;
    }
    pluginsCache.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'ct-card plugin-card';
      card.innerHTML = '<div class="ct-info"><div class="ct-name"></div><div class="ct-meta"></div></div><button class="btn-icon-pill ct-remove" title="Delete file" data-i18n-attr="title"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button><button class="effect-switch-btn"><span class="thumb"></span></button>';
      card.querySelector('.ct-name').textContent = p.wrongExt ? p.file : `${p.name}${p.version ? ' v' + p.version : ''}`;
      card.querySelector('.ct-meta').textContent = p.wrongExt
        ? T('Rename it to end in .js')
        : [p.author && `by ${p.author}`, p.description, p.file].filter(Boolean).join(' · ');
      const toggle = card.querySelector('.effect-switch-btn');
      if (p.wrongExt) toggle.remove();
      toggle.classList.toggle('active', !!p.enabled);
      toggle.addEventListener('click', () => {
        p.enabled = !p.enabled;
        toggle.classList.toggle('active', p.enabled);
        window.electronAPI.setPluginEnabled(p.file, p.enabled);
        if (p.enabled) runPlugin(p); else stopPlugin(p, false);
      });
      card.querySelector('.ct-remove').addEventListener('click', () => {
        stopPlugin(p, true);
        window.electronAPI.removePlugin(p.file);
        pluginsCache = pluginsCache.filter((x) => x.file !== p.file);
        renderPluginCards();
        showToast(Tm('Plugin file deleted'), 'info');
      });
      list.appendChild(card);
    });
  }
  async function loadPlugins() {
    if (!window.electronAPI || !window.electronAPI.listPlugins) return;
    pluginsCache = await window.electronAPI.listPlugins();
    pluginsCache.filter((p) => p.enabled).forEach(runPlugin);
    renderPluginCards();
  }
  const pluginsApi = window.electronAPI;
  async function reloadPluginsList() {
    if (pluginsApi && pluginsApi.listPlugins) {
      pluginsCache = await pluginsApi.listPlugins();
      const present = new Set(pluginsCache.map((x) => x.file));
      [...loadedPlugins.keys()].filter((f) => !present.has(f)).forEach((f) => stopPlugin({ file: f, name: f }, true));
    }
    renderPluginCards();
  }
  if (pluginsApi && pluginsApi.listPlugins) {
    document.getElementById('btn-plugins-folder').addEventListener('click', () => pluginsApi.openPluginsFolder());
    document.getElementById('btn-plugins-reload').addEventListener('click', reloadPluginsList);
    document.getElementById('btn-add-plugin').addEventListener('click', async () => {
      const added = await pluginsApi.importPlugins();
      if (!added) return;
      pluginsCache = await pluginsApi.listPlugins();
      renderPluginCards();
      showToast(added > 1 ? Tm('Added {0} plugins. Turn one on to run it', added) : Tm('Added 1 plugin. Turn it on to run it'), 'info');
    });
  }

  let cssEditorInstance = null;
  let cssEditorLoading = null;

  function loadMonaco() {
    if (window.monaco) return Promise.resolve(window.monaco);
    if (cssEditorLoading) return cssEditorLoading;
    cssEditorLoading = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'vendor/monaco/vs/editor/editor.main.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'vendor/monaco/vs/loader.js';
      s.onload = () => {
        // Monaco's own loader (AMD), not Node's require
        const amd = /** @type {any} */ (window).require;
        amd.config({ paths: { vs: 'vendor/monaco/vs' } });
        amd(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return cssEditorLoading;
  }

  function defineRiffMonacoTheme(monaco) {
    const cs = getComputedStyle(document.documentElement);
    const hex = (name, fallback) => { const v = cs.getPropertyValue(name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; };
    const bg = hex('--md-sys-color-surface-container-lowest-solid', '#141218');
    const high = hex('--md-sys-color-surface-container-high-solid', '#2b2930');
    const primary = hex('--md-sys-color-primary', '#d0bcff');
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    monaco.editor.defineTheme('uriel', { base: lum(bg) < 0.5 ? 'vs-dark' : 'vs', inherit: true, rules: [], colors: { 'editor.background': bg, 'editorGutter.background': bg, 'minimap.background': bg, 'editor.lineHighlightBackground': high, 'editorCursor.foreground': primary, 'editor.selectionBackground': primary + '55' } });
    monaco.editor.setTheme('uriel');
  }

  async function openCssEditor() {
    const overlay = document.getElementById('css-editor');
    overlay.classList.remove('hidden');
    let monaco;
    try { monaco = await loadMonaco(); } catch (e) { overlay.classList.add('hidden'); showToast(Tm('Could not load the CSS editor'), 'error'); return; }
    defineRiffMonacoTheme(monaco);
    if (cssEditorInstance) { cssEditorInstance.focus(); return; }
    cssEditorInstance = monaco.editor.create(document.getElementById('css-editor-host'), {
      value: localStorage.getItem('uriel_custom_css') || '/* Your CSS goes here. Example:\n.btn-pill-primary { border-radius: 8px; }\n*/\n',
      language: 'css',
      theme: 'uriel',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontLigatures: true,
      roundedSelection: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 12 },
      tabSize: 2,
      wordWrap: 'on',
      bracketPairColorization: { enabled: true },
      colorDecorators: true
    });
    /** @type {any} */
    let saveTimer = 0;
    cssEditorInstance.onDidChangeModelContent(() => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        localStorage.setItem('uriel_custom_css', cssEditorInstance.getValue());
        applyCustomStyles();
      }, 350);
    });
    cssEditorInstance.focus();
  }

  const btnOpenCssEditor = document.getElementById('btn-open-css-editor');
  if (btnOpenCssEditor) btnOpenCssEditor.addEventListener('click', openCssEditor);
  const btnCssClose = document.getElementById('btn-css-close');
  if (btnCssClose) btnCssClose.addEventListener('click', () => document.getElementById('css-editor').classList.add('hidden'));
  const btnCssClear = document.getElementById('btn-css-clear');
  if (btnCssClear) btnCssClear.addEventListener('click', () => {
    const current = localStorage.getItem('uriel_custom_css') || '';
    if (current.trim()) localStorage.setItem('uriel_custom_css_backup', current);
    if (cssEditorInstance) cssEditorInstance.setValue('');
    else { localStorage.removeItem('uriel_custom_css'); applyCustomStyles(); }
  });
  const btnCssRestore = document.getElementById('btn-css-restore');
  if (btnCssRestore) btnCssRestore.addEventListener('click', () => {
    const backup = localStorage.getItem('uriel_custom_css_backup');
    if (!backup) { showToast(Tm('Nothing to restore'), 'info'); return; }
    if (cssEditorInstance) cssEditorInstance.setValue(backup);
    else { localStorage.setItem('uriel_custom_css', backup); applyCustomStyles(); }
  });
  // for Ctrl+Shift+R (resetCustomStyling)
  function clearCssEditor() { if (cssEditorInstance) cssEditorInstance.setValue(''); }
  function stopAllPlugins() { pluginsCache.forEach((p) => { p.enabled = false; stopPlugin(p, true); }); }
};
