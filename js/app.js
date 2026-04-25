// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — app.js                                ║
// ║  Orquestrador principal                         ║
// ╚══════════════════════════════════════════════════╝


// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let _activeConvId    = null;
let _activeOtherUser = null;
let _conversations   = [];
let _supabase        = null;
let _isMobile        = window.innerWidth <= 680;

// ══════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════
async function boot() {
  await requestPersistentStorage();

  // Tenta inicializar Supabase (pode falhar se credenciais não configuradas)
  try {
    _supabase = initSupabase();
    injectSupabase(_supabase);
  } catch (err) {
    console.warn('[Boot] Supabase não configurado:', err.message);
  }

  // Carrega perfil local
  let profile = null;
  try {
    profile = await loadProfile();
  } catch (err) {
    console.warn('[Boot] Erro ao carregar perfil:', err.message);
  }

  if (!profile) {
    // setup-overlay já está visível por padrão no HTML
    initSetupUI();
  } else {
    document.getElementById('setup-overlay').classList.add('hidden');
    showApp();
    if (_supabase) {
      upsertProfile(profile).catch(e => console.warn('[Boot] upsert:', e.message));
    }
  }
}

// ══════════════════════════════════════════════════
//  SETUP MODAL
// ══════════════════════════════════════════════════

function initSetupUI() {
  const nameInput     = document.getElementById('setup-name');
  const usernameInput = document.getElementById('setup-username');
  const descInput     = document.getElementById('setup-desc');
  const descCounter   = document.getElementById('desc-counter');
  const submitBtn     = document.getElementById('setup-submit');
  const avatarInput   = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');
  const checkIcon     = document.getElementById('username-check-icon');
  const checkMsg      = document.getElementById('username-check-msg');

  let avatarData   = null;
  let usernameOk   = false;
  let checkTimeout = null;

  // Click na zona de avatar
  document.getElementById('avatar-upload-zone').onclick = () => avatarInput.click();

  avatarInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      avatarData = await compressImage(file);
      const img = avatarPreview.querySelector('img') || document.createElement('img');
      img.src = avatarData;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
      avatarPreview.appendChild(img);
      avatarPreview.querySelector('.avatar-icon').style.display = 'none';
    } catch { toast('Erro ao processar imagem', 'error'); }
  };

  // Contador de descrição
  descInput.oninput = () => {
    descCounter.textContent = `${descInput.value.length} / 150`;
  };

  // Validação de nome (habilita botão)
  nameInput.oninput = () => validateForm();

  // Validação de username com debounce
  usernameInput.oninput = () => {
    const raw = sanitizeUsername(usernameInput.value);
    usernameInput.value = raw;

    if (!isValidUsername(raw)) {
      checkIcon.textContent = '✗';
      checkIcon.style.color = '#ff5252';
      checkMsg.textContent  = raw.length < 3
        ? 'Mínimo 3 caracteres'
        : 'Só letras minúsculas, números, . _ -';
      usernameOk = false;
      validateForm();
      return;
    }

    checkIcon.textContent = '…';
    checkIcon.style.color = '#aaa';
    checkMsg.textContent  = 'Verificando...';
    clearTimeout(checkTimeout);

    checkTimeout = setTimeout(async () => {
      if (!_supabase) {
        checkIcon.textContent = '✓';
        checkIcon.style.color = '#00a884';
        checkMsg.textContent  = 'Disponível (offline)';
        usernameOk = true;
        validateForm();
        return;
      }
      try {
        const avail = await isUsernameAvailable(raw);
        if (avail) {
          checkIcon.textContent = '✓';
          checkIcon.style.color = '#00a884';
          checkMsg.textContent  = 'Disponível!';
          usernameOk = true;
        } else {
          checkIcon.textContent = '✗';
          checkIcon.style.color = '#ff5252';
          checkMsg.textContent  = 'Username já está em uso';
          usernameOk = false;
        }
      } catch {
        checkIcon.textContent = '?';
        usernameOk = true; // permite sem verificar se offline
      }
      validateForm();
    }, 600);
  };

  function validateForm() {
    submitBtn.disabled = !(nameInput.value.trim().length >= 2 && usernameOk);
  }

  submitBtn.onclick = async () => {
    const name     = nameInput.value.trim();
    const username = sanitizeUsername(usernameInput.value);
    const desc     = descInput.value.trim();

    if (!name || !isValidUsername(username)) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    const id = crypto.randomUUID();
    const profile = {
      id,
      display_name: name,
      username,
      description:  desc,
      avatar_data:  avatarData,
      avatar_url:   null,
      created_at:   new Date().toISOString(),
      username_changed_at: null,
    };

    await setProfile(profile);

    if (_supabase) {
      await upsertProfile(profile).catch(e => console.warn('[Setup]', e.message));
    }

    document.getElementById('setup-overlay').classList.add('hidden');
    showApp();
  };
}

