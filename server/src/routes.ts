import { Router } from 'express';
import db from './db';
import { fetchVideoMetadata, type VideoMetadata } from './youtube';
import { addTranscriptEventClient, ensureTranscript, getTranscript, getTranscriptStatus, TranscriptUnavailableError } from './transcripts';
import {
  addSummaryEventClient,
  ensureTags,
  ensureSummary,
  getSummary,
  getSummarySettings,
  getSummaryStatus,
  getTags,
  getTagStatus,
  normalizeSummaryMode,
  updateSummarySettings
} from './summaries';

const router = Router();
const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
const languageRegex = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/;
const metadataRefreshQueue: string[] = [];
const queuedMetadataRefreshIds = new Set<string>();
let metadataRefreshRunning = false;
const autoAssetQueue: string[] = [];
const queuedAutoAssetIds = new Set<string>();
let autoAssetRunning = false;
const nonActiveStatuses = [
  'removed_from_source',
  'unavailable_on_youtube',
  'removed_by_user',
  'moved_to_playlist',
  'removed',
  'unavailable'
];
const filterableStatuses = ['active', ...nonActiveStatuses];

type SnapshotVideo = {
  id: string;
  title?: string;
  thumbnail?: string;
  author?: string;
  duration?: number;
  sortOrder?: number;
};

type MetadataRefreshStatus = {
  running: boolean;
  total: number;
  processed: number;
  updated: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
};

let metadataRefreshStatus: MetadataRefreshStatus = {
  running: false,
  total: 0,
  processed: 0,
  updated: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  message: ''
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeVideoId(value: unknown) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return videoIdRegex.test(id) ? id : null;
}

function normalizeLanguage(value: unknown) {
  if (typeof value !== 'string') return null;
  const language = value.trim();
  return languageRegex.test(language) ? language : null;
}

function isKnownTitle(title: unknown) {
  if (typeof title !== 'string') return false;
  const text = title.trim();
  return text !== '' && text !== 'Unknown Title' && !/^\d+$/.test(text);
}

function metadataIsAvailable(metadata: Pick<VideoMetadata, 'title'>) {
  return isKnownTitle(metadata.title);
}

function metadataIsUnavailable(metadata: Pick<VideoMetadata, 'availability'>) {
  return metadata.availability === 'unavailable';
}

function videoNeedsMetadataRefresh(video: Partial<VideoMetadata> | null | undefined) {
  if (!video) return true;
  return !isKnownTitle(video.title)
    || !video.author
    || video.author === 'Unknown Author'
    || !video.duration
    || !video.published_at
    || video.availability !== 'available';
}

function toVideoMetadata(videoId: string, input: Partial<SnapshotVideo> = {}): VideoMetadata {
  return {
    title: isKnownTitle(input.title) ? String(input.title).trim() : 'Unknown Title',
    thumbnail: typeof input.thumbnail === 'string' && input.thumbnail.trim()
      ? input.thumbnail.trim()
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    author: typeof input.author === 'string' && input.author.trim() ? input.author.trim() : 'Unknown Author',
    view_count: 0,
    published_at: null,
    duration: Number.isFinite(Number(input.duration)) ? Number(input.duration) : 0,
    availability: 'unknown'
  };
}

function upsertVideo(videoId: string, metadata: VideoMetadata, checkedAt: string | null) {
  const availability = metadataIsAvailable(metadata)
    ? 'available'
    : metadataIsUnavailable(metadata) ? 'unavailable' : 'unknown';
  db.prepare(`
    INSERT INTO videos (id, title, thumbnail, author, view_count, published_at, duration, availability, last_checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = CASE WHEN excluded.title != 'Unknown Title' THEN excluded.title ELSE videos.title END,
      thumbnail = CASE WHEN excluded.thumbnail IS NOT NULL AND excluded.thumbnail != '' THEN excluded.thumbnail ELSE videos.thumbnail END,
      author = CASE WHEN excluded.author != 'Unknown Author' THEN excluded.author ELSE videos.author END,
      view_count = CASE WHEN excluded.view_count > 0 THEN excluded.view_count ELSE videos.view_count END,
      published_at = COALESCE(excluded.published_at, videos.published_at),
      duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE videos.duration END,
      availability = CASE
        WHEN excluded.availability = 'available' THEN 'available'
        WHEN excluded.availability = 'unavailable' THEN 'unavailable'
        ELSE videos.availability
      END,
      last_checked_at = COALESCE(excluded.last_checked_at, videos.last_checked_at)
  `).run(
    videoId,
    metadata.title,
    metadata.thumbnail,
    metadata.author,
    metadata.view_count,
    metadata.published_at,
    metadata.duration,
    availability,
    checkedAt
  );
}

async function refreshVideoMetadata(videoId: string) {
  const checkedAt = nowIso();
  const metadata = await fetchVideoMetadata(videoId);

  if (metadataIsAvailable(metadata)) {
    upsertVideo(videoId, metadata, checkedAt);
    return 'updated';
  }

  if (metadataIsUnavailable(metadata)) {
    markVideoUnavailable(videoId, checkedAt);
    return 'unavailable';
  }

  return 'skipped';
}

