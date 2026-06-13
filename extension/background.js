async function getActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab || null;
}

function isYoutubeTab(tab) {
  return !!(tab && tab.url && tab.url.startsWith('https://www.youtube.com/'));
}

async function setYoutubeSidePanel(tabId, url) {
  if (!tabId || !chrome.sidePanel) return;

  const enabled = typeof url === 'string' && url.startsWith('https://www.youtube.com/');
  const options = enabled
    ? { tabId, path: 'panel.html', enabled: true }
    : { tabId, enabled: false };

  await chrome.sidePanel.setOptions(options);
  if (!enabled) {
    rememberDockedPanelClosed(tabId);
    forgetDockedPanelHiddenForFullscreen(tabId);
  }
}

async function configureOpenTabsSidePanels() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => setYoutubeSidePanel(tab.id, tab.url).catch(() => {})));
}

const dockedSidePanelOpenTabs = new Set();
const fullscreenHiddenDockedPanelTabs = new Set();
const fallbackDisabledDockedPanelTabs = new Set();
const DOCKED_SIDE_PANEL_OPEN_TAB_KEY = 'dockedSidePanelOpenTabId';
const DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY = 'dockedSidePanelFullscreenHiddenTabId';
const DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY = 'dockedSidePanelFallbackDisabledTabId';
const HIDE_SIDE_PANEL_ON_FULLSCREEN_KEY = 'hideSidePanelOnFullscreen';

function isPanelPath(path) {
  return !path || String(path).endsWith('panel.html');
}

function rememberDockedPanelOpen(tabId) {
  if (!tabId) return;
  dockedSidePanelOpenTabs.add(tabId);
  chrome.storage.local.set({ [DOCKED_SIDE_PANEL_OPEN_TAB_KEY]: tabId }).catch(() => {});
}

function rememberDockedPanelClosed(tabId, options = {}) {
  if (!tabId) return;
  dockedSidePanelOpenTabs.delete(tabId);
  if (!options.keepFallbackDisabled) fallbackDisabledDockedPanelTabs.delete(tabId);
  chrome.storage.local.get([DOCKED_SIDE_PANEL_OPEN_TAB_KEY])
    .then(stored => {
      if (Number(stored[DOCKED_SIDE_PANEL_OPEN_TAB_KEY]) === Number(tabId)) {
        return chrome.storage.local.set({ [DOCKED_SIDE_PANEL_OPEN_TAB_KEY]: null });
      }
      return null;
    })
    .catch(() => {});
}

async function isDockedPanelOpen(tabId) {
  if (dockedSidePanelOpenTabs.has(tabId)) return true;
  const stored = await chrome.storage.local.get([DOCKED_SIDE_PANEL_OPEN_TAB_KEY]);
  return Number(stored[DOCKED_SIDE_PANEL_OPEN_TAB_KEY]) === Number(tabId);
}

async function shouldHideSidePanelOnFullscreen() {
  const stored = await chrome.storage.local.get([HIDE_SIDE_PANEL_ON_FULLSCREEN_KEY]);
  return stored[HIDE_SIDE_PANEL_ON_FULLSCREEN_KEY] !== false;
}

async function clearDockedPanelRuntimeState() {
  dockedSidePanelOpenTabs.clear();
  fullscreenHiddenDockedPanelTabs.clear();
  fallbackDisabledDockedPanelTabs.clear();
  await chrome.storage.local.set({
    [DOCKED_SIDE_PANEL_OPEN_TAB_KEY]: null,
    [DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]: null,
    [DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY]: null
  });
}

function rememberDockedPanelHiddenForFullscreen(tabId, fallbackDisabled = false) {
  if (!tabId) return;
  fullscreenHiddenDockedPanelTabs.add(tabId);
  if (fallbackDisabled) fallbackDisabledDockedPanelTabs.add(tabId);
  chrome.storage.local.set({
    [DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]: tabId,
    [DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY]: fallbackDisabled ? tabId : null
  }).catch(() => {});
}

async function isDockedPanelHiddenForFullscreen(tabId) {
  if (fullscreenHiddenDockedPanelTabs.has(tabId)) return true;
  const stored = await chrome.storage.local.get([DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]);
  return Number(stored[DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]) === Number(tabId);
}

async function wasDockedPanelFallbackDisabled(tabId) {
  if (fallbackDisabledDockedPanelTabs.has(tabId)) return true;
  const stored = await chrome.storage.local.get([DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY]);
  return Number(stored[DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY]) === Number(tabId);
}

