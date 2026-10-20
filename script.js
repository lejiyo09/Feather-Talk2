import * as store from './js/store.js';
import { Renderer } from './js/renderer.js';
import { Motion, MicInput } from './js/motion.js';
import { createDefaultLayers, getDefaultImage } from './js/default-character.js';

const $ = (sel) => document.querySelector(sel);
const EXPR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_SETTINGS = {
  faceX: 50, faceY: 40, faceSize: 25,
  yaw: 100, pitch: 100, roll: 100, elastic: 50,
  breath: 50,
  mouthAnim: true, blinkSqueeze: false,
  bandTop: 39, bandBottom: 52,
  headMode: 'mouse', expression: '1', emphasize: false, helpOpen: true
};

const WHEN_LABEL = { always: '항상', eyesOpen: '눈 뜰 때', eyesClosed: '눈 감을 때', mouthClosed: '입 다물 때', mouthOpen: '입 열 때' };

// '레이어 추가'에서 고르는 부위와 기본값 (원본 메뉴 항목은 확인 불가 — 추정)
const PARTS = [
  { part: 'body', label: '몸', preset: { attach: 'body' } },
  { part: 'face', label: '얼굴', preset: { bulge: 50 } },
  { part: 'hair', label: '앞머리', preset: { depth: 35, physics: true, anchor: 35 } },
  { part: 'hair', label: '뒷머리', preset: { depth: -40, physics: true, anchor: 45 } },
  { part: 'eyeWhite', label: '흰자', preset: { when: 'eyesOpen', depth: 20 } },
  { part: 'pupil', label: '눈동자', preset: { when: 'eyesOpen', depth: 34, clip: true } },
  { part: 'eye', label: '뜬 눈', preset: { when: 'eyesOpen', depth: 22 } },
  { part: 'eyeClosed', label: '감은 눈', preset: { when: 'eyesClosed', depth: 22 } },
  { part: 'mouthClosed', label: '다문 입', preset: { when: 'mouthClosed', depth: 16 } },
  { part: 'mouthOpen', label: '벌린 입', preset: { when: 'mouthOpen', depth: 16 } },
  { part: 'deco', label: '장식', preset: { depth: 10, physics: true, anchor: 35 } }
];

function makeLayer(p = {}) {
  return {
    id: uid('L'),
    name: '새 레이어',
    part: 'deco',
    image: null,
    visible: true,
    when: 'always',
    attach: 'head',
    expressions: [...EXPR_KEYS],
    depth: 0,
    bulge: 0,
    physics: false,
    anchor: 35,
    clip: false,
    bounce: false,
    ...p
  };
}

let state = {
  settings: { ...DEFAULT_SETTINGS },
  layers: [],
  selectedId: null
};

const runtime = new Map(); // 레이어 id → { status, w, h, bbox, thumb, error }
const motion = new Motion();
let renderer = null;
let mic = null;
let live = false;
let storageOk = true;

// ───────── 알림 · 확인 창 ─────────
let toastTimer = 0;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2600);
}

function confirmBox(text, okLabel = '확인') {
  const dlg = $('#confirm');
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}

// ───────── 저장 ─────────
let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

async function saveNow() {
  const el = $('#save-state');
  if (!storageOk) return;
  try {
    await store.saveState(JSON.parse(JSON.stringify(state)));
    el.textContent = '(저장됨)';
    el.classList.remove('error');
  } catch (err) {
    el.textContent = '(저장 실패: 이 브라우저에 저장할 수 없어요)';
    el.classList.add('error');
    console.error(err);
  }
}

async function gcImages() {
  if (!storageOk) return;
  try {
    const used = new Set(state.layers.filter((l) => l.image?.type === 'blob').map((l) => l.image.id));
    const ids = await store.listImageIds();
    await store.deleteImages(ids.filter((id) => !used.has(id)));
  } catch (err) {
    console.warn('image cleanup failed', err);
  }
}

// ───────── 이미지 ─────────
function loadUrlImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했어요. 주소가 맞는지, 그 사이트가 다른 사이트에서 쓰는 것(CORS)을 허용하는지 확인해 주세요. 안 되면 파일로 받아 직접 올려 주세요.'));
    img.src = url;
  });
}