function refreshVideoMetadataInBackground(videoIds: string[]) {
  for (const videoId of videoIds) {
    if (!videoId || queuedMetadataRefreshIds.has(videoId)) continue;
    queuedMetadataRefreshIds.add(videoId);
    metadataRefreshQueue.push(videoId);
  }

  if (metadataRefreshQueue.length === 0 || metadataRefreshRunning) return;
  metadataRefreshRunning = true;

  (async () => {
    let updated = 0;
    let failed = 0;
    let total = 0;

    while (metadataRefreshQueue.length > 0) {
      const videoId = metadataRefreshQueue.shift();
      if (!videoId) continue;
      total++;

      try {
        const result = await refreshVideoMetadata(videoId);
        if (result === 'skipped') failed++;
        else updated++;
      } catch (error) {
        failed++;
        console.warn(`Metadata refresh skipped ${videoId}:`, error);
      } finally {
        queuedMetadataRefreshIds.delete(videoId);
      }
    }

    console.log(`Refreshed metadata for ${updated}/${total} queued videos; skipped ${failed}`);
  })()
    .catch((error) => console.error('Background metadata refresh failed:', error))
    .finally(() => {
      metadataRefreshRunning = false;
      if (metadataRefreshQueue.length > 0) refreshVideoMetadataInBackground([]);
    });
}

function enqueueAutoAssetsForVideos(videoIds: string[]) {
  const settings = getSummarySettings();
  const shouldRun = !!settings.auto_transcript_enabled
    || !!settings.auto_summary_enabled
    || !!settings.auto_tags_enabled;
  if (!shouldRun && autoAssetQueue.length === 0) return;

  for (const videoId of videoIds) {
    if (!videoId || queuedAutoAssetIds.has(videoId)) continue;
    queuedAutoAssetIds.add(videoId);
    autoAssetQueue.push(videoId);
  }

  if (autoAssetQueue.length === 0 || autoAssetRunning || !shouldRun) return;
  autoAssetRunning = true;

  (async () => {
    while (autoAssetQueue.length > 0) {
      const videoId = autoAssetQueue.shift();
      if (!videoId) continue;

      try {
        const currentSettings = getSummarySettings();
        const needsTranscript = !!currentSettings.auto_transcript_enabled
          || !!currentSettings.auto_summary_enabled
          || !!currentSettings.auto_tags_enabled;
        if (!needsTranscript) continue;

        await ensureTranscript(videoId);

        if (currentSettings.auto_summary_enabled) {
          await ensureSummary(videoId, normalizeSummaryMode(currentSettings.summary_mode));
        }

        if (currentSettings.auto_tags_enabled) {
          await ensureTags(videoId);
        }
      } catch (error) {
        console.warn(`Auto assets skipped ${videoId}:`, error);
      } finally {
        queuedAutoAssetIds.delete(videoId);
      }
    }
  })()
    .catch((error) => console.error('Auto asset queue failed:', error))
    .finally(() => {
      autoAssetRunning = false;
      if (autoAssetQueue.length > 0) enqueueAutoAssetsForVideos([]);
    });
}

async function ensureFreshVideo(videoId: string) {
  const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId) as any;
  if (existing && !videoNeedsMetadataRefresh(existing)) return existing;

  try {
    await refreshVideoMetadata(videoId);
  } catch (error) {
    if (existing) return existing;
    upsertVideo(videoId, toVideoMetadata(videoId), null);
  }

  return db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
}

function markVideoUnavailable(videoId: string, checkedAt: string) {
  db.prepare(`
    UPDATE videos
    SET availability = 'unavailable',
        last_checked_at = ?
    WHERE id = ?
  `).run(checkedAt, videoId);
}

function playlistVideoWhere(status: unknown) {
  if (status === 'all') return { sql: '', params: [] as unknown[] };
  if (status === 'missing') {
    return { sql: "AND pv.status IN ('removed_from_source', 'unavailable_on_youtube', 'removed', 'unavailable')", params: [] as unknown[] };
  }
  if (status === 'non_active') {
    return {
      sql: `AND pv.status IN (${nonActiveStatuses.map(() => '?').join(', ')})`,
      params: nonActiveStatuses as unknown[]
    };
  }
  if (typeof status === 'string' && filterableStatuses.includes(status)) {
    return { sql: 'AND pv.status = ?', params: [status] as unknown[] };
  }
  return { sql: "AND pv.status = 'active'", params: [] as unknown[] };
}

