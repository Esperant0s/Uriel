// @ts-check
// The chosen theme from the very first frame. app.js works the theme out only after start-up has waited for the
// library and the in-app server (over a second, longer on phones), and until then the page showed styles.css's
// default purple. app.js saves what it painted last (saveThemeBoot); this puts it back before anything is drawn.
// Runs at the top of <body>, after profiles-core.js, so it reads the open profile's copy.
(function () {
  const KEY = 'uriel_theme_boot';
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved || typeof saved !== 'object') return;
  const root = document.documentElement;
  const styleOf = (el, css) => {
    if (typeof css !== 'string' || !css) return;
    const tmp = document.createElement('div');
    tmp.style.cssText = css;
    for (let i = 0; i < tmp.style.length; i++) {
      const p = tmp.style[i];
      el.style.setProperty(p, tmp.style.getPropertyValue(p), tmp.style.getPropertyPriority(p));
    }
  };
  try {
    styleOf(root, saved.root);
    if (document.body && Array.isArray(saved.body)) for (const c of saved.body) if (typeof c === 'string') document.body.classList.add(c);
  } catch (e) {}
  // the background layers come later in the page
  if (!saved.mesh) return;
  const fill = () => {
    let done = true;
    for (const [id, css] of Object.entries(saved.mesh)) {
      const el = document.getElementById(id);
      if (!el) { done = false; continue; }
      if (!el.dataset.themeBoot) { el.dataset.themeBoot = '1'; styleOf(el, css); }
    }
    return done;
  };
  if (fill()) return;
  const mo = new MutationObserver(() => { if (fill()) mo.disconnect(); });
  mo.observe(root, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => mo.disconnect(), { once: true });
})();
