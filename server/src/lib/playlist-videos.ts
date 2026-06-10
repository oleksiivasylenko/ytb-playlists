import db from '../db';

export const nonActiveStatuses = [
  'removed_from_source',
  'unavailable_on_youtube',
  'removed_by_user',
  'moved_to_playlist',
  'removed',
  'unavailable'
];

export const filterableStatuses = ['active', ...nonActiveStatuses];

export function playlistVideoWhere(status: unknown) {
  if (status === 'all') return { sql: '', params: [] as unknown[] };
  if (status === 'missing') {
    return { sql: "AND pv.status IN ('removed_from_source', 'unavailable_on_youtube', 'removed', 'unavailable')", params: [] as unknown[] };
  }
  if (status === 'non_active') {
    return {
      sql: `AND pv.status IN (${nonActiveStatuses.map(() => '?').join(', ')})`,
      params: nonActiveStatuses as unknown[]
    };
  }
  if (typeof status === 'string' && filterableStatuses.includes(status)) {
    return { sql: 'AND pv.status = ?', params: [status] as unknown[] };
  }
  return { sql: "AND pv.status = 'active'", params: [] as unknown[] };
}

export const playlistVideoSelect = `
  SELECT v.*, pv.sort_order, pv.added_at, pv.status, pv.last_seen_at, pv.missing_since,
         pv.unavailable_since, pv.last_checked_at, pv.youtube_removed_at,
         pv.youtube_cleanup_error, pv.moved_to_playlist_id, pv.moved_at,
         p.last_synced_at as playlist_last_synced_at,
         mp.name as moved_to_playlist_name, pv.rowid as pv_rowid,
         CASE
           WHEN pv.status IN ('removed_by_user', 'moved_to_playlist')
             AND pv.youtube_removed_at IS NOT NULL
             AND pv.last_seen_at IS NOT NULL
             AND julianday(pv.last_seen_at) > julianday(pv.youtube_removed_at)
             AND (p.last_synced_at IS NULL OR julianday(p.last_synced_at) <= julianday(pv.last_seen_at))
           THEN 1 ELSE 0
         END as youtube_cleanup_reappeared,
         CASE WHEN vt.video_id IS NULL THEN 0 ELSE 1 END as has_transcript,
         CASE WHEN vt.segments_json IS NULL OR vt.segments_json = '' THEN 0 ELSE 1 END as has_timestamped_transcript,
         COALESCE(v.transcript_unavailable, 0) as transcript_unavailable,
         CASE WHEN vsp.video_id IS NULL THEN 0 ELSE 1 END as has_summary,
         CASE WHEN vsh.video_id IS NULL THEN 0 ELSE 1 END as has_html_summary,
         vsp.updated_at as summary_updated_at,
         vsh.updated_at as html_summary_updated_at,
         vt.fetched_at as transcript_fetched_at
  FROM videos v
  JOIN playlist_videos pv ON v.id = pv.video_id
  JOIN playlists p ON p.id = pv.playlist_id
  LEFT JOIN playlists mp ON mp.id = pv.moved_to_playlist_id
  LEFT JOIN video_transcripts vt ON vt.video_id = v.id
  LEFT JOIN video_summaries vsp ON vsp.video_id = v.id AND vsp.mode = 'plain'
  LEFT JOIN video_summaries vsh ON vsh.video_id = v.id AND vsh.mode = 'html'
`;

export function getPlaylistVideos(input: {
  playlistId: unknown;
  whereSql?: string;
  params?: unknown[];
  orderBy?: string;
}) {
  const whereSql = input.whereSql || '';
  const orderBy = input.orderBy || 'pv.sort_order ASC, pv.rowid ASC';
  return db.prepare(`
    ${playlistVideoSelect}
    WHERE pv.playlist_id = ?
      ${whereSql}
    ORDER BY ${orderBy}
  `).all(input.playlistId, ...(input.params || []));
}

export function getActiveVideoPlaylists(videoId: string) {
  return db.prepare(`
    SELECT p.* FROM playlists p
    JOIN playlist_videos pv ON p.id = pv.playlist_id
    WHERE pv.video_id = ?
      AND pv.status = 'active'
  `).all(videoId);
}
