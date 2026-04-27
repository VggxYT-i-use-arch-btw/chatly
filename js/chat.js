// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — chat.js                               ║
// ║  Renderização de mensagens e lista de chats     ║
// ╚══════════════════════════════════════════════════╝


// ══════════════════════════════════════════════════
//  RENDERIZAR MENSAGEM
// ══════════════════════════════════════════════════

/**
 * Cria o elemento DOM de uma mensagem.
 * @param {object} msg - dados da mensagem
 * @param {string} myId - ID do usuário atual
 * @param {function} onMediaClick - callback ao clicar em mídia
 */
function createMessageEl(msg, myId, onMediaClick) {
  const isOut = msg.sender_id === myId;
  const row   = document.createElement('div');
  row.className = `msg-row ${isOut ? 'out' : 'in'}`;
  row.dataset.id = msg.id;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  // FIX #9: renderiza quote da mensagem respondida
  if (msg.reply_to_id) {
    bubble.appendChild(makeReplyQuote(msg.reply_to_id));
  }

  // ── Conteúdo ──
  switch (msg.type) {
    case 'text':
      bubble.appendChild(makeTextContent(msg.content));
      break;
    case 'image':
      bubble.appendChild(makeImageContent(msg, onMediaClick));
      break;
    case 'video':
      bubble.appendChild(makeVideoContent(msg, onMediaClick));
      break;
    case 'audio':
      bubble.appendChild(makeAudioContent(msg, isOut));
      break;
    case 'file':
      bubble.appendChild(makeFileContent(msg));
      break;
    default:
      bubble.appendChild(makeTextContent(msg.content || '[mensagem]'));
  }

  // ── Meta (hora + tick) ──
  bubble.appendChild(makeMeta(msg, isOut));

  row.appendChild(bubble);
  return row;
}

// FIX #9: cria o bloco de quote da mensagem respondida
function makeReplyQuote(replyToId) {
  const quoted = (typeof findMsgById === 'function') ? findMsgById(replyToId) : null;
  const wrap = document.createElement('div');
  wrap.className = 'msg-reply-quote';
  if (quoted) {
    const preview = quoted.content
      || (quoted.type === 'image'  ? '📷 Imagem'
        : quoted.type === 'audio' ? '🎵 Áudio'
        : quoted.type === 'video' ? '🎬 Vídeo'
        : '📎 Arquivo');
    wrap.textContent = preview.length > 60 ? preview.slice(0, 60) + '…' : preview;
  } else {
    wrap.textContent = 'Mensagem apagada';
    wrap.style.fontStyle = 'italic';
    wrap.style.opacity = '0.6';
  }
  return wrap;
}

// ── TEXT ──────────────────────────────────────────
function makeTextContent(text) {
  const p = document.createElement('p');
  p.className = 'msg-text';
  p.textContent = text;
  return p;
}

// ── IMAGE ─────────────────────────────────────────
function makeImageContent(msg, onMediaClick) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-media';

  const img = document.createElement('img');
  img.alt     = 'imagem';
  img.loading = 'lazy';

  // Carrega com cache IndexedDB
  fetchWithCache(msg.media_url).then(blobUrl => {
    img.src = blobUrl;
  }).catch(() => {
    img.src = msg.media_url;
  });

  img.onclick = () => onMediaClick({ type: 'image', url: msg.media_url, sender: msg.sender_id });
  wrap.appendChild(img);
  return wrap;
}

