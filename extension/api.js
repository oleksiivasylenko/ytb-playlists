const API_BASE = 'http://localhost:3001/api';

const _cache = new Map();
const CACHE_TTL = 30000;

const nativeFetch = typeof fetch === 'function' ? fetch.bind(globalThis) : null;

function shouldProxyApiFetch() {
  return typeof window !== 'undefined' &&
    window.location &&
    window.location.hostname === 'www.youtube.com' &&
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === 'function';
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        let error = null;
        try {
          error = chrome.runtime.lastError;
        } catch (err) {
          error = err;
        }

        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        if (!response || response.success === false) {
          reject(new Error((response && response.error) || 'Extension API proxy failed.'));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createProxyResponse(payload) {
  const body = typeof payload.body === 'string' ? payload.body : '';
  const headers = payload.headers || {};

  return {
    ok: !!payload.ok,
    status: payload.status || 0,
    statusText: payload.statusText || '',
    headers: {
      get(name) {
        return headers[String(name || '').toLowerCase()] || null;
      }
    },
    async text() {
      return body;
    },
    async json() {
      return body ? JSON.parse(body) : null;
    }
  };
}

async function apiFetch(url, options = {}) {
  if (!shouldProxyApiFetch()) return nativeFetch(url, options);

  const response = await sendRuntimeMessage({
    action: 'apiFetch',
    url,
    options: {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    }
  });

  return createProxyResponse(response);
}

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

function cacheInvalidate(...patterns) {
  for (const key of _cache.keys()) {
    if (patterns.some(p => key.startsWith(p))) _cache.delete(key);
  }
}

async function readJsonResponse(res, fallbackMessage) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();

  const text = await res.text();
  const message = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  throw new Error(message || fallbackMessage);
}

const api = {
  async getPlaylists(options = {}) {
    const force = !!options.force;
    const cached = cacheGet('playlists');
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/playlists`);
    const data = await res.json();
    cacheSet('playlists', data);
    return data;
  },
  async getPlaylistCounts(options = {}) {
    const force = !!options.force;
    const cached = cacheGet('playlist_counts');
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/playlists/counts`);
    const data = await res.json();
    cacheSet('playlist_counts', data);
    return data;
  },
  async createPlaylist(name) {
    const res = await apiFetch(`${API_BASE}/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    cacheInvalidate('playlists', 'playlist_counts');
    return data;
  },
  async renamePlaylist(id, name) {
    return this.updatePlaylist(id, { name });
  },
  async updatePlaylist(id, payload) {
    const res = await apiFetch(`${API_BASE}/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update playlist');
    cacheInvalidate('playlists', 'playlist_counts');
    return data;
  },
  async deletePlaylist(id) {
    const res = await apiFetch(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
    const data = await res.json();
    cacheInvalidate('playlists', 'playlist_counts', 'generated_summaries', `playlist_videos_${id}`, `playlist_missing_${id}`, `playlist_youtube_cleanup_pending_${id}`, `playlist_youtube_cleanup_candidates_${id}`);
    return data;
  },
  async getPlaylistVideos(playlistId, status = 'all', options = {}) {
    const key = `playlist_videos_${playlistId}_${status}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos?status=${encodeURIComponent(status)}`);
    const data = await res.json();
    cacheSet(key, data);
    return data;
  },
  async getMissingVideos(playlistId) {
    const key = `playlist_missing_${playlistId}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/missing`);
    const data = await res.json();
    cacheSet(key, data);
    return data;
  },
  async getYoutubeCleanupPendingVideos(playlistId, options = {}) {
    const key = `playlist_youtube_cleanup_pending_${playlistId}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos/youtube-cleanup-pending`);
    const data = await res.json();
    cacheSet(key, data);
    return data;
  },
  async getYoutubeCleanupCandidateVideos(playlistId, options = {}) {
    const key = `playlist_youtube_cleanup_candidates_${playlistId}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos/youtube-cleanup-candidates`);
    const data = await res.json();
    cacheSet(key, data);
    return data;
  },
  async getGeneratedSummaries(options = {}) {
    const force = !!options.force;
    const cached = cacheGet('generated_summaries');
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/summaries`);
    const data = await res.json();
    cacheSet('generated_summaries', data);
    return data;
  },
  async addVideoToPlaylist(playlistId, videoId) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId })
    });
    const data = await res.json();
    cacheInvalidate('playlists', 'playlist_counts', 'generated_summaries', `playlist_videos_${playlistId}`, `playlist_missing_${playlistId}`, `playlist_youtube_cleanup_pending_${playlistId}`, `playlist_youtube_cleanup_candidates_${playlistId}`, `video_playlists_${videoId}`);
    return data;
  },
  async removeVideoFromPlaylist(playlistId, videoId) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos/${videoId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove video from playlist');
    cacheInvalidate('playlists', 'playlist_counts', 'generated_summaries', `playlist_videos_${playlistId}`, `playlist_missing_${playlistId}`, `playlist_youtube_cleanup_pending_${playlistId}`, `playlist_youtube_cleanup_candidates_${playlistId}`, `video_playlists_${videoId}`);
    return data;
  },
  async restoreVideoInPlaylist(playlistId, videoId) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos/${videoId}/restore`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to restore video');
    cacheInvalidate('playlists', 'playlist_counts', 'generated_summaries', `playlist_videos_${playlistId}`, `playlist_missing_${playlistId}`, `playlist_youtube_cleanup_pending_${playlistId}`, `playlist_youtube_cleanup_candidates_${playlistId}`, `video_playlists_${videoId}`);
    return data;
  },
  async moveVideosToPlaylist(sourcePlaylistId, targetPlaylistId, videoIds) {
    const ids = Array.from(new Set((Array.isArray(videoIds) ? videoIds : [videoIds]).filter(Boolean)));
    const res = await apiFetch(`${API_BASE}/playlists/${sourcePlaylistId}/videos/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlaylistId, videoIds: ids })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to move videos');
    cacheInvalidate(
      'playlists',
      'playlist_counts',
      `playlist_videos_${sourcePlaylistId}`,
      `playlist_videos_${targetPlaylistId}`,
      `playlist_missing_${sourcePlaylistId}`,
      `playlist_missing_${targetPlaylistId}`,
      `playlist_youtube_cleanup_pending_${sourcePlaylistId}`,
      `playlist_youtube_cleanup_pending_${targetPlaylistId}`,
      `playlist_youtube_cleanup_candidates_${sourcePlaylistId}`,
      `playlist_youtube_cleanup_candidates_${targetPlaylistId}`
    );
    ids.forEach(videoId => cacheInvalidate(`video_playlists_${videoId}`));
    cacheInvalidate('generated_summaries');
    return data;
  },
  async markYoutubeCleanup(playlistId, videoId, result, error = '') {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/videos/${videoId}/youtube-cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, error })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save YouTube cleanup state');
    cacheInvalidate(
      'playlists',
      'playlist_counts',
      'generated_summaries',
      `playlist_videos_${playlistId}`,
      `playlist_missing_${playlistId}`,
      `playlist_youtube_cleanup_pending_${playlistId}`,
      `playlist_youtube_cleanup_candidates_${playlistId}`,
      `video_playlists_${videoId}`
    );
    return data;
  },
  async getVideoMetadata(videoId) {
    const res = await apiFetch(`${API_BASE}/videos/${videoId}`);
    return res.json();
  },
  getTranscriptEventsUrl() {
    return `${API_BASE}/transcripts/events`;
  },
  getSummaryEventsUrl() {
    return `${API_BASE}/summaries/events`;
  },
  async getSummarySettings() {
    const res = await apiFetch(`${API_BASE}/summary-settings`);
    return readJsonResponse(res, 'Failed to load summary settings');
  },
  async updateSummarySettings(settings) {
    const res = await apiFetch(`${API_BASE}/summary-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await readJsonResponse(res, 'Failed to save summary settings');
    if (!res.ok) throw new Error(data.error || 'Failed to save summary settings');
    return data;
  },
  async getTranscriptStatus(videoId, options = {}) {
    const key = `video_transcript_status_${videoId}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/transcript/status`);
    const data = await readJsonResponse(res, 'Failed to load transcript status');
    cacheSet(key, data);
    return data;
  },
  async getTranscript(videoId) {
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/transcript`);
    const data = await readJsonResponse(res, 'Transcript not found');
    if (!res.ok) throw new Error(data.error || 'Transcript not found');
    return data;
  },
  async requestTranscript(videoId, language) {
    const payload = typeof language === 'object'
      ? language
      : language ? { language } : {};
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await readJsonResponse(res, 'Failed to fetch transcript');
    if (!res.ok) {
      const error = new Error(data.error || 'Failed to fetch transcript');
      Object.assign(error, data);
      throw error;
    }
    cacheInvalidate(`video_transcript_status_${videoId}`);
    cacheInvalidate('playlist_videos_');
    return data;
  },
  async getSummaryStatus(videoId, options = {}) {
    const key = `video_summary_status_${videoId}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/summary/status`);
    const data = await readJsonResponse(res, 'Failed to load summary status');
    cacheSet(key, data);
    return data;
  },
  async getSummary(videoId, mode = 'plain') {
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/summary?mode=${encodeURIComponent(mode)}`);
    const data = await readJsonResponse(res, 'Summary not found');
    if (!res.ok) throw new Error(data.error || 'Summary not found');
    return data;
  },
  async requestSummary(videoId, mode = 'plain', options = {}) {
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, force: !!options.force })
    });
    const data = await readJsonResponse(res, 'Failed to generate summary');
    if (!res.ok) throw new Error(data.error || 'Failed to generate summary');
    cacheInvalidate(`video_summary_status_${videoId}`);
    cacheInvalidate('playlist_videos_', 'generated_summaries');
    return data;
  },
  async getTagStatus(videoId, options = {}) {
    const key = `video_tag_status_${videoId}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/tags/status`);
    const data = await readJsonResponse(res, 'Failed to load tag status');
    cacheSet(key, data);
    return data;
  },
  async getTags(videoId) {
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/tags`);
    const data = await readJsonResponse(res, 'Tags not found');
    if (!res.ok) throw new Error(data.error || 'Tags not found');
    return data;
  },
  async requestTags(videoId, options = {}) {
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: !!options.force })
    });
    const data = await readJsonResponse(res, 'Failed to generate tags');
    if (!res.ok) throw new Error(data.error || 'Failed to generate tags');
    cacheInvalidate(`video_tag_status_${videoId}`);
    cacheInvalidate('playlist_videos_', 'generated_summaries');
    return data;
  },
  async startSync(payload) {
    const res = await apiFetch(`${API_BASE}/sync/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start sync');
    cacheInvalidate('playlists', 'playlist_counts');
    return data;
  },
  async sendSyncBatch(runId, videos) {
    const res = await apiFetch(`${API_BASE}/sync/${runId}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videos })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to sync batch');
    return data;
  },
  async finalizeSync(runId, playlistId, options = {}) {
    const res = await apiFetch(`${API_BASE}/sync/${runId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skipMissingCheck: !!options.skipMissingCheck })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to finalize sync');
    if (playlistId) cacheInvalidate(`playlist_videos_${playlistId}`, `playlist_missing_${playlistId}`, `playlist_youtube_cleanup_pending_${playlistId}`, `playlist_youtube_cleanup_candidates_${playlistId}`);
    cacheInvalidate('playlists', 'playlist_counts');
    return data;
  },
  async failSync(runId, error) {
    const res = await apiFetch(`${API_BASE}/sync/${runId}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error })
    });
    return res.json();
  },
  async refreshMetadata() {
    const res = await apiFetch(`${API_BASE}/videos/refresh-metadata`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to refresh metadata');
    return data;
  },
  async getMetadataRefreshStatus() {
    const res = await apiFetch(`${API_BASE}/videos/refresh-metadata/status`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load metadata refresh status');
    return data;
  },
  async getVideoPlaylists(videoId, options = {}) {
    const key = `video_playlists_${videoId}`;
    const force = !!options.force;
    const cached = cacheGet(key);
    if (!force && cached) return cached;
    const res = await apiFetch(`${API_BASE}/videos/${videoId}/playlists`);
    if (!res.ok) return [];
    const data = await res.json();
    cacheSet(key, data);
    return data;
  }
};

// Export for content script and management page
if (typeof window !== 'undefined') {
  window.api = api;
}

