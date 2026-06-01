import axios from 'axios';
import { Request, Response } from 'express';
import db from './db';
import { ensureTranscript } from './transcripts';

export type SummarySettings = {
  id: number;
  model: string;
  language: string;
  prompt: string;
  html_model: string;
  html_prompt: string;
  summary_mode: SummaryMode;
  transcript_languages: string;
  tag_prompt: string;
  preferred_tags: string;
  tag_display_limit: number;
  auto_transcript_enabled: number;
  auto_summary_enabled: number;
  auto_tags_enabled: number;
  updated_at: string;
};

export type StoredSummary = {
  video_id: string;
  mode: SummaryMode;
  model: string;
  language: string;
  prompt: string;
  summary: string;
  provider_response_id: string | null;
  transcript_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SummaryMode = 'plain' | 'html';

export type StoredVideoTags = {
  videoId: string;
  tags: string[];
  updatedAt: string | null;
};

type SummaryEventClient = {
  id: number;
  res: Response;
};

type OpenRouterResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenRouterErrorResponse = {
  error?: {
    message?: string;
    code?: string | number;
    metadata?: unknown;
  };
  [key: string]: unknown;
};

type OpenRouterFailureContext = {
  action: string;
  videoId: string;
  mode?: SummaryMode;
  model: string;
};

const activeSummaries = new Map<string, Promise<StoredSummary>>();
const activeTags = new Map<string, Promise<StoredVideoTags>>();
const eventClients = new Map<number, SummaryEventClient>();
let nextEventClientId = 1;

function nowIso() {
  return new Date().toISOString();
}

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured on the server.');
  return apiKey;
}

function getOpenRouterBaseUrl() {
  return process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
}

