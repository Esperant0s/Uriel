// @ts-check
// Putting your own CSS (from the CSS editor) on the page, and Ctrl+Shift+R to turn it and every plugin off. Part of
// app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielThemesPart} out */
window.UrielApp.themes = function ({ Tm, showToast, refreshCachedThemeColors, clearCssEditor, stopAllPlugins, renderPluginCards }, out) {
  function applyCustomStyles() {
    document.querySelectorAll('style[data-uriel-custom]').forEach((n) => n.remove());
    const userCss = localStorage.getItem('uriel_custom_css') || '';
    if (userCss.trim()) {
      const s = document.createElement('style');
      s.dataset.urielCustom = 'user';
      s.textContent = userCss;
      document.head.appendChild(s);
    }
    if (typeof refreshCachedThemeColors === 'function') refreshCachedThemeColors();
  }

  function resetCustomStyling() {
    const userCss = localStorage.getItem('uriel_custom_css') || '';
    if (userCss.trim()) localStorage.setItem('uriel_custom_css_backup', userCss);
    localStorage.removeItem('uriel_custom_css');
    clearCssEditor();
    if (window.electronAPI && window.electronAPI.disableAllPlugins) window.electronAPI.disableAllPlugins();
    stopAllPlugins();
    renderPluginCards();
    applyCustomStyles();
    showToast(Tm('Custom CSS and plugins reset (Ctrl+Shift+R)'), 'info');
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyR') {
      e.preventDefault();
      e.stopPropagation();
      resetCustomStyling();
    }
  }, true);

  /** @type {UrielThemesPart} */
  const api = { applyCustomStyles };
  Object.assign(out, api);
};
