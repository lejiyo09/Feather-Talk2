// 멀티 설정 화면 (베타): 무대·감지 탭과 캐릭터 만들기 탭
import { createStore } from './store.js';
import { mountWorkspace } from './workspace/index.js';
import { DETECT_MODES, TalkDetector, loadSettings, saveSettings, makeObject, mountStage } from './multi-core.js';
import { h, iconEl, infoTip, rangeField } from './ui.js';
import { storage as ls } from './page.js';
import { registerServiceWorker } from './pwa.js';

const store = createStore(true); // 베타 캐릭터 슬롯을 같이 쓴다
const settings = loadSettings();
let page = ls.get('ftMultiPage') === 'make' ? 'make' : 'stage';

let saveTimer = 0;
const changed = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(settings), 300);
};
window.addEventListener('pagehide', () => saveSettings(settings));

// ───────── 화면 캡처 · 감지 ─────────
const detector = new TalkDetector();
let capturing = false;
const talking = Array(10).fill(false);
const scores = Array(10).fill(0);
let arming = 'none'; // 'none' | 'crop' | 'pick' | 캐릭터 번호
const box = { active: false, sx: 0, sy: 0, x: 0, y: 0, w: 0, h: 0 };
const preview = h('canvas', { class: 'preview' });
const modeTip = h('p', { class: 'mode-tip' });
const previewWrap = h('div', { class: 'preview-wrap', hidden: true }, preview, modeTip);

detector.onStop = () => {
  capturing = false;
  arming = 'none';
  talking.fill(false);
  scores.fill(0);
  renderCapture();
  renderChars();
  stage.place();
};
detector.onFrame = () => {
  let flip = false;
  for (let i = 0; i < 10; i++) {
    if (talking[i] !== detector.talking[i]) flip = true;
    talking[i] = detector.talking[i];
    scores[i] = detector.scores[i];
  }
  drawPreview();
  updateMeters();
  if (flip) stage.place();
};

async function toggleCapture() {
  if (detector.running) {
    detector.stop();
    return;
  }
  try {
    await detector.start();
  } catch (err) {
    alert(`화면 캡처를 시작하지 못했어요: ${err?.message || err}`);
    return;
  }
  capturing = true;
  detector.run(() => settings, () => arming === 'crop', () => page === 'make');
  renderCapture();
  renderChars();
}

// 캡처 화면 + 감지 영역 표시
function drawPreview() {
  const src = detector.canvas;
  if (!src.width) return;
  if (preview.width !== src.width || preview.height !== src.height) {
    preview.width = src.width;
    preview.height = src.height;
  }
  const ctx = preview.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const w = preview.width;
  const ht = preview.height;
  const lw = Math.max(2, w / 400);
  ctx.lineWidth = lw;
  ctx.font = `${Math.max(12, w / 60)}px sans-serif`;
  if (arming !== 'crop') {
    settings.chars.forEach((c, i) => {
      if (!c.on || !c.region) return;
      const r = c.region;
      ctx.strokeStyle = arming === i ? '#3b6dd8' : talking[i] ? '#2ecc71' : '#999';
      ctx.strokeRect(r.x * w, r.y * ht, r.w * w, r.h * ht);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(`${(i + 1) % 10}번`, r.x * w + 2, Math.max(14, r.y * ht - 4));
    });
  }
  if (box.active) {
    ctx.strokeStyle = arming === 'crop' ? '#e8a33b' : '#3b6dd8';
    ctx.setLineDash([lw * 3, lw * 2]);
    ctx.strokeRect(box.x * w, box.y * ht, box.w * w, box.h * ht);
    ctx.setLineDash([]);
  }
}

const rel = (e) => {
  const r = preview.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
};
preview.addEventListener('pointerdown', (e) => {
  if (arming === 'pick') {
    const p = rel(e);
    const d = preview.getContext('2d').getImageData(Math.floor(p.x * (preview.width - 1)), Math.floor(p.y * (preview.height - 1)), 1, 1).data;
    settings.detect.color = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    arming = 'none';
    changed();
    renderCapture();
    return;
  }
  if (arming === 'none') return;
  const p = rel(e);
  Object.assign(box, { active: true, sx: p.x, sy: p.y, x: p.x, y: p.y, w: 0, h: 0 });
  preview.setPointerCapture(e.pointerId);
});
preview.addEventListener('pointermove', (e) => {
  if (!box.active) return;
  const p = rel(e);
  Object.assign(box, { x: Math.min(box.sx, p.x), y: Math.min(box.sy, p.y), w: Math.abs(p.x - box.sx), h: Math.abs(p.y - box.sy) });
});
preview.addEventListener('pointerup', () => {
  if (!box.active) return;
  box.active = false;
  const r = { x: box.x, y: box.y, w: box.w, h: box.h };
  if (arming === 'crop') {
    if (r.w > 0.02 && r.h > 0.02) {
      settings.crop = r;
      settings.chars.forEach((c) => { c.region = null; });
    }
  } else if (typeof arming === 'number' && r.w > 0.003 && r.h > 0.003) {
    settings.chars[arming].region = r;
  }
  arming = 'none';
  changed();
  renderCapture();
  renderChars();
});

