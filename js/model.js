// 캐릭터 모델: 기본값, 레이어 종류, 저장(localStorage + IndexedDB), 백업.
// 데이터 형식은 원본(version 2)과 같아서 원본에서 내보낸 백업 파일을 그대로 불러올 수 있다.
import { DEFAULT_PRESET } from './default-preset.js';

export const MODEL_KEY = 'ftModel';
export const BETA_MODEL_KEY = 'ftModelBeta';
let modelKey = MODEL_KEY;
// 베타·멀티는 정식판과 설정을 따로 저장한다
export function useBetaStorage(beta) {
  modelKey = beta ? BETA_MODEL_KEY : MODEL_KEY;
}

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error('설정을 저장하지 못했어요', err);
    return false;
  }
}

// 깜빡임 값이 이 이상이면 '감은 눈'으로 본다
export const BLINK_CLOSED = 0.9;

export const SHOW_OPTIONS = [
  ['always', '항상'],
  ['eyesOpen', '눈 뜰 때'],
  ['eyesClosed', '눈 감을 때'],
  ['mouthClosed', '입 다물 때'],
  ['mouthOpen', '입 열 때']
];

export const HAIR_DEFAULT = { enabled: false, dir: 'down', anchorY: 0.25, sway: 50, stiffness: 50, bounce: 50 };

// '레이어 추가' 메뉴 항목과 기본값
export const PRESETS = {
  bang: { label: '앞머리', name: '앞머리', depth: 30, curve: 40, hair: { enabled: true, dir: 'down', anchorY: 0.22, sway: 50, stiffness: 50, bounce: 50 } },
  eyes: { label: '눈 (뜬 눈)', name: '눈', depth: 25, curve: 30, show: 'eyesOpen' },
  eyesClosed: { label: '눈 (감은 눈)', name: '감은 눈', depth: 25, curve: 30, show: 'eyesClosed' },
  pupil: { label: '눈동자', name: '눈동자', depth: 15, curve: 29, show: 'eyesOpen', clip: true, pop: true },
  nose: { label: '코', name: '코', depth: 19, curve: 46 },
  mouth: { label: '입 (다문 입)', name: '입', depth: 25, curve: 30, show: 'mouthClosed' },
  mouthOpen: { label: '입 (벌린 입)', name: '벌린 입', depth: 25, curve: 30, show: 'mouthOpen' },
  face: { label: '얼굴', name: '얼굴', depth: 0, curve: 40 },
  body: { label: '몸', name: '몸', part: 'body' },
  ribbon: { label: '리본·장식 (위로)', name: '리본', depth: 10, curve: 10, hair: { enabled: true, dir: 'up', anchorY: 0.25, sway: 60, stiffness: 55, bounce: 70 } },
  back: { label: '뒷머리', name: '뒷머리', depth: -12, curve: -20, hair: { enabled: true, dir: 'down', anchorY: 0.3, sway: 40, stiffness: 40, bounce: 50 } },
  blank: { label: '빈 레이어', name: '새 레이어' }
};

let counter = 0;
export function uid() {
  return Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);
}

export function defaultJoints() {
  return {
    neck: { x: 0.5, y: 0.22 }, waist: { x: 0.5, y: 0.45 },
    shoulderL: { x: 0.37, y: 0.25 }, elbowL: { x: 0.33, y: 0.38 }, wristL: { x: 0.31, y: 0.5 },
    shoulderR: { x: 0.63, y: 0.25 }, elbowR: { x: 0.67, y: 0.38 }, wristR: { x: 0.69, y: 0.5 },
    hipL: { x: 0.45, y: 0.53 }, kneeL: { x: 0.45, y: 0.73 }, ankleL: { x: 0.45, y: 0.93 },
    hipR: { x: 0.55, y: 0.53 }, kneeR: { x: 0.55, y: 0.73 }, ankleR: { x: 0.55, y: 0.93 }
  };
}

