// @ts-check
// Moving rows by dragging them: playlists, custom presets, favourites, a playlist's songs and the queue. On
// phones a row moves by its grip (see canReorder and dragGrip in app.js). Part of app.js, which calls this once
// as it starts.
window.UrielApp = window.UrielApp || {};
/** @param {UrielAppDeps} deps */
window.UrielApp.reorder = function ({ el, getLibrarySort, getTrackSortMode, isPhoneApp, state, updateQueueBadge }) {
  /** @param {{ container: HTMLElement, itemSelector: string, setOrder: (fromIdx: number, toIdx: number) => void, canDragItem?: (item: HTMLElement) => boolean, isFilterActive?: () => boolean }} opts */
  function initListReordering({ container, itemSelector, setOrder, canDragItem, isFilterActive }) {
    if (!container) return;

    /** @type {HTMLElement | null} */
    let draggedItem = null;
    let startX = 0;
    let startY = 0;
    /** @type {number | null} */
    let activePointerId = null;
    let isDragging = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    /** @type {ReturnType<typeof setTimeout> | null} */
    let pressTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    /** @type {ReturnType<typeof setInterval> | null} */
    let autoScrollTimer = null;
    let suppressClick = false;
    let startIndex = -1;
    let targetIndex = -1;
    /** @type {{ el: HTMLElement, index: number, top: number, height: number }[]} */
    let itemMetrics = [];
    /** @type {HTMLElement[]} */
    let items = [];
    let draggedHeight = 0;
    let draggedStartTop = 0;
    let isTouch = false;
    // which drag a drop's delayed cleanup belongs to: a new drag can start inside its 160 ms
    let dragGen = 0;
    let lastClientY = 0;
    let startScroll = 0;

    // what really scrolls under the rows, found when a drag starts: the playlists list scrolls itself, inside a
    // drawer that doesn't, so holding a playlist at the list's edge used to scroll nothing
    /** @type {Element | null} */
    let scrollParent = null;
    const scrollerOf = () => {
      for (let n = /** @type {HTMLElement | null} */ (container); n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
      }
      return container.closest('.main-content, .rail-drawer') || container;
    };

    window.addEventListener('click', (e) => {
      if (suppressClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }, true);

    const startDrag = () => {
      if (!draggedItem || isDragging) return;
      dragGen++;
      isDragging = true;
      suppressClick = true;
      container._isDraggingReorder = true;
      try {
        if (activePointerId !== null && draggedItem.setPointerCapture) {
          draggedItem.setPointerCapture(activePointerId);
        }
      } catch (e) {}

      container.style.userSelect = 'none';
      draggedItem.classList.add('is-dragging');

      items = Array.from(/** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll(itemSelector))).filter(el => !canDragItem || canDragItem(el));
      startIndex = items.indexOf(draggedItem);
      targetIndex = startIndex;
      draggedHeight = draggedItem.offsetHeight;
      draggedStartTop = draggedItem.offsetTop;
      scrollParent = scrollerOf();
      startScroll = scrollParent.scrollTop;

      itemMetrics = items.map((el, i) => ({
        el,
        index: i,
        top: el.offsetTop,
        height: el.offsetHeight
      }));
    };

    const onPointerDown = (/** @type {PointerEvent} */ e) => {
      if (e.button !== 0) return;
      // a second finger must not hijack a row that is already being moved
      if (draggedItem && isDragging) return;
      if (pressTimer) clearTimeout(pressTimer);
      if (isFilterActive && isFilterActive()) return;

      const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(itemSelector));
      if (!item || item.parentElement !== container) return;
      if (canDragItem && !canDragItem(item)) return;

      if (/** @type {HTMLElement} */ (e.target).closest('button, input, select, textarea, .btn-icon-pill, .track-fav, .track-download-btn, .btn-rename-p, .btn-delete-p')) return;

      isTouch = e.pointerType === 'touch';
      if (isTouch && !/** @type {HTMLElement} */ (e.target).closest('.drag-grip')) return;
      draggedItem = item;
      startX = e.clientX;
      startY = e.clientY;
      lastClientY = e.clientY;
      activePointerId = e.pointerId;
      isDragging = false;

      if (isTouch) startDrag();
      else pressTimer = setTimeout(startDrag, 250);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (/** @type {PointerEvent} */ e) => {
      if (!draggedItem) return;

      if (e.pointerId !== activePointerId) return;
      if (!isDragging) {
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 7) {
          if (pressTimer) clearTimeout(pressTimer);
          startDrag();
        } else {
          return;
        }
      }

      lastClientY = e.clientY;
      if (scrollParent) {
        const scRect = scrollParent.getBoundingClientRect();
        if (autoScrollTimer) clearInterval(autoScrollTimer);
        // the list scrolls under a row held at its edge, and the row keeps up with it
        const by = e.clientY < scRect.top + 40 ? -8 : e.clientY > scRect.bottom - 40 ? 8 : 0;
        if (by) autoScrollTimer = setInterval(() => { if (scrollParent) scrollParent.scrollTop += by; placeDragged(); }, 16);
      }
      placeDragged();
    };

    const placeDragged = () => {
      if (!draggedItem || !isDragging) return;
      const dy = lastClientY - startY + (scrollParent ? scrollParent.scrollTop - startScroll : 0);
      draggedItem.style.transform = `translate3d(0, ${dy}px, 0) scale(1.02)`;

      if (itemMetrics.length <= 1) return;

      // its new place: after every other row whose middle it has passed. Taking the last row passed was right going
      // down but one place too high going up
      const currentCenter = draggedStartTop + (draggedHeight / 2) + dy;
      let newTarget = 0;
      for (const m of itemMetrics) {
        if (m.el !== draggedItem && currentCenter > m.top + m.height / 2) newTarget++;
      }

      if (newTarget !== targetIndex) {
        targetIndex = newTarget;
        const shiftDistance = (itemMetrics.length > 1 && Math.abs(itemMetrics[1].top - itemMetrics[0].top) > 0)
          ? Math.abs(itemMetrics[1].top - itemMetrics[0].top)
          : draggedHeight;

        itemMetrics.forEach(metric => {
          if (metric.el === draggedItem) return;
          if (startIndex < targetIndex) {
            if (metric.index > startIndex && metric.index <= targetIndex) {
              metric.el.style.transform = `translate3d(0, -${shiftDistance}px, 0)`;
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            } else {
              metric.el.style.transform = '';
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            }
          } else if (startIndex > targetIndex) {
            if (metric.index >= targetIndex && metric.index < startIndex) {
              metric.el.style.transform = `translate3d(0, ${shiftDistance}px, 0)`;
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            } else {
              metric.el.style.transform = '';
              metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
            }
          } else {
            metric.el.style.transform = '';
            metric.el.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
          }
        });
      }
    };

    const onPointerUp = (/** @type {PointerEvent} */ e) => {
      if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
      // the browser took the gesture over (it began a scroll): put the row back where it was
      if (e && e.type === 'pointercancel') targetIndex = startIndex;
      // where the finger left the screen: phones may not send a last move before it does
      else if (e && e.type === 'pointerup' && isDragging && draggedItem) { lastClientY = e.clientY; placeDragged(); }
      if (pressTimer) clearTimeout(pressTimer);
      if (autoScrollTimer) clearInterval(autoScrollTimer);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!draggedItem) return;

      const item = draggedItem;
      const currentActiveId = activePointerId;
      draggedItem = null;
      activePointerId = null;

      try {
        if (currentActiveId !== null && item.hasPointerCapture && item.hasPointerCapture(currentActiveId)) {
          item.releasePointerCapture(currentActiveId);
        }
      } catch (e) {}

      if (isDragging) {
        let targetSlotDy = 0;
        if (targetIndex >= 0 && targetIndex < itemMetrics.length && targetIndex !== startIndex) {
          targetSlotDy = itemMetrics[targetIndex].top - draggedStartTop;
        }

        item.style.transition = 'transform 160ms cubic-bezier(0.2, 0, 0, 1)';
        item.style.transform = `translate3d(0, ${targetSlotDy}px, 0) scale(1)`;

        // Long track lists are virtualised (renderTracks): `items` is only the rendered slice, so positions
        // in it are not positions in the list. Each row knows its real index; without this, a drag in a
        // scrolled list reordered two other songs and saved that.
        const absolute = (/** @type {number} */ i) => {
          const n = items[i] && items[i].dataset.trackIndex !== undefined ? Number(items[i].dataset.trackIndex) : NaN;
          return Number.isFinite(n) ? n : i;
        };
        const fromAbs = startIndex >= 0 ? absolute(startIndex) : -1;
        const toAbs = targetIndex >= 0 ? absolute(targetIndex) : -1;
        const sliceStart = (container._lastStartIndex || 0) > 0 ? (container._lastStartIndex || 0) : 0;
        // this drop's own values: a drag started within the 160 ms below replaces the shared ones
        const dropItems = items;
        const dropTarget = targetIndex;
        const dropStart = startIndex;
        const gen = dragGen;

        setTimeout(() => {
          if (dropTarget !== dropStart && dropTarget >= 0 && dropTarget < dropItems.length) {
            const targetItem = dropItems[dropTarget];
            if (dropTarget > dropStart) {
              targetItem.after(item);
            } else {
              targetItem.before(item);
            }
          }

          item.classList.remove('is-dragging');
          item.style.transform = '';
          item.style.transition = '';
          item.style.willChange = '';

          dropItems.forEach(el => {
            el.style.transform = '';
            el.style.transition = '';
          });

          container.style.userSelect = '';
          container.classList.add('no-enter-anim');

          /** @type {NodeListOf<HTMLElement>} */ (container.querySelectorAll('.track-row')).forEach((r, i) => {
            r.dataset.trackIndex = String(sliceStart + i);
            const num = r.querySelector('.track-row-index');
            if (num) num.textContent = String(sliceStart + i + 1);
          });

          if (fromAbs !== -1 && toAbs !== -1 && fromAbs !== toAbs) {
            setOrder(fromAbs, toAbs);
          }

          // the touchmove guard below reads this: left on, the list couldn't scroll until the next drag began.
          // Not when another drag has started since: that one is still moving
          if (gen === dragGen) {
            container._isDraggingReorder = false;
            isDragging = false;
          }
          setTimeout(() => { suppressClick = false; }, 80);
        }, 160);
      } else {
        suppressClick = false;
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    // once a held row is lifted the finger moves it, so the list must not scroll underneath
    container.addEventListener('touchmove', (e) => { if (isDragging) e.preventDefault(); }, { passive: false });
  }

  initListReordering({
    container: el.playlistsList,
    itemSelector: '.playlist-item',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.playlists.splice(fromIdx, 1);
      state.playlists.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    },
    // dragging moves playlists in the custom order: not while the list shows another order
    isFilterActive: () => getLibrarySort('playlists') !== 'custom'
  });

  initListReordering({
    container: el.presetsContainer,
    itemSelector: '.preset-chip',
    canDragItem: (chip) => chip.dataset.isCustom === 'true',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.customPresets.splice(fromIdx, 1);
      state.customPresets.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_custom_presets', JSON.stringify(state.customPresets));
    }
  });

  initListReordering({
    container: el.favoritesTracksList,
    itemSelector: '.track-row',
    isFilterActive: () => Boolean(el.favoritesSearchInput && el.favoritesSearchInput.value.trim()) || getTrackSortMode('favorites') !== 'manual',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.favorites.splice(fromIdx, 1);
      state.favorites.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_favorites', JSON.stringify(state.favorites));
      if (el.favoritesSubtitle) {
        el.favoritesSubtitle.textContent = `${state.favorites.length} songs saved`;
      }
    }
  });

  initListReordering({
    container: el.playlistTracksList,
    itemSelector: '.track-row',
    isFilterActive: () => Boolean(el.playlistSearchInput && el.playlistSearchInput.value.trim()) || getTrackSortMode('playlist') !== 'manual',
    setOrder: (fromIdx, toIdx) => {
      const pl = state.playlists.find((/** @type {UrielPlaylist} */ p) => p.id === state.currentPlaylistId);
      if (!pl || !pl.tracks) return;
      const [moved] = pl.tracks.splice(fromIdx, 1);
      pl.tracks.splice(toIdx, 0, moved);
      localStorage.setItem('devsize_playlists', JSON.stringify(state.playlists));
    }
  });

  // the queue too (Riff #248): the song playing keeps playing, wherever it is moved to
  initListReordering({
    container: el.queueTracksList,
    itemSelector: '.track-row',
    setOrder: (fromIdx, toIdx) => {
      const [moved] = state.queue.splice(fromIdx, 1);
      state.queue.splice(toIdx, 0, moved);
      const cur = state.queueIndex;
      if (fromIdx === cur) state.queueIndex = toIdx;
      else if (fromIdx < cur && toIdx >= cur) state.queueIndex--;
      else if (fromIdx > cur && toIdx <= cur) state.queueIndex++;
      // the rows carry their old positions: draw them again
      el.queueTracksList._renderedQueue = null;
      updateQueueBadge();
    }
  });
};