const playlistVideoSelect = `
  SELECT v.*, pv.sort_order, pv.added_at, pv.status, pv.last_seen_at, pv.missing_since,
         pv.unavailable_since, pv.last_checked_at, pv.youtube_removed_at,
         pv.youtube_cleanup_error, pv.moved_to_playlist_id, pv.moved_at,
         mp.name as moved_to_playlist_name, pv.rowid as pv_rowid,
         CASE WHEN vt.video_id IS NULL THEN 0 ELSE 1 END as has_transcript,
         CASE WHEN vt.segments_json IS NULL OR vt.segments_json = '' THEN 0 ELSE 1 END as has_timestamped_transcript,
         COALESCE(v.transcript_unavailable, 0) as transcript_unavailable,
         CASE WHEN vsp.video_id IS NULL THEN 0 ELSE 1 END as has_summary,
         CASE WHEN vsh.video_id IS NULL THEN 0 ELSE 1 END as has_html_summary,
         vsp.updated_at as summary_updated_at,
         vsh.updated_at as html_summary_updated_at,
         vt.fetched_at as transcript_fetched_at
  FROM videos v
  JOIN playlist_videos pv ON v.id = pv.video_id
  LEFT JOIN playlists mp ON mp.id = pv.moved_to_playlist_id
  LEFT JOIN video_transcripts vt ON vt.video_id = v.id
  LEFT JOIN video_summaries vsp ON vsp.video_id = v.id AND vsp.mode = 'plain'
  LEFT JOIN video_summaries vsh ON vsh.video_id = v.id AND vsh.mode = 'html'
`;

function getPlaylistVideos(input: {
  playlistId: unknown;
  whereSql?: string;
  params?: unknown[];
  orderBy?: string;
}) {
  const whereSql = input.whereSql || '';
  const orderBy = input.orderBy || 'pv.sort_order ASC, pv.rowid ASC';
  return db.prepare(`
    ${playlistVideoSelect}
    WHERE pv.playlist_id = ?
      ${whereSql}
    ORDER BY ${orderBy}
  `).all(input.playlistId, ...(input.params || []));
}

function normalizeYoutubePlaylistSource(value: unknown) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input) {
    return { source_type: 'manual', source_id: null, source_url: null };
  }

  let sourceId = '';
  let sourceUrl = '';
  try {
    const parsed = new URL(input);
    sourceId = parsed.searchParams.get('list') || '';
    sourceUrl = parsed.href;
  } catch {
    if (/^[a-zA-Z0-9_-]+$/.test(input)) {
      sourceId = input;
      sourceUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(input)}`;
    }
  }

  sourceId = sourceId.trim();
  if (!sourceId || !/^[a-zA-Z0-9_-]+$/.test(sourceId)) return null;
  return {
    source_type: 'youtube_playlist',
    source_id: sourceId,
    source_url: sourceUrl || `https://www.youtube.com/playlist?list=${encodeURIComponent(sourceId)}`
  };
}

