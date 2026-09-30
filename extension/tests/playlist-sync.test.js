const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { webcrypto, createHash } = require('node:crypto');
const vm = require('node:vm');

const pageSource = readFileSync(join(__dirname, '../playlist-page.js'), 'utf8');
const syncSource = readFileSync(join(__dirname, '../playlist-sync.js'), 'utf8');
const contentSource = readFileSync(join(__dirname, '../content.js'), 'utf8');
const videoId = 'abcdefghijk';
const tokenItem = token => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
const videoItem = (id = videoId) => ({ playlistVideoRenderer: {
  videoId: id, setVideoId: 'entry-' + id, title: { runs: [{ text: 'A title' }] },
  shortBylineText: { simpleText: 'Author' }, lengthSeconds: '123', thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/test.jpg' }] }
} });
const initial = (items, expected = '319') => ({
  contents: { playlistVideoListRenderer: { playlistId: 'WL', contents: items } },
  header: { playlistHeaderRenderer: { numVideosText: { runs: [{ text: expected }, { text: ' videos' }] } } }
});
const response = (items, targetId = 'WL') => ({ onResponseReceivedActions: [{ appendContinuationItemsAction: { targetId, continuationItems: items } }] });
const batch = (ids = [videoId], next = null, expected = 319) => ({ success: true, entries: ids.map(id => ({ video: { id }, setVideoId: 'entry-' + id })), next, expected, skipped: 0 });

function environment() {
  const document = new EventTarget();
  document.cookie = 'SAPISID=test-cookie';
  const window = new EventTarget();
  const config = { INNERTUBE_CONTEXT: { client: { clientVersion: 'test' } }, INNERTUBE_CONTEXT_CLIENT_NAME: 1, SESSION_INDEX: 2, DELEGATED_SESSION_ID: 'test-channel' };
  window.ytcfg = { get: key => config[key] };
  const context = vm.createContext({
    window, document, location: { pathname: '/playlist', search: '?list=WL', origin: 'https://www.youtube.com' },
    URLSearchParams, AbortController, DOMException, TextEncoder, crypto: webcrypto, setTimeout, clearTimeout,
    fetch: async () => { throw new Error('Unexpected fetch'); }
  });
  vm.runInContext(pageSource + '\n' + syncSource, context);
  return context;
}

async function parse(data, request = {}) {
  const context = environment();
  context.fetch = async () => ({ ok: true, json: async () => data });
  return context.fetchYoutubePlaylistPage({ operation: 'page', playlistId: 'WL', runId: 'test', ...request });
}

test('private playlist requests authenticate in the page and keep account selection', async () => {
  const context = environment();
  context.fetch = async (url, options) => {
    assert.equal(url, '/youtubei/v1/browse?prettyPrint=false');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(JSON.parse(options.body).browseId, 'VLWL');
    assert.equal(options.headers['X-Goog-AuthUser'], '2');
    assert.equal(options.headers['X-Goog-PageId'], 'test-channel');
    const [timestamp, hash] = options.headers.Authorization.slice('SAPISIDHASH '.length).split('_');
    assert.equal(hash, createHash('sha1').update(timestamp + ' test-cookie https://www.youtube.com').digest('hex'));
    return { ok: true, json: async () => initial([videoItem(), tokenItem('next')]) };
  };
  const result = await context.fetchYoutubePlaylistPage({ operation: 'page', playlistId: 'WL', runId: 'test' });
  assert.equal(result.success, true);
  assert.equal(result.expected, 319);
  assert.equal(result.entries[0].video.duration, 123);
  assert.equal(result.entries[0].setVideoId, 'entry-' + videoId);
  assert.equal(result.next, 'next');
  assert.equal(JSON.stringify(result).includes('test-cookie'), false);
});

test('signed-out public playlists work without an authorization header', async () => {
  const context = environment();
  context.document.cookie = '';
  context.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return { ok: true, json: async () => initial([videoItem()]) };
  };
  assert.equal((await context.fetchYoutubePlaylistPage({ operation: 'page', playlistId: 'WL', runId: 'public' })).success, true);
});

test('continuations include only the requested playlist and finish with explicit null', async () => {
  const data = response([videoItem()]);
  data.onResponseReceivedActions.push(...response([videoItem('lmnopqrstuv'), tokenItem('unrelated')], 'recommendations').onResponseReceivedActions);
  const result = await parse(data, { continuation: 'page' });
  assert.equal(result.success, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.next, null);
});

