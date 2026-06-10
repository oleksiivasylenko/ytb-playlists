import { z } from 'zod';
import type { AskComment } from './summaries';

const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
const languageRegex = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/;

export const videoIdSchema = z.string().trim().regex(videoIdRegex);
export const languageSchema = z.string().trim().regex(languageRegex);
export const playlistNameSchema = z.string().trim().min(1);

const strictBoolean = z.unknown().transform(value => value === true);

const positiveInt = z.unknown().transform(value => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
});

const askText = (maxLength: number) => z.unknown().transform(value => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
});

const boundedText = (maxLength: number, fallback: string | null = null) =>
  z.unknown().transform(value => typeof value === 'string' ? value.slice(0, maxLength) : fallback);

export function normalizeVideoId(value: unknown) {
  const parsed = videoIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeLanguage(value: unknown) {
  const parsed = languageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizePlaylistName(value: unknown) {
  const parsed = playlistNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const askCommentsSchema = z.unknown().transform(value => {
  if (!Array.isArray(value)) return [] as AskComment[];

  return value.map(raw => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
      author: askTextValue(item.author, 240),
      text: askTextValue(item.text, 12000),
      publishedTime: askTextValue(item.publishedTime, 120),
      likes: askTextValue(item.likes, 80),
      reply: item.reply === true
    };
  }).filter(comment => comment.text);
});

function askTextValue(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export const askRequestSchema = z.object({
  question: askText(4000),
  title: askText(500),
  author: askText(300),
  transcript: z.unknown().transform(value => typeof value === 'string' ? value.slice(0, 2_000_000) : ''),
  includeTranscript: strictBoolean,
  comments: askCommentsSchema,
  expectedCommentCount: z.unknown().transform(value => {
    const num = Number(value);
    return Number.isInteger(num) && num >= 0 ? num : null;
  })
});

export const moveVideosSchema = z.object({
  targetPlaylistId: positiveInt,
  videoIds: z.unknown().transform(value => Array.isArray(value)
    ? Array.from(new Set(value.map(normalizeVideoId).filter(Boolean))) as string[]
    : [])
});

export const youtubeCleanupSchema = z.object({
  result: z.unknown().transform(value => typeof value === 'string' ? value : ''),
  error: boundedText(1000)
});

export const syncStartSchema = z.object({
  sourceType: z.unknown().transform(value => typeof value === 'string' ? value.trim() : 'youtube_playlist'),
  sourceId: z.unknown().transform(value => typeof value === 'string' ? value.trim() : ''),
  sourceUrl: z.unknown().transform(value => typeof value === 'string' ? value.trim() : null),
  playlistId: positiveInt
});

export const syncFailSchema = z.object({
  error: boundedText(1000, 'Sync failed')
});

export function normalizeYoutubePlaylistSource(value: unknown) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input) {
    return { source_type: 'manual', source_id: null, source_url: null };
  }

  let sourceId = '';
  let sourceUrl = '';
  try {
    const parsed = new URL(input);
    sourceId = parsed.searchParams.get('list') || '';
    sourceUrl = parsed.href;
  } catch {
    if (/^[a-zA-Z0-9_-]+$/.test(input)) {
      sourceId = input;
      sourceUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(input)}`;
    }
  }

  sourceId = sourceId.trim();
  if (!sourceId || !/^[a-zA-Z0-9_-]+$/.test(sourceId)) return null;
  return {
    source_type: 'youtube_playlist',
    source_id: sourceId,
    source_url: sourceUrl || `https://www.youtube.com/playlist?list=${encodeURIComponent(sourceId)}`
  };
}