router.get('/playlists', (req, res) => {
  const playlists = db.prepare(`
    SELECT p.*,
           COUNT(CASE WHEN pv.status = 'active' THEN 1 END) as video_count
    FROM playlists p
    LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(playlists);
});

router.get('/playlists/counts', (req, res) => {
  const counts = db.prepare(`
    SELECT p.id,
           COUNT(CASE WHEN pv.status = 'active' THEN 1 END) as video_count
    FROM playlists p
    LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
    GROUP BY p.id
  `).all();
  res.json(counts);
});

router.post('/playlists', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' });

  const info = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name.trim());
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(info.lastInsertRowid);
  res.json(playlist);
});

router.patch('/playlists/:id', (req, res) => {
  const { id } = req.params;
  const updates: string[] = [];
  const params: unknown[] = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
    const { name } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' });
    updates.push('name = ?');
    params.push(name.trim());
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'sourceUrl')) {
    const source = normalizeYoutubePlaylistSource(req.body.sourceUrl);
    if (!source) return res.status(400).json({ error: 'Valid YouTube playlist URL or list id is required' });
    if (source.source_id) {
      const existing = db.prepare(`
        SELECT id FROM playlists
        WHERE source_type = ? AND source_id = ? AND id != ?
      `).get(source.source_type, source.source_id, id) as any;
      if (existing) return res.status(409).json({ error: 'This YouTube playlist URL is already linked to another playlist' });
    }
    updates.push('source_type = ?', 'source_id = ?', 'source_url = ?');
    params.push(source.source_type, source.source_id, source.source_url);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No playlist changes provided' });

  db.prepare(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
  res.json(playlist);
});

router.delete('/playlists/:id', (req, res) => {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/playlists/:id/videos', (req, res) => {
  const filter = playlistVideoWhere(req.query.status);
  const videos = getPlaylistVideos({
    playlistId: req.params.id,
    whereSql: filter.sql,
    params: filter.params
  });

  res.json(videos);
});

router.get('/playlists/:id/missing', (req, res) => {
  const videos = getPlaylistVideos({
    playlistId: req.params.id,
    whereSql: "AND pv.status IN ('removed_from_source', 'unavailable_on_youtube', 'removed', 'unavailable')",
    orderBy: 'COALESCE(pv.unavailable_since, pv.missing_since, pv.last_checked_at) DESC'
  });

  res.json(videos);
});

router.get('/playlists/:id/videos/youtube-cleanup-pending', (req, res) => {
  const videos = getPlaylistVideos({
    playlistId: req.params.id,
    whereSql: "AND pv.status IN ('removed_by_user', 'moved_to_playlist') AND pv.youtube_removed_at IS NULL"
  });

  res.json(videos);
});

router.get('/summaries', (req, res) => {
  const summaries = db.prepare(`
    WITH generated_summaries AS (
      SELECT video_id,
             GROUP_CONCAT(mode) as summary_modes,
             MAX(updated_at) as latest_summary_updated_at,
             MAX(CASE WHEN mode = 'plain' THEN updated_at END) as summary_updated_at,
             MAX(CASE WHEN mode = 'html' THEN updated_at END) as html_summary_updated_at
      FROM video_summaries
      GROUP BY video_id
    )
    SELECT v.*,
           pv.playlist_id,
           p.name as playlist_name,
           pv.sort_order,
           pv.added_at,
           pv.status,
           pv.last_seen_at,
           pv.missing_since,
           pv.unavailable_since,
           pv.last_checked_at,
           pv.youtube_removed_at,
           pv.youtube_cleanup_error,
           pv.moved_to_playlist_id,
           pv.moved_at,
           mp.name as moved_to_playlist_name,
           pv.rowid as pv_rowid,
           CASE WHEN vt.video_id IS NULL THEN 0 ELSE 1 END as has_transcript,
           CASE WHEN vt.segments_json IS NULL OR vt.segments_json = '' THEN 0 ELSE 1 END as has_timestamped_transcript,
           COALESCE(v.transcript_unavailable, 0) as transcript_unavailable,
           CASE WHEN instr(',' || gs.summary_modes || ',', ',plain,') > 0 THEN 1 ELSE 0 END as has_summary,
           CASE WHEN instr(',' || gs.summary_modes || ',', ',html,') > 0 THEN 1 ELSE 0 END as has_html_summary,
           gs.summary_modes,
           gs.latest_summary_updated_at,
           gs.summary_updated_at,
           gs.html_summary_updated_at,
           vt.fetched_at as transcript_fetched_at
    FROM generated_summaries gs
    JOIN videos v ON v.id = gs.video_id
    JOIN playlist_videos pv ON pv.video_id = v.id
    JOIN playlists p ON p.id = pv.playlist_id
    LEFT JOIN playlists mp ON mp.id = pv.moved_to_playlist_id
    LEFT JOIN video_transcripts vt ON vt.video_id = v.id
    ORDER BY gs.latest_summary_updated_at DESC, pv.rowid DESC
  `).all();

  res.json(summaries);
});

router.post('/playlists/:id/videos', async (req, res) => {
  const videoId = normalizeVideoId(req.body.videoId);
  const { addedAt } = req.body;

  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const video = await ensureFreshVideo(videoId);
  const existing = db.prepare('SELECT status FROM playlist_videos WHERE playlist_id = ? AND video_id = ?')
    .get(req.params.id, videoId) as any;

  if (existing && existing.status === 'active') {
    return res.status(400).json({ error: 'Video already in playlist' });
  }

  db.prepare(`
    INSERT INTO playlist_videos (playlist_id, video_id, added_at, status, last_seen_at, missing_since, unavailable_since)
    VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), 'active', CURRENT_TIMESTAMP, NULL, NULL)
    ON CONFLICT(playlist_id, video_id) DO UPDATE SET
      status = 'active',
      last_seen_at = CURRENT_TIMESTAMP,
      missing_since = NULL,
      unavailable_since = NULL,
      youtube_removed_at = NULL,
      youtube_cleanup_error = NULL,
      moved_to_playlist_id = NULL,
      moved_at = NULL
  `).run(req.params.id, videoId, addedAt || null);

  if (videoNeedsMetadataRefresh(video)) {
    refreshVideoMetadataInBackground([videoId]);
  }
  enqueueAutoAssetsForVideos([videoId]);

  res.json({ success: true, video });
});

router.delete('/playlists/:id/videos/:videoId', (req, res) => {
  const videoId = normalizeVideoId(req.params.videoId);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  db.prepare(`
    UPDATE playlist_videos
    SET status = 'removed_by_user',
        missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
        last_checked_at = CURRENT_TIMESTAMP,
        youtube_removed_at = CASE WHEN status = 'active' THEN NULL ELSE youtube_removed_at END,
        youtube_cleanup_error = CASE WHEN status = 'active' THEN NULL ELSE youtube_cleanup_error END,
        moved_to_playlist_id = NULL,
        moved_at = NULL
    WHERE playlist_id = ? AND video_id = ?
  `).run(req.params.id, videoId);
  res.json({ success: true });
});

router.post('/playlists/:id/videos/:videoId/restore', (req, res) => {
  const videoId = normalizeVideoId(req.params.videoId);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const info = db.prepare(`
    UPDATE playlist_videos
    SET status = 'active',
        last_seen_at = CURRENT_TIMESTAMP,
        missing_since = NULL,
        unavailable_since = NULL,
        last_checked_at = CURRENT_TIMESTAMP,
        youtube_removed_at = NULL,
        youtube_cleanup_error = NULL,
        moved_to_playlist_id = NULL,
        moved_at = NULL
    WHERE playlist_id = ?
      AND video_id = ?
      AND status = 'removed_by_user'
  `).run(req.params.id, videoId);

  if (info.changes === 0) {
    const existing = db.prepare('SELECT status FROM playlist_videos WHERE playlist_id = ? AND video_id = ?')
      .get(req.params.id, videoId) as any;
    if (!existing) return res.status(404).json({ error: 'Video is not in this playlist' });
    if (existing.status === 'active') return res.json({ success: true, restored: false });
    return res.status(400).json({ error: 'Only videos removed by you can be restored' });
  }

  res.json({ success: true, restored: true });
});

router.post('/playlists/:id/videos/move', (req, res) => {
  const sourcePlaylistId = Number(req.params.id);
  const targetPlaylistId = Number(req.body.targetPlaylistId);
  const videoIds = Array.isArray(req.body.videoIds)
    ? Array.from(new Set(req.body.videoIds.map(normalizeVideoId).filter(Boolean))) as string[]
    : [];

  if (!Number.isInteger(sourcePlaylistId) || sourcePlaylistId <= 0) {
    return res.status(400).json({ error: 'Valid source playlist is required' });
  }
  if (!Number.isInteger(targetPlaylistId) || targetPlaylistId <= 0) {
    return res.status(400).json({ error: 'Valid target playlist is required' });
  }
  if (sourcePlaylistId === targetPlaylistId) {
    return res.status(400).json({ error: 'Target playlist must be different' });
  }
  if (videoIds.length === 0) {
    return res.status(400).json({ error: 'At least one valid videoId is required' });
  }

  const sourcePlaylist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(sourcePlaylistId);
  const targetPlaylist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(targetPlaylistId);
  if (!sourcePlaylist || !targetPlaylist) return res.status(404).json({ error: 'Playlist not found' });

  const tx = db.transaction(() => {
    let moved = 0;
    const movedIds: string[] = [];
    let sortOrder = Number((db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_sort_order
      FROM playlist_videos
      WHERE playlist_id = ?
    `).get(targetPlaylistId) as any).max_sort_order) + 1;

    for (const videoId of videoIds) {
      const link = db.prepare(`
        SELECT status
        FROM playlist_videos
        WHERE playlist_id = ? AND video_id = ?
      `).get(sourcePlaylistId, videoId) as any;
      if (!link || !['active', 'removed_by_user'].includes(link.status)) continue;

      db.prepare(`
        INSERT INTO playlist_videos (
          playlist_id, video_id, sort_order, status, added_at, last_seen_at,
          missing_since, unavailable_since, youtube_removed_at, youtube_cleanup_error,
          moved_to_playlist_id, moved_at
        )
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT(playlist_id, video_id) DO UPDATE SET
          sort_order = CASE WHEN playlist_videos.status = 'active' THEN playlist_videos.sort_order ELSE excluded.sort_order END,
          status = 'active',
          last_seen_at = CURRENT_TIMESTAMP,
          missing_since = NULL,
          unavailable_since = NULL,
          youtube_removed_at = NULL,
          youtube_cleanup_error = NULL,
          moved_to_playlist_id = NULL,
          moved_at = NULL
      `).run(targetPlaylistId, videoId, sortOrder);

      db.prepare(`
        UPDATE playlist_videos
        SET status = 'moved_to_playlist',
            moved_to_playlist_id = ?,
            moved_at = CURRENT_TIMESTAMP,
            missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
            last_checked_at = CURRENT_TIMESTAMP,
            youtube_removed_at = NULL,
            youtube_cleanup_error = NULL
        WHERE playlist_id = ?
          AND video_id = ?
          AND status IN ('active', 'removed_by_user')
      `).run(targetPlaylistId, sourcePlaylistId, videoId);

      moved++;
      movedIds.push(videoId);
      sortOrder++;
    }

    return { moved, movedIds };
  });

  const result = tx();
  res.json({ success: true, moved: result.moved, movedIds: result.movedIds });
});