test('a continuation nested after a refresh notification is followed', async () => {
  const result = await parse(initial([videoItem(), { continuationItemRenderer: {
    continuationEndpoint: { commandExecutorCommand: { commands: [
      { playlistVotingRefreshPopupCommand: { command: { signalAction: { signal: 'SOFT_RELOAD_PAGE' } } } },
      { continuationCommand: { token: 'nested-next', request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } }
    ] } }
  } }]));
  assert.equal(result.next, 'nested-next');
});

test('legacy continuations, localized totals and duration text are parsed', async () => {
  const item = videoItem();
  delete item.playlistVideoRenderer.lengthSeconds;
  item.playlistVideoRenderer.lengthText = { simpleText: '1:02:03' };
  const result = await parse(initial([item], '1\u202f234'));
  assert.equal(result.expected, 1234);
  assert.equal(result.entries[0].video.duration, 3723);
  const legacy = await parse({ continuationContents: { playlistVideoListContinuation: { contents: [videoItem()], continuations: [{ nextContinuationData: { continuation: 'older' } }] } } }, { continuation: 'page' });
  assert.equal(legacy.next, 'older');
});

test('unavailable entries with IDs are retained; anonymous placeholders are counted', async () => {
  const item = videoItem();
  item.playlistVideoRenderer.isPlayable = false;
  const result = await parse(initial([item, { playlistVideoRenderer: { title: { simpleText: 'Private video' } } }]));
  assert.equal(result.entries.length, 1);
  assert.equal(result.skipped, 1);
});

test('an explicit empty playlist is complete', async () => {
  const result = await parse(initial([], '0'));
  assert.equal(result.success, true);
  assert.equal(result.next, null);
  assert.equal(result.expected, 0);
});

for (const data of [
  {}, response([videoItem()], 'unrelated'),
  { onResponseReceivedActions: [{ appendContinuationItemsAction: { targetId: 'WL' } }] },
  response([{ continuationItemRenderer: {} }]), response([{ unexpectedRenderer: {} }]),
  response([tokenItem('one'), tokenItem('two')]),
  { alerts: [{ alertRenderer: { type: 'ERROR', text: { simpleText: 'Playlist does not exist' } } }] }
]) {
  test('malformed, unrelated or failed responses never become an empty completed playlist: ' + JSON.stringify(data), async () => {
    assert.equal((await parse(data, { continuation: 'page' })).success, false);
  });
}

test('HTTP rate limits are retryable and HTTP authentication failures are not', async () => {
  for (const status of [429, 503, 403]) {
    const context = environment();
    context.fetch = async () => ({ ok: false, status });
    const result = await context.fetchYoutubePlaylistPage({ operation: 'page', playlistId: 'WL', runId: 'test' });
    assert.equal(result.retryable, status !== 403);
  }
});

test('cleanup requires YouTube confirmation and uses the playlist entry ID', async () => {
  const context = environment();
  let status = 'STATUS_FAILED';
  context.fetch = async (url, options) => {
    assert.equal(url, '/youtubei/v1/browse/edit_playlist?prettyPrint=false');
    assert.deepEqual(JSON.parse(options.body).actions, [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: 'entry-id' }]);
    return { ok: true, json: async () => ({ status }) };
  };
  const request = { operation: 'remove', playlistId: 'WL', runId: 'cleanup', setVideoId: 'entry-id' };
  assert.equal((await context.fetchYoutubePlaylistPage(request)).success, false);
  status = 'STATUS_SUCCEEDED';
  assert.equal((await context.fetchYoutubePlaylistPage(request)).success, true);
});

function client(request, getPlaylistId = () => 'WL') {
  return environment().window.ytbPlaylistSync.create({ request, getPlaylistId });
}

const options = (extra = {}) => ({ playlistId: 'WL', runId: 'test', signal: new AbortController().signal, onPage: async () => {}, ...extra });

test('309 / 319 finishes immediately when continuations end', async () => {
  const pages = [];
  const sync = client(async request => {
    pages.push(request.continuation);
    return request.continuation ? batch(Array.from({ length: 9 }, (_, i) => 'last-' + i)) : batch(Array.from({ length: 300 }, (_, i) => 'video-' + i), 'last');
  });
  const result = await sync.start(options());
  assert.deepEqual(pages, [null, 'last']);
  assert.equal(result.received, 309);
  assert.equal(result.expected, 319);
  assert.equal(result.complete, true);
});

test('displayed total never stops an outstanding continuation early', async () => {
  const sync = client(async request => request.continuation ? batch(['two'], null, 1) : batch(['one'], 'next', 1));
  assert.equal((await sync.start(options())).received, 2);
});

test('repeated tokens fail before accepting the duplicate page', async () => {
  const accepted = [];
  const sync = client(async () => batch(['one'], 'same'));
  await assert.rejects(sync.start(options({ onPage: page => accepted.push(page) })), /repeated a playlist page/);
  assert.equal(accepted.length, 1);
});

