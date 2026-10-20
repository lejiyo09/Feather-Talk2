import {
  PRESETS, SHOW_OPTIONS, loadModel, saveModel, defaultCharacter, makeLayer, duplicateLayer,
  putFile, cleanupFiles, resolveSrc, exportBackup, importBackup
} from './model.js';
import { createRenderer } from './renderer.js';
import {
  HeadSpring, HairSystem, Blinker, MouthAnim, Wander, breathAt, mouthState, popScale,
  pointerTarget, headTarget, rigStrength
} from './motion.js';
import { icon, fillIcons } from './icons.js';
import { registerServiceWorker } from './pwa.js';

const $ = (s) => document.querySelector(s);
const SHOW_LABEL = Object.fromEntries(SHOW_OPTIONS);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// ───────── 상태 ─────────
let model = loadModel();
let selectedId = model.layers[0]?.id ?? null;
const imageErrors = new Set();
const preview = {
  mode: 'mouse',
  expression: 0,
  eyesClosed: false,
  mouthOpen: false,
  focus: false,
  target: { x: 0, y: 0 },
  drag: null,
  hover: null
};
const selected = () => model.layers.find((l) => l.id === selectedId) || null;

// ───────── 저장 ─────────
let saveTimer = 0;
function saveNow() {
  const ok = saveModel(model);
  const el = $('#save-error');
  el.hidden = ok;
  if (!ok) el.textContent = '이 브라우저에 설정을 저장하지 못했어요. 저장 공간이 꽉 찼거나 사생활 보호 모드일 수 있어요. 새로고침하면 바뀐 내용이 사라질 수 있으니 백업 내보내기를 해 두세요.';
}
// 바뀐 뒤 0.3초 동안 더 바뀌지 않으면 저장
function changed() {
  renderer?.setLayers(model.layers, resolveSrc);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
// 바로 저장하고 안 쓰는 업로드 파일 정리
function persist() {
  renderer?.setLayers(model.layers, resolveSrc);
  clearTimeout(saveTimer);
  saveNow();
  cleanupFiles(model).catch((err) => console.error(err));
}
window.addEventListener('pagehide', () => {
  clearTimeout(saveTimer);
  saveNow();
});

// ───────── 레이어 조작 ─────────
// 고른 레이어가 미리보기에서 보이도록 표정·눈·입 상태를 맞춘다
function ensureVisible(layer) {
  if (!layer.expressions[preview.expression]) {
    const i = layer.expressions.indexOf(true);
    if (i >= 0) preview.expression = i;
  }
  if (layer.show === 'eyesClosed') preview.eyesClosed = true;
  if (layer.show === 'eyesOpen') preview.eyesClosed = false;
  if (layer.show === 'mouthOpen') preview.mouthOpen = true;
  if (layer.show === 'mouthClosed') preview.mouthOpen = false;
  renderToolbar();
}

function selectLayer(id) {
  selectedId = id;
  const l = selected();
  if (l) ensureVisible(l);
  renderList();
  renderProps();
}

function addLayer(kind) {
  const layers = model.layers;
  const layer = makeLayer(kind);
  let at = Math.max(0, layers.findIndex((l) => l.id === selectedId));
  if (kind === 'bang') at = 0;
  if (kind === 'back') at = layers.length;
  layers.splice(at, 0, layer);
  selectLayer(layer.id);
  changed();
}

function duplicateSelected() {
  const l = selected();
  if (!l) return;
  const copy = duplicateLayer(l);
  model.layers.splice(model.layers.findIndex((x) => x.id === l.id), 0, copy);
  selectLayer(copy.id);
  changed();
}

function removeLayer(id) {
  const layers = model.layers;
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  layers.splice(i, 1);
  if (id === selectedId) {
    const next = layers[Math.min(i, layers.length - 1)];
    selectedId = next ? next.id : null;
    if (next) ensureVisible(next);
  }
  imageErrors.delete(id);
  renderList();
  renderProps();
  persist();
}

function moveLayer(from, to) {
  const layers = model.layers;
  if (to < 0 || to >= layers.length || from === to) return;
  const [l] = layers.splice(from, 1);
  layers.splice(to, 0, l);
  renderList();
  changed();
}

function setSource(layer, src) {
  layer.src = src;
  imageErrors.delete(layer.id);
  renderList();
  persist();
}

async function uploadFile(file) {
  const l = selected();
  if (!l || !file || !file.type.startsWith('image/')) return;
  try {
    setSource(l, { type: 'file', value: await putFile(file) });
    if (l.id === selectedId) renderProps();
  } catch (err) {
    console.error(err);
    alert('이미지를 이 브라우저에 저장하지 못했어요.');
  }
}

function replaceModel(m) {
  model = m;
  imageErrors.clear();
  selectedId = m.layers[0]?.id ?? null;
  if (selected()) ensureVisible(selected());
  renderList();
  renderProps();
  renderGlobal();
  persist();
}

// ───────── 레이어 목록 ─────────
const listEl = $('#layers');
let dragId = null;
let overId = null;

function thumb(layer, cls) {
  const img = h('img', { class: cls, alt: '', src: '/assets/transparent.png' });
  resolveSrc(layer).then((url) => {
    if (url) img.src = url;
  });
  return img;
}

function badges(layer) {
  const out = [];
  if (imageErrors.has(layer.id)) out.push(['이미지 오류', 'err']);
  else if (!layer.src.value) out.push(['이미지 없음', '']);
  if (layer.clip) out.push(['클리핑', 'clip']);
  if (layer.part === 'body') out.push(['몸', '']);
  if (layer.part === 'fixed') out.push(['고정', '']);
  if (layer.show !== 'always') out.push([SHOW_LABEL[layer.show], '']);
  if (layer.hair.enabled && layer.part !== 'body') out.push([layer.hair.dir === 'up' ? '장식 물리' : '머리카락', 'hair']);
  return out;
}

function renderList() {
  listEl.textContent = '';
  model.layers.forEach((layer, i) => {
    const li = h('li', {
      draggable: 'true',
      class: [
        layer.id === selectedId && 'selected',
        !layer.visible && 'hidden-layer',
        overId === layer.id && dragId !== layer.id && 'drag-over',
        layer.clip && 'clipped'
      ].filter(Boolean).join(' '),
      onclick: () => selectLayer(layer.id),
      ondragstart: () => { dragId = layer.id; },
      ondragover: (e) => {
        e.preventDefault();
        if (overId !== layer.id) {
          overId = layer.id;
          for (const el of listEl.children) el.classList.toggle('drag-over', el.dataset.id === overId && overId !== dragId);
        }
      },
      ondrop: (e) => {
        e.preventDefault();
        const from = model.layers.findIndex((l) => l.id === dragId);
        let to = model.layers.findIndex((l) => l.id === layer.id);
        dragId = overId = null;
        if (from < 0) return renderList();
        if (from < to) to--;
        moveLayer(from, to);
        renderList();
      },
      ondragend: () => {
        dragId = overId = null;
        for (const el of listEl.children) el.classList.remove('drag-over');
      }
    });
    li.dataset.id = layer.id;
    const name = h('span', { class: 'name' }, `${layer.name || '(이름 없음)'} `);
    for (const [text, cls] of badges(layer)) {
      name.append(h('span', { class: `badge ${cls}`, html: (cls === 'err' ? icon('triangle-alert', 11) : '') }, text));
    }
    const btn = (title, ic, fn) => h('button', {
      type: 'button',
      class: 'icon',
      title,
      'aria-label': title,
      html: icon(ic, 17),
      onclick: (e) => {
        e.stopPropagation();
        fn();
      }
    });
    const parts = [
      h('span', { html: icon('grip-vertical', 16, 'grip'), title: '끌어서 순서 변경', style: 'display:contents' }),
      layer.clip ? h('span', { html: icon('corner-left-down', 15, 'clip-mark'), title: '아래 레이어에 맞춰 잘림', style: 'display:contents' }) : null,
      thumb(layer, 'thumb'),
      name,
      btn(layer.visible ? '숨기기' : '보이기', layer.visible ? 'eye' : 'eye-off', () => {
        layer.visible = !layer.visible;
        renderList();
        changed();
      }),
      btn('한 칸 앞으로', 'chevron-up', () => moveLayer(i, i - 1)),
      btn('한 칸 뒤로', 'chevron-down', () => moveLayer(i, i + 1)),
      btn('삭제', 'trash', () => {
        if (confirm(`'${layer.name}' 레이어를 지울까요?`)) removeLayer(layer.id);
      })
    ];
    li.append(...parts.filter(Boolean));
    listEl.append(li);
  });
  const dup = $('#btn-dup');
  const l = selected();
  dup.disabled = !l;
  dup.title = l ? `'${l.name}' 레이어를 이미지·설정까지 그대로 복제해요` : '복제할 레이어를 먼저 골라 주세요';
}

const addMenu = $('#add-menu');
for (const [kind, p] of Object.entries(PRESETS)) {
  addMenu.append(h('button', {
    type: 'button',
    onclick: () => {
      addLayer(kind);
      toggleAddMenu(false);
    }
  }, p.label));
}
function toggleAddMenu(open = addMenu.hidden) {
  addMenu.hidden = !open;
  $('#btn-add').setAttribute('aria-expanded', String(open));
}
$('#btn-add').addEventListener('click', () => toggleAddMenu());
$('#btn-dup').addEventListener('click', duplicateSelected);

// ───────── 슬라이더 ─────────
const signed = (v) => (v > 0 ? '+' : '') + v;
const percent = (v) => `${Math.round(v * 100)}%`;

function rangeField({ label, left, right, min, max, step = 1, def, snap, desc, format, get, set, iconEl }) {
  const out = h('output');
  const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
  const show = () => {
    const v = get();
    input.value = v;
    out.textContent = format ? format(v) : v;
  };
  input.addEventListener('input', () => {
    let v = parseFloat(input.value);
    if (snap && Math.abs(v) <= snap) {
      v = 0;
      input.value = '0';
    }
    set(v);
    out.textContent = format ? format(v) : v;
  });
  input.addEventListener('dblclick', () => {
    if (def === undefined) return;
    set(def);
    show();
  });
  show();
  const el = h('div', { class: 'field' },
    h('div', { class: 'field-head' }, h('b', {}, label), iconEl || null, out),
    h('div', { class: 'range' }, h('span', {}, left), input, h('span', {}, right)),
    desc ? h('p', { class: 'desc' }, desc) : null);
  el.refresh = show;
  return el;
}

// ───────── 레이어 속성 ─────────
const propsEl = $('#props');
let urlTimer = 0;

function renderProps() {
  propsEl.textContent = '';
  const l = selected();
  if (!l) {
    propsEl.append(h('p', { class: 'tip' }, '위 목록에서 레이어를 골라 주세요.'));
    return;
  }
  const edit = (fn, { list = false, props = false } = {}) => {
    fn();
    if (list) renderList();
    if (props) renderProps();
    changed();
  };

  // 이름
  const nameInput = h('input', { type: 'text', class: 'layer-name', placeholder: '레이어 이름', 'aria-label': '레이어 이름' });
  nameInput.value = l.name;
  nameInput.addEventListener('input', () => edit(() => { l.name = nameInput.value; }, { list: true }));

  // 이미지
  const dropImg = thumb(l, '');
  const drop = h('div', {
    class: 'drop-zone',
    title: '이미지 파일을 여기로 끌어다 놓아도 돼요',
    ondragover: (e) => {
      e.preventDefault();
      drop.classList.add('over');
    },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      uploadFile(e.dataTransfer?.files[0]);
    }
  }, dropImg, h('span', {}, '파일을 끌어다 놓기'));
  dropImg.addEventListener('load', () => drop.classList.toggle('has-image', !dropImg.src.endsWith('/assets/transparent.png')));

  const urlInput = h('input', { type: 'text', placeholder: '이미지 주소 (https://...)', 'aria-label': '이미지 주소' });
  urlInput.value = l.src.type === 'url' ? l.src.value : '';
  urlInput.addEventListener('input', () => {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      setSource(l, { type: 'url', value: urlInput.value.trim() });
      dropImg.src = urlInput.value.trim() || '/assets/transparent.png';
    }, 500);
  });
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  fileInput.addEventListener('change', () => {
    uploadFile(fileInput.files?.[0]);
    fileInput.value = '';
  });

  const imageBox = h('div', { class: 'image-box' },
    drop,
    h('div', { class: 'image-inputs' },
      urlInput,
      h('div', {}, h('button', { type: 'button', class: 'plain', onclick: () => fileInput.click() }, '내 PC에서 파일 선택'), fileInput),
      l.src.type === 'file' ? h('p', { class: 'desc' }, ' 업로드한 파일을 쓰고 있어요 (이 브라우저에만 저장돼요). 주소를 입력하면 주소로 바뀌어요. ') : null,
      imageErrors.has(l.id)
        ? h('p', { class: 'error', html: ' 이미지를 불러오지 못했어요. 주소가 맞는지 확인해 주세요. 주소가 맞다면 그 사이트가 외부 사용(CORS)을 막아 둔 것일 수 있어요. 그럴 땐 이미지를 내려받아 <b>파일 선택</b>으로 올려 주세요. ' })
        : null));

  // 언제 보일까요?
  const select = h('select', { 'aria-label': '언제 보일까요?' }, SHOW_OPTIONS.map(([v, t]) => h('option', { value: v }, t)));
  select.value = l.show;
  select.addEventListener('change', () => edit(() => {
    l.show = select.value;
    ensureVisible(l);
  }, { list: true }));
  const partSeg = h('div', { class: 'seg' },
    h('button', { type: 'button', class: l.part === 'head' ? 'on' : '', title: '고개를 따라 돌아가요', onclick: () => edit(() => { l.part = 'head'; }, { list: true, props: true }) }, '머리'),
    h('button', { type: 'button', class: l.part === 'body' ? 'on' : '', title: '고개를 돌려도 그대로 있어요 (기울기만 따라가요)', onclick: () => edit(() => { l.part = 'body'; }, { list: true, props: true }) }, '몸'));

  const allOn = l.expressions.every(Boolean);
  const chips = h('div', { class: 'chips' },
    l.expressions.map((on, i) => h('button', {
      type: 'button',
      class: on ? 'on' : '',
      title: `${(i + 1) % 10}번 표정에서 보이기`,
      'aria-pressed': String(on),
      onclick: () => edit(() => { l.expressions[i] = !l.expressions[i]; }, { props: true })
    }, String((i + 1) % 10))),
    h('button', { type: 'button', class: `all${allOn ? ' on' : ''}`, 'aria-pressed': String(allOn), onclick: () => edit(() => l.expressions.fill(!allOn), { props: true }) }, '전체'));

  // 입체감
  const curveIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  curveIcon.setAttribute('class', 'curve-icon');
  curveIcon.setAttribute('viewBox', '0 0 40 20');
  curveIcon.setAttribute('width', '40');
  curveIcon.setAttribute('height', '20');
  const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  curveIcon.append(svgPath);
  const drawCurve = () => svgPath.setAttribute('d', `M2 10 Q20 ${(10 - (l.curve / 100) * 8) * 2 - 10} 38 10`);
  drawCurve();

  const depth = rangeField({
    label: '깊이', left: '뒤', right: '앞', min: -100, max: 100, def: 0, snap: 4, format: signed,
    desc: '고개를 돌릴 때 얼마나 움직일지 정해요. 앞쪽(앞머리, 눈)은 많이 움직이고, 뒤쪽(뒷머리)은 반대 방향으로 움직여요.',
    get: () => l.depth,
    set: (v) => edit(() => { l.depth = v; })
  });
  const curve = rangeField({
    label: '볼록 / 오목', left: '오목', right: '볼록', min: -100, max: 100, def: 0, snap: 4, format: signed,
    desc: '볼록하면 얼굴 중심 쪽이 가장자리보다 더 많이 움직여서 둥글게 보여요. 얼굴처럼 둥근 부위는 볼록하게 두면 좋아요.',
    iconEl: curveIcon,
    get: () => l.curve,
    set: (v) => edit(() => {
      l.curve = v;
      drawCurve();
    })
  });

  // 머리카락 · 장식
  const hairToggle = h('input', { type: 'checkbox' });
  hairToggle.checked = l.hair.enabled;
  hairToggle.addEventListener('change', () => edit(() => { l.hair.enabled = hairToggle.checked; }, { list: true, props: true }));
  const hairBlock = [
    h('label', { class: 'switch' }, hairToggle, h('span', { class: 'knob' }), h('span', {}, '흔들림 물리'),
      h('p', { class: 'desc' }, '켜면 고개를 움직일 때 끝부분이 관성으로 뒤따라 출렁이고, 고개를 기울여도 원래 방향(아래 또는 위)을 유지하려 해요.')),
    l.part === 'body' ? h('p', { class: 'desc' }, '몸 레이어의 흔들림은 베타(/beta)에서 먼저 시험 중이에요. 정식판에서는 머리 레이어만 흔들려요.') : null
  ];
  if (l.hair.enabled) {
    const hr = l.hair;
    hairBlock.push(h('div', { class: 'hair-fields' },
      h('div', { class: 'row dir-row' },
        h('span', { class: 'dir-label' }, '흔들리는 쪽'),
        h('div', { class: 'seg' },
          h('button', { type: 'button', class: hr.dir === 'down' ? 'on' : '', title: '머리카락처럼 고정선 아래로 늘어진 것', onclick: () => edit(() => { hr.dir = 'down'; }, { list: true, props: true }) }, '고정선 아래 (머리카락)'),
          h('button', { type: 'button', class: hr.dir === 'up' ? 'on' : '', title: '리본·머리장식처럼 고정선 위로 솟은 것', onclick: () => edit(() => { hr.dir = 'up'; }, { list: true, props: true }) }, '고정선 위 (리본·장식)'))),
      anchorField = rangeField({
        label: '고정선 높이', left: '위', right: '아래', min: 0, max: 1, step: 0.01, def: 0.25, format: percent,
        desc: hr.dir === 'up'
          ? '이 선보다 아래는 고정되고, 위로 갈수록 많이 흔들려요. 리본이 머리에 붙은 높이에 둬요. 미리보기의 분홍 점선을 끌어도 돼요.'
          : '이 선보다 위는 고정되고, 아래로 갈수록 많이 흔들려요. 보통 정수리나 가르마 높이에 둬요. 미리보기의 분홍 점선을 끌어도 돼요.',
        get: () => hr.anchorY,
        set: (v) => edit(() => { hr.anchorY = v; })
      }),
      rangeField({ label: '흔들림 세기', left: '약하게', right: '세게', min: 0, max: 100, def: 50, get: () => hr.sway, set: (v) => edit(() => { hr.sway = v; }) }),
      rangeField({ label: '탄성', left: '느슨', right: '탱탱', min: 0, max: 100, def: 50, desc: '높을수록 빨리 제자리로 돌아와요. 짧은 머리는 높게, 긴 머리는 낮게.', get: () => hr.stiffness, set: (v) => edit(() => { hr.stiffness = v; }) }),
      rangeField({ label: '출렁임', left: '차분', right: '통통', min: 0, max: 100, def: 50, desc: '높을수록 멈춘 뒤에도 여러 번 흔들려요.', get: () => hr.bounce, set: (v) => edit(() => { hr.bounce = v; }) })));
  } else {
    anchorField = null;
  }

  // 눈동자 옵션
  const clip = h('input', { type: 'checkbox' });
  clip.checked = l.clip;
  clip.addEventListener('change', () => edit(() => { l.clip = clip.checked; }, { list: true }));
  const pop = h('input', { type: 'checkbox' });
  pop.checked = l.pop;
  pop.addEventListener('change', () => edit(() => { l.pop = pop.checked; }));

  propsEl.append(h('div', {},
    h('div', { class: 'layer-head' }, nameInput),
    h('h4', {}, '이미지'), imageBox,
    h('h4', {}, '언제 보일까요?'),
    h('div', { class: 'row' }, select, partSeg),
    h('div', { class: 'label-row' }, h('span', { class: 'mini-label' }, '표정'),
      h('p', { class: 'desc' }, "표정 번호(숫자키)마다 보일지 골라요. 예를 들어 '웃는 눈' 레이어를 2번에서만 켜 두면, 라이브 중 2를 누를 때만 나타나요.")),
    chips,
    h('h4', {}, '입체감'), depth, curve,
    h('h4', {}, '머리카락 · 장식'), ...hairBlock,
    h('h4', {}, '눈동자 옵션'),
    h('label', { class: 'check-row' }, clip, h('span', {}, h('b', {}, '아래 레이어에 맞춰 자르기 (클리핑)')),
      h('p', { class: 'desc' }, " 켜면 목록에서 바로 아래(뒤) 레이어의 그림 안쪽에만 보여요. 예: 눈동자를 흰자 레이어 바로 위에 두고 켜면 흰자 밖으로 안 나가요. 눈동자는 '눈 뜰 때'로, 깊이는 흰자보다 높게 두면 고개를 돌릴 때 시선이 따라가는 느낌이 나요. ")),
    h('label', { class: 'check-row' }, pop, h('span', {}, h('b', {}, '깜빡일 때 통통')),
      h('p', { class: 'desc' }, "켜면 눈을 감을 때 같이 눌렸다가, 뜰 때 탄성 있는 공처럼 살짝 길쭉하게 튀었다가 돌아와요. 미리보기의 '깜빡여 보기'로 확인할 수 있어요."))));
}
let anchorField = null;

