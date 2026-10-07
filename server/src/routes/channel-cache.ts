import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import db from '../db';

const channelId = z.string().regex(/^UC[\w-]{22}$/);
const videoId = z.string().regex(/^[\w-]{11}$/);
const timestamp = z.number().finite().nonnegative().refine(value => value <= Date.now() + 86400000);
const date = z.string().refine(value => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value));
const videoSchema = z.object({
  id: videoId, title: z.string().max(500), age: z.string().max(120), observedAt: timestamp,
  date, views: z.string().max(100), duration: z.string().max(40)
}).strict();
const snapshotSchema = z.object({
  sort: z.number().int().min(0).max(2), startedAt: timestamp, runId: z.string().min(1).max(100),
  complete: z.boolean(), ids: z.array(videoId).max(100000)
}).strict();
const batchSchema = z.object({
  generation: z.number().int().nonnegative(), title: z.string().max(300),
  videos: z.array(videoSchema).max(500), snapshots: z.array(snapshotSchema).max(3)
}).strict();
type Video = z.infer<typeof videoSchema>;
type Snapshot = z.infer<typeof snapshotSchema>;
type Channel = { id: string; title: string; generation: number; revision: number; updatedAt: number; deletedAt: number; count: number; bytes: number };
type Stored = { payload: string };

