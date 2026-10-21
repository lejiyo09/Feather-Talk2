// 멀티(베타): 여러 캐릭터를 한 무대에 놓고, 화면 캡처(SYNCROOM·Discord 등)에서 말하는 사람을 감지한다.
import { getFile, putFile, resolveSrc } from './model.js';
import { createRenderer } from './renderer.js';
import {
  HeadSpring, HairSystem, Blinker, MouthAnim, Wander, ArmSway, PosePlayer, breathAt, mouthState, popScale, headTarget
} from './motion.js';
import { h } from './ui.js';

const SETTINGS_KEY = 'ftMulti';

// 감지 방식별 기본값
export const DETECT_MODES = {
  syncroom: { label: 'SYNCROOM 레벨미터', activity: 6, margin: 25, color: '#2ecc40' },
  discord: { label: 'Discord 말하는 테두리', activity: 10, margin: 60, color: '#23a55a' },
  color: { label: '색 직접 고르기', activity: 10, margin: 60, color: '#23a55a' }
};

function defaultChar(i) {
  return { on: i < 2, region: null, x: 10 + (i % 5) * 18, y: 30, w: 22, motion: true };
}

export function defaultSettings() {
  return {
    detect: { mode: 'syncroom', activity: DETECT_MODES.syncroom.activity, margin: DETECT_MODES.syncroom.margin, color: DETECT_MODES.syncroom.color, hold: 350 },
    crop: null,
    background: '#00ff00',
    chars: Array.from({ length: 10 }, (_, i) => defaultChar(i)),
    objects: [],
    order: Array.from({ length: 10 }, (_, i) => `c${i}`)
  };
}

export function loadSettings() {
  const d = defaultSettings();
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!raw) return d;
    const s = { ...d, ...raw, detect: { ...d.detect, ...raw.detect } };
    if (typeof s.background !== 'string') s.background = d.background;
    s.chars = d.chars.map((c, i) => ({ ...c, ...(raw.chars?.[i] || {}) }));
    s.objects = raw.objects || [];
    const keys = [...s.chars.map((_, i) => `c${i}`), ...s.objects.map((o) => `o:${o.id}`)];
    s.order = [...(raw.order || []).filter((k) => keys.includes(k)), ...keys.filter((k) => !(raw.order || []).includes(k))];
    return s;
  } catch {
    return d;
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch (err) {
    console.error('멀티 설정을 저장하지 못했어요', err);
    return false;
  }
}

