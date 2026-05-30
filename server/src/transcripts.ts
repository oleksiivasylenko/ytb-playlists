import axios from 'axios';
import { Request, Response } from 'express';
import db from './db';

export type StoredTranscript = {
  video_id: string;
  provider: string;
  language: string;
  format: string;
  text: string;
  timestamped_text: string | null;
  segments_json: string | null;
  raw_json: string | null;
  is_generated: number;
  fetched_at: string;
  updated_at: string;
};

type FetchTranscriptResponse = {
  video_id: string;
  language?: string;
  text?: string;
  is_generated?: boolean;
  provider?: string;
  metadata?: unknown;
  segments?: TranscriptSegment[];
};

type TranscriptEventClient = {
  id: number;
  res: Response;
};

type TranscriptSegment = {
  text: string;
  start: number;
  duration?: number;
};

type TranscriptSettings = {
  transcript_languages?: string | null;
};

type TranscriptAvailability = {
  transcript_unavailable: number | null;
  transcript_unavailable_at: string | null;
  transcript_unavailable_reason: string | null;
};

type TranscriptAttemptError = {
  language: string;
  message: string;
  terminal: boolean;
};

const FETCH_FORMAT = 'json';
const activeFetches = new Map<string, Promise<StoredTranscript>>();
const eventClients = new Map<number, TranscriptEventClient>();
let nextEventClientId = 1;

export class TranscriptUnavailableError extends Error {
  videoId: string;
  reason: string;
  unavailableAt: string | null;

