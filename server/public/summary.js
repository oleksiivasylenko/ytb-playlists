(function() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') === 'html' ? 'html' : 'plain';
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const videoId = decodeURIComponent(pathParts[pathParts.length - 1] || '');
  const kindEl = document.getElementById('summary-kind');
  const titleEl = document.getElementById('summary-title');
  const metaEl = document.getElementById('summary-meta');
  const statusEl = document.getElementById('summary-status');
  const contentEl = document.getElementById('summary-content');
  const copyBtn = document.getElementById('summary-copy');
  const copyLinkBtn = document.getElementById('summary-copy-link');
  const refreshBtn = document.getElementById('summary-refresh');
  const youtubeBtn = document.getElementById('summary-youtube');
  let currentText = '';
  const allowedStyleProperties = new Set([
    'background-color', 'border', 'border-bottom', 'border-collapse', 'border-color', 'border-left',
    'border-radius', 'border-right', 'border-style', 'border-top', 'border-width', 'color', 'display',
    'font-family', 'font-size', 'font-style', 'font-weight', 'gap', 'grid-template-columns', 'height',
    'letter-spacing', 'line-height', 'list-style-type', 'margin', 'margin-bottom', 'margin-left',
    'margin-right', 'margin-top', 'max-width', 'min-width', 'overflow-wrap', 'padding', 'padding-bottom',
    'padding-left', 'padding-right', 'padding-top', 'text-align', 'text-decoration', 'text-transform',
    'vertical-align', 'white-space', 'width', 'word-break'
  ]);

  function setStatus(text, state = '') {
    statusEl.textContent = text || '';
    statusEl.className = state ? `summary-status ${state}` : 'summary-status';
  }

  function sanitizeSummaryHtml(html) {
    const allowedTags = new Set([
      'A', 'ARTICLE', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2', 'H3',
      'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'OL', 'P', 'PRE', 'S', 'SECTION', 'SMALL', 'SPAN',
      'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL'
    ]);
    const parsedDocument = new DOMParser().parseFromString(String(html || ''), 'text/html');

    function sanitizeInlineStyle(value) {
      return String(value || '').split(';').map(declaration => {
        const separator = declaration.indexOf(':');
        if (separator < 1) return '';
        const property = declaration.slice(0, separator).trim().toLowerCase();
        const propertyValue = declaration.slice(separator + 1).trim();
        if (!allowedStyleProperties.has(property) || !propertyValue) return '';
        if (/url\s*\(|expression\s*\(|javascript\s*:|@import|-moz-binding|behavior\s*:/i.test(propertyValue)) return '';
        return `${property}: ${propertyValue}`;
      }).filter(Boolean).join('; ');
    }

    for (const node of Array.from(parsedDocument.body.querySelectorAll('*'))) {
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...Array.from(node.childNodes));
        continue;
      }

      for (const attribute of Array.from(node.attributes)) {
        const name = attribute.name.toLowerCase();
        const keepTableSpan = (name === 'colspan' || name === 'rowspan') && (node.tagName === 'TD' || node.tagName === 'TH');
        if (name === 'style') {
          const style = sanitizeInlineStyle(attribute.value);
          if (style) node.setAttribute('style', style);
          else node.removeAttribute(attribute.name);
          continue;
        }
        if (node.tagName !== 'A' || name !== 'href') {
          if (!keepTableSpan) node.removeAttribute(attribute.name);
          continue;
        }

        try {
          const url = new URL(attribute.value, window.location.href);
          if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) node.removeAttribute(attribute.name);
        } catch {
          node.removeAttribute(attribute.name);
        }
      }

      if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }

    return parsedDocument.body.innerHTML;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.className = 'copy-fallback';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function renderSummary(data) {
    const label = mode === 'html' ? 'HTML summary' : 'Summary';
    kindEl.textContent = label;
    titleEl.textContent = data.title || videoId || label;
    metaEl.textContent = [data.author, data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString()}` : ''].filter(Boolean).join(' · ');
    document.title = `${data.title || videoId} — ${label}`;

    if (mode === 'html') {
      contentEl.className = 'summary-content';
      contentEl.innerHTML = sanitizeSummaryHtml(data.summary || '') || '<p>Nothing to show.</p>';
    } else {
      contentEl.className = 'summary-content plain';
      contentEl.textContent = data.summary || 'Nothing to show.';
    }

    currentText = contentEl.textContent || '';
  }

  async function loadSummary() {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      setStatus('Invalid video ID.', 'error');
      return;
    }

    refreshBtn.disabled = true;
    setStatus('Loading...');

    try {
      const dataUrl = `${window.location.pathname.replace(/\/$/, '')}/data?mode=${encodeURIComponent(mode)}`;
      const response = await fetch(dataUrl, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load summary.');
      renderSummary(data);
      setStatus('Public summary', 'success');
    } catch (error) {
      contentEl.textContent = '';
      setStatus(error.message || 'Failed to load summary.', 'error');
    } finally {
      refreshBtn.disabled = false;
    }
  }

  copyBtn.addEventListener('click', async () => {
    await copyText(currentText);
    setStatus('Summary copied.', 'success');
  });

  copyLinkBtn.addEventListener('click', async () => {
    await copyText(window.location.href);
    setStatus('Public link copied.', 'success');
  });

  refreshBtn.addEventListener('click', loadSummary);
  youtubeBtn.addEventListener('click', () => {
    if (videoId) window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, '_blank', 'noopener');
  });

  loadSummary();
})();
