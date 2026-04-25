// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — profile.js                            ║
// ║  Gerenciamento de perfil local + Supabase       ║
// ╚══════════════════════════════════════════════════╝


let _profile = null;

// ── LOAD ──────────────────────────────────────────
async function loadProfile() {
  _profile = await getLocalProfile();
  return _profile;
}

function getProfile() {
  return _profile;
}

async function setProfile(data) {
  _profile = data;
  await saveLocalProfile(data);
}

// ── AVATAR ────────────────────────────────────────
/**
 * Converte File de imagem para base64 comprimido (max ~300px)
 * e salva no perfil local (no IndexedDB).
 */
function compressImage(file, maxSize = 300, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio  = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── USERNAME ──────────────────────────────────────
function sanitizeUsername(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 25);
}

function isValidUsername(u) {
  return u.length >= 3 && /^[a-z0-9][a-z0-9._-]{1,23}[a-z0-9]$/.test(u);
}

function canChangeUsername() {
  if (!_profile?.username_changed_at) return true;
  const elapsed = Date.now() - _profile.username_changed_at;
  return elapsed >= CONFIG.USERNAME_COOLDOWN_MS;
}

function usernameNextChangeMs() {
  if (!_profile?.username_changed_at) return 0;
  const elapsed = Date.now() - _profile.username_changed_at;
  return Math.max(0, CONFIG.USERNAME_COOLDOWN_MS - elapsed);
}

function formatCooldownRemaining() {
  const ms = usernameNextChangeMs();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// ── PROFILE PANEL UI ─────────────────────────────
let _supabase = null;
function injectSupabase(sb) { _supabase = sb; }

function renderProfilePanel() {
  const p = _profile;
  if (!p) return;

  // Avatar
  const bigImg  = document.getElementById('big-avatar-img');
  const bigLet  = document.getElementById('big-avatar-letter');
  if (p.avatar_data) {
    bigImg.src     = p.avatar_data;
    bigImg.hidden  = false;
    bigLet.hidden  = true;
  } else {
    bigImg.hidden  = true;
    bigLet.hidden  = false;
    bigLet.textContent = (p.display_name || '?')[0].toUpperCase();
  }

  document.getElementById('pf-name').textContent     = p.display_name || '—';
  document.getElementById('pf-username').textContent = '@' + (p.username || '—');
  document.getElementById('pf-desc').textContent     = p.description  || 'Sem descrição';

  // Username cooldown notice
  const notice   = document.getElementById('username-cooldown-notice');
  const editBtn  = document.getElementById('edit-username-btn');
  const remaining = formatCooldownRemaining();
  if (remaining) {
    notice.textContent = `⏱ Você pode trocar o username novamente em ${remaining}`;
    notice.classList.remove('hidden');
    editBtn.disabled = true;
    editBtn.style.opacity = '0.3';
  } else {
    notice.classList.add('hidden');
    editBtn.disabled = false;
    editBtn.style.opacity = '';
  }

  // Mini avatar (sidebar)
  renderMiniAvatar(p);
}

function renderMiniAvatar(p = _profile) {
  if (!p) return;
  const img = document.getElementById('my-avatar-img');
  const let_ = document.getElementById('my-avatar-letter');
  if (p.avatar_data) {
    img.src = p.avatar_data;
    img.hidden = false;
    let_.hidden = true;
  } else {
    img.hidden = true;
    let_.hidden = false;
    let_.textContent = (p.display_name || '?')[0].toUpperCase();
  }
}

// ── SYNC TO SUPABASE ──────────────────────────────
async function syncProfileToSupabase(supabase, profile) {
  if (!supabase) return;
  try {
    // avatar_data é base64 local — não enviamos, apenas a URL se tiver
    const payload = {
      id:           profile.id,
      username:     profile.username,
      display_name: profile.display_name,
      description:  profile.description  || '',
      avatar_url:   profile.avatar_url   || null,
      username_changed_at: profile.username_changed_at
        ? new Date(profile.username_changed_at).toISOString()
        : null,
    };
    await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
  } catch (err) {
    console.warn('[Profile] Sync falhou:', err.message);
  }
}
