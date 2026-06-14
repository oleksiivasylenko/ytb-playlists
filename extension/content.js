(function() {
  if (window.__ytPlaylistAltContentReady) return;
  window.__ytPlaylistAltContentReady = true;

  document.getElementById('yt-playlist-alt-toggle')?.remove();
  document.getElementById('yt-playlist-alt-panel')?.remove();
  document.getElementById('yt-qs-wrapper')?.remove();
  document.getElementById('yt-qs-dropdown')?.remove();
  document.getElementById('ytb-actions-wrapper')?.remove();
  document.getElementById('ytb-ask-panel')?.remove();

  let extensionContextAlive = true;
  let quickSaveObserver = null;
  let quickSaveObserverDebounce = null;
  let videoWatchTimerId = null;
  let runtimeWatchdogId = null;
  let watchControlsWatchdogId = null;
  let fullscreenWatchdogId = null;
  let watchControlsEventsController = null;
  let fullscreenEventsController = null;
  const watchControlsRetryIds = new Set();
  let panelApi = null;
  let activePlaylistSync = null;
  let activeCommentsSync = null;
  let lastFullscreenState = false;
  const ytbPreview = window.ytbPreview.create({ id: 'ytb-actions-preview', maxWidth: 520, minWidth: 300, positionMode: 'document' });
  const externalLinkIcon = '<svg class="yt-summary-external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"></path><path d="M21 3l-9 9"></path><path d="M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path></svg>';
  const SYNC_PROGRESS_STATUS_KEY = 'playlist-sync-progress';
  const SYNC_CLEANUP_STATUS_KEY = 'playlist-sync-cleanup-progress';
  const YOUTUBE_CLEANUP_REVIEW_PROMPT_KEY = 'youtubeCleanupReviewPrompt';
  const SYNC_MAX_DURATION_MS = 20 * 60 * 1000;
  const SYNC_IDLE_TIMEOUT_MS = 75 * 1000;
  const SYNC_MISMATCH_IDLE_ROUNDS = 10;
  const COMMENTS_SYNC_MAX_DURATION_MS = 3 * 60 * 1000;
  const COMMENTS_SYNC_IDLE_TIMEOUT_MS = 18 * 1000;
  const COMMENTS_SYNC_PROGRESS_WAIT_MS = 6500;
  const COMMENTS_SYNC_PROGRESS_POLL_MS = 500;

  const {
    extractVideoIdFromUrl,
    parseDurationText,
    normalizeDomText,
    isUsablePlaylistTitle,
    removeDurationFromAriaLabel,
    getNodeText,
    getTitleNodeText,
    getPlaylistEntryTitle,
    getPlaylistEntryAuthor,
    getCurrentPlaylistPageSourceId,
    getYoutubePlaylistSource,
    getExpectedPlaylistVideoCount,
    getScrollMetrics,
    scrollToPosition,
    collectLoadedPlaylistEntries,
    collectLoadedPlaylistVideos,
    getVisibleMenuButton,
    getVisibleMenuItems,
    isRemoveMenuText,
    parseCompactCount,
    getExpectedCommentCount,
    collectLoadedComments,
    findCommentsSection,
    getHiddenReplyCount,
    getLoadedCommentCount,
    getCommentSyncStats,
    formatCommentsCount,
    getCurrentVideoTitleFromPage,
    getCurrentVideoAuthorFromPage,
    getVideoIdFromUrl,
    truncate
  } = window.ytbContentDom;

  function isExtensionContextError(error) {
    const message = String(error && (error.message || error) || '');
    return message.includes('Extension context invalidated') ||
      message.includes('Extension context was invalidated') ||
      message.includes('context invalidated');
  }

  function disableInvalidatedContentScript() {
    if (!extensionContextAlive) return;
    extensionContextAlive = false;
    window.__ytPlaylistAltContentReady = false;

    if (quickSaveObserverDebounce) {
      clearTimeout(quickSaveObserverDebounce);
      quickSaveObserverDebounce = null;
    }
    if (videoWatchTimerId) {
      clearInterval(videoWatchTimerId);
      videoWatchTimerId = null;
    }
    if (runtimeWatchdogId) {
      clearInterval(runtimeWatchdogId);
      runtimeWatchdogId = null;
    }
    if (watchControlsWatchdogId) {
      clearInterval(watchControlsWatchdogId);
      watchControlsWatchdogId = null;
    }
    if (fullscreenWatchdogId) {
      clearInterval(fullscreenWatchdogId);
      fullscreenWatchdogId = null;
    }
    watchControlsRetryIds.forEach(id => clearTimeout(id));
    watchControlsRetryIds.clear();
    if (watchControlsEventsController) {
      watchControlsEventsController.abort();
      watchControlsEventsController = null;
    }
    if (fullscreenEventsController) {
      fullscreenEventsController.abort();
      fullscreenEventsController = null;
    }
    if (quickSaveObserver) {
      quickSaveObserver.disconnect();
      quickSaveObserver = null;
    }
    removeVideoPlayListeners();
    if (panelApi) {
      panelApi.cleanup();
      panelApi = null;
    }

    stopActiveCommentsSync('Comment sync stopped.', { silent: true });
    ytbPreview.destroy();
    document.getElementById('yt-playlist-alt-toggle')?.remove();
    document.getElementById('yt-playlist-alt-panel')?.remove();
    document.getElementById('yt-qs-wrapper')?.remove();
    document.getElementById('yt-qs-dropdown')?.remove();
    document.getElementById('ytb-actions-wrapper')?.remove();
    document.getElementById('ytb-ask-panel')?.remove();
  }

  function cleanupContentScript() {
    disableInvalidatedContentScript();
  }

  function handleExtensionContextError(error) {
    if (!isExtensionContextError(error)) return false;
    disableInvalidatedContentScript();
    return true;
  }

  function logContentError(message, error) {
    if (handleExtensionContextError(error)) return;
    console.error(message, error);
  }

  function safeStorageSet(payload) {
    if (!extensionContextAlive) return;
    try {
      chrome.storage.local.set(payload, () => {
        try {
          const error = chrome.runtime && chrome.runtime.lastError;
          if (error) handleExtensionContextError(error);
        } catch (error) {
          handleExtensionContextError(error);
        }
      });
    } catch (error) {
      handleExtensionContextError(error);
    }
  }

  function safeStorageGet(keys, callback) {
    if (!extensionContextAlive) return;
    try {
      chrome.storage.local.get(keys, (res) => {
        let error = null;
        try {
          error = chrome.runtime && chrome.runtime.lastError;
        } catch (err) {
          error = err;
        }

        if (error) {
          if (!handleExtensionContextError(error)) callback({});
          return;
        }
        callback(res || {});
      });
    } catch (error) {
      if (!handleExtensionContextError(error)) callback({});
    }
  }

  function safeStorageGetAsync(keys) {
    return new Promise(resolve => safeStorageGet(keys, resolve));
  }

  function safeRuntimeOnMessage(listener) {
    if (!extensionContextAlive) return;
    try {
      chrome.runtime.onMessage.addListener(listener);
    } catch (error) {
      handleExtensionContextError(error);
    }
  }

  window.addEventListener('error', (event) => {
    if (!handleExtensionContextError(event.error || event.message)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (!handleExtensionContextError(event.reason)) return;
    event.preventDefault();
  });

  window.addEventListener('pagehide', event => {
    if (!event.persisted) cleanupContentScript();
  });
  window.addEventListener('beforeunload', cleanupContentScript);

  runtimeWatchdogId = setInterval(() => {
    if (!extensionContextAlive) return;
    try {
      void chrome.runtime.id;
    } catch (error) {
      handleExtensionContextError(error);
    }
  }, 1000);

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function createSyncStopError(message, options = {}) {
    const error = new Error(message || 'Sync stopped.');
    error.isSyncStop = true;
    error.shouldFailRun = options.shouldFailRun !== false;
    return error;
  }

  function startSyncContext(source = null) {
    const now = Date.now();
    const context = {
      cancelled: false,
      cancelMessage: '',
      sourceId: source && source.sourceId ? source.sourceId : getCurrentPlaylistPageSourceId(),
      startedAt: now,
      deadlineAt: now + SYNC_MAX_DURATION_MS,
      lastProgressAt: now
    };
    activePlaylistSync = context;
    return context;
  }

  function stopActivePlaylistSync(message = 'Sync stopped.') {
    if (!activePlaylistSync || activePlaylistSync.cancelled) return false;
    activePlaylistSync.cancelled = true;
    activePlaylistSync.cancelMessage = message;
    return true;
  }

  function assertSyncCanContinue(context) {
    if (!context || activePlaylistSync !== context) {
      throw createSyncStopError('Sync stopped.');
    }

    if (context.cancelled) {
      throw createSyncStopError(context.cancelMessage || 'Sync stopped.', { shouldFailRun: false });
    }

    const currentSourceId = getCurrentPlaylistPageSourceId();
    if (!currentSourceId) {
      throw createSyncStopError('Sync stopped because this tab left the YouTube playlist page.');
    }

    if (context.sourceId && currentSourceId !== context.sourceId) {
      throw createSyncStopError('Sync stopped because this tab opened a different YouTube playlist.');
    }

    const now = Date.now();
    if (now > context.deadlineAt) {
      throw createSyncStopError('Sync timed out after 20 minutes. Reload the YouTube playlist page and try again.');
    }

    if (now - context.lastProgressAt > SYNC_IDLE_TIMEOUT_MS) {
      throw createSyncStopError('Sync timed out while waiting for YouTube to load more videos.');
    }
  }

  function markSyncProgress(context) {
    if (context) context.lastProgressAt = Date.now();
  }

  function getPlaylistShortfall(expectedCount, seenCount) {
    const expected = Number(expectedCount);
    const seen = Number(seenCount);
    if (!Number.isFinite(expected) || !Number.isFinite(seen)) return 0;
    return Math.max(0, expected - seen);
  }

  function formatShortfallWarning(expectedCount, seenCount, shortfallCount, confirmedFullLoad) {
    const action = confirmedFullLoad
      ? 'You confirmed all videos loaded; missing DB check ran.'
      : 'Missing DB check was skipped because full load was not confirmed.';
    return ` YouTube lists ${expectedCount}, but only ${seenCount} video IDs loaded; ${shortfallCount} did not load. ${action}`;
  }

  async function confirmPlaylistFullyLoaded(expectedCount, seenCount, shortfallCount, syncContext = null) {
    markSyncProgress(syncContext);

    return new Promise(resolve => {
      document.getElementById('ytb-sync-load-confirm')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ytb-sync-load-confirm';
      overlay.className = 'yt-sync-cleanup-modal yt-sync-load-confirm-modal';

      const dialog = document.createElement('div');
      dialog.className = 'yt-sync-cleanup-dialog';

      const title = document.createElement('div');
      title.className = 'yt-sync-cleanup-title';
      title.textContent = 'Confirm playlist load?';

      const text = document.createElement('div');
      text.className = 'yt-sync-cleanup-text';
      text.textContent = `YouTube says this playlist has ${expectedCount} videos, but sync loaded ${seenCount}. If the page reached the bottom and no more videos load, confirm to mark ${shortfallCount} missing DB entries as removed or unavailable.`;

      const actions = document.createElement('div');
      actions.className = 'yt-sync-cleanup-actions';

      const noBtn = document.createElement('button');
      noBtn.type = 'button';
      noBtn.dataset.choice = 'no';
      noBtn.textContent = 'No, skip missing check';

      const yesBtn = document.createElement('button');
      yesBtn.type = 'button';
      yesBtn.dataset.choice = 'yes';
      yesBtn.textContent = 'Yes, all loaded';

      actions.appendChild(noBtn);
      actions.appendChild(yesBtn);
      dialog.appendChild(title);
      dialog.appendChild(text);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);

      const finish = value => {
        overlay.remove();
        markSyncProgress(syncContext);
        resolve(value);
      };

      overlay.addEventListener('click', event => {
        if (event.target === overlay) finish(false);
        const button = event.target.closest && event.target.closest('button[data-choice]');
        if (!button) return;
        finish(button.dataset.choice === 'yes');
      });

      document.body.appendChild(overlay);
      yesBtn.focus();
    });
  }

  async function withSyncTimeout(promise, ms, label, syncContext) {
    if (syncContext) assertSyncCanContinue(syncContext);

    let timeoutId = null;
    try {
      const result = await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(createSyncStopError(`${label} timed out.`)), ms);
        })
      ]);
      if (syncContext) assertSyncCanContinue(syncContext);
      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  function scrollDownForSync(syncContext = null) {
    if (syncContext) assertSyncCanContinue(syncContext);
    const metrics = getScrollMetrics();
    const step = Math.max(900, Math.floor(window.innerHeight * 1.25));
    scrollToPosition(Math.min(metrics.scrollTop + step, metrics.scrollHeight));
  }

  function holdAtBottomForSync(syncContext = null) {
    if (syncContext) assertSyncCanContinue(syncContext);
    scrollToPosition(getScrollMetrics().scrollHeight);
  }

  async function findRemoveMenuItem() {
    for (let i = 0; i < 20; i++) {
      const item = getVisibleMenuItems().find(candidate => isRemoveMenuText(candidate.textContent));
      if (item) return item.closest('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item') || item;
      await delay(100);
    }
    return null;
  }

  async function removeYoutubePlaylistEntry(entry) {
    entry.node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    entry.node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await delay(80);

    const menuButton = getVisibleMenuButton(entry.node);
    if (!menuButton) return { success: false, error: 'Menu button not found' };

    entry.node.scrollIntoView({ block: 'center' });
    await delay(150);
    menuButton.click();

    const removeItem = await findRemoveMenuItem();
    if (!removeItem) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { success: false, error: 'Remove menu item not found' };
    }

    removeItem.click();
    await delay(700);
    return { success: true };
  }

  async function cleanupRemovedYoutubeEntries(entries, cleanup, syncContext = null) {
    const removedIds = new Set();
    if (!cleanup || !cleanup.enabled) return removedIds;

    for (const entry of entries) {
      if (syncContext) assertSyncCanContinue(syncContext);
      const videoId = entry.video.id;
      if (!cleanup.ids.has(videoId) || cleanup.attempted.has(videoId)) continue;

      markSyncProgress(syncContext);
      cleanup.attempted.add(videoId);
      panelApi.setSyncStatus(`Cleaning YouTube playlist... ${cleanup.removed + cleanup.failed + 1}`, 'busy', {
        key: SYNC_CLEANUP_STATUS_KEY
      });

      const result = await removeYoutubePlaylistEntry(entry);
      markSyncProgress(syncContext);
      if (result.success) {
        cleanup.removed++;
        removedIds.add(videoId);
        try {
          await withSyncTimeout(
            window.api.markYoutubeCleanup(cleanup.playlistId, videoId, 'removed'),
            15000,
            'Saving YouTube cleanup state',
            syncContext
          );
        } catch (error) {
          console.warn(`YouTube cleanup state was not saved for ${videoId}: ${error.message || error}`);
        }
      } else {
        cleanup.failed++;
        try {
          await withSyncTimeout(
            window.api.markYoutubeCleanup(cleanup.playlistId, videoId, 'failed', result.error),
            15000,
            'Saving YouTube cleanup state',
            syncContext
          );
        } catch (error) {
          console.warn(`YouTube cleanup failure state was not saved for ${videoId}: ${error.message || error}`);
        }
        console.warn(`YouTube cleanup skipped ${videoId}: ${result.error}`);
      }

      await delay(250);
      markSyncProgress(syncContext);
    }

    return removedIds;
  }

  async function sendSyncVideos(runId, videos, seenIds, syncContext = null) {
    const pending = [];
    for (const video of videos) {
      if (syncContext) assertSyncCanContinue(syncContext);
      if (seenIds.has(video.id)) continue;
      seenIds.add(video.id);
      pending.push({ ...video, sortOrder: seenIds.size });
    }

    for (let i = 0; i < pending.length; i += 50) {
      if (syncContext) assertSyncCanContinue(syncContext);
      await withSyncTimeout(
        window.api.sendSyncBatch(runId, pending.slice(i, i + 50)),
        20000,
        'Sync batch',
        syncContext
      );
      markSyncProgress(syncContext);
    }

    return pending.length;
  }

  async function collectAndSendSyncVideos(runId, seenIds, cleanup = null, syncContext = null) {
    if (syncContext) assertSyncCanContinue(syncContext);
    const entries = collectLoadedPlaylistEntries();
    const cleanupAttemptedBefore = cleanup && cleanup.enabled ? cleanup.attempted.size : 0;
    const removedIds = await cleanupRemovedYoutubeEntries(entries, cleanup, syncContext);
    const excludeIds = cleanup && cleanup.enabled ? cleanup.ids : removedIds;
    const syncEntries = excludeIds.size > 0
      ? entries.filter(entry => !excludeIds.has(entry.video.id))
      : entries;
    const added = await sendSyncVideos(runId, syncEntries.map(entry => entry.video), seenIds, syncContext);
    const cleaned = cleanup && cleanup.enabled ? cleanup.attempted.size - cleanupAttemptedBefore : removedIds.size;
    return { added, cleaned };
  }

  async function waitForPlaylistProgress(runId, seenIds, previousHeight, timeoutMs, cleanup = null, syncContext = null) {
    const deadline = Date.now() + timeoutMs;
    let addedTotal = 0;
    let cleanedTotal = 0;
    let heightChanged = false;

    while (Date.now() < deadline) {
      if (syncContext) assertSyncCanContinue(syncContext);
      await delay(500);

      const progress = await collectAndSendSyncVideos(runId, seenIds, cleanup, syncContext);
      addedTotal += progress.added;
      cleanedTotal += progress.cleaned;

      const metrics = getScrollMetrics();
      if (metrics.scrollHeight > previousHeight + 24) {
        heightChanged = true;
      }

      if (progress.added > 0 || progress.cleaned > 0 || heightChanged) {
        return { added: addedTotal, cleaned: cleanedTotal, heightChanged };
      }

      if (metrics.nearBottom) holdAtBottomForSync(syncContext);
      else scrollDownForSync(syncContext);
    }

    return { added: addedTotal, cleaned: cleanedTotal, heightChanged };
  }


  async function performPlaylistSync({ playlistId, source, cleanupYoutube, panel }) {
    if (activePlaylistSync && !activePlaylistSync.cancelled) {
      return { success: false, error: 'Sync is already running.' };
    }

    const syncContext = startSyncContext(source);
    const seenIds = new Set();
    let run = null;
    let playlist = null;

    try {
      assertSyncCanContinue(syncContext);
      panel.setSyncStatus('Starting sync...', 'busy');
      const started = await withSyncTimeout(
        window.api.startSync({
          ...source,
          playlistId
        }),
        20000,
        'Starting sync',
        syncContext
      );
      assertSyncCanContinue(syncContext);
      run = started.run;
      playlist = started.playlist;
      panel.setCurrentPlaylistId(playlist.id);

      const cleanupVideos = cleanupYoutube ? await withSyncTimeout(
        window.api.getYoutubeCleanupCandidateVideos(playlist.id),
        20000,
        'Loading YouTube cleanup state',
        syncContext
      ) : [];
      const cleanup = cleanupYoutube && cleanupVideos.length > 0
        ? {
            enabled: true,
            playlistId: playlist.id,
            ids: new Set(cleanupVideos.map(video => video.id)),
            pendingIds: new Set(cleanupVideos.filter(video => !video.youtube_removed_at).map(video => video.id)),
            attempted: new Set(),
            removed: 0,
            alreadyGone: 0,
            failed: 0
          }
        : null;

      const expectedCount = getExpectedPlaylistVideoCount();
      let idleBottomRounds = 0;
      let hardIdleRounds = 0;
      let shortfallWarning = '';
      let shortfallCount = 0;
      let shortfallExpectedCount = 0;

      for (let round = 0; round < 1600; round++) {
        assertSyncCanContinue(syncContext);
        const progressNow = await collectAndSendSyncVideos(run.id, seenIds, cleanup, syncContext);
        const metrics = getScrollMetrics();
        const expectedSuffix = expectedCount ? ` / ${expectedCount}` : '';
        panel.setSyncStatus(`Synced ${seenIds.size}${expectedSuffix} videos. Loading more...`, 'busy', {
          key: SYNC_PROGRESS_STATUS_KEY
        });

        if (metrics.nearBottom) holdAtBottomForSync(syncContext);
        else scrollDownForSync(syncContext);

        const progress = await waitForPlaylistProgress(run.id, seenIds, metrics.scrollHeight, 3000, cleanup, syncContext);
        const madeProgress = progressNow.added > 0 ||
          progressNow.cleaned > 0 ||
          progress.added > 0 ||
          progress.cleaned > 0 ||
          progress.heightChanged;

        if (madeProgress) {
          idleBottomRounds = 0;
          hardIdleRounds = 0;
          syncContext.lastProgressAt = Date.now();
          continue;
        }

        hardIdleRounds++;
        if (getScrollMetrics().nearBottom) idleBottomRounds++;
        else idleBottomRounds = 0;

        if (expectedCount && seenIds.size < expectedCount) {
          panel.setSyncStatus(`Synced ${seenIds.size} / ${expectedCount}. Waiting for YouTube to load more...`, 'busy', {
            key: SYNC_PROGRESS_STATUS_KEY
          });
          if (hardIdleRounds >= SYNC_MISMATCH_IDLE_ROUNDS && getScrollMetrics().nearBottom) {
            shortfallExpectedCount = expectedCount;
            shortfallCount = getPlaylistShortfall(expectedCount, seenIds.size);
            break;
          }
          continue;
        }

        if (idleBottomRounds >= 10) break;
      }

      assertSyncCanContinue(syncContext);
      await collectAndSendSyncVideos(run.id, seenIds, cleanup, syncContext);

      if (seenIds.size === 0) {
        throw createSyncStopError('Sync stopped because no videos were loaded from YouTube. Reload the playlist page and try again.');
      }

      const finalExpectedCount = getExpectedPlaylistVideoCount();
      shortfallExpectedCount = finalExpectedCount || shortfallExpectedCount;
      if (shortfallExpectedCount) {
        shortfallCount = getPlaylistShortfall(shortfallExpectedCount, seenIds.size);
      }

      let skipMissingCheck = false;
      if (shortfallCount > 0) {
        panel.setSyncStatus(`Loaded ${seenIds.size} / ${shortfallExpectedCount}. Waiting for confirmation...`, 'busy');
        const confirmedFullLoad = await confirmPlaylistFullyLoaded(
          shortfallExpectedCount,
          seenIds.size,
          shortfallCount,
          syncContext
        );
        skipMissingCheck = !confirmedFullLoad;
        shortfallWarning = formatShortfallWarning(
          shortfallExpectedCount,
          seenIds.size,
          shortfallCount,
          confirmedFullLoad
        );
      }

      assertSyncCanContinue(syncContext);
      panel.setSyncStatus(skipMissingCheck ? 'Finishing sync without missing check...' : 'Checking missing videos from DB...', 'busy');
      const finalized = await withSyncTimeout(
        window.api.finalizeSync(run.id, playlist.id, {
          skipMissingCheck
        }),
        5 * 60 * 1000,
        'Finalizing sync',
        syncContext
      );
      const summary = finalized.run;

      if (cleanup && !skipMissingCheck) {
        const notFoundIds = Array.from(cleanup.ids).filter(id => !cleanup.attempted.has(id));
        for (const videoId of notFoundIds) {
          try {
            await withSyncTimeout(
              window.api.markYoutubeCleanup(cleanup.playlistId, videoId, 'removed'),
              15000,
              'Saving YouTube cleanup state',
              syncContext
            );
            cleanup.alreadyGone++;
          } catch (error) {
            cleanup.failed++;
            console.warn(`YouTube cleanup not-found state was not saved for ${videoId}: ${error.message || error}`);
          }
        }
      }

      const cleanupNotFoundCount = cleanup
        ? Math.max(0, Array.from(cleanup.pendingIds).filter(id => !cleanup.attempted.has(id)).length - cleanup.alreadyGone)
        : 0;
      const cleanupSummary = cleanup
        ? ` YouTube cleanup removed ${cleanup.removed}, already gone ${cleanup.alreadyGone}, failed ${cleanup.failed}, not found ${cleanupNotFoundCount}.`
        : '';
      const doneMessage = `Done. Seen ${summary.seen_count}, new ${summary.added_count}, missing ${summary.removed_count}, unavailable ${summary.unavailable_count}.${cleanupSummary}${shortfallWarning}`;
      panel.setSyncStatus(doneMessage, 'success');
      await panel.loadPlaylists(true);
      await panel.loadVideos(true);

      if (cleanupNotFoundCount > 0) {
        const cleanupReviewPrompt = {
          playlistId: playlist.id,
          count: cleanupNotFoundCount,
          ts: Date.now()
        };

        if (panel.isOpen && panel.isOpen() && panel.offerYoutubeCleanupReview) {
          await panel.offerYoutubeCleanupReview(cleanupReviewPrompt);
        } else {
          safeStorageSet({ [YOUTUBE_CLEANUP_REVIEW_PROMPT_KEY]: cleanupReviewPrompt });
        }
      }
      return { success: true, message: doneMessage, state: 'success' };
    } catch (err) {
      const message = err.message || 'Sync failed.';
      if (run && run.id && (!err.isSyncStop || err.shouldFailRun !== false)) {
        window.api.failSync(run.id, message).catch(() => {});
      }
      if (err.isSyncStop) {
        panel.setSyncStatus(message, 'success');
        return { success: true, message, state: 'success', stopped: true };
      }

      panel.setSyncStatus(message, 'error');
      console.error('Playlist sync failed:', err);
      return { success: false, error: message };
    } finally {
      if (activePlaylistSync === syncContext) activePlaylistSync = null;
      safeStorageSet({ activeSyncTabId: null });
    }
  }

  function updateWatchControlsAfterPanelChange() {
    refreshMountedWatchControlState(true);
  }

  function openVideoFromPanel(video, panel, options = {}) {
    const currentId = getVideoIdFromUrl();
    if (!options.newTab && currentId === video.id) return;

    if (!options.newTab && panel.getRemoveOnSkip() && currentId && currentId !== video.id && panel.getCurrentPlaylistId()) {
      if (panel.hasVideo(currentId)) panel.requestVideoRemoval(currentId, 'skip');
    }
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
    if (options.newTab) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    window.location.assign(url);
  }

  function isYoutubeFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.querySelector('.html5-video-player.ytp-fullscreen')
    );
  }

  function sendFullscreenStateToBackground(force = false) {
    const fullscreen = isYoutubeFullscreenActive();
    if (!force && fullscreen === lastFullscreenState) return;
    lastFullscreenState = fullscreen;

    try {
      chrome.runtime.sendMessage({
        action: 'setYoutubeFullscreenState',
        fullscreen
      }, () => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) {
          handleExtensionContextError(error);
        }
      });
    } catch (error) {
      handleExtensionContextError(error);
    }
  }

  function startFullscreenStateWatcher() {
    fullscreenEventsController = new AbortController();
    const options = { signal: fullscreenEventsController.signal };

    document.addEventListener('fullscreenchange', () => sendFullscreenStateToBackground(), options);
    document.addEventListener('webkitfullscreenchange', () => sendFullscreenStateToBackground(), options);
    window.addEventListener('resize', () => sendFullscreenStateToBackground(), options);
    fullscreenWatchdogId = setInterval(() => sendFullscreenStateToBackground(), 700);
    sendFullscreenStateToBackground(true);
  }

  panelApi = window.ytbPanel.create({
    mode: 'floating',
    syncStatusStorageKey: 'dockedSyncStatus',
    previewOptions: { id: 'ytb-panel-preview', maxWidth: 420, minWidth: 260 },
    getPlayingVideoId: getVideoIdFromUrl,
    getActivePlaylistSource: () => {
      const source = getYoutubePlaylistSource();
      return source
        ? { success: true, source }
        : { success: false, error: 'Open a YouTube playlist page first.' };
    },
    startSyncPage: performPlaylistSync,
    stopSyncPage: async () => ({ success: true, stopped: stopActivePlaylistSync('Sync stopped by user.') }),
    openVideo: openVideoFromPanel,
    onVideosChanged: updateWatchControlsAfterPanelChange
  });

  startFullscreenStateWatcher();

  safeRuntimeOnMessage((request, sender, sendResponse) => {
    if (request.action === 'cleanupExtension') {
      cleanupContentScript();
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'openFloatingPanel') {
      panelApi.open();
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'startPlaylistSync') {
      if (request.playlistId) panelApi.setCurrentPlaylistId(request.playlistId);
      panelApi.startSync({
        cleanupYoutube: request.cleanupYoutube,
        expectedSourceId: request.expectedSourceId
      }).catch(err => {
        panelApi.setSyncStatus(err.message || 'Sync failed.', 'error');
      });
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'stopPlaylistSync') {
      const stopped = stopActivePlaylistSync('Sync stopped by user.');
      if (stopped && panelApi) panelApi.setSyncStatus('Stopping sync...', 'busy');
      sendResponse({ success: true, stopped });
      return false;
    }

    return false;
  });

  let quickSavePlaylistId = null;
  let quickSavePlaylists = [];
  let quickSaveInitPromise = null;
  let watchStateRefreshPromise = null;
  let lastWatchStateRefreshAt = 0;
  const watchTranscriptLoads = new Set();
  const watchSummaryLoads = new Set();
  const WATCH_STATE_REFRESH_INTERVAL = 5000;

  function withWatchTimeout(promise, ms, label) {
    let timeoutId = null;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      })
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  function scheduleWatchStateTask(label, task) {
    Promise.resolve()
      .then(task)
      .catch(error => {
        logContentError(`Watch controls: ${label} failed`, error);
      });
  }

  function createCommentsSyncStopError(message, options = {}) {
    const error = new Error(message || 'Comment sync stopped.');
    error.isCommentsSyncStop = true;
    error.silent = !!options.silent;
    return error;
  }

  function startCommentsSyncContext(videoId) {
    const now = Date.now();
    const context = {
      videoId,
      cancelled: false,
      cancelMessage: '',
      silentStop: false,
      startedAt: now,
      deadlineAt: now + COMMENTS_SYNC_MAX_DURATION_MS,
      lastProgressAt: now
    };
    activeCommentsSync = context;
    return context;
  }

  function stopActiveCommentsSync(message = 'Comment sync stopped.', options = {}) {
    removeCommentsSyncFloatingStop();
    if (!activeCommentsSync || activeCommentsSync.cancelled) return false;
    activeCommentsSync.cancelled = true;
    activeCommentsSync.cancelMessage = message;
    activeCommentsSync.silentStop = !!options.silent;
    return true;
  }

  function assertCommentsSyncCanContinue(context) {
    if (!context || activeCommentsSync !== context) {
      throw createCommentsSyncStopError('Comment sync stopped.');
    }

    if (context.cancelled) {
      throw createCommentsSyncStopError(context.cancelMessage || 'Comment sync stopped.', {
        silent: context.silentStop
      });
    }

    const videoId = getVideoIdFromUrl();
    if (!videoId || videoId !== context.videoId) {
      throw createCommentsSyncStopError('Comment sync stopped because this tab opened a different video.');
    }

    const now = Date.now();
    if (now > context.deadlineAt) {
      throw createCommentsSyncStopError('Comment sync timed out after 3 minutes.');
    }

    if (now - context.lastProgressAt > COMMENTS_SYNC_IDLE_TIMEOUT_MS) {
      throw createCommentsSyncStopError('Comment sync stopped because YouTube did not load more comments.');
    }
  }

  function markCommentsSyncProgress(context) {
    if (context) context.lastProgressAt = Date.now();
  }

  function scrollTowardComments(context) {
    assertCommentsSyncCanContinue(context);
    const commentsSection = findCommentsSection();
    if (commentsSection && getLoadedCommentCount() === 0) {
      const sectionTop = commentsSection.getBoundingClientRect().top + window.scrollY;
      const targetTop = Math.min(sectionTop + Math.floor(window.innerHeight * 0.65), getScrollMetrics().scrollHeight);
      scrollToPosition(targetTop);
      return;
    }

    scrollDownForSync();
  }

  function getAskPanel() {
    return document.getElementById('ytb-ask-panel');
  }

  function setAskStatus(panel, text, state = '') {
    const status = panel && panel.querySelector('.ytb-ask-status');
    if (!status) return;
    status.textContent = text || '';
    status.className = state ? `ytb-ask-status ytb-ask-status--${state}` : 'ytb-ask-status';
  }

  function createAskHistoryEntry(panel, question) {
    const history = panel && panel.querySelector('.ytb-ask-history');
    if (!history) return null;

    const item = document.createElement('div');
    item.className = 'ytb-ask-history-item';

    const questionEl = document.createElement('div');
    questionEl.className = 'ytb-ask-history-question';
    questionEl.textContent = question;

    const metaEl = document.createElement('div');
    metaEl.className = 'ytb-ask-history-meta';
    metaEl.textContent = 'Preparing context...';

    const answerEl = document.createElement('div');
    answerEl.className = 'ytb-ask-history-answer ytb-ask-history-answer--busy';
    answerEl.textContent = 'Preparing context...';

    item.appendChild(questionEl);
    item.appendChild(metaEl);
    item.appendChild(answerEl);
    history.appendChild(item);
    item.scrollIntoView({ block: 'nearest' });

    return { item, metaEl, answerEl };
  }

  function updateAskHistoryEntry(entry, text, state = '', meta = '') {
    if (!entry || !entry.answerEl) return;
    entry.answerEl.textContent = text || '';
    entry.answerEl.className = state
      ? `ytb-ask-history-answer ytb-ask-history-answer--${state}`
      : 'ytb-ask-history-answer';
    if (entry.metaEl && meta) {
      entry.metaEl.textContent = meta;
      entry.metaEl.className = state === 'error'
        ? 'ytb-ask-history-meta ytb-ask-history-meta--error'
        : 'ytb-ask-history-meta';
    }
    entry.item?.scrollIntoView({ block: 'nearest' });
  }

  function getAskMode(panel) {
    return panel && panel.dataset.askMode === 'video' ? 'video' : 'comments';
  }

  function isAskTranscriptReady(panel) {
    return !!panel && panel.dataset.askTranscriptReady === '1';
  }

  function updateAskModeSwitch(panel) {
    if (!panel) return;
    const mode = getAskMode(panel);
    const ready = isAskTranscriptReady(panel);
    const commentsButton = panel.querySelector('.ytb-ask-mode-option[data-mode="comments"]');
    const videoButton = panel.querySelector('.ytb-ask-mode-option[data-mode="video"]');
    if (!commentsButton || !videoButton) return;

    commentsButton.classList.toggle('ytb-ask-mode-option--active', mode === 'comments');
    videoButton.classList.toggle('ytb-ask-mode-option--active', mode === 'video');
    videoButton.classList.toggle('ytb-ask-mode-option--locked', !ready);
    commentsButton.setAttribute('aria-pressed', String(mode === 'comments'));
    videoButton.setAttribute('aria-pressed', String(mode === 'video'));
    videoButton.title = ready
      ? 'Ask using the transcript and loaded comments'
      : 'Transcript is required for this mode';
  }

  function setAskMode(panel, mode, options = {}) {
    if (!panel) return false;

    if (mode === 'video' && !isAskTranscriptReady(panel)) {
      panel.dataset.askMode = 'comments';
      updateAskModeSwitch(panel);
      if (!options.silent) {
        setAskStatus(panel, 'Transcript is required for video+comments mode. Generate the transcript first.', 'error');
      }
      return false;
    }

    panel.dataset.askMode = mode === 'video' ? 'video' : 'comments';
    if (options.byUser) panel.dataset.askModeUserSet = '1';
    updateAskModeSwitch(panel);
    return true;
  }

  function setAskTranscriptReady(panel, ready) {
    if (!panel) return;
    panel.dataset.askTranscriptReady = ready ? '1' : '0';
    if (!ready && getAskMode(panel) === 'video') panel.dataset.askMode = 'comments';
    if (ready && panel.dataset.askModeUserSet !== '1') panel.dataset.askMode = 'video';
    updateAskModeSwitch(panel);
  }

  function updateAskCommentStats(panel) {
    const stats = getCommentSyncStats();
    const counter = panel && panel.querySelector('.ytb-ask-comments-count');
    if (counter) counter.textContent = formatCommentsCount(stats.comments.length, stats.expected, stats.hiddenReplies);
    return stats;
  }

  function isCommentsSyncComplete(stats) {
    return stats.expected === 0 || (Number.isInteger(stats.expected) && stats.accounted >= stats.expected);
  }

  function hasCommentsSyncProgress(stats, previous) {
    return stats.comments.length > previous.comments ||
      stats.hiddenReplies > previous.hiddenReplies ||
      stats.accounted > previous.accounted;
  }

  async function waitForCommentsSyncProgress(context, panel, previous) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < COMMENTS_SYNC_PROGRESS_WAIT_MS) {
      await delay(COMMENTS_SYNC_PROGRESS_POLL_MS);
      assertCommentsSyncCanContinue(context);

      const stats = updateAskCommentStats(panel);
      if (isCommentsSyncComplete(stats) || hasCommentsSyncProgress(stats, previous)) {
        return { stats, progressed: true };
      }
    }

    return { stats: updateAskCommentStats(panel), progressed: false };
  }

  async function updateAskTranscriptToggleState(panel) {
    const videoId = getVideoIdFromUrl();
    if (!videoId || !panel) return;

    try {
      const status = await withWatchTimeout(window.api.getTranscriptStatus(videoId, { force: true }), 8000, 'getTranscriptStatus');
      setAskTranscriptReady(panel, !!status.hasTranscript);
      if (status.transcriptUnavailable && !status.hasTranscript) {
        setAskStatus(panel, 'Transcript unavailable. Ask will use only loaded comments.', 'error');
      }
    } catch (error) {
      logContentError('Ask panel: failed to load transcript state', error);
    }
  }

  function setCommentsSyncButtonState(panel, running) {
    const button = panel && panel.querySelector('.ytb-ask-sync-btn');
    if (!button) return;
    button.textContent = running ? 'Stop sync' : 'Sync comments';
    button.classList.toggle('ytb-ask-sync-btn--stop', !!running);
  }

  function showCommentsSyncFloatingStop(panel) {
    removeCommentsSyncFloatingStop();

    const button = document.createElement('button');
    button.id = 'ytb-ask-sync-floating-stop';
    button.type = 'button';
    button.textContent = 'Stop comments sync';
    button.addEventListener('click', event => {
      event.stopPropagation();
      stopActiveCommentsSync('Comment sync stopped by user.');
      setAskStatus(panel, 'Stopping comment sync...', 'busy');
      returnToAskPanelTop(panel);
    });
    document.body.appendChild(button);
  }

  function removeCommentsSyncFloatingStop() {
    document.getElementById('ytb-ask-sync-floating-stop')?.remove();
  }

  function returnToAskPanelTop(panel) {
    if (panel && panel.isConnected) {
      const top = panel.getBoundingClientRect().top + window.scrollY - 80;
      scrollToPosition(Math.max(0, top));
      return;
    }

    scrollToPosition(0);
  }

  async function performCommentsSync(panel) {
    const videoId = getVideoIdFromUrl();
    if (!videoId || activeCommentsSync) return;

    const context = startCommentsSyncContext(videoId);
    setCommentsSyncButtonState(panel, true);
    showCommentsSyncFloatingStop(panel);
    setAskStatus(panel, 'Syncing comments...', 'busy');

    try {
      let stats = updateAskCommentStats(panel);
      let previous = {
        comments: stats.comments.length,
        hiddenReplies: stats.hiddenReplies,
        accounted: stats.accounted
      };

      for (let round = 0; round < 240; round++) {
        assertCommentsSyncCanContinue(context);
        stats = updateAskCommentStats(panel);

        if (isCommentsSyncComplete(stats)) {
          setAskStatus(panel, `Comments sync ready. ${formatCommentsCount(stats.comments.length, stats.expected, stats.hiddenReplies)}.`, 'success');
          return;
        }

        setAskStatus(panel, `${formatCommentsCount(stats.comments.length, stats.expected, stats.hiddenReplies)}. Loading more...`, 'busy');
        scrollTowardComments(context);
        const waitResult = await waitForCommentsSyncProgress(context, panel, previous);
        stats = waitResult.stats;

        if (waitResult.progressed) {
          markCommentsSyncProgress(context);
          previous = {
            comments: stats.comments.length,
            hiddenReplies: stats.hiddenReplies,
            accounted: stats.accounted
          };
          continue;
        }

        setAskStatus(panel, `Comments sync ready. ${formatCommentsCount(stats.comments.length, stats.expected, stats.hiddenReplies)}.`, 'success');
        return;
      }

      const finalStats = updateAskCommentStats(panel);
      setAskStatus(panel, `Comments sync stopped. ${formatCommentsCount(finalStats.comments.length, finalStats.expected, finalStats.hiddenReplies)}.`, 'success');
    } catch (error) {
      if (error.isCommentsSyncStop) {
        if (!error.silent) setAskStatus(panel, error.message || 'Comment sync stopped.', 'success');
        return;
      }

      setAskStatus(panel, error.message || 'Comment sync failed.', 'error');
      logContentError('Ask panel: comment sync failed', error);
    } finally {
      if (activeCommentsSync === context) activeCommentsSync = null;
      removeCommentsSyncFloatingStop();
      setCommentsSyncButtonState(panel, false);
      updateAskCommentStats(panel);
      returnToAskPanelTop(panel);
    }
  }

  function handleSyncCommentsClick(panel) {
    if (activeCommentsSync) {
      stopActiveCommentsSync('Comment sync stopped by user.');
      setAskStatus(panel, 'Stopping comment sync...', 'busy');
      returnToAskPanelTop(panel);
      return;
    }

    performCommentsSync(panel).catch(error => {
      setAskStatus(panel, error.message || 'Comment sync failed.', 'error');
    });
  }

  async function getTranscriptForAsk(videoId, panel) {
    if (getAskMode(panel) !== 'video') return '';

    try {
      const status = await withWatchTimeout(window.api.getTranscriptStatus(videoId, { force: true }), 8000, 'getTranscriptStatus');
      if (!status.hasTranscript) {
        setAskTranscriptReady(panel, false);
        setAskStatus(panel, status.transcriptUnavailable
          ? 'Transcript unavailable. Asking about comments only.'
          : 'Transcript is required for video+comments mode. Asking about comments only.', 'error');
        return '';
      }

      const transcript = await withWatchTimeout(window.api.getTranscript(videoId), 20000, 'getTranscript');
      return transcript.timestampedText || transcript.text || '';
    } catch (error) {
      if (error && error.transcriptUnavailable) setAskTranscriptReady(panel, false);
      setAskStatus(panel, 'Transcript could not be loaded. Asking about comments only.', 'error');
      return '';
    }
  }

  async function handleAskAboutClick(panel) {
    const videoId = getVideoIdFromUrl();
    const textarea = panel && panel.querySelector('.ytb-ask-textarea');
    const askButton = panel && panel.querySelector('.ytb-ask-submit-btn');
    const question = textarea ? textarea.value.trim() : '';

    if (!videoId || !question || !askButton) {
      setAskStatus(panel, 'Enter a question before asking.', 'error');
      return;
    }

    stopActiveCommentsSync('Comment sync stopped before Ask about.', { silent: true });
    const historyEntry = createAskHistoryEntry(panel, question);
    askButton.disabled = true;
    setAskStatus(panel, 'Preparing context...', 'busy');

    try {
      await ensureCurrentVideoStored(videoId);
      const stats = updateAskCommentStats(panel);
      const transcript = await getTranscriptForAsk(videoId, panel);
      const includeTranscript = !!(getAskMode(panel) === 'video' && transcript);

      setAskStatus(panel, 'Asking AI...', 'busy');
      updateAskHistoryEntry(historyEntry, 'Asking AI...', 'busy', 'Asking AI...');
      const result = await withWatchTimeout(window.api.askVideo(videoId, {
        question,
        comments: stats.comments,
        expectedCommentCount: stats.expected,
        includeTranscript,
        transcript,
        title: getCurrentVideoTitleFromPage(),
        author: getCurrentVideoAuthorFromPage()
      }), 140000, 'askVideo');

      const doneText = `Done. Used ${result.commentCount ?? stats.comments.length} comments${result.transcriptIncluded ? ' + transcript' : ''}.`;
      updateAskHistoryEntry(historyEntry, result.answer || '', 'success', doneText);
      setAskStatus(panel, doneText, 'success');
    } catch (error) {
      if (error && error.transcriptUnavailable) {
        setAskTranscriptReady(panel, false);
      }
      updateAskHistoryEntry(historyEntry, error.message || 'Ask failed.', 'error', 'Ask failed.');
      setAskStatus(panel, error.message || 'Ask failed.', 'error');
      logContentError('Ask panel: ask failed', error);
    } finally {
      askButton.disabled = false;
      updateAskCommentStats(panel);
    }
  }

  function buildYtbAskPanel() {
    const panel = document.createElement('div');
    panel.id = 'ytb-ask-panel';
    panel.hidden = true;

    const textarea = document.createElement('textarea');
    textarea.className = 'ytb-ask-textarea';
    textarea.rows = 4;
    textarea.placeholder = 'Ask about this video and loaded comments';

    const controls = document.createElement('div');
    controls.className = 'ytb-ask-controls';

    const modeSwitch = document.createElement('div');
    modeSwitch.className = 'ytb-ask-mode-switch';
    modeSwitch.setAttribute('role', 'group');
    modeSwitch.setAttribute('aria-label', 'Ask context mode');

    const commentsModeButton = document.createElement('button');
    commentsModeButton.type = 'button';
    commentsModeButton.className = 'ytb-ask-mode-option';
    commentsModeButton.dataset.mode = 'comments';
    commentsModeButton.textContent = 'only comments';
    commentsModeButton.addEventListener('click', event => {
      event.stopPropagation();
      setAskMode(panel, 'comments', { byUser: true });
    });

    const videoModeButton = document.createElement('button');
    videoModeButton.type = 'button';
    videoModeButton.className = 'ytb-ask-mode-option';
    videoModeButton.dataset.mode = 'video';
    videoModeButton.textContent = 'video+comments';
    videoModeButton.addEventListener('click', event => {
      event.stopPropagation();
      setAskMode(panel, 'video', { byUser: true });
    });

    modeSwitch.appendChild(commentsModeButton);
    modeSwitch.appendChild(videoModeButton);

    const counter = document.createElement('span');
    counter.className = 'ytb-ask-comments-count';

    const syncButton = document.createElement('button');
    syncButton.type = 'button';
    syncButton.className = 'ytb-ask-panel-btn ytb-ask-sync-btn';
    syncButton.textContent = 'Sync comments';
    syncButton.addEventListener('click', event => {
      event.stopPropagation();
      handleSyncCommentsClick(panel);
    });

    const askButton = document.createElement('button');
    askButton.type = 'button';
    askButton.className = 'ytb-ask-panel-btn ytb-ask-submit-btn';
    askButton.textContent = 'Ask about';
    askButton.addEventListener('click', event => {
      event.stopPropagation();
      handleAskAboutClick(panel);
    });

    controls.appendChild(modeSwitch);
    controls.appendChild(counter);
    controls.appendChild(syncButton);
    controls.appendChild(askButton);

    const status = document.createElement('div');
    status.className = 'ytb-ask-status';

    const history = document.createElement('div');
    history.className = 'ytb-ask-history';

    panel.appendChild(textarea);
    panel.appendChild(controls);
    panel.appendChild(status);
    panel.appendChild(history);

    panel.dataset.askMode = 'comments';
    panel.dataset.askTranscriptReady = '0';
    updateAskModeSwitch(panel);
    updateAskCommentStats(panel);
    return panel;
  }

  function mountYtbAskPanel(panel) {
    const target = findWatchActionsContainer();
    const metadata = target && target.closest('ytd-watch-metadata');
    const aboveFold = metadata && metadata.querySelector('#above-the-fold');
    const topRow = target && target.closest('#top-row');

    if (aboveFold && panel.parentElement !== aboveFold) {
      if (topRow && topRow.parentElement === aboveFold) topRow.after(panel);
      else aboveFold.appendChild(panel);
    } else if (!aboveFold && target && panel.parentElement !== target.parentElement) {
      target.after(panel);
    }
  }

  function toggleYtbAskPanel(button) {
    let panel = getAskPanel();
    if (!panel) {
      panel = buildYtbAskPanel();
    }

    mountYtbAskPanel(panel);
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.classList.toggle('ytb-ask-toggle-btn--open', willOpen);
    button.setAttribute('aria-expanded', String(willOpen));

    if (willOpen) {
      updateAskCommentStats(panel);
      updateAskTranscriptToggleState(panel);
      panel.querySelector('.ytb-ask-textarea')?.focus();
    } else {
      stopActiveCommentsSync('Comment sync stopped.', { silent: true });
    }
  }

  async function initQuickSave() {
    const res = await safeStorageGetAsync(['quickSavePlaylistId']);
    if (res.quickSavePlaylistId) quickSavePlaylistId = res.quickSavePlaylistId;

    try {
      quickSavePlaylists = await withWatchTimeout(window.api.getPlaylists(), 8000, 'getPlaylists');
      const hasSelectedPlaylist = quickSavePlaylists.some(p => String(p.id) === String(quickSavePlaylistId));
      if ((!quickSavePlaylistId || !hasSelectedPlaylist) && quickSavePlaylists.length > 0) {
        quickSavePlaylistId = quickSavePlaylists[0].id;
        safeStorageSet({ quickSavePlaylistId });
      }
    } catch (e) {
      logContentError('Quick-save: failed to load playlists', e);
    }
  }

  function hideYtbPreview() {
    ytbPreview.hide();
  }

  function scheduleYtbPreviewHide() {
    ytbPreview.scheduleHide();
  }

  async function getOrCreateUngroupedPlaylist() {
    const playlists = await window.api.getPlaylists({ force: true });
    const existing = playlists.find(p => String(p.name || '').trim().toUpperCase() === 'UNGROUPED');
    if (existing) return existing;
    return window.api.createPlaylist('UNGROUPED');
  }

  async function ensureCurrentVideoStored(videoId) {
    const state = await window.api.getVideoStorageState(videoId);
    if (state.exists) return Array.isArray(state.playlists) ? state.playlists[0] || null : null;

    const ungrouped = await getOrCreateUngroupedPlaylist();
    await window.api.addVideoToPlaylist(ungrouped.id, videoId);
    return ungrouped;
  }

  function setYtbActionButtonState(button, ready, busy = false, disabled = false, label = '') {
    button.classList.toggle('ytb-action-btn--ready', !!ready);
    button.classList.toggle('ytb-action-btn--missing', !ready);
    button.classList.toggle('ytb-action-btn--busy', !!busy);
    button.disabled = !!disabled;
    if (busy) button.innerHTML = '<span class="ytb-action-spinner"></span>';
    else if (label) button.textContent = label;
  }

  async function getActiveSummaryMode() {
    try {
      const settings = await window.api.getSummarySettings();
      return settings.summary_mode || settings.summaryMode || 'plain';
    } catch {
      return 'plain';
    }
  }

  async function openSummaryPage(videoId, mode, active) {
    if (window.api.openSummaryPage) {
      await window.api.openSummaryPage(videoId, mode, { active });
      return;
    }

    const url = chrome.runtime.getURL(`asset.html?type=summary&videoId=${encodeURIComponent(videoId)}&mode=${encodeURIComponent(mode)}`);
    window.open(url, '_blank');
  }

  function ensureQuickSaveInitialized() {
    if (!quickSaveInitPromise) {
      quickSaveInitPromise = initQuickSave().catch(error => {
        quickSaveInitPromise = null;
        throw error;
      });
    }
    return quickSaveInitPromise;
  }

  async function updateYtbActionButtonsState() {
    const videoId = getVideoIdFromUrl();
    const wrapper = document.getElementById('ytb-actions-wrapper');
    if (!videoId || !wrapper) return;

    const transcriptBtn = wrapper.querySelector('[data-ytb-action="transcript"]');
    const summaryWrap = wrapper.querySelector('.ytb-summary-actions');
    const summaryBtns = Array.from(wrapper.querySelectorAll('[data-ytb-summary-action]'));
    if (!transcriptBtn || summaryBtns.length === 0) return;

    try {
      const [transcriptStatus, summaryStatus, summaryMode] = await Promise.all([
        withWatchTimeout(window.api.getTranscriptStatus(videoId, { force: true }), 8000, 'getTranscriptStatus'),
        withWatchTimeout(window.api.getSummaryStatus(videoId, { force: true }), 8000, 'getSummaryStatus'),
        withWatchTimeout(getActiveSummaryMode(), 8000, 'getActiveSummaryMode')
      ]);
      const transcriptBusy = watchTranscriptLoads.has(videoId);
      const summaryBusy = watchSummaryLoads.has(videoId);

      setYtbActionButtonState(transcriptBtn, !!transcriptStatus.hasTranscript, transcriptBusy, false, 'T');
      transcriptBtn.title = transcriptBusy
        ? 'Fetching transcript'
        : transcriptStatus.hasTranscript
        ? 'Transcript ready'
        : transcriptStatus.transcriptUnavailable ? 'Transcript unavailable' : 'Fetch transcript';
      const hasSummary = summaryMode === 'html' ? !!summaryStatus.hasHtmlSummary : !!summaryStatus.hasSummary;
      const summaryBlocked = !transcriptStatus.hasTranscript;
      if (summaryWrap) {
        summaryWrap.classList.toggle('ytb-summary-actions--ready', hasSummary);
        summaryWrap.classList.toggle('ytb-summary-actions--missing', !hasSummary);
        summaryWrap.classList.toggle('ytb-summary-actions--busy', summaryBusy);
        summaryWrap.classList.toggle('ytb-summary-actions--disabled', summaryBlocked || summaryBusy);
      }
      const summaryTitles = {
        generate: {
          ready: `${summaryMode === 'html' ? 'HTML summary' : 'Summary'} ready`,
          missing: `Generate ${summaryMode === 'html' ? 'HTML summary' : 'summary'}`
        },
        'open-active': {
          ready: 'Open summary page and switch to it',
          missing: 'Generate summary, then open page and switch to it'
        },
        'open-background': {
          ready: 'Open summary page in background',
          missing: 'Generate summary, then open page in background'
        }
      };

      summaryBtns.forEach(summaryBtn => {
        const action = summaryBtn.dataset.ytbSummaryAction || 'generate';
        setYtbActionButtonState(summaryBtn, hasSummary, summaryBusy, summaryBlocked || summaryBusy, summaryBtn.dataset.ytbLabel || '');
        if (!summaryBusy) {
          if (summaryBtn.dataset.ytbIcon === 'external-link') summaryBtn.innerHTML = externalLinkIcon;
          else summaryBtn.textContent = summaryBtn.dataset.ytbLabel || 'S';
        }
        summaryBtn.title = summaryBusy
          ? `Generating ${summaryMode === 'html' ? 'HTML summary' : 'summary'}`
          : summaryBlocked
          ? 'Fetch transcript first'
          : hasSummary
          ? (summaryTitles[action] || summaryTitles.generate).ready
          : (summaryTitles[action] || summaryTitles.generate).missing;
      });
    } catch (error) {
      logContentError('YTB actions: failed to update state', error);
    }
  }

  async function handleYtbPreviewRegenerated() {
    await updateYtbActionButtonsState();
    if (panelApi && panelApi.isOpen()) panelApi.loadVideos();
  }

  async function showYtbPreview(anchor, type) {
    if (anchor.disabled) return;
    const readyClass = type === 'summary' ? 'ytb-summary-actions--ready' : 'ytb-action-btn--ready';
    if (!anchor.classList.contains(readyClass)) return;

    const videoId = getVideoIdFromUrl();
    if (!videoId) return;

    const isTranscript = type === 'transcript';
    const summaryMode = isTranscript ? 'plain' : await getActiveSummaryMode();

    try {
      let ready = false;
      let emptyText;
      if (isTranscript) {
        const status = await window.api.getTranscriptStatus(videoId, { force: true });
        ready = !!status.hasTranscript;
        if (status.transcriptUnavailable) {
          emptyText = 'Transcript is unavailable for this video. Click T to try fetching it again.';
        }
      } else {
        const status = await window.api.getSummaryStatus(videoId, { force: true });
        ready = summaryMode === 'html' ? !!status.hasHtmlSummary : !!status.hasSummary;
      }

      ytbPreview.show(anchor, window.ytbPreview.createVideoAssetConfig({
        videoId,
        type,
        summaryMode,
        ready,
        emptyText,
        emptyState: emptyText ? 'unavailable' : undefined,
        beforeRegenerate: () => ensureCurrentVideoStored(videoId),
        onRegenerated: handleYtbPreviewRegenerated
      }));
    } catch (error) {
      ytbPreview.show(anchor, window.ytbPreview.createVideoAssetConfig({
        videoId,
        type,
        summaryMode,
        ready: false,
        emptyText: error.message || 'Failed to load preview.',
        beforeRegenerate: () => ensureCurrentVideoStored(videoId),
        onRegenerated: handleYtbPreviewRegenerated
      }));
    }
  }

  async function handleYtbTranscriptClick(button) {
    const videoId = getVideoIdFromUrl();
    if (!videoId || watchTranscriptLoads.has(videoId) || button.classList.contains('ytb-action-btn--busy')) return;

    watchTranscriptLoads.add(videoId);
    setYtbActionButtonState(button, button.classList.contains('ytb-action-btn--ready'), true, false, 'T');

    try {
      await ensureCurrentVideoStored(videoId);
      const status = await window.api.getTranscriptStatus(videoId, { force: true });
      if (status.hasTranscript) {
        await updateYtbActionButtonsState();
        return;
      }
      await window.api.requestTranscript(videoId, { force: true });
      await updateYtbActionButtonsState();
      if (panelApi && panelApi.isOpen()) panelApi.loadVideos();
    } catch (error) {
      logContentError('YTB transcript action failed', error);
      button.textContent = '!';
      setTimeout(updateYtbActionButtonsState, 1200);
    } finally {
      watchTranscriptLoads.delete(videoId);
      updateYtbActionButtonsState();
    }
  }

  async function handleYtbSummaryClick(button, action = 'generate') {
    const videoId = getVideoIdFromUrl();
    if (!videoId || watchSummaryLoads.has(videoId) || button.disabled || button.classList.contains('ytb-action-btn--busy')) return;

    watchSummaryLoads.add(videoId);
    setYtbActionButtonState(button, button.classList.contains('ytb-action-btn--ready'), true, false, 'S');

    try {
      await ensureCurrentVideoStored(videoId);
      const summaryMode = await getActiveSummaryMode();
      const transcriptStatus = await window.api.getTranscriptStatus(videoId, { force: true });
      if (!transcriptStatus.hasTranscript) {
        await updateYtbActionButtonsState();
        return;
      }
      const status = await window.api.getSummaryStatus(videoId, { force: true });
      const hasSummary = summaryMode === 'html' ? status.hasHtmlSummary : status.hasSummary;
      const shouldOpen = action === 'open-active' || action === 'open-background';
      if (hasSummary) {
        if (shouldOpen) await openSummaryPage(videoId, summaryMode, action === 'open-active');
        await updateYtbActionButtonsState();
        return;
      }
      await window.api.requestSummary(videoId, summaryMode);
      if (shouldOpen) await openSummaryPage(videoId, summaryMode, action === 'open-active');
      await updateYtbActionButtonsState();
      if (panelApi && panelApi.isOpen()) panelApi.loadVideos();
    } catch (error) {
      logContentError('YTB summary action failed', error);
      button.textContent = '!';
      setTimeout(updateYtbActionButtonsState, 1200);
    } finally {
      watchSummaryLoads.delete(videoId);
      updateYtbActionButtonsState();
    }
  }

  function buildYtbActionButtons() {
    const wrapper = document.createElement('div');
    wrapper.id = 'ytb-actions-wrapper';

    const askBtn = document.createElement('button');
    askBtn.type = 'button';
    askBtn.className = 'ytb-action-btn ytb-ask-toggle-btn';
    askBtn.dataset.ytbAction = 'ask';
    askBtn.title = 'Ask about video and comments';
    askBtn.setAttribute('aria-expanded', 'false');
    askBtn.innerHTML = '<span>Ask</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';
    askBtn.addEventListener('click', event => {
      event.stopPropagation();
      toggleYtbAskPanel(askBtn);
    });

    const transcriptBtn = document.createElement('button');
    transcriptBtn.type = 'button';
    transcriptBtn.className = 'ytb-action-btn ytb-action-btn--missing';
    transcriptBtn.dataset.ytbAction = 'transcript';
    transcriptBtn.title = 'Fetch transcript';
    transcriptBtn.textContent = 'T';
    transcriptBtn.addEventListener('click', event => {
      event.stopPropagation();
      handleYtbTranscriptClick(transcriptBtn);
    });
    transcriptBtn.addEventListener('mouseenter', () => showYtbPreview(transcriptBtn, 'transcript'));
    transcriptBtn.addEventListener('mouseleave', scheduleYtbPreviewHide);

    const summaryWrap = document.createElement('div');
    summaryWrap.className = 'ytb-summary-actions ytb-summary-actions--missing';

    [
      { action: 'generate', label: 'S', title: 'Generate summary' },
      { action: 'open-active', label: '', icon: 'external-link', title: 'Generate summary, then open page and switch to it' },
      { action: 'open-background', label: 'S+', title: 'Generate summary, then open page in background' }
    ].forEach(config => {
      const summaryBtn = document.createElement('button');
      summaryBtn.type = 'button';
      summaryBtn.className = 'ytb-action-btn ytb-action-btn--missing';
      summaryBtn.dataset.ytbAction = 'summary';
      summaryBtn.dataset.ytbSummaryAction = config.action;
      summaryBtn.dataset.ytbLabel = config.label;
      if (config.icon) summaryBtn.dataset.ytbIcon = config.icon;
      summaryBtn.title = config.title;
      summaryBtn.innerHTML = config.icon === 'external-link' ? externalLinkIcon : config.label;
      summaryBtn.addEventListener('click', event => {
        event.stopPropagation();
        handleYtbSummaryClick(summaryBtn, config.action);
      });
      summaryWrap.appendChild(summaryBtn);
    });

    summaryWrap.addEventListener('mouseenter', () => showYtbPreview(summaryWrap, 'summary'));
    summaryWrap.addEventListener('mouseleave', scheduleYtbPreviewHide);

    wrapper.appendChild(askBtn);
    wrapper.appendChild(transcriptBtn);
    wrapper.appendChild(summaryWrap);
    return wrapper;
  }

  async function injectYtbActionButtons() {
    const target = findWatchActionsContainer();
    if (!target) return;

    let existing = document.getElementById('ytb-actions-wrapper');
    if (existing && !hasYtbActionButtons(existing)) {
      existing.remove();
      existing = null;
    }

    if (existing) {
      revealManagedWatchControl(existing);
      if (existing.parentElement !== target || !isVisibleActionTarget(existing.parentElement)) {
        target.prepend(existing);
      }
      scheduleWatchStateTask('asset-buttons existing refresh', updateYtbActionButtonsState);
      return;
    }

    target.prepend(buildYtbActionButtons());
    scheduleWatchStateTask('asset-buttons initial refresh', updateYtbActionButtonsState);
  }

  function isVisibleActionTarget(node) {
    if (!node || node.closest('[hidden]')) return false;

    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findWatchActionTarget(selector) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const watchCandidates = candidates.filter(node => node.closest('ytd-watch-metadata, #above-the-fold'));
    const scopedCandidates = watchCandidates.length ? watchCandidates : candidates;

    return scopedCandidates.find(isVisibleActionTarget) || null;
  }

  function findWatchActionsContainer() {
    return findWatchActionTarget('#top-level-buttons-computed') ||
      findWatchActionTarget('ytd-watch-metadata #actions-inner, #above-the-fold #actions-inner');
  }

  function findQuickSaveTarget() {
    return findWatchActionsContainer();
  }

  function placeQuickSaveWrapper(target, wrapper) {
    const actionsWrapper = target.querySelector('#ytb-actions-wrapper');
    if (actionsWrapper) {
      actionsWrapper.after(wrapper);
      return;
    }

    target.prepend(wrapper);
  }

  function revealManagedWatchControl(node) {
    node.hidden = false;
    node.removeAttribute('hidden');
    node.removeAttribute('aria-hidden');
    node.style.removeProperty('display');
    node.style.removeProperty('visibility');
  }

  function isMountedWatchControlVisible(wrapper, requiredSelectors) {
    return !!wrapper &&
      wrapper.isConnected &&
      !!wrapper.parentElement &&
      isVisibleActionTarget(wrapper.parentElement) &&
      isVisibleActionTarget(wrapper) &&
      requiredSelectors.every(selector => wrapper.querySelector(selector));
  }

  function hasYtbActionButtons(wrapper) {
    return !!wrapper &&
      !!wrapper.querySelector('[data-ytb-action="ask"]') &&
      !!wrapper.querySelector('[data-ytb-action="transcript"]') &&
      !!wrapper.querySelector('[data-ytb-action="summary"]');
  }

  function hasQuickSaveButtons(wrapper) {
    return !!wrapper &&
      !!wrapper.querySelector('#yt-qs-save') &&
      !!wrapper.querySelector('#yt-qs-drop');
  }

  function isQuickSaveMountedVisible() {
    const wrapper = document.getElementById('yt-qs-wrapper');
    return isMountedWatchControlVisible(wrapper, ['#yt-qs-save', '#yt-qs-drop']);
  }

  function isYtbActionsMountedVisible() {
    const wrapper = document.getElementById('ytb-actions-wrapper');
    return isMountedWatchControlVisible(wrapper, ['[data-ytb-action="ask"]', '[data-ytb-action="transcript"]', '[data-ytb-action="summary"]']);
  }

  async function updateQuickSaveButtonState(btn, labelEl) {
    const videoId = getVideoIdFromUrl();
    if (!videoId || !quickSavePlaylistId) return;

    try {
      const videoPlaylists = await withWatchTimeout(
        window.api.getVideoPlaylists(videoId, { force: true }),
        8000,
        'getVideoPlaylists'
      );
      const selectedSavedPlaylist = videoPlaylists.find(p => String(p.id) === String(quickSavePlaylistId));
      const savedPlaylist = selectedSavedPlaylist || videoPlaylists[0] || null;

      if (savedPlaylist) {
        btn.classList.add('yt-qs-saved');
        btn.dataset.savedPlaylistId = savedPlaylist.id;
        labelEl.textContent = 'In ' + truncate(savedPlaylist.name, 10);
      } else {
        btn.classList.remove('yt-qs-saved');
        delete btn.dataset.savedPlaylistId;
        labelEl.textContent = 'Save';
      }
    } catch (e) {
      logContentError('Quick-save: failed to check state', e);
    }
  }

  function buildQuickSaveButton() {
    const wrapper = document.createElement('div');
    wrapper.id = 'yt-qs-wrapper';

    const saveBtn = document.createElement('button');
    saveBtn.id = 'yt-qs-save';
    saveBtn.className = 'yt-qs-btn';

    const saveIcon = document.createElement('span');
    saveIcon.className = 'yt-qs-icon';
    saveIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 2H5a2 2 0 00-2 2v16.887c0 1.266 1.382 2.048 2.469 1.399L12 18.366l6.531 3.919c1.087.652 2.469-.131 2.469-1.397V4a2 2 0 00-2-2ZM5 20.233V4h14v16.233l-6.485-3.89-.515-.309-.515.309L5 20.233Z"/></svg>`;

    const saveLabel = document.createElement('span');
    saveLabel.className = 'yt-qs-label';
    saveLabel.textContent = 'Save';

    saveBtn.appendChild(saveIcon);
    saveBtn.appendChild(saveLabel);

    const dropBtn = document.createElement('button');
    dropBtn.id = 'yt-qs-drop';
    dropBtn.className = 'yt-qs-btn';
    dropBtn.setAttribute('aria-label', 'Choose playlist');
    dropBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M18.707 8.793a1 1 0 00-1.414 0L12 14.086 6.707 8.793a1 1 0 10-1.414 1.414L12 16.914l6.707-6.707a1 1 0 000-1.414Z"/></svg>`;

    const dropdown = document.createElement('div');
    dropdown.id = 'yt-qs-dropdown';
    dropdown.style.display = 'none';
    let dropdownCloseController = null;

    wrapper.appendChild(saveBtn);
    wrapper.appendChild(dropBtn);
    document.body.appendChild(dropdown);

    function closeDropdown() {
      dropdown.style.display = 'none';
      if (dropdownCloseController) {
        dropdownCloseController.abort();
        dropdownCloseController = null;
      }
    }

    function positionDropdown() {
      const rect = dropBtn.getBoundingClientRect();
      const width = Math.max(190, Math.ceil(rect.width + saveBtn.getBoundingClientRect().width));
      const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width));
      dropdown.style.position = 'fixed';
      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${Math.min(window.innerHeight - 80, rect.bottom + 6)}px`;
      dropdown.style.minWidth = `${width}px`;
      dropdown.style.zIndex = '9999999';
    }

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const videoId = getVideoIdFromUrl();
      if (!videoId) return;
      if (!quickSavePlaylistId) {
        dropBtn.click();
        return;
      }

      const isSaved = saveBtn.classList.contains('yt-qs-saved');
      try {
        if (isSaved) {
          await window.api.removeVideoFromPlaylist(saveBtn.dataset.savedPlaylistId || quickSavePlaylistId, videoId);
        } else {
          await window.api.addVideoToPlaylist(quickSavePlaylistId, videoId);
        }
        await updateQuickSaveButtonState(saveBtn, saveLabel);
        if (panelApi && panelApi.isOpen()) panelApi.loadPlaylists(true);
      } catch (err) {
        logContentError('Quick-save error:', err);
      }
    });

    dropBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== 'none';
      if (isOpen) {
        closeDropdown();
        return;
      }

      try {
        quickSavePlaylists = await window.api.getPlaylists({ force: true });
      } catch (err) {
        logContentError('Quick-save: failed to refresh playlists', err);
      }

      dropdown.innerHTML = '';
      quickSavePlaylists.forEach(p => {
        const item = document.createElement('div');
        item.className = 'yt-qs-dropdown-item';
        if (String(p.id) === String(quickSavePlaylistId)) item.classList.add('yt-qs-dropdown-item--active');
        item.textContent = p.name;
        item.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          quickSavePlaylistId = p.id;
          safeStorageSet({ quickSavePlaylistId });
          closeDropdown();
          await updateQuickSaveButtonState(saveBtn, saveLabel);
        });
        dropdown.appendChild(item);
      });

      if (quickSavePlaylists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-qs-dropdown-item';
        empty.textContent = 'No playlists';
        dropdown.appendChild(empty);
      }

      positionDropdown();
      dropdown.style.display = 'block';

      dropdownCloseController = new AbortController();
      document.addEventListener('click', (event) => {
        if (wrapper.contains(event.target) || dropdown.contains(event.target)) return;
        closeDropdown();
      }, { signal: dropdownCloseController.signal });
      window.addEventListener('resize', closeDropdown, { signal: dropdownCloseController.signal });
      window.addEventListener('scroll', closeDropdown, { signal: dropdownCloseController.signal, capture: true });
    });

    return { wrapper, saveBtn, saveLabel };
  }

  async function injectQuickSaveButton() {
    const target = findQuickSaveTarget();
    if (!target) return;

    let existing = document.getElementById('yt-qs-wrapper');
    if (existing && !hasQuickSaveButtons(existing)) {
      existing.remove();
      document.getElementById('yt-qs-dropdown')?.remove();
      existing = null;
    }

    if (existing) {
      revealManagedWatchControl(existing);
      if (existing.parentElement !== target || !isVisibleActionTarget(existing.parentElement)) {
        placeQuickSaveWrapper(target, existing);
      }
      const saveBtn = existing.querySelector('#yt-qs-save');
      const saveLabel = existing.querySelector('.yt-qs-label');
      if (saveBtn && saveLabel) {
        scheduleWatchStateTask('quick-save existing refresh', () => updateQuickSaveButtonState(saveBtn, saveLabel));
      }
      return;
    }

    const { wrapper, saveBtn, saveLabel } = buildQuickSaveButton();
    placeQuickSaveWrapper(target, wrapper);

    ensureQuickSaveInitialized()
      .then(() => updateQuickSaveButtonState(saveBtn, saveLabel))
      .catch(error => {
        logContentError('Quick-save: failed to initialize', error);
      });
  }

  let injectPending = false;

  function refreshMountedWatchControlState(force = false) {
    if (watchStateRefreshPromise) return;
    const now = Date.now();
    if (!force && now - lastWatchStateRefreshAt < WATCH_STATE_REFRESH_INTERVAL) return;

    const quickSaveWrapper = document.getElementById('yt-qs-wrapper');
    const saveBtn = quickSaveWrapper && quickSaveWrapper.querySelector('#yt-qs-save');
    const saveLabel = quickSaveWrapper && quickSaveWrapper.querySelector('.yt-qs-label');

    lastWatchStateRefreshAt = now;
    watchStateRefreshPromise = Promise.all([
      saveBtn && saveLabel
        ? ensureQuickSaveInitialized().then(() => updateQuickSaveButtonState(saveBtn, saveLabel))
        : Promise.resolve(),
      updateYtbActionButtonsState()
    ]).catch(error => {
      logContentError('Watch controls: failed to refresh state', error);
    }).finally(() => {
      watchStateRefreshPromise = null;
    });
  }

  function tryInjectWatchActions() {
    if (injectPending) return;
    if (window.location.pathname !== '/watch' || !getVideoIdFromUrl()) return;

    if (isQuickSaveMountedVisible() && isYtbActionsMountedVisible()) {
      refreshMountedWatchControlState();
      return;
    }
    if (!findQuickSaveTarget()) return;

    injectPending = true;
    Promise.all([
      injectQuickSaveButton(),
      injectYtbActionButtons()
    ]).finally(() => {
      injectPending = false;
    });
  }

  function ensureFloatingPanelToggle() {
    if (!panelApi || typeof panelApi.ensureFloatingToggle !== 'function') return;
    panelApi.ensureFloatingToggle();
  }

  function runWatchControlsCheck() {
    if (!extensionContextAlive) return;
    ensureFloatingPanelToggle();
    tryInjectWatchActions();
  }

  function scheduleWatchControlsCheck(delayMs) {
    if (!extensionContextAlive) return;
    const timeoutId = setTimeout(() => {
      watchControlsRetryIds.delete(timeoutId);
      runWatchControlsCheck();
    }, delayMs);
    watchControlsRetryIds.add(timeoutId);
  }

  function runWatchControlsRecovery() {
    [0, 250, 1000, 2500].forEach(scheduleWatchControlsCheck);
  }

  function startWatchControlsService() {
    watchControlsEventsController = new AbortController();
    const options = { signal: watchControlsEventsController.signal };

    window.addEventListener('focus', runWatchControlsRecovery, options);
    window.addEventListener('pageshow', runWatchControlsRecovery, options);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) runWatchControlsRecovery();
    }, options);

    watchControlsWatchdogId = setInterval(runWatchControlsCheck, 2000);
    runWatchControlsRecovery();
  }

  quickSaveObserver = new MutationObserver(() => {
    if (!extensionContextAlive || quickSaveObserverDebounce) return;
    quickSaveObserverDebounce = setTimeout(() => {
      quickSaveObserverDebounce = null;
      runWatchControlsCheck();
    }, 300);
  });

  quickSaveObserver.observe(document.body, { childList: true, subtree: true });
  startWatchControlsService();

  let videoStarted = false;
  let videoElWithListeners = null;
  let videoPlayListener = null;
  let videoEndedListener = null;

  function removeVideoFromActive(videoId) {
    if (!panelApi) return;
    panelApi.requestVideoRemoval(videoId, 'fully_watched');
  }

  function removeVideoPlayListeners() {
    if (videoElWithListeners && videoPlayListener) {
      videoElWithListeners.removeEventListener('play', videoPlayListener);
    }
    if (videoElWithListeners && videoEndedListener) {
      videoElWithListeners.removeEventListener('ended', videoEndedListener);
    }
    videoElWithListeners = null;
    videoPlayListener = null;
    videoEndedListener = null;
  }

  function attachVideoPlayListener() {
    if (videoPlayListener) return;
    const videoEl = document.querySelector('video');
    if (!videoEl) return;
    videoElWithListeners = videoEl;
    videoPlayListener = () => { videoStarted = true; };
    videoEl.addEventListener('play', videoPlayListener, { once: false });

    if (!videoEndedListener) {
      videoEndedListener = () => {
        if (!extensionContextAlive || !panelApi) return;
        if (panelApi.getRemoveAfterFullyWatched()) {
          const vid = getVideoIdFromUrl();
          if (vid) removeVideoFromActive(vid);
        }
      };
      videoEl.addEventListener('ended', videoEndedListener, { once: false });
    }
  }

  let lastVideoId = getVideoIdFromUrl();
  videoWatchTimerId = setInterval(() => {
    if (!extensionContextAlive) return;
    attachVideoPlayListener();
    runWatchControlsCheck();

    const currentVideoId = getVideoIdFromUrl();
    if (currentVideoId !== lastVideoId) {
      const prevVideoId = lastVideoId;
      const wasStarted = videoStarted;
      lastVideoId = currentVideoId;
      videoStarted = false;
      removeVideoPlayListeners();

      const existing = document.getElementById('yt-qs-wrapper');
      if (existing) existing.remove();
      document.getElementById('yt-qs-dropdown')?.remove();
      const existingActions = document.getElementById('ytb-actions-wrapper');
      if (existingActions) existingActions.remove();
      document.getElementById('ytb-ask-panel')?.remove();
      stopActiveCommentsSync('Comment sync stopped because this tab opened a different video.', { silent: true });
      hideYtbPreview();

      if (!panelApi) return;
      if (currentVideoId && panelApi.getGroupByAuthor()) {
        const newVideo = panelApi.getAllVideos().find(v => v.id === currentVideoId);
        if (newVideo && newVideo.author) panelApi.addExpandedGroup(newVideo.author);
      }

      if (panelApi.getRemoveOnSkip() && prevVideoId && panelApi.getCurrentPlaylistId()) {
        const isInPlaylist = panelApi.getAllVideos().some(v => v.id === prevVideoId);
        if (isInPlaylist) {
          panelApi.requestVideoRemoval(prevVideoId, 'skip');
        } else if (panelApi && panelApi.isOpen()) {
          panelApi.renderVideos();
        }
      } else if (panelApi && panelApi.isOpen() && panelApi.getCurrentPlaylistId()) {
        panelApi.renderVideos();
      }
    }
  }, 1000);

  runWatchControlsRecovery();
})();