// ══════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════
function showApp() {
  document.getElementById('app').classList.remove('hidden');
  renderMiniAvatar();
  renderProfilePanel();
  initAppUI();
  if (_supabase) loadConversations();
}

function initAppUI() {
  // Profile btn → abre painel
  document.getElementById('my-profile-btn').onclick = () => openProfilePanel();
  document.getElementById('profile-panel-back').onclick = () => closeProfilePanel();

  // New chat
  document.getElementById('new-chat-btn').onclick = () => openNewChatDialog();
  document.getElementById('close-new-chat').onclick = () => closeNewChatDialog();

  // Back to sidebar (mobile)
  document.getElementById('back-to-sidebar').onclick = () => {
    document.getElementById('sidebar').classList.remove('hidden-mobile');
    hideConversation();
  };

  // Chat search (filtra lista local)
  document.getElementById('chat-search').oninput = (e) => filterChatList(e.target.value);

  // User search (nova conversa)
  document.getElementById('user-search-input').oninput = debounce(searchUsers, 400);

  // File attach
  document.getElementById('attach-btn').onclick = () => document.getElementById('file-input').click();
  document.getElementById('file-input').onchange = handleFileSelect;

  // Message input (auto-height + show/hide send btn)
  const msgInput = document.getElementById('msg-input');
  const sendBtn  = document.getElementById('send-btn');
  const micBtn   = document.getElementById('mic-btn');

  msgInput.oninput = () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    const hasText = msgInput.value.trim().length > 0;
    sendBtn.classList.toggle('hidden', !hasText);
    micBtn.classList.toggle('hidden', hasText);
  };

  msgInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  sendBtn.onclick = handleSendText;

  // Mic / recording
  document.getElementById('mic-btn').onclick = handleMicClick;
  document.getElementById('cancel-rec').onclick = () => {
    cancelRecording();
    showInputRow();
  };
  document.getElementById('send-rec').onclick = handleSendRecording;

  // Profile panel editable fields
  document.querySelectorAll('.edit-field-btn').forEach(btn => {
    btn.onclick = () => editProfileField(btn.dataset.field);
  });

  // Change photo in profile panel
  document.getElementById('change-photo-btn').onclick = () =>
    document.getElementById('change-photo-input').click();
  document.getElementById('change-photo-input').onchange = handleChangePhoto;

  // Media modal close
  document.getElementById('media-close').onclick = closeMediaModal;
  document.getElementById('media-backdrop').onclick = closeMediaModal;

  // New chat overlay close on backdrop
  document.getElementById('new-chat-overlay').onclick = (e) => {
    if (e.target === e.currentTarget) closeNewChatDialog();
  };
}

// ══════════════════════════════════════════════════
//  CONVERSATIONS
// ══════════════════════════════════════════════════
async function loadConversations() {
  const profile = getProfile();
  if (!profile || !_supabase) return;

  try {
    _conversations = await fetchConversations(profile.id);
    await renderConversationList();
  } catch (err) {
    console.error('[Convs]', err);
  }
}