function analyze(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (data[(y * N + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const bbox = x1 < 0 ? [0, 0, 1, 1] : [x0 / N, y0 / N, (x1 + 1) / N, (y1 + 1) / N];
  return { w, h, bbox, thumb: c.toDataURL('image/png') };
}

async function loadLayerImage(layer) {
  const img = layer.image;
  renderer?.deleteTexture(layer.id);
  if (!img) {
    runtime.delete(layer.id);
    return;
  }
  const rt = { status: 'loading' };
  runtime.set(layer.id, rt);
  try {
    let source;
    if (img.type === 'default') {
      source = getDefaultImage(img.key);
      if (!source) throw new Error('기본 이미지를 찾을 수 없어요.');
    } else if (img.type === 'blob') {
      const blob = await store.getImage(img.id);
      if (!blob) throw new Error('저장된 이미지를 찾을 수 없어요.');
      source = await createImageBitmap(blob);
    } else if (img.type === 'url') {
      source = await loadUrlImage(img.url);
    }
    if (runtime.get(layer.id) !== rt) return;
    const info = analyze(source);
    if (renderer) renderer.setTexture(layer.id, source);
    Object.assign(rt, info, { status: 'ok' });
  } catch (err) {
    if (runtime.get(layer.id) !== rt) return;
    rt.status = 'error';
    rt.error = err.name === 'SecurityError'
      ? '이 주소의 이미지는 보안 정책(CORS) 때문에 쓸 수 없어요. 파일로 받아 직접 올려 주세요.'
      : err.message;
    renderer?.deleteTexture(layer.id);
  }
}

function sizeWarning(layer) {
  const rt = runtime.get(layer.id);
  if (!rt || rt.status !== 'ok') return '';
  if (rt.w !== rt.h) return `정사각형이 아니에요 (${rt.w}×${rt.h}). 모든 이미지는 같은 크기의 정사각형 PNG여야 해요.`;
  const other = state.layers.find((l) => l.id !== layer.id && runtime.get(l.id)?.status === 'ok');
  if (other) {
    const o = runtime.get(other.id);
    if (o.w !== rt.w || o.h !== rt.h) return `다른 레이어(${o.w}×${o.h})와 크기가 달라요 (${rt.w}×${rt.h}). 같은 크기로 맞춰 주세요.`;
  }
  return '';
}

async function setLayerFile(layer, file) {
  if (!file.type.startsWith('image/')) {
    toast('이미지 파일만 넣을 수 있어요.', true);
    return;
  }
  const blobId = uid('img');
  try {
    await store.putImage(blobId, file);
  } catch (err) {
    toast('이미지를 이 브라우저에 저장하지 못했어요. 저장 공간을 확인해 주세요.', true);
    return;
  }
  layer.image = { type: 'blob', id: blobId };
  await loadLayerImage(layer);
  if (file.type !== 'image/png') toast('PNG(투명 배경)를 권장해요.');
  afterImageChange(layer);
  gcImages();
}

async function setLayerUrl(layer, url) {
  url = url.trim();
  if (!url) return;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    showImageMsg('올바른 이미지 주소(https://...)를 넣어 주세요.', 'error');
    return;
  }
  showImageMsg('불러오는 중…');
  layer.image = { type: 'url', url };
  await loadLayerImage(layer);
  afterImageChange(layer);
  gcImages();
}

function afterImageChange(layer) {
  scheduleSave();
  renderList();
  if (layer.id === state.selectedId) renderEditor();
}

// ───────── 레이어 목록 ─────────
const listEl = $('#layer-list');

function svgIcon(id) {
  return `<svg class="ic"><use href="#${id}"/></svg>`;
}

function layerTags(layer) {
  const tags = [];
  const rt = runtime.get(layer.id);
  if (!layer.image) tags.push(['이미지 없음', '']);
  else if (rt?.status === 'error') tags.push(['불러오기 실패', 'phys']);
  if (layer.attach === 'body') tags.push(['몸', '']);
  if (layer.when !== 'always') tags.push([WHEN_LABEL[layer.when], 'muted']);
  if (layer.physics && layer.attach === 'head') tags.push([layer.part === 'hair' ? '머리카락' : '장식 물리', 'phys']);
  if (layer.clip) tags.push(['클리핑', 'muted']);
  if (layer.expressions.length !== EXPR_KEYS.length) {
    tags.push([layer.expressions.length ? `표정 ${layer.expressions.join('·')}` : '표정 없음', 'muted']);
  }
  return tags;
}

function renderList() {
  listEl.textContent = '';
  if (!state.layers.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = '레이어가 없어요. 아래 레이어 추가로 시작해 보세요.';
    listEl.append(li);
    $('#btn-dup').disabled = true;
    return;
  }
  $('#btn-dup').disabled = !state.selectedId;
  state.layers.forEach((layer, i) => {
    const li = document.createElement('li');
    li.className = 'layer-row';
    li.dataset.id = layer.id;
    li.classList.toggle('selected', layer.id === state.selectedId);
    li.classList.toggle('off', !layer.visible);
    li.setAttribute('aria-selected', String(layer.id === state.selectedId));
    const rt = runtime.get(layer.id);
    const thumb = rt?.thumb
      ? `<img class="layer-thumb" src="${rt.thumb}" alt="">`
      : '<span class="layer-thumb blank"></span>';
    li.innerHTML = `
      <span class="grip" title="끌어서 순서 변경" aria-hidden="true">${svgIcon('i-grip')}</span>
      ${thumb}
      <button type="button" class="layer-name link-btn" style="color:inherit;padding:0"></button>
      <span class="tags"></span>
      <span class="row-btns">
        <button type="button" class="icon-btn" data-act="vis" aria-label="${layer.visible ? '숨기기' : '보이기'}" aria-pressed="${layer.visible}">${svgIcon(layer.visible ? 'i-eye' : 'i-eye-off')}</button>
        <button type="button" class="icon-btn" data-act="up" aria-label="앞으로" ${i === 0 ? 'disabled' : ''}>${svgIcon('i-up')}</button>
        <button type="button" class="icon-btn" data-act="down" aria-label="뒤로" ${i === state.layers.length - 1 ? 'disabled' : ''}>${svgIcon('i-down')}</button>
        <button type="button" class="icon-btn" data-act="del" aria-label="삭제">${svgIcon('i-trash')}</button>
      </span>`;
    const nameBtn = li.querySelector('.layer-name');
    nameBtn.textContent = layer.name || '(이름 없음)';
    nameBtn.setAttribute('aria-label', `${layer.name} 레이어 선택`);
    const tagsEl = li.querySelector('.tags');
    for (const [text, cls] of layerTags(layer)) {
      const s = document.createElement('span');
      s.className = `tag ${cls}`;
      s.textContent = text;
      tagsEl.append(s);
    }
    listEl.append(li);
  });
}

function selectLayer(id) {
  state.selectedId = id;
  renderList();
  renderEditor();
  scheduleSave();
}

function moveLayer(from, to) {
  if (to < 0 || to >= state.layers.length || from === to) return;
  const [l] = state.layers.splice(from, 1);
  state.layers.splice(to, 0, l);
  renderList();
  scheduleSave();
}

async function deleteLayer(id) {
  const idx = state.layers.findIndex((l) => l.id === id);
  if (idx < 0) return;
  const layer = state.layers[idx];
  const ok = await confirmBox(`'${layer.name}' 레이어를 지울까요?`, '지우기');
  if (!ok) return;
  state.layers.splice(idx, 1);
  renderer?.deleteTexture(id);
  runtime.delete(id);
  motion.forget(id);
  if (state.selectedId === id) {
    state.selectedId = state.layers[Math.min(idx, state.layers.length - 1)]?.id ?? null;
  }
  renderList();
  renderEditor();
  scheduleSave();
  gcImages();
}

listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.layer-row');
  if (!row) return;
  const id = row.dataset.id;
  const idx = state.layers.findIndex((l) => l.id === id);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'vis') {
    state.layers[idx].visible = !state.layers[idx].visible;
    renderList();
    scheduleSave();
  } else if (act === 'up') moveLayer(idx, idx - 1);
  else if (act === 'down') moveLayer(idx, idx + 1);
  else if (act === 'del') deleteLayer(id);
  else if (id !== state.selectedId) selectLayer(id);
  if (act === 'up' || act === 'down') {
    listEl.querySelector(`[data-id="${id}"] [data-act="${act}"]:not(:disabled)`)?.focus();
  }
});

