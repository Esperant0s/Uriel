// @ts-check
// The artist page (a banner with Play and Follow, About, Songs and Albums tabs, the chooser for artists who share a
// name) and following artists. Part of app.js, which calls this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps @param {UrielArtistPart} out */
window.UrielApp.artist = function ({ I18N, Lib, capMap, closeModal, el, escapeHtml, getBlocks, getCoverDominantColors, isPhoneApp, openAlbum, openModal, playTrack, renderFollowedArtists, renderTracks, safeArray, showToast, state, switchView, toggleBlockArtist }, out) {
  const artistBioCache = new Map();

  // ---- the artist page: a banner with Play and Follow, About (the whole bio in a dialog), Songs and Albums tabs ----
  // The page is looked up by the artist's channel when the track knows it (artistId, or the video it plays), so
  // same-named artists stay apart; albums come from /api/artist-albums, which keeps to the iTunes namesake that
  // released this artist's songs.
  const compactCount = (/** @type {number} */ n) => {
    try { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch (e) { return String(n); }
  };
  const ARTIST_TOP_SONGS = 5;
  let artistTracksExpanded = false;

  function setArtistTab(/** @type {string} */ tab, animate = true) {
    ['tracks', 'albums'].forEach((t) => {
      const btn = document.getElementById(`artist-tab-${t}`);
      const pane = document.getElementById(`artist-pane-${t}`);
      const on = t === tab;
      if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-selected', on ? 'true' : 'false'); }
      if (!pane) return;
      pane.classList.toggle('hidden', !on);
      pane.classList.toggle('active', on);
      if (on && animate) { pane.style.animation = 'none'; void pane.offsetWidth; pane.style.animation = ''; }
    });
  }
  ['tracks', 'albums'].forEach((t) => {
    const btn = document.getElementById(`artist-tab-${t}`);
    if (btn) btn.addEventListener('click', () => setArtistTab(t));
  });

  // album cards for the artist page and the Albums tab
  function renderAlbumCards(/** @type {HTMLElement} */ container, /** @type {UrielAlbum[]} */ albums, /** @type {(album: UrielAlbum) => string} */ subOf) {
    container.innerHTML = albums.map((/** @type {UrielAlbum} */ album) => {
      const sub = escapeHtml(subOf(album) || '');
      return `
        <div class="search-album-card" role="button" tabindex="0">
          <img class="search-album-cover" src="${escapeHtml(album.cover || '')}" alt="${escapeHtml(album.title || '')}" loading="lazy" decoding="async" />
          <div class="search-album-info">
            <span class="search-album-title" title="${escapeHtml(album.title || '')}">${escapeHtml(album.title || '')}</span>
            <span class="search-album-sub" title="${sub}">${sub}</span>
          </div>
        </div>`;
    }).join('');
    /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.search-album-card')).forEach((card, /** @type {number} */ idx) => {
      const album = albums[idx];
      if (!album) return;
      card.addEventListener('click', () => openAlbum(album));
      card.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAlbum(album);
        }
      });
    });
  }

  async function loadArtistAlbums(/** @type {string} */ artistQuery, /** @type {number} */ run) {
    const tabs = document.getElementById('artist-horiz-tabs');
    const grid = document.getElementById('artist-albums-grid');
    const countEl = document.getElementById('artist-albums-count');
    if (!grid) return;
    if (tabs) tabs.style.display = 'none';
    grid.innerHTML = '';
    if (countEl) countEl.textContent = '';
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist-albums?${artistQuery}`);
      const data = await res.json();
      if (run !== artistRunId) return;
      if (!data || !data.success || !Array.isArray(data.albums) || data.albums.length === 0) return;
      const albums = data.albums;
      renderAlbumCards(grid, albums, (/** @type {UrielAlbum} */ a) => String(a.year || ''));
      if (countEl) countEl.textContent = `${albums.length} album${albums.length === 1 ? '' : 's'}`;
      // the tabs only show once there is something besides songs
      if (tabs) tabs.style.display = '';
    } catch (e) {}
  }

  async function fetchArtistMatches(/** @type {string} */ name) {
    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist-matches?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      return (data && data.success && Array.isArray(data.artists)) ? data.artists : [];
    } catch (e) {
      return [];
    }
  }

  // other artists with the same name, so the right one is a tap away when the page shows a namesake
  async function showArtistMatches(/** @type {Promise<UrielArtist[]>} */ matchesPromise, /** @type {UrielArtist | null} */ artist, /** @type {string} */ name, /** @type {number} */ run) {
    const section = document.getElementById('artist-matches-section');
    const row = document.getElementById('artist-matches-row');
    if (!section || !row) return;
    const matches = await matchesPromise;
    if (run !== artistRunId) return;
    const shown = (artist && artist.ids) || [];
    const others = matches.filter((/** @type {UrielArtist} */ m) => !shown.includes(m.id));
    // opened by name, the page can't tell which namesake it shows: offer them once there are two
    if (!others.length || (!shown.length && others.length < 2)) return;
    const title = document.getElementById('artist-matches-title');
    if (title) I18N.text(title, shown.length ? 'Other artists named {0}' : 'Artists named {0}', name);
    row.innerHTML = others.map((/** @type {UrielArtist} */ m) => `
      <button class="fy-artist" type="button" title="${escapeHtml(m.subtitle || m.name)}">
        <img src="${escapeHtml(m.thumbnail || '')}" alt="" loading="lazy" decoding="async">
        <span>${escapeHtml(m.name)}</span>
        ${m.subtitle ? `<span class="fy-artist-name">${escapeHtml(m.subtitle)}</span>` : ''}
      </button>`).join('');
    row.querySelectorAll('.fy-artist').forEach((b, i) => b.addEventListener('click', () => openArtistProfile(others[i].name, { id: others[i].id })));
    section.style.display = '';
  }

  // the YouTube video a track plays, for tracks saved before they kept their artist's channel (artistId)
  function trackVideoId(/** @type {UrielTrack} */ track) {
    const m = String((track && track.url) || '').match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/);
    if (m) return m[1];
    return track && track.platform === 'youtube' && /^[\w-]{11}$/.test(String(track.id || '')) ? track.id : '';
  }

  function openTrackArtist(/** @type {UrielTrack} */ track) {
    if (track && track.artist) openArtistProfile(track.artist, { id: track.artistId, video: trackVideoId(track) });
  }

  // About: four lines of the bio; "Show all" opens the whole of it
  function setArtistBio(/** @type {string} */ text) {
    const card = document.getElementById('artist-about-card');
    const more = document.getElementById('btn-artist-bio-more');
    const bioEl = el.artistProfileBio;
    if (!bioEl) return;
    bioEl.textContent = text || '';
    bioEl.classList.remove('fade-end');
    if (card) card.classList.toggle('hidden', !text);
    if (more) more.classList.add('hidden');
    if (!text) return;
    requestAnimationFrame(() => {
      const over = bioEl.scrollHeight > bioEl.clientHeight + 1;
      bioEl.classList.toggle('fade-end', over);
      if (more) more.classList.toggle('hidden', !over);
    });
  }
  const artistBioModal = document.getElementById('artist-bio-modal');
  const btnArtistBioMore = document.getElementById('btn-artist-bio-more');
  if (btnArtistBioMore && artistBioModal) {
    btnArtistBioMore.addEventListener('click', () => {
      const t = document.getElementById('artist-bio-modal-title');
      const b = document.getElementById('artist-bio-modal-body');
      if (t) t.textContent = (state.currentArtistData && state.currentArtistData.name) || (el.artistProfileName ? el.artistProfileName.textContent : '') || 'Artist';
      if (b) b.textContent = el.artistProfileBio ? el.artistProfileBio.textContent : '';
      openModal(artistBioModal);
    });
    // the cut-off bio itself opens it too
    if (el.artistProfileBio) el.artistProfileBio.addEventListener('click', () => { if (!btnArtistBioMore.classList.contains('hidden')) btnArtistBioMore.click(); });
    const btnCloseBio = document.getElementById('btn-close-artist-bio');
    if (btnCloseBio) btnCloseBio.addEventListener('click', () => closeModal(artistBioModal));
    artistBioModal.addEventListener('click', (e) => { if (e.target === artistBioModal) closeModal(artistBioModal); });
  }

  // the banner (YouTube Music's wide header picture, or the artist's picture), tinted by its colours
  function setArtistHero(/** @type {string} */ banner, /** @type {string} */ avatar, /** @type {number} */ run) {
    const hero = el.artistHero;
    const img = el.artistHeroImg;
    if (img) {
      img.onerror = null;
      if (banner || avatar) {
        img.onerror = () => {
          if (avatar && img.src !== avatar) img.src = avatar;
          else { img.onerror = null; img.style.display = 'none'; }
        };
        img.src = banner || avatar;
        img.style.display = 'block';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
    }
    const fallback = 'var(--md-sys-color-primary-container)';
    const setAccent = (/** @type {string} */ c) => {
      if (hero) hero.style.setProperty('--artist-accent-color', c);
      document.documentElement.style.setProperty('--artist-accent-color', c);
    };
    if (!(banner || avatar)) { setAccent(fallback); return; }
    getCoverDominantColors(avatar || banner).then((/** @type {string[]} */ [domColor]) => {
      if (run === artistRunId && state.currentView === 'artist') setAccent(domColor || fallback);
    }).catch(() => setAccent(fallback));
  }

  function setArtistFans(/** @type {UrielArtist | null} */ artist) {
    const line = el.artistFansLine;
    if (!line) return;
    const text = (artist && (artist.fansText || (artist.fans && artist.fans > 0 ? `${compactCount(artist.fans)} fans` : ''))) || '';
    line.textContent = text;
    line.style.display = text ? '' : 'none';
  }

  // Popular songs: the top five, "Show all" for the rest. Playing one plays them all, in this order.
  function renderArtistTracks() {
    const all = (state.currentArtistData && state.currentArtistData.tracks) || [];
    const btn = document.getElementById('btn-artist-tracks-toggle');
    if (btn) {
      btn.classList.toggle('hidden', all.length <= ARTIST_TOP_SONGS);
      btn.textContent = artistTracksExpanded ? 'Show less' : 'Show all';
    }
    if (el.artistTracksList) renderTracks(el.artistTracksList, artistTracksExpanded ? all : all.slice(0, ARTIST_TOP_SONGS), 'artist');
  }
  const btnArtistTracksToggle = document.getElementById('btn-artist-tracks-toggle');
  if (btnArtistTracksToggle) {
    btnArtistTracksToggle.addEventListener('click', () => {
      artistTracksExpanded = !artistTracksExpanded;
      renderArtistTracks();
    });
  }
  if (el.btnPlayArtistTracks) {
    el.btnPlayArtistTracks.addEventListener('click', () => {
      const all = (state.currentArtistData && state.currentArtistData.tracks) || [];
      if (all.length) playTrack(all[0], [...all], 0, 'artist');
    });
  }

  // ---- following artists: "Your artists" on the home page, the same on every linked device (sync.js) ----
  const FOLLOWED_ARTISTS_KEY = 'uriel_followed_artists';
  const getFollowedArtists = () => safeArray(FOLLOWED_ARTISTS_KEY);
  function setFollowedArtists(/** @type {{ name: string, [field: string]: unknown }[]} */ list) {
    try { localStorage.setItem(FOLLOWED_ARTISTS_KEY, JSON.stringify(list)); } catch (e) {}
    renderFollowedArtists();
  }
  // who the page shows: { name, id, ids, avatar, fans }; the name the page was opened with until it loads
  /** @type {{ name: string, id: string, [field: string]: unknown } | null} */
  let artistOnPage = null;
  function updateFollowButton() {
    updateArtistBlockButton();
    const btn = document.getElementById('btn-artist-follow');
    if (!btn) return;
    const on = !!artistOnPage && Lib.isArtistFollowed(getFollowedArtists(), artistOnPage);
    btn.classList.toggle('following', on);
    I18N.text(btn, on ? 'Following' : 'Follow');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const btnArtistFollow = document.getElementById('btn-artist-follow');
  if (btnArtistFollow) {
    btnArtistFollow.addEventListener('click', () => {
      if (!artistOnPage) return;
      const r = Lib.toggleFollowArtist(getFollowedArtists(), artistOnPage);
      setFollowedArtists(/** @type {{ name: string }[]} */ (r.list));
      updateFollowButton();
      showToast(r.followed ? `Following ${artistOnPage.name}` : `Unfollowed ${artistOnPage.name}`, 'info');
    });
  }

  function updateArtistBlockButton() {
    const btn = document.getElementById('btn-artist-block');
    if (!btn) return;
    const on = !!artistOnPage && Lib.isArtistBlocked(getBlocks().artists, artistOnPage.name);
    btn.classList.toggle('blocked', on);
    I18N.text(btn, on ? 'Blocked' : 'Block');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const btnArtistBlock = document.getElementById('btn-artist-block');
  if (btnArtistBlock) btnArtistBlock.addEventListener('click', () => { if (artistOnPage) toggleBlockArtist(artistOnPage.name); });

  let artistRunId = 0;
  // `id` (the artist's channel) or `video` (a video of theirs) tells artists with the same name apart;
  // a name alone opens the best-known namesake, and the page offers the others
  async function openArtistProfile(/** @type {string} */ artistName, { id = '', video = '' } = {}) {
    if (!artistName || !artistName.trim()) return;
    const cleanName = artistName.replace(/ - Topic|VEVO|Official|Records/gi, '').trim();
    // a slow reply for an artist opened earlier must not replace the one opened since
    const run = ++artistRunId;
    const artistQuery = `name=${encodeURIComponent(cleanName)}${id ? `&id=${encodeURIComponent(id)}` : video ? `&video=${encodeURIComponent(video)}` : ''}`;

    // from one artist to another (a namesake), Back still returns to where the first was opened from
    if (state.currentView !== 'artist') state.previousView = state.currentView;
    switchView('artist');
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
    state.currentArtistData = null;
    artistTracksExpanded = false;
    setArtistTab('tracks', false);
    loadArtistAlbums(artistQuery, run);
    const matches = fetchArtistMatches(cleanName);
    const matchesSection = document.getElementById('artist-matches-section');
    if (matchesSection) matchesSection.style.display = 'none';

    artistOnPage = { name: cleanName, id: id || '' };
    updateFollowButton();
    if (el.artistProfileName) el.artistProfileName.textContent = cleanName;
    setArtistBio('');
    setArtistFans(null);
    setArtistHero('', '', run);
    if (el.artistTracksCount) el.artistTracksCount.textContent = '';
    if (el.btnPlayArtistTracks) el.btnPlayArtistTracks.disabled = true;
    const tracksToggle = document.getElementById('btn-artist-tracks-toggle');
    if (tracksToggle) tracksToggle.classList.add('hidden');
    if (el.artistVerifiedBadge) el.artistVerifiedBadge.classList.add('hidden');
    if (el.artistTracksList) el.artistTracksList.innerHTML = '<div class="empty-hint" data-i18n>Fetching official releases...</div>';

    // with only a video to go by, the server works out which artist it is: no cached bio of a namesake meanwhile
    const bioCacheKey = id || (video ? '' : cleanName.toLowerCase());
    let bioFromCache = false;
    if (bioCacheKey && artistBioCache.has(bioCacheKey)) {
      const cached = artistBioCache.get(bioCacheKey);
      if (cached) {
        bioFromCache = true;
        setArtistBio(cached);
      }
    }

    const bioController = new AbortController();
    const bioTimeout = setTimeout(() => bioController.abort(), 8000);

    try {
      const res = await fetch(`http://127.0.0.1:${state.serverPort}/api/artist?${artistQuery}`, { signal: bioController.signal });
      clearTimeout(bioTimeout);
      const data = await res.json();
      if (run !== artistRunId) return;

      if (!data.success || !data.artist) throw new Error('Artist not found');

      const artist = data.artist;
      state.currentArtistData = artist;
      if (el.artistProfileName) el.artistProfileName.textContent = artist.name;
      showArtistMatches(matches, artist, cleanName, run);

      // follow by the channel when the page has one; a followed entry learns the picture and the channel
      artistOnPage = { name: artist.name || cleanName, id: artist.id || id || '', ids: artist.ids || [], avatar: artist.avatar || '', fans: artist.fans || 0 };
      const refreshed = Lib.refreshFollowed(getFollowedArtists(), artistOnPage);
      if (refreshed.changed) setFollowedArtists(/** @type {{ name: string }[]} */ (refreshed.list));
      updateFollowButton();

      if (!bioFromCache) {
        const cleanBio = String(artist.bio || '').replace(/<[^>]*>/g, '').trim();
        artistBioCache.set(artist.id || cleanName.toLowerCase(), cleanBio);
        capMap(artistBioCache, 100);
        setArtistBio(cleanBio);
      }

      if (el.artistVerifiedBadge) el.artistVerifiedBadge.classList.toggle('hidden', !artist.isVerified);
      setArtistFans(artist);
      setArtistHero(artist.banner || '', artist.avatar || '', run);

      const tracks = artist.tracks || [];
      if (el.artistTracksCount) el.artistTracksCount.textContent = tracks.length ? `${tracks.length} songs` : '';
      if (el.btnPlayArtistTracks) el.btnPlayArtistTracks.disabled = tracks.length === 0;
      requestAnimationFrame(() => {
        if (run !== artistRunId) return;
        if (tracks.length) renderArtistTracks();
        else if (el.artistTracksList) el.artistTracksList.innerHTML = '<div class="empty-hint">No tracks found for this artist.</div>';
      });
    } catch (e) {
      clearTimeout(bioTimeout);
      if (run !== artistRunId) return;
      console.warn('Artist load error:', e);
      showArtistMatches(matches, null, cleanName, run);
      setArtistHero('', '', run);
      if (!bioFromCache) setArtistBio('');
      if (el.artistTracksList) el.artistTracksList.innerHTML = '<div class="empty-hint" data-i18n>No tracks found for this artist.</div>';
    }
  }



  if (el.btnBackArtist) {
    el.btnBackArtist.onclick = (/** @type {MouseEvent} */ e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = (state.previousView && state.previousView !== 'artist') ? state.previousView : 'discover';
      switchView(target);
    };
  }

  if (el.btnBackAlbum) {
    el.btnBackAlbum.onclick = (/** @type {MouseEvent} */ e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = (state.previousView && state.previousView !== 'album') ? state.previousView : 'discover';
      switchView(target);
    };
  }

  if (el.playbarArtist) {
    el.playbarArtist.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      // On phones the mini player opens Now Playing wherever it's tapped (mobile-ui.ts); the artist is a tap away
      // there. The line spans the whole bar, so only the name itself opens the artist: a tap just under a short
      // title used to.
      if (isPhoneApp && !document.body.classList.contains('np-open')) return;
      const name = document.createRange();
      name.selectNodeContents(el.playbarArtist);
      const box = name.getBoundingClientRect();
      if (box.width && (e.clientX < box.left - 4 || e.clientX > box.right + 4)) return;
      e.stopPropagation();
      if (state.currentTrack && state.currentTrack.artist) {
        openTrackArtist(state.currentTrack);
      }
    });
  }

  if (el.rightPanelArtist) {
    el.rightPanelArtist.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      e.stopPropagation();
      if (state.currentTrack && state.currentTrack.artist) {
        openTrackArtist(state.currentTrack);
      }
    });
  }

  /** @type {UrielArtistPart} */
  const api = {
    compactCount, getFollowedArtists, setFollowedArtists, openArtistProfile, openTrackArtist, renderAlbumCards,
    updateFollowButton, updateArtistBlockButton,
  };
  Object.assign(out, api);
};