async function renderConversationList() {
  const profile  = getProfile();
  const list     = document.getElementById('chats-list');

  if (!_conversations.length) {
    list.innerHTML = `
      <div class="empty-state-sidebar">
        <span>💬</span><p>Sem conversas ainda</p>
        <small>Clique em ✏️ para começar</small>
      </div>`;
    return;
  }

  list.innerHTML = '';

  for (const conv of _conversations) {
    const otherId   = conv.participants.find(p => p !== profile.id);
    const otherUser = otherId ? (await fetchUserById(otherId).catch(() => null)) : null;

    // Última mensagem (aproximação)
    const msgs = await fetchMessages(conv.id, 1).catch(() => []);
    const last  = msgs[msgs.length - 1] || null;

    const item = createChatItemEl(conv, otherUser, last, profile.id, () => {
      openConversation(conv, otherUser);
    });

    list.appendChild(item);
  }
}

// ══════════════════════════════════════════════════
//  OPEN / CLOSE CONVERSATION
// ══════════════════════════════════════════════════
async function openConversation(conv, otherUser) {
  _activeConvId    = conv.id;
  _activeOtherUser = otherUser;

  // Marca item ativo
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.convId === conv.id);
  });

  // Mobile: esconde sidebar
  if (_isMobile) {
    document.getElementById('sidebar').classList.add('hidden-mobile');
  }

  // Header
  document.getElementById('contact-display-name').textContent = otherUser?.display_name || 'Usuário';
  document.getElementById('contact-username').textContent     = '@' + (otherUser?.username || '—');

  const cAvImg  = document.getElementById('contact-avatar-img');
  const cAvLet  = document.getElementById('contact-avatar-letter');
  if (otherUser?.avatar_url) {
    cAvImg.src    = otherUser.avatar_url;
    cAvImg.hidden = false;
    cAvLet.hidden = true;
  } else {
    cAvImg.hidden = true;
    cAvLet.hidden = false;
    cAvLet.textContent = ((otherUser?.display_name || '?')[0]).toUpperCase();
  }

  // Mostra área de chat
  document.getElementById('welcome-screen').classList.add('hidden');
  const conversation = document.getElementById('conversation');
  conversation.classList.remove('hidden');
  conversation.removeAttribute('aria-hidden');

  // Carrega mensagens
  const messagesInner = document.getElementById('messages-inner');
  messagesInner.innerHTML = '<div style="text-align:center;color:#8696a0;padding:20px;font-size:13px;">Carregando...</div>';

  try {
    const msgs = await fetchMessages(conv.id, 80);
    renderMessages(msgs);
  } catch (err) {
    messagesInner.innerHTML = '<div style="text-align:center;color:#ff5252;padding:20px;">Erro ao carregar mensagens</div>';
  }

  // Realtime
  if (_supabase) {
    subscribeToConversation(conv.id, onNewMessage);
  }
}

function hideConversation() {
  document.getElementById('welcome-screen').classList.remove('hidden');
  document.getElementById('conversation').classList.add('hidden');
  document.getElementById('conversation').setAttribute('aria-hidden', 'true');
  _activeConvId = null;
}

function renderMessages(msgs) {
  const container = document.getElementById('messages-inner');
  container.innerHTML = '';
  const profile = getProfile();
  const groups  = groupMessagesByDate(msgs);

  for (const item of groups) {
    if (item.type === 'divider') {
      const div = document.createElement('div');
      div.className = 'date-divider';
      div.innerHTML = `<span>${formatDateDivider(item.date)}</span>`;
      container.appendChild(div);
    } else {
      const el = createMessageEl(item.data, profile.id, openMediaModal);
      container.appendChild(el);
    }
  }
  scrollToBottom();
}

function onNewMessage(msg) {
  const profile = getProfile();
  if (msg.conversation_id !== _activeConvId) return;
  const container = document.getElementById('messages-inner');
  const el = createMessageEl(msg, profile.id, openMediaModal);
  container.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  const scroll = document.getElementById('messages-scroll');
  scroll.scrollTop = scroll.scrollHeight;
}

