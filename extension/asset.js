(function() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get('videoId') || '';
  const type = params.get('type') === 'summary' ? 'summary' : 'transcript';
  let mode = params.get('mode') === 'html' ? 'html' : 'plain';
  let currentText = '';
  let currentHtml = '';

  const kindEl = document.getElementById('asset-kind');
  const titleEl = document.getElementById('asset-title');
  const metaEl = document.getElementById('asset-meta');
  const statusEl = document.getElementById('asset-status');
  const contentEl = document.getElementById('asset-content');
  const copyBtn = document.getElementById('asset-copy');
  const refreshBtn = document.getElementById('asset-refresh');
  const regenerateBtn = document.getElementById('asset-regenerate');
  const youtubeBtn = document.getElementById('asset-youtube');
  const { sanitizeSummaryHtml, renderTranscript, copyText } = window.ytbAssetUtils;

  function setBusy(isBusy) {
    refreshBtn.disabled = isBusy;
    regenerateBtn.disabled = isBusy;
  }

  function setStatus(text, state = '') {
    statusEl.textContent = text || '';
    statusEl.className = state ? `asset-status ${state}` : 'asset-status';
  }

  function setHeader(videoTitle) {
    const label = type === 'transcript' ? 'Transcript' : mode === 'html' ? 'HTML summary' : 'Summary';
    kindEl.textContent = label;
    titleEl.textContent = videoTitle || videoId || label;
    metaEl.textContent = videoId ? `Video ID: ${videoId}` : '';
    document.title = `${label}${videoTitle ? ` - ${videoTitle}` : ''}`;
  }

  async function loadMetadata() {
    if (!videoId) return;
    try {
      const metadata = await window.api.getVideoMetadata(videoId);
      setHeader(metadata.title || '');
    } catch {
      setHeader('');
    }
  }

  function renderPlain(text) {
    currentText = text || '';
    currentHtml = '';
    contentEl.className = 'asset-content plain';
    contentEl.textContent = currentText || 'Nothing to show.';
  }

  function renderHtml(html) {
    currentHtml = sanitizeSummaryHtml(html || '');
    contentEl.className = 'asset-content';
    contentEl.innerHTML = currentHtml || '<p>Nothing to show.</p>';
    currentText = contentEl.textContent || '';
  }

  function renderTranscriptContent(text) {
    currentText = text || '';
    currentHtml = renderTranscript(currentText);
    contentEl.className = 'asset-content';
    contentEl.innerHTML = currentHtml || '<p>Nothing to show.</p>';
  }

  async function loadAsset() {
    if (!videoId) {
      setStatus('Missing videoId.', 'error');
      return;
    }

    setBusy(true);
    setStatus('Loading...');
    try {
      if (type === 'transcript') {
        const transcript = await window.api.getTranscript(videoId);
        renderTranscriptContent(transcript.timestampedText || transcript.text || '');
      } else {
        const summary = await window.api.getSummary(videoId, mode);
        if (mode === 'html') renderHtml(summary.summary || '');
        else renderPlain(summary.summary || '');
      }
      setStatus('Loaded.', 'success');
    } catch (error) {
      setStatus(error.message || 'Failed to load.', 'error');
      renderPlain('');
    } finally {
      setBusy(false);
    }
  }

  async function regenerateAsset() {
    if (!videoId) return;

    setBusy(true);
    setStatus(type === 'transcript' ? 'Regenerating transcript...' : 'Regenerating summary...');
    try {
      if (type === 'transcript') {
        const transcript = await window.api.requestTranscript(videoId, { force: true });
        renderTranscriptContent(transcript.timestampedText || transcript.text || '');
      } else {
        const summary = await window.api.requestSummary(videoId, mode, { force: true });
        if (mode === 'html') renderHtml(summary.summary || '');
        else renderPlain(summary.summary || '');
      }
      setStatus('Regenerated.', 'success');
    } catch (error) {
      setStatus(error.message || 'Failed to regenerate.', 'error');
    } finally {
      setBusy(false);
    }
  }

  copyBtn.addEventListener('click', async () => {
    await copyText(currentText || contentEl.textContent || '');
    setStatus('Copied.', 'success');
  });

  refreshBtn.addEventListener('click', loadAsset);
  regenerateBtn.addEventListener('click', regenerateAsset);
  youtubeBtn.addEventListener('click', () => {
    if (videoId) window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, '_blank');
  });

  async function init() {
    if (type === 'summary' && !params.has('mode')) {
      try {
        const settings = await window.api.getSummarySettings();
        mode = settings.summary_mode || settings.summaryMode || 'plain';
      } catch {
        mode = 'plain';
      }
    }

    setHeader('');
    await Promise.all([loadMetadata(), loadAsset()]);
  }

  init();
})();