function forgetDockedPanelHiddenForFullscreen(tabId) {
  if (!tabId) return;
  fullscreenHiddenDockedPanelTabs.delete(tabId);
  fallbackDisabledDockedPanelTabs.delete(tabId);
  chrome.storage.local.get([
    DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY,
    DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY
  ])
    .then(stored => {
      const payload = {};
      if (Number(stored[DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]) === Number(tabId)) {
        payload[DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY] = null;
      }
      if (Number(stored[DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY]) === Number(tabId)) {
        payload[DOCKED_SIDE_PANEL_FALLBACK_DISABLED_TAB_KEY] = null;
      }
      return Object.keys(payload).length ? chrome.storage.local.set(payload) : null;
    })
    .catch(() => {});
}

async function getActiveYoutubeTab() {
  const activeTab = await getActiveTab();
  if (activeTab && activeTab.url && activeTab.url.startsWith('https://www.youtube.com/')) {
    return activeTab;
  }

  const youtubeTabs = await chrome.tabs.query({
    currentWindow: true,
    url: 'https://www.youtube.com/*'
  });

  return youtubeTabs[0] || null;
}

async function getActiveYoutubePlaylistTab() {
  const tab = await getActiveTab();
  if (!isYoutubeTab(tab)) {
    return {
      tab: null,
      sourceId: null,
      error: 'Open the linked YouTube playlist page before syncing.'
    };
  }

  const sourceId = getPlaylistListIdFromUrl(tab.url);
  if (!sourceId) {
    return {
      tab,
      sourceId: null,
      error: 'Open the linked YouTube playlist page before syncing.'
    };
  }

  return { tab, sourceId, error: null };
}

function getVideoIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const videoId = parsed.searchParams.get('v');
    return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch (err) {
    return null;
  }
}

function getPlaylistListIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/playlist') return null;
    const listId = parsed.searchParams.get('list');
    return listId && /^[a-zA-Z0-9_-]+$/.test(listId) ? listId : null;
  } catch (err) {
    return null;
  }
}

async function proxyApiFetch(request) {
  const url = typeof request.url === 'string' ? request.url : '';
  if (!url.startsWith('http://localhost:3001/api/')) {
    throw new Error('Unsupported API proxy URL.');
  }

  const options = request.options && typeof request.options === 'object' ? request.options : {};
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || undefined,
    body: options.body
  });

  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    success: true,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers,
    body: await response.text()
  };
}

async function openManagementPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('management.html') });
}

async function activateFloatingPanel() {
  const tab = await getActiveYoutubeTab();
  if (!tab || !tab.id) {
    throw new Error('Open a YouTube tab first.');
  }

  await chrome.storage.local.set({ panelMode: 'floating', panelOpen: true });
  await chrome.tabs.sendMessage(tab.id, { action: 'openFloatingPanel' });
  return { success: true };
}

async function markDockedSidePanelOpenForTab(request = {}) {
  if (request.tabId) {
    rememberDockedPanelOpen(request.tabId);
    return { success: true };
  }

  const tab = await getActiveYoutubeTab();
  if (tab && tab.id) rememberDockedPanelOpen(tab.id);
  return { success: true };
}

async function markDockedSidePanelClosedForTab(request = {}) {
  if (request.tabId) {
    rememberDockedPanelClosed(request.tabId);
    return { success: true };
  }

  const tab = await getActiveYoutubeTab();
  if (tab && tab.id) rememberDockedPanelClosed(tab.id);
  return { success: true };
}

async function getActiveYoutubeVideo() {
  const tab = await getActiveYoutubeTab();
  const videoId = tab ? getVideoIdFromUrl(tab.url) : null;
  return {
    success: !!videoId,
    videoId,
    tabId: tab && tab.id,
    error: videoId ? null : 'Open a YouTube video first.'
  };
}

async function getActiveYoutubePlaylistSource() {
  const { tab, sourceId, error } = await getActiveYoutubePlaylistTab();
  return {
    success: !!sourceId,
    sourceId,
    tabId: tab && tab.id,
    error
  };
}

async function closeDockedSidePanelForFullscreen(tabId) {
  if (!tabId || !chrome.sidePanel) return { success: false, error: 'Side Panel API is not available.' };
  if (!await shouldHideSidePanelOnFullscreen()) return { success: true, hidden: false };
  if (!await isDockedPanelOpen(tabId)) return { success: true, hidden: false };

  let fallbackDisabled = false;

  if (typeof chrome.sidePanel.close === 'function') {
    await chrome.sidePanel.close({ tabId });
  } else {
    fallbackDisabled = true;
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
  }

  rememberDockedPanelHiddenForFullscreen(tabId, fallbackDisabled);
  rememberDockedPanelClosed(tabId, { keepFallbackDisabled: fallbackDisabled });
  return { success: true, hidden: true };
}

