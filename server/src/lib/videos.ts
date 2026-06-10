import db from '../db';
import { type VideoMetadata } from '../youtube';

export type SnapshotVideo = {
  id: string;
  title?: string;
  thumbnail?: string;
  author?: string;
  duration?: number;
  sortOrder?: number;
};

export function isKnownTitle(title: unknown) {
  if (typeof title !== 'string') return false;
  const text = title.trim();
  return text !== '' && text !== 'Unknown Title' && !/^\d+$/.test(text);
}

export function metadataIsAvailable(metadata: Pick<VideoMetadata, 'title'>) {
  return isKnownTitle(metadata.title);
}

export function metadataIsUnavailable(metadata: Pick<VideoMetadata, 'availability'>) {
  return metadata.availability === 'unavailable';
}

export function videoNeedsMetadataRefresh(video: Partial<VideoMetadata> | null | undefined) {
  if (!video) return true;
  return !isKnownTitle(video.title)
    || !video.author
    || video.author === 'Unknown Author'
    || !video.duration
    || !video.published_at
    || video.availability !== 'available';
}

export function toVideoMetadata(videoId: string, input: Partial<SnapshotVideo> = {}): VideoMetadata {
  return {
    title: isKnownTitle(input.title) ? String(input.title).trim() : 'Unknown Title',
    thumbnail: typeof input.thumbnail === 'string' && input.thumbnail.trim()
      ? input.thumbnail.trim()
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    author: typeof input.author === 'string' && input.author.trim() ? input.author.trim() : 'Unknown Author',
    view_count: 0,
    published_at: null,
    duration: Number.isFinite(Number(input.duration)) ? Number(input.duration) : 0,
    availability: 'unknown'
  };
}

export function upsertVideo(videoId: string, metadata: VideoMetadata, checkedAt: string | null) {
  const availability = metadataIsAvailable(metadata)
    ? 'available'
    : metadataIsUnavailable(metadata) ? 'unavailable' : 'unknown';
  db.prepare(`
    INSERT INTO videos (id, title, thumbnail, author, view_count, published_at, duration, availability, last_checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = CASE WHEN excluded.title != 'Unknown Title' THEN excluded.title ELSE videos.title END,
      thumbnail = CASE WHEN excluded.thumbnail IS NOT NULL AND excluded.thumbnail != '' THEN excluded.thumbnail ELSE videos.thumbnail END,
      author = CASE WHEN excluded.author != 'Unknown Author' THEN excluded.author ELSE videos.author END,
      view_count = CASE WHEN excluded.view_count > 0 THEN excluded.view_count ELSE videos.view_count END,
      published_at = COALESCE(excluded.published_at, videos.published_at),
      duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE videos.duration END,
      availability = CASE
        WHEN excluded.availability = 'available' THEN 'available'
        WHEN excluded.availability = 'unavailable' THEN 'unavailable'
        ELSE videos.availability
      END,
      last_checked_at = COALESCE(excluded.last_checked_at, videos.last_checked_at)
  `).run(
    videoId,
    metadata.title,
    metadata.thumbnail,
    metadata.author,
    metadata.view_count,
    metadata.published_at,
    metadata.duration,
    availability,
    checkedAt
  );
}

export function markVideoUnavailable(videoId: string, checkedAt: string) {
  db.prepare(`
    UPDATE videos
    SET availability = 'unavailable',
        last_checked_at = ?
    WHERE id = ?
  `).run(checkedAt, videoId);
}
