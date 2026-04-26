// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — settings.js                           ║
// ║  Configurações: tema, privacidade, notificações ║
// ║  wallpaper, cor da bolha, conta vinculada,      ║
// ║  exclusão de conta                              ║
// ╚══════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let _prefs = {
  theme:           'dark',
  bubbleColor:     '#005c4b',
  wallpaper:       null,
  notificationsOn: false,
  showLastSeen:    true,
  showOnline:      true,
  readReceipts:    true,
};

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
async function initSettings() {
  await loadPrefs();
  applyTheme(_prefs.theme);
  applyBubbleColor(_prefs.bubbleColor);
  if (_prefs.wallpaper) applyWallpaper(_prefs.wallpaper);

  initThemeControls();
  initPrivacyControls();
  initNotifControl();
  initWallpaperControl();
  initBubbleColorControl();
  initLinkedProfile();
  initDeleteAccount();

  // Botão de fechar nas duas versões do painel
  document.getElementById('close-settings-side').onclick = closeSettingsPanel;
  document.getElementById('close-settings')?.addEventListener('click', closeSettingsPanel);
}

function openSettingsPanel() {
  syncPrefsToUI();
  document.getElementById('settings-side-panel').classList.add('open');
}

function closeSettingsPanel() {
  document.getElementById('settings-side-panel').classList.remove('open');
}

// ══════════════════════════════════════════════════
//  TEMA
// ══════════════════════════════════════════════════
function initThemeControls() {
  // Há dois sets de controles (panel e modal de settings)
  ['theme-control', 'theme-control2'].forEach(id => {
    const ctrl = document.getElementById(id);
    if (!ctrl) return;
    ctrl.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        ctrl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.dataset.theme || btn.textContent.toLowerCase().replace('padrão','system').replace('claro','light').replace('escuro','dark');
        setTheme(theme);
      };
    });
  });
}

function setTheme(theme) {
  _prefs.theme = theme;
  applyTheme(theme);
  savePref('theme', theme);
}

function applyTheme(theme) {
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark', 'theme-system');

  if (theme === 'light') {
    body.classList.add('theme-light');
  } else if (theme === 'system') {
    body.classList.add('theme-system');
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!isDark) body.classList.add('theme-light');
    window.matchMedia('(prefers-color-scheme: dark)').onchange = (e) => {
      body.classList.toggle('theme-light', !e.matches);
    };
  }
  // dark é o padrão, sem classe
}

// ══════════════════════════════════════════════════
//  COR DA BOLHA
// ══════════════════════════════════════════════════
function initBubbleColorControl() {
  ['bubble-color-picker', 'bubble-color-picker2'].forEach(id => {
    const picker = document.getElementById(id);
    if (!picker) return;
    picker.value = _prefs.bubbleColor;
    picker.oninput = () => setBubbleColor(picker.value);
  });
}

function setBubbleColor(color) {
  _prefs.bubbleColor = color;
  applyBubbleColor(color);
  savePref('bubbleColor', color);

  // Sincroniza os dois pickers
  document.getElementById('bubble-color-picker')?.setAttribute('value', color);
  document.getElementById('bubble-color-picker2')?.setAttribute('value', color);
}

function applyBubbleColor(color) {
  document.documentElement.style.setProperty('--bubble-out', color);
  // Gera uma versão mais clara para hover
  document.documentElement.style.setProperty('--bubble-out-hover', color + 'cc');
}

// ══════════════════════════════════════════════════
//  WALLPAPER
// ══════════════════════════════════════════════════
const WALLPAPERS = [
  { id: 'default', label: 'Padrão',    css: '' },
  { id: 'dots',    label: 'Pontos',    css: 'var(--wallpaper-dots)' },
  { id: 'lines',   label: 'Linhas',    css: 'var(--wallpaper-lines)' },
  { id: 'bubbles', label: 'Bolhas',    css: 'var(--wallpaper-bubbles)' },
  { id: 'dark',    label: 'Escuro',    css: 'var(--wallpaper-dark)' },
];

function initWallpaperControl() {
  ['wallpaper-item', 'wallpaper-item2'].forEach(id => {
    const item = document.getElementById(id);
    if (!item) return;
    // Injeta swatches se ainda não tiver
    if (item.querySelector('.wallpaper-swatches')) return;
    const swatches = document.createElement('div');
    swatches.className = 'wallpaper-swatches';
    WALLPAPERS.forEach(wp => {
      const btn = document.createElement('button');
      btn.className = 'wp-swatch' + (wp.id === _prefs.wallpaper || (!_prefs.wallpaper && wp.id === 'default') ? ' active' : '');
      btn.title = wp.label;
      btn.textContent = wp.label[0];
      btn.onclick = () => {
        document.querySelectorAll('.wp-swatch').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.wp-swatch').forEach(s => {
          if (s.title === wp.label) s.classList.add('active');
        });
        setWallpaper(wp.id);
      };
      swatches.appendChild(btn);
    });
    item.appendChild(swatches);
  });
}

