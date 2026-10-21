// 라이브 화면 (정식판 / 베타): 마이크로 입, 자동 깜빡임, 마우스·자동 모션·웹캠으로 고개.
// 베타는 숫자키로 캐릭터 슬롯 전환, 확대·이동, 몸 리깅·연주 포즈.
import { useBetaStorage, loadModel, loadSlots, watchSlots, resolveSrc } from './model.js';
import { createRenderer, aspectTracker, pinchZoom, wheelZoom } from './renderer.js';
import {
  HeadSpring, HairSystem, Blinker, BlinkFollow, MouthAnim, Wander, ArmSway, PosePlayer, breathAt, mouthState, popScale,
  pointerTarget, headTarget, poseToTarget
} from './motion.js';
import { FaceTracker } from './webcam.js';
import { h, iconEl } from './ui.js';
import { isBeta, basePath } from './env.js';
import { storage as ls } from './page.js';
import { registerServiceWorker } from './pwa.js';

const beta = isBeta();
const base = basePath();
useBetaStorage(beta);

const opts = {
  thres: ls.int('ftThres', 30),
  rig: ls.int('ftRig', 60),
  range: ls.int('ftMotionRange', 70),
  fps: ls.int('ftFps', 60),
  color: ls.get('ftColor') || '#00ff00',
  cam: ls.get('ftWebcam') === '1',
  mirror: ls.get('ftWebcamMirror') !== '0',
  camEyes: ls.get('ftWebcamEyes') === '1'
};
document.body.style.backgroundColor = opts.color;

// ───────── 캐릭터 ─────────
const slotData = beta ? loadSlots() : null;
let model = slotData ? slotData.slots[slotData.active] : loadModel();
let slot = slotData ? slotData.active : 0;
let expression = 0;

// 베타 화면 확대·이동 (저장해 두고 다음에도 같은 구도)
const VIEW_KEY = 'ftLiveViewBeta';
const view = { zoom: 1, x: 0, y: 0 };
try {
  Object.assign(view, JSON.parse(ls.get(VIEW_KEY) || '{}'));
} catch {
  // 저장된 구도가 없으면 기본
}
const saveView = () => ls.set(VIEW_KEY, JSON.stringify(view));

// ───────── 조작 막대 ─────────
const range = (key, prop, min, max, cls) => {
  const input = h('input', { type: 'range', min, max, class: cls });
  input.value = opts[prop];
  input.addEventListener('input', () => {
    opts[prop] = Number(input.value);
    ls.set(key, opts[prop]);
  });
  return input;
};
const fpsSelect = h('select', {}, h('option', { value: '60' }, '60fps'), h('option', { value: '30' }, '30fps (가볍게)'));
fpsSelect.value = String(opts.fps);
fpsSelect.addEventListener('change', () => {
  opts.fps = Number(fpsSelect.value);
  ls.set('ftFps', opts.fps);
});
const colorInput = h('input', { type: 'color' });
colorInput.value = opts.color;
colorInput.addEventListener('input', () => {
  opts.color = colorInput.value;
  document.body.style.backgroundColor = opts.color;
  ls.set('ftColor', opts.color);
});

const camToggle = h('button', { type: 'button', class: 'cam-toggle', title: '웹캠으로 얼굴 각도만 따라가요. 영상은 화면에 띄우거나 어디로 보내지 않아요.' }, iconEl('camera', 15), ' 웹캠 ');
const camStatus = h('span', { class: 'cam-status', role: 'status' });
const camCalibrate = h('button', { type: 'button', class: 'cam-toggle', title: '정면을 보고 눈을 뜬 채로 눌러 주세요. 지금 자세를 정면으로, 지금 눈 뜬 정도를 평소 뜬 눈으로 잡아요.' }, iconEl('crosshair', 15), ' 정면 맞추기 ');
const camMirror = h('input', { type: 'checkbox' });
const camEyes = h('input', { type: 'checkbox' });
const camExtra = h('span', { class: 'cam-extra' }, camStatus, camCalibrate,
  h('label', { title: '켜면 거울처럼, 내가 왼쪽을 보면 캐릭터도 화면 왼쪽을 봐요' }, camMirror, ' 좌우 반전'),
  h('label', { title: '눈을 확실히 감고 있으면 캐릭터도 감아요 (약간 늦게 반응해요). 얼굴을 놓치면 자동 깜빡임으로 돌아가요.' }, camEyes, ' 눈 깜빡임도'));
const micIcon = h('span', { class: 'mic', title: '조용함' }, iconEl('mic', 14));
const micError = h('span', { class: 'mic-error', role: 'status', hidden: true });

