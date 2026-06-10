import { Router } from 'express';
import db from '../db';
import { getPlaylistVideos, playlistVideoWhere } from '../lib/playlist-videos';
import { videoNeedsMetadataRefresh } from '../lib/videos';
import { ensureFreshVideo, refreshVideoMetadataInBackground } from '../services/metadata-refresh';
import { enqueueAutoAssetsForVideos } from '../services/auto-assets';
import {
  moveVideosSchema,
  normalizePlaylistName,
  normalizeVideoId,
  normalizeYoutubePlaylistSource,
  youtubeCleanupSchema
} from '../validation';

const router = Router();

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
  const name = normalizePlaylistName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const info = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(info.lastInsertRowid);
  res.json(playlist);
});

router.patch('/playlists/:id', (req, res) => {
  const { id } = req.params;
  const updates: string[] = [];
  const params: unknown[] = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
    const name = normalizePlaylistName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    updates.push('name = ?');
    params.push(name);
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

router.get('/playlists/:id/videos/youtube-cleanup-candidates', (req, res) => {
  const videos = getPlaylistVideos({
    playlistId: req.params.id,
    whereSql: `AND pv.status IN ('removed_by_user', 'moved_to_playlist')
      AND (
        pv.youtube_removed_at IS NULL
        OR (
          pv.youtube_removed_at IS NOT NULL
          AND pv.last_seen_at IS NOT NULL
          AND julianday(pv.last_seen_at) > julianday(pv.youtube_removed_at)
          AND (p.last_synced_at IS NULL OR julianday(p.last_synced_at) <= julianday(pv.last_seen_at))
        )
      )`
  });

  res.json(videos);
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
    WHERE playlist_id = ?
      AND video_id = ?
      AND status IN ('active', 'removed_from_source', 'removed', 'unavailable_on_youtube', 'unavailable')
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
  const { targetPlaylistId, videoIds } = moveVideosSchema.parse(req.body);

  if (!Number.isInteger(sourcePlaylistId) || sourcePlaylistId <= 0) {
    return res.status(400).json({ error: 'Valid source playlist is required' });
  }
  if (!targetPlaylistId) {
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

  const { result, error } = youtubeCleanupSchema.parse(req.body);

  if (result === 'removed') {
    const info = db.prepare(`
      UPDATE playlist_videos
      SET youtube_removed_at = CURRENT_TIMESTAMP,
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

export default router;