// ══════════════════════════════════════════════════
//  SEND TEXT
// ══════════════════════════════════════════════════
async function handleSendText() {
  if (!_activeConvId) return;
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = '';
  document.getElementById('send-btn').classList.add('hidden');
  document.getElementById('mic-btn').classList.remove('hidden');

  const profile = getProfile();

  // Mensagem otimista
  const optimistic = {
    id:              'opt_' + Date.now(),
    conversation_id: _activeConvId,
    sender_id:       profile.id,
    content:         text,
    type:            'text',
    created_at:      new Date().toISOString(),
  };
  const el = createMessageEl(optimistic, profile.id, openMediaModal);
  document.getElementById('messages-inner').appendChild(el);
  scrollToBottom();

  try {
    if (_supabase) {
      await sendMessage({
        convId:    _activeConvId,
        senderId:  profile.id,
        content:   text,
        type:      'text',
      });
      // Remove otimista (realtime vai inserir o real)
      el.remove();
    }
  } catch (err) {
    toast('Erro ao enviar mensagem', 'error');
  }
}

// ══════════════════════════════════════════════════
//  SEND FILE (imagem/vídeo/áudio/arquivo)
// ══════════════════════════════════════════════════
async function handleFileSelect(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !_activeConvId) return;

  const type = detectMediaType(file);
  const maxBytes = CONFIG_MAX_FILE;

  if (file.size > maxBytes) {
    toast(`Arquivo muito grande (máx ${Math.floor(maxBytes/1024/1024)} MB)`, 'error');
    return;
  }

  toast(`Enviando ${type}...`);

  try {
    const folder  = type + 's';
    const url     = await uploadToR2(file, folder, (pct) => {
      toast(`Upload: ${pct}%`);
    });

    let audioPeaks = null;
    if (type === 'audio') {
      try {
        const peaks = await extractPeaks(file);
        audioPeaks  = peaks;
      } catch {}
    }

    const profile = getProfile();
    if (_supabase) {
      await sendMessage({
        convId:    _activeConvId,
        senderId:  profile.id,
        content:   null,
        type,
        mediaUrl:  url,
        mediaName: file.name,
        mediaSize: file.size,
        audioPeaks,
      });
    } else {
      // Modo offline: renderiza local
      const msg = {
        id:              'local_' + Date.now(),
        conversation_id: _activeConvId,
        sender_id:       profile.id,
        type,
        media_url:       url,
        media_name:      file.name,
        media_size:      file.size,
        audio_peaks:     audioPeaks,
        created_at:      new Date().toISOString(),
      };
      const el = createMessageEl(msg, profile.id, openMediaModal);
      document.getElementById('messages-inner').appendChild(el);
      scrollToBottom();
    }
    toast('Arquivo enviado!', 'success');
  } catch (err) {
    toast('Erro no upload: ' + err.message, 'error');
  }
}

// Fallback para quando Supabase não está configurado
const CONFIG_MAX_FILE = 100 * 1024 * 1024;

// ══════════════════════════════════════════════════
//  RECORDING
// ══════════════════════════════════════════════════
async function handleMicClick() {
  if (!_activeConvId) {
    toast('Selecione uma conversa primeiro');
    return;
  }
  const vizCanvas = document.getElementById('rec-viz');
  const timerEl   = document.getElementById('rec-timer');

  try {
    showRecordingRow();
    await startRecording(vizCanvas, timerEl);
  } catch (err) {
    showInputRow();
    toast('Permissão de microfone negada', 'error');
  }
}

