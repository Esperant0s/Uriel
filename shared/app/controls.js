// @ts-check
// How Settings' controls look: tick marks under the sliders and the switches' thumbs, kept up to date as
// settings are drawn. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.controls = function ({ addsElements }) {
  function addSliderTicks(/** @type {HTMLInputElement} */ input) {
    const item = input.closest('.setting-item') || input.parentElement;
    const hints = item ? item.querySelector('.setting-hints') : null;
    const spans = hints ? [...hints.querySelectorAll('span')].map(s => s.textContent) : [];
    const min = +input.min, max = +input.max, step = +input.step || 1;
    const def = Number(input.getAttribute('value'));
    /** @type {Record<number, string | null>} */
    const labels = {};
    if (spans.length === 3) { labels[min] = spans[0]; labels[def] = spans[1]; labels[max] = spans[2]; }
    else if (spans.length === 2) { labels[min] = spans[0]; labels[max] = spans[1]; }
    const wrap = document.createElement('div'); wrap.className = 'slider-ticks';
    for (let v = min; v <= max; v += step) {
      const t = document.createElement('i'); t.style.setProperty('--p', String((v - min) / (max - min)));
      if (labels[v] != null) { t.className = 'major'; const s = document.createElement('span'); s.textContent = labels[v]; s.dataset.i18n = ''; t.appendChild(s); }
      wrap.appendChild(t);
    }
    const host = input.closest('.sl') || input;
    host.insertAdjacentElement('afterend', wrap);
    if (hints) hints.remove();
  }

  const scaleInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settings-slider-scale'));
  if (scaleInput) addSliderTicks(scaleInput);
  /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#view-settings .pill-range')).forEach((input) => {
    if (input === scaleInput) return;
    const item = input.closest('.setting-item') || input.parentElement;
    const hints = item ? item.querySelector('.setting-hints') : null;
    if (!hints) return;
    const min = +input.min, max = +input.max, step = +input.step || 1;
    if ((max - min) / step <= 20) {
      addSliderTicks(input);
    }
  });

  function decorateSwitches() {
    document.querySelectorAll('.effect-switch-btn .thumb:not(.has-icon)').forEach((t) => {
      t.classList.add('has-icon');
      t.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sw-icon"/></svg>';
    });
  }
  let swRaf = 0;
  new MutationObserver((muts) => { if (swRaf || !addsElements(muts)) return; swRaf = requestAnimationFrame(() => { swRaf = 0; decorateSwitches(); }); }).observe(document.body, { childList: true, subtree: true });
  decorateSwitches();
};
