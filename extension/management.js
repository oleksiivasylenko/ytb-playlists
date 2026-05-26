document.addEventListener('DOMContentLoaded', () => {
  const playlistList = document.getElementById('playlist-list');
  const newPlaylistName = document.getElementById('new-playlist-name');
  const createPlaylistBtn = document.getElementById('create-playlist');
  const playlistView = document.getElementById('playlist-view');
  const noPlaylistView = document.getElementById('no-playlist-view');
  const currentPlaylistName = document.getElementById('current-playlist-name');
  const renamePlaylistBtn = document.getElementById('rename-playlist-btn');
  const renamePlaylistForm = document.getElementById('rename-playlist-form');
  const renamePlaylistInput = document.getElementById('rename-playlist-input');
  const renamePlaylistConfirm = document.getElementById('rename-playlist-confirm');
  const renamePlaylistCancel = document.getElementById('rename-playlist-cancel');
  const playlistSourceUrl = document.getElementById('playlist-source-url');
  const savePlaylistSource = document.getElementById('save-playlist-source');
  const playlistSourceStatus = document.getElementById('playlist-source-status');
  const deletePlaylistBtn = document.getElementById('delete-playlist');
  const refreshMetadataBtn = document.getElementById('refresh-metadata-btn');
  const refreshMetadataStatus = document.getElementById('refresh-metadata-status');
  const summaryModelInput = document.getElementById('summary-model-input');
  const summaryLanguageInput = document.getElementById('summary-language-input');
  const transcriptLanguagesInput = document.getElementById('transcript-languages-input');
  const summaryModeSelect = document.getElementById('summary-mode-select');
  const summaryPromptInput = document.getElementById('summary-prompt-input');
  const summaryHtmlModelInput = document.getElementById('summary-html-model-input');
  const summaryHtmlPromptInput = document.getElementById('summary-html-prompt-input');
  const preferredTagsInput = document.getElementById('preferred-tags-input');
  const tagDisplayLimitInput = document.getElementById('tag-display-limit-input');
  const tagPromptInput = document.getElementById('tag-prompt-input');
  const summarySettingsSave = document.getElementById('summary-settings-save');
  const summarySettingsStatus = document.getElementById('summary-settings-status');

  let playlists = [];
  let currentPlaylistId = null;

  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, res => resolve(res || {})));
  }

  function storageSet(payload) {
    return new Promise(resolve => chrome.storage.local.set(payload, resolve));
  }

  function storageRemove(keys) {
    return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
  }

  function setStatus(el, text, state = '') {
    el.textContent = text || '';
    el.className = state ? `${el.dataset.baseClass || el.className || 'status-text'} ${state}` : (el.dataset.baseClass || el.className || 'status-text');
  }

  function rememberBaseStatusClasses() {
    playlistSourceStatus.dataset.baseClass = playlistSourceStatus.className;
    summarySettingsStatus.dataset.baseClass = summarySettingsStatus.className;
    refreshMetadataStatus.dataset.baseClass = refreshMetadataStatus.className;
  }

  function getCurrentPlaylist() {
    return playlists.find(playlist => String(playlist.id) === String(currentPlaylistId)) || null;
  }

  function renderPlaylists() {
    playlistList.innerHTML = '';

    playlists.forEach(playlist => {
      const item = document.createElement('li');
      const hasSource = !!playlist.source_id;

      const name = document.createElement('span');
      name.className = 'playlist-list-name';
      name.textContent = playlist.name;

      const icon = document.createElement('span');
      icon.className = `playlist-source-icon ${hasSource ? 'linked' : 'missing'}`;
      icon.title = hasSource ? 'Playlist URL is linked' : 'Playlist URL is missing';
      icon.setAttribute('aria-label', icon.title);
      icon.innerHTML = hasSource
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L11 4.9"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1L13 19.1"></path></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5a5 5 0 0 1-4.2-8.4l2.1-2.1a5 5 0 0 1 6.4-.6"></path><path d="M15 6.5a5 5 0 0 1 4.2 8.4l-2.1 2.1a5 5 0 0 1-6.4.6"></path><path d="M8 16l8-8"></path><path d="M3 21l18-18"></path></svg>';

      item.appendChild(name);
      item.appendChild(icon);
      if (String(playlist.id) === String(currentPlaylistId)) item.classList.add('active');
      item.addEventListener('click', () => selectPlaylist(playlist.id));
      playlistList.appendChild(item);
    });
  }

  function showNoSelection() {
    currentPlaylistId = null;
    playlistView.style.display = 'none';
    noPlaylistView.style.display = 'grid';
    renderPlaylists();
  }

  function renderSelectedPlaylist() {
    const playlist = getCurrentPlaylist();
    if (!playlist) {
      showNoSelection();
      return;
    }

    currentPlaylistName.textContent = playlist.name;
    playlistSourceUrl.value = playlist.source_url || '';
    setStatus(
      playlistSourceStatus,
      playlist.source_id ? `Linked to list ${playlist.source_id}` : 'Set before using Sync Page.',
      playlist.source_id ? 'success' : 'error'
    );
    renamePlaylistForm.style.display = 'none';
    playlistView.style.display = 'flex';
    noPlaylistView.style.display = 'none';
    renderPlaylists();
  }

  async function loadPlaylists(force = false) {
    playlists = await window.api.getPlaylists({ force });

    if (currentPlaylistId && playlists.some(playlist => String(playlist.id) === String(currentPlaylistId))) {
      renderSelectedPlaylist();
      return;
    }

    const stored = await storageGet(['selectedPlaylistId']);
    const selected = playlists.find(playlist => String(playlist.id) === String(stored.selectedPlaylistId));
    currentPlaylistId = selected ? selected.id : playlists[0]?.id || null;

    if (currentPlaylistId) renderSelectedPlaylist();
    else showNoSelection();
  }

  async function selectPlaylist(id) {
    currentPlaylistId = id;
    await storageSet({ selectedPlaylistId: id });
    renderSelectedPlaylist();
  }

  async function loadSummarySettings() {
    try {
      const settings = await window.api.getSummarySettings();
      summaryModelInput.value = settings.model || '';
      summaryLanguageInput.value = settings.language || '';
      transcriptLanguagesInput.value = settings.transcript_languages || settings.transcriptLanguages || 'en,uk,ru';
      summaryModeSelect.value = settings.summary_mode || settings.summaryMode || 'plain';
      summaryPromptInput.value = settings.prompt || '';
      summaryHtmlModelInput.value = settings.html_model || settings.htmlModel || '';
      summaryHtmlPromptInput.value = settings.html_prompt || settings.htmlPrompt || '';
      preferredTagsInput.value = settings.preferred_tags || settings.preferredTags || '';
      tagDisplayLimitInput.value = settings.tag_display_limit || settings.tagDisplayLimit || 5;
      tagPromptInput.value = settings.tag_prompt || settings.tagPrompt || '';
      setStatus(summarySettingsStatus, '');
    } catch (err) {
      setStatus(summarySettingsStatus, err.message || 'Failed to load summary settings.', 'error');
    }
  }

  createPlaylistBtn.addEventListener('click', async () => {
    const name = newPlaylistName.value.trim();
    if (!name) return;

    createPlaylistBtn.disabled = true;
    try {
      const playlist = await window.api.createPlaylist(name);
      newPlaylistName.value = '';
      currentPlaylistId = playlist.id;
      await storageSet({ selectedPlaylistId: playlist.id });
      await loadPlaylists(true);
    } finally {
      createPlaylistBtn.disabled = false;
    }
  });

  newPlaylistName.addEventListener('keydown', event => {
    if (event.key === 'Enter') createPlaylistBtn.click();
  });

  renamePlaylistBtn.addEventListener('click', () => {
    const playlist = getCurrentPlaylist();
    renamePlaylistInput.value = playlist ? playlist.name : '';
    renamePlaylistForm.style.display = 'flex';
    renamePlaylistInput.focus();
  });

  renamePlaylistCancel.addEventListener('click', () => {
    renamePlaylistForm.style.display = 'none';
  });

  renamePlaylistConfirm.addEventListener('click', async () => {
    const name = renamePlaylistInput.value.trim();
    if (!name || !currentPlaylistId) return;

    renamePlaylistConfirm.disabled = true;
    try {
      const playlist = await window.api.renamePlaylist(currentPlaylistId, name);
      playlists = playlists.map(item => String(item.id) === String(playlist.id) ? playlist : item);
      renderSelectedPlaylist();
    } finally {
      renamePlaylistConfirm.disabled = false;
    }
  });

  renamePlaylistInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') renamePlaylistConfirm.click();
    if (event.key === 'Escape') renamePlaylistCancel.click();
  });

  savePlaylistSource.addEventListener('click', async () => {
    if (!currentPlaylistId) return;

    savePlaylistSource.disabled = true;
    setStatus(playlistSourceStatus, 'Saving...');
    try {
      const playlist = await window.api.updatePlaylist(currentPlaylistId, {
        sourceUrl: playlistSourceUrl.value.trim()
      });
      playlists = playlists.map(item => String(item.id) === String(playlist.id) ? playlist : item);
      renderSelectedPlaylist();
      setStatus(playlistSourceStatus, playlist.source_id ? `Linked to list ${playlist.source_id}` : 'Playlist URL cleared.', playlist.source_id ? 'success' : '');
    } catch (err) {
      setStatus(playlistSourceStatus, err.message || 'Failed to save playlist URL.', 'error');
    } finally {
      savePlaylistSource.disabled = false;
    }
  });

  playlistSourceUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter') savePlaylistSource.click();
  });

  deletePlaylistBtn.addEventListener('click', async () => {
    if (!currentPlaylistId) return;
    if (!confirm('Delete this playlist?')) return;

    deletePlaylistBtn.disabled = true;
    try {
      await window.api.deletePlaylist(currentPlaylistId);
      await storageRemove(['selectedPlaylistId']);
      currentPlaylistId = null;
      await loadPlaylists(true);
    } finally {
      deletePlaylistBtn.disabled = false;
    }
  });

  refreshMetadataBtn.addEventListener('click', async () => {
    refreshMetadataBtn.disabled = true;
    setStatus(refreshMetadataStatus, 'Queueing metadata refresh...');

    try {
      const result = await window.api.refreshMetadata();
      setStatus(refreshMetadataStatus, `${result.total} videos queued. Refresh continues on the server.`, 'success');
    } catch (err) {
      setStatus(refreshMetadataStatus, err.message || 'Failed to refresh metadata.', 'error');
    } finally {
      refreshMetadataBtn.disabled = false;
    }
  });

  summarySettingsSave.addEventListener('click', async () => {
    summarySettingsSave.disabled = true;
    setStatus(summarySettingsStatus, 'Saving...');

    try {
      await window.api.updateSummarySettings({
        model: summaryModelInput.value.trim(),
        language: summaryLanguageInput.value.trim(),
        transcriptLanguages: transcriptLanguagesInput.value.trim(),
        summaryMode: summaryModeSelect.value,
        prompt: summaryPromptInput.value.trim(),
        htmlModel: summaryHtmlModelInput.value.trim(),
        htmlPrompt: summaryHtmlPromptInput.value.trim(),
        preferredTags: preferredTagsInput.value.trim(),
        tagDisplayLimit: Number(tagDisplayLimitInput.value) || 5,
        tagPrompt: tagPromptInput.value.trim()
      });
      setStatus(summarySettingsStatus, 'Saved.', 'success');
    } catch (err) {
      setStatus(summarySettingsStatus, err.message || 'Failed to save settings.', 'error');
    } finally {
      summarySettingsSave.disabled = false;
    }
  });

  rememberBaseStatusClasses();
  Promise.all([
    loadPlaylists(),
    loadSummarySettings()
  ]).catch(error => {
    setStatus(refreshMetadataStatus, error.message || 'Failed to load manager.', 'error');
  });
});
