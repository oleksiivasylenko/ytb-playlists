import { ensureTranscript } from '../transcripts';
import {
  ensureSummary,
  ensureTags,
  getSummarySettings,
  normalizeSummaryMode
} from '../summaries';

const queue: string[] = [];
const queuedIds = new Set<string>();
let running = false;

export function enqueueAutoAssetsForVideos(videoIds: string[]) {
  const settings = getSummarySettings();
  const shouldRun = !!settings.auto_transcript_enabled
    || !!settings.auto_summary_enabled
    || !!settings.auto_tags_enabled;
  if (!shouldRun && queue.length === 0) return;

  for (const videoId of videoIds) {
    if (!videoId || queuedIds.has(videoId)) continue;
    queuedIds.add(videoId);
    queue.push(videoId);
  }

  if (queue.length === 0 || running || !shouldRun) return;
  running = true;

  (async () => {
    while (queue.length > 0) {
      const videoId = queue.shift();
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
        queuedIds.delete(videoId);
      }
    }
  })()
    .catch((error) => console.error('Auto asset queue failed:', error))
    .finally(() => {
      running = false;
      if (queue.length > 0) enqueueAutoAssetsForVideos([]);
    });
}
