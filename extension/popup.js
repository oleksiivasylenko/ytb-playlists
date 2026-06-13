const statusEl = document.getElementById('popup-status');

function setStatus(text) {
  statusEl.textContent = text || '';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isYoutubeTab(tab) {
  return !!(tab && tab.url && tab.url.startsWith('https://www.youtube.com/'));
}

document.getElementById('open-dock-panel').addEventListener('click', async () => {
  setStatus('');

  try {
    if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') {
      setStatus('Chrome Side Panel API is not available.');
      return;
    }

    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      setStatus('Open a tab first.');
      return;
    }
    if (!isYoutubeTab(tab)) {
      setStatus('Open a YouTube tab first.');
      return;
    }

    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'panel.html',
      enabled: true
    });
    await chrome.storage.local.set({
      panelMode: 'docked',
      panelOpen: false,
      dockedSyncStatus: {
        text: '',
        state: '',
        ts: Date.now()
      }
    });
    await chrome.sidePanel.open({ tabId: tab.id });
    chrome.runtime.sendMessage({ action: 'markDockedSidePanelOpen', tabId: tab.id }, () => {});
    window.close();
  } catch (err) {
    setStatus(err.message || 'Failed to open dock panel.');
  }
});

document.getElementById('open-manager').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openManagementPage' }, response => {
    if (chrome.runtime.lastError || !response || !response.success) {
      setStatus(response && response.error ? response.error : 'Failed to open manager.');
      return;
    }

    window.close();
  });
});

document.getElementById('open-summaries').addEventListener('click', async () => {
  setStatus('');

  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('summaries.html') });
    window.close();
  } catch (err) {
    setStatus(err.message || 'Failed to open summaries.');
  }
});