export function emptyModel() {
  return {
    version: 2,
    center: { x: 0.5, y: 0.4, r: 0.25 },
    rig: { yaw: 100, pitch: 100, roll: 100, bounce: 50, breath: 50 },
    eyes: { squash: false, y: 0.4, h: 0.05 },
    mouth: { animate: true },
    aspect: 1,
    // 몸 리깅(베타 전용)은 구현하지 않았지만, 백업 호환을 위해 값은 그대로 보존한다
    body: {
      enabled: false,
      joints: defaultJoints(),
      radius: 0.15,
      follow: 35,
      sway: 50,
      mirror: true,
      poses: { a: Array(12).fill(0), b: Array(12).fill(0), aLen: Array(12).fill(1), bLen: Array(12).fill(1) },
      playSpeed: 0.6
    },
    layers: []
  };
}

export function makeLayer(kind = 'blank', url = '') {
  const p = PRESETS[kind] || PRESETS.blank;
  return {
    id: uid(),
    name: p.name,
    src: { type: 'url', value: url },
    part: p.part || 'head',
    show: p.show || 'always',
    expressions: Array(10).fill(true),
    visible: true,
    depth: p.depth || 0,
    curve: p.curve || 0,
    hair: { ...HAIR_DEFAULT, ...(p.hair || {}) },
    clip: p.clip || false,
    pop: p.pop || false
  };
}

export function duplicateLayer(layer) {
  const copy = JSON.parse(JSON.stringify(layer));
  copy.id = uid();
  copy.name = `${layer.name} 복사본`;
  return copy;
}