const controls = h('div', { class: 'controls' },
  h('a', { href: `${base}/`, class: 'back', title: '편집기로 돌아가기' }, iconEl('arrow-left', 15), ' 편집'),
  h('label', {}, h('span', {}, '마이크 민감도'), range('ftThres', 'thres', 0, 100, 'reverse')),
  h('label', {}, h('span', {}, '리깅 강도'), range('ftRig', 'rig', 0, 200)),
  h('label', { title: '마우스를 멈추면 캐릭터가 알아서 둘러봐요. 왼쪽은 정면 근처에서만, 오른쪽은 크게 왔다갔다해요.' }, h('span', {}, '자동 모션 범위'), range('ftMotionRange', 'range', 10, 100)),
  h('label', { title: '30으로 낮추면 컴퓨터 사용량이 절반 가까이 줄어요. 대신 움직임이 조금 덜 부드러워요.' }, h('span', {}, '프레임'), fpsSelect),
  h('span', { class: 'cam' }, camToggle, camExtra),
  beta ? h('button', {
    type: 'button',
    class: 'cam-toggle',
    title: '휠이나 두 손가락 핀치로 확대/축소, 우클릭·휠 버튼·두 손가락 드래그로 위치를 옮길 수 있어요. 누르면 처음 구도로 돌아가요.',
    onclick: () => {
      Object.assign(view, { zoom: 1, x: 0, y: 0 });
      saveView();
    }
  }, iconEl('maximize', 15), ' 화면 맞춤 ') : null,
  h('label', {}, h('span', {}, '배경색'), colorInput),
  h('span', { class: 'hint' }, '숫자키 1~0: 표정 전환 · ', micIcon),
  micError);
const canvas = h('canvas', { class: `stage${beta ? ' touch' : ''}`, 'aria-label': '캐릭터' });
const nogl = h('div', { class: 'nogl', hidden: true }, ' 이 브라우저는 WebGL을 지원하지 않아요. ', h('a', { href: 'https://v2.feathertalk.live/legacy/live.html' }, '이전 버전으로 열기'));
document.getElementById('app').replaceChildren(controls, canvas, nogl);

// ───────── 렌더러 ─────────
const aspects = aspectTracker();
let renderer = null;
try {
  renderer = createRenderer(canvas, {
    layout: 'bottom',
    maxTexture: beta ? 4096 : undefined,
    onImageSize: beta
      ? (layer, w, hgt) => {
        const r = aspects.add(layer, w, hgt, model.layers);
        if (r) model.aspect = r;
      }
      : undefined
  });
} catch (err) {
  console.error(err);
}
const syncLayers = () => renderer?.setLayers(model.layers, resolveSrc, slotData ? slotData.slots.flatMap((s) => s.layers) : []);

// 숫자키: 정식판은 표정, 베타는 캐릭터 슬롯
window.addEventListener('keydown', (e) => {
  if (!/^[0-9]$/.test(e.key) || e.target.matches?.('input, select')) return;
  const n = (parseInt(e.key, 10) + 9) % 10;
  if (!slotData) {
    expression = n;
    return;
  }
  slot = n;
  model = slotData.slots[n];
  syncLayers();
});
if (beta) {
  watchSlots((slots) => {
    slotData.slots = slots;
    model = slots[slot];
    syncLayers();
  });
}

// ───────── 마우스 · 자동 모션 · 확대 ─────────
let target = { x: 0, y: 0 };
let lastMouse = -Infinity;
let wandering = false;
let panning = false;
const wander = new Wander();
let idleTimer = 0;

document.addEventListener('mousemove', (e) => {
  if (panning) {
    view.x += e.movementX;
    view.y += e.movementY;
    saveView();
  }
  if (renderer) {
    const r = canvas.getBoundingClientRect();
    const [rx, ry, rw, rh] = renderer.cssRect();
    target = pointerTarget(e.clientX, e.clientY, r.left + rx + model.center.x * rw, r.top + ry + model.center.y * rh, rw);
  }
  lastMouse = performance.now();
  wandering = false;
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2000);
});
if (beta) {
  const pinch = pinchZoom(() => canvas.getBoundingClientRect(), view);
  document.addEventListener('mousedown', (e) => {
    if (e.button === 2 || e.button === 1) {
      if (e.button === 1) e.preventDefault();
      panning = true;
    }
  });
  document.addEventListener('mouseup', () => { panning = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelZoom(e, canvas.getBoundingClientRect(), view);
    saveView();
  }, { passive: false });
  document.addEventListener('pointerdown', (e) => pinch.down(e));
  document.addEventListener('pointermove', (e) => {
    if (pinch.move(e)) saveView();
  });
  document.addEventListener('pointerup', (e) => pinch.up(e));
  document.addEventListener('pointercancel', (e) => pinch.up(e));
}

// 마우스를 1.5초 이상 안 움직이면 알아서 둘러본다
function autoMotion(now) {
  if (now - lastMouse < 1500) return;
  if (!wandering) {
    wandering = true;
    wander.reset(target);
  }
  target = wander.update(now, opts.range / 100);
}

