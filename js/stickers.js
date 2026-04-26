// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — stickers.js                           ║
// ║  Criador de figurinhas com crop, favoritos      ║
// ║  e envio como mensagem                          ║
// ╚══════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let _stickers       = [];    // { id, data, name, shape, fav, usedAt }
let _cropImg        = null;  // Image object
let _cropShape      = 'square'; // 'square' | 'circle'
let _cropX          = 0;
let _cropY          = 0;
let _cropSize       = 200;
let _cropDragging   = false;
let _cropStartX     = 0;
let _cropStartY     = 0;
let _stickerPickerOpen = false;

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
async function initStickers() {
  await loadStickers();

  // Botão de figurinhas no input
  const btn = document.getElementById('sticker-btn');
  if (btn) btn.onclick = toggleStickerPicker;

  // Botão de criar figurinha
  document.getElementById('create-sticker-btn')?.addEventListener('click', () => {
    document.getElementById('sticker-file-input')?.click();
  });

  // Input de imagem para nova figurinha
  const fileInput = document.getElementById('sticker-file-input');
  if (fileInput) fileInput.onchange = handleStickerFileSelect;

  // Botões de crop
  document.getElementById('sticker-crop-circle')?.addEventListener('click', () => setCropShape('circle'));
  document.getElementById('sticker-crop-square')?.addEventListener('click', () => setCropShape('square'));
  document.getElementById('cancel-sticker-crop')?.addEventListener('click', closeCropModal);
  document.getElementById('confirm-sticker-crop')?.addEventListener('click', confirmCrop);

  // Botão de imagens (ao lado do campo de mensagem)
  const imageInput = document.getElementById('image-input');
  if (imageInput) {
    imageInput.onchange = (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file || !_activeConvId) return;
      // Simula o evento que handleFileSelect espera
      const fakeEvt = { target: { files: [file], value: '' } };
      handleFileSelect(fakeEvt);
    };
  }

  // Fecha picker ao clicar fora
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('sticker-picker');
    if (!picker?.contains(e.target) && e.target.id !== 'sticker-btn') {
      picker?.classList.add('hidden');
      _stickerPickerOpen = false;
    }
  });

  renderStickerGrid();
}

// ══════════════════════════════════════════════════
//  PICKER
// ══════════════════════════════════════════════════
function toggleStickerPicker() {
  const picker = document.getElementById('sticker-picker');
  if (!picker) return;
  _stickerPickerOpen = !_stickerPickerOpen;
  picker.classList.toggle('hidden', !_stickerPickerOpen);
  if (_stickerPickerOpen) renderStickerGrid();
}

function renderStickerGrid() {
  const grid = document.getElementById('sticker-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Primeiro: favoritos, depois: mais recentes
  const sorted = [..._stickers].sort((a, b) => {
    if (a.fav && !b.fav) return -1;
    if (!a.fav && b.fav) return 1;
    return (b.usedAt || 0) - (a.usedAt || 0);
  });

  if (!sorted.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#8696a0;padding:20px;font-size:13px">Clique em + para criar figurinhas</div>';
    return;
  }

  for (const sticker of sorted) {
    const item = document.createElement('div');
    item.className = 'sticker-item' + (sticker.fav ? ' sticker-fav' : '');
    item.title = sticker.name || 'Figurinha';

    const img = document.createElement('img');
    img.src = sticker.data;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';

    // Click = envia
    item.onclick = () => sendSticker(sticker);

    // Long press = menu de opções
    let pressTimer;
    item.addEventListener('pointerdown', (e) => {
      pressTimer = setTimeout(() => { e.preventDefault(); showStickerOptions(sticker, item); }, 500);
    });
    item.addEventListener('pointerup',    () => clearTimeout(pressTimer));
    item.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    item.addEventListener('contextmenu',  (e) => { e.preventDefault(); showStickerOptions(sticker, item); });

    item.appendChild(img);
    grid.appendChild(item);
  }
}

// ══════════════════════════════════════════════════
//  ENVIAR STICKER
// ══════════════════════════════════════════════════
async function sendSticker(sticker) {
  if (!_activeConvId) { toast('Selecione uma conversa', 'error'); return; }

  const picker = document.getElementById('sticker-picker');
  picker?.classList.add('hidden');
  _stickerPickerOpen = false;

  // Atualiza "recentemente usado"
  sticker.usedAt = Date.now();
  await saveStickers();

  const profile = getProfile();

  // Converte data URL para File e faz upload
  try {
    const file = await dataURLtoStickerFile(sticker.data, sticker.id);

    if (_supabase) {
      const url = await uploadToR2(file, 'stickers');
      await sendMessage({
        convId:    _activeConvId,
        senderId:  profile.id,
        content:   null,
        type:      'image',
        mediaUrl:  url,
        mediaName: 'sticker.webp',
        mediaSize: file.size,
      });
    } else {
      // Offline: usa data URL diretamente
      const msg = {
        id:              'local_' + Date.now(),
        conversation_id: _activeConvId,
        sender_id:       profile.id,
        type:            'image',
        media_url:       sticker.data,
        media_name:      'sticker.webp',
        created_at:      new Date().toISOString(),
        _isSticker:      true,
      };
      const el = createMessageEl(msg, profile.id, openMediaModal);
      document.getElementById('messages-inner')?.appendChild(el);
      scrollToBottom();
    }
  } catch (err) {
    toast('Erro ao enviar figurinha: ' + err.message, 'error');
  }
}

async function dataURLtoStickerFile(dataUrl, id) {
  const res  = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], `sticker_${id}.webp`, { type: 'image/webp' });
}