// 끌어서 순서 변경
listEl.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest('.grip');
  if (!grip) return;
  e.preventDefault();
  const row = grip.closest('.layer-row');
  const rows = [...listEl.querySelectorAll('.layer-row')];
  const from = rows.indexOf(row);
  const step = row.getBoundingClientRect().height + 6;
  const startY = e.clientY;
  const startScroll = listEl.scrollTop;
  let to = from;
  row.classList.add('dragging');
  grip.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const lr = listEl.getBoundingClientRect();
    if (ev.clientY < lr.top + 20) listEl.scrollTop -= 8;
    else if (ev.clientY > lr.bottom - 20) listEl.scrollTop += 8;
    const dy = ev.clientY - startY + (listEl.scrollTop - startScroll);
    row.style.transform = `translateY(${dy}px)`;
    to = clamp(from + Math.round(dy / step), 0, rows.length - 1);
    rows.forEach((r, i) => {
      if (i === from) return;
      let shift = 0;
      if (from < to && i > from && i <= to) shift = -step;
      if (from > to && i < from && i >= to) shift = step;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const onUp = () => {
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', onUp);
    grip.removeEventListener('pointercancel', onUp);
    rows.forEach((r) => { r.style.transform = ''; });
    row.classList.remove('dragging');
    if (to !== from) moveLayer(from, to);
  };
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onUp);
  grip.addEventListener('pointercancel', onUp);
});

// 레이어 추가 · 복제
const addBtn = $('#btn-add');
const addMenu = $('#add-menu');
for (const p of PARTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'menuitem');
  b.textContent = p.label;
  b.addEventListener('click', () => {
    closeAddMenu();
    const layer = makeLayer({ name: p.label, part: p.part, ...p.preset });
    const at = Math.max(0, state.layers.findIndex((l) => l.id === state.selectedId));
    state.layers.splice(at, 0, layer);
    selectLayer(layer.id);
    $('#layer-name').focus();
    $('#layer-name').select();
  });
  addMenu.append(b);
}
function openAddMenu() {
  addMenu.hidden = false;
  addBtn.setAttribute('aria-expanded', 'true');
  addMenu.querySelector('button').focus();
}
function closeAddMenu() {
  addMenu.hidden = true;
  addBtn.setAttribute('aria-expanded', 'false');
}
addBtn.addEventListener('click', () => (addMenu.hidden ? openAddMenu() : closeAddMenu()));
document.addEventListener('pointerdown', (e) => {
  if (!addMenu.hidden && !e.target.closest('.add-wrap')) closeAddMenu();
});
addMenu.addEventListener('keydown', (e) => {
  const items = [...addMenu.querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') {
    closeAddMenu();
    addBtn.focus();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    items[(i + 1) % items.length].focus();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    items[(i - 1 + items.length) % items.length].focus();
  }
});

