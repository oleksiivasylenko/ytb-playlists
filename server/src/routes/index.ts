import { Router } from 'express';
import playlistsRouter from './playlists';
import syncRouter from './sync';
import videosRouter from './videos';
import summariesRouter from './summaries';
import transcriptsRouter from './transcripts';

const router = Router();

router.use(playlistsRouter);
router.use(syncRouter);
router.use(summariesRouter);
router.use(transcriptsRouter);
router.use(videosRouter);

export default router;
