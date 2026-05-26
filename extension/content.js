(function() {
  if (window.__ytPlaylistAltContentReady) return;
  window.__ytPlaylistAltContentReady = true;

  document.getElementById('yt-playlist-alt-toggle')?.remove();
  document.getElementById('yt-playlist-alt-panel')?.remove();
  document.getElementById('yt-qs-wrapper')?.remove();
  document.getElementById('yt-qs-dropdown')?.remove();
  document.getElementById('ytb-actions-wrapper')?.remove();

  let extensionContextAlive = true;
  let quickSaveObserver = null;
  let quickSaveObserverDebounce = null;
  let videoWatchTimerId = null;
  let runtimeWatchdogId = null;
  let watchControlsWatchdogId = null;
  let watchControlsEventsController = null;
  const watchControlsRetryIds = new Set();
  let panelApi = null;
  const ytbPreview = window.ytbPreview.create({ id: 'ytb-actions-preview', maxWidth: 520, minWidth: 300 });
  const SYNC_PROGRESS_STATUS_KEY = 'playlist-sync-progress';
  const SYNC_CLEANUP_STATUS_KEY = 'playlist-sync-cleanup-progress';

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
    watchControlsRetryIds.forEach(id => clearTimeout(id));
    watchControlsRetryIds.clear();
    if (watchControlsEventsController) {
      watchControlsEventsController.abort();
      watchControlsEventsController = null;
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

    ytbPreview.destroy();
    document.getElementById('yt-playlist-alt-toggle')?.remove();
    document.getElementById('yt-playlist-alt-panel')?.remove();
    document.getElementById('yt-qs-wrapper')?.remove();
    document.getElementById('yt-qs-dropdown')?.remove();
    document.getElementById('ytb-actions-wrapper')?.remove();
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

  function extractVideoIdFromUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.origin);
      const id = parsed.searchParams.get('v');
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    } catch (e) {
      const match = String(url).match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : null;
    }
  }

  function parseDurationText(text) {
    if (!text) return 0;
    const parts = text.trim().split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function normalizeDomText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isUsablePlaylistTitle(value) {
    const text = normalizeDomText(value);
    return text && !/^\d+$/.test(text) && text !== 'Unknown Title';
  }

  function removeDurationFromAriaLabel(value) {
    return normalizeDomText(value).replace(
      /\s+(?:(?:\d+\s+hours?)(?:,\s*)?)?(?:(?:\d+\s+minutes?)(?:,\s*)?)?(?:\d+\s+seconds?)?$/i,
      ''
    );
  }

  function getNodeText(node, preferAria = false) {
    if (!node) return '';
    const values = preferAria
      ? [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent]
      : [node.getAttribute('title'), node.textContent, node.getAttribute('aria-label')];

    for (const value of values) {
      const text = normalizeDomText(value);
      if (text) return text;
    }

    return '';
  }

  function getTitleNodeText(node) {
    if (!node) return '';

    const title = normalizeDomText(node.getAttribute('title'));
    if (title) return title;

    const text = normalizeDomText(node.textContent);
    if (text) return text;

    return removeDurationFromAriaLabel(node.getAttribute('aria-label'));
  }

  function getPlaylistEntryTitle(node) {
    const selectors = [
      'a#video-title[title]',
      'span#video-title[title]',
      'a#video-title',
      'span#video-title',
      'h3 a[href*="/watch?v="][title]',
      'h4 #video-title[title]'
    ];

    for (const selector of selectors) {
      const candidate = node.querySelector(selector);
      const title = getTitleNodeText(candidate);
      if (isUsablePlaylistTitle(title)) return title;
    }

    const heading = node.querySelector('h3[aria-label], h4[aria-label]');
    const ariaTitle = removeDurationFromAriaLabel(getNodeText(heading, true));
    return isUsablePlaylistTitle(ariaTitle) ? ariaTitle : '';
  }

  function getPlaylistEntryAuthor(node) {
    const selectors = [
      '#byline[title]',
      '#byline a',
      'ytd-channel-name #text a',
      'ytd-channel-name a',
      '.ytd-channel-name a',
      '#channel-name #text',
      '#byline'
    ];

    for (const selector of selectors) {
      const candidate = node.querySelector(selector);
      const author = getNodeText(candidate);
      if (author) return author;
    }

    return '';
  }

  function getYoutubePlaylistSource() {
    const sourceId = new URLSearchParams(window.location.search).get('list');
    if (!sourceId) return null;

    const titleEl = document.querySelector('ytd-playlist-header-renderer h1, ytd-playlist-sidebar-primary-info-renderer h1, yt-formatted-string.title');
    const rawTitle = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
    const fallbackTitle = sourceId === 'WL' ? 'Watch Later' : 'YouTube playlist';
    const name = rawTitle || document.title.replace(/- YouTube$/, '').trim() || fallbackTitle;

    return {
      sourceType: 'youtube_playlist',
      sourceId,
      sourceUrl: window.location.href,
      name
    };
  }

  function getExpectedPlaylistVideoCount() {
    const statsText = Array.from(document.querySelectorAll([
      'ytd-playlist-header-renderer #stats',
      'ytd-playlist-sidebar-primary-info-renderer #stats',
      'yt-formatted-string#stats',
      '#stats'
    ].join(',')))
      .map(node => node.textContent || '')
      .join(' ');

    const match = statsText.match(/([0-9][0-9\s,.]*)\s*(?:videos?|відео)/i);
    if (!match) return null;

    const count = Number(match[1].replace(/[^\d]/g, ''));
    return Number.isFinite(count) && count > 0 ? count : null;
  }

  function getScrollMetrics() {
    const doc = document.documentElement;
    const body = document.body;
    const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
    const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight, doc.offsetHeight, body.offsetHeight);

    return {
      scrollTop,
      scrollHeight,
      nearBottom: scrollTop + window.innerHeight >= scrollHeight - 320
    };
  }

  function scrollToPosition(top) {
    window.scrollTo(0, top);
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
    window.dispatchEvent(new Event('scroll'));
  }

  function scrollDownForSync() {
    const metrics = getScrollMetrics();
    const step = Math.max(900, Math.floor(window.innerHeight * 1.25));
    scrollToPosition(Math.min(metrics.scrollTop + step, metrics.scrollHeight));
  }

  function holdAtBottomForSync() {
    scrollToPosition(getScrollMetrics().scrollHeight);
  }

  function collectLoadedPlaylistEntries() {
    const nodes = Array.from(document.querySelectorAll([
      'ytd-playlist-video-renderer',
      'ytd-playlist-panel-video-renderer',
      'ytd-rich-item-renderer'
    ].join(',')));
    const entries = [];
    const seen = new Set();

    nodes.forEach((node) => {
      const link = node.querySelector('a#video-title[href*="/watch?v="], a#wc-endpoint[href*="/watch?v="], a#thumbnail[href*="/watch?v="], a[href*="/watch?v="]');
      const videoId = extractVideoIdFromUrl(link && (link.href || link.getAttribute('href')));
      if (!videoId || seen.has(videoId)) return;

      const imgNode = node.querySelector('img');
      const durationNode = node.querySelector('ytd-thumbnail-overlay-time-status-renderer #text, .ytd-thumbnail-overlay-time-status-renderer, span#text');

      seen.add(videoId);
      entries.push({
        node,
        video: {
          id: videoId,
          title: getPlaylistEntryTitle(node),
          author: getPlaylistEntryAuthor(node),
          thumbnail: imgNode && imgNode.src && !imgNode.src.startsWith('data:') ? imgNode.src : '',
          duration: parseDurationText(durationNode && durationNode.textContent)
        }
      });
    });

    return entries;
  }

  function collectLoadedPlaylistVideos() {
    return collectLoadedPlaylistEntries().map(entry => entry.video);
  }


  function getVisibleMenuButton(node) {
    const selectors = [
      'ytd-menu-renderer yt-icon-button#button button',
      'ytd-menu-renderer button[aria-label]',
      'button[aria-label*="Action menu"]',
      'button[aria-label*="More actions"]',
      'yt-icon-button#button button',
      '#button button'
    ];

    for (const selector of selectors) {
      const button = node.querySelector(selector);
      if (button && !button.disabled) return button;
    }

    return null;
  }

  function getVisibleMenuItems() {
    const roots = Array.from(document.querySelectorAll([
      'ytd-popup-container',
      'ytd-menu-popup-renderer',
      'tp-yt-paper-listbox',
      'tp-yt-iron-dropdown'
    ].join(','))).filter(root => {
      const rect = root.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const searchRoots = roots.length ? roots : [document];
    const items = searchRoots.flatMap(root => Array.from(root.querySelectorAll([
      'ytd-menu-service-item-renderer',
      'ytd-menu-navigation-item-renderer',
      'tp-yt-paper-item'
    ].join(','))));

    return items.filter(item => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function isRemoveMenuText(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.includes('remove from watch later')) return true;
    if (normalized.includes('remove from playlist')) return true;
    if (normalized.includes('remove from')) return true;
    if (normalized.includes('видалити з')) return true;
    if (normalized.includes('удалить из')) return true;
    return false;
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

  async function cleanupRemovedYoutubeEntries(entries, cleanup) {
    if (!cleanup || !cleanup.enabled) return;

    for (const entry of entries) {
      const videoId = entry.video.id;
      if (!cleanup.ids.has(videoId) || cleanup.attempted.has(videoId)) continue;

      cleanup.attempted.add(videoId);
      panelApi.setSyncStatus(`Cleaning YouTube playlist... ${cleanup.removed + cleanup.failed + 1}/${cleanup.ids.size}`, 'busy', {
        key: SYNC_CLEANUP_STATUS_KEY
      });

      const result = await removeYoutubePlaylistEntry(entry);
      if (result.success) {
        cleanup.removed++;
        try {
          await window.api.markYoutubeCleanup(cleanup.playlistId, videoId, 'removed');
        } catch (error) {
          console.warn(`YouTube cleanup state was not saved for ${videoId}: ${error.message || error}`);
        }
      } else {
        cleanup.failed++;
        try {
          await window.api.markYoutubeCleanup(cleanup.playlistId, videoId, 'failed', result.error);
        } catch (error) {
          console.warn(`YouTube cleanup failure state was not saved for ${videoId}: ${error.message || error}`);
        }
        console.warn(`YouTube cleanup skipped ${videoId}: ${result.error}`);
      }

      await delay(250);
    }
  }

  async function sendSyncVideos(runId, videos, seenIds) {
    const pending = [];
    for (const video of videos) {
      if (seenIds.has(video.id)) continue;
      seenIds.add(video.id);
      pending.push({ ...video, sortOrder: seenIds.size });
    }

    for (let i = 0; i < pending.length; i += 50) {
      await window.api.sendSyncBatch(runId, pending.slice(i, i + 50));
    }

    return pending.length;
  }

  async function collectAndSendSyncVideos(runId, seenIds, cleanup = null) {
    const entries = collectLoadedPlaylistEntries();
    await cleanupRemovedYoutubeEntries(entries, cleanup);
    return sendSyncVideos(runId, entries.map(entry => entry.video), seenIds);
  }

  async function waitForPlaylistProgress(runId, seenIds, previousHeight, timeoutMs, cleanup = null) {
    const deadline = Date.now() + timeoutMs;
    let addedTotal = 0;
    let heightChanged = false;

    while (Date.now() < deadline) {
      await delay(500);

      const added = await collectAndSendSyncVideos(runId, seenIds, cleanup);
      addedTotal += added;

      const metrics = getScrollMetrics();
      if (metrics.scrollHeight > previousHeight + 24) {
        heightChanged = true;
      }

      if (added > 0 || heightChanged) {
        return { added: addedTotal, heightChanged };
      }

      if (metrics.nearBottom) holdAtBottomForSync();
      else scrollDownForSync();
    }

    return { added: addedTotal, heightChanged };
  }


  async function performPlaylistSync({ playlistId, source, cleanupYoutube, panel }) {
    const seenIds = new Set();
    let run = null;
    let playlist = null;

    try {
      panel.setSyncStatus('Starting sync...', 'busy');
      const started = await window.api.startSync({
        ...source,
        playlistId
      });
      run = started.run;
      playlist = started.playlist;
      panel.setCurrentPlaylistId(playlist.id);

      const cleanupVideos = await window.api.getYoutubeCleanupPendingVideos(playlist.id);
      const cleanup = cleanupYoutube && cleanupVideos.length > 0
        ? {
            enabled: true,
            playlistId: playlist.id,
            ids: new Set(cleanupVideos.map(video => video.id)),
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

      for (let round = 0; round < 1600; round++) {
        const addedNow = await collectAndSendSyncVideos(run.id, seenIds, cleanup);
        const metrics = getScrollMetrics();
        const expectedSuffix = expectedCount ? ` / ${expectedCount}` : '';
        panel.setSyncStatus(`Synced ${seenIds.size}${expectedSuffix} videos. Loading more...`, 'busy', {
          key: SYNC_PROGRESS_STATUS_KEY
        });

        if (metrics.nearBottom) holdAtBottomForSync();
        else scrollDownForSync();

        const progress = await waitForPlaylistProgress(run.id, seenIds, metrics.scrollHeight, 3000, cleanup);
        const madeProgress = addedNow > 0 || progress.added > 0 || progress.heightChanged;

        if (madeProgress) {
          idleBottomRounds = 0;
          hardIdleRounds = 0;
          continue;
        }

        hardIdleRounds++;
        if (getScrollMetrics().nearBottom) idleBottomRounds++;
        else idleBottomRounds = 0;

        if (expectedCount && seenIds.size < expectedCount) {
          panel.setSyncStatus(`Synced ${seenIds.size} / ${expectedCount}. Waiting for YouTube to load more...`, 'busy', {
            key: SYNC_PROGRESS_STATUS_KEY
          });
          if (hardIdleRounds >= 12 && getScrollMetrics().nearBottom) {
            const missingCount = expectedCount - seenIds.size;
            shortfallWarning = ` YouTube lists ${expectedCount}, but only ${seenIds.size} video IDs loaded; ${missingCount} are probably unavailable placeholders.`;
            break;
          }
          continue;
        }

        if (idleBottomRounds >= 10) break;
      }

      await collectAndSendSyncVideos(run.id, seenIds, cleanup);

      const finalExpectedCount = getExpectedPlaylistVideoCount();
      if (finalExpectedCount && seenIds.size < finalExpectedCount) {
        const missingCount = finalExpectedCount - seenIds.size;
        shortfallWarning = shortfallWarning || ` YouTube lists ${finalExpectedCount}, but only ${seenIds.size} video IDs loaded; ${missingCount} are probably unavailable placeholders.`;
      }

      panel.setSyncStatus('Checking missing videos from DB...', 'busy');
      const finalized = await window.api.finalizeSync(run.id, playlist.id, {
        skipMissingCheck: !!shortfallWarning
      });
      const summary = finalized.run;

      if (cleanup && !shortfallWarning) {
        const notFoundIds = Array.from(cleanup.ids).filter(id => !cleanup.attempted.has(id));
        for (const videoId of notFoundIds) {
          try {
            await window.api.markYoutubeCleanup(cleanup.playlistId, videoId, 'removed');
            cleanup.alreadyGone++;
          } catch (error) {
            cleanup.failed++;
            console.warn(`YouTube cleanup not-found state was not saved for ${videoId}: ${error.message || error}`);
          }
        }
      }

      const cleanupSummary = cleanup
        ? ` YouTube cleanup removed ${cleanup.removed}, already gone ${cleanup.alreadyGone}, failed ${cleanup.failed}, not found ${Math.max(0, cleanup.ids.size - cleanup.attempted.size - cleanup.alreadyGone)}.`
        : '';
      const doneMessage = `Done. Seen ${summary.seen_count}, new ${summary.added_count}, missing ${summary.removed_count}, unavailable ${summary.unavailable_count}.${cleanupSummary}${shortfallWarning}`;
      panel.setSyncStatus(doneMessage, 'success');
      await panel.loadPlaylists(true);
      await panel.loadVideos(true);
      return { success: true, message: doneMessage, state: 'success' };
    } catch (err) {
      const message = err.message || 'Sync failed.';
      if (run && run.id) {
        window.api.failSync(run.id, message).catch(() => {});
      }
      panel.setSyncStatus(message, 'error');
      console.error('Playlist sync failed:', err);
      return { success: false, error: message };
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
    openVideo: openVideoFromPanel,
    onVideosChanged: updateWatchControlsAfterPanelChange
  });

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

    return false;
  });

  let quickSavePlaylistId = null;
  let quickSavePlaylists = [];
  let quickSaveInitPromise = null;
  let watchStateRefreshPromise = null;
  let lastWatchStateRefreshAt = 0;
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

  function getVideoIdFromUrl() {
    return new URLSearchParams(window.location.search).get('v');
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '…' : str;
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
    const playlists = await window.api.getVideoPlaylists(videoId);
    if (playlists.length > 0) return playlists[0];

    const ungrouped = await getOrCreateUngroupedPlaylist();
    await window.api.addVideoToPlaylist(ungrouped.id, videoId);
    return ungrouped;
  }

  function setYtbActionButtonState(button, ready, busy = false, disabled = false) {
    button.classList.toggle('ytb-action-btn--ready', !!ready);
    button.classList.toggle('ytb-action-btn--missing', !ready);
    button.classList.toggle('ytb-action-btn--busy', !!busy);
    button.disabled = !!disabled;
    if (busy) button.innerHTML = '<span class="ytb-action-spinner"></span>';
  }

  async function getActiveSummaryMode() {
    try {
      const settings = await window.api.getSummarySettings();
      return settings.summary_mode || settings.summaryMode || 'plain';
    } catch {
      return 'plain';
    }
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
    const summaryBtn = wrapper.querySelector('[data-ytb-action="summary"]');
    if (!transcriptBtn || !summaryBtn) return;

    try {
      const [transcriptStatus, summaryStatus, summaryMode] = await Promise.all([
        withWatchTimeout(window.api.getTranscriptStatus(videoId, { force: true }), 8000, 'getTranscriptStatus'),
        withWatchTimeout(window.api.getSummaryStatus(videoId, { force: true }), 8000, 'getSummaryStatus'),
        withWatchTimeout(getActiveSummaryMode(), 8000, 'getActiveSummaryMode')
      ]);
      setYtbActionButtonState(transcriptBtn, !!transcriptStatus.hasTranscript);
      transcriptBtn.title = transcriptStatus.hasTranscript
        ? 'Transcript ready'
        : transcriptStatus.transcriptUnavailable ? 'Transcript unavailable' : 'Fetch transcript';
      const hasSummary = summaryMode === 'html' ? !!summaryStatus.hasHtmlSummary : !!summaryStatus.hasSummary;
      const summaryBlocked = !transcriptStatus.hasTranscript;
      setYtbActionButtonState(summaryBtn, hasSummary, false, summaryBlocked);
      summaryBtn.title = summaryBlocked
        ? 'Fetch transcript first'
        : hasSummary
        ? `${summaryMode === 'html' ? 'HTML summary' : 'Summary'} ready`
        : `Generate ${summaryMode === 'html' ? 'HTML summary' : 'summary'}`;
      transcriptBtn.textContent = 'T';
      summaryBtn.textContent = 'S';
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
    if (!videoId || button.classList.contains('ytb-action-btn--busy')) return;

    setYtbActionButtonState(button, button.classList.contains('ytb-action-btn--ready'), true);

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
    }
  }

  async function handleYtbSummaryClick(button) {
    const videoId = getVideoIdFromUrl();
    if (!videoId || button.disabled || button.classList.contains('ytb-action-btn--busy')) return;

    setYtbActionButtonState(button, button.classList.contains('ytb-action-btn--ready'), true);

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
      if (hasSummary) {
        await updateYtbActionButtonsState();
        return;
      }
      await window.api.requestSummary(videoId, summaryMode);
      await updateYtbActionButtonsState();
      if (panelApi && panelApi.isOpen()) panelApi.loadVideos();
    } catch (error) {
      logContentError('YTB summary action failed', error);
      button.textContent = '!';
      setTimeout(updateYtbActionButtonsState, 1200);
    }
  }

  function buildYtbActionButtons() {
    const wrapper = document.createElement('div');
    wrapper.id = 'ytb-actions-wrapper';

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

    const summaryBtn = document.createElement('button');
    summaryBtn.type = 'button';
    summaryBtn.className = 'ytb-action-btn ytb-action-btn--missing';
    summaryBtn.dataset.ytbAction = 'summary';
    summaryBtn.title = 'Generate summary';
    summaryBtn.textContent = 'S';
    summaryBtn.addEventListener('click', event => {
      event.stopPropagation();
      handleYtbSummaryClick(summaryBtn);
    });
    summaryBtn.addEventListener('mouseenter', () => showYtbPreview(summaryBtn, 'summary'));
    summaryBtn.addEventListener('mouseleave', scheduleYtbPreviewHide);

    wrapper.appendChild(transcriptBtn);
    wrapper.appendChild(summaryBtn);
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
    return isMountedWatchControlVisible(wrapper, ['[data-ytb-action="transcript"]', '[data-ytb-action="summary"]']);
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