$('#btn-dup').addEventListener('click', async () => {
  const idx = state.layers.findIndex((l) => l.id === state.selectedId);
  if (idx < 0) return;
  const src = state.layers[idx];
  const copy = makeLayer({ ...JSON.parse(JSON.stringify(src)), id: uid('L'), name: `${src.name} 복사` });
  state.layers.splice(idx, 0, copy);
  await loadLayerImage(copy);
  selectLayer(copy.id);
  toast(`'${src.name}' 레이어를 복제했어요.`);
});

// ───────── 레이어 편집 ─────────
const selected = () => state.layers.find((l) => l.id === state.selectedId) || null;

function showImageMsg(text, kind = '') {
  const el = $('#image-msg');
  el.textContent = text;
  el.className = `field-msg ${kind}`;
}

function setSeg(el, value) {
  for (const b of el.querySelectorAll('button')) {
    const on = b.dataset.value === value;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function updateSlider(box, value) {
  const input = box.querySelector('input');
  input.value = value;
  box.querySelector('output').textContent = `${value}${box.dataset.unit || ''}`;
}

function renderEditor() {
  const layer = selected();
  $('#editor-empty').hidden = !!layer;
  $('#editor-body').hidden = !layer;
  if (!layer) return;
  $('#layer-name').value = layer.name;

  const rt = runtime.get(layer.id);
  const dropImg = $('#drop-img');
  if (rt?.thumb) {
    dropImg.src = rt.thumb;
    dropImg.hidden = false;
    $('#drop-text').hidden = true;
  } else {
    dropImg.hidden = true;
    $('#drop-text').hidden = false;
  }
  $('#image-url').value = layer.image?.type === 'url' ? layer.image.url : '';
  if (!layer.image) showImageMsg('');
  else if (rt?.status === 'error') showImageMsg(rt.error, 'error');
  else if (rt?.status === 'loading') showImageMsg('불러오는 중…');
  else if (rt?.status === 'ok') {
    const warn = sizeWarning(layer);
    showImageMsg(warn || `${rt.w}×${rt.h} 이미지`, warn ? 'error' : '');
  }

  $('#layer-when').value = layer.when;
  setSeg($('#layer-attach'), layer.attach);

  const chips = $('#layer-expr');
  chips.textContent = '';
  for (const k of [...EXPR_KEYS, 'all']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = k;
    b.textContent = k === 'all' ? '전체' : k;
    const on = k === 'all' ? layer.expressions.length === EXPR_KEYS.length : layer.expressions.includes(k);
    b.setAttribute('aria-pressed', String(on));
    if (k !== 'all') b.setAttribute('aria-label', `표정 ${k}`);
    chips.append(b);
  }

  for (const box of document.querySelectorAll('.slider[data-layer]')) updateSlider(box, layer[box.dataset.layer]);
  updateBulgeIcon(layer.bulge);

  const phys = $('#layer-physics');
  phys.checked = layer.physics;
  phys.disabled = layer.attach === 'body';
  $('#layer-clip').checked = layer.clip;
  $('#layer-bounce').checked = layer.bounce;
}

function updateBulgeIcon(v) {
  $('#bulge-path').setAttribute('d', `M2 6 Q20 ${6 - (v / 100) * 9} 38 6`);
}

function editLayer(fn, { list = true, editor = false } = {}) {
  const layer = selected();
  if (!layer) return;
  fn(layer);
  if (list) renderList();
  if (editor) renderEditor();
  scheduleSave();
}

$('#layer-name').addEventListener('input', (e) => editLayer((l) => { l.name = e.target.value; }));
$('#layer-when').addEventListener('change', (e) => editLayer((l) => { l.when = e.target.value; }));
$('#layer-expr').addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.key;
  if (!k) return;
  editLayer((l) => {
    if (k === 'all') l.expressions = l.expressions.length === EXPR_KEYS.length ? [] : [...EXPR_KEYS];
    else if (l.expressions.includes(k)) l.expressions = l.expressions.filter((x) => x !== k);
    else l.expressions = EXPR_KEYS.filter((x) => x === k || l.expressions.includes(x));
  }, { editor: true });
});
$('#layer-physics').addEventListener('change', (e) => editLayer((l) => { l.physics = e.target.checked; }));
$('#layer-clip').addEventListener('change', (e) => editLayer((l) => { l.clip = e.target.checked; }));
$('#layer-bounce').addEventListener('change', (e) => editLayer((l) => { l.bounce = e.target.checked; }));

