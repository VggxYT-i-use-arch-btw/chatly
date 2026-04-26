// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — _sb-client.js                    ║
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

// ── PROFILE ───────────────────────────────────────
async function upsertProfile(profile) {
  const { error } = await _sb.from('profiles').upsert({
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

async function fetchUserByUsername(username) {
  const { data, error } = await _sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, description')
    .ilike('username', username)
    .limit(10);
  if (error) throw error;
  return data;
}

async function fetchUserById(id) {
  const { data, error } = await _sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, description')
    .eq('id', id)
    .single();
  if (error) return null;
  await dbPut('users', data); // cache local
  return data;
}

// ── CONVERSATIONS ─────────────────────────────────
async function fetchConversations(myId) {
  const { data, error } = await _sb
    .from('conversations')
    .select('*')
    .contains('participants', [myId])
    .order('last_message_at', { ascending: false });
  if (error) throw error;
  // cache local
  for (const c of data) await dbPut('conversations', c);
  return data;
}

async function findOrCreateConversation(myId, otherId) {
  // Verifica se já existe
  const { data: existing } = await _sb
    .from('conversations')
    .select('*')
    .contains('participants', [myId, otherId])
    .limit(1);

  if (existing?.length) return existing[0];

  // Cria nova
  const { data, error } = await _sb
    .from('conversations')
    .insert({
      participants:    [myId, otherId],
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateConvLastMessage(convId) {
  await _sb
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', convId);
}

// ── MESSAGES ──────────────────────────────────────
async function fetchMessages(convId, limit = 60) {
  const { data, error } = await _sb
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  for (const m of data) await dbPut('messages', m);
  return data;
}

async function sendMessage({ convId, senderId, content, type = 'text', mediaUrl = null, mediaName = null, mediaSize = null, audioPeaks = null, replyToId = null }) {
  const { data, error } = await _sb
    .from('messages')
    .insert({
      conversation_id: convId,
      sender_id:       senderId,
      content:         content  || null,
      type,
      media_url:       mediaUrl || null,
      media_name:      mediaName || null,
      media_size:      mediaSize || null,
      audio_peaks:     audioPeaks || null,
      reply_to_id:     replyToId || null,
      created_at:      new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  await dbPut('messages', data);
  await updateConvLastMessage(convId);
  return data;
}

// ── REALTIME ──────────────────────────────────────
let _channel = null;

function subscribeToConversation(convId, onMessage) {
  if (_channel) {
    _sb.removeChannel(_channel);
    _channel = null;
  }

  _channel = _sb
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
    .subscribe();

  return _channel;
}

function unsubscribeAll() {
  if (_channel) {
    _sb.removeChannel(_channel);
    _channel = null;
  }
}

// ── USERNAME AVAILABILITY ─────────────────────────
async function isUsernameAvailable(username, myId = null) {
  let q = _sb
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase());
  if (myId) q = q.neq('id', myId);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return data.length === 0;
}

// ── GRUPOS ────────────────────────────────────────
async function createGroupConversation({ name, description, avatar_url, created_by, participants }) {
  const { data, error } = await _sb
    .from('conversations')
    .insert({
      is_group:        true,
      group_name:      name,
      group_desc:      description,
      group_avatar:    avatar_url,
      created_by,
      participants,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── BLOCK / ARCHIVE / FAVORITE / PIN ──────────────
async function blockUserDB(myId, targetId, block) {
  const { error } = await _sb.from('blocked_users').upsert(
    { user_id: myId, blocked_id: targetId, blocked: block },
    { onConflict: 'user_id,blocked_id' }
  );
  if (error) console.warn('[blockUserDB]', error);
}

async function toggleArchiveDB(convId, userId, archived) {
  const { error } = await _sb.from('conv_settings').upsert(
    { conv_id: convId, user_id: userId, archived },
    { onConflict: 'conv_id,user_id' }
  );
  if (error) console.warn('[toggleArchiveDB]', error);
}

async function toggleFavMsgDB(msgId, userId, fav) {
  if (fav) {
    await _sb.from('favorites').upsert({ msg_id: msgId, user_id: userId }, { onConflict: 'msg_id,user_id' });
  } else {
    await _sb.from('favorites').delete().eq('msg_id', msgId).eq('user_id', userId);
  }
}

async function pinMsgDB(msgId, pinned) {
  const { error } = await _sb.from('messages').update({ is_pinned: pinned }).eq('id', msgId);
  if (error) console.warn('[pinMsgDB]', error);
}

async function softDeleteMsg(msgId, userId, forAll) {
  if (forAll) {
    await _sb.from('messages').update({ deleted_for_all: true, content: null }).eq('id', msgId);
  } else {
    await _sb.from('message_deletes').upsert({ msg_id: msgId, user_id: userId }, { onConflict: 'msg_id,user_id' });
  }
}

async function clearConvDB(convId, userId) {
  await _sb.from('conv_clears').upsert(
    { conv_id: convId, user_id: userId, cleared_at: new Date().toISOString() },
    { onConflict: 'conv_id,user_id' }
  );
}

async function softDeleteProfileDB(userId) {
  await _sb.from('profiles').update({ deleted: true, display_name: 'Usuário deletado', avatar_url: null }).eq('id', userId);
}

async function updateUserPref(key, value) {
  const profile = getProfile();
  if (!profile?.id) return;
  const { error } = await _sb.from('user_prefs').upsert(
    { user_id: profile.id, key, value: String(value) },
    { onConflict: 'user_id,key' }
  );
  if (error) console.warn('[updateUserPref]', error);
}