// ───────── 패널: 1. 화면 캡처 ─────────
const capturePanel = h('section', { class: 'panel' });
function renderCapture() {
  const d = settings.detect;
  previewWrap.hidden = !capturing;
  previewWrap.classList.toggle('arming', arming !== 'none');
  modeTip.textContent = arming === 'crop'
    ? '남길 부분을 드래그하세요 (사이드바 등을 빼고 확대하면 영역 지정이 쉬워요)'
    : arming === 'pick' ? '기준으로 삼을 색을 누르세요'
      : typeof arming === 'number' ? `${(arming + 1) % 10}번 캐릭터의 레벨미터·테두리 부분을 드래그하세요` : '';
  modeTip.hidden = !modeTip.textContent;
  const marginText = d.mode === 'syncroom'
    ? { label: '초록 판정 여유값', left: '느슨', right: '엄격', desc: '높을수록 뚜렷한 초록만 인정해요. 연한 초록·노란빛까지 잡히면 높이세요.' }
    : { label: '색 허용 범위', left: '좁게', right: '넓게', desc: '기준 색과 얼마나 다른 색까지 인정할지예요. 테두리가 잘 안 잡히면 넓히세요.' };
  const colorInput = h('input', { type: 'color' });
  colorInput.value = d.color;
  colorInput.addEventListener('input', () => {
    d.color = colorInput.value;
    changed();
  });
  capturePanel.replaceChildren(...[
    h('h3', {}, '1. 화면 캡처 ', infoTip('SYNCROOM이나 Discord 창을 공유하세요. 캐릭터마다 레벨미터나 말하는 테두리 부분을 감지 영역으로 지정하면, 그 영역에 색이 보일 때 말하는 걸로 봐요.')),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary inline', onclick: toggleCapture }, iconEl('monitor-up', 16), ` ${capturing ? '화면 캡처 중지' : '화면 캡처 시작'}`),
      h('span', { class: `status${capturing ? ' live' : ''}` }, capturing ? '캡처 중' : '캡처 안 함')),
    previewWrap,
    capturing ? h('div', { class: 'row' },
      h('button', {
        type: 'button',
        class: 'plain',
        onclick: () => {
          if (settings.chars.some((c) => c.region) && !confirm('자르기를 다시 지정하면 캐릭터 감지 영역도 다시 지정해야 해요. 계속할까요?')) return;
          arming = 'crop';
          renderCapture();
        }
      }, iconEl('crop', 14), ` ${settings.crop ? '자르기 다시 지정' : '자르기 영역 지정'}`),
      settings.crop ? h('button', {
        type: 'button',
        class: 'plain',
        onclick: () => {
          if (settings.chars.some((c) => c.region) && !confirm('자르기를 없애면 캐릭터 감지 영역도 다시 지정해야 해요. 계속할까요?')) return;
          settings.crop = null;
          settings.chars.forEach((c) => { c.region = null; });
          changed();
          renderCapture();
          renderChars();
        }
      }, '자르기 없애기') : null) : null,
    h('h4', {}, '감지 방식'),
    h('div', { class: 'seg wrap' }, Object.entries(DETECT_MODES).map(([key, m]) => h('button', {
      type: 'button',
      class: d.mode === key ? 'on' : '',
      onclick: () => {
        Object.assign(d, { mode: key, activity: m.activity, margin: m.margin, color: m.color });
        changed();
        renderCapture();
      }
    }, m.label))),
    d.mode === 'syncroom' ? null : h('div', { class: 'row color-row' }, h('span', { class: 'mini' }, '기준 색'), colorInput,
      h('button', { type: 'button', class: 'plain', disabled: !capturing, onclick: () => { arming = 'pick'; renderCapture(); } }, iconEl('pipette', 14), ' 화면에서 고르기')),
    rangeField(true, { label: '말하는 중 판정 픽셀 수', left: '민감', right: '둔감', min: 1, max: 200, def: () => DETECT_MODES[d.mode].activity, format: (v) => `${v}px`, desc: "영역 안에서 이만큼 넘는 픽셀이 '말하는 색'이면 말하는 걸로 봐요. 레벨미터가 얇으면 낮추세요.", get: () => d.activity, set: (v) => { d.activity = v; changed(); } }),
    rangeField(true, { ...marginText, min: 5, max: 150, step: 5, def: () => DETECT_MODES[d.mode].margin, get: () => d.margin, set: (v) => { d.margin = v; changed(); } }),
    rangeField(true, { label: '유지 시간', left: '짧게', right: '길게', min: 50, max: 1500, step: 50, def: 350, format: (v) => `${v}ms`, desc: '짧게 끊겨도 입이 바로 닫히지 않게 이만큼 유지해요.', get: () => d.hold, set: (v) => { d.hold = v; changed(); } })
  ].filter(Boolean));
}

