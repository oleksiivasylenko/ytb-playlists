(function() {
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForTransition(element, fallbackMs) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        element.removeEventListener('transitionend', onTransitionEnd);
        resolve();
      };
      const onTransitionEnd = event => {
        if (event.target === element && event.propertyName === 'height') finish();
      };

      element.addEventListener('transitionend', onTransitionEnd);
      setTimeout(finish, fallbackMs);
    });
  }

  function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatWatchHours(seconds) {
    const totalSeconds = Number(seconds);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0 hours';

    const hours = totalSeconds / 3600;
    if (hours < 1) return `${Math.ceil(totalSeconds / 60)} min`;
    if (hours < 10) return `${hours.toFixed(1).replace(/\.0$/, '')} hours`;
    return `${Math.round(hours)} hours`;
  }

  function toTimestamp(value) {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function formatRelativeDate(dateValue) {
    if (!dateValue) return '';
    const timestamp = toTimestamp(dateValue);
    if (!timestamp) return '';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    const units = [
      ['year', 365 * 24 * 60 * 60],
      ['month', 30 * 24 * 60 * 60],
      ['week', 7 * 24 * 60 * 60],
      ['day', 24 * 60 * 60],
      ['hour', 60 * 60],
      ['minute', 60]
    ];

    for (const [name, seconds] of units) {
      const value = Math.floor(elapsedSeconds / seconds);
      if (value >= 1) return `${value} ${name}${value === 1 ? '' : 's'} ago`;
    }

    return 'just now';
  }

  function getSortOrder(video) {
    const order = Number(video.sort_order);
    return Number.isFinite(order) ? order : 0;
  }

  function compareSortOrder(a, b) {
    return getSortOrder(a) - getSortOrder(b);
  }

  function formatCompactViews(viewCount) {
    const count = Number(viewCount);
    if (!Number.isFinite(count) || count <= 0) return '';

    const units = [
      [1000000000, 'bln'],
      [1000000, 'mln'],
      [1000, 'k']
    ];

    for (const [size, suffix] of units) {
      if (count >= size) {
        const value = count / size;
        const formatted = value >= 10
          ? Math.round(value).toString()
          : value.toFixed(1).replace(/\.0$/, '');
        return `${formatted}${suffix}`;
      }
    }

    return Math.round(count).toString();
  }

  function isUnavailable(video) {
    return video.status === 'unavailable_on_youtube' ||
      video.status === 'unavailable' ||
      video.title === 'Unknown Title' ||
      !video.title;
  }

  function normalizeVideoStatus(video) {
    return video.status || 'active';
  }

  function isYoutubeCleanupPending(video) {
    const status = normalizeVideoStatus(video);
    return (status === 'removed_by_user' || status === 'moved_to_playlist') && !video.youtube_removed_at;
  }

  function isMissingVideo(video) {
    const status = normalizeVideoStatus(video);
    return status === 'removed_from_source' ||
      status === 'removed' ||
      status === 'unavailable_on_youtube' ||
      status === 'unavailable' ||
      isUnavailable(video);
  }

  function getVideoStatusLabel(video) {
    const status = normalizeVideoStatus(video);
    if (status === 'moved_to_playlist') {
      const target = video.moved_to_playlist_name ? `: ${video.moved_to_playlist_name}` : '';
      return `Moved to another list${target}`;
    }
    if (isYoutubeCleanupPending(video)) return 'Pending YouTube cleanup';
    if (status === 'removed_by_user') return 'Removed by you';
    if (status === 'removed_from_source' || status === 'removed') return 'Removed from YouTube playlist';
    if (status === 'unavailable_on_youtube' || status === 'unavailable') return 'Unavailable on YouTube';
    return '';
  }

  function hasTranscript(video) {
    return video.has_transcript === 1 || video.has_transcript === true;
  }

  function isTranscriptUnavailable(video) {
    return video.transcript_unavailable === 1 ||
      video.transcript_unavailable === true ||
      video.transcriptUnavailable === true;
  }

  function hasHtmlSummary(video) {
    return video.has_html_summary === 1 || video.has_html_summary === true;
  }

  function getVideoTags(video) {
    if (!video) return [];
    if (Array.isArray(video.tags)) return video.tags.filter(tag => typeof tag === 'string' && tag.trim());
    if (!video.tags_json) return [];

    try {
      const parsed = JSON.parse(video.tags_json);
      return Array.isArray(parsed) ? parsed.filter(tag => typeof tag === 'string' && tag.trim()) : [];
    } catch {
      return [];
    }
  }

  function hasTags(video) {
    return getVideoTags(video).length > 0;
  }

  function normalizeTagFilterValue(tag) {
    return typeof tag === 'string' ? tag.replace(/\s+/g, ' ').trim() : '';
  }

  function getTagFilterKey(tag) {
    return normalizeTagFilterValue(tag).toLowerCase();
  }

  window.ytbPanelUtils = {
    delay,
    waitForTransition,
    formatDuration,
    formatWatchHours,
    toTimestamp,
    formatRelativeDate,
    getSortOrder,
    compareSortOrder,
    formatCompactViews,
    isUnavailable,
    normalizeVideoStatus,
    isYoutubeCleanupPending,
    isMissingVideo,
    getVideoStatusLabel,
    hasTranscript,
    isTranscriptUnavailable,
    hasHtmlSummary,
    getVideoTags,
    hasTags,
    normalizeTagFilterValue,
    getTagFilterKey
  };
})();
