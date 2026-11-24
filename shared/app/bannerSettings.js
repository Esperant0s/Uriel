// @ts-check
// Settings → the banner behind Now playing and playlists: your own picture or video for it, its blur, opacity,
// fade and how it fits. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.bannerSettings = function ({ applyBannerFit, getTrackThumbUrl, savedBannerBlur, savedBannerFade, savedBannerFit, savedBannerOpacity, state, updatePlaylistDetailBanner, updateRightPanelBanner }) {
  const btnChooseBannerMedia = document.getElementById('btn-choose-banner-media');
  const btnResetBannerMedia = document.getElementById('btn-reset-banner-media');

  if (btnChooseBannerMedia) {
    btnChooseBannerMedia.addEventListener('click', async () => {
      if (window.electronAPI && window.electronAPI.pickMedia) {
        const url = await window.electronAPI.pickMedia();
        if (url) {
          localStorage.setItem('uriel_banner_media', url);
          const thumb = getTrackThumbUrl(state.currentTrack);
          updateRightPanelBanner(thumb);
          updatePlaylistDetailBanner(thumb);
        }
      }
    });
  }

  if (btnResetBannerMedia) {
    btnResetBannerMedia.addEventListener('click', () => {
      localStorage.removeItem('uriel_banner_media');
      const thumb = getTrackThumbUrl(state.currentTrack);
      updateRightPanelBanner(thumb);
      updatePlaylistDetailBanner(thumb);
    });
  }

  const sliderBannerBlur = /** @type {HTMLInputElement} */ (document.getElementById('slider-banner-blur'));
  const valBannerBlur = document.getElementById('val-banner-blur');
  if (sliderBannerBlur) {
    sliderBannerBlur.value = String(savedBannerBlur);
    if (valBannerBlur) valBannerBlur.textContent = `${savedBannerBlur}px`;
    sliderBannerBlur.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      document.documentElement.style.setProperty('--banner-blur', `${v}px`);
      if (valBannerBlur) valBannerBlur.textContent = `${v}px`;
      localStorage.setItem('uriel_banner_blur', v.toString());
    });
  }

  const sliderBannerOpacity = /** @type {HTMLInputElement} */ (document.getElementById('slider-banner-opacity'));
  const valBannerOpacity = document.getElementById('val-banner-opacity');
  if (sliderBannerOpacity) {
    sliderBannerOpacity.value = String(savedBannerOpacity);
    if (valBannerOpacity) valBannerOpacity.textContent = `${savedBannerOpacity}%`;
    sliderBannerOpacity.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      document.documentElement.style.setProperty('--banner-opacity', `${v / 100}`);
      if (valBannerOpacity) valBannerOpacity.textContent = `${v}%`;
      localStorage.setItem('uriel_banner_opacity', v.toString());
    });
  }

  const sliderBannerFade = /** @type {HTMLInputElement} */ (document.getElementById('slider-banner-fade'));
  const valBannerFade = document.getElementById('val-banner-fade');
  if (sliderBannerFade) {
    sliderBannerFade.value = String(savedBannerFade);
    if (valBannerFade) valBannerFade.textContent = `${savedBannerFade}%`;
    sliderBannerFade.addEventListener('input', (e) => {
      const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
      document.documentElement.style.setProperty('--banner-fade-base', `${v}%`);
      document.documentElement.style.setProperty('--banner-fade-end', `${v}%`);
      const rightBanner = document.getElementById('right-panel-banner');
      if (rightBanner) {
        rightBanner.style.setProperty('--banner-fade-base', `${v}%`);
        rightBanner.style.setProperty('--banner-fade-end', `${v}%`);
      }
      if (valBannerFade) valBannerFade.textContent = `${v}%`;
      localStorage.setItem('uriel_banner_fade', v.toString());
    });
  }


  const selectBannerFit = /** @type {HTMLSelectElement} */ (document.getElementById('select-banner-fit'));
  const bannerFitDropdown = document.getElementById('banner-fit-dropdown');
  const bannerFitTrigger = document.getElementById('banner-fit-trigger');
  const bannerFitLabel = document.getElementById('banner-fit-label');
  const bannerFitMenu = document.getElementById('banner-fit-menu');

  if (selectBannerFit) {
    selectBannerFit.value = savedBannerFit;
  }

  if (bannerFitDropdown && bannerFitTrigger && bannerFitMenu) {
    const curFit = savedBannerFit || 'zoom';
    if (bannerFitLabel) {
      bannerFitLabel.textContent = curFit.charAt(0).toUpperCase() + curFit.slice(1);
    }
    /** @type {NodeListOf<HTMLElement>} */ (bannerFitMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.classList.toggle('selected', opt.dataset.value === curFit);
    });

    bannerFitTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      bannerFitDropdown.classList.toggle('open');
    });

    /** @type {NodeListOf<HTMLElement>} */ (bannerFitMenu.querySelectorAll('.m3-dropdown-option')).forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        localStorage.setItem('uriel_banner_fit', String(val));
        applyBannerFit(val || '');
        if (bannerFitLabel) bannerFitLabel.textContent = opt.textContent;
        bannerFitMenu.querySelectorAll('.m3-dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        if (selectBannerFit) selectBannerFit.value = String(val);
        bannerFitDropdown.classList.remove('open');
      });
    });

    document.addEventListener('click', () => {
      bannerFitDropdown.classList.remove('open');
    });
  }
};