// ───────── 패널: 2. 캐릭터 ─────────
const charsPanel = h('section', { class: 'panel' });
const meters = [];
function renderChars() {
  meters.length = 0;
  const list = h('ul', { class: 'chars' });
  settings.chars.forEach((c, i) => {
    const on = h('input', { type: 'checkbox' });
    on.checked = c.on;
    on.addEventListener('change', () => {
      c.on = on.checked;
      changed();
      renderChars();
      renderOrder();
      stage.rebuild();
    });
    const li = h('li', { class: c.on ? '' : 'off' },
      h('label', { class: 'check' }, on, ' ', h('b', {}, `${(i + 1) % 10}번`)),
      h('span', { class: 'layers' }, `레이어 ${store.slots[i]?.layers.length || 0}개`));
    if (c.on) {
      const bar = h('span');
      const meter = h('span', { class: 'meter' }, bar);
      meters[i] = { meter, bar };
      const motion = h('input', { type: 'checkbox' });
      motion.checked = c.motion;
      motion.addEventListener('change', () => {
        c.motion = motion.checked;
        changed();
      });
      li.append(...[
        h('button', {
          type: 'button',
          class: `plain small${arming === i ? ' arming' : ''}`,
          disabled: !capturing,
          title: capturing ? '' : '먼저 화면 캡처를 시작하세요',
          onclick: () => {
            arming = arming === i ? 'none' : i;
            renderCapture();
            renderChars();
          }
        }, c.region ? '영역 다시 지정' : '영역 지정'),
        meter,
        h('label', { class: 'check', title: '끄면 정면을 보고 가만히 있어요 (깜빡임·호흡·입은 그대로)' }, motion, ' 움직임'),
        c.region ? null : h('span', { class: 'warn' }, '영역 필요')
      ].filter(Boolean));
    }
    list.append(li);
  });
  charsPanel.replaceChildren(
    h('h3', {}, '2. 캐릭터 ', infoTip("1~0번 캐릭터는 위쪽 '캐릭터 만들기' 탭(베타 편집기와 같은 캐릭터)에서 만들어요. 무대에 올릴 캐릭터를 켜고, 감지 영역을 지정하세요.")),
    list);
  updateMeters();
}
function updateMeters() {
  meters.forEach((m, i) => {
    if (!m) return;
    m.meter.title = `${Math.round(scores[i])}px`;
    m.bar.style.width = `${Math.min(100, (scores[i] / Math.max(1, settings.detect.activity)) * 50)}%`;
    m.bar.classList.toggle('on', talking[i]);
  });
}

// ───────── 패널: 3. 오브젝트, 4. 배경, 레이어 순서 ─────────
const objPanel = h('section', { class: 'panel' });
const objInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
objInput.addEventListener('change', async () => {
  const f = objInput.files?.[0];
  objInput.value = '';
  if (!f || !f.type.startsWith('image/')) return;
  try {
    const o = await makeObject(f, f.name.replace(/\.[^.]+$/, ''));
    settings.objects.push(o);
    settings.order.push(`o:${o.id}`);
    saveSettings(settings);
    renderObjects();
    renderOrder();
    stage.rebuild();
  } catch (err) {
    console.error(err);
    alert('이미지를 이 브라우저에 저장하지 못했어요.');
  }
});
function renderObjects() {
  objPanel.replaceChildren(
    h('h3', {}, '3. 오브젝트 ', infoTip('말에 반응하지 않는 고정 이미지예요 (배경, 악기, 로고 등). 무대에서 끌어서 옮겨요.')),
    h('ul', { class: 'objs' }, settings.objects.map((o) => {
      const name = h('input', { type: 'text', placeholder: '이름' });
      name.value = o.name;
      name.addEventListener('input', () => {
        o.name = name.value;
        changed();
        renderOrder();
        stage.rebuild();
      });
      return h('li', {}, name, h('button', {
        type: 'button',
        class: 'icon',
        title: '삭제',
        onclick: () => {
          if (!confirm('이 오브젝트를 지울까요?')) return;
          settings.objects = settings.objects.filter((x) => x.id !== o.id);
          settings.order = settings.order.filter((k) => k !== `o:${o.id}`);
          changed();
          renderObjects();
          renderOrder();
          stage.rebuild();
        }
      }, iconEl('trash', 16)));
    })),
    h('button', { type: 'button', class: 'plain', onclick: () => objInput.click() }, '+ 오브젝트 추가'),
    objInput);
}

