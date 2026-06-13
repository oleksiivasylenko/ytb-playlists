document.addEventListener('DOMContentLoaded', () => {
  let dockedPanelTabId = null;

  function sendRuntimeMessage(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        const error = chrome.runtime.lastError;
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }
        resolve(response || { success: false, error: 'Empty extension response.' });
      });
    });
  }

  async function rememberDockedPanelOpen() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    dockedPanelTabId = tab && tab.id ? tab.id : null;
    await sendRuntimeMessage({ action: 'markDockedSidePanelOpen', tabId: dockedPanelTabId });
  }

  function rememberDockedPanelClosed() {
    if (!dockedPanelTabId) return;
    chrome.runtime.sendMessage({ action: 'markDockedSidePanelClosed', tabId: dockedPanelTabId }, () => {});
  }

  rememberDockedPanelOpen().catch(() => {});
  window.addEventListener('pagehide', rememberDockedPanelClosed);
  window.addEventListener('beforeunload', rememberDockedPanelClosed);

  window.ytbPanel.create({
    mode: 'docked',
    previewOptions: { maxWidth: 420, minWidth: 260 },
    getActivePlaylistSource: async () => {
      const response = await sendRuntimeMessage({ action: 'getActiveYoutubePlaylistSource' });
      return response || { success: false, error: 'Open a YouTube playlist page first.' };
    },
    getActiveVideoId: async () => {
      const response = await sendRuntimeMessage({ action: 'getActiveYoutubeVideo' });
      return response || { success: false, error: 'Open a YouTube video first.' };
    },
    startSyncPage: async ({ playlistId, expectedSourceId, cleanupYoutube }) => {
      const response = await sendRuntimeMessage({
        action: 'startPlaylistSync',
        playlistId,
        expectedSourceId,
        cleanupYoutube
      });

      if (!response || !response.success) {
        return response || { success: false, error: 'Failed to start sync.' };
      }

      return { success: true, keepBusy: true, message: 'Sync started on YouTube page...' };
    },
    stopSyncPage: async () => {
      const response = await sendRuntimeMessage({ action: 'stopPlaylistSync' });
      return response || { success: false, error: 'Failed to stop sync.' };
    }
  });
});
