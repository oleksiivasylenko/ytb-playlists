import db from '../db';
import { fetchVideoMetadata } from '../youtube';
import { nowIso } from '../lib/time';
import {
  markVideoUnavailable,
  metadataIsAvailable,
  metadataIsUnavailable,
  upsertVideo
} from '../lib/videos';

type MissingAvailabilityItem = {
  runId: number;
  playlistId: number;
  videoId: string;
};

const queue: MissingAvailabilityItem[] = [];
const queuedKeys = new Set<string>();
let running = false;

export function verifyMissingAvailabilityInBackground(runId: number, playlistId: number, videoIds: string[]) {
  for (const videoId of videoIds) {
    if (!videoId) continue;
    const key = `${playlistId}:${videoId}`;
    if (queuedKeys.has(key)) continue;
    queuedKeys.add(key);
    queue.push({ runId, playlistId, videoId });
  }

  if (queue.length === 0 || running) return;
  running = true;

  (async () => {
    let checked = 0;
    let unavailable = 0;
    let failed = 0;

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      checked++;

      try {
        const checkedAt = nowIso();
        const metadata = await fetchVideoMetadata(item.videoId);

        if (metadataIsAvailable(metadata)) {
          upsertVideo(item.videoId, metadata, checkedAt);
        } else if (metadataIsUnavailable(metadata)) {
          markVideoUnavailable(item.videoId, checkedAt);
          const info = db.prepare(`
            UPDATE playlist_videos
            SET status = 'unavailable_on_youtube',
                unavailable_since = COALESCE(unavailable_since, ?),
                last_checked_at = ?
            WHERE playlist_id = ?
              AND video_id = ?
              AND status = 'removed_from_source'
          `).run(checkedAt, checkedAt, item.playlistId, item.videoId);

          if (info.changes > 0) {
            unavailable += info.changes;
            db.prepare(`
              UPDATE sync_runs
              SET removed_count = CASE
                    WHEN removed_count >= ? THEN removed_count - ?
                    ELSE 0
                  END,
                  unavailable_count = unavailable_count + ?
              WHERE id = ?
            `).run(info.changes, info.changes, info.changes, item.runId);
          }
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.warn(`Missing availability verification skipped ${item.videoId}:`, error);
      } finally {
        queuedKeys.delete(`${item.playlistId}:${item.videoId}`);
      }
    }

    console.log(`Verified availability for ${checked} missing videos; unavailable ${unavailable}; skipped ${failed}`);
  })()
    .catch((error) => console.error('Missing availability verification failed:', error))
    .finally(() => {
      running = false;
      if (queue.length > 0) verifyMissingAvailabilityInBackground(runId, playlistId, []);
    });
}