const bgInput = h('input', { type: 'color' });
bgInput.value = settings.background;
bgInput.addEventListener('input', () => {
  settings.background = bgInput.value;
  changed();
  stage.place();
});
const bgPanel = h('section', { class: 'panel' }, h('h3', {}, '4. 배경'),
  h('div', { class: 'row color-row' }, h('span', { class: 'mini' }, '배경색'), bgInput, h('span', { class: 'tip' }, 'OBS에서 크로마키로 지울 색이에요. 보통 초록(#00ff00)을 써요.')));

const orderList = h('ul', { class: 'order' });
function renderOrder() {
  const nameOf = (k) => (k.startsWith('c') ? `${(+k.slice(1) + 1) % 10}번 캐릭터` : settings.objects.find((o) => `o:${o.id}` === k)?.name || '오브젝트');
  const swap = (k, d) => {
    const o = settings.order;
    const i = o.indexOf(k);
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    changed();
    renderOrder();
    stage.place();
  };
  orderList.replaceChildren(...[...settings.order].reverse()
    .filter((k) => !k.startsWith('c') || settings.chars[+k.slice(1)].on)
    .map((k) => h('li', {}, h('span', {}, nameOf(k)),
      h('button', { type: 'button', class: 'icon', title: '앞으로', onclick: () => swap(k, 1) }, iconEl('chevron-up', 16)),
      h('button', { type: 'button', class: 'icon', title: '뒤로', onclick: () => swap(k, -1) }, iconEl('chevron-down', 16)))));
}

// ───────── 화면 조립 ─────────
const stage = mountStage({
  settings: () => settings,
  models: () => store.slots,
  talking: () => talking,
  editable: true,
  paused: () => page === 'make',
  onChange: changed
});
store.on((tags) => {
  if (tags.has('all')) {
    renderChars();
    stage.refreshModels();
  }
});

const grid = h('div', { class: 'multi-grid' },
  h('div', { class: 'left' },
    h('section', { class: 'panel' }, h('h3', {}, '무대 ', infoTip('캐릭터와 오브젝트를 끌어서 옮기고, 오른쪽 아래 파란 점을 끌어 크기를 바꿔요. 말하는 캐릭터는 초록 테두리로 보여요.')), stage),
    h('section', { class: 'panel' }, h('h3', {}, '레이어 순서 ', h('small', {}, '위에 있을수록 앞에 그려져요')), orderList)),
  h('div', { class: 'right' }, capturePanel, charsPanel, objPanel, bgPanel));

const makeSlot = h('div');
let workspace = null;
const tabs = h('nav', { class: 'page-tabs', role: 'tablist' });
const tabBtn = (key, ic, label) => h('button', { type: 'button', role: 'tab', onclick: () => showPage(key) }, iconEl(ic, 16), ` ${label}`);
tabs.append(tabBtn('stage', 'users', '무대 · 감지'), tabBtn('make', 'user-pen', '캐릭터 만들기'));

function showPage(p) {
  page = p;
  ls.set('ftMultiPage', p);
  [...tabs.children].forEach((b, i) => {
    const on = (i === 0 ? 'stage' : 'make') === p;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  grid.hidden = p !== 'stage';
  if (p === 'make') {
    workspace = mountWorkspace(store, { tab: 'layers' });
    makeSlot.replaceChildren(workspace);
  } else {
    workspace?.destroy();
    workspace = null;
    makeSlot.replaceChildren();
    renderChars();
    stage.rebuild();
    stage.refreshModels();
  }
}

document.getElementById('app').replaceChildren(
  h('header', { class: 'navbar' },
    h('h2', { class: 'logo' }, 'Feather-Talk 멀티 ', h('span', { class: 'beta-badge' }, 'BETA')),
    h('div', { class: 'nav-actions' }, h('a', { class: 'button', href: '/multi/live.html' }, '라이브 시작 ', iconEl('play', 14)))),
  h('main', { class: 'wrapper multi' }, tabs, makeSlot, grid));

renderCapture();
renderChars();
renderObjects();
renderOrder();
showPage(page);
window.addEventListener('pagehide', () => detector.stop());
registerServiceWorker();