router.post('/playlists/:id/videos/:videoId/youtube-cleanup', (req, res) => {
  const videoId = normalizeVideoId(req.params.videoId);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const result = typeof req.body.result === 'string' ? req.body.result : '';
  const error = typeof req.body.error === 'string' ? req.body.error.slice(0, 1000) : null;

  if (result === 'removed') {
    const info = db.prepare(`
      UPDATE playlist_videos
      SET youtube_removed_at = COALESCE(youtube_removed_at, CURRENT_TIMESTAMP),
          youtube_cleanup_error = NULL,
          last_checked_at = CURRENT_TIMESTAMP
      WHERE playlist_id = ?
        AND video_id = ?
        AND status IN ('removed_by_user', 'moved_to_playlist')
    `).run(req.params.id, videoId);

    return res.json({ success: true, updated: info.changes });
  }

  if (result === 'failed') {
    const info = db.prepare(`
      UPDATE playlist_videos
      SET youtube_cleanup_error = COALESCE(?, 'YouTube cleanup failed'),
          last_checked_at = CURRENT_TIMESTAMP
      WHERE playlist_id = ?
        AND video_id = ?
        AND status IN ('removed_by_user', 'moved_to_playlist')
    `).run(error, req.params.id, videoId);

    return res.json({ success: true, updated: info.changes });
  }

  return res.status(400).json({ error: 'result must be removed or failed' });
});