// ───────── 전체 설정 ─────────
const globalFields = [];
function renderGlobal() {
  const c = () => model.center;
  const rig = () => model.rig;
  const fill = (sel, fields) => {
    const box = $(sel);
    box.textContent = '';
    for (const f of fields) {
      box.append(f);
      globalFields.push(f);
    }
  };
  globalFields.length = 0;
  const set = (fn) => (v) => {
    fn(v);
    changed();
  };
  fill('#g-face', [
    rangeField({ label: '얼굴 중심 (가로)', left: '왼쪽', right: '오른쪽', min: 0, max: 1, step: 0.005, def: 0.5, format: percent, get: () => c().x, set: set((v) => { c().x = v; }) }),
    rangeField({ label: '얼굴 중심 (세로)', left: '위', right: '아래', min: 0, max: 1, step: 0.005, def: 0.4, format: percent, desc: '위아래로 고개를 끄덕일 때 기준이 되는 높이예요. 코 근처에 두면 자연스러워요.', get: () => c().y, set: set((v) => { c().y = v; }) }),
    rangeField({ label: '얼굴 크기', left: '작게', right: '크게', min: 0.05, max: 0.6, step: 0.005, def: 0.25, format: percent, desc: '볼록/오목이 적용되는 범위예요. 점선 원이 얼굴을 감싸도록 맞춰 주세요.', get: () => c().r, set: set((v) => { c().r = v; }) })
  ]);
  const pct = (v) => `${v}%`;
  fill('#g-motion', [
    rangeField({ label: '좌우 회전 강도', left: '0', right: '200', min: 0, max: 200, def: 100, format: pct, get: () => rig().yaw, set: set((v) => { rig().yaw = v; }) }),
    rangeField({ label: '상하 회전 강도', left: '0', right: '200', min: 0, max: 200, def: 100, format: pct, get: () => rig().pitch, set: set((v) => { rig().pitch = v; }) }),
    rangeField({ label: '기울기 강도', left: '0', right: '200', min: 0, max: 200, def: 100, format: pct, get: () => rig().roll, set: set((v) => { rig().roll = v; }) }),
    rangeField({ label: '움직임 탄력 (뽀용함)', left: '차분', right: '통통', min: 0, max: 100, def: 50, desc: '고개가 멈출 때 살짝 지나쳤다 돌아오는 반동과, 빠르게 움직일 때 늘어나고 납작해지는 정도예요. 머리카락 흔들림과는 따로예요.', get: () => rig().bounce, set: set((v) => { rig().bounce = v; }) })
  ]);
  fill('#g-breath', [
    rangeField({ label: '호흡', left: '없음', right: '크게', min: 0, max: 100, def: 50, desc: '4초 주기로 몸이 살짝 부풀고 머리가 오르내려요. 흔들림 물리를 켠 레이어는 호흡을 따라 살짝 출렁여요.', get: () => rig().breath, set: set((v) => { rig().breath = v; }) })
  ]);
  $('#g-mouth-animate').checked = model.mouth.animate;
  $('#g-eye-squash').checked = model.eyes.squash;
  fill('#g-eyes', model.eyes.squash ? [
    rangeField({ label: '눈 높이', left: '위', right: '아래', min: 0, max: 1, step: 0.005, def: 0.4, format: percent, desc: '이 높이의 띠 안쪽만 눌려요. 눈 레이어를 고르면 미리보기에 초록 띠로 보이고, 끌어서 옮길 수 있어요.', get: () => model.eyes.y, set: set((v) => { model.eyes.y = v; }) }),
    rangeField({ label: '눈 영역 크기', left: '좁게', right: '넓게', min: 0.01, max: 0.2, step: 0.005, def: 0.05, format: percent, get: () => model.eyes.h, set: set((v) => { model.eyes.h = v; }) })
  ] : []);
}
$('#g-mouth-animate').addEventListener('change', (e) => {
  model.mouth.animate = e.target.checked;
  changed();
});
$('#g-eye-squash').addEventListener('change', (e) => {
  model.eyes.squash = e.target.checked;
  renderGlobal();
  changed();
});