  constructor(videoId: string, reason: string, unavailableAt: string | null) {
    super(reason);
    this.name = 'TranscriptUnavailableError';
    this.videoId = videoId;
    this.reason = reason;
    this.unavailableAt = unavailableAt;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function getFetchTranscriptBaseUrl() {
  return process.env.FETCHTRANSCRIPT_BASE_URL || 'https://api.fetchtranscript.com/v1';
}

function transcriptKey(videoId: string, language: string) {
  return `${videoId}:${language}:${FETCH_FORMAT}`;
}

export function getTranscript(videoId: string) {
  return db.prepare('SELECT * FROM video_transcripts WHERE video_id = ?').get(videoId) as StoredTranscript | undefined;
}

function getTranscriptAvailability(videoId: string) {
  return db.prepare(`
    SELECT transcript_unavailable, transcript_unavailable_at, transcript_unavailable_reason
    FROM videos
    WHERE id = ?
  `).get(videoId) as TranscriptAvailability | undefined;
}

export function getTranscriptStatus(videoId: string) {
  const transcript = getTranscript(videoId);
  const availability = getTranscriptAvailability(videoId);
  const hasTimestampedTranscript = !!(transcript?.segments_json || transcript?.timestamped_text);
  return {
    videoId,
    hasTranscript: !!transcript,
    hasTimestampedTranscript,
    transcriptUnavailable: availability?.transcript_unavailable === 1,
    transcriptUnavailableAt: availability?.transcript_unavailable_at || null,
    transcriptUnavailableReason: availability?.transcript_unavailable_reason || null,
    fetchedAt: transcript?.fetched_at || null,
    language: transcript?.language || null,
    provider: transcript?.provider || null
  };
}

function clearTranscriptUnavailable(videoId: string) {
  db.prepare(`
    UPDATE videos
    SET transcript_unavailable = 0,
        transcript_unavailable_at = NULL,
        transcript_unavailable_reason = NULL
    WHERE id = ?
  `).run(videoId);
}

function markTranscriptUnavailable(videoId: string, reason: string) {
  const timestamp = nowIso();
  const message = reason.slice(0, 1000);

  db.prepare(`
    INSERT INTO videos (
      id, title, thumbnail, author, view_count, duration, availability,
      transcript_unavailable, transcript_unavailable_at, transcript_unavailable_reason
    )
    VALUES (?, 'Unknown Title', ?, 'Unknown Author', 0, 0, 'unknown', 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      transcript_unavailable = 1,
      transcript_unavailable_at = excluded.transcript_unavailable_at,
      transcript_unavailable_reason = excluded.transcript_unavailable_reason
  `).run(videoId, `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, timestamp, message);

  broadcastTranscriptEvent({
    type: 'transcript_unavailable',
    videoId,
    transcriptUnavailable: true,
    transcriptUnavailableAt: timestamp,
    transcriptUnavailableReason: message
  });

  return { timestamp, message };
}

function saveTranscript(input: {
  videoId: string;
  provider: string;
  language: string;
  text: string;
  timestampedText: string;
  segmentsJson: string;
  rawJson: string;
  isGenerated: boolean;
}) {
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO video_transcripts (
      video_id, provider, language, format, text, timestamped_text, segments_json,
      raw_json, is_generated, fetched_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      provider = excluded.provider,
      language = excluded.language,
      format = excluded.format,
      text = excluded.text,
      timestamped_text = excluded.timestamped_text,
      segments_json = excluded.segments_json,
      raw_json = excluded.raw_json,
      is_generated = excluded.is_generated,
      updated_at = excluded.updated_at
  `).run(
    input.videoId,
    input.provider,
    input.language,
    FETCH_FORMAT,
    input.text,
    input.timestampedText,
    input.segmentsJson,
    input.rawJson,
    input.isGenerated ? 1 : 0,
    timestamp,
    timestamp
  );

  clearTranscriptUnavailable(input.videoId);
  return getTranscript(input.videoId) as StoredTranscript;
}

function formatTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function normalizeSegments(rawSegments: unknown) {
  if (!Array.isArray(rawSegments)) return [];
  const segments: TranscriptSegment[] = [];

  for (const item of rawSegments) {
      if (!item || typeof item !== 'object') continue;
      const segment = item as Partial<TranscriptSegment>;
      const text = typeof segment.text === 'string' ? segment.text.trim() : '';
      const start = Number(segment.start);
      const duration = Number(segment.duration);
      if (!text || !Number.isFinite(start)) continue;

      const normalized: TranscriptSegment = {
        text,
        start
      };
      if (Number.isFinite(duration)) normalized.duration = duration;
      segments.push(normalized);
  }

  return segments;
}

function segmentsToText(segments: TranscriptSegment[]) {
  return segments.map(segment => segment.text).join(' ').replace(/\s+/g, ' ').trim();
}

function segmentsToTimestampedText(segments: TranscriptSegment[]) {
  return segments
    .map(segment => `${formatTimestamp(segment.start)} ${segment.text}`)
    .join('\n')
    .trim();
}

function getFetchTranscriptApiKey() {
  const apiKey = process.env.FETCHTRANSCRIPT_API_KEY;
  if (!apiKey) {
    throw new Error('FETCHTRANSCRIPT_API_KEY is not configured on the server.');
  }
  return apiKey;
}

function parseLanguagePriority(value: unknown) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map(language => language.trim())
    .filter(Boolean);
}

function getTranscriptLanguagePriority(language?: string) {
  if (language && language.trim()) return [language.trim()];

  const settings = db.prepare('SELECT transcript_languages FROM summary_settings WHERE id = 1').get() as TranscriptSettings | undefined;
  const priority = parseLanguagePriority(settings?.transcript_languages);
  if (priority.length > 0) return priority;

  const envPriority = parseLanguagePriority(process.env.FETCHTRANSCRIPT_LANGUAGES);
  return envPriority.length > 0 ? envPriority : ['en'];
}

function transcriptErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const detail = data?.detail;
    const message = detail?.message || data?.message || data?.error || error.message;
    return status ? `HTTP ${status}: ${message}` : message;
  }

  return error instanceof Error ? error.message : String(error);
}

function isTerminalTranscriptError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const detail = data?.detail;
    const message = String(detail?.message || data?.message || data?.error || error.message || '').toLowerCase();

    if (status === 404) return true;
    if (status === 400 && /(no|not found|missing|disabled|unavailable).*(transcript|caption|subtitle)|transcript.*(not found|disabled|unavailable|missing|no)/i.test(message)) {
      return true;
    }
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /(empty transcript|did not return timestamp segments|no transcript|transcript.*not found|transcript.*disabled|transcript.*unavailable)/i.test(message);
}

