// 편집기 상태와 조작. 정식판·베타 편집기와 멀티의 '캐릭터 만들기' 탭이 함께 쓴다.
import {
  useBetaStorage, loadModel, saveModel, loadSlots, saveSlots, watchSlots, normalizeModel, defaultCharacter,
  makeLayer, duplicateLayer, putFile, cleanupFiles, exportBackup, importBackup
} from './model.js';

const CLIPBOARD_KEY = 'ftSlotClipboardBeta';

export function createStore(beta) {
  useBetaStorage(beta);
  const slotData = beta ? loadSlots() : null;
  const listeners = new Set();
  const st = {
    beta,
    slots: slotData ? slotData.slots : [],
    activeSlot: slotData ? slotData.active : 0,
    model: null,
    selectedId: null,
    imageErrors: new Set(),
    saveError: false,
    preview: {
      mode: 'mouse',
      expression: 0,
      eyesClosed: false,
      mouthOpen: false,
      focus: false,
      target: { x: 0, y: 0 },
      drag: null,
      hover: null,
      view: { zoom: 1, x: 0, y: 0 },
      showJoints: true,
      layerBones: {},
      poseEdit: null,
      poseMode: 'rotate',
      playTest: false
    },
    clipboard: null
  };
  st.model = beta ? st.slots[st.activeSlot] : loadModel();
  st.selectedId = st.model.layers[0]?.id ?? null;
  if (beta) {
    try {
      st.clipboard = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || 'null');
    } catch {
      st.clipboard = null;
    }
  }

  // tags: 'layers' 목록, 'props' 속성, 'global' 전체 설정, 'preview' 미리보기 도구, 'body' 몸 리깅, 'slots', 'all'
  st.on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  st.emit = (...tags) => {
    const set = new Set(tags);
    for (const fn of listeners) fn(set);
  };

  let saveTimer = 0;
  function saveNow() {
    let ok = saveModel(st.model);
    if (beta) ok = saveSlots(st.slots, st.activeSlot) && ok;
    if (st.saveError !== !ok) {
      st.saveError = !ok;
      st.emit('saveState');
    }
  }
  // 값이 바뀌면 0.3초 뒤 저장 (그 사이 또 바뀌면 미룸)
  st.changed = (...tags) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
    st.emit('model', ...tags);
  };
  // 바로 저장하고 안 쓰는 업로드 파일을 정리
  st.persist = (...tags) => {
    clearTimeout(saveTimer);
    saveNow();
    cleanupFiles(st.model).catch((err) => console.error(err));
    st.emit('model', ...tags);
  };
  window.addEventListener('pagehide', () => {
    clearTimeout(saveTimer);
    saveNow();
  });

  st.selected = () => st.model.layers.find((l) => l.id === st.selectedId) || null;

  // 고른 레이어가 미리보기에서 보이도록 표정·눈·입 상태를 맞춘다
  st.ensureVisible = (layer) => {
    const p = st.preview;
    if (!layer.expressions[p.expression]) {
      const i = layer.expressions.indexOf(true);
      if (i >= 0) p.expression = i;
    }
    if (layer.show === 'eyesClosed') p.eyesClosed = true;
    if (layer.show === 'eyesOpen') p.eyesClosed = false;
    if (layer.show === 'mouthOpen') p.mouthOpen = true;
    if (layer.show === 'mouthClosed') p.mouthOpen = false;
    st.emit('preview');
  };

  st.selectLayer = (id) => {
    st.selectedId = id;
    const l = st.selected();
    if (l) st.ensureVisible(l);
    st.emit('layers', 'props', 'selection');
  };

  st.addLayer = (kind) => {
    const layers = st.model.layers;
    const layer = makeLayer(kind);
    let at = Math.max(0, layers.findIndex((l) => l.id === st.selectedId));
    if (kind === 'bang') at = 0;
    if (kind === 'back') at = layers.length;
    layers.splice(at, 0, layer);
    st.selectLayer(layer.id);
    st.changed('layers');
  };

  st.duplicateSelected = () => {
    const l = st.selected();
    if (!l) return;
    const copy = duplicateLayer(l);
    st.model.layers.splice(st.model.layers.findIndex((x) => x.id === l.id), 0, copy);
    st.selectLayer(copy.id);
    st.changed('layers');
  };

  st.removeLayer = (id) => {
    const layers = st.model.layers;
    const i = layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    layers.splice(i, 1);
    if (id === st.selectedId) {
      const next = layers[Math.min(i, layers.length - 1)];
      st.selectLayer(next ? next.id : null);
    }
    st.imageErrors.delete(id);
    st.persist('layers', 'props', 'body');
  };

  st.moveLayer = (from, to) => {
    const layers = st.model.layers;
    if (to < 0 || to >= layers.length || from === to) return;
    const [l] = layers.splice(from, 1);
    layers.splice(to, 0, l);
    st.changed('layers');
  };

  st.setSource = (layer, src) => {
    layer.src = src;
    st.imageErrors.delete(layer.id);
    st.persist('layers', 'body');
  };

  st.uploadFile = async (file) => {
    const l = st.selected();
    if (!l || !file || !file.type.startsWith('image/')) return;
    try {
      st.setSource(l, { type: 'file', value: await putFile(file) });
      st.emit('props');
    } catch (err) {
      console.error(err);
      alert('이미지를 이 브라우저에 저장하지 못했어요.');
    }
  };

  st.imageError = (layer) => {
    if (st.imageErrors.has(layer.id)) return;
    st.imageErrors.add(layer.id);
    st.emit('layers', 'props');
  };

  function replace(m) {
    if (beta) st.slots[st.activeSlot] = m;
    st.model = m;
    st.imageErrors.clear();
    st.selectedId = null;
    st.selectLayer(m.layers[0]?.id ?? null);
    st.persist('all');
  }
  st.reset = () => replace(defaultCharacter());
  st.importBackup = async (file) => replace(await importBackup(await file.text()));
  st.exportBackup = async () => {
    const json = await exportBackup(st.model);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'feathertalk-backup.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ───────── 베타: 캐릭터 슬롯 ─────────
  st.selectSlot = (i) => {
    st.activeSlot = i;
    st.model = st.slots[i];
    st.imageErrors.clear();
    if (!st.model.layers.some((l) => l.id === st.selectedId)) st.selectedId = st.model.layers[0]?.id ?? null;
    saveNow();
    st.emit('model', 'all');
  };
  st.copySlot = (i) => {
    st.clipboard = { from: i, json: JSON.stringify(st.slots[i]) };
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(st.clipboard));
    } catch {
      // 이 탭에서는 그대로 쓸 수 있다
    }
    st.emit('slots');
  };
  st.pasteSlot = (i) => {
    if (!st.clipboard) return;
    st.slots[i] = normalizeModel(JSON.parse(st.clipboard.json));
    if (i === st.activeSlot) st.selectSlot(i);
    st.persist('all');
  };
  if (beta) {
    watchSlots((slots) => {
      slots.forEach((s, i) => { st.slots[i] = s; });
      st.model = st.slots[st.activeSlot];
      if (!st.model.layers.some((l) => l.id === st.selectedId)) st.selectedId = st.model.layers[0]?.id ?? null;
      st.emit('model', 'all');
    });
  }

  if (st.selected()) st.ensureVisible(st.selected());
  return st;
}
