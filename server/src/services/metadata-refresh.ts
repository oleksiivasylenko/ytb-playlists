import db from '../db';
import { fetchVideoMetadata } from '../youtube';
import { nowIso } from '../lib/time';
import {
  markVideoUnavailable,
  metadataIsAvailable,
  metadataIsUnavailable,
  toVideoMetadata,
  upsertVideo,
  videoNeedsMetadataRefresh
} from '../lib/videos';

export type MetadataRefreshStatus = {
  running: boolean;
  total: number;
  processed: number;
  updated: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
};

const queue: string[] = [];
const queuedIds = new Set<string>();
let queueRunning = false;

let fullRefreshStatus: MetadataRefreshStatus = {
  running: false,
  total: 0,
  processed: 0,
  updated: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  message: ''
};

export async function refreshVideoMetadata(videoId: string) {
  const checkedAt = nowIso();
  const metadata = await fetchVideoMetadata(videoId);

  if (metadataIsAvailable(metadata)) {
    upsertVideo(videoId, metadata, checkedAt);
    return 'updated';
  }

  if (metadataIsUnavailable(metadata)) {
    markVideoUnavailable(videoId, checkedAt);
    return 'unavailable';
  }

  return 'skipped';
}

export function refreshVideoMetadataInBackground(videoIds: string[]) {
  for (const videoId of videoIds) {
    if (!videoId || queuedIds.has(videoId)) continue;
    queuedIds.add(videoId);
    queue.push(videoId);
  }

  if (queue.length === 0 || queueRunning) return;
  queueRunning = true;

  (async () => {
    let updated = 0;
    let failed = 0;
    let total = 0;

    while (queue.length > 0) {
      const videoId = queue.shift();
      if (!videoId) continue;
      total++;

      try {
        const result = await refreshVideoMetadata(videoId);
        if (result === 'skipped') failed++;
        else updated++;
      } catch (error) {
        failed++;
        console.warn(`Metadata refresh skipped ${videoId}:`, error);
      } finally {
        queuedIds.delete(videoId);
      }
    }

    console.log(`Refreshed metadata for ${updated}/${total} queued videos; skipped ${failed}`);
  })()
    .catch((error) => console.error('Background metadata refresh failed:', error))
    .finally(() => {
      queueRunning = false;
      if (queue.length > 0) refreshVideoMetadataInBackground([]);
    });
}

export async function ensureFreshVideo(videoId: string) {
  const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId) as any;
  if (existing && !videoNeedsMetadataRefresh(existing)) return existing;

  try {
    await refreshVideoMetadata(videoId);
  } catch (error) {
    if (existing) return existing;
    upsertVideo(videoId, toVideoMetadata(videoId), null);
  }

  return db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
}

export function getMetadataRefreshStatus() {
  return fullRefreshStatus;
}

export function startFullMetadataRefresh() {
  if (fullRefreshStatus.running) {
    return {
      ...fullRefreshStatus,
      message: 'Metadata refresh is already running'
    };
  }

  const videos = db.prepare(`
    SELECT id
    FROM videos
    WHERE title IS NULL
      OR title = ''
      OR title = 'Unknown Title'
      OR (title != '' AND title NOT GLOB '*[^0-9]*')
      OR author IS NULL
      OR author = 'Unknown Author'
      OR duration = 0
      OR duration IS NULL
      OR published_at IS NULL
      OR published_at = ''
      OR availability != 'available'
  `).all() as { id: string }[];

  fullRefreshStatus = {
    running: videos.length > 0,
    total: videos.length,
    processed: 0,
    updated: 0,
    failed: 0,
    startedAt: nowIso(),
    finishedAt: videos.length > 0 ? null : nowIso(),
    message: videos.length > 0 ? 'Refresh started in background' : 'No videos need metadata refresh'
  };

  if (videos.length === 0) return fullRefreshStatus;

  (async () => {
    for (const video of videos) {
      try {
        const result = await refreshVideoMetadata(video.id);
        if (result === 'skipped') fullRefreshStatus.failed++;
        else fullRefreshStatus.updated++;
      } catch (error) {
        fullRefreshStatus.failed++;
        console.warn(`Refresh metadata skipped ${video.id}:`, error);
      } finally {
        fullRefreshStatus.processed++;
      }
    }

    fullRefreshStatus.running = false;
    fullRefreshStatus.finishedAt = nowIso();
    fullRefreshStatus.message = `Refreshed metadata for ${fullRefreshStatus.updated}/${videos.length} videos; skipped ${fullRefreshStatus.failed}`;
    console.log(fullRefreshStatus.message);
  })().catch((error) => {
    fullRefreshStatus.running = false;
    fullRefreshStatus.finishedAt = nowIso();
    fullRefreshStatus.message = error instanceof Error ? error.message : 'Refresh metadata failed';
    console.error('Refresh metadata failed:', error);
  });

  return fullRefreshStatus;
}