// 이미지 넣기
const drop = $('#drop');
const fileInput = $('#image-file');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
$('#btn-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  const layer = selected();
  if (f && layer) setLayerFile(layer, f);
  fileInput.value = '';
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const layer = selected();
  if (!layer) return;
  const f = e.dataTransfer.files[0];
  if (f) {
    setLayerFile(layer, f);
    return;
  }
  const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (url) setLayerUrl(layer, url);
});
$('#image-url').addEventListener('change', (e) => {
  const layer = selected();
  if (layer && e.target.value.trim()) setLayerUrl(layer, e.target.value);
});
$('#image-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
});
// 페이지 다른 곳에 파일을 떨어뜨려도 브라우저가 파일을 열지 않게
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ───────── 슬라이더 ─────────
for (const box of document.querySelectorAll('.slider')) {
  const input = box.querySelector('input');
  const label = box.querySelector('label');
  const id = `sl-${box.dataset.layer || box.dataset.setting}`;
  input.id = id;
  label.htmlFor = id;
  const apply = (v) => {
    v = Number(v);
    if (box.dataset.layer) {
      editLayer((l) => { l[box.dataset.layer] = v; }, { list: false });
      if (box.dataset.layer === 'bulge') updateBulgeIcon(v);
    } else {
      state.settings[box.dataset.setting] = v;
      scheduleSave();
    }
    updateSlider(box, v);
  };
  input.addEventListener('input', () => apply(input.value));
  input.addEventListener('dblclick', () => apply(box.dataset.default));
}

function renderSettings() {
  const s = state.settings;
  for (const box of document.querySelectorAll('.slider[data-setting]')) updateSlider(box, s[box.dataset.setting]);
  $('#set-mouthAnim').checked = s.mouthAnim;
  $('#set-blinkSqueeze').checked = s.blinkSqueeze;
  setSeg($('#head-mode'), s.headMode);
  setSeg($('#expr-pick'), s.expression);
  $('#emphasize').checked = s.emphasize;
  $('#help').hidden = !s.helpOpen;
  $('#btn-help').setAttribute('aria-expanded', String(s.helpOpen));
}

for (const key of ['mouthAnim', 'blinkSqueeze']) {
  $(`#set-${key}`).addEventListener('change', (e) => {
    state.settings[key] = e.target.checked;
    scheduleSave();
  });
}

// ───────── 미리보기 조작 ─────────
const exprPick = $('#expr-pick');
for (const k of EXPR_KEYS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.value = k;
  b.textContent = k;
  b.setAttribute('aria-label', `표정 ${k}`);
  exprPick.append(b);
}

function setExpression(k) {
  state.settings.expression = k;
  setSeg(exprPick, k);
  scheduleSave();
  if (live) $('#live-info').textContent = liveInfoText();
}

function bindSeg(el, onPick) {
  el.addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.value;
    if (v) onPick(v);
  });
  el.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const btns = [...el.querySelectorAll('button')];
    const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const n = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    onPick(n.dataset.value);
    n.focus();
  });
}
bindSeg(exprPick, setExpression);
bindSeg($('#head-mode'), (v) => {
  state.settings.headMode = v;
  setSeg($('#head-mode'), v);
  scheduleSave();
});
bindSeg($('#layer-attach'), (v) => editLayer((l) => { l.attach = v; }, { editor: true }));

$('#emphasize').addEventListener('change', (e) => {
  state.settings.emphasize = e.target.checked;
  scheduleSave();
});

$('#btn-eyes').addEventListener('click', (e) => {
  motion.eyesHeld = !motion.eyesHeld;
  e.currentTarget.setAttribute('aria-pressed', String(motion.eyesHeld));
});
$('#btn-blink').addEventListener('click', () => motion.blink());
$('#btn-mouth').addEventListener('click', (e) => {
  motion.mouthHeld = !motion.mouthHeld;
  e.currentTarget.setAttribute('aria-pressed', String(motion.mouthHeld));
});
$('#btn-talk').addEventListener('click', () => motion.talk());

// 숫자키로 표정 바꾸기
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.matches?.('input[type="text"], input[type="url"], textarea, select') || t.isContentEditable) return;
  if (EXPR_KEYS.includes(e.key)) setExpression(e.key);
  if (e.key === 'Escape' && live) exitLive();
});

// 마우스 위치 → 고개 방향
const stage = $('#stage');
window.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  if (!r.width) return;
  motion.setPointer((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height * 0.4)) / (r.height / 2));
}, { passive: true });

// ───────── 겹침 표시 (십자, 점선 원, 고정선, 눈 영역) ─────────
const overlay = $('#overlay');
const octx = overlay.getContext('2d');

function guideGeometry() {
  const w = overlay.clientWidth;
  const s = state.settings;
  const layer = selected();
  return {
    w,
    cx: (s.faceX / 100) * w,
    cy: (s.faceY / 100) * w,
    r: (s.faceSize / 100) * w,
    anchor: layer && layer.physics && layer.attach === 'head' ? (layer.anchor / 100) * w : null,
    band: s.blinkSqueeze ? [(s.bandTop / 100) * w, (s.bandBottom / 100) * w] : null
  };
}