export function createChannelCacheRouter(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_cache_channels (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL DEFAULT 0, deletedAt INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS channel_cache_videos (
      channelId TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL,
      PRIMARY KEY (channelId, id), FOREIGN KEY (channelId) REFERENCES channel_cache_channels(id)
    );
    CREATE INDEX IF NOT EXISTS channel_cache_video_changes ON channel_cache_videos(channelId, revision);
    CREATE TABLE IF NOT EXISTS channel_cache_snapshots (
      channelId TEXT NOT NULL, sort INTEGER NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL,
      count INTEGER NOT NULL, complete INTEGER NOT NULL, startedAt INTEGER NOT NULL,
      PRIMARY KEY (channelId, sort), FOREIGN KEY (channelId) REFERENCES channel_cache_channels(id)
    );
  `);
  const router = Router();
  const read = (id: string) => database.prepare('SELECT * FROM channel_cache_channels WHERE id = ?').get(id) as Channel | undefined;
  const ensure = (id: string, title = id) => {
    database.prepare('INSERT OR IGNORE INTO channel_cache_channels (id, title) VALUES (?, ?)').run(id, title);
    return read(id)!;
  };
  const stats = (item: Channel) => ({
    ...item, url: `https://www.youtube.com/channel/${item.id}/videos`,
    snapshots: database.prepare('SELECT sort, complete, startedAt, count FROM channel_cache_snapshots WHERE channelId = ?').all(item.id)
  });

  router.get('/channel-cache', (_req, res) => {
    res.json({ channels: (database.prepare('SELECT * FROM channel_cache_channels ORDER BY id').all() as Channel[]).map(stats) });
  });

  router.get('/channel-cache/:id', (req, res) => {
    const id = channelId.parse(req.params.id);
    const current = read(id);
    if (!current) return res.json({ channel: { id, title: id, generation: 0, revision: 0, updatedAt: 0, deletedAt: 0 }, videos: [], snapshots: [], next: null, through: 0 });
    const generation = z.coerce.number().int().nonnegative().parse(req.query.generation);
    if (generation !== current.generation) return res.status(409).json({ error: 'Cache generation changed', channel: stats(current) });
    const since = z.coerce.number().int().nonnegative().parse(req.query.since || 0);
    const through = Math.min(current.revision, z.coerce.number().int().nonnegative().parse(req.query.through || current.revision));
    const after = z.string().max(11).parse(req.query.after || '');
    const rows = database.prepare('SELECT id, payload FROM channel_cache_videos WHERE channelId = ? AND revision > ? AND revision <= ? AND id > ? ORDER BY id LIMIT 501')
      .all(id, since, through, after) as (Stored & { id: string })[];
    res.json({ channel: stats(current), through,
      videos: rows.slice(0, 500).map(row => JSON.parse(row.payload)),
      snapshots: after ? [] : (database.prepare('SELECT payload FROM channel_cache_snapshots WHERE channelId = ? AND revision > ? AND revision <= ?').all(id, since, through) as Stored[]).map(row => JSON.parse(row.payload)),
      next: rows.length > 500 ? rows[499]!.id : null
    });
  });

  router.post('/channel-cache/:id/batch', (req, res) => {
    const id = channelId.parse(req.params.id);
    const body = batchSchema.parse(req.body);
    const result = database.transaction(() => {
      const current = ensure(id, body.title);
      if (current.generation !== body.generation) return { conflict: true, channel: stats(current) };
      const revision = current.revision + 1;
      let count = current.count;
      let bytes = current.bytes;
      const getVideo = database.prepare('SELECT payload FROM channel_cache_videos WHERE channelId = ? AND id = ?');
      const putVideo = database.prepare('INSERT INTO channel_cache_videos (channelId, id, payload, revision) VALUES (?, ?, ?, ?) ON CONFLICT(channelId, id) DO UPDATE SET payload = excluded.payload, revision = excluded.revision');
      for (const incoming of body.videos) {
        const row = getVideo.get(id, incoming.id) as Stored | undefined;
        const previous = row ? JSON.parse(row.payload) as Video : null;
        const newest = previous && previous.observedAt > incoming.observedAt ? previous : incoming;
        const payload = JSON.stringify({ ...newest, date: previous?.date || incoming.date });
        count += row ? 0 : 1;
        bytes += Buffer.byteLength(payload) - (row ? Buffer.byteLength(row.payload) : 0);
        putVideo.run(id, incoming.id, payload, revision);
      }
      for (const incoming of body.snapshots) {
        incoming.ids = [...new Set(incoming.ids)];
        const missing = incoming.ids.find(video => !getVideo.get(id, video));
        if (missing) throw new Error('Snapshot references a video that has not been uploaded');
        const row = database.prepare('SELECT payload FROM channel_cache_snapshots WHERE channelId = ? AND sort = ?').get(id, incoming.sort) as Stored | undefined;
        const previous = row ? JSON.parse(row.payload) as Snapshot : null;
        const replace = !previous || (!previous.complete && incoming.complete)
          || (!(previous.complete && !incoming.complete) && (incoming.runId === previous.runId
            ? incoming.ids.length >= previous.ids.length
            : incoming.startedAt > previous.startedAt || (incoming.startedAt === previous.startedAt && incoming.runId > previous.runId)));
        if (replace) database.prepare('INSERT INTO channel_cache_snapshots (channelId, sort, payload, revision, count, complete, startedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(channelId, sort) DO UPDATE SET payload = excluded.payload, revision = excluded.revision, count = excluded.count, complete = excluded.complete, startedAt = excluded.startedAt')
          .run(id, incoming.sort, JSON.stringify(incoming), revision, incoming.ids.length, Number(incoming.complete), incoming.startedAt);
      }
      database.prepare('UPDATE channel_cache_channels SET title = ?, revision = ?, updatedAt = ?, deletedAt = 0, count = ?, bytes = ? WHERE id = ?').run(body.title || current.title, revision, Date.now(), count, bytes, id);
      return { conflict: false, channel: stats(read(id)!) };
    })();
    return res.status(result.conflict ? 409 : 200).json(result);
  });

  router.post('/channel-cache/:id/delete', (req, res) => {
    const id = channelId.parse(req.params.id);
    const generation = z.object({ generation: z.number().int().nonnegative() }).strict().parse(req.body).generation;
    const result = database.transaction(() => {
      const current = ensure(id);
      if (generation < current.generation) return stats(current);
      if (generation > current.generation) return null;
      database.prepare('DELETE FROM channel_cache_videos WHERE channelId = ?').run(id);
      database.prepare('DELETE FROM channel_cache_snapshots WHERE channelId = ?').run(id);
      database.prepare('UPDATE channel_cache_channels SET generation = generation + 1, revision = revision + 1, updatedAt = ?, deletedAt = ?, count = 0, bytes = 0 WHERE id = ?').run(Date.now(), Date.now(), id);
      return stats(read(id)!);
    })();
    return result ? res.json({ channel: result }) : res.status(409).json({ error: 'Invalid cache generation' });
  });
  return router;
}

export default createChannelCacheRouter(db);