test('stop aborts the page request and discards late responses', async () => {
  let finish;
  let started;
  let stops = 0;
  const pending = new Promise(resolve => { started = resolve; });
  const sync = client(request => {
    if (request.operation === 'stop') { stops++; return { success: true }; }
    started();
    return new Promise(resolve => { finish = resolve; });
  });
  const controller = new AbortController();
  let accepted = 0;
  const running = sync.start(options({ signal: controller.signal, onPage: () => { accepted++; } }));
  await pending;
  controller.abort();
  await assert.rejects(running, { name: 'AbortError' });
  finish(batch());
  await Promise.resolve();
  assert.equal(accepted, 0);
  assert.equal(stops, 1);
});

test('navigation during a request discards its result', async () => {
  let playlistId = 'WL';
  const sync = client(async () => { playlistId = 'other'; return batch(); }, () => playlistId);
  await assert.rejects(sync.start(options()), { name: 'AbortError' });
});

test('retryable failures retry the same continuation', async () => {
  const context = environment();
  context.setTimeout = callback => setTimeout(callback, 0);
  let calls = 0;
  const sync = context.window.ytbPlaylistSync.create({ getPlaylistId: () => 'WL', request: async () => {
    calls++;
    return calls < 3 ? { success: false, retryable: true } : batch();
  } });
  assert.equal((await sync.start(options())).complete, true);
  assert.equal(calls, 3);
});

function integration(request) {
  const context = environment();
  const calls = [];
  const panel = { setSyncStatus: () => {}, setCurrentPlaylistId: () => {}, loadPlaylists: async () => {}, loadVideos: async () => {} };
  context.window.api = {
    startSync: async () => ({ run: { id: 7 }, playlist: { id: 1 } }),
    sendSyncBatch: async (runId, videos) => { calls.push(['batch', videos.map(video => video.id)]); },
    finalizeSync: async (runId, playlistId, options) => { calls.push(['finalize', options.skipMissingCheck]); return { run: {} }; },
    failSync: async () => { calls.push(['fail']); },
    getYoutubeCleanupCandidateVideos: async () => [{ id: 'cleanup0001' }],
    markYoutubeCleanup: async (playlistId, videoId, state) => { calls.push(['cleanup', videoId, state]); }
  };
  context.chrome = { runtime: { sendMessage: async message => { calls.push([message.operation]); return request(message); } } };
  context.panelApi = panel;
  context.safeStorageSet = () => {};
  context.console = { warn: () => {}, error: () => {} };
  context.getCurrentPlaylistPageSourceId = () => 'WL';
  context.playlistSync = context.window.ytbPlaylistSync.create({ request: context.chrome.runtime.sendMessage, getPlaylistId: () => 'WL' });
  vm.runInContext(`let activePlaylistSync = null; const SYNC_MAX_DURATION_MS = 1200000; const SYNC_IDLE_TIMEOUT_MS = 75000; const SYNC_PROGRESS_STATUS_KEY = 'progress'; const SYNC_CLEANUP_STATUS_KEY = 'cleanup'; function delay() { return Promise.resolve(); }\n` + contentSource.slice(contentSource.indexOf('  function createSyncStopError('), contentSource.indexOf('  function updateWatchControlsAfterPanelChange(')), context);
  return { context, calls, run: (cleanupYoutube = false) => context.performPlaylistSync({ playlistId: 1, source: { sourceId: 'WL' }, cleanupYoutube, panel }) };
}

test('integration finalizes a mismatched total without asking for confirmation', async () => {
  const app = integration(async () => batch());
  assert.equal((await app.run()).success, true);
  assert.ok(app.calls.some(call => call[0] === 'finalize' && call[1] === false));
});

test('integration never reconciles missing videos after a failed later page', async () => {
  const app = integration(async request => request.continuation ? { success: false, error: 'Network failed' } : batch([videoId], 'next'));
  assert.equal((await app.run()).success, false);
  assert.ok(app.calls.some(call => call[0] === 'fail'));
  assert.ok(!app.calls.some(call => call[0] === 'finalize'));
});

test('integration skips missing reconciliation when YouTube omits video IDs', async () => {
  const app = integration(async () => ({ ...batch(), skipped: 1 }));
  assert.equal((await app.run()).success, true);
  assert.ok(app.calls.some(call => call[0] === 'finalize' && call[1] === true));
});

