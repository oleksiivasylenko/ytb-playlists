(function() {
  function create({ request, getVideoId }) {
    let snapshot = null;

    function getStats(fallback) {
      if (!snapshot || snapshot.videoId !== getVideoId()) return fallback();
      return {
        comments: Array.from(snapshot.comments.values()),
        expected: snapshot.expected,
        hiddenReplies: 0,
        complete: snapshot.complete,
        unavailable: snapshot.unavailable
      };
    }

    function abortable(promise, signal) {
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Comment sync stopped.', 'AbortError'));
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    }

    function pause(ms, signal) {
      let timer;
      return abortable(new Promise(resolve => { timer = setTimeout(resolve, ms); }), signal)
        .finally(() => clearTimeout(timer));
    }

    async function start({ videoId, runId, signal, onProgress }) {
      if (!snapshot || snapshot.videoId !== videoId || snapshot.complete) {
        snapshot = { videoId, comments: new Map(), expected: null, queue: [{ phase: 'initial', reply: false }], seen: new Set(), complete: false, unavailable: false };
      }
      const current = snapshot;
      const stop = () => { Promise.resolve().then(() => request({ operation: 'stop', videoId, runId })).catch(() => {}); };
      signal.addEventListener('abort', stop, { once: true });

      function assertActive() {
        if (signal.aborted || videoId !== getVideoId()) throw new DOMException('Comment sync stopped.', 'AbortError');
      }

      try {
        assertActive();
        onProgress();
        while (current.queue.length) {
          assertActive();
          const job = current.queue[0];
          let result;
          for (let attempt = 0; attempt < 3; attempt++) {
            assertActive();
            result = await abortable(request({ operation: 'page', videoId, runId, continuation: job.token, phase: job.phase, reply: job.reply }), signal);
            assertActive();
            if (result?.success || !result?.retryable || attempt === 2) break;
            await pause(1000 * 2 ** attempt, signal);
          }
          if (!result?.success) throw new Error(result?.error || 'YouTube comments could not be loaded.');
          if (result.next.some(next => next.token === job.token || (current.seen.has(next.token) && (job.reply || !next.reply)))) {
            throw new Error('YouTube repeated a comments page. Sync paused; click Sync comments to retry.');
          }
          for (const comment of result.comments) current.comments.set(comment.id, comment);
          if (Number.isInteger(result.expected) && result.expected >= 0) current.expected = result.expected;
          current.queue.shift();
          if (job.token) current.seen.add(job.token);
          for (const next of result.next) {
            if (!current.seen.has(next.token) && !current.queue.some(queued => queued.token === next.token)) current.queue.push(next);
          }
          current.unavailable ||= !!result.unavailable;
          current.complete = current.queue.length === 0;
          onProgress();
          if (!current.complete) await pause(150, signal);
        }
      } finally {
        signal.removeEventListener('abort', stop);
      }
    }

    return { start, getStats, clear: () => { snapshot = null; } };
  }

  window.ytbCommentsSync = { create };
})();
