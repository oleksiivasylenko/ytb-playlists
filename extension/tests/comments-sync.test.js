const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const pageSource = readFileSync(join(__dirname, '../comments-page.js'), 'utf8');
const syncSource = readFileSync(join(__dirname, '../comments-sync.js'), 'utf8');
const videoId = 'SG3tFU9z0rE';
const tokenItem = token => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
const legacyComment = (id, content = id) => ({ commentRenderer: { commentId: id, authorText: { simpleText: '@author' }, contentText: { runs: [{ text: content }] } } });
const response = (items, targetId = 'comments-section') => ({ onResponseReceivedEndpoints: [{ appendContinuationItemsAction: { targetId, continuationItems: items } }] });

function environment() {
  const document = new EventTarget();
  const window = new EventTarget();
  window.ytcfg = { get: key => key === 'INNERTUBE_CONTEXT' ? { client: { clientVersion: 'test' } } : 1 };
  const context = vm.createContext({
    window, document, location: { pathname: '/watch', search: '?v=' + videoId },
    URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout,
    fetch: async () => { throw new Error('Unexpected fetch'); }
  });
  vm.runInContext(pageSource + '\n' + syncSource, context);
  return context;
}

async function parse(data, request = {}) {
  const context = environment();
  context.fetch = async (url, options) => {
    assert.equal(url, '/youtubei/v1/next?prettyPrint=false');
    assert.equal(options.method, 'POST');
    return { ok: true, json: async () => data };
  };
  return context.fetchYoutubeCommentsPage({ videoId, runId: 'test', continuation: 'page', phase: 'comments', ...request });
}

test('bootstrap chooses only the comments feed, ignoring recommendation continuations', async () => {
  const result = await parse({ contents: { sections: [
    { itemSectionRenderer: { targetId: 'related', contents: [tokenItem('videos')] } },
    { itemSectionRenderer: { sectionIdentifier: 'comment-item-section', contents: [tokenItem('comments')] } }
  ] } }, { continuation: undefined });
  assert.equal(result.next.length, 1);
  assert.equal(result.next[0].token, 'comments');
  assert.equal(result.next[0].phase, 'header');
});

test('header selects newest regardless of localized labels and retains the displayed total', async () => {
  const result = await parse(response([{ commentsHeaderRenderer: {
    countText: { runs: [{ text: '1,234' }, { text: ' Comments' }] },
    sortMenu: { sortFilterSubMenuRenderer: { subMenuItems: [
      { title: 'Beliebteste', serviceEndpoint: { continuationCommand: { token: 'top' } } },
      { title: 'Neueste', serviceEndpoint: { continuationCommand: { token: 'newest' } } }
    ] } }
  } }, legacyComment('featured'), tokenItem('top-next')]), { phase: 'header' });
  assert.equal(result.expected, 1234);
  assert.equal(result.comments.length, 0);
  assert.equal(result.next.length, 1);
  assert.equal(result.next[0].token, 'newest');
});

test('modern comment entities and nested reply continuations are collected without UI actions', async () => {
  const data = response([
    { commentThreadRenderer: {
      commentViewModel: { commentViewModel: { commentKey: 'entity', commentId: 'c1' } },
      replies: { commentRepliesRenderer: { subThreads: [tokenItem('replies')] } }
    } }, tokenItem('next')
  ]);
  data.frameworkUpdates = { entityBatchUpdate: { mutations: [{ entityKey: 'entity', payload: { commentEntityPayload: {
    properties: { commentId: 'c1', content: { content: 'Full text\nincluding emoji 🙂' }, publishedTime: '1 day ago', replyLevel: 0 },
    author: { displayName: '@test' }, toolbar: { likeCountNotliked: '3' }
  } } }] } };
  const result = await parse(data);
  assert.equal(result.comments[0].text, 'Full text\nincluding emoji 🙂');
  assert.equal(result.comments[0].likes, '3');
  assert.equal(result.comments[0].reply, false);
  assert.equal(result.next.find(next => next.token === 'replies').reply, true);
  assert.equal(result.next.find(next => next.token === 'next').reply, false);
});

test('legacy replies, duplicates and unrelated commands are handled', async () => {
  const data = response([legacyComment('r1'), legacyComment('r1'), tokenItem('reply-next')], 'comment-replies-item-c1');
  data.onResponseReceivedEndpoints.push(...response([tokenItem('videos')], 'related').onResponseReceivedEndpoints);
  const result = await parse(data, { reply: true });
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].reply, true);
  assert.equal(result.next.length, 1);
  assert.equal(result.next[0].reply, true);
});

