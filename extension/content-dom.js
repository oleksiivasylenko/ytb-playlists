(function() {
  function extractVideoIdFromUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.origin);
      const id = parsed.searchParams.get('v');
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    } catch (e) {
      const match = String(url).match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : null;
    }
  }

  function parseDurationText(text) {
    if (!text) return 0;
    const parts = text.trim().split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function normalizeDomText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isUsablePlaylistTitle(value) {
    const text = normalizeDomText(value);
    return text && !/^\d+$/.test(text) && text !== 'Unknown Title';
  }

  function removeDurationFromAriaLabel(value) {
    return normalizeDomText(value).replace(
      /\s+(?:(?:\d+\s+hours?)(?:,\s*)?)?(?:(?:\d+\s+minutes?)(?:,\s*)?)?(?:\d+\s+seconds?)?$/i,
      ''
    );
  }

  function getNodeText(node, preferAria = false) {
    if (!node) return '';
    const values = preferAria
      ? [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent]
      : [node.getAttribute('title'), node.textContent, node.getAttribute('aria-label')];

    for (const value of values) {
      const text = normalizeDomText(value);
      if (text) return text;
    }

    return '';
  }

  function getTitleNodeText(node) {
    if (!node) return '';

    const title = normalizeDomText(node.getAttribute('title'));
    if (title) return title;

    const text = normalizeDomText(node.textContent);
    if (text) return text;

    return removeDurationFromAriaLabel(node.getAttribute('aria-label'));
  }

  function getPlaylistEntryTitle(node) {
    const selectors = [
      'a#video-title[title]',
      'span#video-title[title]',
      'a#video-title',
      'span#video-title',
      'h3 a[href*="/watch?v="][title]',
      'h4 #video-title[title]'
    ];

    for (const selector of selectors) {
      const candidate = node.querySelector(selector);
      const title = getTitleNodeText(candidate);
      if (isUsablePlaylistTitle(title)) return title;
    }

    const heading = node.querySelector('h3[aria-label], h4[aria-label]');
    const ariaTitle = removeDurationFromAriaLabel(getNodeText(heading, true));
    return isUsablePlaylistTitle(ariaTitle) ? ariaTitle : '';
  }

  function getPlaylistEntryAuthor(node) {
    const selectors = [
      '#byline[title]',
      '#byline a',
      'ytd-channel-name #text a',
      'ytd-channel-name a',
      '.ytd-channel-name a',
      '#channel-name #text',
      '#byline'
    ];

    for (const selector of selectors) {
      const candidate = node.querySelector(selector);
      const author = getNodeText(candidate);
      if (author) return author;
    }

    return '';
  }

  function getCurrentPlaylistPageSourceId() {
    if (window.location.pathname !== '/playlist') return null;
    const sourceId = new URLSearchParams(window.location.search).get('list');
    return sourceId || null;
  }

  function getYoutubePlaylistSource() {
    const sourceId = getCurrentPlaylistPageSourceId();
    if (!sourceId) return null;

    const titleEl = document.querySelector('ytd-playlist-header-renderer h1, ytd-playlist-sidebar-primary-info-renderer h1, yt-formatted-string.title');
    const rawTitle = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
    const fallbackTitle = sourceId === 'WL' ? 'Watch Later' : 'YouTube playlist';
    const name = rawTitle || document.title.replace(/- YouTube$/, '').trim() || fallbackTitle;

    return {
      sourceType: 'youtube_playlist',
      sourceId,
      sourceUrl: window.location.href,
      name
    };
  }

  function getExpectedPlaylistVideoCount() {
    const statsText = Array.from(document.querySelectorAll([
      'ytd-playlist-header-renderer #stats',
      'ytd-playlist-sidebar-primary-info-renderer #stats',
      'yt-formatted-string#stats',
      '#stats'
    ].join(',')))
      .map(node => node.textContent || '')
      .join(' ');

    const match = statsText.match(/([0-9][0-9\s,.]*)\s*(?:videos?|відео)/i);
    if (!match) return null;

    const count = Number(match[1].replace(/[^\d]/g, ''));
    return Number.isFinite(count) && count > 0 ? count : null;
  }

  function getScrollMetrics() {
    const doc = document.documentElement;
    const body = document.body;
    const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
    const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight, doc.offsetHeight, body.offsetHeight);

    return {
      scrollTop,
      scrollHeight,
      nearBottom: scrollTop + window.innerHeight >= scrollHeight - 320
    };
  }

  function scrollToPosition(top) {
    window.scrollTo(0, top);
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
    window.dispatchEvent(new Event('scroll'));
  }

  function collectLoadedPlaylistEntries() {
    const nodes = Array.from(document.querySelectorAll([
      'ytd-playlist-video-renderer',
      'ytd-playlist-panel-video-renderer',
      'ytd-rich-item-renderer'
    ].join(',')));
    const entries = [];
    const seen = new Set();

    nodes.forEach((node) => {
      const link = node.querySelector('a#video-title[href*="/watch?v="], a#wc-endpoint[href*="/watch?v="], a#thumbnail[href*="/watch?v="], a[href*="/watch?v="]');
      const videoId = extractVideoIdFromUrl(link && (link.href || link.getAttribute('href')));
      if (!videoId || seen.has(videoId)) return;

      const imgNode = node.querySelector('img');
      const durationNode = node.querySelector('ytd-thumbnail-overlay-time-status-renderer #text, .ytd-thumbnail-overlay-time-status-renderer, span#text');

      seen.add(videoId);
      entries.push({
        node,
        video: {
          id: videoId,
          title: getPlaylistEntryTitle(node),
          author: getPlaylistEntryAuthor(node),
          thumbnail: imgNode && imgNode.src && !imgNode.src.startsWith('data:') ? imgNode.src : '',
          duration: parseDurationText(durationNode && durationNode.textContent)
        }
      });
    });

    return entries;
  }

  function collectLoadedPlaylistVideos() {
    return collectLoadedPlaylistEntries().map(entry => entry.video);
  }

  function getVisibleMenuButton(node) {
    const selectors = [
      'ytd-menu-renderer yt-icon-button#button button',
      'ytd-menu-renderer button[aria-label]',
      'button[aria-label*="Action menu"]',
      'button[aria-label*="More actions"]',
      'yt-icon-button#button button',
      '#button button'
    ];

    for (const selector of selectors) {
      const button = node.querySelector(selector);
      if (button && !button.disabled) return button;
    }

    return null;
  }

  function getVisibleMenuItems() {
    const roots = Array.from(document.querySelectorAll([
      'ytd-popup-container',
      'ytd-menu-popup-renderer',
      'tp-yt-paper-listbox',
      'tp-yt-iron-dropdown'
    ].join(','))).filter(root => {
      const rect = root.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const searchRoots = roots.length ? roots : [document];
    const items = searchRoots.flatMap(root => Array.from(root.querySelectorAll([
      'ytd-menu-service-item-renderer',
      'ytd-menu-navigation-item-renderer',
      'tp-yt-paper-item'
    ].join(','))));

    return items.filter(item => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function isRemoveMenuText(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.includes('remove from watch later')) return true;
    if (normalized.includes('remove from playlist')) return true;
    if (normalized.includes('remove from')) return true;
    if (normalized.includes('видалити з')) return true;
    if (normalized.includes('удалить из')) return true;
    return false;
  }

  function parseCompactCount(value) {
    const text = normalizeDomText(value);
    if (!text) return null;

    const match = text.replace(/\u00a0/g, ' ').match(/([0-9][0-9\s.,]*)\s*([kmb])?/i);
    if (!match) return null;

    const rawNumber = match[1].replace(/\s/g, '');
    const normalized = rawNumber.includes('.') && rawNumber.includes(',')
      ? rawNumber.replace(/,/g, '')
      : rawNumber.replace(',', '.');
    const number = Number(normalized);
    if (!Number.isFinite(number)) return null;

    const lowerText = text.toLowerCase();
    const multiplier = match[2]
      ? { k: 1000, m: 1000000, b: 1000000000 }[match[2].toLowerCase()] || 1
      : /(тис|тыс|thousand)/i.test(lowerText)
      ? 1000
      : /(млн|million)/i.test(lowerText)
      ? 1000000
      : /(млрд|billion)/i.test(lowerText)
      ? 1000000000
      : 1;
    return Math.max(0, Math.round(number * multiplier));
  }

  function getExpectedCommentCount() {
    const commentsRoot = document.querySelector('ytd-comments#comments, ytd-comments');
    if (!commentsRoot) return null;

    const nodes = Array.from(commentsRoot.querySelectorAll([
      'ytd-comments-header-renderer #count .count-text',
      'ytd-comments-header-renderer #count',
      'ytd-comments-header-renderer h2'
    ].join(',')));

    for (const node of nodes) {
      const count = parseCompactCount(node.textContent || '');
      if (count !== null) return count;
    }

    return null;
  }

  function collectLoadedComments() {
    const comments = [];
    const seen = new Set();
    const threads = Array.from(document.querySelectorAll('ytd-comment-thread-renderer, yt-comment-thread-renderer'));

    threads.forEach(thread => {
      const models = Array.from(thread.querySelectorAll('ytd-comment-view-model, yt-comment-view-model'));
      models.forEach((model, modelIndex) => {
        const textNode = model.querySelector('#content-text, yt-attributed-string#content-text');
        const text = normalizeDomText(textNode && (textNode.innerText || textNode.textContent));
        if (!text) return;

        const authorNode = model.querySelector('#author-text, #author-text span');
        const thumbnailButton = model.querySelector('#author-thumbnail-button');
        const author = normalizeDomText(
          (authorNode && (authorNode.textContent || authorNode.getAttribute('aria-label'))) ||
          (thumbnailButton && thumbnailButton.getAttribute('aria-label')) ||
          ''
        );
        const publishedTime = normalizeDomText(model.querySelector('#published-time-text')?.textContent || '');
        const likes = normalizeDomText(model.querySelector('#vote-count-middle')?.textContent || '');
        const reply = modelIndex > 0 || !!model.closest('ytd-comment-replies-renderer, yt-sub-thread');
        const key = `${author}|${publishedTime}|${text}`;
        if (seen.has(key)) return;

        seen.add(key);
        comments.push({ author, text, publishedTime, likes, reply });
      });
    });

    return comments;
  }

  function findCommentsSection() {
    return document.querySelector('ytd-comments#comments, ytd-comments');
  }

  function getHiddenReplyCount() {
    const commentsRoot = findCommentsSection();
    if (!commentsRoot) return 0;

    const buttons = Array.from(commentsRoot.querySelectorAll([
      'ytd-comment-replies-renderer #more-replies button',
      'ytd-comment-replies-renderer #more-replies-sub-thread button',
      'ytd-comment-replies-renderer .show-replies-button button',
      'yt-sub-thread button[aria-label]'
    ].join(',')));
    const seen = new Set();
    let total = 0;

    buttons.forEach(button => {
      const key = button.closest('ytd-button-renderer, yt-sub-thread, .show-replies-button') || button;
      if (seen.has(key)) return;
      if (button.closest('[hidden]')) return;

      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const text = normalizeDomText(
        button.getAttribute('aria-label') ||
        button.textContent ||
        button.closest('ytd-button-renderer, yt-sub-thread')?.getAttribute('aria-label') ||
        ''
      );
      if (!text) return;
      if (/(hide|show less|less|схов|прихов|скры|скрыть)/i.test(text)) return;
      if (!/(repl|відпов|ответ)/i.test(text)) return;

      const count = parseCompactCount(text);
      if (!Number.isInteger(count) || count <= 0) return;

      seen.add(key);
      total += count;
    });

    return total;
  }

  function getLoadedCommentCount() {
    return collectLoadedComments().length;
  }

  function getCommentSyncStats() {
    const comments = collectLoadedComments();
    const hiddenReplies = getHiddenReplyCount();
    return {
      comments,
      hiddenReplies,
      expected: getExpectedCommentCount(),
      accounted: comments.length + hiddenReplies
    };
  }

  function formatCommentsCount(loaded, expected, hiddenReplies = 0) {
    if (expected === 0) return 'No comments';
    if (Number.isInteger(expected)) {
      const hidden = hiddenReplies > 0 ? ` + ${hiddenReplies} hidden replies` : '';
      return `Loaded ${loaded}${hidden}/${expected} comments`;
    }
    const hidden = hiddenReplies > 0 ? ` (+${hiddenReplies} hidden replies)` : '';
    return `Loaded ${loaded} comments${hidden}`;
  }

  function getCurrentVideoTitleFromPage() {
    const selectors = [
      'ytd-watch-metadata h1 yt-formatted-string',
      'ytd-watch-metadata #title h1',
      '#title h1 yt-formatted-string',
      'h1.ytd-watch-metadata'
    ];

    for (const selector of selectors) {
      const text = normalizeDomText(document.querySelector(selector)?.textContent || '');
      if (text) return text;
    }

    return document.title.replace(/- YouTube$/, '').trim();
  }

  function getCurrentVideoAuthorFromPage() {
    const selectors = [
      'ytd-watch-metadata ytd-video-owner-renderer ytd-channel-name #text a',
      'ytd-watch-metadata ytd-video-owner-renderer ytd-channel-name #text',
      'ytd-watch-metadata #owner ytd-channel-name #text a',
      'ytd-watch-metadata #owner ytd-channel-name #text'
    ];

    for (const selector of selectors) {
      const text = normalizeDomText(document.querySelector(selector)?.textContent || '');
      if (text) return text;
    }

    return '';
  }

  function getVideoIdFromUrl() {
    return new URLSearchParams(window.location.search).get('v');
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '…' : str;
  }

  window.ytbContentDom = {
    extractVideoIdFromUrl,
    parseDurationText,
    normalizeDomText,
    isUsablePlaylistTitle,
    removeDurationFromAriaLabel,
    getNodeText,
    getTitleNodeText,
    getPlaylistEntryTitle,
    getPlaylistEntryAuthor,
    getCurrentPlaylistPageSourceId,
    getYoutubePlaylistSource,
    getExpectedPlaylistVideoCount,
    getScrollMetrics,
    scrollToPosition,
    collectLoadedPlaylistEntries,
    collectLoadedPlaylistVideos,
    getVisibleMenuButton,
    getVisibleMenuItems,
    isRemoveMenuText,
    parseCompactCount,
    getExpectedCommentCount,
    collectLoadedComments,
    findCommentsSection,
    getHiddenReplyCount,
    getLoadedCommentCount,
    getCommentSyncStats,
    formatCommentsCount,
    getCurrentVideoTitleFromPage,
    getCurrentVideoAuthorFromPage,
    getVideoIdFromUrl,
    truncate
  };
})();