async function handleSendRecording() {
  try {
    const { blob, duration, mimeType } = await stopRecording();
    showInputRow();

    toast('Enviando áudio...');

    const file    = new File([blob], `audio_${Date.now()}.webm`, { type: mimeType });
    let audioPeaks = null;
    try { audioPeaks = await extractPeaks(blob); } catch {}

    const profile = getProfile();

    if (_supabase) {
      const url = await uploadToR2(file, 'audios');
      await sendMessage({
        convId:     _activeConvId,
        senderId:   profile.id,
        type:       'audio',
        mediaUrl:   url,
        mediaName:  file.name,
        mediaSize:  blob.size,
        audioPeaks,
      });
    } else {
      // Modo offline: cria blob URL local
      const localUrl = URL.createObjectURL(blob);
      const msg = {
        id:              'local_' + Date.now(),
        conversation_id: _activeConvId,
        sender_id:       profile.id,
        type:            'audio',
        media_url:       localUrl,
        media_name:      file.name,
        media_size:      blob.size,
        audio_peaks:     audioPeaks,
        created_at:      new Date().toISOString(),
      };
      const el = createMessageEl(msg, profile.id, openMediaModal);
      document.getElementById('messages-inner').appendChild(el);
      scrollToBottom();
      toast('Áudio local (configure Supabase+R2 para sincronizar)', 'success');
    }
  } catch (err) {
    showInputRow();
    toast('Erro ao enviar áudio: ' + err.message, 'error');
  }
}

function showRecordingRow() {
  document.getElementById('input-row').classList.add('hidden');
  document.getElementById('recording-row').classList.remove('hidden');
}

function showInputRow() {
  document.getElementById('recording-row').classList.add('hidden');
  document.getElementById('input-row').classList.remove('hidden');
}

// ══════════════════════════════════════════════════
//  NEW CHAT
// ══════════════════════════════════════════════════
function openNewChatDialog() {
  document.getElementById('new-chat-overlay').classList.remove('hidden');
  document.getElementById('user-search-input').focus();
}

function closeNewChatDialog() {
  document.getElementById('new-chat-overlay').classList.add('hidden');
  document.getElementById('user-search-input').value = '';
  document.getElementById('user-search-results').innerHTML =
    '<div class="search-hint">Digite um @username para buscar</div>';
}

async function searchUsers() {
  const q       = document.getElementById('user-search-input').value.trim().replace(/^@/, '');
  const results = document.getElementById('user-search-results');
  const profile = getProfile();

  if (q.length < 2) {
    results.innerHTML = '<div class="search-hint">Digite pelo menos 2 caracteres</div>';
    return;
  }

  if (!_supabase) {
    results.innerHTML = '<div class="search-hint">Configure o Supabase para buscar usuários</div>';
    return;
  }

  results.innerHTML = '<div class="search-hint">Buscando...</div>';

  try {
    const users = await fetchUserByUsername(q);
    const filtered = users.filter(u => u.id !== profile.id);

    if (!filtered.length) {
      results.innerHTML = '<div class="search-hint">Nenhum usuário encontrado</div>';
      return;
    }

    results.innerHTML = '';
    for (const user of filtered) {
      const item = document.createElement('div');
      item.className = 'user-result-item';

      const av = createAvatarEl(user, 40);
      av.className += ' user-result-avatar';

      const info = document.createElement('div');
      info.className = 'user-result-info';
      info.innerHTML = `
        <div class="user-result-name">${escHtml(user.display_name)}</div>
        <div class="user-result-username">@${escHtml(user.username)}</div>
      `;

      item.appendChild(av);
      item.appendChild(info);

      item.onclick = async () => {
        closeNewChatDialog();
        toast('Iniciando conversa...');
        const conv = await findOrCreateConversation(profile.id, user.id).catch(e => {
          toast('Erro: ' + e.message, 'error'); return null;
        });
        if (!conv) return;

        // Adiciona à lista se não existir
        if (!_conversations.find(c => c.id === conv.id)) {
          _conversations.unshift(conv);
        }

        await renderConversationList();
        openConversation(conv, user);
      };

      results.appendChild(item);
    }
  } catch (err) {
    results.innerHTML = `<div class="search-hint" style="color:#ff5252">Erro: ${err.message}</div>`;
  }
}

// ══════════════════════════════════════════════════
//  PROFILE PANEL
// ══════════════════════════════════════════════════
function openProfilePanel() {
  renderProfilePanel();
  document.getElementById('profile-panel').classList.add('open');
}

function closeProfilePanel() {
  document.getElementById('profile-panel').classList.remove('open');
}

