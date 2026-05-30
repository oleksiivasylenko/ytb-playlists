(function() {
  const { escapeHtml, sanitizeSummaryHtml, renderTranscript, copyText } = window.ytbAssetUtils;

  function createPreviewController(options = {}) {
    let popup = null;
    let hideTimer = null;
    let pinned = false;
    let requestId = 0;
    let currentResult = null;
    const classPrefix = options.classPrefix || 'yt-playlist-alt';

    function ensurePopup() {
      if (popup) return popup;

      popup = document.createElement('div');
      popup.className = `${classPrefix}-preview-popup`;
      if (options.id) popup.id = options.id;
      popup.innerHTML = `
        <div class="${classPrefix}-preview-toolbar">
          <button type="button" class="${classPrefix}-preview-pin" title="Pin preview" aria-label="Pin preview">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 17v5"></path>
              <path d="M5 17h14"></path>
              <path d="M17 3.34a10 10 0 0 1-10 0"></path>
              <path d="M8 3v8a4 4 0 0 1-4 4"></path>
              <path d="M16 3v8a4 4 0 0 0 4 4"></path>
            </svg>
          </button>
          <button type="button" class="${classPrefix}-preview-external" title="Open in new tab" aria-label="Open in new tab">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 3h6v6"></path>
              <path d="M10 14 21 3"></path>
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
            </svg>
          </button>
          <div class="${classPrefix}-preview-title"></div>
          <div class="${classPrefix}-preview-actions">
            <button type="button" class="${classPrefix}-preview-copy">Copy</button>
            <button type="button" class="${classPrefix}-preview-regenerate"></button>
          </div>
        </div>
        <div class="${classPrefix}-preview-body"></div>
      `;
      popup.addEventListener('mouseenter', () => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      });
      popup.addEventListener('mouseleave', scheduleHide);
      document.body.appendChild(popup);
      return popup;
    }

    function hide() {
      pinned = false;
      if (!popup) return;
      popup.classList.remove(`${classPrefix}-preview-popup--visible`, 'visible');
      popup.querySelector(`.${classPrefix}-preview-pin`)?.classList.remove(`${classPrefix}-preview-pin--active`, 'active');
    }

    function scheduleHide() {
      if (pinned) return;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 180);
    }

    function destroy() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      requestId++;
      pinned = false;
      if (popup) {
        popup.remove();
        popup = null;
      }
    }

    function position(anchor) {
      const el = ensurePopup();
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(options.maxWidth || 520, Math.max(options.minWidth || 300, window.innerWidth - 24));
      const isDocumentPosition = options.positionMode === 'document';
      const viewportLeft = Math.min(window.innerWidth - width - 10, Math.max(10, rect.left));
      const left = isDocumentPosition ? viewportLeft + window.scrollX : viewportLeft;
      const top = isDocumentPosition
        ? Math.max(10, rect.bottom + 8) + window.scrollY
        : Math.min(window.innerHeight - 220, Math.max(10, rect.bottom + 8));
      el.style.position = isDocumentPosition ? 'absolute' : 'fixed';
      el.style.width = `${width}px`;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }

    function setText(title, content, state = '') {
      const el = ensurePopup();
      el.querySelector(`.${classPrefix}-preview-title`).textContent = title;
      const body = el.querySelector(`.${classPrefix}-preview-body`);
      body.textContent = content;
      body.className = state
        ? `${classPrefix}-preview-body ${classPrefix}-preview-body--${state} ${state}`
        : `${classPrefix}-preview-body`;
    }

    function setHtml(title, html, state = '') {
      const el = ensurePopup();
      el.querySelector(`.${classPrefix}-preview-title`).textContent = title;
      const body = el.querySelector(`.${classPrefix}-preview-body`);
      body.innerHTML = html;
      body.className = state
        ? `${classPrefix}-preview-body ${classPrefix}-preview-body--${state} ${state}`
        : `${classPrefix}-preview-body`;
    }

    async function show(anchor, config) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      const id = ++requestId;
      const el = ensurePopup();
      const pinBtn = el.querySelector(`.${classPrefix}-preview-pin`);
      const externalBtn = el.querySelector(`.${classPrefix}-preview-external`);
      const copyBtn = el.querySelector(`.${classPrefix}-preview-copy`);
      const regenerateBtn = el.querySelector(`.${classPrefix}-preview-regenerate`);
      currentResult = null;

      pinned = false;
      pinBtn.classList.remove(`${classPrefix}-preview-pin--active`, 'active');
      pinBtn.onclick = event => {
        event.stopPropagation();
        pinned = !pinned;
        pinBtn.classList.toggle(`${classPrefix}-preview-pin--active`, pinned);
        pinBtn.classList.toggle('active', pinned);
        if (pinned && hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      };

      regenerateBtn.textContent = config.regenerateLabel || 'Regenerate';
      regenerateBtn.onclick = async event => {
        event.stopPropagation();
        if (!config.onRegenerate) return;
        setText(config.title, config.regeneratingText || 'Regenerating...', 'muted');
        try {
          const result = await config.onRegenerate();
          renderResult(config.title, result);
        } catch (error) {
          setText(config.title, error.message || 'Regeneration failed.', 'error');
        }
      };

      externalBtn.onclick = event => {
        event.stopPropagation();
        openExternalPage(config);
      };

      copyBtn.onclick = async event => {
        event.stopPropagation();
        await copyCurrentResult(config, copyBtn);
      };

      position(anchor);
      el.classList.add(`${classPrefix}-preview-popup--visible`, 'visible');

      if (config.ready === false) {
        currentResult = { kind: 'text', text: config.emptyText || 'Nothing to preview.' };
        setText(config.title, config.emptyText || 'Nothing to preview.', config.emptyState || 'muted');
        return;
      }

      setText(config.title, config.loadingText || 'Loading...', 'muted');

      try {
        const result = await config.load();
        if (id !== requestId) return;
        renderResult(config.title, result);
        position(anchor);
      } catch (error) {
        if (id !== requestId) return;
        setText(config.title, error.message || 'Failed to load preview.', 'error');
      }
    }

    function renderResult(title, result) {
      if (!result) {
        currentResult = { kind: 'text', text: 'Nothing to preview.' };
        setText(title, 'Nothing to preview.', 'muted');
        return;
      }
      currentResult = result;
      if (result.kind === 'html') {
        setHtml(title, sanitizeSummaryHtml(result.html || ''), 'html-page');
        return;
      }
      if (result.kind === 'transcript') {
        setHtml(title, renderTranscript(result.text || ''));
        return;
      }
      setText(title, result.text || 'Nothing to preview.', result.text ? '' : 'muted');
    }

    async function copyCurrentResult(config, button) {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Copying...';

      try {
        let result = currentResult;
        if (!result && config.ready !== false && config.load) {
          result = await config.load();
          currentResult = result;
          renderResult(config.title, result);
        }

        await copyText(resultToClipboardText(result));
        button.textContent = 'Copied';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 900);
      } catch (error) {
        button.textContent = 'Failed';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 1200);
      }
    }

    function resultToClipboardText(result) {
      if (!result) return '';
      if (result.kind === 'html') return result.html || '';
      return result.text || '';
    }

    function buildPageHtml(title, result) {
      const safeTitle = escapeHtml(title || 'Preview');
      const bodyHtml = renderPageBody(result);
      return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    body{margin:0;background:#f8fafc;color:#111827;font-family:Arial,sans-serif;line-height:1.55}
    main{max-width:980px;margin:0 auto;padding:32px 24px 56px}
    h1{font-size:28px;line-height:1.2;margin:0 0 20px;color:#0f172a}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 Arial,sans-serif;margin:0}
    .yt-transcript-line{display:grid;grid-template-columns:110px minmax(0,1fr);gap:14px;padding:5px 0;border-bottom:1px solid #e5e7eb}
    .yt-transcript-time{color:#94a3b8;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
    .yt-transcript-text{color:#0f172a;font-size:15px;font-weight:600}
    article,section{margin-bottom:18px}
    h2{font-size:21px;margin:24px 0 10px;color:#1e293b}
    h3{font-size:17px;margin:18px 0 8px;color:#334155}
    p,li{font-size:15px;color:#1f2937}
    blockquote{margin:14px 0;padding:10px 14px;border-left:3px solid #2563eb;background:#eff6ff;color:#1e3a8a}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}
    th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left;vertical-align:top}
    th{background:#e2e8f0;color:#0f172a}
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    ${bodyHtml}
  </main>
</body>
</html>`;
    }

    function renderPageBody(result) {
      if (!result) return '<pre>Nothing to preview.</pre>';
      if (result.kind === 'html') return sanitizeSummaryHtml(result.html || '');
      if (result.kind === 'transcript') return renderTranscript(result.text || '');
      return `<pre>${escapeHtml(result.text || 'Nothing to preview.')}</pre>`;
    }

    function openPageHtml(page, title, result) {
      const blob = new Blob([buildPageHtml(title, result)], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        page.location.replace(url);
      } catch {
        page.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    }

    async function openExternalPage(config) {
      if (config.externalUrl) {
        window.open(config.externalUrl, '_blank');
        return;
      }

      const page = window.open('', '_blank');
      if (!page) return;

      openPageHtml(page, config.title, currentResult || { kind: 'text', text: config.loadingText || 'Loading...' });
      if (currentResult || config.ready === false || !config.load) return;

      try {
        const result = await config.load();
        currentResult = result;
        openPageHtml(page, config.title, result);
      } catch (error) {
        const result = { kind: 'text', text: error.message || 'Failed to load preview.' };
        currentResult = result;
        openPageHtml(page, config.title, result);
      }
    }

    return {
      destroy,
      hide,
      scheduleHide,
      show
    };
  }

  function toPreviewResult(type, mode, payload) {
    if (type === 'transcript') {
      return { kind: 'transcript', text: payload.timestampedText || payload.text || '' };
    }

    return mode === 'html'
      ? { kind: 'html', html: payload.summary || '' }
      : { kind: 'text', text: payload.summary || '' };
  }

  function createVideoAssetConfig(options) {
    const type = options.type;
    const isTranscript = type === 'transcript';
    const mode = isTranscript ? 'plain' : options.summaryMode === 'html' ? 'html' : 'plain';
    const title = isTranscript ? 'Transcript' : mode === 'html' ? 'Summary Page' : 'Summary';

    return {
      title,
      externalUrl: buildAssetPageUrl(options.videoId, type, mode),
      ready: options.ready,
      emptyText: options.emptyText || (isTranscript ? 'Transcript has not been fetched yet.' : 'Summary has not been generated yet.'),
      emptyState: options.emptyState,
      loadingText: 'Loading...',
      regenerateLabel: isTranscript ? 'Regenerate transcript' : mode === 'html' ? 'Regenerate HTML summary' : 'Regenerate text summary',
      regeneratingText: isTranscript ? 'Regenerating transcript...' : 'Regenerating summary...',
      load: async () => {
        const payload = isTranscript
          ? await window.api.getTranscript(options.videoId)
          : await window.api.getSummary(options.videoId, mode);
        return toPreviewResult(type, mode, payload);
      },
      onRegenerate: async () => {
        if (options.beforeRegenerate) await options.beforeRegenerate({ type, mode, videoId: options.videoId });
        const payload = isTranscript
          ? await window.api.requestTranscript(options.videoId, { force: true })
          : await window.api.requestSummary(options.videoId, mode, { force: true });
        if (options.onRegenerated) await options.onRegenerated({ type, mode, videoId: options.videoId, payload });
        return toPreviewResult(type, mode, payload);
      }
    };
  }

  function buildAssetPageUrl(videoId, type, mode) {
    if (!videoId || !window.chrome || !chrome.runtime || !chrome.runtime.getURL) return '';
    const params = new URLSearchParams({ videoId, type });
    if (type === 'summary') params.set('mode', mode);
    return chrome.runtime.getURL(`asset.html?${params.toString()}`);
  }

  window.ytbPreview = {
    create: createPreviewController,
    createVideoAssetConfig,
    escapeHtml,
    renderTranscript,
    sanitizeSummaryHtml
  };
})();
