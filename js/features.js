// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — features.js                           ║
// ║  Interações de UI: menus, reply, favoritos,     ║
// ║  arquivo, fixar, busca, contato, mídia          ║
// ╚══════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let _currentMsgCtx   = null;   // { msg, isOut, rowEl }
let _currentConvCtx  = null;   // { convId, itemEl }
let _replyingTo      = null;   // msg object
let _pinnedMessages  = {};     // convId → msg
let _mutedConvs      = new Set();
let _archivedConvs   = new Set();
let _pinnedConvs     = new Set();
let _favorites       = [];
let _blockedUsers    = new Set();
let _convSearchRes   = [];
let _convSearchIdx   = 0;
let _archiveHash     = null;
let _cachedMessages  = [];     // msgs da conversa aberta

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
function initFeatures() {
  initDropdowns();
  initConvContextMenu();
  initMsgContextMenu();
  initReply();
  initArchive();
  initConvSearch();
  initContactProfile();
  initMediaPanel();
  initPinnedBanner();
  initScrollToBottom();
  loadLocalPrefs();
}

// ══════════════════════════════════════════════════
//  DROPDOWNS (sidebar ⋮ e conversa ⋮)
// ══════════════════════════════════════════════════
function initDropdowns() {
  const sideMoreBtn  = document.getElementById('sidebar-more-btn');
  const sideDropdown = document.getElementById('sidebar-dropdown');
  const convMoreBtn  = document.getElementById('conv-more-btn');
  const convDropdown = document.getElementById('conv-dropdown');

  sideMoreBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllMenus();
    sideDropdown.classList.toggle('hidden');
    positionNear(sideDropdown, sideMoreBtn);
  };

  sideDropdown.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      sideDropdown.classList.add('hidden');
      handleSidebarAction(btn.dataset.action);
    };
  });

  convMoreBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllMenus();
    convDropdown.classList.toggle('hidden');
    positionNear(convDropdown, convMoreBtn);
  };

  convDropdown.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      convDropdown.classList.add('hidden');
      handleConvAction(btn.dataset.action);
    };
  });

  document.addEventListener('click', closeAllMenus);
}

function positionNear(el, anchor) {
  const r = anchor.getBoundingClientRect();
  el.style.top   = (r.bottom + 4) + 'px';
  el.style.right = (window.innerWidth - r.right) + 'px';
  el.style.left  = 'auto';
}

function closeAllMenus() {
  ['sidebar-dropdown','conv-dropdown','msg-context-menu',
   'conv-context-menu','delete-submenu'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden')
  );
}

function handleSidebarAction(action) {
  switch (action) {
    case 'new-group':     openNewChatDialog('group'); break;
    case 'new-chat':      openNewChatDialog('dm');    break;
    case 'favorites':     openFavoritesPanel();       break;
    case 'mark-all-read': markAllConvsRead();         break;
    case 'settings':      openSettingsPanel();        break;
  }
}

function handleConvAction(action) {
  if (!_activeConvId) return;
  switch (action) {
    case 'search-conv': openConvSearch();                          break;
    case 'media-links': openMediaPanel();                         break;
    case 'clear-conv':  confirmClearConv(_activeConvId);          break;
    case 'mute-this':   toggleMuteConv(_activeConvId);            break;
    case 'block-user':  blockCurrentContact();                     break;
    case 'archive-this': archiveConv(_activeConvId);              break;
  }
}

// ══════════════════════════════════════════════════
//  CONTEXT MENU — CONVERSA (long-press na lista)
// ══════════════════════════════════════════════════
function initConvContextMenu() {
  const menu = document.getElementById('conv-context-menu');
  menu.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.add('hidden');
      if (_currentConvCtx) handleConvCtxAction(btn.dataset.action, _currentConvCtx.convId);
      _currentConvCtx = null;
    };
  });
}

function attachConvContextMenu(itemEl, convId) {
  let timer;
  itemEl.addEventListener('pointerdown', (e) => {
    timer = setTimeout(() => showConvCtxMenu(e, convId, itemEl), 500);
  });
  itemEl.addEventListener('pointerup',   () => clearTimeout(timer));
  itemEl.addEventListener('pointerleave',() => clearTimeout(timer));
  itemEl.addEventListener('contextmenu', (e) => { e.preventDefault(); showConvCtxMenu(e, convId, itemEl); });
}

