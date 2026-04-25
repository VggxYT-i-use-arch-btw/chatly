// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — audio.js                              ║
// ║  Gravação (MediaRecorder) + Playback (WebAudio) ║
// ╚══════════════════════════════════════════════════╝

import { CONFIG } from './config.js';

// ══════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════
let _recorder   = null;
let _recStream  = null;
let _recChunks  = [];
let _recTimer   = null;
let _recSecs    = 0;
let _audioCtx   = null;
let _analyser   = null;
let _vizFrame   = null;

/**
 * Inicia gravação de áudio.
 * @param {HTMLCanvasElement} vizCanvas - canvas para visualização
 * @param {HTMLElement} timerEl - elemento com o tempo
 * @returns {Promise<void>}
 */
export async function startRecording(vizCanvas, timerEl) {
  _recChunks = [];
  _recSecs   = 0;

  _recStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Web Audio API para visualização ao vivo
  _audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  _analyser  = _audioCtx.createAnalyser();
  _analyser.fftSize = 256;
  const src  = _audioCtx.createMediaStreamSource(_recStream);
  src.connect(_analyser);

  // Escolhe o melhor formato suportado
  const mimeType = getSupportedMime();
  _recorder = new MediaRecorder(_recStream, { mimeType });

  _recorder.ondataavailable = (e) => {
    if (e.data.size > 0) _recChunks.push(e.data);
  };

  _recorder.start(100); // coleta a cada 100ms

  // Timer de exibição
  _recTimer = setInterval(() => {
    _recSecs++;
    timerEl.textContent = formatRecTime(_recSecs);
    if (_recSecs >= CONFIG.AUDIO_MAX_SECS) stopRecording();
  }, 1000);

  // Visualização no canvas
  drawLiveWaveform(vizCanvas, _analyser);
}

/**
 * Para a gravação e retorna o Blob + duração.
 */
export function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!_recorder || _recorder.state === 'inactive') {
      cleanupRecording();
      return reject(new Error('Nenhuma gravação ativa'));
    }

    _recorder.onstop = () => {
      const mimeType = _recorder.mimeType;
      const blob = new Blob(_recChunks, { type: mimeType });
      const duration = _recSecs;
      cleanupRecording();
      resolve({ blob, duration, mimeType });
    };

    _recorder.stop();
  });
}

export function cancelRecording() {
  if (_recorder && _recorder.state !== 'inactive') {
    _recorder.ondataavailable = null;
    _recorder.onstop = null;
    _recorder.stop();
  }
  cleanupRecording();
}

function cleanupRecording() {
  clearInterval(_recTimer);
  _recTimer  = null;
  _recSecs   = 0;
  _recChunks = [];

  if (_vizFrame) { cancelAnimationFrame(_vizFrame); _vizFrame = null; }
  if (_recStream) { _recStream.getTracks().forEach(t => t.stop()); _recStream = null; }
  if (_audioCtx)  { _audioCtx.close().catch(() => {}); _audioCtx = null; }
  _analyser = null;
  _recorder = null;
}

