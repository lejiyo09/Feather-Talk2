// 미리보기: 캐릭터 렌더링, 겹침 표시(얼굴 중심·크기, 고정선, 눈 영역, 관절), 고개·표정·상태 도구.
// 베타에서는 확대·이동, 캐릭터 슬롯, 관절·포즈 편집이 더해진다.
import { resolveSrc } from '../model.js';
import { createRenderer, aspectTracker, pinchZoom, wheelZoom } from '../renderer.js';
import {
  HeadSpring, HairSystem, Blinker, MouthAnim, Wander, ArmSway, PosePlayer, breathAt, mouthState, popScale,
  pointerTarget, headTarget, rigStrength
} from '../motion.js';
import { JOINT_LABEL, BONE_LABEL, POSE_DRAG, LIMB_BONES, SKELETON, mirrorJoint, posedJoints } from '../rig.js';
import { h, infoTip } from '../ui.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MODES = [
  ['mouse', '마우스 따라보기', '미리보기 위에서 마우스를 움직이면 따라 봐요'],
  ['auto', '자동 흔들기', '라이브처럼 알아서 두리번거려요'],
  ['still', '정면 고정', '정면을 봐요']
];
const LIVE_TIP = '라이브에선 눈은 자동으로 깜빡이고, 입은 마이크 소리에 맞춰 움직여요.';

