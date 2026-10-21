// 몸 리깅 설정 (베타): 관절 맞추기, 파츠 확인, 움직임 다듬기, 연주 포즈
import { defaultJoints } from '../model.js';
import { BONE, PAIR, BONE_LABEL } from '../rig.js';
import { h, infoTip, rangeField, percent } from '../ui.js';
import { layerThumb } from './layer-list.js';

const PAIR_BONES = {
  [BONE_LABEL[PAIR.arms]]: [BONE.upperArmL, BONE.foreArmL, BONE.upperArmR, BONE.foreArmR],
  [BONE_LABEL[PAIR.legs]]: [BONE.thighL, BONE.shinL, BONE.thighR, BONE.shinR]
};

export function mountBodyRig(store) {
  const beta = true;
  const p = store.preview;
  const root = h('section', { class: 'panel body-rig' });

  function render() {
    root.textContent = '';
    const m = store.model;
    const body = m.body;
    const slot = (store.activeSlot + 1) % 10;
    // 값만 바뀔 때는 패널을 다시 그리지 않는다 (슬라이더를 끄는 중이므로)
    const changed = () => store.changed('bodyValue');

    const enabled = h('input', { type: 'checkbox' });
    enabled.checked = body.enabled;
    enabled.addEventListener('change', () => {
      body.enabled = enabled.checked;
      store.changed('body', 'preview');
    });

    root.append(
      h('p', { class: 'editing' }, `${slot}번 캐릭터 편집 중 `, h('small', {}, "(미리보기 아래 '캐릭터' 탭에서 바꿔요)")),
      h('label', { class: 'switch big' }, enabled, h('span', { class: 'knob' }), h('span', {}, '몸 리깅'),
        infoTip(" 전신 그림용이에요. 관절을 맞추면 몸 레이어가 가장 가까운 뼈를 자동으로 따라가요. 몸은 얼굴 각도를 따라 원기둥처럼 돌고, 위아래 몸통은 S자로 반대로 기울고, 팔은 어깨에 매달려 흔들리고, 다리는 발을 바닥에 붙인 채 무릎을 굽혀요. '머리' 레이어는 머리 뼈를 따라가요. ")),
      h('p', { class: 'desc' }, `그림 비율은 자동으로 읽어요 (지금 ${m.aspect} : 1).`));
    if (!body.enabled) return;

    const mirror = h('input', { type: 'checkbox' });
    mirror.checked = body.mirror;
    mirror.addEventListener('change', () => {
      body.mirror = mirror.checked;
      changed();
    });
    const joints = h('input', { type: 'checkbox' });
    joints.checked = p.showJoints;
    joints.addEventListener('change', () => {
      p.showJoints = joints.checked;
      store.emit('preview');
    });

    const bodyLayers = m.layers.filter((l) => l.part === 'body');
    // 돌렸지만 붙은 레이어가 없어 화면에서는 안 움직이는 뼈
    const used = new Set();
    for (const label of Object.values(p.layerBones)) {
      for (const b of PAIR_BONES[label] || []) used.add(b);
      const id = Object.entries(BONE_LABEL).find(([, v]) => v === label)?.[0];
      if (id !== undefined) used.add(+id);
    }
    const { a, b, aLen, bLen } = body.poses;
    const moved = (i) => a[i] || b[i] || (aLen[i] ?? 1) !== 1 || (bLen[i] ?? 1) !== 1;
    const orphan = a.map((_, i) => (moved(i) && !used.has(i) ? BONE_LABEL[i] : null)).filter(Boolean);

    const poseBtn = (key, label) => h('button', {
      type: 'button',
      class: p.poseEdit === key ? 'on' : '',
      onclick: () => {
        p.poseEdit = key;
        if (key) p.playTest = false;
        store.emit('preview');
        render();
      }
    }, label);
    const modeBtn = (mode, label, title) => h('button', {
      type: 'button',
      class: p.poseMode === mode ? 'on' : '',
      title,
      onclick: () => {
        p.poseMode = mode;
        render();
      }
    }, label);

    root.append(h('ol', { class: 'steps' },
      h('li', {},
        h('div', { class: 'step-head' }, h('span', { class: 'num' }, '1'), h('b', {}, '관절 맞추기')),
        h('p', { class: 'desc' }, '미리보기의 주황 점을 그림의 관절에 맞춰 끌어 주세요. 허리 양옆 점선은 몸통 두께예요.'),
        h('div', { class: 'row' },
          h('label', { class: 'check' }, mirror, ' 좌우 대칭으로 움직이기'),
          h('label', { class: 'check' }, joints, ' 관절 표시'),
          h('button', {
            type: 'button',
            class: 'plain',
            onclick: () => {
              if (!confirm('관절 위치를 기본값으로 되돌릴까요?')) return;
              body.joints = defaultJoints();
              changed();
            }
          }, '기본 위치로'))),
      h('li', {},
        h('div', { class: 'step-head' }, h('span', { class: 'num' }, '2'), h('b', {}, '파츠 확인'),
          infoTip(' 몸 레이어는 그림이 있는 부분에서 가장 가까운 뼈 하나에 통째로 붙어요. 몸 위쪽·팔·다리는 레이어를 나눠 주세요. 양팔이나 양다리를 한 장에 그렸다면 반으로 잘라 좌우를 따로 움직여요. 스커트처럼 양다리에 걸친 건 몸 아래쪽에 붙어요. ')),
        bodyLayers.length
          ? h('ul', { class: 'parts' }, bodyLayers.map((l) => h('li', {}, layerThumb(l, 'thumb'), h('span', { class: 'pname' }, l.name), h('span', { class: 'pbone' }, p.layerBones[l.id] || '…'))))
          : h('p', { class: 'desc' }, "아직 '몸' 레이어가 없어요. 레이어 탭에서 레이어의 부위를 '몸'으로 바꿔 주세요.")),
      h('li', {},
        h('div', { class: 'step-head' }, h('span', { class: 'num' }, '3'), h('b', {}, '움직임 다듬기')),
        rangeField(beta, { label: '몸이 얼굴을 따라가는 정도', left: '조금', right: '많이', min: 0, max: 100, def: 35, format: (v) => `${v}%`, desc: '고개를 돌리고 기울일 때 몸이 따라 도는 비율이에요. 라이브투디에서는 보통 3분의 1 정도예요.', get: () => body.follow, set: (v) => { body.follow = v; changed(); } }),
        rangeField(beta, { label: '골반·무릎 움직임', left: '없음', right: '크게', min: 0, max: 100, def: 50, desc: '고개를 돌리거나 기울이면 골반이 반대로 기울며 밀리고, 발은 바닥에 붙은 채 무릎이 굽어요.', get: () => body.sway, set: (v) => { body.sway = v; changed(); } }),
        rangeField(beta, { label: '몸통 두께', left: '얇게', right: '두껍게', min: 0.02, max: 0.5, step: 0.005, def: 0.15, format: percent, desc: '몸통 원기둥의 반지름이에요. 미리보기에서 허리 양옆 점선을 끌어도 돼요.', get: () => body.radius, set: (v) => { body.radius = v; changed(); } })),
      h('li', {},
        h('div', { class: 'step-head' }, h('span', { class: 'num' }, '4'), h('b', {}, '연주 포즈'), ' ', h('small', { class: 'opt' }, `선택 · ${slot}번 캐릭터`),
          infoTip(" 악기를 연주할 때의 동작 1·2를 직접 만들어요. 동작을 고른 채 미리보기의 관절점을 끌면 그 뼈가 돌아가요 (팔꿈치 → 팔 위쪽, 손목 → 팔 아래쪽, 무릎 → 다리 위쪽, 발목 → 다리 아래쪽, 목 → 몸 위쪽). 연주 중(멀티에서는 감지될 때, 라이브에서는 마이크 소리가 날 때)에는 동작 1·2를 오가고, 끝나면 기본 자세로 돌아가요. 드럼·피아노처럼 앞에 두는 악기는 레이어 부위를 '고정'으로 두면 움직이지 않아요. ")),
        h('div', { class: 'seg pose-seg' }, poseBtn(null, '기본 자세 (관절 위치)'), poseBtn('a', '동작 1'), poseBtn('b', '동작 2')),
        p.poseEdit ? [
          h('div', { class: 'row' }, h('span', { class: 'mini' }, '끌면'),
            h('div', { class: 'seg' }, modeBtn('rotate', '회전'), modeBtn('length', '길이', '팔·다리 뼈를 0.7~1.3배로 늘이거나 줄여요'))),
          h('p', { class: 'desc' }, ` 관절점을 끌어 동작 ${p.poseEdit === 'a' ? 1 : 2}의 자세를 잡아요. `, p.poseMode === 'length' ? '축 관절에서 멀리 끌면 뼈가 늘어나고, 가까이 끌면 줄어요 (팔·다리만).' : '')
        ] : null,
        orphan.length ? h('p', { class: 'warn' }, `${orphan.join(', ')} 뼈를 돌렸지만 그 뼈에 붙은 레이어가 없어서 화면에서는 안 움직여요. 위 '파츠 확인'에서 그 부위 그림이 따로 레이어로 나뉘어 해당 뼈에 붙어 있는지 확인해 주세요. `) : null,
        h('div', { class: 'row' },
          h('button', {
            type: 'button',
            class: `plain${p.playTest ? ' on' : ''}`,
            onclick: () => {
              p.playTest = !p.playTest;
              p.poseEdit = null;
              store.emit('preview');
              render();
            }
          }, p.playTest ? '연주 미리보기 멈추기' : '연주 미리보기'),
          p.poseEdit ? h('button', {
            type: 'button',
            class: 'plain',
            onclick: () => {
              const k = p.poseEdit;
              if (!confirm(`동작 ${k === 'a' ? 1 : 2}를 기본 자세로 되돌릴까요?`)) return;
              body.poses[k] = Array(12).fill(0);
              body.poses[k === 'a' ? 'aLen' : 'bLen'] = Array(12).fill(1);
              changed();
              render();
            }
          }, '이 동작 초기화') : null),
        rangeField(beta, { label: '연주 속도', left: '느리게', right: '빠르게', min: 0.1, max: 4, step: 0.1, def: 0.6, format: (v) => `${Number(v).toFixed(1)}회/초`, desc: '연주 중에 동작 1과 2를 1초에 몇 번 오갈지예요.', get: () => body.playSpeed, set: (v) => { body.playSpeed = v; changed(); } }))));
  }

  const off = store.on((tags) => {
    if (tags.has('all') || tags.has('bones') || tags.has('aspect')) render();
    else if (tags.has('body') && !tags.has('drag')) render();
  });
  render();
  root.destroy = off;
  return root;
}
