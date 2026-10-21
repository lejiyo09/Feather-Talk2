// 레이어 목록: 썸네일·배지, 보이기/앞으로/뒤로/삭제, 끌어서 순서 변경, 추가 메뉴, 복제
import { PRESETS, SHOW_OPTIONS, resolveSrc } from '../model.js';
import { h, iconEl } from '../ui.js';

const SHOW_LABEL = Object.fromEntries(SHOW_OPTIONS);

export function layerThumb(layer, cls) {
  const img = h('img', { class: cls, alt: '', src: '/assets/transparent.png' });
  resolveSrc(layer).then((url) => {
    if (url) img.src = url;
  });
  return img;
}

export function mountLayerList(store) {
  const beta = store.beta;
  const p = store.preview;
  const list = h('ul', { class: 'layers' });
  const badge = beta ? h('span', { class: 'slot-badge', title: "지금 편집 중인 캐릭터예요. 미리보기 아래 '캐릭터' 탭에서 바꿔요." }) : null;
  const dupBtn = h('button', { type: 'button', class: 'primary secondary', onclick: () => store.duplicateSelected() }, iconEl('copy', 15), ' 복제 ');
  const addMenu = h('div', { class: 'add-menu', hidden: true });
  for (const [kind, preset] of Object.entries(PRESETS)) {
    addMenu.append(h('button', {
      type: 'button',
      onclick: () => {
        store.addLayer(kind);
        addMenu.hidden = true;
      }
    }, preset.label));
  }
  const addBtn = h('button', { type: 'button', class: 'primary', onclick: () => { addMenu.hidden = !addMenu.hidden; } }, iconEl('plus', 16), ' 레이어 추가');
  const root = h('section', { class: 'panel' },
    h('h3', {}, badge, ' 레이어 ', h('small', {}, '위에 있을수록 앞에 그려져요 · 끌어서 순서 변경')),
    list,
    h('div', { class: 'actions' }, addBtn, dupBtn),
    addMenu);

  function badges(layer) {
    const out = [];
    if (store.imageErrors.has(layer.id)) out.push(['이미지 오류', 'err']);
    else if (!layer.src.value) out.push(['이미지 없음', '']);
    if (layer.clip) out.push(['클리핑', 'clip']);
    if (layer.part === 'body') out.push([p.layerBones[layer.id] || '몸', p.layerBones[layer.id] ? 'bone' : '']);
    if (layer.part === 'fixed') out.push(['고정', '']);
    if (layer.show !== 'always') out.push([SHOW_LABEL[layer.show], '']);
    if (layer.hair.enabled && (layer.part !== 'body' || beta)) out.push([beta ? '물리' : layer.hair.dir === 'up' ? '장식 물리' : '머리카락', 'hair']);
    return out;
  }

  let dragId = null;
  let overId = null;
  function render() {
    if (badge) badge.textContent = `${(store.activeSlot + 1) % 10}번 캐릭터`;
    list.textContent = '';
    const layers = store.model.layers;
    layers.forEach((layer, i) => {
      const cls = [layer.id === store.selectedId && 'selected', !layer.visible && 'hidden-layer', layer.clip && 'clipped'].filter(Boolean).join(' ');
      const li = h('li', {
        draggable: 'true',
        class: cls,
        onclick: () => store.selectLayer(layer.id),
        ondragstart: () => { dragId = layer.id; },
        ondragover: (e) => {
          e.preventDefault();
          if (overId === layer.id) return;
          overId = layer.id;
          for (const el of list.children) el.classList.toggle('drag-over', el.dataset.id === overId && overId !== dragId);
        },
        ondrop: (e) => {
          e.preventDefault();
          const from = layers.findIndex((l) => l.id === dragId);
          let to = layers.findIndex((l) => l.id === layer.id);
          dragId = overId = null;
          if (from < 0) return render();
          if (from < to) to--;
          store.moveLayer(from, to);
        },
        ondragend: () => {
          dragId = overId = null;
          for (const el of list.children) el.classList.remove('drag-over');
        }
      });
      li.dataset.id = layer.id;
      const name = h('span', { class: 'name' }, `${layer.name || '(이름 없음)'} `);
      for (const [text, c] of badges(layer)) name.append(h('span', { class: `badge ${c}` }, c === 'err' ? iconEl('triangle-alert', 11) : null, text));
      const btn = (title, ic, fn) => h('button', {
        type: 'button',
        class: 'icon',
        title,
        'aria-label': title,
        onclick: (e) => {
          e.stopPropagation();
          fn();
        }
      }, iconEl(ic, 17));
      li.append(...[
        iconEl('grip-vertical', 16, 'grip'),
        layer.clip ? iconEl('corner-left-down', 15, 'clip-mark') : null,
        layerThumb(layer, 'thumb'),
        name,
        btn(layer.visible ? '숨기기' : '보이기', layer.visible ? 'eye' : 'eye-off', () => {
          layer.visible = !layer.visible;
          store.changed('layers');
        }),
        btn('한 칸 앞으로', 'chevron-up', () => store.moveLayer(i, i - 1)),
        btn('한 칸 뒤로', 'chevron-down', () => store.moveLayer(i, i + 1)),
        btn('삭제', 'trash', () => {
          if (confirm(`'${layer.name}' 레이어를 지울까요?`)) store.removeLayer(layer.id);
        })
      ].filter(Boolean));
      list.append(li);
    });
    const l = store.selected();
    dupBtn.disabled = !l;
    dupBtn.title = l ? `'${l.name}' 레이어를 이미지·설정까지 그대로 복제해요` : '복제할 레이어를 먼저 골라 주세요';
  }

  const off = store.on((tags) => {
    if (tags.has('layers') || tags.has('all') || tags.has('selection')) render();
  });
  render();
  root.destroy = off;
  return root;
}
