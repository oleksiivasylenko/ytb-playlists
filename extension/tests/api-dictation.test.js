const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

function bridge(fetchRequest) {
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  const messages = [];
  const sender = { tab: { id: 7 }, frameId: 0, documentId: 'video-document' };
  const background = vm.createContext({
    URL, Headers, AbortController,
    fetch: fetchRequest,
    apiTransport: { fetch: fetchRequest },
    YTB_PLAYLISTS_CONFIG: { apiBaseUrl: 'https://fixture.example/api', apiToken: 'fixture-api-token' }
  });
  vm.runInContext(source.slice(source.indexOf('function getApiConfig('), source.indexOf('function getPublicSummaryUrl(')), background);
  vm.runInContext(source.slice(source.indexOf('const activeApiRequests = new Map();'), source.indexOf('function postPortMessage(')), background);
  const context = vm.createContext({
    window: {}, crypto, DOMException,
    chrome: { runtime: { sendMessage(message, callback) {
      messages.push(message);
      if (message.action === 'abortApiFetch') callback(background.abortApiFetch(message, sender));
      else background.proxyApiFetch(message, sender).then(callback, error => callback({ success: false, error: error.message }));
    } } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../api.js'), 'utf8'), context);
  return { api: context.window.api, background, messages };
}

test('dictation passes serializable audio through the service worker with application authentication', async () => {
  let captured;
  const client = bridge(async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ text: 'Розкажи про відео.', model: 'openai/gpt-transcribe' }), { headers: { 'Content-Type': 'application/json' } });
  });
  const result = await client.api.transcribeAudio('YXVkaW8=', 'audio/webm;codecs=opus');
  assert.equal(result.text, 'Розкажи про відео.');
  assert.equal(captured.url, 'https://fixture.example/api/dictation/transcribe');
  assert.equal(captured.options.headers.get('X-API-Token'), 'fixture-api-token');
  assert.equal(captured.options.headers.get('Authorization'), null);
  assert.equal(captured.options.method, 'POST');
  assert.deepEqual(JSON.parse(captured.options.body), { audio: 'YXVkaW8=', mimeType: 'audio/webm;codecs=opus' });
  assert.equal(captured.options.redirect, 'error');
});

test('cancelling dictation aborts only its own document request and releases the proxy', async () => {
  let resolveStarted;
  let signal;
  const started = new Promise(resolve => { resolveStarted = resolve; });
  const client = bridge((url, options) => new Promise((resolve, reject) => {
    signal = options.signal;
    resolveStarted();
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
  }));
  const controller = new AbortController();
  const request = client.api.transcribeAudio('YXVkaW8=', 'audio/webm', { signal: controller.signal });
  await started;
  const requestId = client.messages[0].requestId;
  client.background.abortApiFetch({ requestId }, { tab: { id: 8 }, documentId: 'other-document' });
  assert.equal(signal.aborted, false);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('activeApiRequests.size', client.background), 0);
});

test('pre-cancelled requests never upload audio, and failed transcriptions remain errors', async () => {
  let calls = 0;
  const client = bridge(async () => {
    calls++;
    return new Response('{"error":"Transcription timed out."}', { status: 504 });
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.api.transcribeAudio('YXVkaW8=', 'audio/webm', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  await assert.rejects(client.api.transcribeAudio('YXVkaW8=', 'audio/webm'), /Transcription timed out/);
  assert.equal(calls, 1);
});
