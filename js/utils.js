// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — utils.js                              ║
// ║  Utilitários compartilhados — carrega primeiro  ║
// ╚══════════════════════════════════════════════════╝

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escHtml(str) {
  return (str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function toast(msg, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function previewText(msg) {
  const icons = { image: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', file: '📎 Arquivo' };
  return icons[msg.type] || (msg.content || '').slice(0, 50);
}

function fileEmoji(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
                zip: '🗜', rar: '🗜', mp3: '🎵', wav: '🎵' };
  return map[ext] || '📎';
}

function formatMsgTime(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 86400 && d.getDate() === now.getDate())
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400)
    return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatDateDivider(iso) {
  const d   = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1 && d.getDate() === now.getDate()) return 'Hoje';
  if (diff < 2) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function groupMessagesByDate(messages) {
  const groups = [];
  let lastDate = null;
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) {
      groups.push({ type: 'divider', date: msg.created_at });
      lastDate = d;
    }
    groups.push({ type: 'message', data: msg });
  }
  return groups;
}
