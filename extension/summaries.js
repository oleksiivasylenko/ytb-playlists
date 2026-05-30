(function() {
  const HIDDEN_STORAGE_KEY = 'hiddenSummaryVideoIds';
  const PAGE_STATE_STORAGE_KEY = 'summariesPageState';
  const REMOVAL_DELAY_MS = 5000;

  const listEl = document.getElementById('summary-list');
  const statusEl = document.getElementById('summary-status');
  const countEl = document.getElementById('summary-count');
  const refreshBtn = document.getElementById('refresh-summaries');
  const playlistFilter = document.getElementById('summary-playlist-filter');
  const textSearch = document.getElementById('summary-text-search');
  const statusFilter = document.getElementById('summary-status-filter');
  const tagFilterField = document.getElementById('summary-tag-filter');
  const tagFilterChips = document.getElementById('summary-tag-filter-chips');
  const tagFilterInput = document.getElementById('summary-tag-filter-input');
  const tagSuggestions = document.getElementById('summary-tag-suggestions');
  const hiddenFilterButtons = Array.from(document.querySelectorAll('[data-hidden-filter]'));
  const moveModalRoot = document.getElementById('move-modal-root');

  let summaries = [];
  let playlists = [];
  let selectedTagFilters = [];
  let selectedPlaylistIds = new Set(['all']);
  let hiddenVideoIds = new Set();
  let hiddenFilter = 'visible';
  let activeTagSuggestionIndex = -1;
  const pendingRemovals = new Map();
  let removalTimerId = null;

  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, res => resolve(res || {})));
  }

  function storageSet(payload) {
    return new Promise(resolve => chrome.storage.local.set(payload, resolve));
  }

  function savePageState() {
    storageSet({
      [PAGE_STATE_STORAGE_KEY]: {
        selectedPlaylistIds: Array.from(selectedPlaylistIds),
        statusFilter: statusFilter.value,
        textSearch: textSearch.value,
        selectedTagFilters,
        hiddenFilter
      }
    });
  }

  function setStatus(text, state = '') {
    statusEl.textContent = text || '';
    statusEl.className = state ? `status-text ${state}` : 'status-text';
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
      video.availability === 'unavailable';
  }

  function matchesStatusFilter(video) {
    const status = normalizeVideoStatus(video);
    if (statusFilter.value === 'all') return true;
    if (statusFilter.value === 'active') return status === 'active';
    if (statusFilter.value === 'missing') return isMissingVideo(video);
    if (statusFilter.value === 'youtube_cleanup_pending') return isYoutubeCleanupPending(video);
    if (statusFilter.value === 'removed_from_source') return status === 'removed_from_source' || status === 'removed';
    if (statusFilter.value === 'unavailable_on_youtube') return status === 'unavailable_on_youtube' || status === 'unavailable';
    return status === statusFilter.value;
  }

  function matchesPlaylistFilter(video) {
    if (selectedPlaylistIds.has('all') || selectedPlaylistIds.size === 0) return true;
    return selectedPlaylistIds.has(String(video.playlist_id));
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

  function normalizeTag(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function getTagKey(value) {
    return normalizeTag(value).toLowerCase();
  }

  function getUniqueTags(videos = summaries) {
    const tagsByKey = new Map();
    videos.forEach(video => {
      getVideoTags(video).forEach(tag => {
        const value = normalizeTag(tag);
        const key = value.toLowerCase();
        if (value && !tagsByKey.has(key)) tagsByKey.set(key, value);
      });
    });
    return Array.from(tagsByKey.values()).sort((a, b) => a.localeCompare(b));
  }

  function matchesTagFilters(video) {
    if (selectedTagFilters.length === 0) return true;
    const videoTags = new Set(getVideoTags(video).map(getTagKey));
    return selectedTagFilters.every(tag => videoTags.has(getTagKey(tag)));
  }

  function matchesTextSearch(video) {
    const query = textSearch.value.trim().toLowerCase();
    if (!query) return true;
    const title = (video.title || '').toLowerCase();
    const tags = getVideoTags(video).map(tag => tag.toLowerCase());
    return title.includes(query) || tags.some(tag => tag.includes(query));
  }

  function matchesHiddenFilter(video) {
    const hidden = hiddenVideoIds.has(video.id);
    if (hiddenFilter === 'all') return true;
    if (hiddenFilter === 'hidden') return hidden;
    return !hidden;
  }

  function getFilteredSummaries() {
    return summaries.filter(video => {
      if (!matchesPlaylistFilter(video)) return false;
      if (!matchesStatusFilter(video)) return false;
      if (!matchesHiddenFilter(video)) return false;
      if (!matchesTagFilters(video)) return false;
      return matchesTextSearch(video);
    });
  }

  function formatDuration(seconds) {
    const total = Number(seconds) || 0;
    if (total <= 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatCompactViews(value) {
    const count = Number(value) || 0;
    if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
    return count > 0 ? String(count) : '';
  }

  function formatDate(value) {
    if (!value) return '';
    const time = new Date(value).getTime();
    if (!time) return '';
    return new Date(time).toLocaleDateString();
  }

  function getStatusLabel(video) {
    const status = normalizeVideoStatus(video);
    if (status === 'moved_to_playlist') {
      return video.moved_to_playlist_name ? `Moved to ${video.moved_to_playlist_name}` : 'Moved to another list';
    }
    if (isYoutubeCleanupPending(video)) return 'Pending YouTube cleanup';
    if (status === 'removed_by_user') return 'Removed by you';
    if (status === 'removed_from_source' || status === 'removed') return 'Removed from YouTube playlist';
    if (status === 'unavailable_on_youtube' || status === 'unavailable') return 'Unavailable on YouTube';
    return '';
  }

  function isDeleteVisible(video) {
    const status = normalizeVideoStatus(video);
    return status !== 'removed_by_user' && status !== 'moved_to_playlist';
  }

  function isRestorableVideo(video) {
    return normalizeVideoStatus(video) === 'removed_by_user';
  }

  function isMovableVideo(video) {
    const status = normalizeVideoStatus(video);
    return status === 'active' || status === 'removed_by_user';
  }

  function getSummaryModes(video) {
    const modes = new Set();
    if (video.has_summary === 1 || video.has_summary === true) modes.add('plain');
    if (video.has_html_summary === 1 || video.has_html_summary === true) modes.add('html');
    String(video.summary_modes || '').split(',').map(mode => mode.trim()).filter(Boolean).forEach(mode => modes.add(mode));
    return Array.from(modes).filter(mode => mode === 'plain' || mode === 'html');
  }

  function getPrimarySummaryMode(video) {
    const modes = getSummaryModes(video);
    return modes.includes('html') ? 'html' : modes[0] || 'plain';
  }

  function stopPropagation(handler) {
    return event => {
      event.stopPropagation();
      handler(event);
    };
  }

  function openSummary(video, mode = getPrimarySummaryMode(video)) {
    const url = chrome.runtime.getURL(`asset.html?type=summary&videoId=${encodeURIComponent(video.id)}&mode=${encodeURIComponent(mode)}`);
    window.open(url, '_blank');
  }

  function openYoutube(video) {
    chrome.runtime.sendMessage({ action: 'openYoutubeVideo', videoId: video.id, newTab: true });
  }

  function renderTagChips() {
    tagFilterChips.innerHTML = '';
    selectedTagFilters.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-filter-chip';
      chip.textContent = tag;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'x';
      removeBtn.title = `Remove ${tag}`;
      removeBtn.addEventListener('click', () => {
        selectedTagFilters = selectedTagFilters.filter(item => getTagKey(item) !== getTagKey(tag));
        renderTagChips();
        renderSummaries();
        savePageState();
      });

      chip.appendChild(removeBtn);
      tagFilterChips.appendChild(chip);
    });
    tagFilterInput.placeholder = selectedTagFilters.length ? '' : 'Filter by tags...';
  }

  function renderPlaylistFilterOptions() {
    const current = new Set(selectedPlaylistIds);
    playlistFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All';
    allOption.selected = current.has('all') || current.size === 0;
    playlistFilter.appendChild(allOption);

    playlists.forEach(playlist => {
      const option = document.createElement('option');
      option.value = String(playlist.id);
      option.textContent = playlist.name || `Playlist ${playlist.id}`;
      option.selected = current.has(String(playlist.id));
      playlistFilter.appendChild(option);
    });
  }

  function applyPlaylistFilterSelection() {
    const values = Array.from(playlistFilter.selectedOptions).map(option => option.value);
    if (values.length === 0) {
      selectedPlaylistIds = new Set(['all']);
    } else if (values.includes('all') && !selectedPlaylistIds.has('all')) {
      selectedPlaylistIds = new Set(['all']);
    } else {
      const playlistIds = values.filter(value => value !== 'all');
      selectedPlaylistIds = new Set(playlistIds.length > 0 ? playlistIds : ['all']);
    }

    renderPlaylistFilterOptions();
    renderTagSuggestions();
    renderSummaries();
    savePageState();
  }

  function getTagSuggestionItems() {
    return Array.from(tagSuggestions.querySelectorAll('.tag-suggestion'));
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
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function hideTagSuggestions() {
    activeTagSuggestionIndex = -1;
    tagSuggestions.innerHTML = '';
    tagSuggestions.classList.remove('open');
  }

  function addTagFilter(value) {
    const query = normalizeTag(value);
    if (!query) return;

    const key = query.toLowerCase();
    const actual = getUniqueTags(getFilteredSummaries()).find(tag => tag.toLowerCase() === key) || query;
    if (selectedTagFilters.some(tag => getTagKey(tag) === getTagKey(actual))) {
      tagFilterInput.value = '';
      hideTagSuggestions();
      return;
    }

    selectedTagFilters = [...selectedTagFilters, actual];
    tagFilterInput.value = '';
    renderTagChips();
    renderSummaries();
    savePageState();
    tagFilterInput.focus();
  }

  function renderTagSuggestions() {
    const query = tagFilterInput.value.trim();
    if (!query) {
      hideTagSuggestions();
      return;
    }

    const selected = new Set(selectedTagFilters.map(getTagKey));
    const queryKey = query.toLowerCase();
    const suggestions = getUniqueTags(getFilteredSummaries())
      .filter(tag => !selected.has(tag.toLowerCase()))
      .filter(tag => tag.toLowerCase().includes(queryKey))
      .slice(0, 80);

    tagSuggestions.innerHTML = '';
    tagSuggestions.classList.toggle('open', suggestions.length > 0);
    suggestions.forEach((tag, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tag-suggestion';
      item.dataset.tag = tag;
      item.textContent = tag;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.addEventListener('mouseenter', () => setActiveTagSuggestion(index));
      item.addEventListener('mousedown', event => {
        event.preventDefault();
        addTagFilter(tag);
      });
      tagSuggestions.appendChild(item);
    });
    setActiveTagSuggestion(0);
  }

  async function saveHiddenSummaries() {
    await storageSet({ [HIDDEN_STORAGE_KEY]: Array.from(hiddenVideoIds) });
  }

  async function toggleHidden(video) {
    if (hiddenVideoIds.has(video.id)) hiddenVideoIds.delete(video.id);
    else hiddenVideoIds.add(video.id);
    await saveHiddenSummaries();
    renderSummaries();
  }

  function getRemovalCountdown(record) {
    return Math.max(0, Math.ceil((record.deadlineAt - Date.now()) / 1000));
  }

  function stopRemovalTimerIfIdle() {
    if (pendingRemovals.size > 0 || !removalTimerId) return;
    clearInterval(removalTimerId);
    removalTimerId = null;
  }

  function ensureRemovalTimer() {
    if (removalTimerId) return;
    removalTimerId = setInterval(tickPendingRemovals, 250);
  }

  function queueRemoval(video) {
    const key = getSummaryKey(video);
    if (pendingRemovals.has(key) || !isDeleteVisible(video)) return;
    pendingRemovals.set(key, {
      key,
      playlistId: video.playlist_id,
      videoId: video.id,
      deadlineAt: Date.now() + REMOVAL_DELAY_MS
    });
    ensureRemovalTimer();
    renderSummaries();
  }

  function cancelRemoval(key) {
    pendingRemovals.delete(key);
    stopRemovalTimerIfIdle();
    renderSummaries();
  }

  async function commitRemoval(key) {
    const record = pendingRemovals.get(key);
    if (!record) return;
    pendingRemovals.delete(key);

    try {
      await window.api.removeVideoFromPlaylist(record.playlistId, record.videoId);
      summaries = summaries.map(item => getSummaryKey(item) === key
        ? {
            ...item,
            status: 'removed_by_user',
            youtube_removed_at: null,
            youtube_cleanup_error: null,
            moved_to_playlist_id: null,
            moved_to_playlist_name: '',
            moved_at: null
          }
        : item);
      setStatus('Video removed from playlist.', 'success');
    } catch (err) {
      setStatus(`Failed to remove video: ${err.message || 'unknown error'}`, 'error');
    } finally {
      renderSummaries();
      stopRemovalTimerIfIdle();
    }
  }

  function tickPendingRemovals() {
    const due = [];
    for (const [key, record] of pendingRemovals.entries()) {
      const count = getRemovalCountdown(record);
      const countEl = document.querySelector(`[data-removal-count="${key}"]`);
      if (countEl) countEl.textContent = String(count);
      if (count <= 0) due.push(key);
    }
    due.forEach(key => commitRemoval(key));
    stopRemovalTimerIfIdle();
  }

  function getSummaryKey(video) {
    return `${video.playlist_id}:${video.id}`;
  }

  function getPlaylistLabel(playlist) {
    const count = Number(playlist && playlist.video_count);
    return `${playlist.name} - ${Number.isFinite(count) ? count : 0} videos`;
  }

  function askMoveTarget(video) {
    return new Promise(resolve => {
      const targets = playlists.filter(playlist => String(playlist.id) !== String(video.playlist_id));
      if (targets.length === 0) {
        resolve(null);
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'move-modal';

      const dialog = document.createElement('div');
      dialog.className = 'move-dialog';

      const title = document.createElement('div');
      title.className = 'move-title';
      title.textContent = isRestorableVideo(video) ? 'Restore and move video to list' : 'Move video to list';

      const select = document.createElement('select');
      targets.forEach(playlist => {
        const option = document.createElement('option');
        option.value = playlist.id;
        option.textContent = getPlaylistLabel(playlist);
        select.appendChild(option);
      });

      const actions = document.createElement('div');
      actions.className = 'move-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';

      const moveBtn = document.createElement('button');
      moveBtn.type = 'button';
      moveBtn.dataset.primary = 'true';
      moveBtn.textContent = isRestorableVideo(video) ? 'Restore & Move' : 'Move';

      const finish = value => {
        overlay.remove();
        resolve(value);
      };

      cancelBtn.addEventListener('click', () => finish(null));
      moveBtn.addEventListener('click', () => finish(select.value));
      overlay.addEventListener('click', event => {
        if (event.target === overlay) finish(null);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(moveBtn);
      dialog.appendChild(title);
      dialog.appendChild(select);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      moveModalRoot.appendChild(overlay);
      select.focus();
    });
  }

  async function moveVideo(video) {
    if (!isMovableVideo(video)) return;
    if (playlists.length <= 1) {
      setStatus('Create another list before moving videos.', 'error');
      return;
    }

    const targetPlaylistId = await askMoveTarget(video);
    if (!targetPlaylistId) return;

    try {
      const target = playlists.find(playlist => String(playlist.id) === String(targetPlaylistId));
      const result = await window.api.moveVideosToPlaylist(video.playlist_id, targetPlaylistId, [video.id]);
      if (!Number(result.moved)) {
        setStatus('No videos were moved.', 'error');
        return;
      }

      const key = getSummaryKey(video);
      summaries = summaries.map(item => getSummaryKey(item) === key
        ? {
            ...item,
            status: 'moved_to_playlist',
            moved_to_playlist_id: targetPlaylistId,
            moved_to_playlist_name: target ? target.name : '',
            moved_at: new Date().toISOString(),
            youtube_removed_at: null,
            youtube_cleanup_error: null
          }
        : item);
      setStatus(isRestorableVideo(video) ? 'Video restored and moved.' : 'Video moved.', 'success');
      renderSummaries();
    } catch (err) {
      setStatus(`Failed to move video: ${err.message || 'unknown error'}`, 'error');
    }
  }

  function createModeButtons(video) {
    const wrap = document.createElement('div');
    wrap.className = 'summary-modes';

    getSummaryModes(video).forEach(mode => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'summary-mode';
      button.textContent = mode === 'html' ? 'HTML' : 'Text';
      button.title = `Open ${button.textContent} summary`;
      button.addEventListener('click', stopPropagation(() => openSummary(video, mode)));
      wrap.appendChild(button);
    });

    return wrap;
  }

  function createSummaryItem(video) {
    const key = getSummaryKey(video);
    const item = document.createElement('article');
    item.className = `summary-item status-${normalizeVideoStatus(video)}`;
    item.dataset.videoId = video.id;
    item.dataset.playlistId = video.playlist_id;
    if (pendingRemovals.has(key)) item.classList.add('pending-removal');

    const thumb = document.createElement('div');
    thumb.className = 'summary-thumb';

    const img = document.createElement('img');
    img.src = video.thumbnail || '';
    img.alt = '';
    thumb.appendChild(img);

    const duration = formatDuration(video.duration);
    if (duration) {
      const badge = document.createElement('span');
      badge.className = 'summary-duration';
      badge.textContent = duration;
      thumb.appendChild(badge);
    }

    const info = document.createElement('div');
    info.className = 'summary-info';

    const title = document.createElement('div');
    title.className = 'summary-title';
    title.textContent = video.title || 'Unknown Title';

    const meta = document.createElement('div');
    meta.className = 'summary-meta';
    const status = getStatusLabel(video);
    const views = formatCompactViews(video.view_count);
    const updated = formatDate(video.latest_summary_updated_at);
    meta.textContent = [
      status,
      video.author || 'Unknown Author',
      views ? `${views} views` : '',
      updated ? `Summary ${updated}` : ''
    ].filter(Boolean).join(' - ');

    const playlist = document.createElement('div');
    playlist.className = 'summary-playlist';
    playlist.textContent = video.playlist_name ? `Playlist: ${video.playlist_name}` : '';

    const tags = document.createElement('div');
    tags.className = 'summary-tags';
    getVideoTags(video).slice(0, 8).forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'summary-tag';
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    info.appendChild(title);
    info.appendChild(meta);
    if (playlist.textContent) info.appendChild(playlist);
    info.appendChild(createModeButtons(video));
    if (tags.children.length > 0) info.appendChild(tags);

    const actions = document.createElement('div');
    actions.className = 'summary-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'summary-open-btn';
    openBtn.textContent = 'Open';
    openBtn.title = 'Open summary';
    openBtn.addEventListener('click', stopPropagation(() => openSummary(video)));
    actions.appendChild(openBtn);

    const youtubeBtn = document.createElement('button');
    youtubeBtn.type = 'button';
    youtubeBtn.textContent = 'YT';
    youtubeBtn.title = 'Open YouTube video';
    youtubeBtn.addEventListener('click', stopPropagation(() => openYoutube(video)));
    actions.appendChild(youtubeBtn);

    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'summary-hide-btn';
    hideBtn.textContent = hiddenVideoIds.has(video.id) ? 'Show' : 'Hide';
    hideBtn.title = hiddenVideoIds.has(video.id) ? 'Show summary locally' : 'Hide summary locally';
    hideBtn.addEventListener('click', stopPropagation(() => toggleHidden(video)));
    actions.appendChild(hideBtn);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'summary-move-btn';
    moveBtn.textContent = isRestorableVideo(video) ? 'Restore & Move' : 'Move';
    moveBtn.title = moveBtn.textContent;
    moveBtn.disabled = !isMovableVideo(video);
    moveBtn.addEventListener('click', stopPropagation(() => moveVideo(video)));
    actions.appendChild(moveBtn);

    if (isDeleteVisible(video)) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'summary-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.title = 'Remove from playlist';
      deleteBtn.addEventListener('click', stopPropagation(() => queueRemoval(video)));
      actions.appendChild(deleteBtn);
    }

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(actions);
    item.addEventListener('click', () => openSummary(video));

    const pendingRecord = pendingRemovals.get(key);
    if (pendingRecord) {
      const overlay = document.createElement('div');
      overlay.className = 'removal-overlay';

      const count = document.createElement('div');
      count.className = 'removal-count';
      count.dataset.removalCount = key;
      count.textContent = String(getRemovalCountdown(pendingRecord));

      const message = document.createElement('div');
      message.textContent = 'Removing from playlist';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Stop removal';
      cancel.addEventListener('click', stopPropagation(() => cancelRemoval(key)));

      overlay.appendChild(message);
      overlay.appendChild(count);
      overlay.appendChild(cancel);
      item.appendChild(overlay);
    }

    return item;
  }

  function renderSummaries() {
    const filtered = getFilteredSummaries();
    listEl.innerHTML = '';
    countEl.textContent = `${filtered.length} shown / ${summaries.length} generated`;

    hiddenFilterButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.hiddenFilter === hiddenFilter);
    });

    if (summaries.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No generated summaries yet.</div>';
      return;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No summaries match the current filters.</div>';
      return;
    }

    filtered.forEach(video => listEl.appendChild(createSummaryItem(video)));
  }

  async function loadHiddenState() {
    const stored = await storageGet([HIDDEN_STORAGE_KEY, PAGE_STATE_STORAGE_KEY]);
    hiddenVideoIds = new Set(Array.isArray(stored[HIDDEN_STORAGE_KEY]) ? stored[HIDDEN_STORAGE_KEY] : []);

    const pageState = stored[PAGE_STATE_STORAGE_KEY] || {};
    if (Array.isArray(pageState.selectedPlaylistIds) && pageState.selectedPlaylistIds.length > 0) {
      selectedPlaylistIds = new Set(pageState.selectedPlaylistIds.map(String));
    }
    if (typeof pageState.statusFilter === 'string') {
      const option = Array.from(statusFilter.options).find(item => item.value === pageState.statusFilter);
      if (option) statusFilter.value = pageState.statusFilter;
    }
    if (typeof pageState.textSearch === 'string') textSearch.value = pageState.textSearch;
    if (Array.isArray(pageState.selectedTagFilters)) {
      const seen = new Set();
      selectedTagFilters = pageState.selectedTagFilters
        .map(normalizeTag)
        .filter(tag => {
          const key = tag.toLowerCase();
          if (!tag || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
    if (['visible', 'all', 'hidden'].includes(pageState.hiddenFilter)) {
      hiddenFilter = pageState.hiddenFilter;
    }
  }

  async function loadData(force = false) {
    refreshBtn.disabled = true;
    setStatus('Loading summaries...');

    try {
      const [summaryRows, playlistRows] = await Promise.all([
        window.api.getGeneratedSummaries({ force }),
        window.api.getPlaylists({ force })
      ]);
      summaries = Array.isArray(summaryRows) ? summaryRows : [];
      playlists = Array.isArray(playlistRows) ? playlistRows : [];
      const availablePlaylistIds = new Set(playlists.map(playlist => String(playlist.id)));
      selectedPlaylistIds = selectedPlaylistIds.has('all')
        ? new Set(['all'])
        : new Set(Array.from(selectedPlaylistIds).filter(id => availablePlaylistIds.has(id)));
      if (selectedPlaylistIds.size === 0) selectedPlaylistIds.add('all');
      renderPlaylistFilterOptions();
      setStatus('Loaded.', 'success');
      renderTagSuggestions();
      renderSummaries();
    } catch (err) {
      setStatus(err.message || 'Failed to load summaries.', 'error');
      renderSummaries();
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener('click', () => loadData(true));
  playlistFilter.addEventListener('change', applyPlaylistFilterSelection);
  textSearch.addEventListener('input', () => {
    renderTagSuggestions();
    renderSummaries();
    savePageState();
  });
  statusFilter.addEventListener('change', () => {
    renderTagSuggestions();
    renderSummaries();
    savePageState();
  });
  tagFilterField.addEventListener('click', () => tagFilterInput.focus());
  tagFilterInput.addEventListener('input', renderTagSuggestions);
  tagFilterInput.addEventListener('focus', renderTagSuggestions);
  tagFilterInput.addEventListener('blur', () => setTimeout(hideTagSuggestions, 120));
  tagFilterInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const active = getTagSuggestionItems()[activeTagSuggestionIndex];
      addTagFilter(active ? active.dataset.tag : tagFilterInput.value);
      return;
    }

    if (event.key === 'Tab' && tagFilterInput.value.trim()) {
      event.preventDefault();
      addTagFilter(tagFilterInput.value);
      return;
    }

    if (event.key === 'Backspace' && !tagFilterInput.value && selectedTagFilters.length > 0) {
      selectedTagFilters = selectedTagFilters.slice(0, -1);
      renderTagChips();
      renderSummaries();
      savePageState();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = getTagSuggestionItems();
      if (items.length === 0) return;
      event.preventDefault();
      setActiveTagSuggestion(activeTagSuggestionIndex + (event.key === 'ArrowDown' ? 1 : -1));
    }
  });

  hiddenFilterButtons.forEach(button => {
    button.addEventListener('click', () => {
      hiddenFilter = button.dataset.hiddenFilter || 'visible';
      renderTagSuggestions();
      renderSummaries();
      savePageState();
    });
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await loadHiddenState();
    renderTagChips();
    await loadData();
  });
})();
