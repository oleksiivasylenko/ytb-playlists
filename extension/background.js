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
}

async function configureOpenTabsSidePanels() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => setYoutubeSidePanel(tab.id, tab.url).catch(() => {})));
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

chrome.runtime.onInstalled.addListener(async () => {
  await configureOpenTabsSidePanels();
});

chrome.runtime.onStartup.addListener(configureOpenTabsSidePanels);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || tab.url) {
    setYoutubeSidePanel(tabId, tab.url).catch(() => {});
  }
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
  } else if (request.action === 'apiFetch') {
    task = proxyApiFetch(request);
  }

  if (!task) return false;

  task
    .then(result => sendResponse(result || { success: true }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});