function drawOverlay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(overlay.clientWidth * dpr);
  const ch = Math.round(overlay.clientHeight * dpr);
  if (overlay.width !== cw || overlay.height !== ch) {
    overlay.width = cw;
    overlay.height = ch;
  }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
  if (live) return;
  const g = guideGeometry();
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();

  if (g.band) {
    octx.fillStyle = 'rgba(49, 196, 108, 0.14)';
    octx.fillRect(0, g.band[0], g.w, g.band[1] - g.band[0]);
    octx.strokeStyle = css.getPropertyValue('--green').trim();
    octx.lineWidth = 1.5;
    octx.setLineDash([]);
    for (const y of g.band) {
      octx.beginPath();
      octx.moveTo(0, y);
      octx.lineTo(g.w, y);
      octx.stroke();
    }
  }
  if (g.anchor !== null) {
    octx.strokeStyle = css.getPropertyValue('--pink').trim();
    octx.lineWidth = 1.5;
    octx.setLineDash([6, 5]);
    octx.beginPath();
    octx.moveTo(0, g.anchor);
    octx.lineTo(g.w, g.anchor);
    octx.stroke();
  }
  octx.strokeStyle = accent;
  octx.lineWidth = 1.5;
  octx.setLineDash([5, 5]);
  octx.beginPath();
  octx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  octx.stroke();
  octx.setLineDash([]);
  octx.lineWidth = 2.5;
  octx.beginPath();
  octx.moveTo(g.cx - 14, g.cy);
  octx.lineTo(g.cx + 14, g.cy);
  octx.moveTo(g.cx, g.cy - 14);
  octx.lineTo(g.cx, g.cy + 14);
  octx.stroke();
  octx.fillStyle = accent;
  octx.font = `13px ${css.getPropertyValue('--font')}`;
  octx.fillText('얼굴 중심', g.cx + 10, g.cy - 12);
}

function hitGuide(x, y) {
  const g = guideGeometry();
  if (Math.hypot(x - g.cx, y - g.cy) < 16) return 'center';
  if (g.band) {
    if (Math.abs(y - g.band[0]) < 6) return 'bandTop';
    if (Math.abs(y - g.band[1]) < 6) return 'bandBottom';
  }
  if (g.anchor !== null && Math.abs(y - g.anchor) < 7) return 'anchor';
  if (Math.abs(Math.hypot(x - g.cx, y - g.cy) - g.r) < 9) return 'radius';
  if (g.band && y > g.band[0] && y < g.band[1]) return 'band';
  return null;
}

const CURSORS = { center: 'move', bandTop: 'ns-resize', bandBottom: 'ns-resize', anchor: 'ns-resize', radius: 'nwse-resize', band: 'grab' };
let guideDrag = null;

overlay.addEventListener('pointermove', (e) => {
  const r = overlay.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (!guideDrag) {
    overlay.style.cursor = CURSORS[hitGuide(x, y)] || 'default';
    return;
  }
  const s = state.settings;
  const px = clamp((x / r.width) * 100, 0, 100);
  const py = clamp((y / r.width) * 100, 0, 100);
  switch (guideDrag.kind) {
    case 'center':
      s.faceX = Math.round(px);
      s.faceY = Math.round(py);
      break;
    case 'radius':
      s.faceSize = Math.round(clamp((Math.hypot(x - (s.faceX / 100) * r.width, y - (s.faceY / 100) * r.width) / r.width) * 100, 5, 60));
      break;
    case 'anchor': {
      const layer = selected();
      if (layer) layer.anchor = Math.round(py);
      break;
    }
    case 'bandTop':
      s.bandTop = Math.round(Math.min(py, s.bandBottom - 2));
      break;
    case 'bandBottom':
      s.bandBottom = Math.round(Math.max(py, s.bandTop + 2));
      break;
    case 'band': {
      const h = guideDrag.bandBottom - guideDrag.bandTop;
      const top = clamp(guideDrag.bandTop + (py - guideDrag.startPy), 0, 100 - h);
      s.bandTop = Math.round(top);
      s.bandBottom = Math.round(top + h);
      break;
    }
  }
  renderSettings();
  scheduleSave();
});
overlay.addEventListener('pointerdown', (e) => {
  const r = overlay.getBoundingClientRect();
  const kind = hitGuide(e.clientX - r.left, e.clientY - r.top);
  if (!kind) return;
  e.preventDefault();
  overlay.setPointerCapture(e.pointerId);
  guideDrag = {
    kind,
    startPy: ((e.clientY - r.top) / r.width) * 100,
    bandTop: state.settings.bandTop,
    bandBottom: state.settings.bandBottom
  };
  if (kind === 'band') overlay.style.cursor = 'grabbing';
});
const endGuideDrag = () => { guideDrag = null; };
overlay.addEventListener('pointerup', endGuideDrag);
overlay.addEventListener('pointercancel', endGuideDrag);

