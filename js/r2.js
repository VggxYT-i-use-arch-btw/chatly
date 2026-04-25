// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — r2.js                                 ║
// ║  Upload para Cloudflare R2 via Presigned URL    ║
// ╚══════════════════════════════════════════════════╝


/**
 * Pede ao Worker uma presigned URL para upload direto no R2.
 * O Worker gera a URL assinada com suas credenciais (sem expor).
 */
async function getPresignedUrl(filename, contentType) {
  const resp = await fetch(`${CONFIG.R2_WORKER_URL}/presign`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ filename, contentType }),
  });
  if (!resp.ok) throw new Error(`Worker erro ${resp.status}`);
  const { url, key } = await resp.json();
  return { url, key };
}

/**
 * Faz upload de um File/Blob para o R2.
 * @param {File|Blob} file
 * @param {string} folder - 'images' | 'videos' | 'audios' | 'files'
 * @param {function} onProgress - callback(0..100)
 * @returns {string} URL pública do arquivo
 */
async function uploadToR2(file, folder = 'files', onProgress = null) {
  const maxBytes = CONFIG.MAX_FILE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Arquivo muito grande (max ${CONFIG.MAX_FILE_MB} MB)`);
  }

  const ext      = getExtension(file);
  const filename = `${folder}/${Date.now()}_${randomId()}.${ext}`;
  const ctype    = file.type || 'application/octet-stream';

  // Pega presigned URL do Worker
  const { url: presignedUrl, key } = await getPresignedUrl(filename, ctype);

  // Upload direto com XMLHttpRequest (para progresso)
  await uploadWithProgress(presignedUrl, file, ctype, onProgress);

  // Retorna URL pública
  return `${CONFIG.R2_PUBLIC_URL}/${key || filename}`;
}

// ── HELPERS ───────────────────────────────────────
function uploadWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = ({ loaded, total }) => {
      if (onProgress && total > 0) onProgress(Math.round((loaded / total) * 100));
    };

    xhr.onload  = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload falhou: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Erro de rede no upload'));
    xhr.send(file);
  });
}

function getExtension(file) {
  if (file.name) {
    const parts = file.name.split('.');
    if (parts.length > 1) return parts.pop().toLowerCase();
  }
  // fallback pelo MIME
  const mimeMap = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  };
  return mimeMap[file.type] || 'bin';
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// Detecta tipo de mídia pelo MIME
function detectMediaType(file) {
  if (file.type.startsWith('image/'))  return 'image';
  if (file.type.startsWith('video/'))  return 'video';
  if (file.type.startsWith('audio/'))  return 'audio';
  return 'file';
}

function formatFileSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
