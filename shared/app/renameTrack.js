// @ts-check
// Renaming the playing song: its title and artist, everywhere the song is kept. Part of app.js, which calls
// this once as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.renameTrack = function ({ closeModal, el, openModal, renderQueueView, sendStateToServer, showToast, state, Tm, updateMediaSession, updateNowPlayingUI }) {
  function openTrackRenameDialog() {
    const currentTitle = state.currentTrack?.title || '';
    const currentArtist = state.currentTrack?.artist || '';

    if (el.inputRenameTitle) el.inputRenameTitle.value = currentTitle;
    if (el.inputRenameArtist) el.inputRenameArtist.value = currentArtist;
    if (el.renameTrackModal) openModal(el.renameTrackModal);
    if (el.inputRenameTitle) el.inputRenameTitle.focus();
  }

  if (el.btnEditCurrentTrack) el.btnEditCurrentTrack.addEventListener('click', openTrackRenameDialog);
  if (el.btnCancelRenameTrack) el.btnCancelRenameTrack.addEventListener('click', () => closeModal(el.renameTrackModal));

  if (el.btnConfirmRenameTrack) {
    el.btnConfirmRenameTrack.addEventListener('click', () => {
      const newTitle = el.inputRenameTitle ? el.inputRenameTitle.value.trim() || 'Untitled song' : 'Untitled song';
      const newArtist = el.inputRenameArtist ? el.inputRenameArtist.value.trim() || 'Unknown artist' : 'Unknown artist';

      // the artist's channel stays with the artist it came with, not with a name typed over it
      const artistChanged = !!state.currentTrack && state.currentTrack.artist !== newArtist;
      if (state.currentTrack) {
        state.currentTrack.title = newTitle;
        state.currentTrack.artist = newArtist;
        if (artistChanged) delete state.currentTrack.artistId;
      }

      if (state.currentTrack) updateNowPlayingUI(state.currentTrack);

      const updateArr = (/** @type {UrielTrack[]} */ arr) => {
        let updated = false;
        arr.forEach((/** @type {UrielTrack} */ t) => {
          if (t.id === state.currentTrack?.id) {
            t.title = newTitle;
            t.artist = newArtist;
            if (artistChanged) delete t.artistId;
            updated = true;
          }
        });
        return updated;
      };

      if (updateArr(state.history)) localStorage.setItem('devsize_history', JSON.stringify(state.history));
      if (updateArr(state.favorites)) localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (updateArr(state.queue)) renderQueueView();

      sendStateToServer();
      updateMediaSession();

      if (el.renameTrackModal) closeModal(el.renameTrackModal);
      showToast(Tm('Song info updated'), 'info');
    });
  }
};
