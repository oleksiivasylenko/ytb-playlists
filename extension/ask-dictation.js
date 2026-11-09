(() => {
  const MAX_RECORDING_MS = 5 * 60 * 1000;
  const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
  const TRANSCRIPTION_TIMEOUT_MS = 75_000;
  const icons = {
    microphone: '<rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"></path>',
    cancel: '<path d="m6 6 12 12M18 6 6 18"></path>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"></rect>',
    send: '<path d="M12 20V4m-7 7 7-7 7 7"></path>'
  };

  function button(name, label, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `ytb-ask-voice-button ${className}`.trim();
    element.title = label;
    element.setAttribute('aria-label', label);
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
    return element;
  }

  function recordingError(error) {
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
      return 'Microphone access was denied. Allow microphone access for YouTube in your browser and try again.';
    }
    if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No microphone was found. Connect one and try again.';
    if (['NotReadableError', 'TrackStartError'].includes(error?.name)) return 'The microphone is unavailable or in use by another application.';
    return error?.message || 'Could not record audio. Please try again.';
  }

  async function encodeAudio(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  }

  function create({ panel, textarea, controls, onSubmit, onStatus, isCurrent = () => true }) {
    const composer = document.createElement('div');
    composer.className = 'ytb-ask-composer';
    textarea.replaceWith(composer);
    composer.appendChild(textarea);

    const microphone = button('microphone', 'Dictate a question', 'ytb-ask-microphone');
    controls.insertBefore(microphone, controls.querySelector('.ytb-ask-submit-btn'));

    const bar = document.createElement('div');
    bar.className = 'ytb-ask-dictation';
    bar.hidden = true;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Voice dictation');

    const cancelButton = button('cancel', 'Cancel dictation');
    const stopButton = button('stop', 'Stop and transcribe');
    const sendButton = button('send', 'Transcribe and send question', 'ytb-ask-voice-send');
    const canvas = document.createElement('canvas');
    canvas.className = 'ytb-ask-waveform';
    canvas.setAttribute('aria-hidden', 'true');
    const elapsed = document.createElement('span');
    elapsed.className = 'ytb-ask-recording-time';
    const progress = document.createElement('span');
    progress.className = 'ytb-ask-voice-progress';
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    bar.append(cancelButton, canvas, elapsed, progress, stopButton, sendButton);
    composer.appendChild(bar);

    let session = null;
    let state = 'idle';
    let destroyed = false;

    function current(run) {
      return !destroyed && session === run && !run.cancelled && panel.isConnected && !panel.hidden && isCurrent();
    }

    function refresh() {
      const active = state !== 'idle';
      const asking = panel.dataset.askBusy === '1';
      panel.dataset.dictationState = state;
      bar.hidden = !active;
      bar.setAttribute('aria-busy', String(state === 'transcribing'));
      textarea.hidden = active;
      microphone.hidden = active;
      microphone.disabled = asking;
      panel.querySelector('.ytb-ask-submit-btn').disabled = active || asking;
      stopButton.disabled = state !== 'recording';
      sendButton.disabled = state !== 'recording';
      canvas.hidden = state === 'requesting';
      elapsed.hidden = state !== 'recording';
      progress.hidden = state === 'recording';
      progress.textContent = state === 'requesting' ? 'Allow microphone access…' : state === 'transcribing' ? 'Transcribing…' : '';
    }

    function releaseMedia(run) {
      clearTimeout(run.limitTimer);
      clearInterval(run.clock);
      if (run.frame) cancelAnimationFrame(run.frame);
      run.source?.disconnect();
      run.source = null;
      if (run.audioContext) run.audioContext.close().catch(() => {});
      run.audioContext = null;
      run.stream?.getTracks().forEach(track => track.stop());
      run.stream = null;
    }

    function cancel(message = 'Dictation cancelled.', error = false) {
      const run = session;
      const wasActive = state !== 'idle';
      session = null;
      if (run) {
        run.cancelled = true;
        clearTimeout(run.transcriptionTimer);
        clearInterval(run.lifecycleTimer);
        run.abortController?.abort();
        if (run.recorder && run.recorder.state !== 'inactive') run.recorder.stop();
        releaseMedia(run);
        run.chunks = [];
      }
      state = 'idle';
      refresh();
      if (!destroyed && panel.isConnected && (wasActive || error)) {
        onStatus(message, error ? 'error' : '');
        if (!panel.hidden) textarea.focus();
      }
    }

    function drawWaveform(run) {
      const context = canvas.getContext('2d');
      if (!context) return;
      const samples = new Uint8Array(run.analyser.fftSize);
      const levels = [];
      let lastSample = 0;

      function draw(timestamp) {
        if (!current(run) || state !== 'recording') return;
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        const scale = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
        }
        if (timestamp - lastSample >= 65) {
          run.analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
          levels.push(Math.min(1, Math.sqrt(sum / samples.length) * 5));
          if (levels.length > 300) levels.shift();
          lastSample = timestamp;
        }
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = getComputedStyle(canvas).color;
        const count = Math.ceil(width / 6);
        const visible = levels.slice(-count);
        for (let index = 0; index < count; index++) {
          const level = visible[index - (count - visible.length)] || 0;
          const barHeight = Math.max(3, level * (height - 4));
          context.beginPath();
          context.roundRect(index * 6, (height - barHeight) / 2, 3, barHeight, 1.5);
          context.fill();
        }
        run.frame = requestAnimationFrame(draw);
      }
      run.frame = requestAnimationFrame(draw);
    }

    async function transcribe(run) {
      try {
        if (!current(run)) return;
        const blob = new Blob(run.chunks, { type: run.recorder.mimeType || run.mimeType });
        run.chunks = [];
        if (!blob.size) throw new Error('The recording is empty. Please try again.');
        if (blob.size > MAX_AUDIO_BYTES) throw new Error('Recording is too large. Please record a shorter question.');
        const audio = await encodeAudio(blob);
        if (!current(run)) return;
        run.abortController = new AbortController();
        const timeout = new Promise((resolve, reject) => {
          run.transcriptionTimer = setTimeout(() => {
            reject(new Error('Transcription timed out. Please try again.'));
            run.abortController.abort();
          }, TRANSCRIPTION_TIMEOUT_MS);
        });
        const result = await Promise.race([
          window.api.transcribeAudio(audio, blob.type, { signal: run.abortController.signal }),
          timeout
        ]);
        if (!current(run)) return;
        const text = typeof result?.text === 'string' ? result.text.trim() : '';
        if (!text) throw new Error('No speech was recognized. Please try recording again.');
        const before = textarea.value.slice(0, run.selectionStart);
        const after = textarea.value.slice(run.selectionEnd);
        const prefix = before && !/\s$/.test(before) ? ' ' : '';
        const suffix = after && !/^\s/.test(after) ? ' ' : '';
        textarea.setRangeText(`${prefix}${text}${suffix}`, run.selectionStart, run.selectionEnd, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        session = null;
        state = 'idle';
        refresh();
        textarea.focus();
        if (textarea.value.trim().length > 4000) {
          onStatus('Transcribed. Shorten the question to 4,000 characters before sending.', 'error');
        } else if (run.send) {
          onSubmit();
        } else {
          onStatus('Transcribed. Review your question and click Ask about.', 'success');
        }
      } catch (error) {
        if (current(run)) cancel(recordingError(error), true);
      } finally {
        clearTimeout(run.transcriptionTimer);
        clearInterval(run.lifecycleTimer);
        releaseMedia(run);
        if (session === run && !current(run)) cancel('');
      }
    }

    function finish(send) {
      const run = session;
      if (!run || state !== 'recording' || !current(run)) return;
      run.send = send;
      state = 'transcribing';
      refresh();
      onStatus('Transcribing audio…', 'busy');
      run.recorder.stop();
      releaseMedia(run);
    }

    async function start() {
      if (destroyed || state !== 'idle' || panel.dataset.askBusy === '1') return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        onStatus('Audio recording is unavailable in this browser. Use a recent Chrome or Edge version.', 'error');
        return;
      }
      const run = {
        cancelled: false,
        chunks: [],
        bytes: 0,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd
      };
      session = run;
      run.lifecycleTimer = setInterval(() => {
        if (session === run && !current(run)) cancel('');
      }, 500);
      state = 'requesting';
      refresh();
      onStatus('Waiting for microphone access…', 'busy');
      cancelButton.focus();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
        run.stream = stream;
        if (!current(run)) {
          releaseMedia(run);
          return;
        }
        run.mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
          .find(type => MediaRecorder.isTypeSupported(type));
        if (!run.mimeType) throw new Error('This browser does not support a compatible audio recording format.');
        run.recorder = new MediaRecorder(stream, { mimeType: run.mimeType, audioBitsPerSecond: 64_000 });
        run.recorder.ondataavailable = event => {
          if (!current(run) || !event.data.size) return;
          run.chunks.push(event.data);
          run.bytes += event.data.size;
          if (run.bytes > MAX_AUDIO_BYTES) cancel('Recording is too large. Please record a shorter question.', true);
        };
        run.recorder.onstop = () => {
          if (current(run) && state === 'transcribing') transcribe(run);
        };
        run.recorder.onerror = () => {
          if (current(run)) cancel('Audio recording failed. Please try again.', true);
        };
        stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
          if (current(run) && state === 'recording') cancel('The microphone was disconnected. Please record again.', true);
        }, { once: true }));
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          run.audioContext = new AudioContextClass();
          run.analyser = run.audioContext.createAnalyser();
          run.analyser.fftSize = 512;
          run.source = run.audioContext.createMediaStreamSource(stream);
          run.source.connect(run.analyser);
          await run.audioContext.resume();
        }
        if (!current(run)) {
          releaseMedia(run);
          return;
        }
        run.recorder.start(1000);
        run.startedAt = performance.now();
        state = 'recording';
        refresh();
        elapsed.textContent = '0:00';
        run.clock = setInterval(() => {
          const seconds = Math.floor((performance.now() - run.startedAt) / 1000);
          elapsed.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        }, 250);
        run.limitTimer = setTimeout(() => finish(false), MAX_RECORDING_MS);
        if (run.analyser) drawWaveform(run);
        onStatus('Recording… Stop to review, or use the arrow to send. Maximum 5 minutes.', 'busy');
        stopButton.focus();
      } catch (error) {
        releaseMedia(run);
        if (session === run && !run.cancelled) cancel(recordingError(error), true);
      }
    }

    function onEscape(event) {
      if (event.key === 'Escape' && state !== 'idle') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    }

    microphone.addEventListener('click', event => { event.stopPropagation(); start(); });
    cancelButton.addEventListener('click', event => { event.stopPropagation(); cancel(); });
    stopButton.addEventListener('click', event => { event.stopPropagation(); finish(false); });
    sendButton.addEventListener('click', event => { event.stopPropagation(); finish(true); });
    panel.addEventListener('keydown', onEscape);
    refresh();

    return {
      refresh,
      cancel,
      destroy() {
        destroyed = true;
        cancel('');
        panel.removeEventListener('keydown', onEscape);
      }
    };
  }

  window.ytbAskDictation = { create };
})();