export function mountPreview(store) {
  const beta = store.beta;
  const p = store.preview;
  const stageCanvas = h('canvas', { 'aria-label': '캐릭터 미리보기' });
  const overlay = h('canvas', { class: 'overlay', 'aria-hidden': 'true' });
  const nogl = h('div', { class: 'nogl', hidden: true }, ' 이 브라우저는 WebGL을 지원하지 않아요. ', h('a', { href: 'https://v2.feathertalk.live/legacy/index.html' }, '이전 버전 사용하기'));
  const root = h('section', { class: 'panel preview' }, h('div', { class: 'stage-wrap' }, stageCanvas, overlay, nogl));
  const disposers = [];
  const listen = (target, ev, fn, opt) => {
    target.addEventListener(ev, fn, opt);
    disposers.push(() => target.removeEventListener(ev, fn, opt));
  };

  // ───────── 도구 막대 ─────────
  const blinker = new Blinker();
  const wander = new Wander();
  let talkUntil = 0;

  let viewTip = null;
  let jointsToggle = null;
  if (beta) {
    viewTip = h('span', { class: 'tip' });
    jointsToggle = h('label', { class: 'check' }, h('input', {
      type: 'checkbox',
      onchange: (e) => {
        p.showJoints = e.target.checked;
      }
    }), ' 관절 표시');
    root.append(h('div', { class: 'toolbar' },
      h('span', { class: 'label' }, '보기'),
      h('button', { type: 'button', class: 'toggle', title: '휠로 확대/축소, 우클릭이나 휠 버튼 드래그로 이동할 수 있어요', onclick: () => Object.assign(p.view, { zoom: 1, x: 0, y: 0 }) }, '화면 맞춤'),
      viewTip, jointsToggle));
  }

  const modeSeg = h('div', { class: 'seg' }, MODES.map(([m, label, title]) => h('button', {
    type: 'button',
    title,
    onclick: () => {
      p.mode = m;
      p.target = { x: 0, y: 0 };
      if (m === 'auto') wander.reset(p.target);
      refreshToolbar();
    }
  }, label)));
  const focusBox = h('input', { type: 'checkbox', onchange: (e) => { p.focus = e.target.checked; } });
  root.append(h('div', { class: 'toolbar' }, h('span', { class: 'label' }, '고개'), modeSeg, h('label', { class: 'check' }, focusBox, ' 선택한 레이어만 진하게')));

  // 표정(정식판) 또는 캐릭터 슬롯(베타)
  let numSeg;
  let slotMenu = null;
  const numRow = h('div', { class: 'toolbar' });
  if (beta) {
    numSeg = h('div', { class: 'seg small' });
    for (let i = 0; i < 10; i++) {
      numSeg.append(h('button', {
        type: 'button',
        title: `${(i + 1) % 10}번 캐릭터 편집 (라이브에서 숫자키 ${(i + 1) % 10}) · 우클릭: 복사/붙여넣기`,
        onclick: () => store.selectSlot(i),
        oncontextmenu: (e) => {
          e.preventDefault();
          openSlotMenu(e, i);
        }
      }, String((i + 1) % 10)));
    }
    numRow.append(h('span', { class: 'label' }, '캐릭터'), numSeg,
      infoTip('1~0번은 각각 다른 캐릭터예요 (레이어·설정이 따로). 라이브에서 숫자키로 바꿔요. 탭을 우클릭(휴대폰은 길게 누르기)하면 복사·붙여넣기를 할 수 있어요.'));
  } else {
    numSeg = h('div', { class: 'seg small' });
    for (let i = 0; i < 10; i++) {
      numSeg.append(h('button', {
        type: 'button',
        title: `${(i + 1) % 10}번 표정 미리보기`,
        onclick: () => {
          p.expression = i;
          refreshToolbar();
        }
      }, String((i + 1) % 10)));
    }
    numRow.append(h('span', { class: 'label' }, '표정'), numSeg);
  }
  root.append(numRow);

  function closeSlotMenu() {
    slotMenu?.remove();
    slotMenu = null;
  }
  function openSlotMenu(e, slot) {
    closeSlotMenu();
    const r = numRow.getBoundingClientRect();
    const cb = store.clipboard;
    slotMenu = h('div', { class: 'slot-menu', style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top + 6}px` }, onclick: (ev) => ev.stopPropagation() },
      h('button', {
        type: 'button',
        onclick: () => {
          store.copySlot(slot);
          closeSlotMenu();
        }
      }, `${(slot + 1) % 10}번 캐릭터 복사`),
      h('button', {
        type: 'button',
        disabled: !cb || cb.from === slot,
        onclick: () => {
          const from = store.clipboard.from;
          closeSlotMenu();
          if (confirm(`${(from + 1) % 10}번 캐릭터를 ${(slot + 1) % 10}번에 붙여넣을까요? ${(slot + 1) % 10}번의 지금 설정은 덮어써져요.`)) store.pasteSlot(slot);
        }
      }, cb ? `${(cb.from + 1) % 10}번 캐릭터를 여기에 붙여넣기` : '붙여넣기 (먼저 복사해 주세요)'));
    numRow.append(slotMenu);
  }
  listen(window, 'click', closeSlotMenu);

  const eyesBtn = h('button', { type: 'button', onclick: () => { p.eyesClosed = !p.eyesClosed; refreshToolbar(); } }, '눈 감기');
  const blinkBtn = h('button', {
    type: 'button',
    title: '한 번 깜빡여요. 라이브에선 2~6초마다 불규칙하게 깜빡여요.',
    onclick: () => {
      p.eyesClosed = false;
      blinker.trigger(performance.now());
      refreshToolbar();
    }
  }, '깜빡여 보기');
  const mouthBtn = h('button', { type: 'button', onclick: () => { p.mouthOpen = !p.mouthOpen; refreshToolbar(); } }, '입 열기');
  const talkBtn = h('button', {
    type: 'button',
    title: '마이크 없이 2.5초 동안 말하는 모습을 보여줘요',
    onclick: () => {
      p.mouthOpen = false;
      talkUntil = performance.now() + 2500;
      refreshToolbar();
    }
  }, '말해 보기');
  const stateBtns = [eyesBtn, blinkBtn, mouthBtn, talkBtn];
  if (!beta) stateBtns.forEach((b) => b.classList.add('toggle'));
  root.append(h('div', { class: 'toolbar' },
    h('span', { class: 'label' }, '상태'),
    h(beta ? 'div' : 'span', { class: beta ? 'seg' : 'loose' }, stateBtns),
    beta ? infoTip(LIVE_TIP) : h('span', { class: 'tip' }, LIVE_TIP)));
  root.append(h('p', { class: 'tip' }, h('b', {}, '+'), ' 얼굴 중심 · ', h('b', {}, '점선 원'), ' 얼굴 크기 · ', h('b', {}, '분홍 점선'), ' 머리카락 고정선 · ', h('b', {}, '초록 띠'), ' 눈 깜빡임 영역(눌림 효과를 켰을 때) — 모두 끌어서 옮길 수 있어요. '));

  function refreshToolbar() {
    [...modeSeg.children].forEach((b, i) => b.classList.toggle('on', MODES[i][0] === p.mode));
    [...numSeg.children].forEach((b, i) => b.classList.toggle('on', beta ? i === store.activeSlot : i === p.expression));
    eyesBtn.classList.toggle('on', p.eyesClosed);
    mouthBtn.classList.toggle('on', p.mouthOpen);
    focusBox.checked = p.focus;
    if (jointsToggle) {
      jointsToggle.hidden = !store.model.body.enabled;
      jointsToggle.querySelector('input').checked = p.showJoints;
    }
  }

  // ───────── 렌더러 ─────────
  const aspects = aspectTracker();
  let renderer = null;
  try {
    renderer = createRenderer(stageCanvas, {
      layout: 'center',
      onImageError: (layer) => store.imageError(layer),
      onImageSize: beta
        ? (layer, w, hgt) => {
          const r = aspects.add(layer, w, hgt, store.model.layers);
          if (r && Math.abs(r - store.model.aspect) > 0.01) {
            store.model.aspect = r;
            store.changed('bodyValue', 'aspect');
          }
        }
        : undefined,
      maxTexture: beta ? 4096 : undefined
    });
  } catch (err) {
    console.error(err);
  }
  if (!renderer) nogl.hidden = false;
  const syncLayers = () => renderer?.setLayers(store.model.layers, resolveSrc, beta ? store.slots.flatMap((s) => s.layers) : []);

  // ───────── 겹침 표시 ─────────
  const showRig = () => beta && store.model.body.enabled && (p.showJoints || !!p.poseEdit);
  // 포즈 편집 중이면 포즈를 적용한 관절 위치
  function jointsNow() {
    const body = store.model.body;
    if (!p.poseEdit) return body.joints;
    const k = p.poseEdit;
    return posedJoints(body, store.model.aspect, body.poses[k], body.poses[k === 'a' ? 'aLen' : 'bLen']);
  }
  const cursorOf = (k) => (k.startsWith('joint:') ? 'move' : { center: 'move', radius: 'nwse-resize', anchor: 'ns-resize', eyes: 'ns-resize', eyesSize: 'ns-resize', bodyR: 'ew-resize' }[k] || 'default');
  function eyeLayer() {
    const l = store.selected();
    return store.model.eyes.squash && l && (l.show === 'eyesOpen' || l.show === 'eyesClosed') ? l : null;
  }
  function hairLayer() {
    const l = store.selected();
    return l && l.hair.enabled && (l.part !== 'body' || beta) ? l : null;
  }
  function local(e) {
    const r = overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  function hitTest(pt) {
    if (!renderer) return null;
    const [rx, ry, rw, rh] = renderer.cssRect();
    const m = store.model;
    if (showRig()) {
      const j = jointsNow();
      for (const k of Object.keys(JOINT_LABEL)) {
        if (p.poseEdit && !POSE_DRAG[k]) continue;
        if (Math.hypot(pt.x - (rx + j[k].x * rw), pt.y - (ry + j[k].y * rh)) < 9) return `joint:${k}`;
      }
      const w = m.body.joints.waist;
      if (Math.abs(Math.abs(pt.x - (rx + w.x * rw)) - m.body.radius * rw) < 6 && Math.abs(pt.y - (ry + w.y * rh)) < 40) return 'bodyR';
    }
    const c = m.center;
    const d = Math.hypot(pt.x - (rx + c.x * rw), pt.y - (ry + c.y * rh));
    if (d < 14) return 'center';
    if (Math.abs(d - c.r * rw) < 8) return 'radius';
    const hl = hairLayer();
    if (hl && Math.abs(pt.y - (ry + hl.hair.anchorY * rh)) < 8 && pt.x > rx && pt.x < rx + rw) return 'anchor';
    if (eyeLayer() && pt.x > rx && pt.x < rx + rw) {
      const ey = ry + m.eyes.y * rh;
      if (Math.abs(pt.y - ey) < 8) return 'eyes';
      if (Math.abs(Math.abs(pt.y - ey) - m.eyes.h * rh) < 6) return 'eyesSize';
    }
    return null;
  }

  let panning = false;
  const pinch = pinchZoom(() => overlay.getBoundingClientRect(), p.view);
  listen(overlay, 'pointerdown', (e) => {
    if (beta && pinch.down(e)) {
      p.drag = null;
      return;
    }
    if (beta && (e.button === 2 || e.button === 1)) {
      e.preventDefault();
      panning = true;
      overlay.setPointerCapture(e.pointerId);
      return;
    }
    const hit = hitTest(local(e));
    if (hit) {
      p.drag = hit;
      overlay.setPointerCapture(e.pointerId);
    }
  });
  const endDrag = (e) => {
    pinch.up(e);
    if (p.drag) store.emit(p.drag === 'anchor' ? 'props' : p.drag.startsWith('joint:') || p.drag === 'bodyR' ? 'body' : 'global');
    p.drag = null;
    panning = false;
  };
  listen(overlay, 'pointerup', endDrag);
  listen(overlay, 'pointercancel', endDrag);
  listen(overlay, 'pointerleave', () => {
    p.hover = null;
    if (p.mode === 'mouse') p.target = { x: 0, y: 0 };
  });
  listen(overlay, 'contextmenu', (e) => e.preventDefault());
  listen(overlay, 'wheel', (e) => {
    if (!beta) return;
    e.preventDefault();
    wheelZoom(e, overlay.getBoundingClientRect(), p.view);
  }, { passive: false });

  listen(overlay, 'pointermove', (e) => {
    const pt = local(e);
    if (beta && (pinch.move(e) || pinch.active)) return;
    if (panning) {
      p.view.x += e.movementX;
      p.view.y += e.movementY;
      return;
    }
    if (p.drag && renderer) {
      dragTo(pt);
      return;
    }
    p.hover = hitTest(pt);
    overlay.style.cursor = p.hover ? cursorOf(p.hover) : 'default';
    if (p.mode === 'mouse' && renderer) {
      const [rx, ry, rw, rh] = renderer.cssRect();
      const c = store.model.center;
      p.target = pointerTarget(pt.x, pt.y, rx + c.x * rw, ry + c.y * rh, rw);
    }
  });

  function dragTo(pt) {
    const [rx, ry, rw, rh] = renderer.cssRect();
    const fx = (pt.x - rx) / rw;
    const fy = (pt.y - ry) / rh;
    const q = (v) => Math.round(v * 200) / 200;
    const m = store.model;
    const c = m.center;
    const d = p.drag;
    if (d.startsWith('joint:') && p.poseEdit) {
      // 포즈: 관절을 끌면 그 뼈가 축 관절을 중심으로 돌거나(회전) 늘어난다(길이)
      const name = d.slice(6);
      const drag = POSE_DRAG[name];
      if (drag) {
        const [bone, pivotName] = drag;
        const A = m.aspect;
        const k = p.poseEdit;
        const angles = m.body.poses[k];
        const lens = m.body.poses[k === 'a' ? 'aLen' : 'bLen'];
        const j = jointsNow();
        const pivot = j[pivotName];
        const cur = j[name];
        if (p.poseMode === 'length' && LIMB_BONES.has(bone)) {
          const base = Math.hypot(cur.x - pivot.x, (cur.y - pivot.y) * A) / (lens[bone] || 1);
          const want = Math.hypot(fx - pivot.x, (fy - pivot.y) * A);
          lens[bone] = Math.round(clamp(want / Math.max(base, 1e-6), 0.7, 1.3) * 100) / 100;
        } else {
          const a0 = Math.atan2((cur.y - pivot.y) * A, cur.x - pivot.x);
          let da = Math.atan2((fy - pivot.y) * A, fx - pivot.x) - a0;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          angles[bone] = Math.round(((angles[bone] || 0) + da) * 1000) / 1000;
        }
      }
    } else if (d.startsWith('joint:')) {
      const name = d.slice(6);
      const body = m.body;
      body.joints[name] = { x: q(clamp(fx, 0, 1)), y: q(clamp(fy, 0, 1)) };
      const other = mirrorJoint(name);
      if (body.mirror && other) body.joints[other] = { x: q(clamp(2 * body.joints.waist.x - fx, 0, 1)), y: q(clamp(fy, 0, 1)) };
    } else if (d === 'bodyR') {
      m.body.radius = q(clamp(Math.abs(fx - m.body.joints.waist.x), 0.02, 0.5));
    } else if (d === 'center') {
      c.x = q(clamp(fx, 0, 1));
      c.y = q(clamp(fy, 0, 1));
    } else if (d === 'radius') {
      c.r = q(clamp(Math.hypot(pt.x - (rx + c.x * rw), pt.y - (ry + c.y * rh)) / rw, 0.05, 0.6));
    } else if (d === 'anchor') {
      const hl = hairLayer();
      if (hl) hl.hair.anchorY = Math.round(clamp(fy, 0, 1) * 100) / 100;
    } else if (d === 'eyes') {
      m.eyes.y = q(clamp(fy, 0, 1));
    } else if (d === 'eyesSize') {
      m.eyes.h = q(clamp(Math.abs(fy - m.eyes.y), 0.01, 0.2));
    }
    store.changed(d === 'anchor' ? 'anchor' : 'drag');
  }

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
    const m = store.model;
    const hot = (k) => p.hover === k || p.drag === k;
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
      const ey = ry + m.eyes.y * rh;
      const eh = m.eyes.h * rh;
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
    if (showRig()) {
      const j = jointsNow();
      const at = (k) => [rx + j[k].x * rw, ry + j[k].y * rh];
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of SKELETON) {
        ctx.moveTo(...at(a));
        ctx.lineTo(...at(b));
      }
      ctx.stroke();
      const [wx, wy] = at('waist');
      const [, ny] = at('neck');
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = hot('bodyR') ? 2.5 : 1.5;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(wx + s * m.body.radius * rw, ny);
        ctx.lineTo(wx + s * m.body.radius * rw, wy + (wy - ny) * 0.4);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const k of Object.keys(JOINT_LABEL)) {
        if (p.poseEdit && !POSE_DRAG[k]) continue;
        const [x, y] = at(k);
        const on = hot(`joint:${k}`);
        ctx.fillStyle = p.poseEdit ? '#ec4899' : k === 'neck' || k === 'waist' ? '#f59e0b' : '#fbbf24';
        ctx.beginPath();
        ctx.arc(x, y, on ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (on || k === 'neck' || k === 'waist') {
          ctx.fillStyle = '#b45309';
          ctx.fillText(JOINT_LABEL[k], x + 10, y - 8);
        }
      }
    }
    const c = m.center;
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
  const head = new HeadSpring();
  const hairSys = new HairSystem();
  const mouth = new MouthAnim();
  const arms = new ArmSway();
  const player = new PosePlayer();
  const strength = rigStrength();
  let last = performance.now();
  let frameNo = 0;
  let raf = 0;

  // 몸 레이어마다 붙은 뼈 이름 (목록 배지·몸 리깅 탭에 표시)
  function updateBones() {
    const bones = {};
    for (const l of store.model.layers) {
      const b = renderer?.boneOf(l);
      if (b !== null && b !== undefined) bones[l.id] = BONE_LABEL[b] || '';
    }
    if (JSON.stringify(bones) !== JSON.stringify(p.layerBones)) {
      p.layerBones = bones;
      store.emit('layers', 'bones');
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    last = now;
    const m = store.model;
    if (p.mode === 'auto') p.target = wander.update(now);
    const target = p.drag || p.mode === 'still' || p.poseEdit ? { x: 0, y: 0 } : p.target;
    head.update(dt, headTarget(target.x, target.y, m.rig, strength), m.rig.bounce);
    const hs = head.state;
    const breath = breathAt(now / 1000, m.rig.breath, m.center);
    if (beta) {
      renderer?.setView(p.view);
      if (viewTip) viewTip.textContent = `${Math.round(p.view.zoom * 100)}% · 휠/핀치: 확대·축소 · 우클릭/휠 버튼/두 손가락 드래그: 이동`;
    }
    const rigExtra = beta
      ? {
        aspect: m.aspect,
        body: m.body,
        arms: arms.update(dt, hs.roll * 0.35, now / 1000),
        hairToContent: true,
        ...(p.poseEdit
          ? { pose: m.body.poses[p.poseEdit], poseLen: m.body.poses[p.poseEdit === 'a' ? 'aLen' : 'bLen'] }
          : player.update(dt, p.playTest, m.body.poses, m.body.playSpeed, now / 1000))
      }
      : {};
    renderer?.render({
      ...rigExtra,
      center: m.center,
      head: hs,
      squash: head.squash,
      breath,
      expression: beta ? 0 : p.expression,
      eyesClosed: p.eyesClosed,
      blink: p.eyesClosed ? 1 : blinker.update(now, false),
      pop: popScale(blinker, now),
      eyes: m.eyes,
      ...mouthState(mouth, dt, p.mouthOpen || (now < talkUntil && now % 400 >= 200), m.mouth.animate),
      hair: hairSys.update(dt, m.layers, hs, now / 1000, breath.hairLag, beta),
      focusId: p.focus ? store.selectedId : null
    });
    drawOverlay();
    if (beta && ++frameNo % 20 === 0) updateBones();
  }

  const off = store.on((tags) => {
    if (tags.has('model') || tags.has('all') || tags.has('slots')) syncLayers();
    if (tags.has('preview') || tags.has('all') || tags.has('body') || tags.has('slots')) refreshToolbar();
  });

  syncLayers();
  refreshToolbar();
  raf = requestAnimationFrame(frame);

  root.destroy = () => {
    cancelAnimationFrame(raf);
    off();
    disposers.forEach((d) => d());
    renderer?.destroy();
  };
  return root;
}

