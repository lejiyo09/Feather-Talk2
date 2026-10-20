// 캐릭터 모델: 기본값, 레이어 종류, 저장(localStorage + IndexedDB), 백업.
// 데이터 형식은 원본(version 2)과 같아서 원본에서 내보낸 백업 파일을 그대로 불러올 수 있다.
import { DEFAULT_PRESET } from './default-preset.js';

export const MODEL_KEY = 'ftModel';

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

export function loadModel() {
  let raw = null;
  try {
    raw = localStorage.getItem(MODEL_KEY);
  } catch {
    // 저장소를 못 쓰는 환경 (사생활 보호 모드 등)
  }
  if (raw) {
    try {
      const m = normalizeModel(JSON.parse(raw));
      if (m.layers.length) return m;
    } catch (err) {
      console.error('ftModel을 읽지 못했어요', err);
    }
  }
  const m = defaultCharacter();
  saveModel(m);
  return m;
}

export function saveModel(m) {
  try {
    localStorage.setItem(MODEL_KEY, JSON.stringify(m));
    return true;
  } catch (err) {
    console.error('설정을 저장하지 못했어요', err);
    return false;
  }
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
export async function cleanupFiles(model) {
  const used = new Set(model.layers.filter((l) => l.src?.type === 'file').map((l) => l.src.value));
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

export async function importBackup(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.layers)) throw new Error('not a backup');
  const m = normalizeModel(raw);
  for (const layer of m.layers) {
    if (layer.src.type === 'data') {
      const blob = await (await fetch(layer.src.value)).blob();
      layer.src = { type: 'file', value: await putFile(blob) };
    }
  }
  return m;
}
