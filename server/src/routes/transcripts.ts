import { Router } from 'express';
import {
  addTranscriptEventClient,
  ensureTranscript,
  getTranscript,
  getTranscriptStatus,
  TranscriptUnavailableError
} from '../transcripts';
import { normalizeLanguage, normalizeVideoId } from '../validation';

const router = Router();

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

export default router;