test('unknown response and missing comment entities fail instead of reporting completion', async () => {
  assert.equal((await parse({})).success, false);
  const result = await parse(response([{ commentViewModel: { commentKey: 'missing', commentId: 'c1' } }]));
  assert.equal(result.success, false);
  assert.match(result.error, /omitted comment text/);
});

test('empty final page finishes; a disabled comments message is recognized', async () => {
  const empty = await parse(response([]));
  assert.equal(empty.success, true);
  assert.equal(empty.next.length, 0);
  const disabled = await parse({ contents: { itemSectionRenderer: { sectionIdentifier: 'comment-item-section', contents: [{ messageRenderer: { text: { simpleText: 'Comments disabled' } } }] } } }, { continuation: undefined });
  assert.equal(disabled.success, true);
  assert.equal(disabled.unavailable, true);
});

test('page cancellation aborts the active fetch and can precede the request', async () => {
  const context = environment();
  let aborted = false;
  context.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); });
  });
  const request = { videoId, runId: 'cancel' };
  const pending = context.fetchYoutubeCommentsPage(request);
  await context.fetchYoutubeCommentsPage({ ...request, operation: 'stop' });
  assert.equal((await pending).success, false);
  assert.equal(aborted, true);
  assert.equal((await context.fetchYoutubeCommentsPage(request)).success, false);
});

test('navigation aborts active page requests', async () => {
  const context = environment();
  context.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const pending = context.fetchYoutubeCommentsPage({ videoId, runId: 'navigate' });
  context.location.search = '?v=aaaaaaaaaaa';
  context.document.dispatchEvent(new Event('yt-navigate-start'));
  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(result.retryable, false);
});

function client(request) {
  const context = environment();
  return context.window.ytbCommentsSync.create({ request, getVideoId: () => videoId });
}

const batch = (ids, next = [], expected = null) => ({ success: true, comments: ids.map(id => ({ id, text: id })), next: next.map(token => ({ token, phase: 'comments', reply: false })), expected });
const options = signal => ({ videoId, runId: Math.random().toString(), signal: signal || new AbortController().signal, onProgress() {} });

test('pagination deduplicates comment ids and exhausts continuations despite inaccurate totals', async () => {
  const calls = [];
  const sync = client(async request => {
    calls.push(request.continuation);
    return request.continuation ? batch(['1', '2']) : batch(['1'], ['next'], 1);
  });
  await sync.start(options());
  assert.equal(calls.length, 2);
  const stats = sync.getStats(() => null);
  assert.equal(stats.comments.length, 2);
  assert.equal(stats.complete, true);
  assert.equal(stats.expected, 1);
});

test('stop keeps received comments, ignores late responses and resumes the pending page', async () => {
  let finishPending;
  let markPending;
  let stopped = false;
  const pendingStarted = new Promise(resolve => { markPending = resolve; });
  const sync = client(request => {
    if (request.operation === 'stop') { stopped = true; return { success: true }; }
    if (!request.continuation) return batch(['1'], ['next']);
    if (stopped) return batch(['2']);
    markPending();
    return new Promise(resolve => { finishPending = resolve; });
  });
  const controller = new AbortController();
  const running = sync.start(options(controller.signal));
  await pendingStarted;
  controller.abort();
  await assert.rejects(running, { name: 'AbortError' });
  finishPending(batch(['late']));
  await Promise.resolve();
  assert.equal(sync.getStats(() => null).comments.length, 1);
  await sync.start(options());
  const stats = sync.getStats(() => null);
  assert.deepEqual(Array.from(stats.comments, comment => comment.id), ['1', '2']);
  assert.equal(stats.complete, true);
});

test('repeated continuation stops with a retryable snapshot instead of looping or reporting completion', async () => {
  const sync = client(async request => request.continuation ? batch(['2'], ['next']) : batch(['1'], ['next']));
  await assert.rejects(sync.start(options()), /repeated a comments page/);
  const stats = sync.getStats(() => null);
  assert.equal(stats.complete, false);
  assert.equal(stats.comments.length, 1);
});