// ══════════════════════════════════════════════════
//  OPÇÕES DO STICKER (long press)
// ══════════════════════════════════════════════════
function showStickerOptions(sticker, itemEl) {
  // Remove menu anterior se houver
  document.querySelector('.sticker-options-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'sticker-options-menu context-menu';
  menu.style.cssText = 'position:fixed;z-index:9999;';

  const opts = [
    { label: sticker.fav ? '★ Remover dos favoritos' : '☆ Adicionar aos favoritos', fn: () => toggleStickerFav(sticker) },
    { label: '🕒 Adicionar aos recentes', fn: () => { sticker.usedAt = Date.now(); saveStickers(); toast('Adicionado aos recentes'); } },
    { label: '🗑 Remover figurinha', danger: true, fn: () => deleteSticker(sticker.id) },
  ];

  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (opt.danger ? ' danger' : '');
    btn.textContent = opt.label;
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.remove();
      opt.fn();
    };
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  const rect = itemEl.getBoundingClientRect();
  const mw   = 200, mh = opts.length * 44;
  menu.style.left = Math.min(rect.left, window.innerWidth  - mw - 8) + 'px';
  menu.style.top  = Math.min(rect.bottom, window.innerHeight - mh - 8) + 'px';

  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

async function toggleStickerFav(sticker) {
  sticker.fav = !sticker.fav;
  await saveStickers();
  renderStickerGrid();
  toast(sticker.fav ? 'Adicionado aos favoritos ★' : 'Removido dos favoritos');
}

async function deleteSticker(id) {
  if (!confirm('Remover esta figurinha?')) return;
  _stickers = _stickers.filter(s => s.id !== id);
  await saveStickers();
  renderStickerGrid();
  toast('Figurinha removida');
}

// ══════════════════════════════════════════════════
//  CRIADOR DE STICKER (crop)
// ══════════════════════════════════════════════════
async function handleStickerFileSelect(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    toast('Selecione uma imagem', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    _cropImg = new Image();
    _cropImg.onload = () => {
      openCropModal();
      initCropCanvas();
    };
    _cropImg.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function openCropModal() {
  document.getElementById('sticker-crop-modal').classList.remove('hidden');
  _cropShape = 'square';
  _cropX = 0;
  _cropY = 0;
  _cropSize = 200;
  updateShapeBtns();
}

function closeCropModal() {
  document.getElementById('sticker-crop-modal').classList.add('hidden');
  _cropImg = null;
}

function setCropShape(shape) {
  _cropShape = shape;
  updateShapeBtns();
  drawCropCanvas();
}

function updateShapeBtns() {
  document.getElementById('sticker-crop-circle')?.classList.toggle('active', _cropShape === 'circle');
  document.getElementById('sticker-crop-square')?.classList.toggle('active', _cropShape === 'square');
}

function initCropCanvas() {
  const canvas = document.getElementById('sticker-crop-canvas');
  if (!canvas || !_cropImg) return;

  // Ajusta tamanho do canvas ao container
  const container = canvas.parentElement;
  const maxW = container.clientWidth  || 320;
  const maxH = 300;

  const ratio = Math.min(maxW / _cropImg.width, maxH / _cropImg.height, 1);
  canvas.width  = Math.round(_cropImg.width  * ratio);
  canvas.height = Math.round(_cropImg.height * ratio);

  _cropSize = Math.min(canvas.width, canvas.height) * 0.6;
  _cropX = (canvas.width  - _cropSize) / 2;
  _cropY = (canvas.height - _cropSize) / 2;

  drawCropCanvas();
  attachCropDrag(canvas);
}

function drawCropCanvas() {
  const canvas = document.getElementById('sticker-crop-canvas');
  if (!canvas || !_cropImg) return;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Imagem de fundo (escura)
  ctx.globalAlpha = 0.4;
  ctx.drawImage(_cropImg, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  // Região de crop
  ctx.save();
  ctx.beginPath();
  if (_cropShape === 'circle') {
    const cx = _cropX + _cropSize / 2;
    const cy = _cropY + _cropSize / 2;
    ctx.arc(cx, cy, _cropSize / 2, 0, Math.PI * 2);
  } else {
    ctx.rect(_cropX, _cropY, _cropSize, _cropSize);
  }
  ctx.clip();
  ctx.drawImage(_cropImg, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Borda do crop
  ctx.strokeStyle = '#00a884';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  if (_cropShape === 'circle') {
    const cx = _cropX + _cropSize / 2;
    const cy = _cropY + _cropSize / 2;
    ctx.arc(cx, cy, _cropSize / 2, 0, Math.PI * 2);
  } else {
    ctx.rect(_cropX, _cropY, _cropSize, _cropSize);
  }
  ctx.stroke();

  // Handles de resize nos cantos
  const handles = [
    [_cropX, _cropY], [_cropX + _cropSize, _cropY],
    [_cropX, _cropY + _cropSize], [_cropX + _cropSize, _cropY + _cropSize]
  ];
  ctx.fillStyle = '#00a884';
  handles.forEach(([hx, hy]) => {
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function attachCropDrag(canvas) {
  let mode = null; // 'move' | 'resize'

  canvas.onmousedown = canvas.ontouchstart = (e) => {
    const { x, y } = getCanvasPos(e, canvas);
    _cropDragging = true;

    // Verifica se clicou num canto (resize)
    const corners = [
      [_cropX, _cropY], [_cropX + _cropSize, _cropY],
      [_cropX, _cropY + _cropSize], [_cropX + _cropSize, _cropY + _cropSize]
    ];
    const onCorner = corners.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 12);
    mode = onCorner ? 'resize' : 'move';

    _cropStartX = x;
    _cropStartY = y;
    e.preventDefault();
  };

  window.onmousemove = window.ontouchmove = (e) => {
    if (!_cropDragging) return;
    const { x, y } = getCanvasPos(e, canvas);
    const dx = x - _cropStartX;
    const dy = y - _cropStartY;
    _cropStartX = x;
    _cropStartY = y;

    if (mode === 'move') {
      _cropX = Math.max(0, Math.min(canvas.width  - _cropSize, _cropX + dx));
      _cropY = Math.max(0, Math.min(canvas.height - _cropSize, _cropY + dy));
    } else {
      const delta = Math.max(dx, dy);
      const newSize = Math.min(Math.max(60, _cropSize + delta), Math.min(canvas.width, canvas.height));
      _cropX += (_cropSize - newSize) / 2;
      _cropY += (_cropSize - newSize) / 2;
      _cropSize = newSize;
      _cropX = Math.max(0, Math.min(canvas.width  - _cropSize, _cropX));
      _cropY = Math.max(0, Math.min(canvas.height - _cropSize, _cropY));
    }

    drawCropCanvas();
    e.preventDefault();
  };

  window.onmouseup = window.ontouchend = () => { _cropDragging = false; };
}

function getCanvasPos(e, canvas) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const src    = e.touches?.[0] || e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top)  * scaleY,
  };
}

async function confirmCrop() {
  if (!_cropImg) return;

  const canvas = document.getElementById('sticker-crop-canvas');
  const srcRatioX = _cropImg.width  / canvas.width;
  const srcRatioY = _cropImg.height / canvas.height;

  // Cria canvas de saída (256x256 WebP)
  const out = document.createElement('canvas');
  out.width = out.height = 256;
  const ctx = out.getContext('2d');

  if (_cropShape === 'circle') {
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.clip();
  }

  ctx.drawImage(
    _cropImg,
    _cropX * srcRatioX, _cropY * srcRatioY,
    _cropSize * srcRatioX, _cropSize * srcRatioY,
    0, 0, 256, 256
  );

  const dataUrl = out.toDataURL('image/webp', 0.9);
  const name    = prompt('Nome da figurinha (opcional):', '') || 'Figurinha';

  const newSticker = {
    id:     'stk_' + Date.now(),
    data:   dataUrl,
    name,
    shape:  _cropShape,
    fav:    false,
    usedAt: 0,
    createdAt: Date.now(),
  };

  _stickers.unshift(newSticker);
  await saveStickers();
  renderStickerGrid();
  closeCropModal();
  toast(`Figurinha "${name}" criada! 🎉`, 'success');

  // Abre o picker
  document.getElementById('sticker-picker')?.classList.remove('hidden');
  _stickerPickerOpen = true;
}

// ══════════════════════════════════════════════════
//  PERSISTÊNCIA (IndexedDB)
// ══════════════════════════════════════════════════
async function loadStickers() {
  try {
    const db = await openDB();
    const stickers = await new Promise((res, rej) => {
      const tx = db.transaction('stickers', 'readonly');
      const req = tx.objectStore('stickers').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = () => rej(req.error);
    });
    _stickers = stickers;
  } catch {
    _stickers = [];
  }
}

async function saveStickers() {
  try {
    const db = await openDB();
    const tx = db.transaction('stickers', 'readwrite');
    const store = tx.objectStore('stickers');
    store.clear();
    for (const s of _stickers) store.put(s);
  } catch {}
}
