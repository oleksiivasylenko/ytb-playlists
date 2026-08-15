import path from 'path';
import express, { Router } from 'express';
import db from '../db';
import { getSummary, normalizeSummaryMode } from '../summaries';
import { normalizeVideoId } from '../validation';

type PublicVideo = {
  title: string | null;
  author: string | null;
};

const router = Router();
const publicDirectory = path.join(__dirname, '..', '..', 'public');

router.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

router.use('/assets', express.static(publicDirectory, {
  index: false,
  maxAge: '1h'
}));

router.get('/summaries/:id', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).type('text').send('Valid videoId is required');
  res.sendFile(path.join(publicDirectory, 'summary.html'));
});

router.get('/summaries/:id/data', (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const mode = normalizeSummaryMode(req.query.mode);
  const summary = getSummary(videoId, mode);
  if (!summary) return res.status(404).json({ error: 'Summary not found' });

  const video = db.prepare('SELECT title, author FROM videos WHERE id = ?').get(videoId) as PublicVideo | undefined;
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  res.json({
    videoId,
    title: video?.title || videoId,
    author: video?.author || '',
    mode,
    language: summary.language,
    updatedAt: summary.updated_at,
    summary: summary.summary
  });
});

export default router;
