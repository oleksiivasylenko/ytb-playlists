import { Router } from 'express';
import { DictationError, parseDictationAudio, transcribeDictation } from '../services/dictation';

const router = Router();

router.post('/dictation/transcribe', async (req, res) => {
  const controller = new AbortController();
  const cancel = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', cancel);

  try {
    const audio = parseDictationAudio(req.body);
    const result = await transcribeDictation(audio, controller.signal);
    if (!res.destroyed) res.json(result);
  } catch (error) {
    if (res.destroyed) return;
    const status = error instanceof DictationError ? error.status : 502;
    const message = error instanceof DictationError ? error.message : 'Audio transcription failed. Please try again.';
    res.status(status).json({ error: message });
  } finally {
    res.off('close', cancel);
  }
});

export default router;
