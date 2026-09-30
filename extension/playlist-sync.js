(function() {
  function create({ request, getPlaylistId }) {
    function abortable(promise, signal) {
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Playlist sync stopped.', 'AbortError'));
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    }

    async function start({ playlistId, runId, signal, onPage, onRequest = () => {} }) {
      let continuation = null;
      let expected = null;
      let received = 0;
      let skipped = 0;
      let pages = 0;
      const seenTokens = new Set();
      const stop = () => { Promise.resolve().then(() => request({ operation: 'stop', playlistId, runId })).catch(() => {}); };
      signal.addEventListener('abort', stop, { once: true });

      function assertActive() {
        if (signal.aborted || getPlaylistId() !== playlistId) throw new DOMException('Playlist sync stopped.', 'AbortError');
      }

      try {
        do {
          assertActive();
          let result;
          for (let attempt = 0; attempt < 3; attempt++) {
            assertActive();
            onRequest({ page: pages + 1, attempt, expected, received });
            result = await abortable(request({ operation: 'page', playlistId, runId, continuation }), signal);
            assertActive();
            if (result?.success || !result?.retryable || attempt === 2) break;
            let timer;
            try {
              await abortable(new Promise(resolve => { timer = setTimeout(resolve, 1000 * 2 ** attempt); }), signal);
            } finally {
              clearTimeout(timer);
            }
          }
          if (!result?.success) throw new Error(result?.error || 'YouTube playlist could not be loaded.');
          if (!Array.isArray(result.entries) || (result.next !== null && (typeof result.next !== 'string' || !result.next))) {
            throw new Error('YouTube returned an incomplete playlist page. Sync was not completed.');
          }
          if (result.next && (result.next === continuation || seenTokens.has(result.next))) {
            throw new Error('YouTube repeated a playlist page. Sync was not completed; try again.');
          }
          if (Number.isInteger(result.expected) && result.expected >= 0) expected = result.expected;
          received += result.entries.length;
          skipped += result.skipped || 0;
          pages++;
          await onPage({ ...result, expected, received, skipped, pages, complete: result.next === null });
          assertActive();
          if (continuation) seenTokens.add(continuation);
          continuation = result.next;
        } while (continuation);
        return { expected, received, skipped, pages, complete: true };
      } finally {
        signal.removeEventListener('abort', stop);
      }
    }

    return { start };
  }

  window.ytbPlaylistSync = { create };
})();
