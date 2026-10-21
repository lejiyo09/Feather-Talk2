// 전체 설정: 얼굴, 고개 움직임, 호흡, 눈·입
import { h, group, hint, rangeField, percent } from '../ui.js';

export function mountGlobalSettings(store) {
  const beta = store.beta;
  const root = h('section', { class: 'panel' });
  let fields = [];
  let groups = [];

  function render() {
    root.textContent = '';
    fields = [];
    groups = [];
    const m = store.model;
    const rig = m.rig;
    const set = (fn) => (v) => {
      fn(v);
      store.changed('globalValue');
      for (const g of groups) g.refresh();
    };
    const F = (opts) => {
      const f = rangeField(beta, opts);
      fields.push(f);
      return f;
    };
    const G = (opts, ...children) => {
      const g = group(beta, opts, ...children);
      groups.push(g);
      return g;
    };
    const pct = (v) => `${v}%`;

    const mouthBox = h('input', { type: 'checkbox' });
    mouthBox.checked = m.mouth.animate;
    mouthBox.addEventListener('change', () => {
      m.mouth.animate = mouthBox.checked;
      store.changed('globalValue');
      for (const g of groups) g.refresh();
    });
    const squashBox = h('input', { type: 'checkbox' });
    squashBox.checked = m.eyes.squash;
    squashBox.addEventListener('change', () => {
      m.eyes.squash = squashBox.checked;
      store.changed('global');
    });

    root.append(...[
      beta ? null : h('h3', {}, '전체 설정'),
      G({ id: 'face', title: '얼굴', open: true, help: '미리보기의 + 십자와 점선 원을 끌어도 돼요.', summary: () => `중심 ${percent(m.center.x)}, ${percent(m.center.y)} · 크기 ${percent(m.center.r)}` },
        F({ label: '얼굴 중심 (가로)', left: '왼쪽', right: '오른쪽', min: 0, max: 1, step: 0.005, def: 0.5, format: percent, get: () => m.center.x, set: set((v) => { m.center.x = v; }) }),
        F({ label: '얼굴 중심 (세로)', left: '위', right: '아래', min: 0, max: 1, step: 0.005, def: 0.4, format: percent, desc: '위아래로 고개를 끄덕일 때 기준이 되는 높이예요. 코 근처에 두면 자연스러워요.', get: () => m.center.y, set: set((v) => { m.center.y = v; }) }),
        F({ label: '얼굴 크기', left: '작게', right: '크게', min: 0.05, max: 0.6, step: 0.005, def: 0.25, format: percent, desc: '볼록/오목이 적용되는 범위예요. 점선 원이 얼굴을 감싸도록 맞춰 주세요.', get: () => m.center.r, set: set((v) => { m.center.r = v; }) })),
      G({ id: 'motion', title: '고개 움직임', summary: () => `좌우 ${rig.yaw}% · 상하 ${rig.pitch}% · 기울기 ${rig.roll}% · 탄력 ${rig.bounce}` },
        F({ label: '좌우 회전 강도', left: '0', right: '200', min: 0, max: 200, def: 100, format: pct, get: () => rig.yaw, set: set((v) => { rig.yaw = v; }) }),
        F({ label: '상하 회전 강도', left: '0', right: '200', min: 0, max: 200, def: 100, format: pct, get: () => rig.pitch, set: set((v) => { rig.pitch = v; }) }),
        F({ label: '기울기 강도', left: '0', right: '200', min: 0, max: 200, def: 100, format: pct, get: () => rig.roll, set: set((v) => { rig.roll = v; }) }),
        F({ label: '움직임 탄력 (뽀용함)', left: '차분', right: '통통', min: 0, max: 100, def: 50, desc: '고개가 멈출 때 살짝 지나쳤다 돌아오는 반동과, 빠르게 움직일 때 늘어나고 납작해지는 정도예요. 머리카락 흔들림과는 따로예요.', get: () => rig.bounce, set: set((v) => { rig.bounce = v; }) })),
      G({ id: 'breath', title: '호흡', summary: () => (rig.breath ? `세기 ${rig.breath}` : '없음') },
        F({ label: '호흡', left: '없음', right: '크게', min: 0, max: 100, def: 50, desc: '4초 주기로 몸이 살짝 부풀고 머리가 오르내려요. 흔들림 물리를 켠 레이어는 호흡을 따라 살짝 출렁여요.', get: () => rig.breath, set: set((v) => { rig.breath = v; }) })),
      G({ id: 'eyesMouth', title: '눈 · 입', summary: () => [m.mouth.animate ? '입 움직임' : '', m.eyes.squash ? '눈 눌림' : ''].filter(Boolean).join(' · ') || '기본' },
        h('label', { class: 'check-row' }, mouthBox, h('b', {}, '입이 열리고 닫힐 때 움직임'),
          hint(beta, " 켜면 입이 열릴 때 벌린 입이 작은 크기에서 쑥 커지고, 닫힐 때 작아졌다가 다문 입으로 바뀌어요. 벌린 입 그림의 위치는 자동으로 찾아서 입의 가운데를 축으로 움직여요. 끄면 그림만 바로 바뀌어요. 미리보기의 '말해 보기'로 확인할 수 있어요. ")),
        h('label', { class: 'check-row' }, squashBox, h('b', {}, '깜빡일 때 눈이 눌리며 감기는 효과'),
          hint(beta, " 끄면 뜬 눈 → 감은 눈 그림이 바로 바뀌어요. 켜면 뜬 눈을 '눈 영역' 띠 안쪽만 눌러 감기는 과정을 보여 줘요. 코·볼터치가 눈과 같은 그림에 있으면 띠에 걸리지 않게 맞춰 주세요. ")),
        m.eyes.squash ? [
          F({ label: '눈 높이', left: '위', right: '아래', min: 0, max: 1, step: 0.005, def: 0.4, format: percent, desc: '이 높이의 띠 안쪽만 눌려요. 눈 레이어를 고르면 미리보기에 초록 띠로 보이고, 끌어서 옮길 수 있어요.', get: () => m.eyes.y, set: set((v) => { m.eyes.y = v; }) }),
          F({ label: '눈 영역 크기', left: '좁게', right: '넓게', min: 0.01, max: 0.2, step: 0.005, def: 0.05, format: percent, get: () => m.eyes.h, set: set((v) => { m.eyes.h = v; }) })
        ] : null),
      h('p', { class: 'tip' }, '슬라이더를 더블클릭하면 기본값으로 돌아가요. 모든 설정은 이 브라우저에 자동 저장돼요.'),
      saveError
    ].filter(Boolean));
    saveError.hidden = !store.saveError;
  }

  const saveError = h('p', { class: 'error', role: 'status' }, '이 브라우저에 설정을 저장하지 못했어요. 저장 공간이 꽉 찼거나 사생활 보호 모드일 수 있어요. 새로고침하면 바뀐 내용이 사라질 수 있으니 백업 내보내기를 해 두세요.');
  const off = store.on((tags) => {
    if (tags.has('global') || tags.has('all')) render();
    else if (tags.has('drag')) {
      for (const f of fields) f.refresh();
      for (const g of groups) g.refresh();
    }
    if (tags.has('saveState')) saveError.hidden = !store.saveError;
  });
  render();
  root.destroy = off;
  return root;
}