async function handleDockedSidePanelFullscreenExit(tab) {
  const tabId = tab && tab.id;
  if (!tabId || !chrome.sidePanel) return { success: false, error: 'Side Panel API is not available.' };
  if (!await isDockedPanelHiddenForFullscreen(tabId)) return { success: true };

  const fallbackDisabled = await wasDockedPanelFallbackDisabled(tabId);
  forgetDockedPanelHiddenForFullscreen(tabId);
  if (fallbackDisabled) {
    await setYoutubeSidePanel(tabId, tab.url);
  }

  return { success: true };
}

async function handleYoutubeFullscreenState(request, sender) {
  const tab = sender && sender.tab;
  if (!tab || !tab.id || !isYoutubeTab(tab)) return { success: false, error: 'Missing YouTube tab.' };
  return request.fullscreen
    ? closeDockedSidePanelForFullscreen(tab.id)
    : handleDockedSidePanelFullscreenExit(tab);
}

async function handleHideSidePanelSettingChange(enabled) {
  if (enabled !== false) return;

  const tabIds = new Set(fullscreenHiddenDockedPanelTabs);
  const stored = await chrome.storage.local.get([DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]);
  if (stored[DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]) {
    tabIds.add(Number(stored[DOCKED_SIDE_PANEL_FULLSCREEN_HIDDEN_TAB_KEY]));
  }

  await Promise.all(Array.from(tabIds).map(async tabId => {
    try {
      const tab = await chrome.tabs.get(tabId);
      await handleDockedSidePanelFullscreenExit(tab);
    } catch (err) {
      forgetDockedPanelHiddenForFullscreen(tabId);
    }
  }));
}

async function startPlaylistSync(request) {
  const { tab, sourceId, error } = await getActiveYoutubePlaylistTab();
  if (!tab || !tab.id || !sourceId) {
    throw new Error(error || 'Open the linked YouTube playlist page before syncing.');
  }
  if (request.expectedSourceId && sourceId !== request.expectedSourceId) {
    throw new Error('Current YouTube page does not match the selected playlist URL.');
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'startPlaylistSync',
      playlistId: request.playlistId,
      expectedSourceId: request.expectedSourceId,
      cleanupYoutube: request.cleanupYoutube
    });
    await chrome.storage.local.set({ activeSyncTabId: tab.id });
  } catch (err) {
    throw new Error('Cannot connect to this YouTube tab. Reload it and try again.');
  }

  return { success: true };
}

async function stopPlaylistSync() {
  const stored = await chrome.storage.local.get(['activeSyncTabId']);
  let tab = null;
  if (stored.activeSyncTabId) {
    try {
      tab = await chrome.tabs.get(stored.activeSyncTabId);
    } catch (err) {
      tab = null;
    }
  }

  if (!isYoutubeTab(tab)) {
    const active = await getActiveYoutubePlaylistTab();
    tab = active.tab;
    if (!tab || !tab.id) {
      throw new Error(active.error || 'Open the YouTube playlist page before stopping sync.');
    }
  }

  if (!tab || !tab.id) {
    throw new Error('Open the YouTube playlist page before stopping sync.');
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'stopPlaylistSync' });
    return response || { success: true };
  } catch (err) {
    throw new Error('Cannot connect to this YouTube tab. Reload it and try again.');
  }
}

async function openYoutubeVideo(videoId, options = {}) {
  if (!videoId) throw new Error('Missing video id.');

  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  if (options.newTab) {
    await chrome.tabs.create({ url, active: false });
    return { success: true };
  }

  const activeTab = await getActiveTab();
  if (isYoutubeTab(activeTab) && activeTab.id) {
    if (getVideoIdFromUrl(activeTab.url) === videoId) {
      return { success: true, alreadyOpen: true };
    }

    await chrome.tabs.update(activeTab.id, { url, active: true });
    return { success: true };
  }

  await chrome.tabs.create({ url, active: true });
  return { success: true };
}

const SUMMARY_PAGE_TABS_KEY = 'summaryPageTabs';

function getSummaryPageKey(videoId, mode) {
  return `${videoId}:${mode}`;
}

function isSummaryPageUrl(url, videoId, mode) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.href.startsWith(chrome.runtime.getURL('asset.html')) &&
      parsed.searchParams.get('type') === 'summary' &&
      parsed.searchParams.get('videoId') === videoId &&
      (parsed.searchParams.get('mode') || 'plain') === mode;
  } catch (err) {
    return false;
  }
}

async function getStoredSummaryPageTabs() {
  const stored = await chrome.storage.local.get([SUMMARY_PAGE_TABS_KEY]);
  return stored[SUMMARY_PAGE_TABS_KEY] && typeof stored[SUMMARY_PAGE_TABS_KEY] === 'object'
    ? stored[SUMMARY_PAGE_TABS_KEY]
    : {};
}

