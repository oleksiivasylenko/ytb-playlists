import axios from 'axios';

export const MAX_DICTATION_BYTES = 6 * 1024 * 1024;
export const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-transcribe';

const audioFormats: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3'
};

export class DictationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function parseDictationAudio(body: unknown) {
  const input = body as { audio?: unknown; mimeType?: unknown } | null;
  if (!input || typeof input.audio !== 'string' || typeof input.mimeType !== 'string') {
    throw new DictationError(400, 'Audio and MIME type are required.');
  }

  const mimeType = input.mimeType.split(';')[0].trim().toLowerCase();
  const format = Object.hasOwn(audioFormats, mimeType) ? audioFormats[mimeType] : undefined;
  if (!format) throw new DictationError(415, 'Unsupported audio format.');

  const audio = input.audio;
  if (audio.length > Math.ceil(MAX_DICTATION_BYTES / 3) * 4) {
    throw new DictationError(413, 'Recording is too large. Maximum size is 6 MB.');
  }
  if (!audio || audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    throw new DictationError(400, 'Invalid audio encoding.');
  }

  const bytes = Buffer.from(audio, 'base64');
  if (!bytes.length || bytes.toString('base64') !== audio) {
    throw new DictationError(400, 'Invalid audio encoding.');
  }
  if (bytes.length > MAX_DICTATION_BYTES) {
    throw new DictationError(413, 'Recording is too large. Maximum size is 6 MB.');
  }

  return { data: audio, format };
}

export async function transcribeDictation(audio: ReturnType<typeof parseDictationAudio>, signal?: AbortSignal) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new DictationError(503, 'Audio transcription is not configured on the server.');

  const model = process.env.OPENROUTER_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

  try {
    const response = await axios.post<{ text?: unknown }>(`${baseUrl}/audio/transcriptions`, {
      model,
      input_audio: audio,
      response_format: 'json'
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 65_000,
      maxBodyLength: 10 * 1024 * 1024,
      maxContentLength: 1024 * 1024,
      signal
    });

    const text = typeof response.data.text === 'string' ? response.data.text.trim() : '';
    if (!text) throw new DictationError(422, 'No speech was recognized. Please try recording again.');
    if (text.length > 12_000) throw new DictationError(422, 'Transcription is too long. Please record a shorter question.');
    return { text, model };
  } catch (error) {
    if (error instanceof DictationError) throw error;
    if (signal?.aborted || axios.isCancel(error)) throw new DictationError(499, 'Transcription cancelled.');
    if (axios.isAxiosError(error) && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code || '')) {
      throw new DictationError(504, 'Transcription timed out. Please try a shorter recording.');
    }
    throw new DictationError(502, 'Audio transcription is temporarily unavailable. Please try again.');
  }
}