function setWallpaper(id) {
  _prefs.wallpaper = id;
  applyWallpaper(id);
  savePref('wallpaper', id);
}

function applyWallpaper(id) {
  const scroll = document.getElementById('messages-scroll');
  if (!scroll) return;
  const wp = WALLPAPERS.find(w => w.id === id);
  if (!wp || !wp.css) {
    scroll.style.backgroundImage = '';
  } else {
    scroll.style.backgroundImage = wp.css;
  }
}

// ══════════════════════════════════════════════════
//  PRIVACIDADE
// ══════════════════════════════════════════════════
function initPrivacyControls() {
  linkCheckbox('pref-show-lastseen',  'pref-show-lastseen2',  'showLastSeen');
  linkCheckbox('pref-show-online',    'pref-show-online2',    'showOnline');
  linkCheckbox('pref-read-receipts',  'pref-read-receipts2',  'readReceipts');
}

function linkCheckbox(id1, id2, prefKey) {
  [id1, id2].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = _prefs[prefKey];
    el.onchange = () => {
      _prefs[prefKey] = el.checked;
      // Sincroniza o outro checkbox
      const other = document.getElementById(id === id1 ? id2 : id1);
      if (other) other.checked = el.checked;
      savePref(prefKey, el.checked);
      if (_supabase) updateUserPref(prefKey, el.checked).catch(() => {});
    };
  });
}

// ══════════════════════════════════════════════════
//  NOTIFICAÇÕES
// ══════════════════════════════════════════════════
function initNotifControl() {
  ['pref-notifications', 'pref-notifications2'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = _prefs.notificationsOn;
    el.onchange = async () => {
      if (el.checked) {
        const perm = await Notification.requestPermission();
        el.checked = perm === 'granted';
        const other = document.getElementById(id === 'pref-notifications' ? 'pref-notifications2' : 'pref-notifications');
        if (other) other.checked = el.checked;
      }
      _prefs.notificationsOn = el.checked;
      savePref('notificationsOn', el.checked);
      updateNotifStatus();
    };
  });
  updateNotifStatus();
}

function updateNotifStatus() {
  const status = Notification.permission === 'granted'
    ? (_prefs.notificationsOn ? 'Ativadas' : 'Desativadas')
    : Notification.permission === 'denied'
    ? 'Bloqueadas pelo navegador'
    : 'Não configuradas';

  ['notif-status-text','notif-status-text2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = status;
  });
}

// ══════════════════════════════════════════════════
//  PERFIL VINCULADO (email + senha)
// ══════════════════════════════════════════════════
function initLinkedProfile() {
  ['linked-profile-item', 'linked-profile-item2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', openLinkedProfileModal);
  });

  document.getElementById('close-linked-profile').onclick = () =>
    document.getElementById('linked-profile-modal').classList.add('hidden');

  document.getElementById('save-linked-profile').onclick = saveLinkedProfile;
  updateLinkedProfileStatus();
}

function openLinkedProfileModal() {
  document.getElementById('linked-profile-modal').classList.remove('hidden');
  document.getElementById('linked-email').value            = '';
  document.getElementById('linked-password').value         = '';
  document.getElementById('linked-password-confirm').value = '';
}