async function requestFetchTranscript(videoId: string, language: string) {
  const response = await axios.get<FetchTranscriptResponse>(`${getFetchTranscriptBaseUrl()}/transcripts/${videoId}`, {
    timeout: 30000,
    params: {
      lang: language,
      format: FETCH_FORMAT
    },
    headers: {
      Authorization: `Bearer ${getFetchTranscriptApiKey()}`
    }
  });

  const segments = normalizeSegments(response.data.segments);
  const text = String(response.data.text || segmentsToText(segments)).trim();
  if (!text) throw new Error('FetchTranscript returned an empty transcript.');
  if (segments.length === 0) throw new Error('FetchTranscript did not return timestamp segments.');

  return saveTranscript({
    videoId,
    provider: response.data.provider || 'fetchtranscript',
    language: response.data.language || language,
    text,
    timestampedText: segmentsToTimestampedText(segments),
    segmentsJson: JSON.stringify(segments),
    rawJson: JSON.stringify(response.data),
    isGenerated: !!response.data.is_generated
  });
}

async function requestFetchTranscriptByPriority(videoId: string, languages: string[]) {
  const errors: TranscriptAttemptError[] = [];

  for (const language of languages) {
    try {
      return await requestFetchTranscript(videoId, language);
    } catch (error) {
      errors.push({
        language,
        message: transcriptErrorMessage(error),
        terminal: isTerminalTranscriptError(error)
      });
    }
  }

  const error = new Error(
    `Failed to fetch transcript for ${videoId}. Tried languages: ${errors.map(item => `${item.language} (${item.message})`).join(', ')}`
  );
  (error as any).transcriptUnavailable = errors.length > 0 && errors.every(item => item.terminal);
  throw error;
}

export async function ensureTranscript(videoId: string, language?: string, force = false) {
  const cached = getTranscript(videoId);
  if (cached && !force) return cached;

  const availability = getTranscriptAvailability(videoId);
  if (!force && availability?.transcript_unavailable === 1) {
    throw new TranscriptUnavailableError(
      videoId,
      availability.transcript_unavailable_reason || 'Transcript is marked unavailable for this video.',
      availability.transcript_unavailable_at || null
    );
  }

  const languages = getTranscriptLanguagePriority(language);
  const key = `${transcriptKey(videoId, languages.join(','))}:${force ? 'force' : 'cache'}`;
  const activeFetch = activeFetches.get(key);
  if (activeFetch) return activeFetch;

  const fetchPromise = requestFetchTranscriptByPriority(videoId, languages)
    .then(transcript => {
      broadcastTranscriptEvent({
        type: 'transcript_ready',
        videoId,
        hasTranscript: true,
        fetchedAt: transcript.fetched_at,
        language: transcript.language
      });
      return transcript;
    })
    .catch(error => {
      if ((error as any)?.transcriptUnavailable) {
        const unavailable = markTranscriptUnavailable(videoId, transcriptErrorMessage(error));
        throw new TranscriptUnavailableError(videoId, unavailable.message, unavailable.timestamp);
      }
      throw error;
    })
    .finally(() => {
      activeFetches.delete(key);
    });

  activeFetches.set(key, fetchPromise);
  return fetchPromise;
}

export function addTranscriptEventClient(req: Request, res: Response) {
  const id = nextEventClientId++;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write('event: ready\n');
  res.write('data: {"type":"ready"}\n\n');

  eventClients.set(id, { id, res });
  req.on('close', () => {
    eventClients.delete(id);
  });
}

function broadcastTranscriptEvent(payload: unknown) {
  const data = JSON.stringify(payload);

  for (const [id, client] of eventClients.entries()) {
    try {
      client.res.write('event: transcript\n');
      client.res.write(`data: ${data}\n\n`);
    } catch {
      eventClients.delete(id);
    }
  }
}