router.post('/sync/start', (req, res) => {
  const sourceType = typeof req.body.sourceType === 'string' ? req.body.sourceType.trim() : 'youtube_playlist';
  const sourceId = typeof req.body.sourceId === 'string' ? req.body.sourceId.trim() : '';
  const sourceUrl = typeof req.body.sourceUrl === 'string' ? req.body.sourceUrl.trim() : null;
  const requestedPlaylistId = Number(req.body.playlistId);

  if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });
  if (!Number.isInteger(requestedPlaylistId) || requestedPlaylistId <= 0) {
    return res.status(400).json({ error: 'Select a playlist before syncing' });
  }

  let playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(requestedPlaylistId) as any;
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (!playlist.source_id) return res.status(400).json({ error: 'Set the playlist URL in Management before syncing' });
  if (playlist.source_type !== sourceType || playlist.source_id !== sourceId) {
    return res.status(409).json({ error: 'Current YouTube page does not match the selected playlist URL' });
  }

  const runInfo = db.prepare(`
    INSERT INTO sync_runs (playlist_id, source_type, source_id, source_url)
    VALUES (?, ?, ?, ?)
  `).run(playlist.id, sourceType, sourceId, sourceUrl);
  const run = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runInfo.lastInsertRowid);

  res.json({ success: true, playlist, run });
});

router.post('/sync/:runId/batch', (req, res) => {
  const runId = Number(req.params.runId);
  const run = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runId) as any;
  if (!run || run.status !== 'running') return res.status(404).json({ error: 'Active sync run not found' });
  if (!Array.isArray(req.body.videos)) return res.status(400).json({ error: 'videos array is required' });

  const seen = new Map<string, SnapshotVideo>();
  for (const raw of req.body.videos as SnapshotVideo[]) {
    const id = normalizeVideoId(raw && raw.id);
    if (!id || seen.has(id)) continue;
    seen.set(id, { ...raw, id });
  }

  const metrics = { seen: 0, added: 0, reactivated: 0 };
  const timestamp = nowIso();

  const metadataRefreshVideoIds: string[] = [];

  const tx = db.transaction(() => {
    for (const snapshot of seen.values()) {
      const videoId = snapshot.id;
      const existingLink = db.prepare(`
        SELECT status, last_sync_run_id
        FROM playlist_videos
        WHERE playlist_id = ? AND video_id = ?
      `).get(run.playlist_id, videoId) as any;
      const isUserControlled = existingLink && ['removed_by_user', 'moved_to_playlist'].includes(existingLink.status);

      const metadata = toVideoMetadata(videoId, snapshot);
      upsertVideo(videoId, metadata, null);

      if (!existingLink) {
        metrics.added++;
        metadataRefreshVideoIds.push(videoId);
      } else if (existingLink.status !== 'active' && !isUserControlled) {
        metrics.reactivated++;
        metadataRefreshVideoIds.push(videoId);
      }
      if (!existingLink || Number(existingLink.last_sync_run_id) !== runId) metrics.seen++;

      db.prepare(`
        INSERT INTO playlist_videos (
          playlist_id, video_id, sort_order, status, added_at, last_seen_at,
          missing_since, unavailable_since, last_sync_run_id
        )
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, NULL, NULL, ?)
        ON CONFLICT(playlist_id, video_id) DO UPDATE SET
          sort_order = excluded.sort_order,
          status = CASE
            WHEN playlist_videos.status IN ('removed_by_user', 'moved_to_playlist') THEN playlist_videos.status
            ELSE 'active'
          END,
          last_seen_at = excluded.last_seen_at,
          missing_since = CASE
            WHEN playlist_videos.status IN ('removed_by_user', 'moved_to_playlist') THEN playlist_videos.missing_since
            ELSE NULL
          END,
          unavailable_since = CASE
            WHEN playlist_videos.status IN ('removed_by_user', 'moved_to_playlist') THEN playlist_videos.unavailable_since
            ELSE NULL
          END,
          last_sync_run_id = excluded.last_sync_run_id
      `).run(
        run.playlist_id,
        videoId,
        Number.isFinite(Number(snapshot.sortOrder)) ? Number(snapshot.sortOrder) : 0,
        timestamp,
        runId
      );
    }

    db.prepare(`
      UPDATE sync_runs
      SET seen_count = seen_count + ?,
          added_count = added_count + ?,
          reactivated_count = reactivated_count + ?
      WHERE id = ?
    `).run(metrics.seen, metrics.added, metrics.reactivated, runId);
  });

  tx();
  refreshVideoMetadataInBackground(metadataRefreshVideoIds);
  enqueueAutoAssetsForVideos(metadataRefreshVideoIds);
  res.json({ success: true, ...metrics });
});