async function editProfileField(field) {
  const profile = getProfile();
  const displayEl = document.getElementById(
    field === 'name' ? 'pf-name' : field === 'username' ? 'pf-username' : 'pf-desc'
  );

  if (field === 'username') {
    if (!canChangeUsername()) {
      toast(`Aguarde ${formatCooldownRemaining()} para trocar o username`, 'error');
      return;
    }
  }

  const current = field === 'username'
    ? profile.username
    : field === 'name' ? profile.display_name : profile.description || '';

  const input = document.createElement('input');
  input.type      = 'text';
  input.className = 'inline-edit-input';
  input.value     = current;
  input.maxLength = field === 'username' ? 25 : field === 'name' ? 50 : 150;

  displayEl.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    let val = input.value.trim();
    if (!val) { renderProfilePanel(); return; }

    if (field === 'username') {
      val = sanitizeUsername(val);
      if (!isValidUsername(val)) {
        toast('Username inválido (3-25 chars, letras/números/.-_)', 'error');
        renderProfilePanel();
        return;
      }
      if (_supabase) {
        const avail = await isUsernameAvailable(val, profile.id).catch(() => true);
        if (!avail) {
          toast('Username já está em uso', 'error');
          renderProfilePanel();
          return;
        }
      }
      profile.username            = val;
      profile.username_changed_at = Date.now();
    } else if (field === 'name') {
      profile.display_name = val;
    } else {
      profile.description = val;
    }

    await setProfile(profile);
    if (_supabase) await upsertProfile(profile).catch(() => {});
    renderProfilePanel();
    renderMiniAvatar();
    toast('Perfil atualizado!', 'success');
  };

  input.onblur    = save;
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } };
}

async function handleChangePhoto(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    const data    = await compressImage(file);
    const profile = getProfile();
    profile.avatar_data = data;
    await setProfile(profile);

    // Upload para R2 se disponível
    if (_supabase) {
      try {
        const url = await uploadToR2(file, 'avatars');
        profile.avatar_url = url;
        await setProfile(profile);
        await upsertProfile(profile);
      } catch {}
    }

    renderProfilePanel();
    renderMiniAvatar();
    toast('Foto atualizada!', 'success');
  } catch {
    toast('Erro ao processar imagem', 'error');
  }
}

// ══════════════════════════════════════════════════
//  MEDIA MODAL
// ══════════════════════════════════════════════════
function openMediaModal({ type, url }) {
  const area    = document.getElementById('media-content-area');
  const dlBtn   = document.getElementById('media-download-btn');
  area.innerHTML = '';

  if (type === 'image') {
    const img = document.createElement('img');
    img.src   = url;
    img.alt   = 'imagem';
    area.appendChild(img);
  } else if (type === 'video') {
    const vid = document.createElement('video');
    vid.src      = url;
    vid.controls = true;
    vid.autoplay = true;
    area.appendChild(vid);
  }

  dlBtn.href = url;
  dlBtn.download = url.split('/').pop();
  document.getElementById('media-modal').classList.remove('hidden');
}

function closeMediaModal() {
  document.getElementById('media-modal').classList.add('hidden');
  const area = document.getElementById('media-content-area');
  const vid  = area.querySelector('video');
  if (vid) vid.pause();
  area.innerHTML = '';
}

// ══════════════════════════════════════════════════
//  FILTER CHAT LIST
// ══════════════════════════════════════════════════
function filterChatList(q) {
  const items = document.querySelectorAll('.chat-item');
  const lq    = q.toLowerCase();
  items.forEach(item => {
    const name = item.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
    item.style.display = name.includes(lq) ? '' : 'none';
  });
}

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════
function toast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ══════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

window.addEventListener('resize', () => {
  _isMobile = window.innerWidth <= 680;
});

// ══════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════
boot().catch(err => {
  console.error('[Boot]', err);
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#e9edef;font-family:sans-serif;background:#0b141a;gap:12px;">
      <div style="font-size:40px;">⚠️</div>
      <h2>Erro ao iniciar o Chatly</h2>
      <p style="color:#8696a0;">${err.message}</p>
      <p style="color:#8696a0;font-size:13px;">Verifique o console (F12) para detalhes</p>
    </div>`;
});