function openRouterErrorMessage(error: unknown) {
  if (!axios.isAxiosError<OpenRouterErrorResponse>(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const status = error.response?.status;
  const providerError = error.response?.data?.error;
  const message = providerError?.message || error.message;
  const code = providerError?.code ? ` (${providerError.code})` : '';

  return status ? `HTTP ${status}: ${message}${code}` : `${message}${code}`;
}

function logOpenRouterError(context: OpenRouterFailureContext, error: unknown) {
  if (!axios.isAxiosError<OpenRouterErrorResponse>(error)) {
    console.error(`OpenRouter ${context.action} request failed:`, {
      ...context,
      error
    });
    return;
  }

  console.error(`OpenRouter ${context.action} request failed:`, {
    ...context,
    status: error.response?.status,
    statusText: error.response?.statusText,
    code: error.code,
    message: error.message,
    providerMessage: error.response?.data?.error?.message,
    providerCode: error.response?.data?.error?.code,
    providerMetadata: error.response?.data?.error?.metadata,
    responseData: error.response?.data
  });
}

export function getSummarySettings() {
  return db.prepare('SELECT * FROM summary_settings WHERE id = 1').get() as SummarySettings;
}

export function updateSummarySettings(input: Partial<{
  model: string;
  language: string;
  prompt: string;
  htmlModel: string;
  htmlPrompt: string;
  summaryMode: SummaryMode;
  transcriptLanguages: string;
  tagPrompt: string;
  preferredTags: string;
  tagDisplayLimit: number;
  autoTranscriptEnabled: boolean;
  autoSummaryEnabled: boolean;
  autoTagsEnabled: boolean;
}>) {
  const current = getSummarySettings();
  const model = typeof input.model === 'string' && input.model.trim()
    ? input.model.trim()
    : current.model;
  const htmlModel = typeof (input as any).htmlModel === 'string' && (input as any).htmlModel.trim()
    ? (input as any).htmlModel.trim()
    : current.html_model;
  const language = typeof input.language === 'string' && input.language.trim()
    ? input.language.trim()
    : current.language;
  const prompt = typeof input.prompt === 'string' && input.prompt.trim()
    ? input.prompt.trim()
    : current.prompt;
  const htmlPrompt = typeof (input as any).htmlPrompt === 'string' && (input as any).htmlPrompt.trim()
    ? (input as any).htmlPrompt.trim()
    : current.html_prompt;
  const summaryMode = normalizeSummaryMode(input.summaryMode || current.summary_mode);
  const transcriptLanguages = typeof input.transcriptLanguages === 'string' && input.transcriptLanguages.trim()
    ? input.transcriptLanguages.trim()
    : current.transcript_languages;
  const tagPrompt = typeof input.tagPrompt === 'string' && input.tagPrompt.trim()
    ? input.tagPrompt.trim()
    : current.tag_prompt;
  const preferredTags = typeof input.preferredTags === 'string'
    ? input.preferredTags.trim()
    : current.preferred_tags || '';
  const tagDisplayLimitValue = Number(input.tagDisplayLimit);
  const tagDisplayLimit = Number.isInteger(tagDisplayLimitValue) && tagDisplayLimitValue > 0
    ? Math.min(tagDisplayLimitValue, 50)
    : current.tag_display_limit || 5;
  const autoTranscriptEnabled = typeof input.autoTranscriptEnabled === 'boolean'
    ? (input.autoTranscriptEnabled ? 1 : 0)
    : current.auto_transcript_enabled || 0;
  const autoSummaryEnabled = typeof input.autoSummaryEnabled === 'boolean'
    ? (input.autoSummaryEnabled ? 1 : 0)
    : current.auto_summary_enabled || 0;
  const autoTagsEnabled = typeof input.autoTagsEnabled === 'boolean'
    ? (input.autoTagsEnabled ? 1 : 0)
    : current.auto_tags_enabled || 0;

  db.prepare(`
    UPDATE summary_settings
    SET model = ?, language = ?, prompt = ?, html_model = ?, html_prompt = ?, summary_mode = ?,
        transcript_languages = ?, tag_prompt = ?, preferred_tags = ?, tag_display_limit = ?,
        auto_transcript_enabled = ?, auto_summary_enabled = ?, auto_tags_enabled = ?, updated_at = ?
    WHERE id = 1
  `).run(
    model,
    language,
    prompt,
    htmlModel,
    htmlPrompt,
    summaryMode,
    transcriptLanguages,
    tagPrompt,
    preferredTags,
    tagDisplayLimit,
    autoTranscriptEnabled,
    autoSummaryEnabled,
    autoTagsEnabled,
    nowIso()
  );

  return getSummarySettings();
}

export function normalizeSummaryMode(value: unknown): SummaryMode {
  return value === 'html' ? 'html' : 'plain';
}

export function getSummary(videoId: string, mode: SummaryMode = 'plain') {
  return db.prepare('SELECT * FROM video_summaries WHERE video_id = ? AND mode = ?').get(videoId, mode) as StoredSummary | undefined;
}

export function getSummaryStatus(videoId: string) {
  const summary = getSummary(videoId, 'plain');
  const htmlSummary = getSummary(videoId, 'html');
  return {
    videoId,
    hasSummary: !!summary,
    hasHtmlSummary: !!htmlSummary,
    updatedAt: summary?.updated_at || null,
    htmlUpdatedAt: htmlSummary?.updated_at || null,
    language: summary?.language || null,
    model: summary?.model || null,
    htmlModel: htmlSummary?.model || null
  };
}

function saveSummary(input: {
  videoId: string;
  mode: SummaryMode;
  model: string;
  language: string;
  prompt: string;
  summary: string;
  providerResponseId: string | null;
  transcriptUpdatedAt: string | null;
}) {
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO video_summaries (
      video_id, mode, model, language, prompt, summary, provider_response_id,
      transcript_updated_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id, mode) DO UPDATE SET
      model = excluded.model,
      language = excluded.language,
      prompt = excluded.prompt,
      summary = excluded.summary,
      provider_response_id = excluded.provider_response_id,
      transcript_updated_at = excluded.transcript_updated_at,
      updated_at = excluded.updated_at
  `).run(
    input.videoId,
    input.mode,
    input.model,
    input.language,
    input.prompt,
    input.summary,
    input.providerResponseId,
    input.transcriptUpdatedAt,
    timestamp,
    timestamp
  );

  return getSummary(input.videoId, input.mode) as StoredSummary;
}

function buildSummaryMessages(input: {
  prompt: string;
  language: string;
  title: string;
  author: string;
  transcript: string;
}) {
  return [
    {
      role: 'system',
      content: input.prompt
    },
    {
      role: 'user',
      content: [
        `Requested summary language: ${input.language}`,
        `Video title: ${input.title}`,
        `Channel/author: ${input.author}`,
        '',
        'Transcript with timestamps:',
        input.transcript
      ].join('\n')
    }
  ];
}

function buildTagMessages(input: {
  prompt: string;
  preferredTags: string;
  title: string;
  author: string;
  transcript: string;
}) {
  return [
    {
      role: 'system',
      content: input.prompt
    },
    {
      role: 'user',
      content: [
        `Video title: ${input.title}`,
        `Channel/author: ${input.author}`,
        `Preferred tags, comma-separated: ${input.preferredTags || 'none'}`,
        '',
        'If a preferred tag is clearly relevant, prefer it over a near-duplicate new tag.',
        'Transcript with timestamps:',
        input.transcript
      ].join('\n')
    }
  ];
}

function getModeSettings(settings: SummarySettings, mode: SummaryMode) {
  if (mode === 'html') {
    return {
      model: settings.html_model || settings.model,
      prompt: settings.html_prompt || settings.prompt
    };
  }

  return {
    model: settings.model,
    prompt: settings.prompt
  };
}

function parseTagsResponse(content: string) {
  const trimmed = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  const startsAt = [firstObject, firstArray].filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const lastObject = trimmed.lastIndexOf('}');
  const lastArray = trimmed.lastIndexOf(']');
  const endsAt = Math.max(lastObject, lastArray);
  const jsonText = endsAt >= startsAt ? trimmed.slice(startsAt, endsAt + 1) : trimmed;
  const parsed = JSON.parse(jsonText) as unknown;
  const rawTags: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as any).tags)
      ? (parsed as any).tags
      : [];

  const seen = new Set<string>();
  return rawTags
    .map(tag => typeof tag === 'string' ? tag.replace(/\s+/g, ' ').trim() : '')
    .filter(tag => {
      if (!tag || tag.length > 80) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

function getStoredTags(videoId: string): StoredVideoTags | undefined {
  const row = db.prepare('SELECT id, tags_json, tags_updated_at FROM videos WHERE id = ?').get(videoId) as {
    id: string;
    tags_json?: string | null;
    tags_updated_at?: string | null;
  } | undefined;
  if (!row || !row.tags_json) return undefined;

  try {
    return {
      videoId: row.id,
      tags: parseStoredTags(row.tags_json),
      updatedAt: row.tags_updated_at || null
    };
  } catch {
    return undefined;
  }
}

function parseStoredTags(value: string) {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((tag): tag is string => typeof tag === 'string')
    : [];
}

function saveTags(videoId: string, tags: string[]) {
  const timestamp = nowIso();
  db.prepare(`
    UPDATE videos
    SET tags_json = ?,
        tags_updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(tags), timestamp, videoId);

  return {
    videoId,
    tags,
    updatedAt: timestamp
  };
}

async function requestOpenRouterSummary(videoId: string, mode: SummaryMode) {
  const settings = getSummarySettings();
  const modeSettings = getModeSettings(settings, mode);
  const transcript = await ensureTranscript(videoId);
  const video = db.prepare('SELECT title, author FROM videos WHERE id = ?').get(videoId) as {
    title?: string;
    author?: string;
  } | undefined;

  const messages = buildSummaryMessages({
    prompt: modeSettings.prompt,
    language: settings.language,
    title: video?.title || 'Unknown Title',
    author: video?.author || 'Unknown Author',
    transcript: transcript.timestamped_text || transcript.text
  });

  let response;
  try {
    response = await axios.post<OpenRouterResponse>(
      `${getOpenRouterBaseUrl()}/chat/completions`,
      {
        model: modeSettings.model,
        messages,
        temperature: 0.2,
        max_tokens: 4000
      },
      {
        timeout: 120000,
        headers: {
          Authorization: `Bearer ${getOpenRouterApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3001',
          'X-Title': 'ytb-playlists'
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError<OpenRouterErrorResponse>(error)) {
      logOpenRouterError({ action: 'summary', videoId, mode, model: modeSettings.model }, error);
      throw new Error(`OpenRouter request failed: ${openRouterErrorMessage(error)}`);
    }
    throw error;
  }

  const summary = String(response.data.choices?.[0]?.message?.content || '').trim();
  if (!summary) {
    throw new Error(response.data.error?.message || 'OpenRouter returned an empty summary.');
  }

  return saveSummary({
    videoId,
    mode,
    model: modeSettings.model,
    language: settings.language,
    prompt: modeSettings.prompt,
    summary,
    providerResponseId: response.data.id || null,
    transcriptUpdatedAt: transcript.updated_at || null
  });
}

async function requestOpenRouterTags(videoId: string) {
  const settings = getSummarySettings();
  const transcript = await ensureTranscript(videoId);
  const video = db.prepare('SELECT title, author FROM videos WHERE id = ?').get(videoId) as {
    title?: string;
    author?: string;
  } | undefined;

  const messages = buildTagMessages({
    prompt: settings.tag_prompt,
    preferredTags: settings.preferred_tags || '',
    title: video?.title || 'Unknown Title',
    author: video?.author || 'Unknown Author',
    transcript: transcript.timestamped_text || transcript.text
  });

  let response;
  try {
    response = await axios.post<OpenRouterResponse>(
      `${getOpenRouterBaseUrl()}/chat/completions`,
      {
        model: settings.model,
        messages,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      },
      {
        timeout: 120000,
        headers: {
          Authorization: `Bearer ${getOpenRouterApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3001',
          'X-Title': 'ytb-playlists'
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError<OpenRouterErrorResponse>(error)) {
      logOpenRouterError({ action: 'tags', videoId, model: settings.model }, error);
      throw new Error(`OpenRouter request failed: ${openRouterErrorMessage(error)}`);
    }
    throw error;
  }

  const content = String(response.data.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    throw new Error(response.data.error?.message || 'OpenRouter returned an empty tags response.');
  }

  let tags: string[];
  try {
    tags = parseTagsResponse(content);
  } catch {
    throw new Error('OpenRouter returned tags that were not valid JSON.');
  }

  if (tags.length === 0) throw new Error('OpenRouter returned no usable tags.');
  return saveTags(videoId, tags);
}

export async function ensureSummary(videoId: string, mode: SummaryMode = 'plain', force = false) {
  const cached = getSummary(videoId, mode);
  if (cached && !force) return cached;

  const key = `${videoId}:${mode}`;
  const active = activeSummaries.get(key);
  if (active) return active;

  const summaryPromise = requestOpenRouterSummary(videoId, mode)
    .then(summary => {
      broadcastSummaryEvent({
        type: 'summary_ready',
        videoId,
        mode,
        hasSummary: true,
        updatedAt: summary.updated_at,
        language: summary.language,
        model: summary.model
      });
      return summary;
    })
    .finally(() => {
      activeSummaries.delete(key);
    });

  activeSummaries.set(key, summaryPromise);
  return summaryPromise;
}

export function getTags(videoId: string) {
  return getStoredTags(videoId);
}

export function getTagStatus(videoId: string) {
  const tags = getStoredTags(videoId);
  return {
    videoId,
    hasTags: !!tags && tags.tags.length > 0,
    tags: tags?.tags || [],
    updatedAt: tags?.updatedAt || null
  };
}

export async function ensureTags(videoId: string, force = false) {
  const cached = getStoredTags(videoId);
  if (cached && cached.tags.length > 0 && !force) return cached;

  const active = activeTags.get(videoId);
  if (active) return active;

  const tagPromise = requestOpenRouterTags(videoId)
    .then(tags => {
      broadcastSummaryEvent({
        type: 'tags_ready',
        videoId,
        hasTags: true,
        tags: tags.tags,
        updatedAt: tags.updatedAt
      });
      return tags;
    })
    .finally(() => {
      activeTags.delete(videoId);
    });

  activeTags.set(videoId, tagPromise);
  return tagPromise;
}

export async function ensurePlainSummary(videoId: string) {
  const cached = getSummary(videoId, 'plain');
  if (cached) return cached;
  return ensureSummary(videoId, 'plain');
}

export function addSummaryEventClient(req: Request, res: Response) {
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

function broadcastSummaryEvent(payload: unknown) {
  const data = JSON.stringify(payload);

  for (const [id, client] of eventClients.entries()) {
    try {
      client.res.write('event: summary\n');
      client.res.write(`data: ${data}\n\n`);
    } catch {
      eventClients.delete(id);
    }
  }
}