// ── VIDEO ─────────────────────────────────────────
function makeVideoContent(msg, onMediaClick) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-media';

  const thumb = document.createElement('video');
  thumb.src      = msg.media_url;
  thumb.preload  = 'metadata';
  thumb.muted    = true;
  thumb.style.cssText = 'pointer-events:none;';

  // Ícone play por cima
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:absolute; inset:0; display:flex;
    align-items:center; justify-content:center;
    background:#00000044; cursor:pointer;
  `;
  overlay.innerHTML = '<span class="material-symbols-rounded" style="font-size:48px;color:#fff;filter:drop-shadow(0 2px 4px #0008)">play_circle</span>';

  wrap.style.position = 'relative';
  wrap.appendChild(thumb);
  wrap.appendChild(overlay);

  wrap.onclick = () => onMediaClick({ type: 'video', url: msg.media_url, sender: msg.sender_id });
  return wrap;
}

// ── AUDIO ─────────────────────────────────────────
function makeAudioContent(msg, isOut) {
  const wrap  = document.createElement('div');
  wrap.className = 'audio-msg';

  const btn   = document.createElement('button');
  btn.className = 'audio-play-btn';
  btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';

  const wfWrap = document.createElement('div');
  wfWrap.className = 'audio-waveform-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'audio-waveform';
  canvas.width  = 180;
  canvas.height = 36;

  const timeEl = document.createElement('span');
  timeEl.className = 'audio-msg-time';

  // Pega peaks do banco ou gera ao carregar
  const peaks = msg.audio_peaks
    ? (Array.isArray(msg.audio_peaks) ? msg.audio_peaks : JSON.parse(msg.audio_peaks))
    : defaultPeaks();

  drawWaveform(canvas, peaks, 0, isOut);

  // FIX #17: WebM/Opus típico = ~32kbps = 4000 bytes/seg (antes usava 16000 = 16kbps, 2–8x errado)
  if (msg.media_size) {
    const estimatedSecs = msg.media_size / 4000;
    timeEl.textContent = formatAudioTime(estimatedSecs);
  } else {
    timeEl.textContent = '0:00';
  }

  btn.onclick = async () => {
    // Tenta extrair peaks reais se ainda são padrão
    if (!msg._peaksExtracted) {
      try {
        const resp  = await fetch(msg.media_url);
        const blob  = await resp.blob();
        const real  = await extractPeaks(blob);
        drawWaveform(canvas, real, 0, isOut);
        msg._peaks = real;
        msg._peaksExtracted = true;
      } catch {}
    }
    togglePlay(
      msg.id,
      msg.media_url,
      canvas,
      msg._peaks || peaks,
      btn,
      timeEl,
      isOut
    );
  };

  wfWrap.appendChild(canvas);
  wfWrap.appendChild(timeEl);

  wrap.appendChild(btn);
  wrap.appendChild(wfWrap);
  return wrap;
}

// ── FILE ──────────────────────────────────────────
function makeFileContent(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'file-msg';

  const icon = document.createElement('span');
  icon.className = 'file-icon';
  icon.textContent = fileEmoji(msg.media_name || '');

  const info = document.createElement('div');
  info.className = 'file-info';

  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = msg.media_name || 'arquivo';

  const size = document.createElement('div');
  size.className = 'file-size';
  size.textContent = msg.media_size ? formatFileSize(msg.media_size) : '';

  const dl = document.createElement('a');
  dl.className = 'file-dl';
  dl.href = msg.media_url;
  dl.download = msg.media_name || 'arquivo';
  dl.target = '_blank';
  dl.innerHTML = '<span class="material-symbols-rounded" style="font-size:20px">download</span>';

  info.appendChild(name);
  info.appendChild(size);
  wrap.appendChild(icon);
  wrap.appendChild(info);
  wrap.appendChild(dl);
  return wrap;
}

// ── META ──────────────────────────────────────────
function makeMeta(msg, isOut) {
  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatMsgTime(msg.created_at);

  meta.appendChild(time);

  if (isOut) {
    const tick = document.createElement('span');
    tick.className = 'msg-tick material-symbols-rounded';
    // Bug 5: 'done' = enviado/pendente; app.js muda para 'done_all' após confirmação do servidor
    tick.textContent = msg.id?.startsWith('opt_') ? 'done' : 'done_all';
    meta.appendChild(tick);
  }

  return meta;
}

// ══════════════════════════════════════════════════
//  LISTA DE CHATS
// ══════════════════════════════════════════════════

function createChatItemEl(conv, otherUser, lastMsg, myId, onClick) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.dataset.convId = conv.id;

  // FIX #12: grupos usam group_avatar_url — não otherId que é null
  const av = conv.is_group
    ? createAvatarEl(null, 46, conv.group_avatar_url, conv.group_name)
    : createAvatarEl(otherUser, 46);
  item.appendChild(av);

  const body = document.createElement('div');
  body.className = 'chat-item-body';

  const top = document.createElement('div');
  top.className = 'chat-item-top';

  const name = document.createElement('span');
  name.className = 'chat-item-name';
  name.textContent = conv.is_group
    ? (conv.group_name || 'Grupo')
    : (otherUser?.display_name || otherUser?.username || 'Usuário');

  const time = document.createElement('span');
  time.className = 'chat-item-time';
  time.textContent = lastMsg ? formatMsgTime(lastMsg.created_at) : '';

  top.appendChild(name);
  top.appendChild(time);

  const preview = document.createElement('div');
  preview.className = 'chat-item-preview';
  preview.textContent = lastMsg ? previewText(lastMsg) : 'Nenhuma mensagem';

  body.appendChild(top);
  body.appendChild(preview);
  item.appendChild(body);

  item.onclick = onClick;
  return item;
}

// FIX #12: aceita overrideUrl e overrideName para suportar avatares de grupo
function createAvatarEl(user, size = 40, overrideUrl = null, overrideName = null) {
  const av = document.createElement('div');
  av.className = 'avatar';
  av.style.cssText = `width:${size}px; height:${size}px; background:#2a3942; color:var(--accent); font-size:${Math.floor(size*0.4)}px;`;

  const avatarUrl   = overrideUrl  || user?.avatar_url;
  const displayName = overrideName || user?.display_name || user?.username || '?';

  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    av.appendChild(img);
  } else {
    av.textContent = displayName[0].toUpperCase();
  }
  return av;
}

// ══════════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════════

// formatMsgTime, formatDateDivider, previewText, fileEmoji,
// groupMessagesByDate → movidos para utils.js

function defaultPeaks() {
  return Array.from({ length: 80 }, () => 0.1 + Math.random() * 0.5);
}