// ───────── 미리보기 도구 ─────────
const exprEl = $('#expr');
for (let i = 0; i < 10; i++) {
  exprEl.append(h('button', {
    type: 'button',
    title: `${(i + 1) % 10}번 표정 미리보기`,
    onclick: () => {
      preview.expression = i;
      renderToolbar();
    }
  }, String((i + 1) % 10)));
}

let talkUntil = 0;
const blinker = new Blinker();
const wander = new Wander();

function renderToolbar() {
  for (const b of $('#mode').children) b.classList.toggle('on', b.dataset.mode === preview.mode);
  [...exprEl.children].forEach((b, i) => b.classList.toggle('on', i === preview.expression));
  $('#st-eyes').classList.toggle('on', preview.eyesClosed);
  $('#st-mouth').classList.toggle('on', preview.mouthOpen);
  $('#focus').checked = preview.focus;
}

$('#mode').addEventListener('click', (e) => {
  const m = e.target.closest('button')?.dataset.mode;
  if (!m) return;
  preview.mode = m;
  preview.target = { x: 0, y: 0 };
  if (m === 'auto') wander.reset(preview.target);
  renderToolbar();
});
$('#focus').addEventListener('change', (e) => { preview.focus = e.target.checked; });
$('#st-eyes').addEventListener('click', () => {
  preview.eyesClosed = !preview.eyesClosed;
  renderToolbar();
});
$('#st-blink').addEventListener('click', () => {
  preview.eyesClosed = false;
  blinker.trigger(performance.now());
  renderToolbar();
});
$('#st-mouth').addEventListener('click', () => {
  preview.mouthOpen = !preview.mouthOpen;
  renderToolbar();
});
$('#st-talk').addEventListener('click', () => {
  preview.mouthOpen = false;
  talkUntil = performance.now() + 2500;
  renderToolbar();
});