async function saveLinkedProfile() {
  const email   = document.getElementById('linked-email').value.trim();
  const pwd     = document.getElementById('linked-password').value;
  const confirm = document.getElementById('linked-password-confirm').value;

  if (!email || !pwd) { toast('Preencha e-mail e senha', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('E-mail inválido', 'error'); return; }
  if (pwd.length < 8)       { toast('Senha mínimo 8 caracteres', 'error'); return; }
  if (pwd !== confirm)      { toast('Senhas não coincidem', 'error'); return; }

  // Hash da senha
  const pwdHash = await sha256(pwd);

  const profile = getProfile();
  profile.linked_email    = email;
  profile.linked_pwd_hash = pwdHash;
  await setProfile(profile);

  if (_supabase) {
    updateUserPref('linked_email', email).catch(() => {});
    updateUserPref('linked_password_hash', pwdHash).catch(() => {});
  }

  document.getElementById('linked-profile-modal').classList.add('hidden');
  updateLinkedProfileStatus();
  toast('Perfil vinculado! ✓', 'success');
}

function updateLinkedProfileStatus() {
  const profile = getProfile();
  const email   = profile?.linked_email || null;
  const text    = email || 'Não vinculado';

  ['linked-profile-sub', 'linked-profile-sub2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

// ══════════════════════════════════════════════════
//  EXCLUIR CONTA (50 cliques)
// ══════════════════════════════════════════════════
let _deleteClicks = 0;
const DELETE_REQUIRED = 50;

function initDeleteAccount() {
  ['delete-account-item', 'delete-account-item2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', openDeleteAccountModal);
  });

  document.getElementById('cancel-delete-account').onclick = () => {
    closeDeleteModal();
  };

  const clickArea = document.getElementById('delete-click-area');
  clickArea.onclick = () => {
    _deleteClicks++;
    const remaining = DELETE_REQUIRED - _deleteClicks;
    document.getElementById('delete-click-counter').textContent     = remaining;
    document.getElementById('delete-clicks-remaining').textContent  = `${remaining} cliques restantes`;

    if (_deleteClicks >= DELETE_REQUIRED) {
      document.getElementById('delete-account-final').disabled = false;
    }
  };

  document.getElementById('delete-account-final').onclick = executeDeleteAccount;
}

function openDeleteAccountModal() {
  _deleteClicks = 0;
  document.getElementById('delete-click-counter').textContent    = DELETE_REQUIRED;
  document.getElementById('delete-clicks-remaining').textContent = `${DELETE_REQUIRED} cliques restantes`;
  document.getElementById('delete-account-final').disabled = true;
  document.getElementById('delete-account-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('delete-account-modal').classList.add('hidden');
  _deleteClicks = 0;
}

async function executeDeleteAccount() {
  if (!confirm('ÚLTIMA CONFIRMAÇÃO: Esta ação é irreversível. Excluir conta?')) return;

  // Apaga perfil local
  const db = await openDB();
  const tx = db.transaction(['profile','conversations','messages','blobcache'], 'readwrite');
  ['profile','conversations','messages','blobcache'].forEach(s => tx.objectStore(s).clear());

  // Marca para deleção no Supabase (mas mantém mensagens nos chats dos outros)
  if (_supabase && getProfile()?.id) {
    softDeleteProfileDB(getProfile().id).catch(() => {});
  }

  // Limpa tudo e recarrega
  localStorage.clear();
  sessionStorage.clear();
  toast('Conta excluída. Até mais!', 'success');
  setTimeout(() => window.location.reload(), 2000);
}

// ══════════════════════════════════════════════════
//  SINCRONIZA UI com prefs carregadas
// ══════════════════════════════════════════════════
function syncPrefsToUI() {
  // Checkboxes de privacidade
  ['pref-show-lastseen','pref-show-lastseen2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = _prefs.showLastSeen;
  });
  ['pref-show-online','pref-show-online2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = _prefs.showOnline;
  });
  ['pref-read-receipts','pref-read-receipts2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = _prefs.readReceipts;
  });

  // Pickers de cor
  ['bubble-color-picker','bubble-color-picker2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = _prefs.bubbleColor;
  });

  // Tema
  ['theme-control','theme-control2'].forEach(ctrlId => {
    const ctrl = document.getElementById(ctrlId);
    if (!ctrl) return;
    ctrl.querySelectorAll('button').forEach(btn => {
      const t = btn.dataset.theme;
      btn.classList.toggle('active', t === _prefs.theme);
    });
  });

  updateNotifStatus();
  updateLinkedProfileStatus();
}

// ══════════════════════════════════════════════════
//  PERSISTÊNCIA DE PREFS
// ══════════════════════════════════════════════════
async function savePref(key, value) {
  _prefs[key] = value;
  try {
    const db  = await openDB();
    const tx  = db.transaction('profile', 'readwrite');
    const row = await new Promise((res, rej) => {
      const r = tx.objectStore('profile').get('__settings');
      r.onsuccess = () => res(r.result ?? {});
      r.onerror   = () => rej(r.error);
    });
    row[key] = value;
    tx.objectStore('profile').put(row, '__settings');
  } catch (e) {
    console.warn('[settings] savePref:', e);
  }
}

async function loadPrefs() {
  try {
    const db  = await openDB();
    const row = await new Promise((res, rej) => {
      const tx = db.transaction('profile', 'readonly');
      const r  = tx.objectStore('profile').get('__settings');
      r.onsuccess = () => res(r.result || {});
      r.onerror   = () => rej(r.error);
    });
    Object.assign(_prefs, row);
  } catch {}
}

// ══════════════════════════════════════════════════
//  GETTERS PÚBLICOS usados por outros módulos
// ══════════════════════════════════════════════════
function getReadReceipts()  { return _prefs.readReceipts;    }
function getShowLastSeen()  { return _prefs.showLastSeen;    }
function getShowOnline()    { return _prefs.showOnline;      }
function getNotifsEnabled() { return _prefs.notificationsOn && Notification.permission === 'granted'; }
