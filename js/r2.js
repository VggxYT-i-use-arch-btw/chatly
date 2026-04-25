// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — r2.js                                 ║
// ║  Upload via Cloudinary (unsigned preset)        ║
// ╚══════════════════════════════════════════════════╝

const CLOUD_NAME   = 'dmtgq0yxw';
const UPLOAD_PRESET = 'chatly_media';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

/**
 * Faz upload de um File/Blob para o Cloudinary.
 *
 * @param {File|Blob} file
 * @param {string} folder - 'images' | 'videos' | 'audios' | 'files' | 'avatars'
 * @param {function} onProgress - callback(0..100)
 * @returns {Promise<string>} URL pública do arquivo
 */
async function uploadToR2(file, folder = 'files', onProgress = null) {
  const maxBytes = CONFIG.MAX_FILE_MB * 1024 * 1024;

  if (file.size > maxBytes)
    throw new Error(`Arquivo muito grande (máx ${CONFIG.MAX_FILE_MB} MB)`);
  if (file.size === 0)
    throw new Error('Arquivo vazio');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  // Progresso via XMLHttpRequest (único jeito de ter upload progress real)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      onProgress(0);
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 95));
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.secure_url) throw new Error('Cloudinary não retornou URL');
          if (onProgress) onProgress(100);
          resolve(data.secure_url);
        } catch (e) {
          reject(new Error('Resposta inválida do Cloudinary'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error?.message || `Upload falhou (${xhr.status})`));
        } catch {
          reject(new Error(`Upload falhou (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Erro de rede no upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelado')));

    xhr.open('POST', CLOUDINARY_URL);
    xhr.send(formData);
  });
}

/** Detecta categoria de mídia pelo MIME type */
function detectMediaType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Formata tamanho de arquivo human-readable */
function formatFileSize(bytes) {
  if (!bytes)            return '';
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