function showConvCtxMenu(e, convId, itemEl) {
  closeAllMenus();
  _currentConvCtx = { convId, itemEl };
  const menu    = document.getElementById('conv-context-menu');
  const pinBtn  = menu.querySelector('[data-action="pin-conv"]');
  const muteBtn = menu.querySelector('[data-action="mute-conv"]');
  pinBtn.innerHTML  = _pinnedConvs.has(convId)
    ? '<span class="material-symbols-rounded">push_pin</span> Desafixar'
    : '<span class="material-symbols-rounded">push_pin</span> Fixar';
  muteBtn.innerHTML = _mutedConvs.has(convId)
    ? '<span class="material-symbols-rounded">notifications</span> Ativar notificações'
    : '<span class="material-symbols-rounded">notifications_off</span> Desativar notificações';
  menu.classList.remove('hidden');
  positionAtEvent(menu, e);
}

async function handleConvCtxAction(action, convId) {
  switch (action) {
    case 'pin-conv':     await togglePinConv(convId);    break;
    case 'archive-conv': await archiveConv(convId);      break;
    case 'mute-conv':    await toggleMuteConv(convId);   break;
    case 'delete-conv':  confirmDeleteConv(convId);       break;
  }
}

// ══════════════════════════════════════════════════
//  CONTEXT MENU — MENSAGEM (long-press na bolha)
// ══════════════════════════════════════════════════
function initMsgContextMenu() {
  const menu    = document.getElementById('msg-context-menu');
  const submenu = document.getElementById('delete-submenu');

  menu.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (btn.dataset.action === 'delete') {
        submenu.classList.toggle('hidden');
        positionAtEl(submenu, btn);
        return;
      }
      menu.classList.add('hidden');
      if (_currentMsgCtx) handleMsgCtxAction(btn.dataset.action, _currentMsgCtx);
      _currentMsgCtx = null;
    };
  });

  submenu.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      menu.classList.add('hidden');
      submenu.classList.add('hidden');
      if (_currentMsgCtx) handleMsgCtxAction(btn.dataset.action, _currentMsgCtx);
      _currentMsgCtx = null;
    };
  });
}

function attachMsgContextMenu(rowEl, msg, isOut) {
  let timer;
  rowEl.addEventListener('pointerdown', (e) => {
    timer = setTimeout(() => showMsgCtxMenu(e, msg, isOut, rowEl), 500);
  });
  rowEl.addEventListener('pointerup',    () => clearTimeout(timer));
  rowEl.addEventListener('pointerleave', () => clearTimeout(timer));
  rowEl.addEventListener('contextmenu',  (e) => { e.preventDefault(); showMsgCtxMenu(e, msg, isOut, rowEl); });
}

function showMsgCtxMenu(e, msg, isOut, rowEl) {
  closeAllMenus();
  _currentMsgCtx = { msg, isOut, rowEl };
  const menu        = document.getElementById('msg-context-menu');
  const deleteAllBtn = document.getElementById('delete-all-btn');
  deleteAllBtn.style.display = isOut ? '' : 'none';

  const isFav = _favorites.some(f => f.id === msg.id);
  menu.querySelector('[data-action="favorite"]').innerHTML = isFav
    ? '<span class="material-symbols-rounded">star</span> Remover dos favoritos'
    : '<span class="material-symbols-rounded">star_border</span> Favoritar';
  menu.querySelector('[data-action="pin"]').innerHTML = msg.is_pinned
    ? '<span class="material-symbols-rounded">push_pin</span> Desafixar'
    : '<span class="material-symbols-rounded">push_pin</span> Fixar';

  menu.classList.remove('hidden');
  positionAtEvent(menu, e);
}

async function handleMsgCtxAction(action, ctx) {
  const { msg, isOut, rowEl } = ctx;
  switch (action) {
    case 'reply':
      startReply(msg);
      break;
    case 'favorite':
      await toggleFavoriteMsg(msg);
      break;
    case 'copy':
      if (msg.content) navigator.clipboard.writeText(msg.content).catch(() => {});
      toast('Copiado!');
      break;
    case 'forward':
      openForwardDialog(msg);
      break;
    case 'pin':
      await togglePinMessage(msg);
      break;
    case 'delete-me':
      rowEl.remove();
      if (_supabase) softDeleteMsg(msg.id, getProfile()?.id, false).catch(() => {});
      break;
    case 'delete-all':
      if (isOut) {
        rowEl.remove();
        if (_supabase) softDeleteMsg(msg.id, getProfile()?.id, true).catch(() => {});
      }
      break;
  }
}

