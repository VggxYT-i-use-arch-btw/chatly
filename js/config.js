// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — CONFIG                                 ║
// ║  Preencha com suas credenciais antes de usar     ║
// ╚══════════════════════════════════════════════════╝

var CONFIG = {
  // ── SUPABASE ──────────────────────────────────────
  // Crie em https://supabase.com → New Project
  SUPABASE_URL:      'https://SEU_PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'SUA_ANON_KEY_AQUI',

  // ── CLOUDFLARE R2 ─────────────────────────────────
  // Deploy o worker em /worker/r2-worker.js primeiro
  // O worker retorna presigned URLs para upload direto no R2
  R2_WORKER_URL:  'https://seu-worker.sua-conta.workers.dev',
  R2_PUBLIC_URL:  'https://pub-XXXXXXXX.r2.dev',   // URL pública do bucket

  // ── APP ───────────────────────────────────────────
  USERNAME_COOLDOWN_MS: 24 * 60 * 60 * 1000,  // 24 horas em ms
  MAX_FILE_MB:          100,                    // Limite de upload em MB
  AUDIO_MAX_SECS:       600,                    // Máx 10 min de áudio
};
