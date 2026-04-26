// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — groups.js                             ║
// ║  Criação e gerenciamento de grupos              ║
// ╚══════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let _groupSelectedMembers = [];  // [{ id, display_name, username, avatar_url }]
let _groupAvatarData      = null;
let _forwardMsg           = null; // mensagem sendo encaminhada

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
function initGroups() {
  initNewChatTabs();
  initGroupCreation();
}

// ══════════════════════════════════════════════════
//  TABS: DM vs GRUPO no dialog de nova conversa
// ══════════════════════════════════════════════════
function initNewChatTabs() {
  const tabs = document.querySelectorAll('.dialog-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.dialog-tab-content').forEach(c => c.classList.add('hidden'));
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.remove('hidden');
    };
  });
}

// Override do openNewChatDialog para suportar tabs e encaminhamento
function openNewChatDialog(mode = 'dm', forwardMsg = null) {
  _forwardMsg = forwardMsg;

  const overlay = document.getElementById('new-chat-overlay');
  overlay.classList.remove('hidden');

  // Seleciona a tab correta
  const tabDM    = document.querySelector('[data-tab="dm"]');
  const tabGroup = document.querySelector('[data-tab="group"]');

  if (mode === 'group' && tabGroup) {
    tabGroup.click();
  } else if (tabDM) {
    tabDM.click();
  }

  if (forwardMsg) {
    const title = overlay.querySelector('.dialog-title');
    if (title) title.textContent = 'Encaminhar para...';
  } else {
    const title = overlay.querySelector('.dialog-title');
    if (title) title.textContent = 'Nova conversa';
  }

  setTimeout(() => document.getElementById('user-search-input')?.focus(), 100);
}

// ══════════════════════════════════════════════════
//  CRIAÇÃO DE GRUPO
// ══════════════════════════════════════════════════
function initGroupCreation() {
  // Avatar do grupo
  const groupAvZone = document.getElementById('group-avatar-preview')?.closest('.avatar-upload-zone');
  const groupAvInput = document.getElementById('group-avatar-input');

  if (groupAvZone) {
    groupAvZone.onclick = () => groupAvInput?.click();
  }
  if (groupAvInput) {
    groupAvInput.onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      _groupAvatarData = await compressImage(file);
      const preview = document.getElementById('group-avatar-preview');
      const img = preview.querySelector('img') || document.createElement('img');
      img.src = _groupAvatarData;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
      preview.appendChild(img);
      const icon = preview.querySelector('.avatar-icon, .material-symbols-rounded');
      if (icon) icon.style.display = 'none';
    };
  }

  // Busca de membros
  const memberSearch = document.getElementById('group-member-search');
  if (memberSearch) {
    memberSearch.oninput = debounce(searchGroupMembers, 400);
  }

  // Botão criar grupo
  const createBtn = document.getElementById('create-group-btn');
  if (createBtn) {
    createBtn.onclick = handleCreateGroup;
  }

  // Valida o botão quando o nome mudar
  document.getElementById('group-name-input')?.addEventListener('input', validateGroupForm);
}

