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

async function sendMessage({ convId, senderId, content, type = 'text', mediaUrl = null, mediaName = null, mediaSize = null, audioPeaks = null }) {
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