for (const hasNextPage of [false, true]) {
  test(`a repeated pinned reply link does not discard new comments, next page: ${hasNextPage}`, async () => {
    const calls = [];
    const reply = { token: 'pinned-replies', phase: 'comments', reply: true };
    const sync = client(async request => {
      calls.push(request.continuation);
      if (!request.continuation) return { ...batch(['pinned']), next: [reply, { token: 'older', phase: 'comments', reply: false }] };
      if (request.continuation === 'pinned-replies') return batch(['answer']);
      if (request.continuation === 'older') {
        const result = batch(['pinned', 'older-comment'], hasNextPage ? ['last'] : []);
        result.next.unshift(reply);
        return result;
      }
      assert.equal(request.continuation, 'last');
      return batch(['last-comment']);
    });
    await sync.start(options());
    assert.deepEqual(calls, [undefined, 'pinned-replies', 'older', ...(hasNextPage ? ['last'] : [])]);
    const stats = sync.getStats(() => null);
    assert.deepEqual(Array.from(stats.comments, comment => comment.id), ['pinned', 'answer', 'older-comment', ...(hasNextPage ? ['last-comment'] : [])]);
    assert.equal(stats.complete, true);
  });
}

for (const reply of [false, true]) {
  test(`a cycle within the same pagination stream still pauses, replies: ${reply}`, async () => {
    const calls = [];
    const sync = client(async request => {
      calls.push(request.continuation);
      const token = request.continuation === 'first' ? 'second' : 'first';
      return { ...batch([request.continuation || 'initial']), next: [{ token, phase: 'comments', reply }] };
    });
    await assert.rejects(sync.start(options()), /repeated a comments page/);
    assert.deepEqual(calls, [undefined, 'first', 'second']);
    assert.equal(sync.getStats(() => null).complete, false);
  });
}

test('a failed page preserves partial data and resumes on the next run', async () => {
  let fail = true;
  const sync = client(async request => request.continuation
    ? fail ? { success: false, error: 'Offline' } : batch(['2'])
    : batch(['1'], ['next']));
  await assert.rejects(sync.start(options()), /Offline/);
  assert.equal(sync.getStats(() => null).comments.length, 1);
  fail = false;
  await sync.start(options());
  assert.equal(sync.getStats(() => null).comments.length, 2);
});

test('transient HTTP failure retries the same page without losing progress', async () => {
  const calls = [];
  const sync = client(async request => {
    calls.push(request.continuation);
    return calls.length === 1 ? { success: false, error: 'Busy', retryable: true } : batch(['1']);
  });
  await sync.start(options());
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  assert.equal(sync.getStats(() => null).complete, true);
});

test('a stopped or completed snapshot never leaks into another video', async () => {
  const context = environment();
  let currentVideoId = videoId;
  const sync = context.window.ytbCommentsSync.create({ request: async () => batch(['1']), getVideoId: () => currentVideoId });
  await sync.start(options());
  currentVideoId = 'aaaaaaaaaaa';
  assert.equal(sync.getStats(() => 'new video'), 'new video');
  sync.clear();
  currentVideoId = videoId;
  assert.equal(sync.getStats(() => 'cleared'), 'cleared');
});

test('the background bridge targets only the sender document and runs the self-contained page function', async () => {
  const page = environment();
  page.fetch = async () => ({ ok: true, json: async () => response([legacyComment('c1')]) });
  const source = readFileSync(join(__dirname, '../background.js'), 'utf8');
  const start = source.indexOf('async function fetchCommentsForTab(');
  const end = source.indexOf('\nchrome.runtime.onMessage', start);
  let target;
  const background = vm.createContext({
    fetchYoutubeCommentsPage: page.fetchYoutubeCommentsPage,
    isYoutubeTab: tab => tab?.url?.startsWith('https://www.youtube.com/'),
    chrome: { scripting: { executeScript: async options => {
      target = options.target;
      assert.equal(options.world, 'MAIN');
      const func = vm.runInContext('(' + options.func.toString() + ')', page);
      return [{ result: await func(...JSON.parse(JSON.stringify(options.args))) }];
    } } }
  });
  vm.runInContext(source.slice(start, end), background);
  const sender = { tab: { id: 42, url: 'https://www.youtube.com/watch?v=' + videoId }, frameId: 0, documentId: 'current-document' };
  const request = { operation: 'page', videoId, runId: 'bridge', continuation: 'page' };
  const result = await background.fetchCommentsForTab(request, sender);
  assert.equal(result.comments[0].id, 'c1');
  assert.deepEqual(JSON.parse(JSON.stringify(target)), { tabId: 42, documentIds: ['current-document'] });
  await assert.rejects(background.fetchCommentsForTab(request, { ...sender, frameId: 1 }), /current YouTube video/);
  await assert.rejects(background.fetchCommentsForTab(request, { tab: { url: 'https://example.com' }, frameId: 0 }), /current YouTube video/);
});
