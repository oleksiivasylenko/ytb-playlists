async function fetchYoutubeCommentsPage(request) {
  const currentVideoId = () => new URLSearchParams(location.search).get('v');
  const state = window.__ytbCommentsRequests ||= { active: new Map(), cancelled: new Set() };

  if (!state.listening) {
    const abortRequests = () => {
      for (const controller of state.active.values()) controller.abort();
    };
    document.addEventListener('yt-navigate-start', abortRequests);
    window.addEventListener('pagehide', abortRequests);
    state.listening = true;
  }

  if (request.operation === 'stop') {
    state.cancelled.add(request.runId);
    if (state.cancelled.size > 50) state.cancelled.delete(state.cancelled.values().next().value);
    state.active.get(request.runId)?.abort();
    return { success: true };
  }

  if (location.pathname !== '/watch' || currentVideoId() !== request.videoId || state.cancelled.has(request.runId)) {
    return { success: false, error: 'Comment sync stopped because the video changed or the request was cancelled.' };
  }

  const controller = new AbortController();
  state.active.set(request.runId, controller);
  const timeout = setTimeout(() => controller.abort(), 20000);

  function text(value) {
    if (typeof value === 'string') return value.trim();
    return (value?.simpleText || value?.content || value?.runs?.map(run => run.text || '').join('') || '').trim();
  }

  function findAll(value, key, result = []) {
    if (!value || typeof value !== 'object') return result;
    if (value[key]) result.push(value[key]);
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') findAll(child, key, result);
    }
    return result;
  }

  function continuation(value) {
    return findAll(value, 'continuationCommand')[0]?.token ||
      findAll(value, 'nextContinuationData')[0]?.continuation || '';
  }

  function parseResponse(data) {
    const sections = findAll(data.contents, 'itemSectionRenderer')
      .filter(section => section.sectionIdentifier === 'comment-item-section' || section.targetId === 'comments-section');
    const commands = [
      ...findAll(data.onResponseReceivedEndpoints, 'reloadContinuationItemsCommand'),
      ...findAll(data.onResponseReceivedEndpoints, 'appendContinuationItemsAction'),
      ...findAll(data.onResponseReceivedActions, 'reloadContinuationItemsCommand'),
      ...findAll(data.onResponseReceivedActions, 'appendContinuationItemsAction')
    ].filter(command => command.targetId === 'comments-section' || command.targetId?.startsWith('comment-replies-item'));
    const legacy = data.continuationContents?.itemSectionContinuation;
    const items = [
      ...sections.flatMap(section => section.contents || []),
      ...commands.flatMap(command => command.continuationItems || []),
      ...(legacy?.contents || [])
    ];
    const headers = findAll(items, 'commentsHeaderRenderer');
    const countText = text(headers[0]?.countText);
    const countMatch = countText.match(/^\s*([\d\s,.\u00a0\u202f]+)(?=\s|$)/);
    const expected = countMatch ? Number(countMatch[1].replace(/\D/g, '')) : null;
    const result = { success: true, comments: [], next: [], expected, unavailable: false };

    if (!request.continuation) {
      const token = continuation(sections);
      if (token) result.next.push({ token, phase: 'header', reply: false });
      else if (sections.length && findAll(items, 'messageRenderer').length) result.unavailable = true;
      else throw new Error('YouTube did not provide a comments feed for this video.');
      return result;
    }

    if (!commands.length && !legacy) throw new Error('YouTube returned an unrecognized comments response. Try Sync comments again.');

    if (request.phase === 'header') {
      const menu = headers[0]?.sortMenu?.sortFilterSubMenuRenderer?.subMenuItems;
      const token = continuation(menu?.[1]?.serviceEndpoint);
      if (token) {
        result.next.push({ token, phase: 'comments', reply: false });
        return result;
      }
    }

    const entities = new Map();
    for (const mutation of data.frameworkUpdates?.entityBatchUpdate?.mutations || []) {
      const entity = mutation.payload?.commentEntityPayload;
      if (entity) entities.set(mutation.entityKey, entity);
    }
    const seenComments = new Set();
    const seenTokens = new Set();

    function addComment(comment) {
      if (!comment.id || !comment.text || seenComments.has(comment.id)) return;
      seenComments.add(comment.id);
      result.comments.push(comment);
    }

    function visit(value, reply = !!request.reply) {
      if (!value || typeof value !== 'object') return;
      if (value.continuationItemRenderer) {
        const token = continuation(value.continuationItemRenderer);
        if (!token) throw new Error('YouTube returned a comments continuation without a token.');
        if (!seenTokens.has(token)) {
          seenTokens.add(token);
          result.next.push({ token, phase: 'comments', reply });
        }
        return;
      }
      if (value.commentsHeaderRenderer) return;
      const renderer = value.commentRenderer;
      if (renderer) {
        addComment({
          id: renderer.commentId,
          author: text(renderer.authorText),
          text: text(renderer.contentText),
          publishedTime: text(renderer.publishedTimeText),
          likes: text(renderer.voteCount),
          reply
        });
        return;
      }
      const model = value.commentViewModel;
      if (model?.commentKey) {
        const entity = entities.get(model.commentKey);
        if (!entity) throw new Error('YouTube omitted comment text. Try Sync comments again.');
        addComment({
          id: entity.properties?.commentId || model.commentId,
          author: text(entity.author?.displayName),
          text: text(entity.properties?.content),
          publishedTime: text(entity.properties?.publishedTime),
          likes: text(entity.toolbar?.likeCountNotliked),
          reply: reply || Number(entity.properties?.replyLevel) > 0
        });
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (child && typeof child === 'object') visit(child, reply || key === 'commentRepliesRenderer');
      }
    }

    visit(items);
    for (const entry of legacy?.continuations || []) {
      const token = continuation(entry);
      if (token && !seenTokens.has(token)) result.next.push({ token, phase: 'comments', reply: !!request.reply });
    }
    if (!result.comments.length && !result.next.length && findAll(items, 'messageRenderer').length) result.unavailable = true;
    return result;
  }

  try {
    const config = window.ytcfg;
    const context = config?.get('INNERTUBE_CONTEXT');
    if (!context?.client) throw new Error('YouTube is still loading. Try Sync comments again in a moment.');
    const body = { context, ...(request.continuation ? { continuation: request.continuation } : { videoId: request.videoId }) };
    const response = await fetch('/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': String(config.get('INNERTUBE_CONTEXT_CLIENT_NAME') || 1),
        'X-Youtube-Client-Version': context.client.clientVersion
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) return { success: false, error: `YouTube comments request failed (${response.status}).`, retryable: response.status === 429 || response.status >= 500 };
    const data = await response.json();
    if (controller.signal.aborted || currentVideoId() !== request.videoId) throw new Error('Comment sync stopped.');
    if (data.error) throw new Error(data.error.message || 'YouTube could not load comments.');
    return parseResponse(data);
  } catch (error) {
    return {
      success: false,
      error: controller.signal.aborted ? 'YouTube comments request was interrupted or timed out. Try Sync comments again.' : error.message,
      retryable: !state.cancelled.has(request.runId) && currentVideoId() === request.videoId && (controller.signal.aborted || error instanceof TypeError)
    };
  } finally {
    clearTimeout(timeout);
    if (state.active.get(request.runId) === controller) state.active.delete(request.runId);
  }
}
