const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { default: dictationRouter } = require('../dist/routes/dictation');
const { MAX_DICTATION_BYTES, parseDictationAudio } = require('../dist/services/dictation');
const { createApiSecurityMiddleware } = require('../dist/middleware/api-security');

test('dictation validates recordings, authenticates, transcribes and cancels upstream requests', async t => {
  const saved = { key: process.env.OPENROUTER_API_KEY, base: process.env.OPENROUTER_BASE_URL, model: process.env.OPENROUTER_TRANSCRIBE_MODEL };
  process.env.OPENROUTER_API_KEY = 'fixture-private-provider-key';
  delete process.env.OPENROUTER_TRANSCRIBE_MODEL;
  const requests = [];
  let reply = { status: 200, body: { text: '  Що автор говорить про подорож?  ' } };
  let providerStarted;
  let providerClosed;
  const provider = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
    if (reply.hold) {
      res.on('close', () => providerClosed?.());
      providerStarted?.();
      return;
    }
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`;
  const app = express();
  app.use(createApiSecurityMiddleware({ token: 'fixture-app-token', windowMs: 60000, maxRequests: 100, blockMs: 1000, maxBlockMs: 1000, strikeResetMs: 60000 }));
  app.use(express.json({ limit: '10mb' }));
  app.use(dictationRouter);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: 'Invalid request.' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/dictation/transcribe`;
  const recording = { audio: Buffer.from('fixture-audio-bytes').toString('base64'), mimeType: 'audio/webm;codecs=opus' };
  const post = (body = recording, authenticated = true, signal) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'X-API-Token': 'fixture-app-token' } : {}) },
    body: JSON.stringify(body),
    signal
  });

  t.after(async () => {
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))]);
    for (const [name, value] of Object.entries({ OPENROUTER_API_KEY: saved.key, OPENROUTER_BASE_URL: saved.base, OPENROUTER_TRANSCRIBE_MODEL: saved.model })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  await t.test('unauthenticated requests never reach the provider', async () => {
    assert.equal((await post(recording, false)).status, 401);
    assert.equal(requests.length, 0);
  });

  await t.test('uses current GPT Transcribe, preserves original language and returns no secrets or audio', async () => {
    const response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'Що автор говорить про подорож?', model: 'openai/gpt-transcribe' });
    assert.deepEqual(requests[0], {
      path: '/v1/audio/transcriptions', authorization: 'Bearer fixture-private-provider-key',
      body: { model: 'openai/gpt-transcribe', input_audio: { data: recording.audio, format: 'webm' }, response_format: 'json' }
    });
  });

  await t.test('rejects empty, malformed and oversized recordings before paying for transcription', async () => {
    const count = requests.length;
    for (const body of [{}, null, { ...recording, audio: '' }, { ...recording, audio: 'abcd!!!=' }, { ...recording, audio: 'YR==' }, { ...recording, audio: 'data:audio/wav;base64,YQ==' }]) {
      assert.equal((await post(body)).status, 400);
    }
    assert.equal((await post({ ...recording, mimeType: 'text/html' })).status, 415);
    assert.equal((await post({ ...recording, mimeType: 'constructor' })).status, 415);
    assert.equal((await post({ ...recording, audio: Buffer.alloc(MAX_DICTATION_BYTES + 1).toString('base64') })).status, 413);
    assert.equal(requests.length, count);
  });

  await t.test('supports browser MIME types and ignores client-supplied models and provider options', async () => {
    assert.equal(parseDictationAudio({ ...recording, mimeType: 'audio/mp4;codecs=mp4a.40.2' }).format, 'm4a');
    assert.equal(parseDictationAudio({ ...recording, mimeType: 'audio/ogg;codecs=opus' }).format, 'ogg');
    await post({ ...recording, model: 'untrusted/model', provider: { only: ['untrusted'] } });
    assert.equal(requests.at(-1).body.model, 'openai/gpt-transcribe');
    assert.equal(requests.at(-1).body.provider, undefined);
  });

  await t.test('empty recognition remains an error and never becomes a question', async () => {
    reply = { status: 200, body: { text: '  ' } };
    const response = await post();
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /No speech/);
  });

  await t.test('provider failures are sanitized and do not leak keys or recording bytes', async () => {
    reply = { status: 401, body: { error: { message: `secret fixture-private-provider-key ${recording.audio}` } } };
    const response = await post();
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, /fixture-private-provider-key|Zml4dHVyZS1hdWRpby1ieXRlcw==/);
    assert.match(body, /temporarily unavailable/);
  });

  await t.test('missing configuration produces an actionable error without contacting the provider', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const count = requests.length;
    assert.equal((await post()).status, 503);
    assert.equal(requests.length, count);
    process.env.OPENROUTER_API_KEY = 'fixture-private-provider-key';
  });

  await t.test('disconnecting a transcription aborts its upstream request', async () => {
    reply = { hold: true };
    const started = new Promise(resolve => { providerStarted = resolve; });
    const closed = new Promise(resolve => { providerClosed = resolve; });
    const controller = new AbortController();
    const request = post(recording, true, controller.signal);
    await started;
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
    let timer;
    try {
      await Promise.race([closed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Provider request was not cancelled')), 2000); })]);
    } finally {
      clearTimeout(timer);
    }
  });
});
