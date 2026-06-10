import { Router } from 'express';
import db from '../db';
import { nowIso } from '../lib/time';
import { toVideoMetadata, upsertVideo, type SnapshotVideo } from '../lib/videos';
import { refreshVideoMetadataInBackground } from '../services/metadata-refresh';
import { verifyMissingAvailabilityInBackground } from '../services/availability';
import { enqueueAutoAssetsForVideos } from '../services/auto-assets';
import { normalizeVideoId, syncFailSchema, syncStartSchema } from '../validation';

const router = Router();

router.post('/sync/start', (req, res) => {
  const { sourceType, sourceId, sourceUrl, playlistId } = syncStartSchema.parse(req.body);

  if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });
  if (!playlistId) {
    return res.status(400).json({ error: 'Select a playlist before syncing' });
  }

  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as any;
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
    SELECT pv.video_id, v.availability
    FROM playlist_videos pv
    JOIN videos v ON v.id = pv.video_id
    WHERE pv.playlist_id = ?
      AND pv.status = 'active'
      AND (pv.last_sync_run_id IS NULL OR pv.last_sync_run_id != ?)
  `).all(run.playlist_id, runId) as any[];

  const checkedAt = nowIso();
  const unavailable = missing.filter(item => item.availability === 'unavailable').length;
  const removed = missing.length - unavailable;
  const verificationIds = missing
    .filter(item => item.availability !== 'unavailable')
    .map(item => item.video_id)
    .filter(Boolean);

  if (missing.length > 0) {
    db.prepare(`
      UPDATE playlist_videos
      SET status = CASE
            WHEN video_id IN (SELECT id FROM videos WHERE availability = 'unavailable') THEN 'unavailable_on_youtube'
            ELSE 'removed_from_source'
          END,
          missing_since = COALESCE(missing_since, ?),
          unavailable_since = CASE
            WHEN video_id IN (SELECT id FROM videos WHERE availability = 'unavailable') THEN COALESCE(unavailable_since, ?)
            ELSE NULL
          END,
          last_checked_at = ?
      WHERE playlist_id = ?
        AND status = 'active'
        AND (last_sync_run_id IS NULL OR last_sync_run_id != ?)
    `).run(checkedAt, checkedAt, checkedAt, run.playlist_id, runId);
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
    null,
    runId
  );

  db.prepare('UPDATE playlists SET last_synced_at = ? WHERE id = ?').run(checkedAt, run.playlist_id);
  if (verificationIds.length > 0) {
    verifyMissingAvailabilityInBackground(runId, run.playlist_id, verificationIds);
  }

  const completedRun = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runId);
  res.json({
    success: true,
    run: completedRun,
    missingChecked: missing.length,
    metadataCheckFailed: 0,
    availabilityVerificationQueued: verificationIds.length
  });
});

router.post('/sync/:runId/fail', (req, res) => {
  const runId = Number(req.params.runId);
  const { error: message } = syncFailSchema.parse(req.body);
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

export default router;