// ───────── 미리보기 겹침 표시 ─────────
const overlay = $('#overlay');
const clampv = (v, a, b) => Math.max(a, Math.min(b, v));
const CURSORS = { center: 'move', radius: 'nwse-resize', anchor: 'ns-resize', eyes: 'ns-resize', eyesSize: 'ns-resize' };

function eyeLayer() {
  const l = selected();
  return model.eyes.squash && l && (l.show === 'eyesOpen' || l.show === 'eyesClosed') ? l : null;
}
function hairLayer() {
  const l = selected();
  return l && l.hair.enabled && l.part !== 'body' ? l : null;
}
function local(e) {
  const r = overlay.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function hitTest(p) {
  if (!renderer) return null;
  const [rx, ry, rw, rh] = renderer.cssRect();
  const c = model.center;
  const d = Math.hypot(p.x - (rx + c.x * rw), p.y - (ry + c.y * rh));
  if (d < 14) return 'center';
  if (Math.abs(d - c.r * rw) < 8) return 'radius';
  const hl = hairLayer();
  if (hl && Math.abs(p.y - (ry + hl.hair.anchorY * rh)) < 8 && p.x > rx && p.x < rx + rw) return 'anchor';
  if (eyeLayer() && p.x > rx && p.x < rx + rw) {
    const ey = ry + model.eyes.y * rh;
    if (Math.abs(p.y - ey) < 8) return 'eyes';
    if (Math.abs(Math.abs(p.y - ey) - model.eyes.h * rh) < 6) return 'eyesSize';
  }
  return null;
}

overlay.addEventListener('pointerdown', (e) => {
  const hit = hitTest(local(e));
  if (!hit) return;
  preview.drag = hit;
  overlay.setPointerCapture(e.pointerId);
});
const endDrag = () => {
  if (preview.drag) {
    preview.drag = null;
    if (anchorField) anchorField.refresh();
  }
};
overlay.addEventListener('pointerup', endDrag);
overlay.addEventListener('pointercancel', endDrag);
overlay.addEventListener('pointerleave', () => {
  preview.hover = null;
  if (preview.mode === 'mouse') preview.target = { x: 0, y: 0 };
});
overlay.addEventListener('pointermove', (e) => {
  const p = local(e);
  if (preview.drag && renderer) {
    const [rx, ry, rw, rh] = renderer.cssRect();
    const fx = (p.x - rx) / rw;
    const fy = (p.y - ry) / rh;
    const q = (v) => Math.round(v * 200) / 200;
    const c = model.center;
    switch (preview.drag) {
      case 'center':
        c.x = q(clampv(fx, 0, 1));
        c.y = q(clampv(fy, 0, 1));
        break;
      case 'radius':
        c.r = q(clampv(Math.hypot(p.x - (rx + c.x * rw), p.y - (ry + c.y * rh)) / rw, 0.05, 0.6));
        break;
      case 'anchor': {
        const hl = hairLayer();
        if (hl) hl.hair.anchorY = Math.round(clampv(fy, 0, 1) * 100) / 100;
        anchorField?.refresh();
        break;
      }
      case 'eyes':
        model.eyes.y = q(clampv(fy, 0, 1));
        break;
      case 'eyesSize':
        model.eyes.h = q(clampv(Math.abs(fy - model.eyes.y), 0.01, 0.2));
        break;
    }
    for (const f of globalFields) f.refresh();
    changed();
    return;
  }
  preview.hover = hitTest(p);
  overlay.style.cursor = preview.hover ? CURSORS[preview.hover] : 'default';
  if (preview.mode === 'mouse' && renderer) {
    const [rx, ry, rw, rh] = renderer.cssRect();
    preview.target = pointerTarget(p.x, p.y, rx + model.center.x * rw, ry + model.center.y * rh, rw);
  }
});

function drawOverlay() {
  const ctx = overlay.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = overlay.clientWidth;
  const ht = overlay.clientHeight;
  if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(ht * dpr)) {
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(ht * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, ht);
  if (!renderer) return;
  const [rx, ry, rw, rh] = renderer.cssRect();
  const hot = (k) => preview.hover === k || preview.drag === k;
  ctx.font = '12px Pretendard, sans-serif';

  const hl = hairLayer();
  if (hl) {
    const ay = ry + hl.hair.anchorY * rh;
    const end = hl.hair.dir === 'up' ? ry : ry + rh;
    const g = ctx.createLinearGradient(0, ay, 0, end);
    g.addColorStop(0, 'rgba(255,107,138,0)');
    g.addColorStop(1, 'rgba(255,107,138,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, Math.min(ay, end), rw, Math.abs(end - ay));
    ctx.strokeStyle = '#ff6b8a';
    ctx.lineWidth = hot('anchor') ? 3 : 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(rx, ay);
    ctx.lineTo(rx + rw, ay);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff6b8a';
    ctx.fillText(`${hl.hair.dir === 'up' ? '장식' : '머리카락'} 고정선 (${hl.name})`, rx + 6, hl.hair.dir === 'up' ? ay + 16 : ay - 6);
  }
  if (eyeLayer()) {
    const ey = ry + model.eyes.y * rh;
    const eh = model.eyes.h * rh;
    ctx.fillStyle = 'rgba(46, 204, 113, 0.08)';
    ctx.fillRect(rx, ey - eh, rw, eh * 2);
    ctx.strokeStyle = '#2ecc71';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = hot('eyesSize') ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, ey - eh);
    ctx.lineTo(rx + rw, ey - eh);
    ctx.moveTo(rx, ey + eh);
    ctx.lineTo(rx + rw, ey + eh);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = hot('eyes') ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(rx, ey);
    ctx.lineTo(rx + rw, ey);
    ctx.stroke();
    ctx.fillStyle = '#27ae60';
    ctx.fillText('눈 깜빡임 영역 (이 띠 안쪽만 눌려요)', rx + 6, ey - eh - 6);
  }
  const c = model.center;
  const cx = rx + c.x * rw;
  const cy = ry + c.y * rh;
  ctx.strokeStyle = '#3fb5ee';
  ctx.lineWidth = hot('radius') ? 2.5 : 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, c.r * rw, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = hot('center') ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx, cy + 12);
  ctx.stroke();
  ctx.fillStyle = '#3fb5ee';
  ctx.fillText('얼굴 중심', cx + 10, cy - 8);
}

