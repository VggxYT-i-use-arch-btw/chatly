// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — CONFIG                                 ║
// ║  Preencha com suas credenciais antes de usar     ║
// ╚══════════════════════════════════════════════════╝

var CONFIG = {
  // ── SUPABASE ──────────────────────────────────────
  // Crie em https://supabase.com → New Project
  SUPABASE_URL:      'https://tsprfsrfdjdzqhxsdftr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable__MaECX0abEks7Ubtv4FzHg_4mFWNKY3',
  
  // ── APP ───────────────────────────────────────────
  USERNAME_COOLDOWN_MS: 24 * 60 * 60 * 1000,  // 24 horas em ms
  MAX_FILE_MB:          100,                    // Limite de upload em MB
  AUDIO_MAX_SECS:       600,                    // Máx 10 min de áudio
};