// ══════════════════════════════════════════════════
//  REPLY
// ══════════════════════════════════════════════════
function initReply() {
  document.getElementById('cancel-reply').onclick = cancelReply;

  // Swipe direito = responder (mobile)
  const inner = document.getElementById('messages-inner');
  let touchStartX = 0, swipeEl = null;

  inner.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    swipeEl = e.target.closest('.msg-row');
  }, { passive: true });

  inner.addEventListener('touchmove', (e) => {
    if (!swipeEl) return;
    const dx = e.touches[0].clientX - touchStartX;
    if (dx > 0 && dx < 80) swipeEl.style.transform = `translateX(${dx}px)`;
  }, { passive: true });

  inner.addEventListener('touchend', () => {
    if (!swipeEl) return;
    const dx = parseFloat(swipeEl.style.transform?.replace('translateX(', '') || 0);
    swipeEl.style.transition = 'transform .15s';
    swipeEl.style.transform  = '';
    setTimeout(() => swipeEl && (swipeEl.style.transition = ''), 150);
    if (dx > 50) {
      const msgId = swipeEl.dataset.id;
      const msg   = _cachedMessages.find(m => m.id === msgId);
      if (msg) startReply(msg);
    }
    swipeEl = null;
  }, { passive: true });
}

function startReply(msg) {
  _replyingTo = msg;
  const profile = getProfile();
  const name    = msg.sender_id === profile?.id ? 'Você' : (_activeOtherUser?.display_name || 'Usuário');

  document.getElementById('reply-preview-name').textContent = name;
  document.getElementById('reply-preview-text').textContent = msg.content || previewText(msg);
  document.getElementById('reply-preview').classList.remove('hidden');
  document.getElementById('msg-input').focus();
}

function cancelReply() {
  _replyingTo = null;
  document.getElementById('reply-preview').classList.add('hidden');
}

function getReplyingTo() { return _replyingTo; }
function clearReply()    { _replyingTo = null; document.getElementById('reply-preview').classList.add('hidden'); }

// ══════════════════════════════════════════════════
//  FAVORITOS
// ══════════════════════════════════════════════════
async function toggleFavoriteMsg(msg) {
  const isFav = _favorites.some(f => f.id === msg.id);
  if (isFav) {
    _favorites = _favorites.filter(f => f.id !== msg.id);
    toast('Removido dos favoritos');
  } else {
    _favorites.unshift({ ...msg, _favAt: new Date().toISOString() });
    toast('Favoritado! ★');
  }
  await saveLocalPrefs({ favorites: _favorites });
  if (_supabase) toggleFavMsgDB(msg.id, getProfile()?.id, !isFav).catch(() => {});
}

function openFavoritesPanel() {
  const panel = document.getElementById('favorites-side-panel');
  const list  = document.getElementById('favorites-messages-list');

  list.innerHTML = '';

  if (!_favorites.length) {
    list.innerHTML = '<div class="empty-state-sidebar"><span class="material-symbols-rounded" style="font-size:40px">star</span><p>Nenhuma mensagem favoritada</p></div>';
  } else {
    for (const msg of _favorites) {
      const item = document.createElement('div');
      item.className = 'favorite-msg-item';
      item.innerHTML = `
        <div class="fav-meta">
          <span class="fav-sender">${escHtml(msg._senderName || 'Usuário')}</span>
          <span class="fav-time">${formatFavTime(msg._favAt || msg.created_at)}</span>
        </div>
        <div class="fav-content">${escHtml(msg.content || previewText(msg))}</div>
      `;
      list.appendChild(item);
    }
  }

  panel.classList.add('open');
  document.getElementById('close-favorites-side').onclick = () => panel.classList.remove('open');
}

function formatFavTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ══════════════════════════════════════════════════
//  ARQUIVAMENTO COM SENHA
// ══════════════════════════════════════════════════
function initArchive() {
  document.getElementById('archived-row').onclick = () => openArchiveEntry();
  document.getElementById('close-archive-modal').onclick = () =>
    document.getElementById('archive-password-modal').classList.add('hidden');
  document.getElementById('archive-password-submit').onclick = handleArchiveSubmit;
  document.getElementById('archive-set-password').onclick   = handleSetArchivePassword;
  document.getElementById('archive-password-input').onkeydown = (e) => {
    if (e.key === 'Enter') handleArchiveSubmit();
  };
  loadArchiveHash();
}

async function loadArchiveHash() {
  try {
    const row = await dbGet('profile', '__archive_hash');
    _archiveHash = row?.v || null;
  } catch {}
}

async function saveArchiveHash(hash) {
  _archiveHash = hash;
  const db = await openDB();
  const tx = db.transaction('profile', 'readwrite');
  tx.objectStore('profile').put({ v: hash }, '__archive_hash');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function openArchiveEntry() {
  if (_archiveHash) {
    const modal = document.getElementById('archive-password-modal');
    document.getElementById('archive-password-input').value = '';
    document.getElementById('archive-set-password-label').textContent = 'Alterar senha';
    modal.classList.remove('hidden');
    document.getElementById('archive-password-input').focus();
  } else {
    showArchivedList();
  }
}

async function handleArchiveSubmit() {
  const val  = document.getElementById('archive-password-input').value;
  if (!val) return;
  const hash = await sha256(val);
  if (!_archiveHash || hash === _archiveHash) {
    document.getElementById('archive-password-modal').classList.add('hidden');
    showArchivedList();
  } else {
    toast('Senha incorreta', 'error');
    document.getElementById('archive-password-input').value = '';
  }
}

async function handleSetArchivePassword() {
  const val = document.getElementById('archive-password-input').value;
  if (val.length < 4) { toast('Mínimo 4 caracteres', 'error'); return; }
  const hash = await sha256(val);
  await saveArchiveHash(hash);
  if (_supabase) updateUserPref('archive_hash', hash).catch(() => {});
  document.getElementById('archive-password-modal').classList.add('hidden');
  toast('Senha definida ✓', 'success');
}

async function archiveConv(convId) {
  _archivedConvs.add(convId);
  await saveLocalPrefs({ archived: [..._archivedConvs] });
  renderConversationList();
  updateArchivedRow();
  if (_activeConvId === convId) hideConversation();
  if (_supabase) toggleArchiveDB(convId, getProfile()?.id, true).catch(() => {});
  toast('Conversa arquivada');
}

async function unarchiveConv(convId) {
  _archivedConvs.delete(convId);
  await saveLocalPrefs({ archived: [..._archivedConvs] });
  renderConversationList();
  updateArchivedRow();
}

function updateArchivedRow() {
  const n       = _archivedConvs.size;
  const countEl = document.getElementById('archived-count');
  const rowEl   = document.getElementById('archived-row');
  countEl.textContent = n;
  countEl.classList.toggle('hidden', n === 0);
  if (rowEl) rowEl.classList.toggle('hidden', n === 0);
}

function showArchivedList() {
  const archived = _conversations.filter(c => _archivedConvs.has(c.id));
  if (!archived.length) { toast('Nenhuma conversa arquivada'); return; }

  let panel = document.getElementById('archived-side-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'archived-side-panel';
    panel.className = 'profile-panel';
    panel.innerHTML = `
      <div class="panel-header accent-header">
        <button class="icon-btn" id="close-archived-side">
          <span class="material-symbols-rounded">arrow_back</span>
        </button>
        <h3>Conversas Arquivadas</h3>
      </div>
      <div id="archived-chats-list" class="chats-list scrollable"></div>
    `;
    document.getElementById('app').insertBefore(panel, document.getElementById('chat-area'));
    document.getElementById('close-archived-side').onclick = () => {
      panel.classList.remove('open');
    };
  }

  const list = panel.querySelector('#archived-chats-list');
  list.innerHTML = '';

  const profile = getProfile();
  (async () => {
    for (const conv of archived) {
      const otherId   = conv.is_group ? null : conv.participants?.find(p => p !== profile?.id);
      const otherUser = otherId ? (await fetchUserById(otherId).catch(() => null)) : null;
      const msgs = await fetchMessages(conv.id, 1).catch(() => []);
      const last = msgs[msgs.length - 1] || null;

      const item = createChatItemEl(conv, otherUser, last, profile?.id, () => {
        panel.classList.remove('open');
        openConversation(conv, otherUser);
      });

      const unarchiveBtn = document.createElement('button');
      unarchiveBtn.className = 'icon-btn';
      unarchiveBtn.title = 'Desarquivar';
      unarchiveBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;color:#8696a0">unarchive</span>';
      unarchiveBtn.onclick = (e) => {
        e.stopPropagation();
        unarchiveConv(conv.id);
        item.remove();
        if (!list.children.length) panel.classList.remove('open');
      };
      item.appendChild(unarchiveBtn);
      list.appendChild(item);
    }
  })();

  panel.classList.add('open');
}

// ══════════════════════════════════════════════════
//  FIXAR CONVERSA
// ══════════════════════════════════════════════════
async function togglePinConv(convId) {
  if (_pinnedConvs.has(convId)) { _pinnedConvs.delete(convId); toast('Desafixado'); }
  else                          { _pinnedConvs.add(convId);    toast('Conversa fixada 📌'); }
  await saveLocalPrefs({ pinned: [..._pinnedConvs] });
  renderConversationList();
}

// ══════════════════════════════════════════════════
//  FIXAR MENSAGEM
// ══════════════════════════════════════════════════
async function togglePinMessage(msg) {
  msg.is_pinned = !msg.is_pinned;
  if (msg.is_pinned) {
    _pinnedMessages[_activeConvId] = msg;
    showPinnedBanner(msg);
    toast('Mensagem fixada 📌');
  } else {
    delete _pinnedMessages[_activeConvId];
    hidePinnedBanner();
    toast('Mensagem desafixada');
  }
  if (_supabase) pinMsgDB(msg.id, msg.is_pinned).catch(() => {});
}

function initPinnedBanner() {
  document.getElementById('pinned-banner').onclick = scrollToPinnedMsg;
  document.getElementById('unpin-msg-btn').onclick = (e) => {
    e.stopPropagation();
    const m = _pinnedMessages[_activeConvId];
    if (m) togglePinMessage(m);
  };
}

function showPinnedBanner(msg) {
  document.getElementById('pinned-text').textContent = msg.content || previewText(msg);
  document.getElementById('pinned-banner').classList.remove('hidden');
}

function hidePinnedBanner() {
  document.getElementById('pinned-banner').classList.add('hidden');
}

function scrollToPinnedMsg() {
  const pinned = _pinnedMessages[_activeConvId];
  if (!pinned) return;
  const el = document.querySelector(`[data-id="${pinned.id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('msg-highlight');
  setTimeout(() => el.classList.remove('msg-highlight'), 1500);
}

// ══════════════════════════════════════════════════
//  SILENCIAR CONVERSA
// ══════════════════════════════════════════════════
async function toggleMuteConv(convId) {
  if (_mutedConvs.has(convId)) { _mutedConvs.delete(convId); toast('Notificações ativadas 🔔'); }
  else                         { _mutedConvs.add(convId);    toast('Notificações desativadas 🔕'); }
  await saveLocalPrefs({ muted: [..._mutedConvs] });
}

function isConvMuted(convId) { return _mutedConvs.has(convId); }

// ══════════════════════════════════════════════════
//  DELETAR / LIMPAR CONVERSA
// ══════════════════════════════════════════════════
function confirmDeleteConv(convId) {
  if (!confirm('Deletar esta conversa?\nEsta ação não pode ser desfeita.')) return;
  _conversations = _conversations.filter(c => c.id !== convId);
  renderConversationList();
  if (_activeConvId === convId) hideConversation();
  toast('Conversa deletada');
}

function confirmClearConv(convId) {
  if (!confirm('Limpar todas as mensagens desta conversa?\n(Só para você)')) return;
  document.getElementById('messages-inner').innerHTML = '';
  _cachedMessages = [];
  toast('Conversa limpa');
  if (_supabase) clearConvDB(convId, getProfile()?.id).catch(() => {});
}

// ══════════════════════════════════════════════════
//  MARCAR TUDO COMO LIDO
// ══════════════════════════════════════════════════
function markAllConvsRead() {
  document.querySelectorAll('.chat-item-unread').forEach(el => {
    el.textContent = '';
    el.classList.add('hidden');
  });
  toast('Tudo marcado como lido ✓');
}

// ══════════════════════════════════════════════════
//  BLOQUEAR USUÁRIO
// ══════════════════════════════════════════════════
async function blockCurrentContact() {
  if (!_activeOtherUser) return;
  const user      = _activeOtherUser;
  const isBlocked = _blockedUsers.has(user.id);
  const name      = user.display_name || user.username;

  if (!confirm(`${isBlocked ? 'Desbloquear' : 'Bloquear'} ${name}?`)) return;

  if (isBlocked) {
    _blockedUsers.delete(user.id);
    toast(`${name} desbloqueado`);
    if (_supabase) blockUserDB(getProfile().id, user.id, false).catch(() => {});
  } else {
    _blockedUsers.add(user.id);
    toast(`${name} bloqueado`);
    if (_supabase) blockUserDB(getProfile().id, user.id, true).catch(() => {});
  }
  const cpBlockLabel = document.getElementById('cp-block-label');
  if (cpBlockLabel) cpBlockLabel.textContent = _blockedUsers.has(user.id) ? 'Desbloquear' : 'Bloquear';
  await saveLocalPrefs({ blocked: [..._blockedUsers] });
}

function isUserBlocked(userId) { return _blockedUsers.has(userId); }

// ══════════════════════════════════════════════════
//  ENCAMINHAR MENSAGEM
// ══════════════════════════════════════════════════
function openForwardDialog(msg) {
  // Mostra diálogo de nova conversa com mensagem pré-selecionada
  openNewChatDialog('forward', msg);
}

// ══════════════════════════════════════════════════
//  BUSCA DENTRO DA CONVERSA
// ══════════════════════════════════════════════════
function initConvSearch() {
  document.getElementById('conv-search-btn').onclick   = openConvSearch;
  document.getElementById('close-conv-search').onclick = closeConvSearch;
  document.getElementById('conv-search-prev').onclick  = () => navConvSearch(-1);
  document.getElementById('conv-search-next').onclick  = () => navConvSearch(1);
  document.getElementById('conv-search-input').oninput = debounce(doConvSearch, 300);
}

function openConvSearch() {
  document.getElementById('conv-search-bar').classList.remove('hidden');
  document.getElementById('conv-search-input').focus();
}

function closeConvSearch() {
  document.getElementById('conv-search-bar').classList.add('hidden');
  document.getElementById('conv-search-input').value    = '';
  document.getElementById('conv-search-results').textContent = '';
  document.querySelectorAll('.msg-search-match, .msg-search-active').forEach(el => {
    el.classList.remove('msg-search-match', 'msg-search-active');
  });
  _convSearchRes = [];
  _convSearchIdx = 0;
}

function doConvSearch() {
  const q  = document.getElementById('conv-search-input').value.trim().toLowerCase();
  const el = document.getElementById('conv-search-results');
  document.querySelectorAll('.msg-search-match, .msg-search-active').forEach(e =>
    e.classList.remove('msg-search-match', 'msg-search-active')
  );
  if (!q) { el.textContent = ''; return; }

  _convSearchRes = Array.from(document.querySelectorAll('.msg-row')).filter(row => {
    const txt = row.querySelector('.msg-text')?.textContent.toLowerCase() || '';
    if (txt.includes(q)) { row.classList.add('msg-search-match'); return true; }
    return false;
  });

  if (!_convSearchRes.length) { el.textContent = 'Nenhum resultado'; return; }
  _convSearchIdx = _convSearchRes.length - 1;
  navConvSearch(0);
}

function navConvSearch(dir) {
  if (!_convSearchRes.length) return;
  _convSearchIdx = (_convSearchIdx + dir + _convSearchRes.length) % _convSearchRes.length;
  document.querySelectorAll('.msg-search-active').forEach(e => e.classList.remove('msg-search-active'));
  const el = _convSearchRes[_convSearchIdx];
  el.classList.add('msg-search-active');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('conv-search-results').textContent =
    `${_convSearchIdx + 1}/${_convSearchRes.length}`;
}

// ══════════════════════════════════════════════════
//  PERFIL DO CONTATO (click no avatar dentro da conversa)
// ══════════════════════════════════════════════════
function initContactProfile() {
  document.getElementById('close-contact-profile').onclick = closeContactProfile;

  // Click no mini-avatar e no nome no header
  ['contact-mini-avatar', 'contact-display-name'].forEach(id => {
    const el = document.getElementById(id);
    el.style.cursor = 'pointer';
    el.onclick = () => { if (_activeOtherUser) showContactProfile(_activeOtherUser); };
  });

  // Botões de ação no modal de contato
  document.getElementById('cp-search').onclick   = () => { closeContactProfile(); openConvSearch(); };
  document.getElementById('cp-favorite').onclick = () => { closeContactProfile(); openFavoritesPanel(); };
  document.getElementById('cp-mute').onclick     = () => { closeContactProfile(); toggleMuteConv(_activeConvId); };
  document.getElementById('cp-media').onclick    = () => { closeContactProfile(); openMediaPanel(); };
  document.getElementById('cp-block').onclick    = () => { closeContactProfile(); blockCurrentContact(); };
  document.getElementById('cp-delete').onclick   = () => { closeContactProfile(); confirmDeleteConv(_activeConvId); };
  document.getElementById('cp-add-group').onclick = () => { closeContactProfile(); openNewChatDialog('group'); };

  // Click FORA da conversa (na lista de chats) — só amplia a foto
  document.getElementById('chats-list').addEventListener('click', (e) => {
    const avatar = e.target.closest('.avatar');
    if (!avatar) return;
    const chatItem = avatar.closest('.chat-item');
    if (!chatItem) return;
    e.stopPropagation();
    const img = avatar.querySelector('img');
    if (img) openMediaModal({ type: 'image', url: img.src });
  });
}

function showContactProfile(user) {
  const modal  = document.getElementById('contact-profile-modal');
  const img    = document.getElementById('contact-profile-img');
  const letter = document.getElementById('contact-profile-letter');

  if (user.avatar_url) {
    img.src = user.avatar_url; img.hidden = false; letter.hidden = true;
  } else {
    img.hidden = true; letter.hidden = false;
    letter.classList.remove('material-symbols-rounded');
    letter.style.cssText = 'font-size:42px; font-weight:700; font-family:Outfit,sans-serif; color:var(--accent);';
    letter.textContent = (user.display_name || '?')[0].toUpperCase();
  }

  document.getElementById('contact-profile-name').textContent = user.display_name || '';
  document.getElementById('contact-profile-username').textContent = '@' + (user.username || '');
  document.getElementById('contact-profile-desc').textContent = user.description || '';

  const isBlocked = _blockedUsers.has(user.id);
  const cpBlockLabel = document.getElementById('cp-block-label');
  if (cpBlockLabel) cpBlockLabel.textContent = isBlocked ? 'Desbloquear' : 'Bloquear';

  modal.classList.remove('hidden');
}

function closeContactProfile() {
  document.getElementById('contact-profile-modal').classList.add('hidden');
}

// ══════════════════════════════════════════════════
//  PAINEL DE MÍDIA
// ══════════════════════════════════════════════════
function initMediaPanel() {
  document.getElementById('close-media-panel').onclick = () =>
    document.getElementById('media-panel').classList.remove('open');
}

function openMediaPanel() {
  const panel   = document.getElementById('media-panel');
  const content = document.getElementById('media-panel-content');
  content.innerHTML = '';
  panel.classList.add('open');

  const mediaMsgs = _cachedMessages.filter(m => ['image','video','file'].includes(m.type));
  const linkMsgs  = _cachedMessages.filter(m => m.type === 'text' && extractLinks(m.content).length > 0);

  if (!mediaMsgs.length && !linkMsgs.length) {
    content.innerHTML = '<div style="text-align:center;color:#8696a0;padding:30px">Nenhuma mídia, link ou documento</div>';
    return;
  }

  if (mediaMsgs.length) {
    const title = document.createElement('div');
    title.className = 'media-panel-section-title';
    title.textContent = 'Mídia e Documentos';
    content.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'media-panel-grid';

    for (const msg of mediaMsgs) {
      const item = document.createElement('div');
      item.className = 'media-panel-item';

      if (msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.media_url; img.alt = '';
        img.onclick = () => openMediaModal({ type: 'image', url: msg.media_url });
        item.appendChild(img);
      } else if (msg.type === 'video') {
        item.innerHTML = '<span class="material-symbols-rounded" style="font-size:28px">videocam</span>';
        item.title = msg.media_name || 'Vídeo';
        item.onclick = () => openMediaModal({ type: 'video', url: msg.media_url });
      } else {
        item.textContent = fileEmoji(msg.media_name || '');
        item.title = msg.media_name || 'Arquivo';
        item.onclick = () => window.open(msg.media_url, '_blank');
      }
      grid.appendChild(item);
    }
    content.appendChild(grid);
  }

  if (linkMsgs.length) {
    const title = document.createElement('div');
    title.className = 'media-panel-section-title';
    title.textContent = 'Links';
    content.appendChild(title);

    for (const msg of linkMsgs) {
      for (const link of extractLinks(msg.content)) {
        const a = document.createElement('a');
        a.className = 'media-panel-link';
        a.href = link; a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = link;
        content.appendChild(a);
      }
    }
  }
}

function extractLinks(text) {
  if (!text) return [];
  return text.match(/https?:\/\/[^\s]+/g) || [];
}

// ══════════════════════════════════════════════════
//  SCROLL TO BOTTOM
// ══════════════════════════════════════════════════
function initScrollToBottom() {
  const btn    = document.getElementById('scroll-to-bottom');
  const scroll = document.getElementById('messages-scroll');
  const badge  = document.getElementById('scroll-unread-badge');

  btn.onclick = () => {
    scroll.scrollTop = scroll.scrollHeight;
    badge.classList.add('hidden');
    badge.textContent = '0';
  };

  scroll.onscroll = () => {
    const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
    btn.classList.toggle('hidden', nearBottom);
  };
}

// ══════════════════════════════════════════════════
//  MENSAGENS CACHEADAS (para media panel, search, reply)
// ══════════════════════════════════════════════════
function setCachedMessages(msgs) { _cachedMessages = msgs || []; }
function findMsgById(id)         { return _cachedMessages.find(m => m.id === id) || null; }

// ══════════════════════════════════════════════════
//  PREFERÊNCIAS LOCAIS
// ══════════════════════════════════════════════════
async function saveLocalPrefs(patch) {
  let prefs = {};
  try {
    const row = await dbGet('profile', '__feat_prefs');
    prefs = row?.v || {};
  } catch {}
  Object.assign(prefs, patch);
  const db = await openDB();
  const tx = db.transaction('profile', 'readwrite');
  tx.objectStore('profile').put({ v: prefs }, '__feat_prefs');
}

async function loadLocalPrefs() {
  try {
    const row   = await dbGet('profile', '__feat_prefs');
    const prefs = row?.v || {};
    if (prefs.archived) prefs.archived.forEach(id => _archivedConvs.add(id));
    if (prefs.pinned)   prefs.pinned.forEach(id   => _pinnedConvs.add(id));
    if (prefs.muted)    prefs.muted.forEach(id    => _mutedConvs.add(id));
    if (prefs.blocked)  prefs.blocked.forEach(id  => _blockedUsers.add(id));
    if (prefs.favorites) _favorites = prefs.favorites;
    updateArchivedRow();
  } catch {}
}

// ══════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════
function positionAtEvent(el, e) {
  const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  // Aguarda o menu renderizar para calcular offset
  requestAnimationFrame(() => {
    const w = el.offsetWidth  || 180;
    const h = el.offsetHeight || 120;
    el.style.left  = Math.min(x, window.innerWidth  - w - 8) + 'px';
    el.style.top   = Math.min(y, window.innerHeight - h - 8) + 'px';
    el.style.right = 'auto';
  });
}

function positionAtEl(el, anchor) {
  const r = anchor.getBoundingClientRect();
  el.style.left  = r.left + 'px';
  el.style.top   = r.bottom + 'px';
  el.style.right = 'auto';
}

// ══════════════════════════════════════════════════
//  CONVENIÊNCIA — expõe para app.js usar na lista
// ══════════════════════════════════════════════════
function isConvArchived(convId) { return _archivedConvs.has(convId); }
function isConvPinned(convId)   { return _pinnedConvs.has(convId); }
function getSortedConvIds()     { return [..._pinnedConvs]; }