// ───────── 그리기 루프 ─────────
let renderer = null;
try {
  renderer = createRenderer($('#stage'), {
    layout: 'center',
    onImageError: (layer) => {
      if (imageErrors.has(layer.id)) return;
      imageErrors.add(layer.id);
      renderList();
      if (layer.id === selectedId) renderProps();
    }
  });
} catch (err) {
  console.error(err);
}
if (!renderer) $('#nogl').hidden = false;

const head = new HeadSpring();
const hairSys = new HairSystem();
const mouth = new MouthAnim();
const strength = rigStrength();
let last = performance.now();

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (preview.mode === 'auto') preview.target = wander.update(now);
  const target = preview.drag || preview.mode === 'still' ? { x: 0, y: 0 } : preview.target;
  head.update(dt, headTarget(target.x, target.y, model.rig, strength), model.rig.bounce);
  const hs = head.state;
  const breath = breathAt(now / 1000, model.rig.breath, model.center);
  renderer?.render({
    center: model.center,
    head: hs,
    squash: head.squash,
    breath,
    expression: preview.expression,
    eyesClosed: preview.eyesClosed,
    blink: preview.eyesClosed ? 1 : blinker.update(now, false),
    pop: popScale(blinker, now),
    eyes: model.eyes,
    ...mouthState(mouth, dt, preview.mouthOpen || (now < talkUntil && now % 400 >= 200), model.mouth.animate),
    hair: hairSys.update(dt, model.layers, hs, now / 1000, breath.hairLag),
    focusId: preview.focus ? selectedId : null
  });
  drawOverlay();
  requestAnimationFrame(frame);
}

