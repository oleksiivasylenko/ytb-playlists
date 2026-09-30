async function fetchYoutubePlaylistPage(request) {
  const currentPlaylistId = () => location.pathname === '/playlist' ? new URLSearchParams(location.search).get('list') : null;
  const state = window.__ytbPlaylistRequests ||= { active: new Map(), cancelled: new Set() };

  if (!state.listening) {
    const abortRequests = () => {
      for (const [runId, controller] of state.active) {
        state.cancelled.add(runId);
        controller.abort();
      }
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

  if (currentPlaylistId() !== request.playlistId || state.cancelled.has(request.runId)) {
    return { success: false, error: 'Playlist sync stopped because the page changed or the request was cancelled.' };
  }

  const controller = new AbortController();
  state.active.set(request.runId, controller);
  const timeout = setTimeout(() => controller.abort(), 20000);

  function text(value) {
    return (typeof value === 'string' ? value : value?.simpleText || value?.content || value?.runs?.map(run => run.text || '').join('') || '').trim();
  }

  function findAll(value, key, result = []) {
    if (!value || typeof value !== 'object') return result;
    if (value[key]) result.push(value[key]);
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') findAll(child, key, result);
    }
    return result;
  }

  function parseResponse(data) {
    const lists = findAll(data.contents, 'playlistVideoListRenderer')
      .filter(list => list.playlistId === request.playlistId);
    const commands = [
      ...findAll(data.onResponseReceivedActions, 'appendContinuationItemsAction'),
      ...findAll(data.onResponseReceivedActions, 'reloadContinuationItemsCommand'),
      ...findAll(data.onResponseReceivedEndpoints, 'appendContinuationItemsAction'),
      ...findAll(data.onResponseReceivedEndpoints, 'reloadContinuationItemsCommand')
    ].filter(command => command.targetId === request.playlistId || command.targetId === 'playlist-video-list');
    const legacy = data.continuationContents?.playlistVideoListContinuation;
    const containers = request.continuation ? commands : lists;
    if (!containers.length && !(request.continuation && legacy)) {
      throw new Error('YouTube returned an unrecognized playlist response. Sync was not completed; try again.');
    }
    const items = containers.flatMap(container => {
      const contents = request.continuation ? container.continuationItems : container.contents;
      if (!Array.isArray(contents)) throw new Error('YouTube omitted playlist contents. Sync was not completed.');
      return contents;
    });
    if (request.continuation && legacy) {
      if (!Array.isArray(legacy.contents)) throw new Error('YouTube omitted playlist contents. Sync was not completed.');
      items.push(...legacy.contents);
    }

    const header = findAll(data.header, 'playlistHeaderRenderer')[0];
    const countText = text(header?.numVideosText || header?.stats?.[0]);
    const countMatch = countText.match(/^([\d\s,.\u00a0\u202f]+)(?=\s|$)/);
    const expected = countMatch ? Number(countMatch[1].replace(/\D/g, '')) : null;
    const result = { success: true, entries: [], next: null, expected, skipped: 0 };
    const tokens = new Set();

    function addContinuation(value) {
      const token = findAll(value, 'continuationCommand')[0]?.token || findAll(value, 'nextContinuationData')[0]?.continuation;
      if (typeof token !== 'string' || !token) throw new Error('YouTube returned a playlist continuation without a token.');
      tokens.add(token);
    }

    for (const item of items) {
      if (item.continuationItemRenderer) {
        addContinuation(item.continuationItemRenderer);
        continue;
      }
      const renderer = item.playlistVideoRenderer;
      if (!renderer) {
        if (item.messageRenderer && items.length === 1 && expected === 0) continue;
        throw new Error('YouTube returned an unrecognized playlist item. Sync was not completed.');
      }
      if (!/^[a-zA-Z0-9_-]{11}$/.test(renderer.videoId || '')) {
        result.skipped++;
        continue;
      }
      const duration = Number(renderer.lengthSeconds) || text(renderer.lengthText).split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
      result.entries.push({
        video: {
          id: renderer.videoId,
          title: text(renderer.title),
          author: text(renderer.shortBylineText || renderer.longBylineText),
          thumbnail: renderer.thumbnail?.thumbnails?.at(-1)?.url || '',
          duration: Number.isFinite(duration) ? duration : 0
        },
        setVideoId: renderer.setVideoId || findAll(renderer.menu, 'playlistEditEndpoint')
          .filter(endpoint => endpoint.playlistId === request.playlistId)
          .flatMap(endpoint => endpoint.actions || []).find(action => action.action === 'ACTION_REMOVE_VIDEO')?.setVideoId || ''
      });
    }
    for (const container of request.continuation ? legacy ? [legacy] : [] : lists) {
      for (const next of container.continuations || []) addContinuation(next);
    }
    if (tokens.size > 1) throw new Error('YouTube returned conflicting playlist continuations. Sync was not completed.');
    result.next = tokens.values().next().value || null;
    return result;
  }

  try {
    const config = window.ytcfg;
    const context = config?.get('INNERTUBE_CONTEXT');
    if (!context?.client) throw new Error('YouTube is still loading. Try Sync Page again in a moment.');
    const headers = {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': String(config.get('INNERTUBE_CONTEXT_CLIENT_NAME') || 1),
      'X-Youtube-Client-Version': context.client.clientVersion
    };
    const cookies = new Map(document.cookie.split(';').map(cookie => {
      const separator = cookie.indexOf('=');
      return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1)];
    }));
    const sessionCookie = cookies.get('SAPISID') || cookies.get('__Secure-3PAPISID');
    if (sessionCookie) {
      const timestamp = Math.floor(Date.now() / 1000);
      const bytes = new TextEncoder().encode(`${timestamp} ${sessionCookie} ${location.origin}`);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      headers.Authorization = `SAPISIDHASH ${timestamp}_${hash}`;
      headers['X-Goog-AuthUser'] = String(config.get('SESSION_INDEX') || 0);
      headers['X-Origin'] = location.origin;
      if (config.get('DELEGATED_SESSION_ID')) headers['X-Goog-PageId'] = config.get('DELEGATED_SESSION_ID');
    }
    const removing = request.operation === 'remove';
    if (removing && (typeof request.setVideoId !== 'string' || !request.setVideoId)) {
      throw new Error('YouTube did not provide an entry ID for cleanup.');
    }
    const body = removing
      ? { context, playlistId: request.playlistId, actions: [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: request.setVideoId }] }
      : { context, ...(request.continuation ? { continuation: request.continuation } : { browseId: `VL${request.playlistId}` }) };
    const response = await fetch(`/youtubei/v1/${removing ? 'browse/edit_playlist' : 'browse'}?prettyPrint=false`, {
      method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body), signal: controller.signal
    });
    if (!response.ok) return { success: false, error: `YouTube playlist request failed (${response.status}).`, retryable: !removing && (response.status === 429 || response.status >= 500) };
    const data = await response.json();
    if (controller.signal.aborted || currentPlaylistId() !== request.playlistId) throw new Error('Playlist sync stopped.');
    const alert = [...findAll(data.alerts, 'alertRenderer'), ...findAll(data.alerts, 'alertWithButtonRenderer')].find(item => item.type === 'ERROR');
    if (data.error || alert) throw new Error(data.error?.message || text(alert?.text) || 'YouTube could not load the playlist.');
    if (removing) {
      if (data.status !== 'STATUS_SUCCEEDED') throw new Error('YouTube did not confirm playlist cleanup.');
      return { success: true };
    }
    return parseResponse(data);
  } catch (error) {
    return {
      success: false,
      error: controller.signal.aborted ? 'YouTube playlist request was interrupted or timed out. Try Sync Page again.' : error.message,
      retryable: request.operation !== 'remove' && !state.cancelled.has(request.runId) && currentPlaylistId() === request.playlistId && (controller.signal.aborted || error instanceof TypeError)
    };
  } finally {
    clearTimeout(timeout);
    if (state.active.get(request.runId) === controller) state.active.delete(request.runId);
  }
}
