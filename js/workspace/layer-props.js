// 고른 레이어의 속성: 이미지, 보이는 때, 입체감, 흔들림 물리, 눈동자 옵션
import { SHOW_OPTIONS } from '../model.js';
import { h, svg, group, hint, rangeField, signed, percent } from '../ui.js';
import { layerThumb } from './layer-list.js';

const SHOW_LABEL = Object.fromEntries(SHOW_OPTIONS);
const PART_LABEL = { head: '머리', body: '몸', fixed: '고정' };

export function mountLayerProps(store) {
  const beta = store.beta;
  const root = h('section', { class: 'panel' });
  let anchorField = null;
  let urlTimer = 0;
  let groups = [];

  function render() {
    // 다시 그려도 입력 중이던 칸의 포커스를 지킨다
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.dataset.key : null;
    const sel = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

    root.textContent = '';
    groups = [];
    anchorField = null;
    const l = store.selected();
    if (!l) {
      root.append(h('p', { class: 'tip' }, '위 목록에서 레이어를 골라 주세요.'));
      return;
    }
    const edit = (fn, ...tags) => {
      fn();
      store.changed(...tags);
      for (const g of groups) g.refresh();
    };
    const G = (opts, ...children) => {
      const g = group(beta, opts, ...children);
      groups.push(g);
      return g;
    };

    const nameInput = h('input', { type: 'text', class: 'layer-name', placeholder: '레이어 이름', 'data-key': 'name' });
    nameInput.value = l.name;
    nameInput.addEventListener('input', () => edit(() => { l.name = nameInput.value; }, 'layers'));

    // 이미지
    const dropImg = layerThumb(l, '');
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
        store.uploadFile(e.dataTransfer?.files[0]);
      }
    }, dropImg, h('span', {}, '파일을 끌어다 놓기'));
    dropImg.addEventListener('load', () => drop.classList.toggle('has-image', !dropImg.src.endsWith('/assets/transparent.png')));
    dropImg.addEventListener('error', () => drop.classList.remove('has-image'));
    const urlInput = h('input', { type: 'text', placeholder: '이미지 주소 (https://...)', 'data-key': 'url' });
    urlInput.value = l.src.type === 'url' ? l.src.value : '';
    urlInput.addEventListener('input', () => {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(() => {
        const v = urlInput.value.trim();
        store.setSource(l, { type: 'url', value: v });
        dropImg.src = v || '/assets/transparent.png';
        for (const g of groups) g.refresh();
      }, 500);
    });
    const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
    fileInput.addEventListener('change', () => {
      store.uploadFile(fileInput.files?.[0]);
      fileInput.value = '';
    });
    const imageSummary = () => {
      if (!l.src.value) return '이미지 없음';
      if (l.src.type === 'file') return '업로드한 파일';
      return l.src.value.split('/').pop().slice(0, 30);
    };

    // 보이는 때
    const select = h('select', { 'aria-label': '언제 보일까요?' }, SHOW_OPTIONS.map(([v, t]) => h('option', { value: v }, t)));
    select.value = l.show;
    select.addEventListener('change', () => edit(() => {
      l.show = select.value;
      store.ensureVisible(l);
    }, 'layers'));
    const partBtn = (part, label, title) => h('button', {
      type: 'button',
      class: l.part === part ? 'on' : '',
      title,
      onclick: () => {
        l.part = part;
        store.changed('layers', 'body');
        render();
      }
    }, label);
    const partSeg = h('div', { class: 'seg' },
      partBtn('head', '머리', '고개를 따라 돌아가요'),
      partBtn('body', '몸', '고개를 돌려도 그대로 있어요 (기울기만 따라가요)'),
      beta ? partBtn('fixed', '고정', '어떤 움직임도 따라가지 않아요 (앞에 두는 드럼·피아노 같은 악기 등)') : null);
    const allOn = l.expressions.every(Boolean);
    const showSummary = () => `${SHOW_LABEL[l.show]} · ${PART_LABEL[l.part]}${beta ? '' : ` · 표정 ${l.expressions.filter(Boolean).length === 10 ? '전체' : `${l.expressions.filter(Boolean).length}개`}`}`;

    // 입체감
    const curvePath = svg('path');
    const curveIcon = svg('svg', { class: 'curve-icon', viewBox: '0 0 40 20', width: '40', height: '20' });
    curveIcon.append(curvePath);
    const drawCurve = () => curvePath.setAttribute('d', `M2 10 Q20 ${(10 - (l.curve / 100) * 8) * 2 - 10} 38 10`);
    drawCurve();

    // 흔들림
    const hairToggle = h('input', { type: 'checkbox' });
    hairToggle.checked = l.hair.enabled;
    hairToggle.addEventListener('change', () => {
      l.hair.enabled = hairToggle.checked;
      store.changed('layers');
      render();
    });
    const hr = l.hair;
    const hairFields = [];
    if (hr.enabled) {
      const dirBtn = (dir, label, title) => h('button', {
        type: 'button',
        class: hr.dir === dir ? 'on' : '',
        title,
        onclick: () => {
          hr.dir = dir;
          store.changed('layers');
          render();
        }
      }, label);
      anchorField = rangeField(beta, {
        label: '고정선 높이', left: '위', right: '아래', min: 0, max: 1, step: 0.01, def: 0.25, format: percent,
        desc: hr.dir === 'up'
          ? '이 선보다 아래는 고정되고, 위로 갈수록 많이 흔들려요. 리본이 머리에 붙은 높이에 둬요. 미리보기의 분홍 점선을 끌어도 돼요.'
          : '이 선보다 위는 고정되고, 아래로 갈수록 많이 흔들려요. 보통 정수리나 가르마 높이에 둬요. 미리보기의 분홍 점선을 끌어도 돼요.',
        get: () => hr.anchorY,
        set: (v) => edit(() => { hr.anchorY = v; })
      });
      hairFields.push(h('div', { class: 'hair-fields' },
        h('div', { class: 'row dir-row' }, h('span', { class: 'dir-label' }, '흔들리는 쪽'),
          h('div', { class: 'seg' },
            dirBtn('down', '고정선 아래 (머리카락)', '머리카락처럼 고정선 아래로 늘어진 것'),
            dirBtn('up', '고정선 위 (리본·장식)', '리본·머리장식처럼 고정선 위로 솟은 것'))),
        anchorField,
        rangeField(beta, { label: '흔들림 세기', left: '약하게', right: '세게', min: 0, max: 100, def: 50, get: () => hr.sway, set: (v) => edit(() => { hr.sway = v; }) }),
        rangeField(beta, { label: '탄성', left: '느슨', right: '탱탱', min: 0, max: 100, def: 50, desc: '높을수록 빨리 제자리로 돌아와요. 짧은 머리는 높게, 긴 머리는 낮게.', get: () => hr.stiffness, set: (v) => edit(() => { hr.stiffness = v; }) }),
        rangeField(beta, { label: '출렁임', left: '차분', right: '통통', min: 0, max: 100, def: 50, desc: '높을수록 멈춘 뒤에도 여러 번 흔들려요.', get: () => hr.bounce, set: (v) => edit(() => { hr.bounce = v; }) })));
    }

    const clip = h('input', { type: 'checkbox' });
    clip.checked = l.clip;
    clip.addEventListener('change', () => edit(() => { l.clip = clip.checked; }, 'layers'));
    const pop = h('input', { type: 'checkbox' });
    pop.checked = l.pop;
    pop.addEventListener('change', () => edit(() => { l.pop = pop.checked; }));

    root.append(h('div', {},
      h('div', { class: 'layer-head' }, beta ? layerThumb(l, 'head-thumb') : null, nameInput),
      G({ id: 'image', title: '이미지', open: true, summary: imageSummary },
        h('div', { class: 'image-box' },
          drop,
          h('div', { class: 'image-inputs' },
            urlInput,
            h('div', {}, h('button', { type: 'button', class: 'plain', onclick: () => fileInput.click() }, '내 PC에서 파일 선택'), fileInput),
            l.src.type === 'file' ? h('p', { class: 'desc' }, ' 업로드한 파일을 쓰고 있어요 (이 브라우저에만 저장돼요). 주소를 입력하면 주소로 바뀌어요. ') : null,
            store.imageErrors.has(l.id)
              ? h('p', { class: 'error' }, ' 이미지를 불러오지 못했어요. 주소가 맞는지 확인해 주세요. 주소가 맞다면 그 사이트가 외부 사용(CORS)을 막아 둔 것일 수 있어요. 그럴 땐 이미지를 내려받아 ', h('b', {}, '파일 선택'), '으로 올려 주세요. ')
              : null))),
      G({ id: 'show', title: beta ? '보이는 때' : '언제 보일까요?', summary: showSummary },
        h('div', { class: 'row' }, select, partSeg),
        beta ? null : h('div', { class: 'label-row' }, h('span', { class: 'mini-label' }, '표정'),
          hint(beta, "표정 번호(숫자키)마다 보일지 골라요. 예를 들어 '웃는 눈' 레이어를 2번에서만 켜 두면, 라이브 중 2를 누를 때만 나타나요.")),
        beta ? null : h('div', { class: 'chips' },
          l.expressions.map((on, i) => h('button', {
            type: 'button',
            class: on ? 'on' : '',
            title: `${(i + 1) % 10}번 표정에서 보이기`,
            'aria-pressed': String(on),
            onclick: () => {
              l.expressions[i] = !l.expressions[i];
              store.changed('layers');
              render();
            }
          }, String((i + 1) % 10))),
          h('button', {
            type: 'button',
            class: `all${allOn ? ' on' : ''}`,
            'aria-pressed': String(allOn),
            onclick: () => {
              l.expressions.fill(!allOn);
              store.changed('layers');
              render();
            }
          }, '전체'))),
      G({ id: 'depth', title: '입체감', open: true, summary: () => `깊이 ${signed(l.depth)} · 볼록 ${signed(l.curve)}` },
        rangeField(beta, {
          label: '깊이', left: '뒤', right: '앞', min: -100, max: 100, def: 0, snap: 4, format: signed,
          desc: '고개를 돌릴 때 얼마나 움직일지 정해요. 앞쪽(앞머리, 눈)은 많이 움직이고, 뒤쪽(뒷머리)은 반대 방향으로 움직여요.',
          get: () => l.depth,
          set: (v) => edit(() => { l.depth = v; })
        }),
        rangeField(beta, {
          label: '볼록 / 오목', left: '오목', right: '볼록', min: -100, max: 100, def: 0, snap: 4, format: signed,
          desc: '볼록하면 얼굴 중심 쪽이 가장자리보다 더 많이 움직여서 둥글게 보여요. 얼굴처럼 둥근 부위는 볼록하게 두면 좋아요.',
          iconNode: curveIcon,
          get: () => l.curve,
          set: (v) => edit(() => {
            l.curve = v;
            drawCurve();
          })
        })),
      G({ id: 'hair', title: beta ? '흔들림 (머리카락·장식·옷자락)' : '머리카락 · 장식', summary: () => (hr.enabled ? `${hr.dir === 'up' ? '위로' : '아래로'} · 세기 ${hr.sway}` : '꺼짐') },
        h('label', { class: 'switch' }, hairToggle, h('span', { class: 'knob' }), h('span', {}, '흔들림 물리'),
          hint(beta, '켜면 고개를 움직일 때 끝부분이 관성으로 뒤따라 출렁이고, 고개를 기울여도 원래 방향(아래 또는 위)을 유지하려 해요.')),
        l.part === 'body'
          ? h('p', { class: 'desc' }, beta
            ? '스커트·코트 자락·꼬리처럼 몸 레이어도 흔들 수 있어요. 고정선은 허리나 꼬리가 붙은 높이에.'
            : '몸 레이어의 흔들림은 베타(/beta)에서 먼저 시험 중이에요. 정식판에서는 머리 레이어만 흔들려요.')
          : null,
        hairFields),
      G({ id: 'extra', title: '눈동자 옵션', summary: () => [l.clip && '클리핑', l.pop && '통통'].filter(Boolean).join(' · ') || '없음' },
        h('label', { class: 'check-row' }, clip, h('span', {}, h('b', {}, '아래 레이어에 맞춰 자르기 (클리핑)')),
          hint(beta, " 켜면 목록에서 바로 아래(뒤) 레이어의 그림 안쪽에만 보여요. 예: 눈동자를 흰자 레이어 바로 위에 두고 켜면 흰자 밖으로 안 나가요. 눈동자는 '눈 뜰 때'로, 깊이는 흰자보다 높게 두면 고개를 돌릴 때 시선이 따라가는 느낌이 나요. ")),
        h('label', { class: 'check-row' }, pop, h('span', {}, h('b', {}, '깜빡일 때 통통')),
          hint(beta, "켜면 눈을 감을 때 같이 눌렸다가, 뜰 때 탄성 있는 공처럼 살짝 길쭉하게 튀었다가 돌아와요. 미리보기의 '깜빡여 보기'로 확인할 수 있어요.")))));

    if (focusKey) {
      const el = root.querySelector(`[data-key="${focusKey}"]`);
      if (el) {
        el.focus();
        if (sel) el.setSelectionRange(...sel);
      }
    }
  }

  const off = store.on((tags) => {
    if (tags.has('props') || tags.has('all') || tags.has('selection')) render();
    else if (tags.has('anchor')) anchorField?.refresh();
  });
  render();
  root.destroy = off;
  return root;
}