async function searchGroupMembers() {
  const q       = document.getElementById('group-member-search').value.trim().replace(/^@/, '');
  const results = document.getElementById('group-member-results');
  const profile = getProfile();

  if (q.length < 2) {
    results.innerHTML = '<div class="search-hint">Digite pelo menos 2 caracteres</div>';
    return;
  }

  if (!_supabase) {
    results.innerHTML = '<div class="search-hint">Configure o Supabase para buscar</div>';
    return;
  }

  results.innerHTML = '<div class="search-hint">Buscando...</div>';

  try {
    const users = await fetchUserByUsername(q);
    const filtered = users.filter(u =>
      u.id !== profile.id &&
      !_groupSelectedMembers.some(m => m.id === u.id)
    );

    if (!filtered.length) {
      results.innerHTML = '<div class="search-hint">Nenhum usuário encontrado</div>';
      return;
    }

    results.innerHTML = '';
    for (const user of filtered) {
      const item = document.createElement('div');
      item.className = 'user-result-item';
      item.innerHTML = `
        <div class="avatar" style="width:36px;height:36px;font-size:14px;background:#2a3942;color:#00a884;flex-shrink:0">
          ${user.avatar_url
            ? `<img src="${escHtml(user.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : (user.display_name || '?')[0].toUpperCase()}
        </div>
        <div class="user-result-info">
          <div class="user-result-name">${escHtml(user.display_name)}</div>
          <div class="user-result-username">@${escHtml(user.username)}</div>
        </div>
        <button class="btn-outline" style="font-size:12px;padding:4px 10px">Adicionar</button>
      `;
      item.querySelector('button').onclick = () => addGroupMemberUI(user);
      results.appendChild(item);
    }
  } catch (err) {
    results.innerHTML = `<div class="search-hint" style="color:#ff5252">Erro: ${err.message}</div>`;
  }
}

function addGroupMemberUI(user) {
  if (_groupSelectedMembers.some(m => m.id === user.id)) return;
  if (_groupSelectedMembers.length >= 249) {
    toast('Máximo de 250 participantes', 'error');
    return;
  }
  _groupSelectedMembers.push(user);
  renderSelectedMembers();
  validateGroupForm();

  // Limpa busca
  document.getElementById('group-member-search').value = '';
  document.getElementById('group-member-results').innerHTML =
    '<div class="search-hint">Digite para adicionar mais</div>';
}

function removeGroupMemberUI(userId) {
  _groupSelectedMembers = _groupSelectedMembers.filter(m => m.id !== userId);
  renderSelectedMembers();
  validateGroupForm();
}

function renderSelectedMembers() {
  const container = document.getElementById('group-selected-members');
  if (!container) return;
  container.innerHTML = '';

  for (const user of _groupSelectedMembers) {
    const chip = document.createElement('div');
    chip.className = 'member-chip';
    chip.innerHTML = `
      <span>${escHtml(user.display_name || user.username)}</span>
      <button class="chip-remove" title="Remover">×</button>
    `;
    chip.querySelector('.chip-remove').onclick = () => removeGroupMemberUI(user.id);
    container.appendChild(chip);
  }
}

function validateGroupForm() {
  const name    = document.getElementById('group-name-input')?.value.trim() || '';
  const createBtn = document.getElementById('create-group-btn');
  if (createBtn) createBtn.disabled = name.length < 1 || _groupSelectedMembers.length < 1;
}

async function handleCreateGroup() {
  const name  = document.getElementById('group-name-input')?.value.trim();
  const desc  = document.getElementById('group-desc-input')?.value.trim() || '';
  const profile = getProfile();

  if (!name || !profile) return;

  const createBtn = document.getElementById('create-group-btn');
  createBtn.disabled = true;
  createBtn.textContent = 'Criando...';

  try {
    const memberIds = [profile.id, ..._groupSelectedMembers.map(m => m.id)];

    let avatarUrl = null;
    if (_groupAvatarData && _supabase) {
      try {
        const file = await dataURLtoFile(_groupAvatarData, 'group-avatar.jpg');
        avatarUrl = await uploadToR2(file, 'avatars');
      } catch {}
    }

    let conv;
    if (_supabase) {
      conv = await createGroupConversation({
        name,
        description: desc,
        avatar_url:  avatarUrl,
        created_by:  profile.id,
        participants: memberIds,
      });
    } else {
      // Offline — cria localmente
      conv = {
        id:              'local_grp_' + Date.now(),
        is_group:        true,
        group_name:      name,
        group_desc:      desc,
        group_avatar:    _groupAvatarData,
        participants:    memberIds,
        created_by:      profile.id,
        last_message_at: new Date().toISOString(),
      };
    }

    if (!_conversations.find(c => c.id === conv.id)) {
      _conversations.unshift(conv);
    }

    // Limpa estado do form
    _groupSelectedMembers = [];
    _groupAvatarData = null;
    document.getElementById('group-name-input').value  = '';
    document.getElementById('group-desc-input').value  = '';
    document.getElementById('group-selected-members').innerHTML = '';
    const preview = document.getElementById('group-avatar-preview');
    if (preview) {
      preview.querySelectorAll('img').forEach(img => img.remove());
      const icon = preview.querySelector('.material-symbols-rounded');
      if (icon) icon.style.display = '';
    }

    closeNewChatDialog();
    await renderConversationList();
    openConversation(conv, null);
    toast(`Grupo "${name}" criado! 🎉`, 'success');
  } catch (err) {
    toast('Erro ao criar grupo: ' + err.message, 'error');
  } finally {
    createBtn.disabled   = false;
    createBtn.textContent = 'Criar grupo';
  }
}

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
async function dataURLtoFile(dataUrl, filename) {
  const res  = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

function getGroupName(conv) {
  return conv.group_name || conv.name || 'Grupo';
}

function getGroupAvatar(conv) {
  return conv.group_avatar || conv.avatar_url || null;
}

function isGroupConv(conv) {
  return conv.is_group || conv.type === 'group' || !!conv.group_id || conv.participants?.length > 2;
}