const normalizeAssetPath = (v) => v.replace(/^(\.\.\/|\.\/)?assets\//, '/assets/');

// 기본 캐릭터: 제공된 원본 백업 프리셋에서 만든다 (레이어 id는 매번 새로)
export function defaultCharacter() {
  const m = normalizeModel(JSON.parse(JSON.stringify(DEFAULT_PRESET)));
  for (const l of m.layers) l.id = uid();
  return m;
}

// 빠진 값을 기본값으로 채운다 (예전 백업·다른 버전 백업 대비)
export function normalizeModel(raw) {
  const base = emptyModel();
  const m = { ...base, ...raw };
  m.center = { ...base.center, ...raw.center };
  m.rig = { ...base.rig, ...raw.rig };
  m.eyes = { ...base.eyes, ...raw.eyes };
  m.mouth = { ...base.mouth, ...raw.mouth };
  m.body = { ...base.body, ...raw.body };
  m.body.joints = { ...base.body.joints, ...raw.body?.joints };
  const pose = (k, d) => Array.from({ length: 12 }, (_, i) => raw.body?.poses?.[k]?.[i] || d);
  m.body.poses = { a: pose('a', 0), b: pose('b', 0), aLen: pose('aLen', 1), bLen: pose('bLen', 1) };
  m.layers = (raw.layers || []).map((l) => {
    const blank = makeLayer('blank');
    const layer = {
      ...blank,
      ...l,
      src: { ...blank.src, ...l.src },
      hair: { ...blank.hair, ...l.hair },
      expressions: Array.isArray(l.expressions) && l.expressions.length === 10 ? l.expressions : blank.expressions
    };
    if (layer.src.type === 'url') layer.src.value = normalizeAssetPath(layer.src.value);
    return layer;
  });
  return m;
}

// 버전 1(feathertalk.live)이 쓰던 부위별 저장값 → 레이어 모델
const LEGACY_KEYS = [
  ['ftBang', 'bang', '/assets/bang.png'],
  ['ftMouth', 'mouth', '/assets/mouth.png'],
  ['ftMouthOpen', 'mouthOpen', '/assets/mouthopen.png'],
  ['ftEyes', 'eyes', '/assets/eyes.png'],
  ['ftEyesClosed', 'eyesClosed', '/assets/eyesclosed.png'],
  ['ftFace', 'face', '/assets/face.png'],
  ['ftBody', 'body', '/assets/body.png'],
  ['ftBack', 'back', '/assets/back.png']
];
function legacyModel() {
  if (!LEGACY_KEYS.some(([k]) => lsGet(k))) return null;
  const m = emptyModel();
  for (const [key, kind, def] of LEGACY_KEYS) {
    // 값은 주소 하나이거나, 표정 10개 각각의 주소 배열
    let urls = Array(10).fill(def);
    const raw = lsGet(key);
    if (raw) {
      try {
        urls = raw[0] === '[' ? JSON.parse(raw) : Array(10).fill(raw);
      } catch {
        // 깨진 값은 기본 그림
      }
    }
    urls = urls.map(normalizeAssetPath);
    const distinct = [...new Set(urls)];
    distinct.forEach((url, i) => {
      const layer = makeLayer(kind, url);
      if (distinct.length > 1) layer.name += ` ${i + 1}`;
      layer.expressions = urls.map((u) => u === url);
      m.layers.push(layer);
    });
  }
  return m;
}

export function loadModel() {
  const raw = lsGet(modelKey) || (modelKey === BETA_MODEL_KEY ? lsGet(MODEL_KEY) : null);
  let m = null;
  if (raw) {
    try {
      m = normalizeModel(JSON.parse(raw));
      if (m.layers.length) return m;
      m = defaultCharacter();
    } catch (err) {
      console.error('ftModel을 읽지 못했어요', err);
    }
  }
  m = m || legacyModel() || defaultCharacter();
  saveModel(m);
  return m;
}

export function saveModel(m) {
  return lsSet(modelKey, JSON.stringify(m));
}

// ───────── 베타: 1~0번 캐릭터 슬롯 ─────────
const SLOTS_KEY = 'ftSlotsBeta';
const ACTIVE_SLOT_KEY = 'ftSlotBeta';

// 기존 모델에서 n번 표정에 보이는 레이어만 뽑아 캐릭터 하나로
function slotFromExpression(model, n) {
  const m = JSON.parse(JSON.stringify(model));
  const picked = m.layers.filter((l) => l.expressions[n]);
  m.layers = (picked.length ? picked : m.layers).map((l) => ({ ...l, expressions: Array(10).fill(true) }));
  return m;
}

export function loadSlots() {
  const active = Math.min(9, Math.max(0, parseInt(lsGet(ACTIVE_SLOT_KEY) || '0', 10) || 0));
  try {
    const saved = JSON.parse(lsGet(SLOTS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) {
      const slots = saved.map(normalizeModel);
      while (slots.length < 10) slots.push(normalizeModel(JSON.parse(JSON.stringify(slots[0]))));
      return { slots: slots.slice(0, 10), active };
    }
  } catch (err) {
    console.error('캐릭터 슬롯을 읽지 못했어요', err);
  }
  const base = loadModel();
  return { slots: Array.from({ length: 10 }, (_, n) => slotFromExpression(base, n)), active };
}

export function saveSlots(slots, active) {
  const ok = lsSet(SLOTS_KEY, JSON.stringify(slots));
  lsSet(ACTIVE_SLOT_KEY, String(active));
  return ok;
}

// 다른 탭(멀티 설정 등)에서 슬롯을 바꾸면 알려 준다
export function watchSlots(cb) {
  const onStorage = (e) => {
    if (e.key !== SLOTS_KEY || !e.newValue) return;
    try {
      const v = JSON.parse(e.newValue);
      if (Array.isArray(v) && v.length) cb(v.map(normalizeModel));
    } catch {
      // 깨진 값은 무시
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

// 지금 상태에서 이 레이어가 보이는지
export function isLayerShown(layer, { expression, eyesClosed, mouthOpen, blink }) {
  if (!layer.visible || !layer.expressions[expression]) return false;
  const b = blink ?? (eyesClosed ? 1 : 0);
  switch (layer.show) {
    case 'eyesOpen': return b < BLINK_CLOSED;
    case 'eyesClosed': return b >= BLINK_CLOSED;
    case 'mouthClosed': return !mouthOpen;
    case 'mouthOpen': return mouthOpen;
  }
  return true;
}

// ───────── 업로드 파일 (IndexedDB 'feathertalk' / 'files') ─────────
let dbPromise = null;
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('feathertalk', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function putFile(blob) {
  const id = `f_${uid()}`;
  await withStore('readwrite', (s) => s.put(blob, id));
  return id;
}

export const getFile = (id) => withStore('readonly', (s) => s.get(id));
const deleteFile = (id) => withStore('readwrite', (s) => s.delete(id));

// 어느 레이어도 쓰지 않는 업로드 파일을 지운다
// 정식판·베타 모델, 캐릭터 슬롯, 멀티 오브젝트가 쓰는 파일은 남긴다
export async function cleanupFiles(model) {
  const models = [model];
  for (const key of [MODEL_KEY, BETA_MODEL_KEY]) {
    if (key === modelKey) continue;
    try {
      const v = lsGet(key);
      if (v) models.push(JSON.parse(v));
    } catch {
      // 무시
    }
  }
  try {
    models.push(...(JSON.parse(lsGet(SLOTS_KEY) || '[]') || []));
  } catch {
    // 무시
  }
  try {
    const multi = JSON.parse(lsGet('ftMulti') || 'null');
    if (multi) models.push({ layers: (multi.objects || []).map((o) => o.file).filter(Boolean).map((f) => ({ src: { type: 'file', value: f } })) });
  } catch {
    // 무시
  }
  const used = new Set(models.flatMap((m) => (m.layers || []).filter((l) => l.src?.type === 'file').map((l) => l.src.value)));
  const keys = await withStore('readonly', (s) => s.getAllKeys());
  await Promise.all(keys.map(String).filter((k) => !used.has(k)).map(deleteFile));
}

const objectUrls = new Map();
// 레이어 이미지를 <img>/텍스처에 쓸 주소로 바꾼다
export async function resolveSrc(layer) {
  const { type, value } = layer.src;
  if (!value) return '';
  if (type !== 'file') return value;
  if (!objectUrls.has(value)) {
    const blob = await getFile(value).catch(() => null);
    objectUrls.set(value, blob ? URL.createObjectURL(blob) : '');
  }
  return objectUrls.get(value);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// 업로드 파일을 data URL로 넣은 백업 JSON 문자열
export async function exportBackup(model) {
  const m = JSON.parse(JSON.stringify(model));
  for (const layer of m.layers) {
    if (layer.src.type === 'file') {
      const blob = await getFile(layer.src.value).catch(() => null);
      layer.src = { type: 'data', value: blob ? await blobToDataUrl(blob) : '' };
    }
  }
  return JSON.stringify(m);
}

// 불러오기 실패 이유를 화면에 알려 주기 위한 오류
export class BackupError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
  }
}

// data URL → Blob. fetch(data:)는 브라우저·보안 설정에 따라 막힐 수 있어 직접 푼다
function dataUrlToBlob(url) {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) throw new Error('data URL이 아니에요');
  const head = url.slice(5, comma);
  const type = head.split(';')[0] || 'application/octet-stream';
  const body = url.slice(comma + 1);
  if (!/;base64/i.test(head)) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function importBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new BackupError('JSON 파일이 아니거나 내용이 잘렸어요. 내려받기가 끝까지 됐는지 확인해 주세요.', err);
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.layers)) {
    throw new BackupError('Feather-Talk 백업 파일이 아니에요 (레이어 목록이 없어요).');
  }
  const m = normalizeModel(raw);
  const broken = [];
  for (const layer of m.layers) {
    if (layer.src.type !== 'data') continue;
    if (!layer.src.value) {
      layer.src = { type: 'url', value: '' };
      continue;
    }
    let blob;
    try {
      blob = dataUrlToBlob(layer.src.value);
    } catch {
      // 그림 하나가 깨졌어도 나머지는 살린다
      broken.push(layer.name);
      layer.src = { type: 'url', value: '' };
      continue;
    }
    try {
      layer.src = { type: 'file', value: await putFile(blob) };
    } catch (err) {
      throw new BackupError('그림을 이 브라우저에 저장하지 못했어요. 저장 공간이 부족하거나 사생활 보호(시크릿) 모드일 수 있어요.', err);
    }
  }
  m.brokenImages = broken;
  return m;
}