// ───────── 그리기 루프 ─────────
function visibleNow(layer, m) {
  if (!layer.visible) return false;
  if (!layer.expressions.includes(state.settings.expression)) return false;
  const s = state.settings;
  const eyesOpen = s.blinkSqueeze ? m.blink < 0.98 : m.blink < 0.5;
  switch (layer.when) {
    case 'eyesOpen': return eyesOpen;
    case 'eyesClosed': return !eyesOpen;
    case 'mouthOpen': return m.mouthOpen;
    case 'mouthClosed': return !m.mouthOpen;
    default: return true;
  }
}

function drawItem(layer, m) {
  const s = state.settings;
  const rt = runtime.get(layer.id);
  const bb = rt?.bbox || [0, 0, 1, 1];
  const center = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
  let scale = [1, 1];
  if (layer.when === 'mouthOpen' && s.mouthAnim) {
    const k = 0.35 + 0.65 * m.mouth;
    scale = [k, k];
  } else if (layer.bounce && m.eyeBounce !== 1) {
    scale = [1 / Math.sqrt(m.eyeBounce), m.eyeBounce];
  }
  const onHead = layer.attach === 'head';
  const physics = layer.physics && onHead;
  return {
    id: layer.id,
    onHead,
    depth: layer.depth / 100,
    bulge: layer.bulge / 100,
    physics,
    anchor: layer.anchor / 100,
    swing: physics ? motion.swingOf(layer.id) : [0, 0],
    scaleCenter: center,
    scale,
    squeeze: layer.when === 'eyesOpen' && s.blinkSqueeze ? m.blink : 0,
    alpha: s.emphasize && !live && state.selectedId && layer.id !== state.selectedId ? 0.25 : 1
  };
}

let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  const s = state.settings;
  if (mic) motion.micOpen = mic.isOpen(motion.time);
  const physicsIds = state.layers.filter((l) => l.physics && l.attach === 'head').map((l) => l.id);
  const m = motion.update(dt, s, { autoBlink: live, physicsIds });

  if (renderer) {
    const items = [];
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      if (runtime.get(layer.id)?.status !== 'ok' || !visibleNow(layer, m)) continue;
      const item = drawItem(layer, m);
      if (layer.clip) {
        const below = state.layers[i + 1];
        if (!below || runtime.get(below.id)?.status !== 'ok') continue;
        item.clipTo = drawItem(below, m);
      }
      items.push(item);
    }
    renderer.render({
      head: m.head,
      face: [s.faceX / 100, s.faceY / 100, s.faceSize / 100],
      squash: m.squash,
      breath: m.breath,
      band: [s.bandTop / 100, s.bandBottom / 100],
      items
    });
    const msg = $('#stage-msg');
    const hasImage = state.layers.some((l) => runtime.get(l.id)?.status === 'ok');
    const loading = state.layers.some((l) => runtime.get(l.id)?.status === 'loading');
    const text = hasImage ? '' : loading ? '불러오는 중…' : '아직 보이는 그림이 없어요.\n레이어를 추가하고 이미지를 넣어 보세요.';
    if (msg.textContent !== text) msg.textContent = text;
    msg.hidden = !text;
    msg.style.whiteSpace = 'pre-line';
  }
  drawOverlay();
  requestAnimationFrame(frame);
}

