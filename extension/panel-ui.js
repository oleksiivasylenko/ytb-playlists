(function() {
  function getPanelHtml(options = {}) {
    const closeButton = options.closeButton ? '<button id="yt-playlist-alt-close" class="yt-panel-header-button" title="Close" aria-label="Close"><span>&times;</span></button>' : '';
    return "<div id=\"yt-playlist-alt-panel\">\n    <div id=\"yt-playlist-alt-header\">\n      <div class=\"yt-playlist-alt-header-main\">\n        <h3>My Playlists</h3>\n        <div id=\"yt-playlist-alt-sync-status\" class=\"yt-sync-status\"></div>\n      </div>\n      <div class=\"yt-playlist-alt-header-actions\">\n      <button id=\"yt-playlist-alt-refresh\" class=\"yt-panel-header-button\" title=\"Refresh from server\" aria-label=\"Refresh from server\">\n        <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n          <path d=\"M21 12a9 9 0 0 1-15.2 6.5\"></path>\n          <path d=\"M3 12A9 9 0 0 1 18.2 5.5\"></path>\n          <path d=\"M18 2v4h-4\"></path>\n          <path d=\"M6 22v-4h4\"></path>\n        </svg>\n        <span>Refresh</span>\n      </button>\n      __CLOSE_BUTTON__\n    </div>\n    </div>\n\n    <div id=\"yt-playlist-alt-controls\">\n      <div class=\"yt-playlist-alt-row\">\n        <select id=\"yt-playlist-alt-select\"></select>\n        <button id=\"yt-playlist-alt-sync\">Sync Page</button>\n        <button id=\"yt-playlist-alt-scroll-current\" class=\"yt-playlist-alt-icon-button\" type=\"button\" title=\"Scroll to current video\" aria-label=\"Scroll to current video\">\n          <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n            <circle cx=\"12\" cy=\"12\" r=\"7\"></circle>\n            <circle cx=\"12\" cy=\"12\" r=\"2\"></circle>\n            <path d=\"M12 2v3\"></path>\n            <path d=\"M12 19v3\"></path>\n            <path d=\"M2 12h3\"></path>\n            <path d=\"M19 12h3\"></path>\n          </svg>\n        </button>\n      </div>\n      <div class=\"yt-playlist-alt-row\">\n        <input type=\"text\" id=\"yt-playlist-alt-search\" placeholder=\"Search...\">\n        <button id=\"yt-playlist-alt-filter-toggle\" class=\"yt-playlist-alt-icon-button yt-playlist-alt-filter-button\" title=\"Filters\" aria-label=\"Filters\">\n          <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n            <path d=\"M4 5h16l-6 7v5l-4 2v-7L4 5z\"></path>\n          </svg>\n        </button>\n      </div>\n      <div id=\"yt-playlist-alt-settings\">\n        <div class=\"yt-settings-section\">\n          <div class=\"yt-settings-label\">Date filter</div>\n          <div class=\"yt-playlist-alt-row yt-date-filter-row\">\n            <select id=\"yt-playlist-alt-date-field\" title=\"Date field\">\n              <option value=\"published_at\">Published</option>\n              <option value=\"added_at\">Added</option>\n            </select>\n            <select id=\"yt-playlist-alt-date-direction\" title=\"Date direction\">\n              <option value=\"newer\">Newer than</option>\n              <option value=\"older\">Older than</option>\n            </select>\n            <input type=\"number\" id=\"yt-playlist-alt-date-amount\" min=\"1\" step=\"1\" placeholder=\"N\">\n            <select id=\"yt-playlist-alt-date-unit\" title=\"Date unit\">\n              <option value=\"days\">days</option>\n              <option value=\"months\">months</option>\n              <option value=\"years\">years</option>\n            </select>\n          </div>\n        </div>\n        <div class=\"yt-settings-section\">\n          <div class=\"yt-settings-label\">Sort videos by</div>\n          <select id=\"yt-playlist-alt-sort\">\n            <option value=\"added-newest\">Date Added (Newest)</option>\n            <option value=\"added-oldest\">Date Added (Oldest)</option>\n            <option value=\"popular\">Most Popular</option>\n            <option value=\"published-newest\">Date Published (Newest)</option>\n            <option value=\"published-oldest\">Date Published (Oldest)</option>\n            <option value=\"duration-short\">Short to Long</option>\n            <option value=\"duration-long\">Long to Short</option>\n            <option value=\"title-asc\">Title (A to Z)</option>\n            <option value=\"title-desc\">Title (Z to A)</option>\n          </select>\n        </div>\n        <div class=\"yt-settings-section\" id=\"yt-group-sort-section\" style=\"display:none;\">\n          <div class=\"yt-settings-label\">Sort groups by</div>\n          <select id=\"yt-playlist-alt-group-sort\">\n            <option value=\"name-asc\">Name (A to Z)</option>\n            <option value=\"name-desc\">Name (Z to A)</option>\n            <option value=\"count-high\">Group Size (High to Low)</option>\n            <option value=\"count-low\">Group Size (Low to High)</option>\n            <option value=\"duration-high\">Total Duration (Long first)</option>\n            <option value=\"duration-low\">Total Duration (Short first)</option>\n          </select>\n        </div>\n        <div class=\"yt-settings-section\">\n          <div class=\"yt-settings-label\">View</div>\n          <select id=\"yt-playlist-alt-status-filter\">\n            <option value=\"active\">Active</option>\n            <option value=\"all\">All statuses</option>\n            <option value=\"removed_by_user\">Removed by you</option>\n            <option value=\"removed_from_source\">Removed from YouTube playlist</option>\n            <option value=\"unavailable_on_youtube\">Unavailable on YouTube</option>\n            <option value=\"missing\">Missing / unavailable</option>\n          </select>\n          <label class=\"yt-settings-toggle\">\n            <input type=\"checkbox\" id=\"yt-playlist-alt-group\">\n            <span class=\"yt-settings-toggle-track\"></span>\n            <span class=\"yt-settings-toggle-text\">Group by Author</span>\n          </label>\n        </div>\n        <div class=\"yt-settings-section\">\n          <div class=\"yt-settings-label\">Behaviour</div>\n          <label class=\"yt-settings-toggle\">\n            <input type=\"checkbox\" id=\"yt-playlist-alt-remove-fully-watched\">\n            <span class=\"yt-settings-toggle-track\"></span>\n            <span class=\"yt-settings-toggle-text\">Remove after fully watched</span>\n          </label>\n          <label class=\"yt-settings-toggle\">\n            <input type=\"checkbox\" id=\"yt-playlist-alt-remove-on-skip\">\n            <span class=\"yt-settings-toggle-track\"></span>\n            <span class=\"yt-settings-toggle-text\">Remove on skip / switch</span>\n          </label>\n        </div>\n      </div>\n    </div>\n\n    <div id=\"yt-playlist-alt-videos\"></div>\n  </div>".replace('__CLOSE_BUTTON__', closeButton);
  }

  function create(options = {}) {
    const mount = options.mount || document.body;
    const isFloating = options.mode === 'floating';
    if (!document.getElementById('yt-playlist-alt-panel')) {
      const template = document.createElement('template');
      template.innerHTML = getPanelHtml({ closeButton: isFloating });
      mount.appendChild(template.content.cloneNode(true));
    }
  const select = document.getElementById('yt-playlist-alt-select');
  const syncBtn = document.getElementById('yt-playlist-alt-sync');
  const scrollCurrentBtn = document.getElementById('yt-playlist-alt-scroll-current');
  const searchInput = document.getElementById('yt-playlist-alt-search');
  let searchClearBtn = document.getElementById('yt-playlist-alt-search-clear');
  const settings = document.getElementById('yt-playlist-alt-settings');
  const filterToggle = document.getElementById('yt-playlist-alt-filter-toggle');
  const sortSelect = document.getElementById('yt-playlist-alt-sort');
  const groupSortSelect = document.getElementById('yt-playlist-alt-group-sort');
  const groupSortSection = document.getElementById('yt-group-sort-section');
  const groupByAuthorInput = document.getElementById('yt-playlist-alt-group');
  const statusFilterSelect = document.getElementById('yt-playlist-alt-status-filter');
  const dateFilterField = document.getElementById('yt-playlist-alt-date-field');
  const dateFilterDirection = document.getElementById('yt-playlist-alt-date-direction');
  const dateFilterAmount = document.getElementById('yt-playlist-alt-date-amount');
  const dateFilterUnit = document.getElementById('yt-playlist-alt-date-unit');
  let tagFilterField = document.getElementById('yt-playlist-alt-tag-filter');
  let tagFilterChips = document.getElementById('yt-playlist-alt-tag-filter-chips');
  let tagFilterInput = document.getElementById('yt-playlist-alt-tag-filter-input');
  let tagSuggestions = document.getElementById('yt-playlist-alt-tag-suggestions');
  const removeFullyWatchedInput = document.getElementById('yt-playlist-alt-remove-fully-watched');
  const removeOnSkipInput = document.getElementById('yt-playlist-alt-remove-on-skip');
  const videoList = document.getElementById('yt-playlist-alt-videos');
  const refreshBtn = document.getElementById('yt-playlist-alt-refresh');
  const panel = document.getElementById('yt-playlist-alt-panel');
  if (!sortSelect.querySelector('option[value="least-popular"]')) {
    const leastPopularOption = document.createElement('option');
    leastPopularOption.value = 'least-popular';
    leastPopularOption.textContent = 'Least Popular';
    const popularOption = sortSelect.querySelector('option[value="popular"]');
    if (popularOption) popularOption.insertAdjacentElement('afterend', leastPopularOption);
    else sortSelect.appendChild(leastPopularOption);
  }
  if (!document.getElementById('yt-playlist-alt-auto-transcript')) {
    const automationSection = document.createElement('div');
    automationSection.className = 'yt-settings-section';

    const automationLabel = document.createElement('div');
    automationLabel.className = 'yt-settings-label';
    automationLabel.textContent = 'Automation';

    const automationRow = document.createElement('div');
    automationRow.className = 'yt-playlist-alt-row yt-auto-assets-row';

    const autoTranscriptButton = document.createElement('button');
    autoTranscriptButton.id = 'yt-playlist-alt-auto-transcript';
    autoTranscriptButton.className = 'yt-playlist-alt-auto-button';
    autoTranscriptButton.type = 'button';
    autoTranscriptButton.textContent = 'Auto T';
    autoTranscriptButton.title = 'Start auto transcript for the current view';
    autoTranscriptButton.setAttribute('aria-label', autoTranscriptButton.title);

    const autoSummaryButton = document.createElement('button');
    autoSummaryButton.id = 'yt-playlist-alt-auto-summary';
    autoSummaryButton.className = 'yt-playlist-alt-auto-button';
    autoSummaryButton.type = 'button';
    autoSummaryButton.textContent = 'Auto S';
    autoSummaryButton.title = 'Start auto summary for the current view';
    autoSummaryButton.setAttribute('aria-label', autoSummaryButton.title);

    const autoTagButton = document.createElement('button');
    autoTagButton.id = 'yt-playlist-alt-auto-tag';
    autoTagButton.className = 'yt-playlist-alt-auto-button';
    autoTagButton.type = 'button';
    autoTagButton.textContent = 'Auto Tag';
    autoTagButton.title = 'Start auto tag for the current view';
    autoTagButton.setAttribute('aria-label', autoTagButton.title);

    automationRow.appendChild(autoTranscriptButton);
    automationRow.appendChild(autoSummaryButton);
    automationRow.appendChild(autoTagButton);
    automationSection.appendChild(automationLabel);
    automationSection.appendChild(automationRow);
    settings.appendChild(automationSection);
  }
  const autoTranscriptBtn = document.getElementById('yt-playlist-alt-auto-transcript');
  const autoSummaryBtn = document.getElementById('yt-playlist-alt-auto-summary');
  const autoTagBtn = document.getElementById('yt-playlist-alt-auto-tag');
  if (!searchClearBtn) {
    const searchField = document.createElement('div');
    searchField.className = 'yt-playlist-alt-search-field';
    searchInput.insertAdjacentElement('beforebegin', searchField);
    searchField.appendChild(searchInput);

    searchClearBtn = document.createElement('button');
    searchClearBtn.id = 'yt-playlist-alt-search-clear';
    searchClearBtn.className = 'yt-playlist-alt-search-clear';
    searchClearBtn.type = 'button';
    searchClearBtn.title = 'Clear search';
    searchClearBtn.setAttribute('aria-label', 'Clear search');
    searchClearBtn.innerHTML = '&times;';
    searchClearBtn.hidden = true;
    searchField.appendChild(searchClearBtn);
  }
  const searchRow = searchInput.closest('.yt-playlist-alt-row');
  let panelInfo = document.getElementById('yt-playlist-alt-panel-info');
  if (!panelInfo) {
    panelInfo = document.createElement('div');
    panelInfo.id = 'yt-playlist-alt-panel-info';
    panelInfo.className = 'yt-playlist-alt-panel-info';
    searchRow.insertAdjacentElement('afterend', panelInfo);
  }

  if (!statusFilterSelect.querySelector('option[value="youtube_cleanup_pending"]')) {
    const pendingCleanupOption = document.createElement('option');
    pendingCleanupOption.value = 'youtube_cleanup_pending';
    pendingCleanupOption.textContent = 'Pending YouTube cleanup';
    const removedFromSourceOption = statusFilterSelect.querySelector('option[value="removed_from_source"]');
    statusFilterSelect.insertBefore(pendingCleanupOption, removedFromSourceOption);
  }
  if (!statusFilterSelect.querySelector('option[value="moved_to_playlist"]')) {
    const movedOption = document.createElement('option');
    movedOption.value = 'moved_to_playlist';
    movedOption.textContent = 'Moved to another list';
    const removedFromSourceOption = statusFilterSelect.querySelector('option[value="removed_from_source"]');
    statusFilterSelect.insertBefore(movedOption, removedFromSourceOption);
  }
  if (!tagFilterField) {
    const tagSection = document.createElement('div');
    tagSection.className = 'yt-settings-section';
    tagSection.innerHTML = `
      <div class="yt-settings-label">Tags</div>
      <div id="yt-playlist-alt-tag-filter" class="yt-tag-filter-field">
        <div id="yt-playlist-alt-tag-filter-chips" class="yt-tag-filter-chips"></div>
        <input type="text" id="yt-playlist-alt-tag-filter-input" placeholder="Filter by tags..." autocomplete="off">
        <div id="yt-playlist-alt-tag-suggestions" class="yt-tag-suggestions" role="listbox"></div>
      </div>
    `;
    const viewSection = statusFilterSelect.closest('.yt-settings-section');
    viewSection.insertAdjacentElement('afterend', tagSection);
    tagFilterField = document.getElementById('yt-playlist-alt-tag-filter');
    tagFilterChips = document.getElementById('yt-playlist-alt-tag-filter-chips');
    tagFilterInput = document.getElementById('yt-playlist-alt-tag-filter-input');
    tagSuggestions = document.getElementById('yt-playlist-alt-tag-suggestions');
  }
  let toggleBtn = null;

  if (isFloating) {
    panel.style.display = 'none';
    if (!document.getElementById('yt-playlist-alt-resize-handle')) {
      const resizeHandle = document.createElement('div');
      resizeHandle.id = 'yt-playlist-alt-resize-handle';
      panel.insertBefore(resizeHandle, panel.firstChild);
    }

    toggleBtn = document.getElementById('yt-playlist-alt-toggle');
    if (!toggleBtn) {
      toggleBtn = document.createElement('button');
      toggleBtn.id = 'yt-playlist-alt-toggle';
      toggleBtn.type = 'button';
      toggleBtn.title = 'Open playlists panel';
      toggleBtn.setAttribute('aria-label', 'Open playlists panel');
      toggleBtn.innerHTML = '&#9776;';
      document.body.appendChild(toggleBtn);
    }
  }

  let currentPlaylistId = null;
  let playlists = [];
  let allVideos = [];
  const expandedGroups = new Set();
  let sortOption = 'added-newest';
  let groupSortOption = 'name-asc';
  let groupByAuthor = false;
  let statusFilter = 'active';
  let dateField = 'published_at';
  let dateDirection = 'newer';
  let dateAmount = '';
  let dateUnit = 'months';
  let selectedTagFilters = [];
  let activeTagSuggestionIndex = -1;
  let pendingRemovalRecords = [];
  const pendingRemovals = new Map();
  const selectedMoveVideoIds = new Set();
  const suppressMoveHoverVideoIds = new Set();
  let removalTimerId = null;
  let removalCommitInProgress = false;
  let syncInProgress = false;
  let syncStopInProgress = false;
  let syncRequestToken = 0;
  let lastSyncStatusText = '';
  let lastSyncStatusState = '';
  let lastSyncStatusKey = '';
  let lastSyncStatusShownAt = 0;
  let syncStatusTimerId = null;
  let syncStatusQueue = [];
  let currentPlayingVideoId = '';
  let extensionContextAlive = true;
  let summaryMode = 'plain';
  let tagDisplayLimit = 5;
  let autoTranscriptRun = null;
  let autoSummaryRun = null;
  let autoTagRun = null;
  let transcriptEventSource = null;
  let summaryEventSource = null;
  let fullscreenToggleTimerId = null;
  const preview = window.ytbPreview.create(options.previewOptions || { maxWidth: 420, minWidth: 260 });
  const transcriptLoads = new Set();
  const summaryLoads = new Set();
  const tagLoads = new Set();
  const REMOVAL_DELAY_MS = 5000;
  const MOVE_DESELECT_HOLD_MS = 1000;
  const SYNC_STATUS_DISPLAY_MS = 1500;
  const SYNC_BUSY_STATUS_TTL_MS = 22 * 60 * 1000;
  const AUTO_TRANSCRIPT_STATUS_KEY = 'auto-transcript-progress';
  const AUTO_SUMMARY_STATUS_KEY = 'auto-summary-progress';
  const AUTO_TAG_STATUS_KEY = 'auto-tag-progress';

  function cleanupPanelRuntime() {
    if (autoTranscriptRun) autoTranscriptRun.cancelled = true;
    if (autoSummaryRun) autoSummaryRun.cancelled = true;
    if (autoTagRun) autoTagRun.cancelled = true;
    preview.destroy();
    if (removalTimerId) {
      clearInterval(removalTimerId);
      removalTimerId = null;
    }
    if (syncStatusTimerId) {
      clearTimeout(syncStatusTimerId);
      syncStatusTimerId = null;
    }
    if (transcriptEventSource) {
      transcriptEventSource.close();
      transcriptEventSource = null;
    }
    if (summaryEventSource) {
      summaryEventSource.close();
      summaryEventSource = null;
    }
    if (fullscreenToggleTimerId) {
      clearInterval(fullscreenToggleTimerId);
      fullscreenToggleTimerId = null;
    }
    document.removeEventListener('fullscreenchange', updateFloatingToggleVisibility);
    document.removeEventListener('webkitfullscreenchange', updateFloatingToggleVisibility);
    window.removeEventListener('resize', updateFloatingToggleVisibility);
    transcriptLoads.clear();
    summaryLoads.clear();
    tagLoads.clear();
    selectedMoveVideoIds.clear();
    suppressMoveHoverVideoIds.clear();
    syncStatusQueue = [];
    if (options.onCleanup) options.onCleanup();
  }

  function isExtensionContextError(error) {
    const message = String(error && (error.message || error) || '');
    return message.includes('Extension context invalidated') ||
      message.includes('Extension context was invalidated') ||
      message.includes('context invalidated');
  }

  function disableInvalidatedPanel() {
    if (!extensionContextAlive) return;
    extensionContextAlive = false;
    if (removalTimerId) {
      clearInterval(removalTimerId);
      removalTimerId = null;
    }
    syncInProgress = false;
    syncStopInProgress = false;
    updateSyncButtonState();
    syncBtn.disabled = true;
    refreshBtn.disabled = true;
    setSyncStatus('Extension was reloaded. Reopen the panel.', 'error');
    if (options.onInvalidated) options.onInvalidated();
  }

  function updateSyncButtonState() {
    syncBtn.textContent = syncInProgress
      ? syncStopInProgress ? 'Stopping...' : 'Stop Sync'
      : 'Sync Page';
    syncBtn.classList.toggle('yt-sync-stop-button', syncInProgress);
    syncBtn.disabled = !extensionContextAlive || syncStopInProgress;
    syncBtn.title = syncInProgress ? 'Stop current sync' : 'Sync current YouTube page';
    syncBtn.setAttribute('aria-label', syncBtn.title);
  }

  function setSyncRunning(running) {
    syncInProgress = !!running;
    if (!syncInProgress) syncStopInProgress = false;
    updateSyncButtonState();
  }

  function handleExtensionContextError(error) {
    if (!isExtensionContextError(error)) return false;
    disableInvalidatedPanel();
    return true;
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

  function safeStorageOnChanged(listener) {
    if (!extensionContextAlive) return;
    try {
      chrome.storage.onChanged.addListener(listener);
    } catch (error) {
      handleExtensionContextError(error);
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise(resolve => {
      if (!extensionContextAlive) {
        resolve({ success: false, error: 'Extension context is not available.' });
        return;
      }

      try {
        chrome.runtime.sendMessage(message, response => {
          let error = null;
          try {
            error = chrome.runtime && chrome.runtime.lastError;
          } catch (err) {
            error = err;
          }

          if (error) {
            handleExtensionContextError(error);
            resolve({ success: false, error: error.message });
            return;
          }
          resolve(response || { success: false, error: 'Empty extension response.' });
        });
      } catch (error) {
        if (handleExtensionContextError(error)) {
          resolve({ success: false, error: 'Extension context is not available.' });
          return;
        }
        resolve({ success: false, error: error.message || 'Extension request failed.' });
      }
    });
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

  window.addEventListener('pagehide', cleanupPanelRuntime);
  window.addEventListener('beforeunload', cleanupPanelRuntime);

  function isSameSyncStatus(first, second) {
    return !!first &&
      !!second &&
      first.text === second.text &&
      first.state === second.state &&
      (first.key || '') === (second.key || '');
  }

  function persistSyncStatus(status) {
    if (!status.persist || !options.syncStatusStorageKey) return;

    safeStorageSet({
      [options.syncStatusStorageKey]: {
        text: status.text,
        state: status.state,
        key: status.key,
        ts: Date.now()
      }
    });
  }

  function applySyncStatus(status) {
    const el = document.getElementById('yt-playlist-alt-sync-status');
    if (!el) {
      clearSyncStatusTimer();
      syncStatusQueue = [];
      return;
    }

    el.textContent = status.text;
    el.title = status.text || '';
    el.className = status.state ? `yt-sync-status yt-sync-status--${status.state}` : 'yt-sync-status';
    lastSyncStatusText = status.text;
    lastSyncStatusState = status.state;
    lastSyncStatusKey = status.key || '';
    lastSyncStatusShownAt = Date.now();
    persistSyncStatus(status);
  }

  function showNextSyncStatus() {
    syncStatusTimerId = null;
    const nextStatus = syncStatusQueue.shift();
    if (!nextStatus) return;

    applySyncStatus(nextStatus);
    if (syncStatusQueue.length > 0) scheduleNextSyncStatus();
  }

  function scheduleNextSyncStatus() {
    if (syncStatusTimerId || syncStatusQueue.length === 0) return;

    const elapsed = Date.now() - lastSyncStatusShownAt;
    const waitMs = Math.max(SYNC_STATUS_DISPLAY_MS - elapsed, 0);
    syncStatusTimerId = setTimeout(showNextSyncStatus, waitMs);
  }

  function clearSyncStatusTimer() {
    if (!syncStatusTimerId) return;
    clearTimeout(syncStatusTimerId);
    syncStatusTimerId = null;
  }

  function replaceQueuedSyncStatus(status) {
    if (!status.key) return false;

    const index = syncStatusQueue.findIndex(item => item.key === status.key);
    if (index < 0) return false;

    syncStatusQueue[index] = status;
    return true;
  }

  function enqueueSyncStatus(status) {
    const currentStatus = {
      text: lastSyncStatusText,
      state: lastSyncStatusState,
      key: lastSyncStatusKey
    };
    const queuedStatus = syncStatusQueue[syncStatusQueue.length - 1];

    if (isSameSyncStatus(currentStatus, status) || isSameSyncStatus(queuedStatus, status)) return;

    if (!status.text && !status.state) {
      syncStatusQueue = [];
      clearSyncStatusTimer();
      applySyncStatus(status);
      return;
    } else {
      syncStatusQueue = syncStatusQueue.filter(item => item.text || item.state);
      if (status.state === 'success' || status.state === 'error') {
        syncStatusQueue = syncStatusQueue.filter(item => item.state !== 'busy');
      }
    }

    if (replaceQueuedSyncStatus(status)) {
      scheduleNextSyncStatus();
      return;
    }

    const elapsed = Date.now() - lastSyncStatusShownAt;
    if (syncStatusQueue.length === 0 && (!lastSyncStatusText || elapsed >= SYNC_STATUS_DISPLAY_MS)) {
      clearSyncStatusTimer();
      applySyncStatus(status);
      return;
    }

    syncStatusQueue.push(status);
    scheduleNextSyncStatus();
  }

  function setSyncStatus(text, state = '', statusOptions = {}) {
    enqueueSyncStatus({
      text: text || '',
      state: state || '',
      key: statusOptions.key || '',
      persist: statusOptions.persist !== false
    });
  }

  function connectTranscriptEvents() {
    if (transcriptEventSource || !window.EventSource || !window.api.getTranscriptEventsUrl) return;

    transcriptEventSource = new EventSource(window.api.getTranscriptEventsUrl());
    transcriptEventSource.addEventListener('transcript', event => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!payload || payload.type !== 'transcript_ready' || !payload.videoId) return;
      const updated = updateVideoState(payload.videoId, video => {
        return {
          has_transcript: 1,
          has_timestamped_transcript: 1,
          transcript_fetched_at: payload.fetchedAt || video.transcript_fetched_at,
          transcript_unavailable: 0,
          transcript_unavailable_at: null,
          transcript_unavailable_reason: null
        };
      });

      transcriptLoads.delete(payload.videoId);
      if (updated) {
        updateVideoAssetButtons(updated);
        if (!autoTranscriptRun) setSyncStatus('Transcript is ready.', 'success', { persist: false });
      }
    });

    transcriptEventSource.addEventListener('transcript', event => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!payload || payload.type !== 'transcript_unavailable' || !payload.videoId) return;
      const updated = updateVideoState(payload.videoId, {
        transcript_unavailable: 1,
        transcript_unavailable_at: payload.transcriptUnavailableAt || null,
        transcript_unavailable_reason: payload.transcriptUnavailableReason || null
      });

      transcriptLoads.delete(payload.videoId);
      if (updated) updateVideoAssetButtons(updated);
    });

    transcriptEventSource.onerror = () => {
      transcriptEventSource.close();
      transcriptEventSource = null;
      setTimeout(connectTranscriptEvents, 3000);
    };
  }

  function connectSummaryEvents() {
    if (summaryEventSource || !window.EventSource || !window.api.getSummaryEventsUrl) return;

    summaryEventSource = new EventSource(window.api.getSummaryEventsUrl());
    summaryEventSource.addEventListener('summary', event => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!payload || !payload.videoId) return;
      if (payload.type === 'tags_ready') {
        const updated = updateVideoState(payload.videoId, {
          tags_json: JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
          tags_updated_at: payload.updatedAt || new Date().toISOString()
        });

        tagLoads.delete(payload.videoId);
        renderTagSuggestions();
        if (updated) {
          updateVideoAssetButtons(updated);
          if (selectedTagFilters.length > 0) renderVideos();
          else updateVideoTagsDisplay(updated);
          if (!autoTagRun) setSyncStatus('Tags are ready.', 'success', { persist: false });
        }
        return;
      }

      if (payload.type !== 'summary_ready') return;
      const updated = updateVideoState(payload.videoId, video => {
        const updates = payload.mode === 'html'
          ? { has_html_summary: 1, html_summary_updated_at: payload.updatedAt || video.html_summary_updated_at }
          : { has_summary: 1, summary_updated_at: payload.updatedAt || video.summary_updated_at };
        return updates;
      });

      summaryLoads.delete(payload.videoId);
      if (updated) {
        updateVideoAssetButtons(updated);
        if (!autoSummaryRun) setSyncStatus('Summary is ready.', 'success', { persist: false });
      }
    });

    summaryEventSource.onerror = () => {
      summaryEventSource.close();
      summaryEventSource = null;
      setTimeout(connectSummaryEvents, 3000);
    };
  }

  function shouldShowStoredStatus(status) {
    if (!status || !status.text) return false;
    if (String(status.text).includes('sidePanel.open() may only be called')) return false;
    if (status.state === 'busy' && Number(status.ts) > 0 && Date.now() - Number(status.ts) > SYNC_BUSY_STATUS_TTL_MS) return false;
    return true;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForTransition(element, fallbackMs) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        element.removeEventListener('transitionend', onTransitionEnd);
        resolve();
      };
      const onTransitionEnd = event => {
        if (event.target === element && event.propertyName === 'height') finish();
      };

      element.addEventListener('transitionend', onTransitionEnd);
      setTimeout(finish, fallbackMs);
    });
  }

  async function collapseVideoElement(videoId) {
    const item = videoList.querySelector(`.yt-playlist-alt-video[data-video-id="${videoId}"]`);
    if (!item || item.classList.contains('yt-playlist-alt-video--collapsing')) return;

    item.style.height = `${item.offsetHeight}px`;
    item.style.overflow = 'hidden';
    item.style.boxSizing = 'border-box';
    item.classList.add('yt-playlist-alt-video--collapsing');

    await new Promise(requestAnimationFrame);
    item.style.height = '0px';
    item.style.paddingTop = '0px';
    item.style.paddingBottom = '0px';
    item.style.marginTop = '0px';
    item.style.marginBottom = '0px';

    await waitForTransition(item, 560);
  }

  function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatWatchHours(seconds) {
    const totalSeconds = Number(seconds);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0 hours';

    const hours = totalSeconds / 3600;
    if (hours < 1) return `${Math.ceil(totalSeconds / 60)} min`;
    if (hours < 10) return `${hours.toFixed(1).replace(/\.0$/, '')} hours`;
    return `${Math.round(hours)} hours`;
  }

  function formatRelativeDate(dateValue) {
    if (!dateValue) return '';
    const timestamp = toTimestamp(dateValue);
    if (!timestamp) return '';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    const units = [
      ['year', 365 * 24 * 60 * 60],
      ['month', 30 * 24 * 60 * 60],
      ['week', 7 * 24 * 60 * 60],
      ['day', 24 * 60 * 60],
      ['hour', 60 * 60],
      ['minute', 60]
    ];

    for (const [name, seconds] of units) {
      const value = Math.floor(elapsedSeconds / seconds);
      if (value >= 1) return `${value} ${name}${value === 1 ? '' : 's'} ago`;
    }

    return 'just now';
  }

  function toTimestamp(value) {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function getSortOrder(video) {
    const order = Number(video.sort_order);
    return Number.isFinite(order) ? order : 0;
  }

  function compareSortOrder(a, b) {
    return getSortOrder(a) - getSortOrder(b);
  }

  function formatCompactViews(viewCount) {
    const count = Number(viewCount);
    if (!Number.isFinite(count) || count <= 0) return '';

    const units = [
      [1000000000, 'bln'],
      [1000000, 'mln'],
      [1000, 'k']
    ];

    for (const [size, suffix] of units) {
      if (count >= size) {
        const value = count / size;
        const formatted = value >= 10
          ? Math.round(value).toString()
          : value.toFixed(1).replace(/\.0$/, '');
        return `${formatted}${suffix}`;
      }
    }

    return Math.round(count).toString();
  }

  function isUnavailable(video) {
    return video.status === 'unavailable_on_youtube' ||
      video.status === 'unavailable' ||
      video.title === 'Unknown Title' ||
      !video.title;
  }

  function normalizeVideoStatus(video) {
    return video.status || 'active';
  }

  function isYoutubeCleanupPending(video) {
    const status = normalizeVideoStatus(video);
    return (status === 'removed_by_user' || status === 'moved_to_playlist') && !video.youtube_removed_at;
  }

  function isMissingVideo(video) {
    const status = normalizeVideoStatus(video);
    return status === 'removed_from_source' ||
      status === 'removed' ||
      status === 'unavailable_on_youtube' ||
      status === 'unavailable' ||
      isUnavailable(video);
  }

  function getVideoStatusLabel(video) {
    const status = normalizeVideoStatus(video);
    if (status === 'moved_to_playlist') {
      const target = video.moved_to_playlist_name ? `: ${video.moved_to_playlist_name}` : '';
      return `Moved to another list${target}`;
    }
    if (isYoutubeCleanupPending(video)) return 'Pending YouTube cleanup';
    if (status === 'removed_by_user') return 'Removed by you';
    if (status === 'removed_from_source' || status === 'removed') return 'Removed from YouTube playlist';
    if (status === 'unavailable_on_youtube' || status === 'unavailable') return 'Unavailable on YouTube';
    return '';
  }

  function hasTranscript(video) {
    return video.has_transcript === 1 || video.has_transcript === true;
  }

  function isTranscriptUnavailable(video) {
    return video.transcript_unavailable === 1 ||
      video.transcript_unavailable === true ||
      video.transcriptUnavailable === true;
  }

  function hasSummary(video) {
    if (summaryMode === 'html') return video.has_html_summary === 1 || video.has_html_summary === true;
    return video.has_summary === 1 || video.has_summary === true;
  }

  function hasHtmlSummary(video) {
    return video.has_html_summary === 1 || video.has_html_summary === true;
  }

  function getVideoTags(video) {
    if (!video) return [];
    if (Array.isArray(video.tags)) return video.tags.filter(tag => typeof tag === 'string' && tag.trim());
    if (!video.tags_json) return [];

    try {
      const parsed = JSON.parse(video.tags_json);
      return Array.isArray(parsed) ? parsed.filter(tag => typeof tag === 'string' && tag.trim()) : [];
    } catch {
      return [];
    }
  }

  function hasTags(video) {
    return getVideoTags(video).length > 0;
  }

  function normalizeTagFilterValue(tag) {
    return typeof tag === 'string' ? tag.replace(/\s+/g, ' ').trim() : '';
  }

  function getTagFilterKey(tag) {
    return normalizeTagFilterValue(tag).toLowerCase();
  }

  function getUniqueVideoTags(videos = allVideos) {
    const tagsByKey = new Map();
    videos.forEach(video => {
      getVideoTags(video).forEach(tag => {
        const value = normalizeTagFilterValue(tag);
        const key = value.toLowerCase();
        if (value && !tagsByKey.has(key)) tagsByKey.set(key, value);
      });
    });

    return Array.from(tagsByKey.values()).sort((a, b) => a.localeCompare(b));
  }

  function getTagSuggestionVideos() {
    const activeDateFilter = buildDateFilter();
    const query = searchInput.value.trim().toLowerCase();
    return allVideos.filter(video => {
      if (!matchesStatusFilter(video)) return false;
      if (!matchesDateFilter(video, activeDateFilter)) return false;
      if (!matchesTagFilters(video)) return false;
      if (!query) return true;
      return matchesSearchQuery(video, query);
    });
  }

  function normalizeSelectedTagFilters(tags) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(tags) ? tags : []).forEach(tag => {
      const value = normalizeTagFilterValue(tag);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      normalized.push(value);
    });
    return normalized;
  }

  function resolveTagFilterValue(value) {
    const normalized = normalizeTagFilterValue(value);
    if (!normalized) return '';
    const key = normalized.toLowerCase();
    return getUniqueVideoTags(getTagSuggestionVideos()).find(tag => tag.toLowerCase() === key) || normalized;
  }

  function appendHighlightedTagText(element, tag, query) {
    const match = query ? tag.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (match < 0) {
      element.textContent = tag;
      return;
    }

    const before = tag.slice(0, match);
    const highlighted = tag.slice(match, match + query.length);
    const after = tag.slice(match + query.length);
    if (before) element.appendChild(document.createTextNode(before));

    const mark = document.createElement('span');
    mark.className = 'yt-tag-suggestion-highlight';
    mark.textContent = highlighted;
    element.appendChild(mark);

    if (after) element.appendChild(document.createTextNode(after));
  }

  function hideTagSuggestions() {
    if (!tagSuggestions) return;
    activeTagSuggestionIndex = -1;
    tagSuggestions.innerHTML = '';
    tagSuggestions.classList.remove('yt-tag-suggestions--open');
  }

  function getTagSuggestionItems() {
    return tagSuggestions ? Array.from(tagSuggestions.querySelectorAll('.yt-tag-suggestion')) : [];
  }

  function setActiveTagSuggestion(index) {
    const items = getTagSuggestionItems();
    if (items.length === 0) {
      activeTagSuggestionIndex = -1;
      return;
    }

    activeTagSuggestionIndex = (index + items.length) % items.length;
    items.forEach((item, itemIndex) => {
      const active = itemIndex === activeTagSuggestionIndex;
      item.classList.toggle('yt-tag-suggestion--active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function getActiveTagSuggestionValue() {
    if (!tagSuggestions) return '';
    const suggestions = getTagSuggestionItems();
    const selected = suggestions[activeTagSuggestionIndex] || suggestions[0];
    return selected ? selected.dataset.tag || selected.textContent || '' : '';
  }

  function renderTagSuggestions() {
    if (!tagSuggestions || !tagFilterInput) return;
    const selectedKeys = new Set(selectedTagFilters.map(getTagFilterKey));
    const query = tagFilterInput.value.trim();
    const queryKey = query.toLowerCase();
    if (!query) {
      hideTagSuggestions();
      return;
    }

    const suggestions = getUniqueVideoTags(getTagSuggestionVideos())
      .filter(tag => !selectedKeys.has(tag.toLowerCase()))
      .filter(tag => tag.toLowerCase().includes(queryKey))
      .slice(0, 80);

    tagSuggestions.innerHTML = '';
    tagSuggestions.classList.toggle('yt-tag-suggestions--open', suggestions.length > 0);
    suggestions.forEach(tag => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'yt-tag-suggestion';
      item.dataset.tag = tag;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      appendHighlightedTagText(item, tag, query);
      item.addEventListener('mouseenter', () => setActiveTagSuggestion(suggestions.indexOf(tag)));
      item.addEventListener('mousedown', event => {
        event.preventDefault();
        addTagFilter(tag);
      });
      tagSuggestions.appendChild(item);
    });
    setActiveTagSuggestion(0);
  }

  function renderSelectedTagFilters() {
    if (!tagFilterChips || !tagFilterInput) return;
    tagFilterChips.innerHTML = '';
    selectedTagFilters.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'yt-tag-filter-chip';
      chip.textContent = tag;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.title = `Remove ${tag}`;
      removeButton.setAttribute('aria-label', `Remove ${tag}`);
      removeButton.textContent = 'x';
      removeButton.addEventListener('click', () => removeTagFilter(tag));
      chip.appendChild(removeButton);

      tagFilterChips.appendChild(chip);
    });
    tagFilterInput.placeholder = selectedTagFilters.length ? '' : 'Filter by tags...';
    renderTagSuggestions();
  }

  function saveTagFilters() {
    safeStorageSet({ tagFilters: selectedTagFilters });
  }

  function addTagFilter(value) {
    const tag = resolveTagFilterValue(value);
    if (!tag) return false;
    const key = tag.toLowerCase();
    if (selectedTagFilters.some(item => item.toLowerCase() === key)) {
      tagFilterInput.value = '';
      renderTagSuggestions();
      return false;
    }

    selectedTagFilters = [...selectedTagFilters, tag];
    tagFilterInput.value = '';
    saveTagFilters();
    renderSelectedTagFilters();
    renderVideos();
    tagFilterInput.focus();
    return true;
  }

  function removeTagFilter(tag) {
    const key = getTagFilterKey(tag);
    selectedTagFilters = selectedTagFilters.filter(item => getTagFilterKey(item) !== key);
    saveTagFilters();
    renderSelectedTagFilters();
    renderVideos();
    tagFilterInput.focus();
  }

  function matchesTagFilters(video) {
    if (selectedTagFilters.length === 0) return true;
    const videoTagKeys = new Set(getVideoTags(video).map(getTagFilterKey));
    return selectedTagFilters.every(tag => videoTagKeys.has(getTagFilterKey(tag)));
  }

  async function loadAssetSettings() {
    try {
      const settings = await window.api.getSummarySettings();
      summaryMode = settings.summary_mode || settings.summaryMode || 'plain';
      const limit = Number(settings.tag_display_limit || settings.tagDisplayLimit);
      tagDisplayLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;
    } catch {
      summaryMode = 'plain';
      tagDisplayLimit = 5;
    }
  }

  function hasActiveFilters() {
    const hasDateFilter = Number(dateAmount) > 0;
    return statusFilter !== 'active' || hasDateFilter || selectedTagFilters.length > 0;
  }

  function updateSearchClearButton() {
    searchClearBtn.hidden = !searchInput.value;
  }

  function updateFilterButtonState() {
    const active = hasActiveFilters();
    filterToggle.classList.toggle('yt-playlist-alt-filter-button--active', active);
    filterToggle.title = active ? 'Filters active' : 'Filters';
    filterToggle.setAttribute('aria-label', active ? 'Filters active' : 'Filters');
  }

  function updatePanelInfo(videos = []) {
    const count = Array.isArray(videos) ? videos.length : 0;
    const totalDuration = Array.isArray(videos)
      ? videos.reduce((sum, video) => sum + (Number(video.duration) || 0), 0)
      : 0;

    panelInfo.textContent = `${count} ${count === 1 ? 'video' : 'videos'} shown - ${formatWatchHours(totalDuration)}`;
  }

  function hidePreview() {
    preview.hide();
  }

  function scheduleHidePreview() {
    preview.scheduleHide();
  }

  function handlePreviewRegenerated(video, result) {
    const { type, mode, payload } = result;
    if (type === 'transcript') {
      const updated = updateVideoState(video.id, item => ({
        has_transcript: 1,
        has_timestamped_transcript: payload.hasTimestampedTranscript ? 1 : item.has_timestamped_transcript,
        transcript_fetched_at: payload.fetchedAt,
        transcript_unavailable: 0,
        transcript_unavailable_at: null,
        transcript_unavailable_reason: null
      }));
      if (updated) Object.assign(video, updated);
      updateVideoAssetButtons(updated || video);
      setSyncStatus('Transcript regenerated.', 'success', { persist: false });
      return;
    }

    const updated = updateVideoState(video.id, mode === 'html'
      ? { has_html_summary: 1, html_summary_updated_at: payload.updatedAt }
      : { has_summary: 1, summary_updated_at: payload.updatedAt });
    if (updated) Object.assign(video, updated);
    updateVideoAssetButtons(updated || video);
    setSyncStatus(mode === 'html' ? 'Summary page regenerated.' : 'Summary regenerated.', 'success', { persist: false });
  }

  function notifyVideosChanged() {
    if (options.onVideosChanged) options.onVideosChanged(api);
  }

  function updateVideoState(videoId, getUpdates) {
    let updated = null;
    allVideos = allVideos.map(video => {
      if (video.id !== videoId) return video;
      const updates = typeof getUpdates === 'function' ? getUpdates(video) : getUpdates;
      updated = { ...video, ...updates };
      return updated;
    });
    return updated;
  }

  function getVideoElement(videoId) {
    return videoList.querySelector(`[data-video-id="${videoId}"]`);
  }

  function updateVideoAssetButtons(videoOrId) {
    const video = typeof videoOrId === 'string'
      ? allVideos.find(item => item.id === videoOrId)
      : videoOrId;
    if (!video) return false;

    const item = getVideoElement(video.id);
    if (!item) return false;

    const pendingRecord = pendingRemovals.get(video.id);
    const transcriptBtn = item.querySelector('.yt-playlist-alt-transcript-btn');
    const summaryBtn = item.querySelector('.yt-playlist-alt-summary-btn');
    const tagBtn = item.querySelector('.yt-playlist-alt-tags-btn');
    if (transcriptBtn) transcriptBtn.replaceWith(createTranscriptButton(video, pendingRecord));
    if (summaryBtn) summaryBtn.replaceWith(createSummaryButton(video, pendingRecord));
    if (tagBtn) tagBtn.replaceWith(createTagButton(video, pendingRecord));
    return true;
  }

  function updateVideoTagsDisplay(videoOrId) {
    const video = typeof videoOrId === 'string'
      ? allVideos.find(item => item.id === videoOrId)
      : videoOrId;
    if (!video) return false;

    const item = getVideoElement(video.id);
    const info = item && item.querySelector('.yt-playlist-alt-video-info');
    if (!info) return false;

    const existing = info.querySelector('.yt-playlist-alt-tags');
    const tagsEl = createTagsDisplay(video);
    if (existing && tagsEl) existing.replaceWith(tagsEl);
    else if (existing) existing.remove();
    else if (tagsEl) info.appendChild(tagsEl);
    renderTagSuggestions();
    return true;
  }

  function updateAutoAssetButtons() {
    if (autoTranscriptBtn) {
      const isRunning = !!autoTranscriptRun;
      autoTranscriptBtn.classList.toggle('yt-playlist-alt-auto-button--active', isRunning);
      autoTranscriptBtn.textContent = isRunning
        ? autoTranscriptRun.cancelled ? 'Stopping T' : 'Stop T'
        : 'Auto T';
      autoTranscriptBtn.disabled = !!autoSummaryRun || !!autoTagRun;
      autoTranscriptBtn.title = isRunning
        ? 'Stop auto transcript'
        : 'Start auto transcript for the current view';
      autoTranscriptBtn.setAttribute('aria-label', autoTranscriptBtn.title);
    }

    if (autoSummaryBtn) {
      const isRunning = !!autoSummaryRun;
      autoSummaryBtn.classList.toggle('yt-playlist-alt-auto-button--active', isRunning);
      autoSummaryBtn.textContent = isRunning
        ? autoSummaryRun.cancelled ? 'Stopping S' : 'Stop S'
        : 'Auto S';
      autoSummaryBtn.disabled = !!autoTranscriptRun || !!autoTagRun;
      autoSummaryBtn.title = isRunning
        ? 'Stop auto summary'
        : 'Start auto summary for the current view';
      autoSummaryBtn.setAttribute('aria-label', autoSummaryBtn.title);
    }

    if (autoTagBtn) {
      const isRunning = !!autoTagRun;
      autoTagBtn.classList.toggle('yt-playlist-alt-auto-button--active', isRunning);
      autoTagBtn.textContent = isRunning
        ? autoTagRun.cancelled ? 'Stopping Tag' : 'Stop Tag'
        : 'Auto Tag';
      autoTagBtn.disabled = !!autoTranscriptRun || !!autoSummaryRun;
      autoTagBtn.title = isRunning
        ? 'Stop auto tag'
        : 'Start auto tag for the current view';
      autoTagBtn.setAttribute('aria-label', autoTagBtn.title);
    }
  }

  function getAutoAssetBaseVideos() {
    return getOrderedFilteredVideos()
      .filter(video => video.id && !pendingRemovals.has(video.id) && !isMissingVideo(video));
  }

  function getAutoTranscriptCandidates() {
    return getAutoAssetBaseVideos().filter(video => !hasTranscript(video) && !isTranscriptUnavailable(video));
  }

  function getAutoSummaryCandidateInfo() {
    const videos = getAutoAssetBaseVideos();
    return {
      candidates: videos.filter(video => hasTranscript(video) && !hasSummary(video)),
      skippedNoTranscript: videos.filter(video => !hasTranscript(video) && !hasSummary(video)).length
    };
  }

  function getAutoTagCandidateInfo() {
    const videos = getAutoAssetBaseVideos();
    return {
      candidates: videos.filter(video => hasTranscript(video) && !hasTags(video)),
      skippedNoTranscript: videos.filter(video => !hasTranscript(video) && !hasTags(video)).length
    };
  }

  function getShortVideoTitle(video) {
    const title = String(video.title || video.id || '').replace(/\s+/g, ' ').trim();
    return title.length > 34 ? `${title.slice(0, 31)}...` : title;
  }

  function setAutoTranscriptStatus(run, suffix = '') {
    const message = `Auto transcript: ${run.success}/${run.total} done, ${run.failed} failed${suffix ? `. ${suffix}` : ''}`;
    setSyncStatus(message, 'busy', { key: AUTO_TRANSCRIPT_STATUS_KEY });
  }

  function setAutoSummaryStatus(run, suffix = '') {
    const skipped = run.skippedNoTranscript ? `, ${run.skippedNoTranscript} skipped no transcript` : '';
    const message = `Auto summary: ${run.success}/${run.total} done, ${run.failed} failed${skipped}${suffix ? `. ${suffix}` : ''}`;
    setSyncStatus(message, 'busy', { key: AUTO_SUMMARY_STATUS_KEY });
  }

  function setAutoTagStatus(run, suffix = '') {
    const skipped = run.skippedNoTranscript ? `, ${run.skippedNoTranscript} skipped no transcript` : '';
    const message = `Auto tag: ${run.success}/${run.total} done, ${run.failed} failed${skipped}${suffix ? `. ${suffix}` : ''}`;
    setSyncStatus(message, 'busy', { key: AUTO_TAG_STATUS_KEY });
  }

  function finishAutoRun(kind, run) {
    const stopped = run.cancelled;
    const state = run.failed > 0 && !stopped ? 'error' : 'success';

    if (kind === 'transcript') {
      setSyncStatus(
        `${stopped ? 'Auto transcript stopped' : 'Auto transcript finished'}: ${run.success}/${run.total} done, ${run.failed} failed.`,
        state,
        { key: AUTO_TRANSCRIPT_STATUS_KEY }
      );
      return;
    }

    const skipped = run.skippedNoTranscript ? `, ${run.skippedNoTranscript} skipped no transcript` : '';
    if (kind === 'tag') {
      setSyncStatus(
        `${stopped ? 'Auto tag stopped' : 'Auto tag finished'}: ${run.success}/${run.total} done, ${run.failed} failed${skipped}.`,
        state,
        { key: AUTO_TAG_STATUS_KEY }
      );
      return;
    }

    setSyncStatus(
      `${stopped ? 'Auto summary stopped' : 'Auto summary finished'}: ${run.success}/${run.total} done, ${run.failed} failed${skipped}.`,
      state,
      { key: AUTO_SUMMARY_STATUS_KEY }
    );
  }

  async function startAutoTranscript() {
    if (autoSummaryRun) {
      setSyncStatus('Stop auto summary before starting auto transcript.', 'error', { persist: false });
      return;
    }

    const videos = getAutoTranscriptCandidates();
    if (videos.length === 0) {
      setSyncStatus('Auto transcript: nothing to do in current view.', 'success', { persist: false });
      return;
    }

    const run = { total: videos.length, success: 0, failed: 0, cancelled: false };
    autoTranscriptRun = run;
    updateAutoAssetButtons();
    setAutoTranscriptStatus(run);

    for (const video of videos) {
      if (run.cancelled) break;

      transcriptLoads.add(video.id);
      updateVideoAssetButtons(video.id);
      setAutoTranscriptStatus(run, `Fetching ${getShortVideoTitle(video)}`);

      try {
        const transcript = await window.api.requestTranscript(video.id);
        const updated = updateVideoState(video.id, {
          has_transcript: 1,
          has_timestamped_transcript: transcript.hasTimestampedTranscript === false ? video.has_timestamped_transcript : 1,
          transcript_fetched_at: transcript.fetchedAt,
          transcript_unavailable: 0,
          transcript_unavailable_at: null,
          transcript_unavailable_reason: null
        });
        if (updated) Object.assign(video, updated);
        run.success++;
      } catch (err) {
        if (err && err.transcriptUnavailable) {
          const updated = updateVideoState(video.id, {
            transcript_unavailable: 1,
            transcript_unavailable_at: err.transcriptUnavailableAt || null,
            transcript_unavailable_reason: err.transcriptUnavailableReason || err.message || null
          });
          if (updated) Object.assign(video, updated);
        }
        run.failed++;
      } finally {
        transcriptLoads.delete(video.id);
        updateVideoAssetButtons(video.id);
      }
    }

    autoTranscriptRun = null;
    updateAutoAssetButtons();
    notifyVideosChanged();
    finishAutoRun('transcript', run);
  }

  async function startAutoSummary() {
    if (autoTranscriptRun) {
      setSyncStatus('Stop auto transcript before starting auto summary.', 'error', { persist: false });
      return;
    }

    await loadAssetSettings();
    const { candidates, skippedNoTranscript } = getAutoSummaryCandidateInfo();
    if (candidates.length === 0) {
      const suffix = skippedNoTranscript ? ` ${skippedNoTranscript} skipped without transcript.` : '';
      setSyncStatus(`Auto summary: nothing to do in current view.${suffix}`, 'success', { persist: false });
      return;
    }

    const run = { total: candidates.length, success: 0, failed: 0, skippedNoTranscript, cancelled: false };
    autoSummaryRun = run;
    updateAutoAssetButtons();
    setAutoSummaryStatus(run);

    for (const video of candidates) {
      if (run.cancelled) break;

      summaryLoads.add(video.id);
      updateVideoAssetButtons(video.id);
      setAutoSummaryStatus(run, `Generating ${getShortVideoTitle(video)}`);

      try {
        const summary = await window.api.requestSummary(video.id, summaryMode);
        const updated = updateVideoState(video.id, summaryMode === 'html'
          ? { has_html_summary: 1, html_summary_updated_at: summary.updatedAt }
          : { has_summary: 1, summary_updated_at: summary.updatedAt });
        if (updated) Object.assign(video, updated);
        run.success++;
      } catch {
        run.failed++;
      } finally {
        summaryLoads.delete(video.id);
        updateVideoAssetButtons(video.id);
      }
    }

    autoSummaryRun = null;
    updateAutoAssetButtons();
    notifyVideosChanged();
    finishAutoRun('summary', run);
  }

  async function startAutoTag() {
    if (autoTranscriptRun || autoSummaryRun) {
      setSyncStatus('Stop other auto tasks before starting auto tag.', 'error', { persist: false });
      return;
    }

    const { candidates, skippedNoTranscript } = getAutoTagCandidateInfo();
    if (candidates.length === 0) {
      const suffix = skippedNoTranscript ? ` ${skippedNoTranscript} skipped without transcript.` : '';
      setSyncStatus(`Auto tag: nothing to do in current view.${suffix}`, 'success', { persist: false });
      return;
    }

    const run = { total: candidates.length, success: 0, failed: 0, skippedNoTranscript, cancelled: false };
    autoTagRun = run;
    updateAutoAssetButtons();
    setAutoTagStatus(run);

    for (const video of candidates) {
      if (run.cancelled) break;

      tagLoads.add(video.id);
      updateVideoAssetButtons(video.id);
      setAutoTagStatus(run, `Generating ${getShortVideoTitle(video)}`);

      try {
        const result = await window.api.requestTags(video.id);
        const updated = updateVideoState(video.id, {
          tags_json: JSON.stringify(Array.isArray(result.tags) ? result.tags : []),
          tags_updated_at: result.updatedAt
        });
        if (updated) Object.assign(video, updated);
        renderTagSuggestions();
        if (selectedTagFilters.length > 0) renderVideos();
        else updateVideoTagsDisplay(updated || video);
        run.success++;
      } catch {
        run.failed++;
      } finally {
        tagLoads.delete(video.id);
        updateVideoAssetButtons(video.id);
      }
    }

    autoTagRun = null;
    updateAutoAssetButtons();
    notifyVideosChanged();
    finishAutoRun('tag', run);
  }

  function toggleAutoTranscript() {
    if (autoTranscriptRun) {
      autoTranscriptRun.cancelled = true;
      updateAutoAssetButtons();
      setAutoTranscriptStatus(autoTranscriptRun, 'Stopping after current video');
      return;
    }

    startAutoTranscript().catch(err => {
      autoTranscriptRun = null;
      updateAutoAssetButtons();
      setSyncStatus(`Auto transcript failed: ${err.message || 'unknown error'}`, 'error');
    });
  }

  function toggleAutoSummary() {
    if (autoSummaryRun) {
      autoSummaryRun.cancelled = true;
      updateAutoAssetButtons();
      setAutoSummaryStatus(autoSummaryRun, 'Stopping after current video');
      return;
    }

    startAutoSummary().catch(err => {
      autoSummaryRun = null;
      updateAutoAssetButtons();
      setSyncStatus(`Auto summary failed: ${err.message || 'unknown error'}`, 'error');
    });
  }

  function toggleAutoTag() {
    if (autoTagRun) {
      autoTagRun.cancelled = true;
      updateAutoAssetButtons();
      setAutoTagStatus(autoTagRun, 'Stopping after current video');
      return;
    }

    startAutoTag().catch(err => {
      autoTagRun = null;
      updateAutoAssetButtons();
      setSyncStatus(`Auto tag failed: ${err.message || 'unknown error'}`, 'error');
    });
  }

  function showPreview(anchor, video, type) {
    if (anchor.disabled) return;

    const isTranscript = type === 'transcript';
    const activeSummaryMode = summaryMode === 'html' ? 'html' : 'plain';
    const ready = isTranscript ? hasTranscript(video) : hasSummary(video);
    if (!ready) return;
    const emptyText = isTranscript && isTranscriptUnavailable(video)
      ? 'Transcript is unavailable for this video. Click T to try fetching it again.'
      : undefined;

    preview.show(anchor, window.ytbPreview.createVideoAssetConfig({
      videoId: video.id,
      type,
      summaryMode: activeSummaryMode,
      ready,
      emptyText,
      emptyState: emptyText ? 'unavailable' : undefined,
      onRegenerated: result => handlePreviewRegenerated(video, result)
    }));
  }

  async function handleTranscriptClick(event, video) {
    event.stopPropagation();
    if (pendingRemovals.has(video.id)) return;
    if (transcriptLoads.has(video.id)) return;

    if (hasTranscript(video)) return;

    transcriptLoads.add(video.id);
    updateVideoAssetButtons(video.id);
    setSyncStatus('Fetching transcript...', 'busy', { persist: false });

    try {
      const transcript = await window.api.requestTranscript(video.id, { force: true });
      const updated = updateVideoState(video.id, {
        has_transcript: 1,
        has_timestamped_transcript: 1,
        transcript_fetched_at: transcript.fetchedAt,
        transcript_unavailable: 0,
        transcript_unavailable_at: null,
        transcript_unavailable_reason: null
      });
      if (updated) Object.assign(video, updated);
      setSyncStatus('Transcript fetched and saved.', 'success', { persist: false });
    } catch (err) {
      if (err && err.transcriptUnavailable) {
        const updated = updateVideoState(video.id, {
          transcript_unavailable: 1,
          transcript_unavailable_at: err.transcriptUnavailableAt || null,
          transcript_unavailable_reason: err.transcriptUnavailableReason || err.message || null
        });
        if (updated) Object.assign(video, updated);
      }
      setSyncStatus(`Failed to fetch transcript: ${err.message || 'unknown error'}`, 'error', { persist: false });
    } finally {
      transcriptLoads.delete(video.id);
      updateVideoAssetButtons(video.id);
    }
  }

  async function handleSummaryClick(event, video) {
    event.stopPropagation();
    if (pendingRemovals.has(video.id)) return;
    if (summaryLoads.has(video.id)) return;
    if (!hasTranscript(video)) {
      setSyncStatus('Fetch transcript before generating summary.', 'error', { persist: false });
      return;
    }

    if (hasSummary(video)) return;

    summaryLoads.add(video.id);
    updateVideoAssetButtons(video.id);
    setSyncStatus('Generating summary...', 'busy', { persist: false });

    try {
      const summary = await window.api.requestSummary(video.id, summaryMode);
      const updated = updateVideoState(video.id, summaryMode === 'html'
        ? { has_html_summary: 1, html_summary_updated_at: summary.updatedAt }
        : { has_summary: 1, summary_updated_at: summary.updatedAt });
      if (updated) Object.assign(video, updated);
      setSyncStatus('Summary generated and saved.', 'success', { persist: false });
    } catch (err) {
      setSyncStatus(`Failed to generate summary: ${err.message || 'unknown error'}`, 'error', { persist: false });
    } finally {
      summaryLoads.delete(video.id);
      updateVideoAssetButtons(video.id);
    }
  }

  async function handleTagClick(event, video) {
    event.stopPropagation();
    if (pendingRemovals.has(video.id)) return;
    if (tagLoads.has(video.id)) return;
    if (!hasTranscript(video)) {
      setSyncStatus('Fetch transcript before generating tags.', 'error', { persist: false });
      return;
    }

    if (hasTags(video)) return;

    tagLoads.add(video.id);
    updateVideoAssetButtons(video.id);
    setSyncStatus('Generating tags...', 'busy', { persist: false });

    try {
      const result = await window.api.requestTags(video.id);
      const updated = updateVideoState(video.id, {
        tags_json: JSON.stringify(Array.isArray(result.tags) ? result.tags : []),
        tags_updated_at: result.updatedAt
      });
      if (updated) Object.assign(video, updated);
      renderTagSuggestions();
      if (selectedTagFilters.length > 0) renderVideos();
      else updateVideoTagsDisplay(updated || video);
      setSyncStatus('Tags generated and saved.', 'success', { persist: false });
    } catch (err) {
      setSyncStatus(`Failed to generate tags: ${err.message || 'unknown error'}`, 'error', { persist: false });
    } finally {
      tagLoads.delete(video.id);
      updateVideoAssetButtons(video.id);
    }
  }

  async function handleMarkYoutubeCleanedClick(event, video) {
    event.stopPropagation();
    if (!currentPlaylistId || !isYoutubeCleanupPending(video)) return;

    try {
      await window.api.markYoutubeCleanup(currentPlaylistId, video.id, 'removed');
      allVideos = allVideos.map(item => item.id === video.id
        ? { ...item, youtube_removed_at: new Date().toISOString(), youtube_cleanup_error: null }
        : item);
      setSyncStatus('Marked as removed from YouTube.', 'success');
      renderVideos();
    } catch (err) {
      setSyncStatus(`Failed to update YouTube cleanup state: ${err.message || 'unknown error'}`, 'error');
    }
  }

  async function handleRestoreVideo(event, video) {
    event.stopPropagation();
    if (!currentPlaylistId || !isRestorableVideo(video)) return;

    try {
      await window.api.restoreVideoInPlaylist(currentPlaylistId, video.id);
      const restoredAt = new Date().toISOString();
      allVideos = allVideos.map(item => item.id === video.id
        ? {
            ...item,
            status: 'active',
            last_seen_at: restoredAt,
            missing_since: null,
            unavailable_since: null,
            last_checked_at: restoredAt,
            youtube_removed_at: null,
            youtube_cleanup_error: null,
            moved_to_playlist_id: null,
            moved_to_playlist_name: '',
            moved_at: null
          }
        : item);

      updateCurrentPlaylistCount();
      await hydratePlaylistCounts(true);
      renderVideos();
      notifyVideosChanged();
      setSyncStatus('Video restored.', 'success');
    } catch (err) {
      setSyncStatus(`Failed to restore video: ${err.message || 'unknown error'}`, 'error');
    }
  }

  function isRestorableVideo(video) {
    return normalizeVideoStatus(video) === 'removed_by_user' && !pendingRemovals.has(video.id);
  }

  function isMovableVideo(video) {
    const status = normalizeVideoStatus(video);
    return (status === 'active' || status === 'removed_by_user') && !pendingRemovals.has(video.id);
  }

  function getMovableVideos(videos) {
    return videos.filter(isMovableVideo);
  }

  function getSelectedMoveVideos() {
    const selectedVideos = allVideos.filter(video => selectedMoveVideoIds.has(video.id) && isMovableVideo(video));
    if (selectedVideos.length !== selectedMoveVideoIds.size) {
      selectedMoveVideoIds.clear();
      selectedVideos.forEach(video => selectedMoveVideoIds.add(video.id));
    }
    for (const videoId of suppressMoveHoverVideoIds) {
      if (!selectedMoveVideoIds.has(videoId) && !allVideos.some(video => video.id === videoId)) {
        suppressMoveHoverVideoIds.delete(videoId);
      }
    }
    return selectedVideos;
  }

  function handleMoveArrowClick(event, video) {
    event.stopPropagation();
    if (!isMovableVideo(video)) return;

    if (selectedMoveVideoIds.has(video.id)) {
      const selectedVideos = getSelectedMoveVideos();
      if (selectedVideos.length === 0) return;
      handleMoveVideos(event, selectedVideos);
      return;
    }

    selectedMoveVideoIds.add(video.id);
    renderVideos();
    const count = selectedMoveVideoIds.size;
    setSyncStatus(`${count} ${count === 1 ? 'video' : 'videos'} selected to move.`, 'success', { persist: false });
  }

  function handleMoveArrowDeselect(video) {
    if (!selectedMoveVideoIds.has(video.id)) return false;

    selectedMoveVideoIds.delete(video.id);
    suppressMoveHoverVideoIds.add(video.id);
    renderVideos();

    const count = selectedMoveVideoIds.size;
    const message = count === 0
      ? 'Move selection cleared.'
      : `${count} ${count === 1 ? 'video' : 'videos'} selected to move.`;
    setSyncStatus(message, count === 0 ? 'success' : 'busy', { persist: false });
    return true;
  }

  function bindMoveArrowButton(moveBtn, video) {
    let holdTimer = null;
    let didDeselect = false;

    const clearHoldTimer = () => {
      if (!holdTimer) return;
      clearTimeout(holdTimer);
      holdTimer = null;
    };

    moveBtn.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      suppressMoveHoverVideoIds.delete(video.id);
      moveBtn.classList.remove('yt-playlist-alt-video-move--suppress-hover');
      if (!selectedMoveVideoIds.has(video.id) || !isMovableVideo(video)) return;

      didDeselect = false;
      clearHoldTimer();
      holdTimer = setTimeout(() => {
        didDeselect = handleMoveArrowDeselect(video);
        holdTimer = null;
      }, MOVE_DESELECT_HOLD_MS);
    });

    moveBtn.addEventListener('pointerup', clearHoldTimer);
    moveBtn.addEventListener('pointercancel', clearHoldTimer);
    moveBtn.addEventListener('pointerleave', () => {
      clearHoldTimer();
      if (!suppressMoveHoverVideoIds.delete(video.id)) return;
      moveBtn.classList.remove('yt-playlist-alt-video-move--suppress-hover');
    });
    moveBtn.onclick = event => {
      if (didDeselect) {
        event.preventDefault();
        event.stopPropagation();
        didDeselect = false;
        return;
      }
      handleMoveArrowClick(event, video);
    };
  }

  function askMoveTarget(videoCount, options = {}) {
    return new Promise(resolve => {
      const targets = playlists.filter(playlist => String(playlist.id) !== String(currentPlaylistId));
      if (targets.length === 0) {
        resolve(null);
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'yt-move-modal';

      const dialog = document.createElement('div');
      dialog.className = 'yt-move-dialog';

      const title = document.createElement('div');
      title.className = 'yt-move-title';
      if (options.restoreFirst) {
        title.textContent = videoCount === 1 ? 'Restore and move video to list' : `Restore and move ${videoCount} videos to list`;
      } else {
        title.textContent = videoCount === 1 ? 'Move video to list' : `Move ${videoCount} videos to list`;
      }

      const selectEl = document.createElement('select');
      selectEl.className = 'yt-move-select';
      targets.forEach(playlist => {
        const option = document.createElement('option');
        option.value = playlist.id;
        option.textContent = getPlaylistOptionLabel(playlist);
        selectEl.appendChild(option);
      });

      const actions = document.createElement('div');
      actions.className = 'yt-move-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';

      const moveBtn = document.createElement('button');
      moveBtn.type = 'button';
      moveBtn.dataset.primary = 'true';
      moveBtn.textContent = options.restoreFirst ? 'Restore & Move' : 'Move';

      const finish = value => {
        overlay.remove();
        resolve(value);
      };

      cancelBtn.onclick = () => finish(null);
      moveBtn.onclick = () => finish(selectEl.value);
      overlay.onclick = event => {
        if (event.target === overlay) finish(null);
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(moveBtn);
      dialog.appendChild(title);
      dialog.appendChild(selectEl);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      panel.appendChild(overlay);
      selectEl.focus();
    });
  }

  async function handleMoveVideos(event, videos) {
    if (event) event.stopPropagation();
    if (!currentPlaylistId) return;

    const movableVideos = getMovableVideos(videos);
    if (movableVideos.length === 0) {
      setSyncStatus('No videos to move.', 'error');
      return;
    }

    if (playlists.length <= 1) {
      setSyncStatus('Create another list before moving videos.', 'error');
      return;
    }

    const restoreFirst = movableVideos.some(isRestorableVideo);
    const targetPlaylistId = await askMoveTarget(movableVideos.length, { restoreFirst });
    if (!targetPlaylistId) return;

    try {
      const targetPlaylist = playlists.find(playlist => String(playlist.id) === String(targetPlaylistId));
      const videoIds = movableVideos.map(video => video.id);
      const result = await window.api.moveVideosToPlaylist(currentPlaylistId, targetPlaylistId, videoIds);
      const movedAt = new Date().toISOString();
      const movedCount = Number(result.moved) || 0;
      if (movedCount === 0) {
        setSyncStatus('No videos were moved.', 'error');
        return;
      }

      const resultIds = Array.isArray(result.movedIds) && result.movedIds.length > 0 ? result.movedIds : videoIds;
      const movedIds = new Set(resultIds);
      movedIds.forEach(videoId => {
        selectedMoveVideoIds.delete(videoId);
        suppressMoveHoverVideoIds.delete(videoId);
      });
      allVideos = allVideos.map(item => movedIds.has(item.id)
        ? {
            ...item,
            status: 'moved_to_playlist',
            moved_to_playlist_id: targetPlaylistId,
            moved_to_playlist_name: targetPlaylist ? targetPlaylist.name : '',
            moved_at: movedAt,
            youtube_removed_at: null,
            youtube_cleanup_error: null
          }
        : item);

      updateCurrentPlaylistCount();
      await hydratePlaylistCounts(true);
      renderVideos();
      notifyVideosChanged();
      const message = restoreFirst
        ? movedCount === 1 ? 'Video restored and moved.' : `${movedCount} videos restored and moved.`
        : movedCount === 1 ? 'Video moved.' : `${movedCount} videos moved.`;
      setSyncStatus(message, 'success');
    } catch (err) {
      setSyncStatus(`Failed to move videos: ${err.message || 'unknown error'}`, 'error');
    }
  }

  function matchesStatusFilter(video) {
    const status = normalizeVideoStatus(video);
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return status === 'active';
    if (statusFilter === 'missing') return isMissingVideo(video);
    if (statusFilter === 'youtube_cleanup_pending') return isYoutubeCleanupPending(video);
    if (statusFilter === 'removed_from_source') return status === 'removed_from_source' || status === 'removed';
    if (statusFilter === 'unavailable_on_youtube') return status === 'unavailable_on_youtube' || status === 'unavailable';
    return status === statusFilter;
  }

  function getEmptyMessage() {
    if (statusFilter === 'active') return 'No active videos in this playlist.';
    if (statusFilter === 'removed_by_user') return 'No videos removed by you.';
    if (statusFilter === 'youtube_cleanup_pending') return 'No videos pending YouTube cleanup.';
    if (statusFilter === 'moved_to_playlist') return 'No videos moved to another list.';
    if (statusFilter === 'removed_from_source') return 'No videos removed from the YouTube playlist.';
    if (statusFilter === 'unavailable_on_youtube') return 'No unavailable YouTube videos.';
    if (statusFilter === 'missing') return 'No missing or unavailable videos.';
    return 'No videos match the selected filters.';
  }

  function buildDateFilter() {
    const amount = Number(dateAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const cutoff = new Date();
    if (dateUnit === 'years') cutoff.setFullYear(cutoff.getFullYear() - amount);
    else if (dateUnit === 'months') cutoff.setMonth(cutoff.getMonth() - amount);
    else cutoff.setDate(cutoff.getDate() - amount);

    return {
      field: dateField,
      direction: dateDirection,
      cutoff
    };
  }

  function matchesDateFilter(video, filter) {
    if (!filter) return true;
    const rawDate = video[filter.field];
    if (!rawDate) return false;
    const videoTime = toTimestamp(rawDate);
    if (!videoTime) return false;
    const cutoffTime = filter.cutoff.getTime();
    return filter.direction === 'older' ? videoTime < cutoffTime : videoTime >= cutoffTime;
  }

  function matchesSearchQuery(video, query) {
    const tags = getVideoTags(video);
    return (video.title && video.title.toLowerCase().includes(query)) ||
      (video.author && video.author.toLowerCase().includes(query)) ||
      tags.some(tag => tag.toLowerCase().includes(query));
  }

  function getFilteredVideos() {
    const query = searchInput.value.trim().toLowerCase();
    const activeDateFilter = buildDateFilter();
    return allVideos.filter(video => {
      if (!matchesStatusFilter(video)) return false;
      if (!matchesDateFilter(video, activeDateFilter)) return false;
      if (!matchesTagFilters(video)) return false;
      if (!query) return true;
      return matchesSearchQuery(video, query);
    });
  }

  function sortVideoGroupEntries(groupEntries) {
    if (groupSortOption === 'count-high') {
      groupEntries.sort((a, b) => b[1].length - a[1].length);
    } else if (groupSortOption === 'count-low') {
      groupEntries.sort((a, b) => a[1].length - b[1].length);
    } else if (groupSortOption === 'duration-high') {
      groupEntries.sort((a, b) => b[1].reduce((s, v) => s + (v.duration || 0), 0) - a[1].reduce((s, v) => s + (v.duration || 0), 0));
    } else if (groupSortOption === 'duration-low') {
      groupEntries.sort((a, b) => a[1].reduce((s, v) => s + (v.duration || 0), 0) - b[1].reduce((s, v) => s + (v.duration || 0), 0));
    } else if (groupSortOption === 'name-desc') {
      groupEntries.sort((a, b) => b[0].localeCompare(a[0]));
    } else {
      groupEntries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    return groupEntries;
  }

  function getGroupedFilteredVideoEntries(filtered, sortFn) {
    const groups = {};
    filtered.forEach(video => {
      const author = video.author || 'Unknown Author';
      if (!groups[author]) groups[author] = [];
      groups[author].push(video);
    });

    const groupEntries = sortVideoGroupEntries(Object.entries(groups));
    groupEntries.forEach(([, videos]) => videos.sort(sortFn));
    return groupEntries;
  }

  function getOrderedFilteredVideos() {
    const filtered = getFilteredVideos();
    const sortFn = getSortFn();
    if (!groupByAuthor) return filtered.sort(sortFn);

    return getGroupedFilteredVideoEntries(filtered, sortFn)
      .flatMap(([, videos]) => videos);
  }

  function serializePendingRemovals() {
    return Array.from(pendingRemovals.values()).filter(record => record.deadlineAt > Date.now());
  }

  function persistPendingRemovals() {
    const serialized = serializePendingRemovals();
    pendingRemovalRecords = serialized;
    safeStorageSet({
      pendingRemovals: serialized,
      pendingRemoval: null
    });
  }

  function getRemovalCountdown(record) {
    return Math.max(0, Math.ceil((record.deadlineAt - Date.now()) / 1000));
  }

  async function commitPendingRemoval(videoId, shouldRender = true) {
    const record = pendingRemovals.get(videoId);
    if (!record) return false;

    pendingRemovals.delete(videoId);
    persistPendingRemovals();

    try {
      await window.api.removeVideoFromPlaylist(record.playlistId, videoId);
      await collapseVideoElement(videoId);
      allVideos = allVideos.filter(v => v.id !== videoId);
      updateCurrentPlaylistCount();
      if (shouldRender) renderVideos();
      notifyVideosChanged();
      return true;
    } catch (err) {
      setSyncStatus(`Failed to remove video: ${err.message || 'unknown error'}`, 'error');
      if (shouldRender) renderVideos();
      return false;
    }
  }

  function stopRemovalTimerIfIdle() {
    if (pendingRemovals.size > 0 || !removalTimerId) return;
    clearInterval(removalTimerId);
    removalTimerId = null;
  }

  async function processDueRemovals() {
    if (removalCommitInProgress) return;

    const due = Array.from(pendingRemovals.entries())
      .filter(([, record]) => getRemovalCountdown(record) <= 0)
      .sort((a, b) => a[1].deadlineAt - b[1].deadlineAt);

    if (due.length === 0) return;

    removalCommitInProgress = true;
    let changed = false;

    try {
      for (const [videoId] of due) {
        changed = await commitPendingRemoval(videoId, false) || changed;
        await delay(40);
      }
    } finally {
      removalCommitInProgress = false;
      stopRemovalTimerIfIdle();
    }

    if (changed) {
      renderVideos();
      notifyVideosChanged();
    }
  }

  function updateCountdownDisplay(videoId, count) {
    const badge = document.querySelector(`.yt-removal-countdown[data-video-id="${videoId}"]`);
    if (badge) badge.textContent = count;
    const message = document.querySelector(`.yt-removal-message[data-video-id="${videoId}"]`);
    if (message) message.textContent = `Removing in ${count}s`;
  }

  function tickPendingRemovals() {
    for (const [videoId, record] of pendingRemovals.entries()) {
      const count = getRemovalCountdown(record);
      if (count > 0) updateCountdownDisplay(videoId, count);
    }

    processDueRemovals();
    stopRemovalTimerIfIdle();
  }

  function ensureRemovalTimer() {
    if (removalTimerId) return;
    removalTimerId = setInterval(tickPendingRemovals, 250);
  }

  function queueVideoRemoval(videoOrId, reason = 'manual') {
    const videoId = typeof videoOrId === 'string' ? videoOrId : videoOrId && videoOrId.id;
    if (!videoId || !currentPlaylistId || pendingRemovals.has(videoId)) return false;
    if (!allVideos.some(v => v.id === videoId)) return false;

    pendingRemovals.set(videoId, {
      videoId,
      playlistId: currentPlaylistId,
      reason,
      deadlineAt: Date.now() + REMOVAL_DELAY_MS
    });
    ensureRemovalTimer();
    return true;
  }

  function requestVideoRemoval(videoOrId, reason = 'manual') {
    if (!queueVideoRemoval(videoOrId, reason)) return;
    hidePreview();
    persistPendingRemovals();
    renderVideos();
  }

  function requestVideoRemovals(videoOrIds, reason = 'manual') {
    let changed = false;
    for (const videoOrId of videoOrIds) changed = queueVideoRemoval(videoOrId, reason) || changed;
    if (!changed) return;
    persistPendingRemovals();
    renderVideos();
  }

  function cancelPendingRemoval(videoId) {
    if (videoId) pendingRemovals.delete(videoId);
    else pendingRemovals.clear();
    stopRemovalTimerIfIdle();
    persistPendingRemovals();
  }

  function cancelPendingRemovals(videoIds) {
    let changed = false;
    for (const videoId of videoIds) {
      if (!pendingRemovals.has(videoId)) continue;
      pendingRemovals.delete(videoId);
      changed = true;
    }
    if (!changed) return;
    stopRemovalTimerIfIdle();
    persistPendingRemovals();
  }

  function restorePendingRemovals() {
    if (!currentPlaylistId) return;

    const now = Date.now();
    const activeIds = new Set(allVideos.map(v => v.id));

    for (const record of pendingRemovalRecords) {
      if (!record || record.playlistId != currentPlaylistId || !activeIds.has(record.videoId)) continue;
      if (record.deadlineAt <= now) {
        pendingRemovals.set(record.videoId, { ...record, deadlineAt: now + 100 });
      } else if (!pendingRemovals.has(record.videoId)) {
        pendingRemovals.set(record.videoId, record);
      }
    }

    for (const [videoId, record] of pendingRemovals.entries()) {
      if (record.playlistId != currentPlaylistId || !activeIds.has(videoId)) {
        pendingRemovals.delete(videoId);
      }
    }

    if (pendingRemovals.size > 0) ensureRemovalTimer();
    stopRemovalTimerIfIdle();
    persistPendingRemovals();
  }

  function updateSortOptions() {
    groupSortSection.style.display = groupByAuthor ? 'flex' : 'none';
  }

  function getCurrentPlaylist() {
    return playlists.find(p => p.id == currentPlaylistId) || null;
  }

  function getPlaylistVideoCount(playlist) {
    const count = Number(playlist && playlist.video_count);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function getPlaylistOptionLabel(playlist) {
    const count = getPlaylistVideoCount(playlist);
    return `${playlist.name} - ${count === null ? '...' : count} videos`;
  }

  function applyPlaylistCounts(counts) {
    if (!Array.isArray(counts) || counts.length === 0) return;

    const countsById = new Map();
    for (const item of counts) {
      const count = Number(item && item.video_count);
      if (item && item.id !== undefined && item.id !== null && Number.isFinite(count) && count >= 0) {
        countsById.set(String(item.id), count);
      }
    }

    playlists = playlists.map(playlist => {
      const count = countsById.get(String(playlist.id));
      return count === undefined ? playlist : { ...playlist, video_count: count };
    });
  }

  async function hydratePlaylistCounts(force = false) {
    try {
      const counts = await window.api.getPlaylistCounts({ force });
      applyPlaylistCounts(counts);
    } catch (err) {
      renderPlaylistOptions();
      return;
    }
    renderPlaylistOptions();
  }

  function renderPlaylistOptions() {
    select.innerHTML = '';
    for (const playlist of playlists) {
      const option = document.createElement('option');
      option.value = playlist.id;
      option.textContent = getPlaylistOptionLabel(playlist);
      select.appendChild(option);
    }
    if (currentPlaylistId) select.value = currentPlaylistId;
  }

  function getKnownPlaylist(playlistId) {
    return playlists.find(playlist => String(playlist.id) === String(playlistId)) || null;
  }

  function getLocatePlaylistLabel(playlist) {
    const knownPlaylist = getKnownPlaylist(playlist.id) || playlist;
    return getPlaylistOptionLabel(knownPlaylist);
  }

  function updateCurrentPlaylistCount() {
    const playlist = getCurrentPlaylist();
    if (!playlist) return;
    playlist.video_count = allVideos.filter(video => normalizeVideoStatus(video) === 'active').length;
    renderPlaylistOptions();
  }

  function getPlayingVideoId() {
    if (options.getPlayingVideoId) {
      const videoId = options.getPlayingVideoId();
      if (videoId) return videoId;
    }
    return currentPlayingVideoId;
  }

  async function resolveCurrentVideoId() {
    const localVideoId = getPlayingVideoId();
    if (localVideoId) return localVideoId;

    if (options.getActiveVideoId) {
      const response = await options.getActiveVideoId(api);
      if (response && response.videoId) return response.videoId;
      throw new Error((response && response.error) || 'Open a YouTube video first.');
    }

    const response = await sendRuntimeMessage({ action: 'getActiveYoutubeVideo' });
    if (response && response.videoId) return response.videoId;
    throw new Error((response && response.error) || 'Open a YouTube video first.');
  }

  function askLocatePlaylistTarget(targets) {
    return new Promise(resolve => {
      if (!targets.length) {
        resolve(null);
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'yt-move-modal';

      const dialog = document.createElement('div');
      dialog.className = 'yt-move-dialog';

      const title = document.createElement('div');
      title.className = 'yt-move-title';
      title.textContent = targets.length === 1
        ? 'Video is in another playlist'
        : 'Video is in other playlists';

      const message = document.createElement('div');
      message.className = 'yt-locate-text';
      message.textContent = targets.length === 1
        ? `Switch to ${getLocatePlaylistLabel(targets[0])}?`
        : 'Choose where to locate this video.';

      const selectEl = document.createElement('select');
      selectEl.className = 'yt-move-select';
      selectEl.hidden = targets.length === 1;
      targets.forEach(playlist => {
        const option = document.createElement('option');
        option.value = playlist.id;
        option.textContent = getLocatePlaylistLabel(playlist);
        selectEl.appendChild(option);
      });

      const actions = document.createElement('div');
      actions.className = 'yt-move-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';

      const switchBtn = document.createElement('button');
      switchBtn.type = 'button';
      switchBtn.dataset.primary = 'true';
      switchBtn.textContent = 'Switch';

      const finish = value => {
        overlay.remove();
        resolve(value);
      };

      cancelBtn.onclick = () => finish(null);
      switchBtn.onclick = () => finish(targets.length === 1 ? targets[0].id : selectEl.value);
      overlay.onclick = event => {
        if (event.target === overlay) finish(null);
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(switchBtn);
      dialog.appendChild(title);
      dialog.appendChild(message);
      if (targets.length > 1) dialog.appendChild(selectEl);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      panel.appendChild(overlay);

      if (targets.length > 1) selectEl.focus();
      else switchBtn.focus();
    });
  }

  async function getOtherPlaylistsForVideo(videoId) {
    const videoPlaylists = await window.api.getVideoPlaylists(videoId, { force: true });
    const targets = videoPlaylists.filter(playlist => String(playlist.id) !== String(currentPlaylistId));

    for (const target of targets) {
      if (!getKnownPlaylist(target.id)) {
        playlists = await window.api.getPlaylists({ force: true });
        renderPlaylistOptions();
        break;
      }
    }

    return targets;
  }

  async function switchPlaylistForLocate(playlistId) {
    currentPlaylistId = playlistId;
    renderPlaylistOptions();
    select.value = currentPlaylistId;
    safeStorageSet({ selectedPlaylistId: currentPlaylistId });
    return loadVideos(true);
  }

  function showSyncPopup(message) {
    setSyncStatus(message, 'error');
    alert(message);
  }

  function validatePlaylistSource(playlist) {
    if (!playlist || !playlist.source_id) {
      return 'Set the playlist URL in Management before syncing.';
    }
    return '';
  }

  async function loadPlaylists(force = false) {
    try {
      playlists = await window.api.getPlaylists({ force });
      renderPlaylistOptions();
      await hydratePlaylistCounts(true);

      if (playlists.length === 0) {
        updatePanelInfo([]);
        videoList.innerHTML = '<div style="padding:16px;text-align:center;color:#aaa;">No playlists found.</div>';
        return true;
      }

      if (!currentPlaylistId || !playlists.find(p => p.id == currentPlaylistId)) {
        currentPlaylistId = playlists[0].id;
        safeStorageSet({ selectedPlaylistId: currentPlaylistId });
      }

      select.value = currentPlaylistId;
      return await loadVideos(force);
    } catch (err) {
      setSyncStatus('Server is not available.', 'error');
      return false;
    }
  }

  async function loadVideos(force = false) {
    if (!currentPlaylistId) return false;

    try {
      expandedGroups.clear();
      selectedMoveVideoIds.clear();
      suppressMoveHoverVideoIds.clear();
      allVideos = await window.api.getPlaylistVideos(currentPlaylistId, 'all', { force });
      renderTagSuggestions();
      updateCurrentPlaylistCount();
      restorePendingRemovals();
      renderVideos();
      return true;
    } catch (err) {
      setSyncStatus('Failed to load playlist videos.', 'error');
      return false;
    }
  }

  function getSortFn() {
    return (a, b) => {
      if (sortOption === 'added-newest') {
        const diff = toTimestamp(b.added_at) - toTimestamp(a.added_at);
        return diff || compareSortOrder(a, b) || (b.pv_rowid || 0) - (a.pv_rowid || 0);
      }
      if (sortOption === 'added-oldest') {
        const diff = toTimestamp(a.added_at) - toTimestamp(b.added_at);
        return diff || compareSortOrder(b, a) || (a.pv_rowid || 0) - (b.pv_rowid || 0);
      }
      if (sortOption === 'popular') return ((b.view_count || 0) - (a.view_count || 0)) || compareSortOrder(a, b);
      if (sortOption === 'least-popular') return ((a.view_count || 0) - (b.view_count || 0)) || compareSortOrder(a, b);
      if (sortOption === 'published-newest') return toTimestamp(b.published_at) - toTimestamp(a.published_at);
      if (sortOption === 'published-oldest') return toTimestamp(a.published_at) - toTimestamp(b.published_at);
      if (sortOption === 'duration-short') return (a.duration || 0) - (b.duration || 0);
      if (sortOption === 'duration-long') return (b.duration || 0) - (a.duration || 0);
      if (sortOption === 'title-asc') return (a.title || '').localeCompare(b.title || '');
      if (sortOption === 'title-desc') return (b.title || '').localeCompare(a.title || '');
      return 0;
    };
  }

  function renderVideos() {
    updateSearchClearButton();
    getSelectedMoveVideos();
    videoList.innerHTML = '';

    if (allVideos.length === 0) {
      updateFilterButtonState();
      updatePanelInfo([]);
      videoList.innerHTML = '<div style="padding:16px;text-align:center;color:#aaa;">No videos in this playlist.</div>';
      return;
    }

    let filtered = getFilteredVideos();
    updateFilterButtonState();
    updatePanelInfo(filtered);

    if (filtered.length === 0) {
      videoList.innerHTML = `<div style="padding:16px;text-align:center;color:#aaa;">${getEmptyMessage()}</div>`;
      return;
    }

    const sortFn = getSortFn();
    if (!groupByAuthor) {
      filtered.sort(sortFn);
      filtered.forEach(video => videoList.appendChild(createVideoElement(video)));
      return;
    }

    const groupEntries = getGroupedFilteredVideoEntries(filtered, sortFn);
    groupEntries.forEach(([author, videos]) => {
      videoList.appendChild(createGroupElement(author, videos));
    });
  }

  function createGroupElement(author, videos) {
    const group = document.createElement('div');
    group.className = 'yt-playlist-alt-group';

    const header = document.createElement('div');
    header.className = 'yt-playlist-alt-group-header';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0;flex:1;';

    const previewImg = document.createElement('img');
    previewImg.src = videos[0].thumbnail || '';
    previewImg.style.cssText = 'width:30px;height:30px;object-fit:cover;border-radius:50%;background:#333;flex-shrink:0;';

    const totalDuration = formatDuration(videos.reduce((sum, video) => sum + (video.duration || 0), 0));
    const pendingCount = videos.filter(video => pendingRemovals.has(video.id)).length;

    const title = document.createElement('span');
    title.style.cssText = 'font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    title.textContent = `${author} (${videos.length})`;

    const meta = document.createElement('span');
    meta.style.cssText = 'font-size:11px;color:#888;white-space:nowrap;';
    meta.textContent = pendingCount > 0 ? `· Removing ${pendingCount}` : totalDuration ? `· ${totalDuration}` : '';

    headerLeft.appendChild(previewImg);
    headerLeft.appendChild(title);
    headerLeft.appendChild(meta);

    const movableVideos = getMovableVideos(videos);
    const restoreMove = movableVideos.some(isRestorableVideo);
    const moveBtn = document.createElement('button');
    moveBtn.className = 'yt-playlist-alt-video-move';
    if (restoreMove) {
      moveBtn.classList.add('yt-playlist-alt-video-move--restore');
      moveBtn.textContent = 'Restore & Move';
    } else {
      moveBtn.innerHTML = '&rarr;';
    }
    moveBtn.title = restoreMove ? 'Restore and move group to another list' : 'Move group to another list';
    moveBtn.setAttribute('aria-label', moveBtn.title);
    moveBtn.disabled = movableVideos.length === 0;
    moveBtn.onclick = event => handleMoveVideos(event, videos);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'yt-playlist-alt-video-remove';
    deleteBtn.textContent = pendingCount > 0 ? 'Stop' : '×';
    deleteBtn.onclick = event => {
      event.stopPropagation();
      if (pendingCount > 0) {
        cancelPendingRemovals(videos.map(video => video.id));
        renderVideos();
        return;
      }
      requestVideoRemovals(videos, 'group');
    };

    header.appendChild(headerLeft);
    header.appendChild(moveBtn);
    header.appendChild(deleteBtn);

    const content = document.createElement('div');
    content.className = 'yt-playlist-alt-group-content';
    if (expandedGroups.has(author)) content.style.display = 'block';

    header.onclick = () => {
      const isOpen = content.style.display === 'block';
      content.style.display = isOpen ? 'none' : 'block';
      if (isOpen) expandedGroups.delete(author);
      else expandedGroups.add(author);
    };

    videos.forEach(video => content.appendChild(createVideoElement(video)));
    group.appendChild(header);
    group.appendChild(content);
    return group;
  }

  async function scrollToCurrentVideo() {
    scrollCurrentBtn.disabled = true;

    try {
      const videoId = await resolveCurrentVideoId();
      currentPlayingVideoId = videoId;
      let video = allVideos.find(item => item.id === videoId);

      if (!video) {
        await loadVideos(true);
        video = allVideos.find(item => item.id === videoId);
      }

      if (!video) {
        const targets = await getOtherPlaylistsForVideo(videoId);
        if (targets.length === 0) {
          setSyncStatus('Current video is not in any saved playlist.', 'error');
          return;
        }

        const targetPlaylistId = await askLocatePlaylistTarget(targets);
        if (!targetPlaylistId) {
          setSyncStatus('Locate cancelled.', 'error', { persist: false });
          return;
        }

        setSyncStatus('Switching playlist...', 'busy', { persist: false });
        const switched = await switchPlaylistForLocate(targetPlaylistId);
        if (!switched) return;

        video = allVideos.find(item => item.id === videoId);
        if (!video) {
          setSyncStatus('Video was not found after switching playlist.', 'error');
          return;
        }
      }

      if (video.author) expandedGroups.add(video.author || 'Unknown Author');

      const filter = buildDateFilter();
      if (!matchesStatusFilter(video) || !matchesDateFilter(video, filter) || searchInput.value.trim()) {
        searchInput.value = '';
        statusFilter = 'all';
        statusFilterSelect.value = 'all';
        dateAmount = '';
        dateFilterAmount.value = '';
        updateFilterButtonState();
      }

      renderVideos();

      const item = videoList.querySelector(`[data-video-id="${videoId}"]`);
      if (!item) {
        setSyncStatus('Current video is hidden by the current view.', 'error');
        return;
      }

      item.scrollIntoView({ block: 'center', behavior: 'smooth' });
      item.classList.add('yt-playlist-alt-video--playing');
      setSyncStatus('Current video found.', 'success');
    } catch (err) {
      setSyncStatus(err.message || 'Open a YouTube video first.', 'error');
    } finally {
      scrollCurrentBtn.disabled = false;
    }
  }

  function createVideoElement(video) {
    const item = document.createElement('div');
    item.className = 'yt-playlist-alt-video';
    item.dataset.videoId = video.id;
    if (isUnavailable(video)) item.style.opacity = '0.6';

    const status = normalizeVideoStatus(video);
    if (status !== 'active') item.classList.add(`yt-playlist-alt-video--${status}`);
    if (isYoutubeCleanupPending(video)) item.classList.add('yt-playlist-alt-video--youtube-cleanup-pending');
    const playingVideoId = getPlayingVideoId();
    if (playingVideoId && video.id === playingVideoId) item.classList.add('yt-playlist-alt-video--playing');

    const pendingRecord = pendingRemovals.get(video.id);
    if (pendingRecord) item.classList.add('yt-playlist-alt-video--pending-removal');

    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'position:relative;flex-shrink:0;width:120px;height:68px;';

    const img = document.createElement('img');
    img.src = video.thumbnail || '';

    const duration = formatDuration(video.duration);
    const durationBadge = document.createElement('span');
    durationBadge.style.cssText = 'position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;padding:1px 3px;border-radius:2px;';
    durationBadge.textContent = duration;

    imgWrap.appendChild(img);
    if (duration) imgWrap.appendChild(durationBadge);

    const info = document.createElement('div');
    info.className = 'yt-playlist-alt-video-info';

    const title = document.createElement('div');
    title.className = 'yt-playlist-alt-video-title';
    title.textContent = video.title || 'Unknown Title';

    const meta = document.createElement('div');
    meta.style.fontSize = '11px';
    meta.style.color = '#aaa';
    const views = formatCompactViews(video.view_count);
    const viewsMeta = views ? ` · 👁 ${views}` : '';
    const published = formatRelativeDate(video.published_at);
    const publishedMeta = published ? ` · ${published}` : '';
    const statusLabel = getVideoStatusLabel(video);
    const statusMeta = statusLabel ? `${statusLabel} · ` : '';
    meta.textContent = statusMeta + (video.author || 'Unknown Author') + viewsMeta + publishedMeta;

    info.appendChild(title);
    info.appendChild(meta);
    const tagsEl = createTagsDisplay(video);
    if (tagsEl) info.appendChild(tagsEl);

    const restoreBtn = isRestorableVideo(video) ? document.createElement('button') : null;
    if (restoreBtn) {
      restoreBtn.className = 'yt-playlist-alt-video-restore';
      restoreBtn.type = 'button';
      restoreBtn.textContent = 'Restore';
      restoreBtn.title = 'Restore to this list';
      restoreBtn.setAttribute('aria-label', restoreBtn.title);
      restoreBtn.onclick = event => handleRestoreVideo(event, video);
    }

    const restoreMove = isRestorableVideo(video);
    const moveBtn = document.createElement('button');
    moveBtn.className = 'yt-playlist-alt-video-move';
    if (selectedMoveVideoIds.has(video.id)) moveBtn.classList.add('yt-playlist-alt-video-move--selected');
    if (suppressMoveHoverVideoIds.has(video.id)) moveBtn.classList.add('yt-playlist-alt-video-move--suppress-hover');
    if (restoreMove) {
      moveBtn.classList.add('yt-playlist-alt-video-move--restore');
      moveBtn.textContent = 'Restore & Move';
    } else {
      moveBtn.innerHTML = '&rarr;';
    }
    moveBtn.title = selectedMoveVideoIds.has(video.id)
      ? 'Click to move selected videos. Hold to deselect.'
      : restoreMove ? 'Restore and move to another list' : 'Move to another list';
    moveBtn.setAttribute('aria-label', moveBtn.title);
    moveBtn.disabled = !isMovableVideo(video);
    bindMoveArrowButton(moveBtn, video);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'yt-playlist-alt-video-remove';
    if (isYoutubeCleanupPending(video)) {
      removeBtn.innerHTML = '&#10003;';
      removeBtn.title = 'Mark removed from YouTube';
      removeBtn.setAttribute('aria-label', removeBtn.title);
      removeBtn.onclick = event => handleMarkYoutubeCleanedClick(event, video);
    } else {
      removeBtn.innerHTML = '&#10005;';
      removeBtn.title = 'Remove from playlist';
      removeBtn.setAttribute('aria-label', removeBtn.title);
      removeBtn.onclick = event => {
        event.stopPropagation();
        requestVideoRemoval(video, 'manual');
      };
    }

    const transcriptBtn = createTranscriptButton(video, pendingRecord);
    const summaryBtn = createSummaryButton(video, pendingRecord);
    const tagBtn = createTagButton(video, pendingRecord);

    if (pendingRecord) {
      const overlay = document.createElement('div');
      overlay.className = 'yt-removal-countdown-overlay';

      const message = document.createElement('div');
      message.className = 'yt-removal-message';
      message.setAttribute('data-video-id', video.id);
      message.textContent = `Removing in ${getRemovalCountdown(pendingRecord)}s`;

      const countBadge = document.createElement('span');
      countBadge.className = 'yt-removal-countdown';
      countBadge.setAttribute('data-video-id', video.id);
      countBadge.textContent = getRemovalCountdown(pendingRecord);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'yt-removal-cancel-btn';
      cancelBtn.textContent = 'Stop removal';
      cancelBtn.onclick = event => {
        event.stopPropagation();
        cancelPendingRemoval(video.id);
        renderVideos();
      };

      overlay.appendChild(message);
      overlay.appendChild(countBadge);
      overlay.appendChild(cancelBtn);
      item.appendChild(overlay);
    }

    item.appendChild(imgWrap);
    item.appendChild(info);
    if (restoreBtn) item.appendChild(restoreBtn);
    item.appendChild(moveBtn);
    item.appendChild(transcriptBtn);
    item.appendChild(summaryBtn);
    item.appendChild(tagBtn);
    item.appendChild(removeBtn);
    function isVideoActionTarget(target) {
      return !!(target && target.closest && target.closest('button'));
    }

    function openVideoItem(newTab) {
      if (!newTab && getPlayingVideoId() === video.id) return;
      if (!newTab) currentPlayingVideoId = video.id;
      if (options.openVideo) {
        options.openVideo(video, api, { newTab });
        return;
      }
      sendRuntimeMessage({ action: 'openYoutubeVideo', videoId: video.id, newTab });
    }

    item.addEventListener('click', event => {
      if (isVideoActionTarget(event.target)) return;
      if (event.button !== 0) return;
      openVideoItem(event.ctrlKey || event.metaKey);
    });
    item.addEventListener('mousedown', event => {
      if (isVideoActionTarget(event.target)) return;
      if (event.button !== 1) return;
      event.preventDefault();
    });
    item.addEventListener('mouseup', event => {
      if (isVideoActionTarget(event.target)) return;
      if (event.button !== 1) return;
      event.preventDefault();
      openVideoItem(true);
    });
    item.addEventListener('auxclick', event => {
      if (event.button === 1) event.preventDefault();
    });
    return item;
  }

  function createTranscriptButton(video, pendingRecord) {
    const transcriptBtn = document.createElement('button');
    const transcriptReady = hasTranscript(video);
    const transcriptUnavailable = isTranscriptUnavailable(video);
    const transcriptLoading = transcriptLoads.has(video.id);
    transcriptBtn.className = `yt-playlist-alt-transcript-btn ${transcriptReady ? 'yt-playlist-alt-transcript-btn--ready' : 'yt-playlist-alt-transcript-btn--missing'}`;
    if (transcriptLoading) transcriptBtn.classList.add('yt-playlist-alt-transcript-btn--loading');
    transcriptBtn.type = 'button';
    transcriptBtn.title = transcriptReady ? 'Transcript ready' : transcriptUnavailable ? 'Transcript unavailable' : 'Fetch transcript';
    transcriptBtn.setAttribute('aria-label', transcriptBtn.title);
    transcriptBtn.innerHTML = transcriptLoading ? '<span class="yt-transcript-spinner"></span>' : 'T';
    transcriptBtn.onclick = event => handleTranscriptClick(event, video);
    if (!pendingRecord && transcriptReady) {
      transcriptBtn.addEventListener('mouseenter', () => showPreview(transcriptBtn, video, 'transcript'));
      transcriptBtn.addEventListener('mouseleave', scheduleHidePreview);
    }

    return transcriptBtn;
  }

  function createSummaryButton(video, pendingRecord) {
    const summaryBtn = document.createElement('button');
    const transcriptReady = hasTranscript(video);
    const summaryReady = hasSummary(video);
    const summaryLoading = summaryLoads.has(video.id);
    const summaryBlocked = !transcriptReady;
    summaryBtn.className = `yt-playlist-alt-summary-btn ${summaryReady ? 'yt-playlist-alt-summary-btn--ready' : 'yt-playlist-alt-summary-btn--missing'}`;
    if (summaryLoading) summaryBtn.classList.add('yt-playlist-alt-summary-btn--loading');
    summaryBtn.type = 'button';
    summaryBtn.disabled = summaryBlocked;
    summaryBtn.title = summaryBlocked ? 'Fetch transcript first' : summaryReady ? 'Summary ready' : 'Generate summary';
    summaryBtn.setAttribute('aria-label', summaryBtn.title);
    summaryBtn.innerHTML = summaryLoading ? '<span class="yt-transcript-spinner"></span>' : 'S';
    summaryBtn.onclick = event => handleSummaryClick(event, video);
    if (!pendingRecord && summaryReady) {
      summaryBtn.addEventListener('mouseenter', () => showPreview(summaryBtn, video, 'summary'));
      summaryBtn.addEventListener('mouseleave', scheduleHidePreview);
    }

    return summaryBtn;
  }

  function createTagButton(video, pendingRecord) {
    const tagBtn = document.createElement('button');
    const transcriptReady = hasTranscript(video);
    const tagReady = hasTags(video);
    const tagLoading = tagLoads.has(video.id);
    const tagBlocked = !transcriptReady;
    tagBtn.className = `yt-playlist-alt-tags-btn ${tagReady ? 'yt-playlist-alt-tags-btn--ready' : 'yt-playlist-alt-tags-btn--missing'}`;
    if (tagLoading) tagBtn.classList.add('yt-playlist-alt-tags-btn--loading');
    tagBtn.type = 'button';
    tagBtn.disabled = tagBlocked;
    tagBtn.title = tagBlocked ? 'Fetch transcript first' : tagReady ? 'Tags ready' : 'Generate tags';
    tagBtn.setAttribute('aria-label', tagBtn.title);
    tagBtn.innerHTML = tagLoading ? '<span class="yt-transcript-spinner"></span>' : 'Tag';
    tagBtn.onclick = event => handleTagClick(event, video);
    if (pendingRecord) tagBtn.disabled = true;

    return tagBtn;
  }

  function createTagsDisplay(video) {
    const tags = getVideoTags(video);
    if (tags.length === 0) return null;

    const wrap = document.createElement('div');
    wrap.className = 'yt-playlist-alt-tags';

    tags.forEach((tag, index) => {
      const chip = document.createElement('span');
      chip.className = 'yt-playlist-alt-tag';
      if (index >= tagDisplayLimit) chip.classList.add('yt-playlist-alt-tag--extra');
      chip.textContent = tag;
      wrap.appendChild(chip);
    });

    return wrap;
  }

  const api = {
    cleanup: cleanupPanelRuntime,
    open() {
      panel.style.display = 'flex';
      safeStorageSet({ panelMode: options.mode || 'docked', panelOpen: isFloating });
      loadPlaylists();
    },
    close() {
      panel.style.display = 'none';
      if (isFloating) safeStorageSet({ panelOpen: false });
    },
    isOpen() {
      return panel.style.display !== 'none';
    },
    loadPlaylists,
    loadVideos,
    renderVideos,
    requestVideoRemoval,
    requestVideoRemovals,
    ensureFloatingToggle,
    setSyncStatus,
    startSync: syncCurrentPage,
    getCurrentPlaylistId() {
      return currentPlaylistId;
    },
    setCurrentPlaylistId(id) {
      currentPlaylistId = id;
      renderPlaylistOptions();
      safeStorageSet({ selectedPlaylistId: currentPlaylistId });
    },
    getAllVideos() {
      return allVideos;
    },
    hasVideo(videoId) {
      return allVideos.some(v => v.id === videoId);
    },
    getGroupByAuthor() {
      return groupByAuthor;
    },
    addExpandedGroup(author) {
      if (author) expandedGroups.add(author);
    },
    getRemoveAfterFullyWatched() {
      return removeFullyWatchedInput.checked;
    },
    getRemoveOnSkip() {
      return removeOnSkipInput.checked;
    },
    getPanelElement() {
      return panel;
    }
  };

  function isYoutubeFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.querySelector('.html5-video-player.ytp-fullscreen')
    );
  }

  function updateFloatingToggleVisibility() {
    if (!toggleBtn) return;
    toggleBtn.classList.toggle('yt-playlist-alt-toggle--hidden', isYoutubeFullscreenActive());
  }

  function watchFullscreenToggleVisibility() {
    if (!isFloating || fullscreenToggleTimerId) return;
    document.addEventListener('fullscreenchange', updateFloatingToggleVisibility);
    document.addEventListener('webkitfullscreenchange', updateFloatingToggleVisibility);
    window.addEventListener('resize', updateFloatingToggleVisibility);
    fullscreenToggleTimerId = setInterval(updateFloatingToggleVisibility, 1000);
  }

  function ensureFloatingToggle() {
    if (!isFloating) return null;

    toggleBtn = document.getElementById('yt-playlist-alt-toggle');
    if (!toggleBtn) {
      toggleBtn = document.createElement('button');
      toggleBtn.id = 'yt-playlist-alt-toggle';
      document.body.appendChild(toggleBtn);
    } else if (toggleBtn.parentElement !== document.body) {
      document.body.appendChild(toggleBtn);
    }

    toggleBtn.type = 'button';
    toggleBtn.title = api.isOpen() ? 'Close playlists panel' : 'Open playlists panel';
    toggleBtn.setAttribute('aria-label', toggleBtn.title);
    toggleBtn.innerHTML = '&#9776;';
    toggleBtn.onclick = event => {
      event.stopPropagation();
      if (api.isOpen()) api.close();
      else api.open();
      toggleBtn.title = api.isOpen() ? 'Close playlists panel' : 'Open playlists panel';
      toggleBtn.setAttribute('aria-label', toggleBtn.title);
    };

    updateFloatingToggleVisibility();
    return toggleBtn;
  }

  function askYoutubeCleanup(removedCount) {
    return new Promise(resolve => {
      const noun = removedCount === 1 ? 'video is' : 'videos are';
      const overlay = document.createElement('div');
      overlay.className = 'yt-sync-cleanup-modal';
      overlay.innerHTML = `
        <div class="yt-sync-cleanup-dialog">
          <div class="yt-sync-cleanup-title">Clean YouTube playlist?</div>
          <div class="yt-sync-cleanup-text">
            ${removedCount} ${noun} marked as removed or moved in this panel and still pending YouTube cleanup. During sync, remove matching videos from the real YouTube playlist when they are found?
          </div>
          <div class="yt-sync-cleanup-actions">
            <button type="button" data-choice="no">No, sync only</button>
            <button type="button" data-choice="yes">Yes, clean YouTube</button>
          </div>
        </div>
      `;

      const finish = value => {
        overlay.remove();
        resolve(value);
      };

      overlay.addEventListener('click', event => {
        if (event.target === overlay) finish(false);
        const button = event.target.closest && event.target.closest('button[data-choice]');
        if (!button) return;
        finish(button.dataset.choice === 'yes');
      });

      panel.appendChild(overlay);
    });
  }

  async function syncCurrentPage(syncOptions = {}) {
    if (syncOptions && syncOptions.type) syncOptions = {};
    if (syncInProgress) {
      await stopCurrentSync();
      return;
    }
    if (!currentPlaylistId) {
      showSyncPopup('Select a playlist first.');
      return;
    }

    try {
      playlists = await window.api.getPlaylists({ force: true });
    } catch (err) {
      showSyncPopup('Server is not available.');
      return;
    }

    const playlist = getCurrentPlaylist();
    const sourceError = validatePlaylistSource(playlist);
    if (sourceError) {
      showSyncPopup(sourceError);
      return;
    }

    setSyncRunning(true);
    const syncToken = ++syncRequestToken;
    setSyncStatus('Checking YouTube page...', 'busy');
    let keepBusy = false;

    try {
      const activeSource = options.getActivePlaylistSource
        ? await options.getActivePlaylistSource(api)
        : await sendRuntimeMessage({ action: 'getActiveYoutubePlaylistSource' });
      if (syncToken !== syncRequestToken) return;
      const source = activeSource && activeSource.source ? activeSource.source : activeSource;
      if (!source || source.success === false || !source.sourceId) {
        throw new Error((source && source.error) || 'Open a YouTube playlist page first.');
      }
      const expectedSourceId = syncOptions.expectedSourceId || playlist.source_id;
      if (source.sourceId !== expectedSourceId) {
        throw new Error('Current YouTube page does not match the selected playlist URL.');
      }

      const removedVideos = await window.api.getYoutubeCleanupPendingVideos(currentPlaylistId);
      if (syncToken !== syncRequestToken) return;
      const cleanupYoutube = typeof syncOptions.cleanupYoutube === 'boolean'
        ? syncOptions.cleanupYoutube
        : removedVideos.length > 0 ? await askYoutubeCleanup(removedVideos.length) : false;
      if (syncToken !== syncRequestToken) return;

      safeStorageSet({ selectedPlaylistId: currentPlaylistId });
      const response = options.startSyncPage
        ? await options.startSyncPage({
            playlistId: currentPlaylistId,
            expectedSourceId,
            cleanupYoutube,
            source,
            panel: api
          })
        : await sendRuntimeMessage({
            action: 'startPlaylistSync',
            playlistId: currentPlaylistId,
            expectedSourceId,
            cleanupYoutube
          });
      if (syncToken !== syncRequestToken) return;

      if (!response.success) {
        setSyncStatus(response.error || 'Failed to start sync.', 'error');
        return;
      }

      keepBusy = !!response.keepBusy;
      if (response.message) setSyncStatus(response.message, response.state || 'busy');
      else if (!keepBusy) setSyncStatus('Sync finished.', 'success');
      else setSyncStatus('Sync started on YouTube page...', 'busy');
    } catch (err) {
      showSyncPopup(err.message || 'Failed to start sync.');
    } finally {
      if (!keepBusy) {
        setSyncRunning(false);
      }
    }
  }

  async function stopCurrentSync() {
    if (!syncInProgress || syncStopInProgress) return;
    syncRequestToken++;
    syncStopInProgress = true;
    updateSyncButtonState();
    setSyncStatus('Stopping sync...', 'busy');

    try {
      const response = options.stopSyncPage
        ? await options.stopSyncPage()
        : await sendRuntimeMessage({ action: 'stopPlaylistSync' });

      if (!response || response.success === false) {
        throw new Error((response && response.error) || 'Failed to stop sync.');
      }

      if (!response.stopped) {
        setSyncRunning(false);
        setSyncStatus('No active sync found.', 'error');
      }
    } catch (err) {
      syncStopInProgress = false;
      updateSyncButtonState();
      showSyncPopup(err.message || 'Failed to stop sync.');
    }
  }

  async function refreshPanel() {
    refreshBtn.disabled = true;
    setSyncStatus('Refreshing from server...', 'busy');

    try {
      const refreshed = await loadPlaylists(true);
      if (refreshed) setSyncStatus('Panel refreshed.', 'success');
    } finally {
      if (extensionContextAlive) refreshBtn.disabled = false;
    }
  }

  function applyStoredState(res) {
    if (isFloating) {
      if (res.panelWidth) panel.style.width = `${res.panelWidth}px`;
      panel.style.display = res.panelOpen ? 'flex' : 'none';
    }
    if (res.selectedPlaylistId) currentPlaylistId = res.selectedPlaylistId;
    if (res.sortOption) sortOption = res.sortOption;
    if (res.groupSortOption) groupSortOption = res.groupSortOption;
    if (res.groupByAuthor) groupByAuthor = res.groupByAuthor;
    if (res.statusFilter) statusFilter = res.statusFilter;
    if (res.showUnavailableOnly) statusFilter = 'missing';
    if (res.dateFilterField) dateField = res.dateFilterField;
    if (res.dateFilterDirection) dateDirection = res.dateFilterDirection;
    if (res.dateFilterAmount) dateAmount = res.dateFilterAmount;
    if (res.dateFilterUnit) dateUnit = res.dateFilterUnit;
    if (Array.isArray(res.tagFilters)) selectedTagFilters = normalizeSelectedTagFilters(res.tagFilters);
    if (Array.isArray(res.pendingRemovals)) pendingRemovalRecords = res.pendingRemovals;
    if (shouldShowStoredStatus(res.dockedSyncStatus)) {
      setSyncStatus(res.dockedSyncStatus.text, res.dockedSyncStatus.state || '', {
        key: res.dockedSyncStatus.key || '',
        persist: false
      });
    }

    sortSelect.value = sortOption;
    groupSortSelect.value = groupSortOption;
    groupByAuthorInput.checked = groupByAuthor;
    statusFilterSelect.value = statusFilter;
    dateFilterField.value = dateField;
    dateFilterDirection.value = dateDirection;
    dateFilterAmount.value = dateAmount;
    dateFilterUnit.value = dateUnit;
    removeFullyWatchedInput.checked = !!res.removeAfterFullyWatched;
    removeOnSkipInput.checked = !!res.removeOnSkip;
    updateSortOptions();
    renderSelectedTagFilters();
    updateFilterButtonState();
  }

  filterToggle.addEventListener('click', () => {
    settings.style.display = settings.style.display === 'flex' ? 'none' : 'flex';
  });
  if (autoTranscriptBtn) autoTranscriptBtn.addEventListener('click', toggleAutoTranscript);
  if (autoSummaryBtn) autoSummaryBtn.addEventListener('click', toggleAutoSummary);
  if (autoTagBtn) autoTagBtn.addEventListener('click', toggleAutoTag);
  updateAutoAssetButtons();

  if (isFloating) {
    const closeBtn = document.getElementById('yt-playlist-alt-close');
    if (closeBtn) closeBtn.addEventListener('click', api.close);
    ensureFloatingToggle();
    watchFullscreenToggleVisibility();

    const resizeHandle = document.getElementById('yt-playlist-alt-resize-handle');
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', event => {
        event.preventDefault();
        resizeHandle.classList.add('dragging');
        const startX = event.clientX;
        const startWidth = panel.offsetWidth;

        const onMouseMove = moveEvent => {
          const newWidth = Math.max(260, Math.min(700, startWidth - (moveEvent.clientX - startX)));
          panel.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          resizeHandle.classList.remove('dragging');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          safeStorageSet({ panelWidth: parseInt(panel.style.width, 10) });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  }

  refreshBtn.addEventListener('click', refreshPanel);
  scrollCurrentBtn.addEventListener('click', scrollToCurrentVideo);

  select.addEventListener('change', async event => {
    currentPlaylistId = event.target.value;
    safeStorageSet({ selectedPlaylistId: currentPlaylistId });
    await loadVideos();
  });

  searchInput.addEventListener('input', () => {
    renderVideos();
    renderTagSuggestions();
  });
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderVideos();
    renderTagSuggestions();
    searchInput.focus();
  });
  tagFilterField.addEventListener('click', () => tagFilterInput.focus());
  tagFilterInput.addEventListener('input', renderTagSuggestions);
  tagFilterInput.addEventListener('focus', renderTagSuggestions);
  tagFilterInput.addEventListener('blur', () => setTimeout(hideTagSuggestions, 120));
  tagFilterInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!tagFilterInput.value.trim()) return;
      if (getTagSuggestionItems().length === 0) renderTagSuggestions();
      if (getTagSuggestionItems().length === 0) return;

      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = activeTagSuggestionIndex < 0
        ? direction > 0 ? 0 : getTagSuggestionItems().length - 1
        : activeTagSuggestionIndex + direction;
      setActiveTagSuggestion(nextIndex);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      addTagFilter(getActiveTagSuggestionValue() || tagFilterInput.value);
      return;
    }

    if (event.key === 'Tab' && tagFilterInput.value.trim()) {
      event.preventDefault();
      addTagFilter(getActiveTagSuggestionValue() || tagFilterInput.value);
      return;
    }

    if (event.key === 'Backspace' && !tagFilterInput.value && selectedTagFilters.length > 0) {
      removeTagFilter(selectedTagFilters[selectedTagFilters.length - 1]);
    }
  });
  syncBtn.addEventListener('click', () => syncCurrentPage());

  sortSelect.addEventListener('change', () => {
    sortOption = sortSelect.value;
    safeStorageSet({ sortOption });
    renderVideos();
  });

  groupSortSelect.addEventListener('change', () => {
    groupSortOption = groupSortSelect.value;
    safeStorageSet({ groupSortOption });
    renderVideos();
  });

  groupByAuthorInput.addEventListener('change', () => {
    groupByAuthor = groupByAuthorInput.checked;
    safeStorageSet({ groupByAuthor });
    updateSortOptions();
    renderVideos();
  });

  statusFilterSelect.addEventListener('change', () => {
    statusFilter = statusFilterSelect.value;
    safeStorageSet({ statusFilter, showUnavailableOnly: false });
    updateFilterButtonState();
    renderVideos();
    renderTagSuggestions();
  });

  dateFilterField.addEventListener('change', () => {
    dateField = dateFilterField.value;
    safeStorageSet({ dateFilterField: dateField });
    updateFilterButtonState();
    renderVideos();
    renderTagSuggestions();
  });

  dateFilterDirection.addEventListener('change', () => {
    dateDirection = dateFilterDirection.value;
    safeStorageSet({ dateFilterDirection: dateDirection });
    updateFilterButtonState();
    renderVideos();
    renderTagSuggestions();
  });

  dateFilterAmount.addEventListener('input', () => {
    dateAmount = dateFilterAmount.value;
    safeStorageSet({ dateFilterAmount: dateAmount });
    updateFilterButtonState();
    renderVideos();
    renderTagSuggestions();
  });

  dateFilterUnit.addEventListener('change', () => {
    dateUnit = dateFilterUnit.value;
    safeStorageSet({ dateFilterUnit: dateUnit });
    updateFilterButtonState();
    renderVideos();
    renderTagSuggestions();
  });

  removeFullyWatchedInput.addEventListener('change', () => {
    safeStorageSet({ removeAfterFullyWatched: removeFullyWatchedInput.checked });
  });

  removeOnSkipInput.addEventListener('change', () => {
    safeStorageSet({ removeOnSkip: removeOnSkipInput.checked });
  });

  safeStorageOnChanged((changes, area) => {
    if (area !== 'local') return;

    if (changes.dockedSyncStatus && changes.dockedSyncStatus.newValue) {
      const status = changes.dockedSyncStatus.newValue;
      if (!shouldShowStoredStatus(status)) {
        setSyncStatus('', '', { persist: false });
        setSyncRunning(false);
        return;
      }

      setSyncStatus(status.text, status.state || '', {
        key: status.key || '',
        persist: false
      });
      if (status.state === 'busy') {
        setSyncRunning(true);
      }
      if (status.state === 'success' || status.state === 'error') {
        setSyncRunning(false);
        if (status.state === 'success') {
          loadPlaylists(true);
        }
      }
    }

    if (changes.pendingRemovals && Array.isArray(changes.pendingRemovals.newValue)) {
      pendingRemovalRecords = changes.pendingRemovals.newValue;
    }
  });

  const storageKeys = [
    'panelOpen',
    'panelWidth',
    'selectedPlaylistId',
    'sortOption',
    'groupSortOption',
    'groupByAuthor',
    'showUnavailableOnly',
    'statusFilter',
    'dateFilterField',
    'dateFilterDirection',
    'dateFilterAmount',
    'dateFilterUnit',
    'tagFilters',
    'removeAfterFullyWatched',
    'removeOnSkip',
    'pendingRemovals',
    'dockedSyncStatus'
  ];

  safeStorageGet(storageKeys, res => {
    applyStoredState(res);
    safeStorageSet({ panelMode: options.mode || 'docked', panelOpen: isFloating ? !!res.panelOpen : false });
    connectTranscriptEvents();
    connectSummaryEvents();
    loadAssetSettings().finally(() => {
      if (!isFloating || res.panelOpen || options.loadWhenClosed) loadPlaylists();
    });
  });

  return api;
  }

  window.ytbPanel = { create, getPanelHtml };
})();