test('cleanup waits for all pages and does not import removed entries', async () => {
  const app = integration(async request => {
    if (request.operation === 'remove') return { success: true };
    return request.continuation ? batch(['cleanup0001']) : batch([videoId], 'next');
  });
  assert.equal((await app.run(true)).success, true);
  assert.deepEqual(app.calls.filter(call => ['page', 'remove'].includes(call[0])).map(call => call[0]), ['page', 'page', 'remove']);
  assert.deepEqual(Array.from(app.calls.find(call => call[0] === 'batch')[1]), [videoId]);
});

test('integration deduplicates overlapping page entries before saving', async () => {
  const app = integration(async request => request.continuation ? batch([videoId, 'lmnopqrstuv']) : batch([videoId], 'next'));
  assert.equal((await app.run()).success, true);
  assert.deepEqual(app.calls.filter(call => call[0] === 'batch').flatMap(call => Array.from(call[1])), [videoId, 'lmnopqrstuv']);
});

test('integration cannot finalize when saving a batch fails', async () => {
  const app = integration(async () => batch());
  app.context.window.api.sendSyncBatch = async () => { throw new Error('API unavailable'); };
  assert.equal((await app.run()).success, false);
  assert.ok(!app.calls.some(call => call[0] === 'finalize'));
});

test('an explicitly empty source can reconcile the local playlist', async () => {
  const app = integration(async () => batch([], null, 0));
  assert.equal((await app.run()).success, true);
  assert.ok(app.calls.some(call => call[0] === 'finalize' && call[1] === false));
});

test('stopping the integration fails the server run and never reconciles missing videos', async () => {
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  const app = integration(request => {
    if (request.operation === 'stop') return { success: true };
    started();
    return new Promise(() => {});
  });
  const running = app.run();
  await pending;
  app.context.stopActivePlaylistSync('Stopped by user');
  const result = await running;
  assert.equal(result.stopped, true);
  assert.ok(app.calls.some(call => call[0] === 'fail'));
  assert.ok(!app.calls.some(call => call[0] === 'finalize'));
});

test('cleanup failure is never marked as removed', async () => {
  const app = integration(async request => request.operation === 'remove' ? { success: false, error: 'Not confirmed' } : batch(['cleanup0001']));
  await app.run(true);
  assert.deepEqual(app.calls.filter(call => call[0] === 'cleanup'), [['cleanup', 'cleanup0001', 'failed']]);
});

test('page stop aborts an active fetch and rejects a request cancelled before dispatch', async () => {
  const context = environment();
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  context.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    started();
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
  });
  const request = { operation: 'page', playlistId: 'WL', runId: 'stop-me' };
  const running = context.fetchYoutubePlaylistPage(request);
  await pending;
  await context.fetchYoutubePlaylistPage({ ...request, operation: 'stop' });
  assert.equal((await running).retryable, false);
  assert.equal((await context.fetchYoutubePlaylistPage(request)).success, false);
});

test('the playlist bridge runs the self-contained function in the sender document only', async () => {
  const page = environment();
  page.fetch = async () => ({ ok: true, json: async () => initial([videoItem()]) });
  const source = readFileSync(join(__dirname, '../background.js'), 'utf8');
  const start = source.indexOf('async function fetchPlaylistForTab(');
  const end = source.indexOf('\nchrome.runtime.onMessage', start);
  let target;
  const background = vm.createContext({
    fetchYoutubePlaylistPage: page.fetchYoutubePlaylistPage,
    isYoutubeTab: tab => tab?.url?.startsWith('https://www.youtube.com/'),
    chrome: { scripting: { executeScript: async options => {
      target = options.target;
      assert.equal(options.world, 'MAIN');
      const func = vm.runInContext('(' + options.func.toString() + ')', page);
      return [{ result: await func(...JSON.parse(JSON.stringify(options.args))) }];
    } } }
  });
  vm.runInContext(source.slice(start, end), background);
  const sender = { tab: { id: 42, url: 'https://www.youtube.com/playlist?list=WL' }, frameId: 0, documentId: 'current-document' };
  const request = { operation: 'page', playlistId: 'WL', runId: 'bridge' };
  assert.equal((await background.fetchPlaylistForTab(request, sender)).entries[0].video.id, videoId);
  assert.deepEqual(JSON.parse(JSON.stringify(target)), { tabId: 42, documentIds: ['current-document'] });
  await assert.rejects(background.fetchPlaylistForTab(request, { ...sender, frameId: 1 }), /current YouTube playlist/);
  await assert.rejects(background.fetchPlaylistForTab({ ...request, operation: 'remove', setVideoId: '' }, sender), /entry ID/);
  await assert.rejects(background.fetchPlaylistForTab({ ...request, continuation: {} }, sender), /continuation/);
});