export async function makeObject(file, name) {
  return { id: `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, file: await putFile(file), x: 5, y: 5, w: 25 };
}

function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 영역 안에서 '말하는 색' 픽셀 수 (최대 약 4000개만 표본)
function countActive(data, detect) {
  const step = 4 * Math.max(1, Math.floor(data.length / 4 / 4000));
  let n = 0;
  if (detect.mode === 'syncroom') {
    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > 40 && g - r > detect.margin && g - b > detect.margin) n++;
    }
  } else {
    const [cr, cg, cb] = hexRgb(detect.color);
    const lim = detect.margin * detect.margin;
    for (let i = 0; i < data.length; i += step) {
      const dr = data[i] - cr;
      const dg = data[i + 1] - cg;
      const db = data[i + 2] - cb;
      if (dr * dr + dg * dg + db * db < lim) n++;
    }
  }
  return n;
}

// 화면 캡처 → 캐릭터마다 감지 영역의 색을 보고 말하는 중인지 판정 (66ms마다)
export class TalkDetector {
  video = null;
  stream = null;
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  timer = 0;
  lastActive = new Map();
  scores = Array(10).fill(0);
  talking = Array(10).fill(false);
  onFrame = null;
  onStop = null;

  get running() {
    return !!this.stream;
  }

  async start() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('이 브라우저는 화면 캡처를 지원하지 않아요');
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = this.stream;
    await v.play();
    this.video = v;
    // 브라우저의 '공유 중지'를 누르면 같이 멈춘다
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
  }

  sourceRect(crop) {
    const w = this.video?.videoWidth || 0;
    const ht = this.video?.videoHeight || 0;
    const r = crop || { x: 0, y: 0, w: 1, h: 1 };
    return { x: Math.round(r.x * w), y: Math.round(r.y * ht), w: Math.max(1, Math.round(r.w * w)), h: Math.max(1, Math.round(r.h * ht)) };
  }

  // whole: 자르기 영역을 고를 때는 전체 화면을 보여 주고 감지는 쉰다
  tick(settings, whole = false) {
    const v = this.video;
    if (!v || !v.videoWidth) return;
    const src = this.sourceRect(whole ? null : settings.crop);
    if (this.canvas.width !== src.w || this.canvas.height !== src.h) {
      this.canvas.width = src.w;
      this.canvas.height = src.h;
    }
    this.ctx.drawImage(v, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h);
    if (whole) return;
    const now = performance.now();
    settings.chars.forEach((c, i) => {
      if (!c.on || !c.region) {
        this.scores[i] = 0;
        this.talking[i] = false;
        return;
      }
      const r = c.region;
      let n = 0;
      try {
        n = countActive(this.ctx.getImageData(Math.round(r.x * src.w), Math.round(r.y * src.h), Math.max(1, Math.round(r.w * src.w)), Math.max(1, Math.round(r.h * src.h))).data, settings.detect);
      } catch {
        // 영역이 화면 밖이면 0
      }
      this.scores[i] = n;
      if (n > settings.detect.activity) this.lastActive.set(i, now);
      this.talking[i] = now - (this.lastActive.get(i) ?? -Infinity) < settings.detect.hold;
    });
  }

  stop() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    this.talking.fill(false);
    this.scores.fill(0);
    this.onStop?.();
  }

  run(getSettings, isWhole = () => false, isPaused = () => false) {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (isPaused()) return;
      this.tick(getSettings(), isWhole());
      this.onFrame?.();
    }, 66);
  }
}

// 무대 위 캐릭터 하나: 자기 캔버스와 렌더러, 자동으로 두리번거리기, 말하면 입·연주 포즈
function mountCharacter(getModel, getState) {
  const canvas = h('canvas', { class: 'char-canvas' });
  let renderer = null;
  try {
    renderer = createRenderer(canvas, { layout: 'fill', maxTexture: 2048 });
  } catch (err) {
    console.error(err);
  }
  const head = new HeadSpring();
  const hairSys = new HairSystem();
  const blinker = new Blinker();
  const mouth = new MouthAnim();
  const wander = new Wander();
  const arms = new ArmSway();
  const player = new PosePlayer();
  const offset = Math.random() * 5000; // 캐릭터마다 움직임이 겹치지 않게
  let last = performance.now();
  let raf = 0;
  let layersRef = null;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const st = getState();
    if (st.paused || !renderer) {
      last = now;
      return;
    }
    const dt = (now - last) / 1000;
    last = now;
    const m = getModel();
    if (m.layers !== layersRef) {
      layersRef = m.layers;
      renderer.setLayers(m.layers, resolveSrc);
    }
    const t = st.motion ? wander.update(now + offset, 0.5) : { x: 0, y: 0 };
    head.update(dt, headTarget(t.x, t.y, m.rig, 60), m.rig.bounce);
    const hs = head.state;
    const breath = breathAt((now + offset) / 1000, m.rig.breath, m.center);
    renderer.render({
      aspect: m.aspect,
      body: m.body,
      arms: arms.update(dt, hs.roll * 0.35, now / 1000),
      hairToContent: true,
      ...player.update(dt, st.talking, m.body.poses, m.body.playSpeed, (now + offset) / 1000),
      center: m.center,
      head: hs,
      squash: head.squash,
      breath,
      expression: 0,
      eyesClosed: false,
      blink: blinker.update(now),
      pop: popScale(blinker, now),
      eyes: m.eyes,
      ...mouthState(mouth, dt, st.talking && now % 400 >= 200, m.mouth.animate),
      hair: hairSys.update(dt, m.layers, hs, now / 1000, breath.hairLag, true)
    });
  }
  raf = requestAnimationFrame(frame);
  canvas.refreshLayers = () => {
    layersRef = null;
  };
  canvas.destroy = () => {
    cancelAnimationFrame(raf);
    renderer?.destroy();
  };
  return canvas;
}

// 16:9 무대. editable이면 끌어서 옮기고 오른쪽 아래 점으로 크기 조절
export function mountStage({ settings, models, talking, editable = false, paused = () => false, onChange }) {
  const stage = h('div', { class: `stage${editable ? ' editable' : ''}` });
  const objUrls = {};
  const chars = new Map(); // 'c3' → { el, canvas }
  let drag = null;

  function startDrag(e, o) {
    if (!editable) return;
    const r = stage.getBoundingClientRect();
    drag = { o, resize: !!e.target.closest('.handle'), sx: e.clientX, sy: e.clientY, x: o.x, y: o.y, w: o.w, W: r.width, H: r.height };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function moveDrag(e) {
    if (!drag) return;
    const dx = ((e.clientX - drag.sx) / drag.W) * 100;
    const dy = ((e.clientY - drag.sy) / drag.H) * 100;
    if (drag.resize) drag.o.w = Math.max(3, Math.round((drag.w + dx) * 10) / 10);
    else {
      drag.o.x = Math.round((drag.x + dx) * 10) / 10;
      drag.o.y = Math.round((drag.y + dy) * 10) / 10;
    }
    place();
    onChange?.();
  }
  const endDrag = () => {
    drag = null;
  };

  async function loadObjectUrls() {
    for (const o of settings().objects) {
      if (!o.file || objUrls[o.file]) continue;
      const blob = await getFile(o.file).catch(() => null);
      if (blob) objUrls[o.file] = URL.createObjectURL(blob);
    }
  }

  function items() {
    const s = settings();
    return s.order.map((key) => {
      if (key.startsWith('c')) {
        const i = +key.slice(1);
        const c = s.chars[i];
        return c && c.on ? { key, kind: 'char', i, o: c } : null;
      }
      const o = s.objects.find((x) => `o:${x.id}` === key);
      return o ? { key, kind: 'obj', i: -1, o } : null;
    }).filter(Boolean);
  }

  // 위치·크기·겹침 순서만 다시 맞춘다
  function place() {
    const s = settings();
    stage.style.background = s.background;
    items().forEach((it, z) => {
      const el = stage.querySelector(`[data-key="${it.key}"]`);
      if (!el) return;
      Object.assign(el.style, { left: `${it.o.x}%`, top: `${it.o.y}%`, width: `${it.o.w}%`, zIndex: z });
      if (it.kind === 'char') {
        el.style.aspectRatio = `1 / ${models()[it.i]?.aspect || 1}`;
        el.classList.toggle('talking', !!talking()[it.i]);
      }
    });
  }

  // 무대에 올라갈 것이 바뀌면 (캐릭터 켜기/끄기, 오브젝트 추가/삭제) 다시 만든다
  async function build() {
    await loadObjectUrls();
    const list = items();
    const keep = new Set(list.map((it) => it.key));
    for (const [key, c] of chars) {
      if (!keep.has(key)) {
        c.canvas.destroy();
        chars.delete(key);
      }
    }
    const nodes = list.map((it) => {
      let el = stage.querySelector(`[data-key="${it.key}"]`);
      if (!el) {
        el = h('div', { class: 'item', 'data-key': it.key, onpointermove: moveDrag, onpointerup: endDrag, onpointercancel: endDrag });
        if (it.kind === 'char') {
          const idx = it.i;
          const canvas = mountCharacter(() => models()[idx], () => ({ paused: paused(), talking: !!talking()[idx], motion: settings().chars[idx].motion }));
          chars.set(it.key, { canvas });
          el.append(canvas);
        } else {
          el.append(h('img', { src: objUrls[it.o.file] || '', alt: '', draggable: 'false' }));
        }
        if (editable) el.append(h('span', { class: 'tag' }), h('span', { class: 'handle', title: '끌어서 크기 바꾸기' }));
      }
      // 끌기 대상이 바뀐 설정 객체를 가리키도록
      el.onpointerdown = (e) => startDrag(e, it.o);
      const tag = el.querySelector('.tag');
      if (tag) tag.textContent = it.kind === 'char' ? `${(it.i + 1) % 10}번` : it.o.name || '오브젝트';
      return el;
    });
    stage.replaceChildren(...nodes);
    place();
  }

  build();
  stage.rebuild = build;
  stage.place = place;
  stage.refreshModels = () => {
    for (const c of chars.values()) c.canvas.refreshLayers();
    place();
  };
  stage.destroy = () => {
    for (const c of chars.values()) c.canvas.destroy();
    chars.clear();
  };
  return stage;
}
