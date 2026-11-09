# Ask dictation

Implemented and deployed on November 9, 2026.

## Controls

The microphone starts a browser audio recording with a waveform derived from an AudioContext analyser. Stop transcribes into the existing draft without submitting. The upward arrow transcribes and passes the resulting draft to the existing Ask handler, preserving its comments or video-and-comments context. Cancel and Escape discard audio. Panel closure, navigation, microphone disconnection, and extension cleanup stop capture; cancelled transcription results cannot submit questions or replace the draft.

Microphone permission is requested only after the microphone button is clicked. The current implementation captures from the YouTube document, so the browser's microphone permission for YouTube must be allowed. Reload the unpacked extension and refresh the YouTube tab after updating its files.

Recordings are limited to five minutes and 6 MB. Reaching the time limit transcribes for review. Questions above 4,000 characters stay in the editable draft and are not automatically submitted or truncated. Permission, provider, timeout, and empty-transcription errors preserve the pre-recording draft.

## API

`POST /api/dictation/transcribe` requires the existing `X-API-Token` and accepts:

```json
{
  "audio": "<base64 audio bytes>",
  "mimeType": "audio/webm;codecs=opus"
}
```

The server validates encoding, size and MIME type, maps the format, then sends JSON to OpenRouter's `/api/v1/audio/transcriptions`. It returns `{ "text": "...", "model": "openai/gpt-transcribe" }`. Client-supplied model names and provider options are ignored. WebM, Ogg, MP4/M4A, WAV and MP3 are accepted; Chrome normally records WebM/Opus at a target 64 kbit/s.

The server uses `OPENROUTER_API_KEY` and optional `OPENROUTER_TRANSCRIBE_MODEL`, defaulting to `openai/gpt-transcribe`. Language is detected automatically and speech is transcribed in its original language. Audio is handled in memory without application file or database storage. The provider processes audio under its own policies. The application returns sanitized errors, applies its existing authenticated write rate limit, uses a 65-second provider timeout, and aborts the upstream call when the client disconnects. The extension's request timeout is 75 seconds; its service worker forwards cancellation scoped to the originating tab/document/request.

The model was verified against the [OpenRouter transcription catalog](https://openrouter.ai/api/v1/models?output_modalities=transcription) as `openai/gpt-transcribe`, canonical slug `openai/gpt-transcribe-20260805`. See [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text) and [OpenRouter speech-to-text](https://openrouter.ai/docs/guides/overview/multimodal/stt).

## Deployment

The API runs in `/opt/ytb-playlists-api` on `my_agents_187`, Docker Compose service `api`. This release deployed only `src/index.ts`, `src/routes/index.ts`, `src/routes/dictation.ts`, and `src/services/dictation.ts`; no database migration, key changes, or answer-model changes were needed.

Backup: `/opt/ytb-playlists-api/backups/dictation-20261109-131729`. Its manifest records which source files existed before the release. Rollback image: `ytb-playlists-api:before-dictation-20261109-131729`.

The nginx default upload limit was 1 MB. The app-router renderer now accepts an optional integer `max_body_bytes` per app; the `ytb-playlists.vasdev.bid` entry in `/opt/app-router/config/routes.json` sets `10485760`. This generates `client_max_body_size 10485760;` for this host. Other hosts' generated configurations were checked byte-for-byte unchanged. The generated nginx configuration and active site refer to the same file. Renderer, route map, and nginx configuration backups are under the release backup's `nginx/` directory.

After deployment, public HTTPS checks confirmed authentication, invalid-encoding and malformed-JSON responses, and that a 1.5 MB request reaches application validation. A real browser-created WebM transcription completed in 0.93 seconds. Summary, HTML summary and Ask answer settings remained `openai/gpt-6-luna-pro`.

## Validation

- TypeScript build and existing API, AI request, channel cache, transport, comment sync and playlist sync regression checks.
- Server integration tests with a local HTTP provider: authentication, current model request, MIME mapping, malformed and oversized audio, empty speech, sanitized provider failures, configuration errors, and upstream cancellation.
- API bridge tests across the content client and service-worker proxy, including document-scoped cancellation.
- Headless Chrome interaction tests: review versus direct send, actual Ask panel context, cancellation, permission denial and late permission, lost microphone, draft preservation, time and text limits, navigation and DOM removal cleanup, and light/dark/narrow layouts.
- Real Chrome MediaRecorder capture using synthetic microphone input, plus live GPT Transcribe requests for WAV and WebM. These tests do not access the user's microphone or verify their installed browser's permission prompt.

Synthetic fixtures, screenshots and live-check outputs are in the ignored `exports/dictation-2026-11-09/` directory. Test setup instructions are in the project README.