// ───────── 헤더 메뉴 ─────────
function setHelp(open) {
  state.settings.helpOpen = open;
  renderSettings();
  scheduleSave();
}
$('#btn-help').addEventListener('click', () => {
  setHelp(!state.settings.helpOpen);
  if (state.settings.helpOpen) $('#help').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#help-close').addEventListener('click', () => {
  setHelp(false);
  $('#btn-help').focus();
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

$('#btn-export').addEventListener('click', async () => {
  try {
    const layers = [];
    for (const l of state.layers) {
      const copy = JSON.parse(JSON.stringify(l));
      if (l.image?.type === 'blob') {
        const blob = await store.getImage(l.image.id);
        copy.image = blob ? { type: 'data', data: await blobToDataUrl(blob) } : null;
      }
      layers.push(copy);
    }
    const data = { app: 'feather-talk2', version: 1, exportedAt: new Date().toISOString(), settings: state.settings, layers };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.download = `feather-talk-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('백업 파일을 내려받았어요.');
  } catch (err) {
    console.error(err);
    toast('백업 파일을 만들지 못했어요.', true);
  }
});

$('#btn-import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.layers) || typeof data.settings !== 'object') throw new Error();
  } catch {
    toast('Feather-Talk 백업 파일이 아니에요.', true);
    return;
  }
  if (!(await confirmBox('백업을 불러올까요?\n지금 레이어와 설정은 백업 내용으로 바뀌어요.', '불러오기'))) return;
  try {
    const layers = [];
    for (const raw of data.layers) {
      const layer = makeLayer(raw);
      layer.id = uid('L');
      layer.expressions = Array.isArray(raw.expressions) ? raw.expressions.filter((k) => EXPR_KEYS.includes(k)) : [...EXPR_KEYS];
      if (raw.image?.type === 'data' && typeof raw.image.data === 'string') {
        const blob = await (await fetch(raw.image.data)).blob();
        const id = uid('img');
        await store.putImage(id, blob);
        layer.image = { type: 'blob', id };
      } else if (raw.image?.type === 'url' && typeof raw.image.url === 'string') {
        layer.image = { type: 'url', url: raw.image.url };
      } else if (raw.image?.type === 'default' && getDefaultImage(raw.image.key)) {
        layer.image = { type: 'default', key: raw.image.key };
      } else {
        layer.image = null;
      }
      layers.push(layer);
    }
    await replaceState({ ...DEFAULT_SETTINGS, ...data.settings }, layers);
    toast('백업을 불러왔어요.');
  } catch (err) {
    console.error(err);
    toast('백업을 불러오지 못했어요. 파일이 손상됐을 수 있어요.', true);
  }
});

$('#btn-reset').addEventListener('click', async () => {
  if (!(await confirmBox('기본 캐릭터로 되돌릴까요?\n지금 레이어와 설정이 사라져요. 필요하면 먼저 백업 내보내기를 해 두세요.', '되돌리기'))) return;
  await replaceState({ ...DEFAULT_SETTINGS, helpOpen: state.settings.helpOpen, headMode: state.settings.headMode }, createDefaultLayers(makeLayer));
  toast('기본 캐릭터로 되돌렸어요.');
});

async function replaceState(settings, layers) {
  for (const l of state.layers) {
    renderer?.deleteTexture(l.id);
    runtime.delete(l.id);
    motion.forget(l.id);
  }
  state = { settings, layers, selectedId: layers[0]?.id ?? null };
  renderSettings();
  renderList();
  renderEditor();
  await Promise.all(layers.map(loadLayerImage));
  renderList();
  renderEditor();
  await saveNow();
  gcImages();
}

// ───────── 라이브 ─────────
const liveEl = $('#live');
const stageHome = stage.parentElement;
let idleTimer = 0;

function liveInfoText() {
  const micText = mic ? '마이크 연결됨' : '마이크 꺼짐';
  return `${micText} · 표정 ${state.settings.expression} (숫자키로 변경)`;
}

function poke() {
  liveEl.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => liveEl.classList.add('idle'), 2500);
}

async function enterLive() {
  if (live) return;
  live = true;
  motion.eyesHeld = false;
  motion.mouthHeld = false;
  $('#btn-eyes').setAttribute('aria-pressed', 'false');
  $('#btn-mouth').setAttribute('aria-pressed', 'false');
  $('#live-stage').append(stage);
  liveEl.hidden = false;
  document.body.style.overflow = 'hidden';
  history.pushState({ live: true }, '', '#live');
  liveEl.addEventListener('pointermove', poke);
  poke();
  $('#live-exit').focus();
  $('#live-info').textContent = '마이크 연결 중…';
  try {
    const m = new MicInput();
    await m.start();
    if (!live) {
      m.stop();
      return;
    }
    mic = m;
  } catch (err) {
    console.warn(err);
    toast('마이크를 쓸 수 없어 입이 소리에 맞춰 움직이지 않아요. 브라우저의 마이크 권한을 확인해 주세요.', true);
  }
  $('#live-info').textContent = liveInfoText();
}

function exitLive(fromHistory = false) {
  if (!live) return;
  live = false;
  mic?.stop();
  mic = null;
  motion.micOpen = false;
  stageHome.prepend(stage);
  liveEl.hidden = true;
  liveEl.removeEventListener('pointermove', poke);
  clearTimeout(idleTimer);
  document.body.style.overflow = '';
  if (!fromHistory && history.state?.live) history.back();
  $('#btn-live').focus();
}

$('#btn-live').addEventListener('click', enterLive);
$('#live-exit').addEventListener('click', () => exitLive());
window.addEventListener('popstate', () => {
  if (live) exitLive(true);
});

// ───────── 시작 ─────────
async function init() {
  if (location.hash === '#live') history.replaceState(null, '', location.pathname + location.search);
  try {
    renderer = new Renderer($('#gl'));
  } catch (err) {
    console.error(err);
    $('#stage-msg').textContent = `미리보기를 그릴 수 없어요. ${err.message}`;
  }

  let saved = null;
  try {
    saved = await store.loadState();
  } catch (err) {
    storageOk = false;
    console.error(err);
    const el = $('#save-state');
    el.textContent = '(이 브라우저에는 저장할 수 없어요 — 새로고침하면 사라져요)';
    el.classList.add('error');
  }

  if (saved && Array.isArray(saved.layers)) {
    state = {
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
      layers: saved.layers.map((l) => makeLayer(l)),
      selectedId: saved.selectedId
    };
    if (!state.layers.some((l) => l.id === state.selectedId)) state.selectedId = state.layers[0]?.id ?? null;
  } else {
    const layers = createDefaultLayers(makeLayer);
    state = { settings: { ...DEFAULT_SETTINGS }, layers, selectedId: layers[layers.length - 3]?.id ?? null };
  }

  renderSettings();
  renderList();
  renderEditor();
  await Promise.all(state.layers.map(loadLayerImage));
  renderList();
  renderEditor();
  if (!saved && storageOk) saveNow();
  requestAnimationFrame(frame);
}

init();

// ───────── PWA ─────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker registration failed:', err));
  });
}
