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
  if (_prefs.customWallpaper) _customWallpaperUrl = _prefs.customWallpaper;
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
  const html = document.documentElement;
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    window.matchMedia('(prefers-color-scheme: dark)').onchange = (e) => {
      if (_prefs.theme === 'system') {
        html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };
  } else {
    html.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }
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

  // Sincroniza os dois pickers (usa .value e não setAttribute para atualizar visualmente)
  const p1 = document.getElementById('bubble-color-picker');
  const p2 = document.getElementById('bubble-color-picker2');
  if (p1) p1.value = color;
  if (p2) p2.value = color;
}

function applyBubbleColor(color) {
  const root = document.documentElement;
  root.style.setProperty('--bubble-out',       color);
  root.style.setProperty('--bubble-out-hover',  color + 'cc');
  root.style.setProperty('--accent',            color);
  root.style.setProperty('--primary',           color);
  root.style.setProperty('--accent-hover',      color + 'dd');
  root.style.setProperty('--fab-bg',            color);
  root.style.setProperty('--send-btn-bg',       color);
  root.style.setProperty('--btn-primary-bg',    color);
}

// ══════════════════════════════════════════════════
//  WALLPAPER
// ══════════════════════════════════════════════════
const WALLPAPERS = [
  { id: 'default', label: 'Padrão',    css: '' },
  { id: 'dots',    label: 'Pontos',    css: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,                          size: '24px 24px' },
  { id: 'lines',   label: 'Linhas',    css: `repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 12px)`, size: '' },
  { id: 'bubbles', label: 'Bolhas',    css: `radial-gradient(ellipse at 20% 20%, rgba(0,168,132,0.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(37,211,102,0.07) 0%, transparent 50%)`, size: '' },
  { id: 'dark',    label: 'Escuro',    css: `linear-gradient(135deg, #0b1a22 0%, #0d2030 100%)`, size: '' },
];

let _customWallpaperUrl = null;

function initWallpaperControl() {
  ['wallpaper-item', 'wallpaper-item2'].forEach(id => {
    const item = document.getElementById(id);
    if (!item || item.querySelector('.wallpaper-swatches')) return;

    const swatches = document.createElement('div');
    swatches.className = 'wallpaper-swatches';
    WALLPAPERS.forEach(wp => {
      const btn = document.createElement('button');
      btn.className = 'wp-swatch' + (wp.id === (_prefs.wallpaper || 'default') ? ' active' : '');
      btn.title = wp.label;
      btn.dataset.wpId = wp.id;
      btn.textContent = wp.label[0];
      btn.onclick = () => {
        document.querySelectorAll('.wp-swatch').forEach(s => s.classList.remove('active'));
        document.querySelectorAll(`.wp-swatch[data-wp-id="${wp.id}"]`).forEach(s => s.classList.add('active'));
        setWallpaper(wp.id);
      };
      swatches.appendChild(btn);
    });

    const customBtn = document.createElement('button');
    customBtn.className = 'wp-swatch' + (_prefs.wallpaper === 'custom' ? ' active' : '');
    customBtn.title = 'Foto';
    customBtn.dataset.wpId = 'custom';
    customBtn.textContent = '🖼';
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.hidden = true;
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        _customWallpaperUrl = ev.target.result;
        savePref('customWallpaper', _customWallpaperUrl);
        document.querySelectorAll('.wp-swatch').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.wp-swatch[data-wp-id="custom"]').forEach(s => s.classList.add('active'));
        setWallpaper('custom');
      };
      reader.readAsDataURL(file);
    };
    customBtn.onclick = () => fileInput.click();
    swatches.appendChild(customBtn);
    swatches.appendChild(fileInput);
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
  if (id === 'custom' && _customWallpaperUrl) {
    scroll.style.backgroundImage = `url(${_customWallpaperUrl})`;
    scroll.style.backgroundSize  = 'cover';
    scroll.style.backgroundPosition = 'center';
    return;
  }
  const wp = WALLPAPERS.find(w => w.id === id);
  if (!wp || !wp.css) {
    scroll.style.backgroundImage = '';
    scroll.style.backgroundSize  = '';
  } else {
    scroll.style.backgroundImage = wp.css;
    scroll.style.backgroundSize  = wp.size || 'auto';
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
  if (!('Notification' in window)) {
    ['notif-status-text','notif-status-text2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = 'Não suportado neste navegador';
    });
    ['pref-notifications','pref-notifications2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.disabled = true; el.checked = false; }
    });
    return;
  }

  ['pref-notifications', 'pref-notifications2'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = _prefs.notificationsOn && Notification.permission === 'granted';
    el.onchange = async () => {
      if (el.checked) {
        if (Notification.permission === 'denied') {
          toast('Permissão bloqueada. Ative nas configurações do navegador.', 'error');
          el.checked = false;
          return;
        }
        const perm = await Notification.requestPermission();
        el.checked = perm === 'granted';
        if (perm !== 'granted') {
          toast('Permissão negada. Verifique as configurações do navegador.', 'error');
        }
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
  let status;
  if (!('Notification' in window)) {
    status = 'Não suportado neste navegador';
  } else if (Notification.permission === 'granted') {
    status = _prefs.notificationsOn ? 'Ativadas ✓' : 'Desativadas';
  } else if (Notification.permission === 'denied') {
    status = 'Bloqueadas — ative nas configurações do navegador';
  } else {
    status = 'Clique para ativar';
  }

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
    if (_deleteClicks >= DELETE_REQUIRED) return;
    _deleteClicks++;
    const remaining = Math.max(0, DELETE_REQUIRED - _deleteClicks);
    document.getElementById('delete-click-counter').textContent    = remaining;
    document.getElementById('delete-clicks-remaining').textContent = remaining > 0
      ? `${remaining} cliques restantes`
      : 'Pronto! Confirme abaixo';

    if (_deleteClicks >= DELETE_REQUIRED) {
      document.getElementById('delete-account-final').disabled = false;
      clickArea.style.opacity = '0.4';
      clickArea.style.pointerEvents = 'none';
    }
  };

  document.getElementById('delete-account-final').onclick = executeDeleteAccount;
}

function openDeleteAccountModal() {
  _deleteClicks = 0;
  document.getElementById('delete-click-counter').textContent    = DELETE_REQUIRED;
  document.getElementById('delete-clicks-remaining').textContent = `${DELETE_REQUIRED} cliques restantes`;
  document.getElementById('delete-account-final').disabled = true;
  const clickArea = document.getElementById('delete-click-area');
  clickArea.style.opacity = '';
  clickArea.style.pointerEvents = '';
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