// ───────── 헤더 ─────────
const guide = $('#guide');
const guideDone = () => {
  try {
    return !!localStorage.getItem('ftGuideDone');
  } catch {
    return false;
  }
};
function closeGuide() {
  guide.hidden = true;
  try {
    localStorage.setItem('ftGuideDone', '1');
  } catch {
    // 저장 못 해도 지금은 닫힌다
  }
}
$('#guide-close').addEventListener('click', closeGuide);
$('#btn-guide').addEventListener('click', () => {
  if (!guide.hidden) return closeGuide();
  guide.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#btn-export').addEventListener('click', async () => {
  try {
    const json = await exportBackup(model);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'feathertalk-backup.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    console.error(err);
    alert('백업 파일을 만들지 못했어요.');
  }
});

$('#btn-import').addEventListener('click', () => $('#import-input').click());
$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !confirm('지금 설정을 백업 파일 내용으로 바꿀까요?')) return;
  try {
    replaceModel(await importBackup(await file.text()));
  } catch (err) {
    console.error(err);
    alert('백업 파일을 읽지 못했어요.');
  }
});

$('#btn-reset').addEventListener('click', () => {
  if (confirm('assets 폴더의 기본 캐릭터로 되돌릴까요?\n지금 레이어 설정과 업로드한 파일이 모두 지워져요. 필요하면 먼저 "백업 내보내기"를 해 두세요.')) {
    replaceModel(defaultCharacter());
  }
});

// ───────── 시작 ─────────
fillIcons();
guide.hidden = guideDone();
if (selected()) ensureVisible(selected());
renderToolbar();
renderList();
renderProps();
renderGlobal();
renderer?.setLayers(model.layers, resolveSrc);
requestAnimationFrame(frame);
registerServiceWorker();