router.post('/sync/:runId/finalize', async (req, res) => {
  const runId = Number(req.params.runId);
  const run = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runId) as any;
  if (!run || !['running', 'failed'].includes(run.status)) {
    return res.status(404).json({ error: 'Finalizable sync run not found' });
  }
  const skipMissingCheck = req.body && req.body.skipMissingCheck === true;

  const missing = skipMissingCheck ? [] : db.prepare(`
    SELECT pv.video_id, v.title, v.thumbnail, v.author, v.duration
    FROM playlist_videos pv
    JOIN videos v ON v.id = pv.video_id
    WHERE pv.playlist_id = ?
      AND pv.status = 'active'
      AND (pv.last_sync_run_id IS NULL OR pv.last_sync_run_id != ?)
  `).all(run.playlist_id, runId) as any[];

  const checkedAt = nowIso();
  let removed = 0;
  let unavailable = 0;
  let metadataCheckFailed = 0;

  for (const item of missing) {
    let metadata: VideoMetadata;
    try {
      metadata = await fetchVideoMetadata(item.video_id);
    } catch (error) {
      metadataCheckFailed++;
      console.warn(`Metadata check failed for ${item.video_id}:`, error);
      continue;
    }

    if (metadataIsAvailable(metadata)) {
      upsertVideo(item.video_id, metadata, checkedAt);
      db.prepare(`
        UPDATE playlist_videos
        SET status = 'removed_from_source',
            missing_since = COALESCE(missing_since, ?),
            unavailable_since = NULL,
            last_checked_at = ?
        WHERE playlist_id = ? AND video_id = ?
      `).run(checkedAt, checkedAt, run.playlist_id, item.video_id);
      removed++;
    } else if (metadataIsUnavailable(metadata)) {
      markVideoUnavailable(item.video_id, checkedAt);
      db.prepare(`
        UPDATE playlist_videos
        SET status = 'unavailable_on_youtube',
            missing_since = COALESCE(missing_since, ?),
            unavailable_since = COALESCE(unavailable_since, ?),
            last_checked_at = ?
        WHERE playlist_id = ? AND video_id = ?
      `).run(checkedAt, checkedAt, checkedAt, run.playlist_id, item.video_id);
      unavailable++;
    } else {
      metadataCheckFailed++;
    }
  }

  db.prepare(`
    UPDATE sync_runs
    SET status = 'completed',
        finished_at = ?,
        removed_count = ?,
        unavailable_count = ?,
        error = ?
    WHERE id = ?
  `).run(
    checkedAt,
    removed,
    unavailable,
    metadataCheckFailed > 0 ? `Metadata check failed for ${metadataCheckFailed} missing videos` : null,
    runId
  );

  db.prepare('UPDATE playlists SET last_synced_at = ? WHERE id = ?').run(checkedAt, run.playlist_id);

  const completedRun = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runId);
  res.json({ success: true, run: completedRun, missingChecked: missing.length, metadataCheckFailed });
});

router.post('/sync/:runId/fail', (req, res) => {
  const runId = Number(req.params.runId);
  const message = typeof req.body.error === 'string' ? req.body.error.slice(0, 1000) : 'Sync failed';
  const finishedAt = nowIso();

  const info = db.prepare(`
    UPDATE sync_runs
    SET status = 'failed',
        finished_at = ?,
        error = ?
    WHERE id = ?
      AND status = 'running'
  `).run(finishedAt, message, runId);

  if (info.changes === 0) return res.status(404).json({ error: 'Active sync run not found' });
  const run = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runId);
  res.json({ success: true, run });
});

router.get('/sync/:runId', (req, res) => {
  const run = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Sync run not found' });
  res.json(run);
});

router.get('/videos/:id/playlists', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const playlists = db.prepare(`
    SELECT p.* FROM playlists p
    JOIN playlist_videos pv ON p.id = pv.playlist_id
    WHERE pv.video_id = ?
      AND pv.status = 'active'
  `).all(videoId);
  res.json(playlists);
});

router.get('/summary-settings', (req, res) => {
  res.json(getSummarySettings());
});

router.put('/summary-settings', (req, res) => {
  res.json(updateSummarySettings({
    model: req.body.model,
    language: req.body.language,
    prompt: req.body.prompt,
    htmlModel: req.body.htmlModel,
    htmlPrompt: req.body.htmlPrompt,
    summaryMode: req.body.summaryMode,
    transcriptLanguages: req.body.transcriptLanguages,
    tagPrompt: req.body.tagPrompt,
    preferredTags: req.body.preferredTags,
    tagDisplayLimit: req.body.tagDisplayLimit,
    autoTranscriptEnabled: req.body.autoTranscriptEnabled,
    autoSummaryEnabled: req.body.autoSummaryEnabled,
    autoTagsEnabled: req.body.autoTagsEnabled
  }));
});

router.get('/videos/:id/summary/status', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });
  res.json(getSummaryStatus(videoId));
});

router.get('/videos/:id/summary', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });
  const settings = getSummarySettings();
  const mode = req.query.mode ? normalizeSummaryMode(req.query.mode) : normalizeSummaryMode(settings.summary_mode);

  const summary = getSummary(videoId, mode);
  if (!summary) return res.status(404).json({ error: 'Summary not found' });

  res.json({
    videoId,
    hasSummary: true,
    mode,
    language: summary.language,
    model: summary.model,
    updatedAt: summary.updated_at,
    summary: summary.summary
  });
});

router.post('/videos/:id/summary', async (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });
  const settings = getSummarySettings();
  const mode = req.body.mode || req.query.mode
    ? normalizeSummaryMode(req.body.mode || req.query.mode)
    : normalizeSummaryMode(settings.summary_mode);
  const force = req.body.force === true || req.query.force === 'true';

  try {
    const summary = await ensureSummary(videoId, mode, force);
    res.json({
      videoId,
      hasSummary: true,
      mode,
      language: summary.language,
      model: summary.model,
      updatedAt: summary.updated_at,
      summary: summary.summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate summary';
    res.status(message.includes('OPENROUTER_API_KEY') ? 500 : 502).json({ error: message });
  }
});