async function setStoredSummaryPageTab(key, tabId) {
  const summaryPageTabs = await getStoredSummaryPageTabs();
  summaryPageTabs[key] = tabId;
  await chrome.storage.local.set({ [SUMMARY_PAGE_TABS_KEY]: summaryPageTabs });
}

async function removeStoredSummaryPageTab(key) {
  const summaryPageTabs = await getStoredSummaryPageTabs();
  if (!(key in summaryPageTabs)) return;
  delete summaryPageTabs[key];
  await chrome.storage.local.set({ [SUMMARY_PAGE_TABS_KEY]: summaryPageTabs });
}

async function activateTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId && chrome.windows && chrome.windows.update) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
}

async function openSummaryPage(videoId, options = {}) {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('Missing video id.');

  const mode = options.mode === 'html' ? 'html' : 'plain';
  const key = getSummaryPageKey(videoId, mode);
  const url = chrome.runtime.getURL(`asset.html?type=summary&videoId=${encodeURIComponent(videoId)}&mode=${encodeURIComponent(mode)}`);

  const storedTabs = await getStoredSummaryPageTabs();
  const storedTabId = storedTabs[key];
  if (storedTabId) {
    try {
      const storedTab = await chrome.tabs.get(storedTabId);
      if (storedTab && storedTab.id && isSummaryPageUrl(storedTab.url, videoId, mode)) {
        await activateTab(storedTab);
        return { success: true, existing: true };
      }
      await removeStoredSummaryPageTab(key);
    } catch (err) {
      await removeStoredSummaryPageTab(key);
    }
  }

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => isSummaryPageUrl(tab.url, videoId, mode));

  if (existing && existing.id) {
    await setStoredSummaryPageTab(key, existing.id);
    await activateTab(existing);
    return { success: true, existing: true };
  }

  const tab = await chrome.tabs.create({ url, active: options.active !== false });
  if (tab.id) await setStoredSummaryPageTab(key, tab.id);
  return { success: true };
}

chrome.runtime.onInstalled.addListener(async () => {
  await clearDockedPanelRuntimeState();
  await configureOpenTabsSidePanels();
});

chrome.runtime.onStartup.addListener(async () => {
  await clearDockedPanelRuntimeState();
  await configureOpenTabsSidePanels();
});

if (chrome.sidePanel && chrome.sidePanel.onOpened) {
  chrome.sidePanel.onOpened.addListener(info => {
    if (isPanelPath(info && info.path) && info.tabId) rememberDockedPanelOpen(info.tabId);
  });
}

if (chrome.sidePanel && chrome.sidePanel.onClosed) {
  chrome.sidePanel.onClosed.addListener(info => {
    if (isPanelPath(info && info.path) && info.tabId) rememberDockedPanelClosed(info.tabId);
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || tab.url) {
    setYoutubeSidePanel(tabId, tab.url).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  rememberDockedPanelClosed(tabId);
  forgetDockedPanelHiddenForFullscreen(tabId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[HIDE_SIDE_PANEL_ON_FULLSCREEN_KEY]) return;
  handleHideSidePanelSettingChange(changes[HIDE_SIDE_PANEL_ON_FULLSCREEN_KEY].newValue).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId)
    .then(tab => setYoutubeSidePanel(tabId, tab.url))
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let task = null;

  if (request.action === 'openManagementPage') {
    task = openManagementPage();
  } else if (request.action === 'activateFloatingPanel') {
    task = activateFloatingPanel();
  } else if (request.action === 'markDockedSidePanelOpen') {
    task = markDockedSidePanelOpenForTab(request);
  } else if (request.action === 'markDockedSidePanelClosed') {
    task = markDockedSidePanelClosedForTab(request);
  } else if (request.action === 'setYoutubeFullscreenState') {
    task = handleYoutubeFullscreenState(request, sender);
  } else if (request.action === 'getActiveYoutubeVideo') {
    task = getActiveYoutubeVideo();
  } else if (request.action === 'getActiveYoutubePlaylistSource') {
    task = getActiveYoutubePlaylistSource();
  } else if (request.action === 'startPlaylistSync') {
    task = startPlaylistSync(request);
  } else if (request.action === 'stopPlaylistSync') {
    task = stopPlaylistSync(request);
  } else if (request.action === 'openYoutubeVideo') {
    task = openYoutubeVideo(request.videoId, { newTab: !!request.newTab });
  } else if (request.action === 'openSummaryPage') {
    task = openSummaryPage(request.videoId, {
      mode: request.mode,
      active: request.active !== false
    });
  } else if (request.action === 'apiFetch') {
    task = proxyApiFetch(request);
  }

  if (!task) return false;

  task
    .then(result => sendResponse(result || { success: true }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});
