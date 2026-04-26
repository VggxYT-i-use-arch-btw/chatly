// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — supabase-client.js  (refatorado)      ║
// ║  Supabase: DB, Realtime, Auth anônima           ║
// ╚══════════════════════════════════════════════════╝

let _sb = null;

// ── INIT ──────────────────────────────────────────
function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    throw new Error('SDK do Supabase não carregou. Verifique o CDN no index.html.');
  }
  _sb = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY,
    { realtime: { params: { eventsPerSecond: 10 } } }
  );
  return _sb;
}

// Garante que o cliente está pronto antes de qualquer operação
function getSb() {
  if (!_sb) throw new Error('[Supabase] Cliente não inicializado. Chame initSupabase() primeiro.');
  return _sb;
}

// ── PROFILE ───────────────────────────────────────

async function upsertProfile(profile) {
  const { error } = await getSb().from('profiles').upsert({
    id:           profile.id,
    username:     profile.username,
    display_name: profile.display_name,
    description:  profile.description || '',
    avatar_url:   profile.avatar_url  || null,
    username_changed_at: profile.username_changed_at
      ? new Date(profile.username_changed_at).toISOString()
      : null,
  }, { onConflict: 'id' });
  if (error) throw error;
}

// Busca por username (prefixo — para sugestões ao digitar)
async function fetchUserByUsername(username) {
  const { data, error } = await getSb()
    .from('profiles')
    .select('id, username, display_name, avatar_url, description')
    .ilike('username', `${username}%`)
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

// Busca por ID com fallback ao cache local
async function fetchUserById(id) {
  // Tenta cache primeiro
  const cached = await dbGet('users', id).catch(() => null);
  if (cached) return cached;

  const { data, error } = await getSb()
    .from('profiles')
    .select('id, username, display_name, avatar_url, description')
    .eq('id', id)
    .single();

  if (error) return null;
  await dbPut('users', data).catch(() => {});
  return data;
}

// ── CONVERSATIONS ─────────────────────────────────

async function fetchConversations(myId) {
  const { data, error } = await getSb()
    .from('conversations')
    .select('*')
    .contains('participants', [myId])
    .order('last_message_at', { ascending: false });

  if (error) throw error;

  const list = data ?? [];
  // Cache local em paralelo (não bloqueia o retorno)
  Promise.all(list.map(c => dbPut('conversations', c))).catch(() => {});
  return list;
}

/**
 * CORREÇÃO: agora filtra is_group = false e verifica array com exatamente 2
 * participantes, evitando retornar grupos que incluam os dois usuários.
 */
async function findOrCreateConversation(myId, otherId) {
  const sb = getSb();

  // Chama a stored procedure do Supabase — mais seguro e atômico
  const { data, error } = await sb.rpc('find_or_create_conversation', {
    user_a: myId,
    user_b: otherId,
  });

  if (error) {
    // Fallback caso a RPC não exista: busca manual com filtros corretos
    console.warn('[findOrCreateConversation] RPC falhou, usando fallback:', error.message);

    const { data: existing, error: fetchErr } = await sb
      .from('conversations')
      .select('*')
      .contains('participants', [myId, otherId])
      .eq('is_group', false)
      .limit(10); // busca mais e filtra por tamanho exato client-side

    if (fetchErr) throw fetchErr;

    const dm = (existing ?? []).find(c => c.participants?.length === 2);
    if (dm) return dm;

    const { data: created, error: createErr } = await sb
      .from('conversations')
      .insert({
        participants:    [myId, otherId],
        is_group:        false,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createErr) throw createErr;
    return created;
  }

  return data;
}

async function updateConvLastMessage(convId) {
  const { error } = await getSb()
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', convId);

  if (error) console.warn('[updateConvLastMessage]', error.message);
}

// ── MESSAGES ──────────────────────────────────────

async function fetchMessages(convId, limit = 60) {
  const { data, error } = await getSb()
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const list = data ?? [];
  Promise.all(list.map(m => dbPut('messages', m))).catch(() => {});
  return list;
}

async function sendMessage({
  convId,
  senderId,
  content,
  type      = 'text',
  mediaUrl  = null,
  mediaName = null,
  mediaSize = null,
  audioPeaks = null,
}) {
  if (!convId)    throw new Error('convId é obrigatório');
  if (!senderId)  throw new Error('senderId é obrigatório');

  const { data, error } = await getSb()
    .from('messages')
    .insert({
      conversation_id: convId,
      sender_id:       senderId,
      content:         content    || null,
      type,
      media_url:       mediaUrl   || null,
      media_name:      mediaName  || null,
      media_size:      mediaSize  || null,
      audio_peaks:     audioPeaks || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Cache e atualiza conversa em paralelo (não bloqueia o retorno)
  Promise.all([
    dbPut('messages', data).catch(() => {}),
    updateConvLastMessage(convId),
  ]);

  return data;
}

// ── GRUPOS ────────────────────────────────────────

/**
 * CORREÇÃO: colunas corretas conforme o schema
 * (group_desc → group_description, group_avatar → group_avatar_url)
 */
async function createGroupConversation({ name, description, avatar_url, created_by, participants }) {
  const { data, error } = await getSb()
    .from('conversations')
    .insert({
      is_group:         true,
      group_name:       name,
      group_description: description || '',   // era "group_desc" — errado
      group_avatar_url:  avatar_url  || null, // era "group_avatar" — errado
      created_by,
      participants,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── REALTIME ──────────────────────────────────────

let _channel = null;

function subscribeToConversation(convId, onMessage) {
  unsubscribeAll(); // limpa canal anterior

  _channel = getSb()
    .channel(`conv:${convId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `conversation_id=eq.${convId}`,
      },
      (payload) => onMessage(payload.new)
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('[Realtime] Erro no canal:', convId);
      }
    });

  return _channel;
}

function unsubscribeAll() {
  if (_channel) {
    getSb().removeChannel(_channel);
    _channel = null;
  }
}

// ── USERNAME ──────────────────────────────────────

async function isUsernameAvailable(username, myId = null) {
  let q = getSb()
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase());

  if (myId) q = q.neq('id', myId);

  const { data, error } = await q.limit(1);
  if (error) throw error;
  return (data ?? []).length === 0;
}

// ── BLOCK ─────────────────────────────────────────

/**
 * CORREÇÃO: coluna blocker_id (era "user_id") e sem coluna "blocked"
 * O schema usa (blocker_id, blocked_id) — a presença do registro = bloqueado,
 * ausência = desbloqueado.
 */
async function blockUserDB(myId, targetId, block) {
  const sb = getSb();

  if (block) {
    const { error } = await sb
      .from('blocked_users')
      .upsert(
        { blocker_id: myId, blocked_id: targetId },
        { onConflict: 'blocker_id,blocked_id' }
      );
    if (error) console.warn('[blockUserDB] upsert:', error.message);
  } else {
    const { error } = await sb
      .from('blocked_users')
      .delete()
      .eq('blocker_id', myId)
      .eq('blocked_id', targetId);
    if (error) console.warn('[blockUserDB] delete:', error.message);
  }
}

// ── ARCHIVE / MUTE / PIN (conversation_settings) ──

/**
 * CORREÇÃO: tabela "conversation_settings" (era "conv_settings")
 * e coluna "conversation_id" (era "conv_id")
 */
async function upsertConvSetting(convId, userId, patch) {
  const { error } = await getSb()
    .from('conversation_settings')
    .upsert(
      { conversation_id: convId, user_id: userId, ...patch },
      { onConflict: 'conversation_id,user_id' }
    );
  if (error) console.warn('[upsertConvSetting]', error.message);
}

async function toggleArchiveDB(convId, userId, archived) {
  await upsertConvSetting(convId, userId, { is_archived: archived });
}

async function toggleMuteDB(convId, userId, muted) {
  await upsertConvSetting(convId, userId, { is_muted: muted });
}

async function togglePinConvDB(convId, userId, pinned) {
  await upsertConvSetting(convId, userId, { is_pinned: pinned });
}

// ── FAVORITOS ─────────────────────────────────────

/**
 * CORREÇÃO: tabela "message_favorites" (era "favorites")
 * e coluna "message_id" (era "msg_id")
 */
async function toggleFavMsgDB(msgId, userId, fav) {
  const sb = getSb();

  if (fav) {
    const { error } = await sb
      .from('message_favorites')
      .upsert(
        { message_id: msgId, user_id: userId },
        { onConflict: 'message_id,user_id' }
      );
    if (error) console.warn('[toggleFavMsgDB] upsert:', error.message);
  } else {
    const { error } = await sb
      .from('message_favorites')
      .delete()
      .eq('message_id', msgId)
      .eq('user_id',    userId);
    if (error) console.warn('[toggleFavMsgDB] delete:', error.message);
  }
}

// ── PIN DE MENSAGEM ────────────────────────────────

async function pinMsgDB(msgId, pinned) {
  const { error } = await getSb()
    .from('messages')
    .update({ is_pinned: pinned })
    .eq('id', msgId);
  if (error) console.warn('[pinMsgDB]', error.message);
}

// ── DELETE SUAVE ──────────────────────────────────

/**
 * "deleted_for_all" usa a coluna existente no schema.
 * "deleted_for_me" (individual) salva localmente via IndexedDB
 * pois o schema não tem tabela message_deletes.
 */
async function softDeleteMsg(msgId, userId, forAll) {
  if (forAll) {
    const { error } = await getSb()
      .from('messages')
      .update({ deleted_for_all: true, content: null })
      .eq('id', msgId);
    if (error) throw error;
  } else {
    // Persiste apenas localmente (schema não tem message_deletes)
    const key = `deleted_for_me:${userId}`;
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (!existing.includes(msgId)) {
        existing.push(msgId);
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch (e) {
      console.warn('[softDeleteMsg] localStorage:', e);
    }
  }
}

// Verifica se uma mensagem foi deletada pra mim localmente
function isMsgDeletedForMe(msgId, userId) {
  try {
    const list = JSON.parse(localStorage.getItem(`deleted_for_me:${userId}`) || '[]');
    return list.includes(msgId);
  } catch {
    return false;
  }
}

// ── LIMPAR CONVERSA ────────────────────────────────

/**
 * "Limpar conversa" salva localmente o timestamp do clear
 * (schema não tem conv_clears — equivalente seria filtrar mensagens mais antigas).
 */
async function clearConvDB(convId, userId) {
  try {
    const key  = `cleared_at:${userId}:${convId}`;
    const data = { clearedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[clearConvDB]', e);
  }
}

function getConvClearedAt(convId, userId) {
  try {
    const raw = localStorage.getItem(`cleared_at:${userId}:${convId}`);
    return raw ? JSON.parse(raw).clearedAt : null;
  } catch {
    return null;
  }
}

// ── PREFERÊNCIAS DE USUÁRIO ────────────────────────

/**
 * Salva preferências simples em localStorage
 * (schema não tem user_prefs separado; preferências já estão em profiles).
 * Para preferências de perfil (tema, etc.) use upsertProfile().
 */
async function updateUserPref(key, value) {
  try {
    const profile = getProfile();
    if (!profile?.id) return;

    // Preferências que existem na tabela profiles:
    const profileFields = ['theme', 'bubble_color', 'wallpaper', 'show_last_seen', 'show_online', 'read_receipts'];
    if (profileFields.includes(key)) {
      const { error } = await getSb()
        .from('profiles')
        .update({ [key]: value })
        .eq('id', profile.id);
      if (error) console.warn('[updateUserPref] profile:', error.message);
    } else {
      // Fallback: localStorage para prefs extras
      localStorage.setItem(`pref:${profile.id}:${key}`, String(value));
    }
  } catch (e) {
    console.warn('[updateUserPref]', e);
  }
}

// ── REAÇÕES ───────────────────────────────────────

async function toggleReactionDB(msgId, userId, emoji) {
  const sb = getSb();

  // Verifica se já existe essa reação deste usuário
  const { data: existing } = await sb
    .from('message_reactions')
    .select('id')
    .eq('message_id', msgId)
    .eq('user_id',    userId)
    .eq('emoji',      emoji)
    .limit(1);

  if (existing?.length) {
    // Remove
    await sb.from('message_reactions').delete().eq('id', existing[0].id);
  } else {
    // Adiciona
    const { error } = await sb
      .from('message_reactions')
      .insert({ message_id: msgId, user_id: userId, emoji });
    if (error) console.warn('[toggleReactionDB]', error.message);
  }
}

// ── PROFILE DELETION ──────────────────────────────

async function softDeleteProfileDB(userId) {
  const { error } = await getSb()
    .from('profiles')
    .update({ display_name: 'Usuário deletado', avatar_url: null })
    .eq('id', userId);
  if (error) throw error;
}
