import { Router } from 'express';
import db from '../db';
import { getActiveVideoPlaylists } from '../lib/playlist-videos';
import {
  ensureFreshVideo,
  getMetadataRefreshStatus,
  startFullMetadataRefresh
} from '../services/metadata-refresh';
import { normalizeVideoId } from '../validation';

const router = Router();

router.get('/videos/refresh-metadata/status', (req, res) => {
  res.json(getMetadataRefreshStatus());
});

router.post('/videos/refresh-metadata', (req, res) => {
  res.json(startFullMetadataRefresh());
});

router.get('/videos/:id/playlists', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  res.json(getActiveVideoPlaylists(videoId));
});

router.get('/videos/:id/storage-state', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
  res.json({
    videoId,
    exists: !!video,
    playlists: getActiveVideoPlaylists(videoId)
  });
});

router.get('/videos/:id', async (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const video = await ensureFreshVideo(videoId);
  res.json(video);
});

export default router;
