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
    background:#00000044; cursor:pointer; font-size:40px;
  `;
  overlay.textContent = '▶';

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
  btn.textContent = '▶';

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

  // Duração estimada (se disponível)
  if (msg.media_size) {
    const estimatedSecs = msg.media_size / 16000; // estimativa grosseira
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
  dl.textContent = '⬇';

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
    tick.className = 'msg-tick';
    tick.textContent = '✓✓';
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

  // Avatar
  const av = createAvatarEl(otherUser, 46);
  item.appendChild(av);

  const body = document.createElement('div');
  body.className = 'chat-item-body';

  const top = document.createElement('div');
  top.className = 'chat-item-top';

  const name = document.createElement('span');
  name.className = 'chat-item-name';
  name.textContent = otherUser?.display_name || otherUser?.username || 'Usuário';

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

function createAvatarEl(user, size = 40) {
  const av = document.createElement('div');
  av.className = 'avatar';
  av.style.cssText = `width:${size}px; height:${size}px; background:#2a3942; color:#00a884; font-size:${Math.floor(size*0.4)}px;`;

  if (user?.avatar_url) {
    const img = document.createElement('img');
    img.src = user.avatar_url;
    img.alt = '';
    av.appendChild(img);
  } else {
    av.textContent = ((user?.display_name || user?.username || '?')[0]).toUpperCase();
  }
  return av;
}

// ══════════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════════

function formatMsgTime(iso) {
  if (!iso) return '';
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (now - d) / 1000;

  if (diff < 86400 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * 86400) {
    return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatDateDivider(iso) {
  const d   = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1 && d.getDate() === now.getDate()) return 'Hoje';
  if (diff < 2) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function previewText(msg) {
  const icons = { image: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', file: '📎 Arquivo' };
  return icons[msg.type] || (msg.content || '').slice(0, 50);
}

function fileEmoji(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', zip: '🗜', rar: '🗜', mp3: '🎵', wav: '🎵' };
  return map[ext] || '📎';
}

function defaultPeaks() {
  return Array.from({ length: 80 }, () => 0.1 + Math.random() * 0.5);
}

function groupMessagesByDate(messages) {
  const groups = [];
  let lastDate = null;
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) {
      groups.push({ type: 'divider', date: msg.created_at });
      lastDate = d;
    }
    groups.push({ type: 'message', data: msg });
  }
  return groups;
}
