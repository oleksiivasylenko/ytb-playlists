import { Router } from 'express';
import db from '../db';
import { ensureTranscript, TranscriptUnavailableError } from '../transcripts';
import {
  addSummaryEventClient,
  askVideoQuestion,
  ensureSummary,
  ensureTags,
  getSummary,
  getSummarySettings,
  getSummaryStatus,
  getTags,
  getTagStatus,
  normalizeSummaryMode,
  updateSummarySettings
} from '../summaries';
import { askRequestSchema, normalizeVideoId } from '../validation';

const router = Router();

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
    askModel: req.body.askModel,
    askPrompt: req.body.askPrompt,
    preferredTags: req.body.preferredTags,
    tagDisplayLimit: req.body.tagDisplayLimit,
    autoTranscriptEnabled: req.body.autoTranscriptEnabled,
    autoSummaryEnabled: req.body.autoSummaryEnabled,
    autoTagsEnabled: req.body.autoTagsEnabled
  }));
});

router.post('/videos/:id/ask', async (req, res) => {
  const videoId = normalizeVideoId(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Valid videoId is required' });

  const payload = askRequestSchema.parse(req.body);
  if (!payload.question) return res.status(400).json({ error: 'Question is required' });

  try {
    let transcriptText = payload.transcript;

    if (payload.includeTranscript && !transcriptText.trim()) {
      const transcript = await ensureTranscript(videoId);
      transcriptText = transcript.timestamped_text || transcript.text;
    }

    const result = await askVideoQuestion({
      videoId,
      question: payload.question,
      comments: payload.comments,
      includeTranscript: payload.includeTranscript,
      transcript: transcriptText,
      title: payload.title,
      author: payload.author,
      expectedCommentCount: payload.expectedCommentCount
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ask about video';
    if (error instanceof TranscriptUnavailableError) {
      return res.status(409).json({
        error: message,
        transcriptUnavailable: true,
        transcriptUnavailableAt: error.unavailableAt,
        transcriptUnavailableReason: error.reason
      });
    }
    res.status(message.includes('OPENROUTER_API_KEY') || message.includes('FETCHTRANSCRIPT_API_KEY') ? 500 : 502).json({ error: message });
  }
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
    console.error(`Failed to generate summary for ${videoId} (${mode}):`, error);
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

export default router;