// ───────── 마이크 ─────────
let level = 0;
let audio = null;
async function startMic() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no mic api'), { name: 'NotSupportedError' });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio = { ctx, stream };
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -127;
    analyser.maxDecibels = 0;
    analyser.smoothingTimeConstant = 0.4;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    setInterval(() => {
      analyser.getByteFrequencyData(bins);
      level = bins.reduce((a, b) => a + b, 0) / bins.length;
    }, 50);
    // 자동 재생 정책으로 멈춰 있으면 첫 클릭에 다시 켠다
    document.addEventListener('click', () => ctx.resume(), { once: true });
  } catch (err) {
    console.error('마이크를 사용할 수 없어요', err);
    micError.hidden = false;
    micError.textContent = err?.name === 'NotAllowedError'
      ? '마이크 권한이 거부돼서 입이 움직이지 않아요'
      : '마이크를 쓸 수 없어서 입이 움직이지 않아요';
  }
}

// ───────── 웹캠 ─────────
const tracker = new FaceTracker();
const STATUS_TEXT = { off: '', loading: '불러오는 중…', tracking: '얼굴 인식 중', searching: '얼굴을 찾는 중', error: '' };
try {
  const z = JSON.parse(ls.get('ftWebcamZero') || 'null');
  if (z) tracker.zero = z;
  tracker.eyeBase = parseFloat(ls.get('ftWebcamEyeBase') || '0') || 0;
} catch {
  // 저장된 보정값이 없거나 깨졌으면 기본값
}
function renderCam() {
  camToggle.classList.toggle('on', opts.cam);
  camExtra.hidden = !opts.cam;
  const s = tracker.status;
  camStatus.className = `cam-status ${s}`;
  camStatus.textContent = s === 'error'
    ? tracker.error
    : s === 'tracking' && opts.camEyes && !tracker.eyeBase ? '정면 맞추기를 누르면 눈 인식 시작' : STATUS_TEXT[s];
  camCalibrate.hidden = s !== 'tracking';
}
tracker.onStatus = renderCam;
camMirror.checked = opts.mirror;
camEyes.checked = opts.camEyes;
camMirror.addEventListener('change', () => {
  opts.mirror = camMirror.checked;
  ls.set('ftWebcamMirror', opts.mirror ? '1' : '0');
});
camEyes.addEventListener('change', () => {
  opts.camEyes = camEyes.checked;
  ls.set('ftWebcamEyes', opts.camEyes ? '1' : '0');
  renderCam();
});
camToggle.addEventListener('click', () => {
  opts.cam = !opts.cam;
  ls.set('ftWebcam', opts.cam ? '1' : '0');
  if (opts.cam) tracker.start();
  else tracker.stop();
  renderCam();
});
camCalibrate.addEventListener('click', () => {
  tracker.calibrate();
  ls.set('ftWebcamZero', JSON.stringify(tracker.zero));
  if (tracker.eyeBase) ls.set('ftWebcamEyeBase', tracker.eyeBase);
  renderCam();
});

// ───────── 그리기 루프 ─────────
const head = new HeadSpring();
const hairSys = new HairSystem();
const blinker = new Blinker();
const follow = new BlinkFollow();
const mouth = new MouthAnim();
const arms = new ArmSway();
const player = new PosePlayer();
let last = performance.now();
let talking = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (now - last < 1000 / opts.fps - 4) return;
  const dt = (now - last) / 1000;
  last = now;

  const pose = opts.cam ? tracker.pose(opts.mirror) : null;
  let roll;
  if (pose) {
    const t = poseToTarget(pose);
    target = { x: t.x, y: t.y };
    roll = t.roll;
    wandering = false;
    lastMouse = -Infinity;
  } else {
    autoMotion(now);
  }
  head.update(dt, headTarget(target.x, target.y, model.rig, opts.rig, roll), model.rig.bounce);
  const hs = head.state;
  const breath = breathAt(now / 1000, model.rig.breath, model.center);
  const loud = level >= opts.thres;
  if (loud !== talking) {
    talking = loud;
    micIcon.classList.toggle('on', loud);
    micIcon.title = loud ? '말하는 중' : '조용함';
  }
  const eyesShut = opts.cam && opts.camEyes ? tracker.eyesClosed() : null;
  if (beta) renderer.setView(view);
  renderer.render({
    ...(beta
      ? {
        aspect: model.aspect,
        body: model.body,
        arms: arms.update(dt, hs.roll * 0.35, now / 1000),
        hairToContent: true,
        ...player.update(dt, talking, model.body.poses, model.body.playSpeed, now / 1000)
      }
      : {}),
    center: model.center,
    head: hs,
    squash: head.squash,
    breath,
    expression,
    eyesClosed: false,
    blink: eyesShut === null ? blinker.update(now) : follow.update(dt, now, eyesShut, blinker),
    pop: popScale(blinker, now),
    eyes: model.eyes,
    ...mouthState(mouth, dt, talking && now % 400 >= 200, model.mouth.animate),
    hair: hairSys.update(dt, model.layers, hs, now / 1000, breath.hairLag, beta)
  });
}

renderCam();
if (!renderer) {
  nogl.hidden = false;
} else {
  syncLayers();
  startMic();
  if (opts.cam) tracker.start();
  requestAnimationFrame(frame);
}
window.addEventListener('pagehide', () => {
  tracker.stop();
  audio?.stream.getTracks().forEach((t) => t.stop());
  audio?.ctx.close();
});
registerServiceWorker();