router.get('/summaries/events', (req, res) => {
  addSummaryEventClient(req, res);
});

router.get('/videos/:id/tags/status', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });
  res.json(getTagStatus(videoId));
});

router.get('/videos/:id/tags', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const tags = getTags(videoId);
  if (!tags || tags.tags.length === 0) return res.status(404).json({ error: 'Tags not found' });

  res.json({
    videoId,
    hasTags: true,
    tags: tags.tags,
    updatedAt: tags.updatedAt
  });
});

router.post('/videos/:id/tags', async (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });
  const force = req.body.force === true || req.query.force === 'true';

  try {
    const tags = await ensureTags(videoId, force);
    res.json({
      videoId,
      hasTags: true,
      tags: tags.tags,
      updatedAt: tags.updatedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate tags';
    res.status(message.includes('OPENROUTER_API_KEY') ? 500 : 502).json({ error: message });
  }
});

router.get('/videos/:id/transcript/status', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });
  res.json(getTranscriptStatus(videoId));
});

router.get('/videos/:id/transcript', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const transcript = getTranscript(videoId);
  if (!transcript) return res.status(404).json({ error: 'Transcript not found' });

  res.json({
    videoId,
    hasTranscript: true,
    hasTimestampedTranscript: !!transcript.segments_json,
    language: transcript.language,
    provider: transcript.provider,
    fetchedAt: transcript.fetched_at,
    text: transcript.text,
    timestampedText: transcript.timestamped_text || transcript.text,
    segments: transcript.segments_json ? JSON.parse(transcript.segments_json) : []
  });
});

router.post('/videos/:id/transcript', async (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const language = normalizeLanguage(req.body.language) || undefined;
  const force = req.body.force === true || req.query.force === 'true';

  try {
    const transcript = await ensureTranscript(videoId, language, force);
    res.json({
      videoId,
      hasTranscript: true,
      hasTimestampedTranscript: !!transcript.segments_json,
      language: transcript.language,
      provider: transcript.provider,
      fetchedAt: transcript.fetched_at,
      text: transcript.text,
      timestampedText: transcript.timestamped_text || transcript.text,
      segments: transcript.segments_json ? JSON.parse(transcript.segments_json) : []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch transcript';
    if (error instanceof TranscriptUnavailableError) {
      return res.status(409).json({
        error: message,
        transcriptUnavailable: true,
        transcriptUnavailableAt: error.unavailableAt,
        transcriptUnavailableReason: error.reason
      });
    }
    res.status(message.includes('FETCHTRANSCRIPT_API_KEY') ? 500 : 502).json({ error: message });
  }
});

router.get('/transcripts/events', (req, res) => {
  addTranscriptEventClient(req, res);
});

router.get('/videos/refresh-metadata/status', (req, res) => {
  res.json(metadataRefreshStatus);
});

router.get('/videos/:id', async (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const video = await ensureFreshVideo(videoId);
  res.json(video);
});

router.post('/videos/refresh-metadata', async (req, res) => {
  if (metadataRefreshStatus.running) {
    return res.json({
      ...metadataRefreshStatus,
      message: 'Metadata refresh is already running'
    });
  }

  const videos = db.prepare(`
    SELECT id
    FROM videos
    WHERE title IS NULL
      OR title = ''
      OR title = 'Unknown Title'
      OR (title != '' AND title NOT GLOB '*[^0-9]*')
      OR author IS NULL
      OR author = 'Unknown Author'
      OR duration = 0
      OR duration IS NULL
      OR published_at IS NULL
      OR published_at = ''
      OR availability != 'available'
  `).all() as any[];

  metadataRefreshStatus = {
    running: videos.length > 0,
    total: videos.length,
    processed: 0,
    updated: 0,
    failed: 0,
    startedAt: nowIso(),
    finishedAt: videos.length > 0 ? null : nowIso(),
    message: videos.length > 0 ? 'Refresh started in background' : 'No videos need metadata refresh'
  };

  res.json(metadataRefreshStatus);

  if (videos.length === 0) return;

  (async () => {
    for (const v of videos) {
      try {
        const result = await refreshVideoMetadata(v.id);
        if (result === 'skipped') metadataRefreshStatus.failed++;
        else metadataRefreshStatus.updated++;
      } catch (error) {
        metadataRefreshStatus.failed++;
        console.warn(`Refresh metadata skipped ${v.id}:`, error);
      } finally {
        metadataRefreshStatus.processed++;
      }
    }

    metadataRefreshStatus.running = false;
    metadataRefreshStatus.finishedAt = nowIso();
    metadataRefreshStatus.message = `Refreshed metadata for ${metadataRefreshStatus.updated}/${videos.length} videos; skipped ${metadataRefreshStatus.failed}`;
    console.log(metadataRefreshStatus.message);
  })().catch((error) => {
    metadataRefreshStatus.running = false;
    metadataRefreshStatus.finishedAt = nowIso();
    metadataRefreshStatus.message = error instanceof Error ? error.message : 'Refresh metadata failed';
    console.error('Refresh metadata failed:', error);
  });
});

export default router;
