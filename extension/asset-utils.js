(function() {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeSummaryHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script, iframe, object, embed, link, meta, style, form, input, button').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || value.startsWith('javascript:')) node.removeAttribute(attr.name);
      }
    });
    return template.innerHTML;
  }

  function renderTranscript(text) {
    return String(text || '').split(/\r?\n/).map(line => {
      const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s+(.+)$/);
      if (!match) return `<div class="yt-transcript-line"><span class="yt-transcript-text">${escapeHtml(line)}</span></div>`;
      return `<div class="yt-transcript-line"><span class="yt-transcript-time">${escapeHtml(match[1])}</span><span class="yt-transcript-text">${escapeHtml(match[2])}</span></div>`;
    }).join('');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  window.ytbAssetUtils = {
    escapeHtml,
    sanitizeSummaryHtml,
    renderTranscript,
    copyText
  };
})();
