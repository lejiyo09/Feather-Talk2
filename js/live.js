import { loadModel, resolveSrc } from './model.js';
import { createRenderer } from './renderer.js';
import {
  HeadSpring, HairSystem, Blinker, BlinkFollow, MouthAnim, Wander, breathAt, mouthState, popScale,
  pointerTarget, headTarget, poseToTarget
} from './motion.js';
import { FaceTracker } from './webcam.js';
import { fillIcons } from './icons.js';
import { registerServiceWorker } from './pwa.js';

const $ = (s) => document.querySelector(s);

// 라이브 설정은 원본과 같은 localStorage 키에 따로 저장한다
function readInt(key, def) {
  try {
    const v = parseInt(localStorage.getItem(key) || '', 10);
    return Number.isNaN(v) ? def : v;
  } catch {
    return def;
  }
}
function read(key, def) {
  try {
    return localStorage.getItem(key) ?? def;
  } catch {
    return def;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 저장 못 해도 지금 화면에는 적용된다
  }
}

const opts = {
  thres: readInt('ftThres', 30),
  rig: readInt('ftRig', 60),
  range: readInt('ftMotionRange', 70),
  fps: readInt('ftFps', 60),
  color: read('ftColor', '#00ff00'),
  cam: read('ftWebcam', '0') === '1',
  mirror: read('ftWebcamMirror', '1') !== '0',
  camEyes: read('ftWebcamEyes', '0') === '1'
};

function bindRange(id, key, prop) {
  const el = $(id);
  el.value = opts[prop];
  el.addEventListener('input', () => {
    opts[prop] = Number(el.value);
    write(key, opts[prop]);
  });
}
bindRange('#thres', 'ftThres', 'thres');
bindRange('#rig', 'ftRig', 'rig');
bindRange('#range', 'ftMotionRange', 'range');
$('#fps').value = String(opts.fps);
$('#fps').addEventListener('change', (e) => {
  opts.fps = Number(e.target.value);
  write('ftFps', opts.fps);
});
const colorInput = $('#color');
colorInput.value = opts.color;
document.body.style.backgroundColor = opts.color;
colorInput.addEventListener('input', () => {
  opts.color = colorInput.value;
  document.body.style.backgroundColor = opts.color;
  write('ftColor', opts.color);
});

// ───────── 모델 · 렌더러 ─────────
const model = loadModel();
const canvas = $('#stage');
let renderer = null;
try {
  renderer = createRenderer(canvas, { layout: 'bottom' });
} catch (err) {
  console.error(err);
}

let expression = 0;
window.addEventListener('keydown', (e) => {
  if (!/^[0-9]$/.test(e.key) || e.target.matches?.('input, select')) return;
  expression = (parseInt(e.key, 10) + 9) % 10;
});

// ───────── 마우스 · 자동 모션 ─────────
let target = { x: 0, y: 0 };
let lastMouse = -Infinity;
let wandering = false;
const wander = new Wander();
let idleTimer = 0;

document.addEventListener('mousemove', (e) => {
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
  const errEl = $('#mic-error');
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
    errEl.hidden = false;
    errEl.textContent = err?.name === 'NotAllowedError'
      ? '마이크 권한이 거부돼서 입이 움직이지 않아요'
      : '마이크를 쓸 수 없어서 입이 움직이지 않아요';
  }
}

// ───────── 웹캠 ─────────
const tracker = new FaceTracker();
const STATUS_TEXT = { off: '', loading: '불러오는 중…', tracking: '얼굴 인식 중', searching: '얼굴을 찾는 중', error: '' };
try {
  const z = JSON.parse(read('ftWebcamZero', 'null'));
  if (z) tracker.zero = z;
  tracker.eyeBase = parseFloat(read('ftWebcamEyeBase', '0')) || 0;
} catch {
  // 저장된 보정값이 없거나 깨졌으면 기본값
}

function renderCam() {
  $('#cam-toggle').classList.toggle('on', opts.cam);
  $('#cam-extra').hidden = !opts.cam;
  const s = tracker.status;
  const el = $('#cam-status');
  el.className = `cam-status ${s}`;
  el.textContent = s === 'error'
    ? tracker.error
    : s === 'tracking' && opts.camEyes && !tracker.eyeBase ? '정면 맞추기를 누르면 눈 인식 시작' : STATUS_TEXT[s];
  $('#cam-calibrate').hidden = s !== 'tracking';
}
tracker.onStatus = renderCam;
$('#cam-mirror').checked = opts.mirror;
$('#cam-eyes').checked = opts.camEyes;
$('#cam-mirror').addEventListener('change', (e) => {
  opts.mirror = e.target.checked;
  write('ftWebcamMirror', opts.mirror ? '1' : '0');
});
$('#cam-eyes').addEventListener('change', (e) => {
  opts.camEyes = e.target.checked;
  write('ftWebcamEyes', opts.camEyes ? '1' : '0');
  renderCam();
});
$('#cam-toggle').addEventListener('click', () => {
  opts.cam = !opts.cam;
  write('ftWebcam', opts.cam ? '1' : '0');
  if (opts.cam) tracker.start();
  else tracker.stop();
  renderCam();
});
$('#cam-calibrate').addEventListener('click', () => {
  tracker.calibrate();
  write('ftWebcamZero', JSON.stringify(tracker.zero));
  if (tracker.eyeBase) write('ftWebcamEyeBase', tracker.eyeBase);
  renderCam();
});

// ───────── 그리기 루프 ─────────
const head = new HeadSpring();
const hairSys = new HairSystem();
const blinker = new Blinker();
const follow = new BlinkFollow();
const mouth = new MouthAnim();
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
    const mic = $('#mic-icon');
    mic.classList.toggle('on', loud);
    mic.title = loud ? '말하는 중' : '조용함';
  }
  const camEyes = opts.cam && opts.camEyes ? tracker.eyesClosed() : null;
  renderer.render({
    center: model.center,
    head: hs,
    squash: head.squash,
    breath,
    expression,
    eyesClosed: false,
    blink: camEyes === null ? blinker.update(now) : follow.update(dt, now, camEyes, blinker),
    pop: popScale(blinker, now),
    eyes: model.eyes,
    ...mouthState(mouth, dt, talking && now % 400 >= 200, model.mouth.animate),
    hair: hairSys.update(dt, model.layers, hs, now / 1000, breath.hairLag)
  });
}

fillIcons();
renderCam();
if (!renderer) {
  $('#nogl').hidden = false;
} else {
  renderer.setLayers(model.layers, resolveSrc);
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
