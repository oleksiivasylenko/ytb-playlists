const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('Ask dictation browser interactions', async t => {
  const root = path.join(__dirname, '..');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html><head><title>Ask dictation test</title></head><body style="margin:32px"><div id="ytb-ask-panel"><textarea class="ytb-ask-textarea" rows="4" placeholder="Ask about this video and loaded comments"></textarea><div class="ytb-ask-controls"><button class="ytb-ask-panel-btn ytb-ask-submit-btn">Ask about</button></div><div class="ytb-ask-status" role="status"></div></div></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const flags = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  if (process.env.DICTATION_TEST_WAV) flags.push(`--use-file-for-fake-audio-capture=${path.resolve(process.env.DICTATION_TEST_WAV)}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: flags });
  const context = await browser.newContext({ viewport: { width: 1080, height: 720 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });

  async function fixture(options = {}) {
    const page = await context.newPage();
    await page.goto(origin);
    await page.addStyleTag({ path: path.join(root, 'content.css') });
    await page.addScriptTag({ path: path.join(root, 'ask-dictation.js') });
    await page.evaluate(options => {
      const test = window.fixture = { calls: [], submissions: [], stoppedTracks: 0, aborted: 0, current: true, amplitude: 40, options };
      const nativeTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 300000) test.reachLimit = callback;
        if (delay === 75000) test.reachTimeout = callback;
        return nativeTimeout(callback, delay, ...args);
      };
      if (!options.realMedia) {
        const track = { stop() { test.stoppedTracks++; }, addEventListener(name, callback) { if (name === 'ended') test.disconnect = callback; } };
        const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
        navigator.mediaDevices.getUserMedia = () => {
          if (options.denied) return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
          if (options.pendingPermission) return new Promise(resolve => { test.allowPermission = () => resolve(stream); });
          return Promise.resolve(stream);
        };
        window.MediaRecorder = class {
          static isTypeSupported(type) { return type.startsWith('audio/webm'); }
          constructor(stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
          start() { this.state = 'recording'; }
          stop() {
            this.state = 'inactive';
            queueMicrotask(() => {
              this.ondataavailable?.({ data: new Blob(['fixture-recording'], { type: this.mimeType }) });
              this.onstop?.();
            });
          }
        };
        window.AudioContext = class {
          createAnalyser() {
            return { fftSize: 512, getByteTimeDomainData(buffer) { for (let index = 0; index < buffer.length; index++) buffer[index] = 128 + (index % 2 ? 1 : -1) * test.amplitude; } };
          }
          createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
          resume() { return Promise.resolve(); }
          close() { return Promise.resolve(); }
        };
      }
      window.api = {
        transcribeAudio(audio, mimeType, options) {
          test.calls.push({ audio, mimeType });
          if (test.options.pendingTranscription) return new Promise((resolve, reject) => {
            test.resolveTranscription = () => resolve({ text: 'Запізнілий текст.' });
            options.signal.addEventListener('abort', () => { test.aborted++; reject(new DOMException('Cancelled', 'AbortError')); });
          });
          if (test.options.providerError) return Promise.reject(new Error(test.options.providerError));
          return Promise.resolve({ text: test.options.empty ? '' : 'Який головний висновок відео?' });
        }
      };
      const panel = document.getElementById('ytb-ask-panel');
      const textarea = panel.querySelector('textarea');
      textarea.value = options.draft || '';
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      const status = panel.querySelector('.ytb-ask-status');
      test.ui = window.ytbAskDictation.create({
        panel, textarea, controls: panel.querySelector('.ytb-ask-controls'),
        onSubmit: () => test.submissions.push(textarea.value),
        onStatus: (text, state) => { status.textContent = text; status.dataset.state = state || ''; },
        isCurrent: () => test.current
      });
    }, options);
    t.after(() => page.close());
    return page;
  }

  async function start(page) {
    await page.getByRole('button', { name: 'Dictate a question', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('ytb-ask-panel').dataset.dictationState === 'recording');
  }

  async function idle(page) {
    await page.waitForFunction(() => document.getElementById('ytb-ask-panel').dataset.dictationState === 'idle');
  }

  await t.test('Stop transcribes into the draft without submitting, then allows another recording', async () => {
    const page = await fixture({ draft: 'Моє запитання:' });
    await start(page);
    await page.getByRole('button', { name: 'Stop and transcribe', exact: true }).click();
    await idle(page);
    assert.equal(await page.locator('textarea').inputValue(), 'Моє запитання: Який головний висновок відео?');
    assert.deepEqual(await page.evaluate(() => fixture.submissions), []);
    assert.equal(await page.evaluate(() => fixture.stoppedTracks), 1);
    await start(page);
    await page.getByRole('button', { name: 'Cancel dictation' }).click();
    assert.equal(await page.evaluate(() => fixture.calls.length), 1);
  });

  await t.test('the arrow transcribes and submits exactly once', async () => {
    const page = await fixture();
    await start(page);
    await page.getByRole('button', { name: 'Transcribe and send question' }).click();
    await idle(page);
    assert.deepEqual(await page.evaluate(() => fixture.submissions), ['Який головний висновок відео?']);
    assert.equal(await page.evaluate(() => fixture.calls.length), 1);
  });

  await t.test('the real Ask panel sends dictation through the existing question handler with its selected context', async () => {
    const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
    const handlers = source.slice(source.indexOf('  async function handleAskAboutClick('), source.indexOf('  function mountYtbAskPanel('));
    for (const mode of ['video', 'comments']) {
      const page = await fixture();
      await page.evaluate(() => {
        fixture.ui.destroy();
        document.getElementById('ytb-ask-panel').remove();
        fixture.askRequests = [];
        window.api.askVideo = async (videoId, payload) => {
          fixture.askRequests.push({ videoId, payload });
          return { answer: 'Fixture answer.', transcriptIncluded: payload.includeTranscript, commentCount: 1 };
        };
        window.getVideoIdFromUrl = () => 'abcdefghijk';
        window.loadAskHistory = async () => {};
        window.stopActiveCommentsSync = () => {};
        window.setAskStatus = (panel, text) => { panel.querySelector('.ytb-ask-status').textContent = text; };
        window.ensureCurrentVideoStored = async () => {};
        window.updateAskCommentStats = () => ({ comments: [{ text: 'Fixture comment.' }], expected: 1 });
        window.getAskMode = panel => panel.dataset.askMode;
        window.getTranscriptForAsk = async (videoId, panel) => panel.dataset.askMode === 'video' ? 'Fixture video transcript.' : '';
        window.getCurrentVideoTitleFromPage = () => 'Fixture video';
        window.getCurrentVideoAuthorFromPage = () => 'Fixture author';
        window.withWatchTimeout = promise => promise;
        window.createAskHistoryEntry = panel => {
          const entry = document.createElement('div');
          panel.querySelector('.ytb-ask-history').append(entry);
          return entry;
        };
        window.updateAskHistoryEntry = (entry, text) => { if (entry) entry.textContent = text; };
        window.setAskTranscriptReady = () => {};
        window.logContentError = () => {};
        window.setAskMode = (panel, mode) => { panel.dataset.askMode = mode; };
        window.updateAskModeSwitch = () => {};
        window.handleSyncCommentsClick = () => {};
      });
      await page.addScriptTag({ content: handlers });
      await page.evaluate(mode => {
        const panel = window.buildYtbAskPanel();
        panel.hidden = false;
        panel.dataset.askMode = mode;
        document.body.append(panel);
      }, mode);
      await start(page);
      await page.getByRole('button', { name: 'Transcribe and send question' }).click();
      await page.waitForFunction(() => fixture.askRequests.length === 1 && document.querySelector('.ytb-ask-history').textContent === 'Fixture answer.');
      const request = await page.evaluate(() => fixture.askRequests[0]);
      assert.equal(request.videoId, 'abcdefghijk');
      assert.equal(request.payload.question, 'Який головний висновок відео?');
      assert.deepEqual(request.payload.comments, [{ text: 'Fixture comment.' }]);
      assert.equal(request.payload.includeTranscript, mode === 'video');
      assert.equal(request.payload.transcript, mode === 'video' ? 'Fixture video transcript.' : '');
      assert.equal(request.payload.title, 'Fixture video');
      assert.equal(await page.locator('textarea').inputValue(), '');
    }
  });

  await t.test('cancel and Escape discard audio without uploading or changing the draft', async () => {
    const page = await fixture({ draft: 'Чернетка' });
    await start(page);
    await page.getByRole('button', { name: 'Cancel dictation' }).click();
    await start(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('textarea').inputValue(), 'Чернетка');
    assert.equal(await page.evaluate(() => fixture.calls.length), 0);
    assert.equal(await page.evaluate(() => fixture.stoppedTracks), 2);
  });

  await t.test('cancelled microphone permission cannot start a late recording', async () => {
    const page = await fixture({ pendingPermission: true });
    await page.getByRole('button', { name: 'Dictate a question', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel dictation' }).click();
    await page.evaluate(() => fixture.allowPermission());
    await page.waitForFunction(() => fixture.stoppedTracks === 1);
    assert.equal(await page.evaluate(() => document.getElementById('ytb-ask-panel').dataset.dictationState), 'idle');
    assert.equal(await page.evaluate(() => fixture.calls.length), 0);
  });

  await t.test('permission denial gives a useful error and preserves the draft', async () => {
    const page = await fixture({ draft: 'Чернетка', denied: true });
    await page.getByRole('button', { name: 'Dictate a question', exact: true }).click();
    await idle(page);
    assert.match(await page.locator('.ytb-ask-status').textContent(), /Allow microphone access for YouTube/);
    assert.equal(await page.locator('textarea').inputValue(), 'Чернетка');
  });

  await t.test('an unexpectedly removed panel also releases its microphone', async () => {
    const page = await fixture();
    await start(page);
    await page.evaluate(() => document.getElementById('ytb-ask-panel').remove());
    await page.waitForFunction(() => fixture.stoppedTracks === 1);
    assert.equal(await page.evaluate(() => fixture.calls.length), 0);
  });

  await t.test('microphone disconnection cancels capture without uploading a partial question', async () => {
    const page = await fixture({ draft: 'Чернетка' });
    await start(page);
    await page.evaluate(() => fixture.disconnect());
    await idle(page);
    assert.equal(await page.evaluate(() => fixture.stoppedTracks), 1);
    assert.equal(await page.evaluate(() => fixture.calls.length), 0);
    assert.equal(await page.locator('textarea').inputValue(), 'Чернетка');
    assert.match(await page.locator('.ytb-ask-status').textContent(), /disconnected/);
  });

  await t.test('empty speech and upstream errors never send a question', async () => {
    for (const options of [{ empty: true }, { providerError: 'Provider unavailable.' }]) {
      const page = await fixture({ ...options, draft: 'Чернетка' });
      await start(page);
      await page.getByRole('button', { name: 'Transcribe and send question' }).click();
      await idle(page);
      assert.equal(await page.locator('textarea').inputValue(), 'Чернетка');
      assert.deepEqual(await page.evaluate(() => fixture.submissions), []);
      assert.equal(await page.locator('.ytb-ask-status').getAttribute('data-state'), 'error');
    }
  });

  await t.test('cancel during transcription aborts the request and ignores late results', async () => {
    const page = await fixture({ pendingTranscription: true, draft: 'Чернетка' });
    await start(page);
    await page.getByRole('button', { name: 'Transcribe and send question' }).click();
    await page.waitForFunction(() => fixture.calls.length === 1);
    await page.getByRole('button', { name: 'Cancel dictation' }).click();
    await page.evaluate(() => fixture.resolveTranscription());
    assert.equal(await page.evaluate(() => fixture.aborted), 1);
    assert.equal(await page.locator('textarea').inputValue(), 'Чернетка');
    assert.deepEqual(await page.evaluate(() => fixture.submissions), []);
  });

  await t.test('destroying a panel releases its microphone and blocks old transcription results', async () => {
    const page = await fixture();
    await start(page);
    await page.evaluate(() => { fixture.ui.destroy(); document.getElementById('ytb-ask-panel').remove(); });
    assert.equal(await page.evaluate(() => fixture.stoppedTracks), 1);
    assert.equal(await page.evaluate(() => fixture.calls.length), 0);
    const pending = await fixture({ pendingTranscription: true });
    await start(pending);
    await pending.getByRole('button', { name: 'Transcribe and send question' }).click();
    await pending.waitForFunction(() => fixture.calls.length === 1);
    await pending.evaluate(() => { fixture.current = false; fixture.ui.destroy(); fixture.resolveTranscription(); });
    assert.deepEqual(await pending.evaluate(() => fixture.submissions), []);
    assert.equal(await pending.evaluate(() => fixture.aborted), 1);
  });

  await t.test('limits stop for review and transcription timeouts preserve the draft', async () => {
    const page = await fixture();
    await start(page);
    await page.evaluate(() => fixture.reachLimit());
    await idle(page);
    assert.equal(await page.evaluate(() => fixture.calls.length), 1);
    assert.deepEqual(await page.evaluate(() => fixture.submissions), []);
    const pending = await fixture({ pendingTranscription: true, draft: 'Чернетка' });
    await start(pending);
    await pending.getByRole('button', { name: 'Stop and transcribe', exact: true }).click();
    await pending.waitForFunction(() => fixture.calls.length === 1);
    await pending.evaluate(() => fixture.reachTimeout());
    await idle(pending);
    assert.equal(await pending.locator('textarea').inputValue(), 'Чернетка');
    assert.equal(await pending.locator('.ytb-ask-status').getAttribute('data-state'), 'error');
    assert.match(await pending.locator('.ytb-ask-status').textContent(), /timed out/);
  });

  await t.test('a result arriving after navigation leaves the old panel idle without sending', async () => {
    const page = await fixture({ pendingTranscription: true, draft: 'Чернетка' });
    await start(page);
    await page.getByRole('button', { name: 'Transcribe and send question' }).click();
    await page.waitForFunction(() => fixture.calls.length === 1);
    await page.evaluate(() => { fixture.current = false; fixture.resolveTranscription(); });
    await idle(page);
    assert.equal(await page.locator('textarea').inputValue(), 'Чернетка');
    assert.equal(await page.evaluate(() => fixture.submissions.length), 0);
  });

  await t.test('dictation respects the active Ask request and does not silently truncate long questions', async () => {
    const page = await fixture({ draft: 'x'.repeat(4000) });
    await page.evaluate(() => { document.getElementById('ytb-ask-panel').dataset.askBusy = '1'; fixture.ui.refresh(); });
    assert.equal(await page.getByRole('button', { name: 'Dictate a question', exact: true }).isDisabled(), true);
    await page.evaluate(() => { delete document.getElementById('ytb-ask-panel').dataset.askBusy; fixture.ui.refresh(); });
    await start(page);
    await page.getByRole('button', { name: 'Transcribe and send question' }).click();
    await idle(page);
    assert.equal(await page.evaluate(() => fixture.submissions.length), 0);
    assert.ok((await page.locator('textarea').inputValue()).length > 4000);
    assert.match(await page.locator('.ytb-ask-status').textContent(), /Shorten/);
  });

  await t.test('recording layout fits narrow screens and supports dark mode', async () => {
    const page = await fixture();
    await start(page);
    await page.waitForTimeout(350);
    const output = process.env.DICTATION_ARTIFACT_DIR;
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      await page.locator('#ytb-ask-panel').screenshot({ path: path.join(output, 'recording-light.png') });
    }
    await page.evaluate(() => { document.documentElement.setAttribute('dark', ''); document.body.style.background = '#0f0f0f'; });
    if (output) await page.locator('#ytb-ask-panel').screenshot({ path: path.join(output, 'recording-dark.png') });
    await page.setViewportSize({ width: 390, height: 700 });
    await page.evaluate(() => { document.documentElement.removeAttribute('dark'); document.body.style.background = 'white'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (output) await page.locator('#ytb-ask-panel').screenshot({ path: path.join(output, 'recording-narrow.png') });
    await page.evaluate(() => fixture.ui.destroy());
  });

  await t.test('Chrome records real WebM audio through MediaRecorder', async () => {
    const page = await fixture({ realMedia: true });
    await start(page);
    await page.waitForTimeout(process.env.DICTATION_TEST_WAV ? 6500 : 1200);
    await page.getByRole('button', { name: 'Stop and transcribe', exact: true }).click();
    await idle(page);
    const call = await page.evaluate(() => fixture.calls[0]);
    assert.match(call.mimeType, /^audio\/webm/);
    const bytes = Buffer.from(call.audio, 'base64');
    assert.ok(bytes.length > 1000);
    assert.equal(bytes.subarray(0, 4).toString('hex'), '1a45dfa3');
    assert.equal(await page.evaluate(() => fixture.submissions.length), 0);
    if (process.env.DICTATION_ARTIFACT_DIR) fs.writeFileSync(path.join(process.env.DICTATION_ARTIFACT_DIR, 'browser-recording.webm'), bytes);
  });
});