// ── LIVE WAVEFORM ─────────────────────────────────
function drawLiveWaveform(canvas, analyser) {
  const ctx    = canvas.getContext('2d');
  const buf    = new Uint8Array(analyser.frequencyBinCount);
  const W      = canvas.offsetWidth || 150;
  const H      = canvas.height;
  canvas.width = W;

  const draw = () => {
    _vizFrame = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(buf);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'transparent';

    const barW   = 3;
    const gap    = 2;
    const count  = Math.floor(W / (barW + gap));
    const step   = Math.floor(buf.length / count);

    ctx.fillStyle = '#00a884';
    for (let i = 0; i < count; i++) {
      const sample = buf[i * step] / 128 - 1;        // -1..1
      const barH   = Math.max(3, Math.abs(sample) * H * 1.2);
      const x      = i * (barW + gap);
      const y      = (H - barH) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
  };
  draw();
}

// ══════════════════════════════════════════════════
//  PLAYBACK — Web Audio API
// ══════════════════════════════════════════════════

// Mapa de áudios em reprodução: url -> { ctx, source, startedAt, offset, playing }
const _playing = new Map();

/**
 * Extrai peaks do áudio usando OfflineAudioContext.
 * Retorna array de 80 valores normalizados (0..1).
 */
export async function extractPeaks(blob, numPeaks = 80) {
  const arrayBuf = await blob.arrayBuffer();
  const offCtx   = new OfflineAudioContext(1, 1, 44100);

  let decoded;
  try {
    decoded = await offCtx.decodeAudioData(arrayBuf.slice(0));
  } catch {
    return new Array(numPeaks).fill(0.15); // fallback
  }

  const data    = decoded.getChannelData(0);
  const step    = Math.floor(data.length / numPeaks);
  const peaks   = [];

  for (let i = 0; i < numPeaks; i++) {
    let max = 0;
    for (let j = 0; j < step; j++) {
      const abs = Math.abs(data[i * step + j] || 0);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  // Normaliza
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map(p => p / maxPeak);
}

/**
 * Renderiza waveform estático em um canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} peaks - array 0..1
 * @param {number} progress - 0..1 (parte já reproduzida)
 * @param {boolean} isOut - mensagem enviada (verde) ou recebida (cinza)
 */
export function drawWaveform(canvas, peaks, progress = 0, isOut = true) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  const barW = Math.max(2, Math.floor(W / peaks.length) - 1);
  const gap  = Math.max(1, Math.floor(W / peaks.length) - barW);

  ctx.clearRect(0, 0, W, H);

  peaks.forEach((peak, i) => {
    const x    = i * (barW + gap);
    const barH = Math.max(3, peak * (H - 4));
    const y    = (H - barH) / 2;
    const done = i / peaks.length < progress;

    ctx.fillStyle = done
      ? (isOut ? '#fff' : '#00a884')
      : (isOut ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)');
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 1);
    ctx.fill();
  });
}

/**
 * Toca ou pausa um áudio.
 * @param {string} id - identificador único (ex: message id)
 * @param {string} url - URL do áudio
 * @param {HTMLCanvasElement} canvas - para waveform
 * @param {number[]} peaks
 * @param {HTMLElement} btnEl - botão play/pause
 * @param {HTMLElement} timeEl - elemento de tempo
 * @param {boolean} isOut
 */
export async function togglePlay(id, url, canvas, peaks, btnEl, timeEl, isOut) {
  // Se já está tocando este áudio → pause
  if (_playing.has(id)) {
    const state = _playing.get(id);
    if (state.playing) {
      pause(id, state, canvas, peaks, btnEl, timeEl, isOut);
      return;
    } else {
      resume(id, state, canvas, peaks, btnEl, timeEl, isOut);
      return;
    }
  }

  // Pausa qualquer outro áudio em reprodução
  for (const [oid, ostate] of _playing.entries()) {
    if (ostate.playing) pause(oid, ostate, null, null, ostate.btn, ostate.timeEl, ostate.isOut);
  }

  btnEl.textContent = '⏸';

  try {
    const resp      = await fetch(url);
    const arrayBuf  = await resp.arrayBuffer();
    const ctx       = new (window.AudioContext || window.webkitAudioContext)();
    const buf       = await ctx.decodeAudioData(arrayBuf);
    const duration  = buf.duration;

    const state = {
      ctx, buf, duration,
      startedAt: ctx.currentTime,
      offset:    0,
      playing:   true,
      source:    null,
      frame:     null,
      btn:       btnEl,
      timeEl,
      isOut,
    };
    _playing.set(id, state);

    playFrom(id, state, canvas, peaks, 0);
  } catch (err) {
    console.error('[Audio] Erro:', err);
    btnEl.textContent = '▶';
  }
}

function playFrom(id, state, canvas, peaks, offset) {
  const { ctx, buf, duration } = state;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0, offset);
  src.onended = () => {
    if (_playing.get(id) === state && state.playing) {
      // Terminou naturalmente
      state.playing = false;
      state.btn.textContent  = '▶';
      state.offset  = 0;
      cancelAnimationFrame(state.frame);
      if (canvas) drawWaveform(canvas, peaks, 0, state.isOut);
      if (state.timeEl) state.timeEl.textContent = formatAudioTime(duration);
      _playing.delete(id);
    }
  };
  state.source    = src;
  state.startedAt = ctx.currentTime - offset;
  state.playing   = true;
  animateWaveform(id, state, canvas, peaks);
}

function pause(id, state, canvas, peaks, btnEl, timeEl, isOut) {
  if (!state.playing) return;
  state.offset  = state.ctx.currentTime - state.startedAt;
  state.playing = false;
  cancelAnimationFrame(state.frame);
  try { state.source.stop(); } catch {}
  if (btnEl)   btnEl.textContent   = '▶';
  if (canvas)  drawWaveform(canvas, peaks, state.offset / state.duration, isOut);
  if (timeEl)  timeEl.textContent = formatAudioTime(state.duration - state.offset);
}

function resume(id, state, canvas, peaks, btnEl, timeEl, isOut) {
  if (state.playing) return;
  state.btn    = btnEl;
  state.timeEl = timeEl;
  state.isOut  = isOut;
  btnEl.textContent = '⏸';
  playFrom(id, state, canvas, peaks, state.offset);
}

function animateWaveform(id, state, canvas, peaks) {
  const tick = () => {
    if (!state.playing) return;
    state.frame = requestAnimationFrame(tick);

    const elapsed  = state.ctx.currentTime - state.startedAt;
    const progress = Math.min(elapsed / state.duration, 1);
    if (canvas) drawWaveform(canvas, peaks, progress, state.isOut);
    if (state.timeEl) {
      const remaining = Math.max(0, state.duration - elapsed);
      state.timeEl.textContent = formatAudioTime(remaining);
    }
  };
  state.frame = requestAnimationFrame(tick);
}

// ── UTILS ──────────────────────────────────────────
function formatRecTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatAudioTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getSupportedMime() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

export function isRecording() {
  return _recorder !== null && _recorder.state === 'recording';
}
