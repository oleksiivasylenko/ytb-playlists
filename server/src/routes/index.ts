import { Router } from 'express';
import playlistsRouter from './playlists';
import syncRouter from './sync';
import videosRouter from './videos';
import summariesRouter from './summaries';
import transcriptsRouter from './transcripts';
import channelCacheRouter from './channel-cache';
import dictationRouter from './dictation';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use(playlistsRouter);
router.use(syncRouter);
router.use(summariesRouter);
router.use(transcriptsRouter);
router.use(videosRouter);
router.use(channelCacheRouter);
router.use(dictationRouter);

export default router;
