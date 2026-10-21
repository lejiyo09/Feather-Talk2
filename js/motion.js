// 움직임 계산: 고개 스프링, 머리카락 관성, 호흡, 깜빡임, 입, 자동 두리번거림.
// 스프링은 1/120초 고정 간격으로 적분해 프레임 속도와 무관하게 같은 움직임을 낸다.
const STEP = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function spring(s, target, k, c, dt) {
  const acc = k * (target - s.x) - c * s.v;
  s.v += acc * dt;
  s.x += s.v * dt;
}

// 고개: 탄력(bounce)이 클수록 감쇠가 줄어 지나쳤다 돌아온다
export class HeadSpring {
  yaw = { x: 0, v: 0 };
  pitch = { x: 0, v: 0 };
  roll = { x: 0, v: 0 };
  acc = 0;
  bounce = 50;

  update(dt, target, bounce = 50) {
    this.bounce = bounce;
    const zeta = bounce <= 50 ? 1 - bounce * 0.009 : 0.55 - (bounce - 50) * 0.007;
    const c = 2 * zeta * 8; // k = 64
    for (this.acc += Math.min(dt, 0.1); this.acc >= STEP; this.acc -= STEP) {
      spring(this.yaw, target.yaw, 64, c, STEP);
      spring(this.pitch, target.pitch, 64, c, STEP);
      spring(this.roll, target.roll, 64, c, STEP);
    }
  }

  get state() {
    return { yaw: this.yaw.x, pitch: this.pitch.x, roll: this.roll.x };
  }

  // 빠르게 돌 때 가로로 늘어나고 세로로 납작해진다
  get squash() {
    const k = this.bounce / 50;
    const s = Math.min(Math.abs(this.yaw.v) * 0.02 * k, 0.03 * k);
    return [1 + s, 1 - s * 0.5];
  }
}

class HairSim {
  x = { x: 0, v: 0 };
  y = { x: 0, v: 0 };
  a = { x: 0, v: 0 };
  acc = 0;
  phase = Math.random() * 10;
  rootX = 0;
  rootY = 0;
  t = 0;

  update(dt, hair, head, t) {
    const k = 20 + hair.stiffness * 2;
    const c = 2 * Math.max(0.06, 1 - hair.bounce * 0.014) * Math.sqrt(k);
    const tx = Math.sin(head.yaw) * 0.3;
    const ty = Math.sin(head.pitch) * 0.3;
    for (this.acc += Math.min(dt, 0.1); this.acc >= STEP; this.acc -= STEP) {
      spring(this.x, tx, k, c, STEP);
      spring(this.y, ty, k, c, STEP);
      spring(this.a, -head.roll * 0.8, k, c, STEP);
    }
    this.rootX = tx;
    this.rootY = ty;
    this.t = t;
  }

  output(hair, breathLag = 0) {
    const n = hair.sway / 50;
    // 가만히 있어도 살짝 살랑거림
    const idle = Math.sin(this.t * 1.7 + this.phase) * 0.004 + Math.sin(this.t * 0.9 + this.phase * 2) * 0.003;
    const lim = (v) => clamp(v, -0.15, 0.15);
    return {
      offset: [lim((this.x.x - this.rootX) * n + idle * n), lim((this.y.x - this.rootY) * n * 0.5 + breathLag * 0.016 * n)],
      angle: this.a.x * Math.min(n, 1.5) + breathLag * 0.04 * n
    };
  }
}

// 흔들림 물리를 켠 레이어마다 시뮬레이션 하나
export class HairSystem {
  sims = new Map();
  out = new Map();

  // allowBody: 베타에서는 몸 레이어(치마·꼬리 등)도 흔든다
  update(dt, layers, head, t, breathLag = 0, allowBody = false) {
    const live = new Set();
    for (const l of layers) {
      if (!l.hair.enabled || (l.part !== 'head' && !allowBody)) continue;
      live.add(l.id);
      let sim = this.sims.get(l.id);
      if (!sim) {
        sim = new HairSim();
        this.sims.set(l.id, sim);
      }
      sim.update(dt, l.hair, head, t);
      this.out.set(l.id, sim.output(l.hair, breathLag));
    }
    for (const id of [...this.sims.keys()]) {
      if (!live.has(id)) {
        this.sims.delete(id);
        this.out.delete(id);
      }
    }
    return this.out;
  }
}

// 몸 리깅: 팔이 어깨에 매달려 기울기 반대로 흔들리고, 살짝 살랑인다
export class ArmSway {
  upper = { x: 0, v: 0 };
  fore = { x: 0, v: 0 };
  acc = 0;
  update(dt, tilt, t) {
    for (this.acc += Math.min(dt, 0.1); this.acc >= STEP; this.acc -= STEP) {
      spring(this.upper, -tilt * 1.3, 40, 0.44 * Math.sqrt(40), STEP);
      spring(this.fore, -this.upper.x * 0.5, 25, 2.2, STEP);
    }
    const idle = Math.sin(t * 1.6) * 0.02;
    return { upperL: this.upper.x - idle, foreL: this.fore.x, upperR: this.upper.x + idle, foreR: this.fore.x };
  }
}

// 연주 포즈: 연주 중이면 동작 1·2를 오가고, 끝나면 기본 자세로 부드럽게 돌아온다
export class PosePlayer {
  w = 0;
  update(dt, playing, poses, speed, t) {
    const d = Math.min(dt, 0.1);
    this.w = playing ? Math.min(1, this.w + d / 0.15) : Math.max(0, this.w - d / 0.3);
    if (this.w === 0) return { pose: [], poseLen: [] };
    const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * speed * t);
    const w = this.w * this.w * (3 - 2 * this.w);
    const lerp = (a, b) => a + (b - a) * k;
    return {
      pose: poses.a.map((a, i) => w * lerp(a, poses.b[i] || 0)),
      poseLen: poses.a.map((_, i) => 1 + w * (lerp(poses.aLen?.[i] ?? 1, poses.bLen?.[i] ?? 1) - 1))
    };
  }
}

// 호흡: 4초 주기. 얼굴 중심이 그림 아래쪽일수록 머리 오르내림이 줄어든다
const BREATH_PERIOD = 4;
export function breathAt(t, strength, center) {
  const k = strength / 50;
  const phase = (t * Math.PI * 2) / BREATH_PERIOD;
  const s = Math.sin(phase) * 0.006 * k;
  return { bodyStretch: s, headBob: (Math.min(1, center.y + center.r) - 1) * s, hairLag: Math.sin(phase - 0.9) * k };
}

// 입: 열릴 때 0.07초, 닫힐 때 0.05초
export class MouthAnim {
  amount = 0;
  update(dt, open) {
    const d = Math.min(dt, 0.1);
    this.amount = open ? Math.min(1, this.amount + d / 0.07) : Math.max(0, this.amount - d / 0.05);
    return this.amount;
  }
  get open() {
    return this.amount > 0;
  }
  get eased() {
    return 1 - (1 - this.amount) ** 2;
  }
}

export function mouthState(anim, dt, open, animate) {
  if (!animate) return { mouthOpen: open };
  anim.update(dt, open);
  return { mouthOpen: anim.open, mouthAmount: anim.eased };
}

// 깜빡임 시간 (ms)
const CLOSE_MS = 70;
const HOLD_MS = 40;
const OPEN_MS = 110;

// 자동 깜빡임: 2~6초마다, 가끔(15%) 두 번 연속
export class Blinker {
  next = 1500 + Math.random() * 2000;
  start = -1;
  twice = false;
  openAt = -Infinity;

  trigger(now) {
    this.start = now;
  }

  update(now, auto = true) {
    if (this.start < 0 && auto && now >= this.next) this.start = now;
    if (this.start < 0) return 0;
    const t = now - this.start;
    if (t < CLOSE_MS) return 1 - (1 - t / CLOSE_MS) ** 2;
    if (t < CLOSE_MS + HOLD_MS) return 1;
    this.openAt = this.start + CLOSE_MS + HOLD_MS;
    const r = (t - CLOSE_MS - HOLD_MS) / OPEN_MS;
    if (r < 1) return 1 - r * r * (3 - 2 * r);
    this.start = -1;
    this.openAt = now - OPEN_MS;
    if (!this.twice && Math.random() < 0.15) {
      this.twice = true;
      this.next = now + 120;
    } else {
      this.twice = false;
      this.next = now + 2000 + Math.random() * 4000;
    }
    return 0;
  }
}

// 웹캠으로 눈 감김을 따라갈 때의 부드러운 전환
export class BlinkFollow {
  value = 0;
  wasClosed = false;
  update(dt, now, closed, blinker) {
    const ms = Math.min(dt, 0.1) * 1000;
    this.value = closed ? Math.min(1, this.value + ms / CLOSE_MS) : Math.max(0, this.value - ms / OPEN_MS);
    if (this.wasClosed && !closed && blinker) blinker.openAt = now;
    this.wasClosed = closed;
    return closed ? 1 - (1 - this.value) ** 2 : this.value * this.value * (3 - 2 * this.value);
  }
}

// '깜빡일 때 통통': 감을 때 눌리고, 뜬 뒤 탄성 있게 튀었다 돌아온다
export function popScale(blinker, now) {
  if (blinker.start >= 0) {
    const t = now - blinker.start;
    if (t < CLOSE_MS + HOLD_MS) return 1 - 0.3 * Math.min(1, t / CLOSE_MS);
  }
  const s = (now - blinker.openAt) / 1000;
  if (s < 0 || s > 0.8) return 1;
  return 1 - 0.3 * Math.exp(-s / 0.12) * Math.cos((2 * Math.PI * s) / 0.26);
}

// 자동 흔들기: 범위 안의 임의 지점으로 일정한 속도로 옮겨 다닌다
export class Wander {
  pos = { x: 0, y: 0 };
  to = { x: 0, y: 0 };
  last = -1;

  reset(p) {
    this.pos = { ...p };
    this.to = { ...p };
    this.last = -1;
  }

  update(now, range = 0.7, speed = range * 0.95) {
    const dt = this.last < 0 ? 0 : Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    let dx = this.to.x - this.pos.x;
    let dy = this.to.y - this.pos.y;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) {
      do {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * range;
        this.to = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      } while (Math.hypot(this.to.x - this.pos.x, this.to.y - this.pos.y) < range * 0.4);
      dx = this.to.x - this.pos.x;
      dy = this.to.y - this.pos.y;
      d = Math.hypot(dx, dy);
    }
    const step = Math.min(d, speed * dt);
    this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
    return this.pos;
  }
}

// 0.8을 넘으면 부드럽게 1로 수렴
function softLimit(x, y) {
  const d = Math.hypot(x, y);
  if (d <= 0.8) return { x, y };
  const k = (0.8 + 0.2 * Math.tanh((d - 0.8) / 0.2)) / d;
  return { x: x * k, y: y * k };
}

// 포인터 위치 → 시선 목표 (얼굴 중심 기준, 그림 폭의 60%가 1)
export function pointerTarget(px, py, fx, fy, width) {
  const s = width * 0.6;
  return { x: (px - fx) / s, y: (py - fy) / s };
}

// 시선 목표 → 고개 각도. strength는 '리깅 강도'(기본 60)
export function headTarget(x, y, rig, strength = 100, roll) {
  const k = strength / 100;
  ({ x, y } = softLimit(x, y));
  const r = roll === undefined ? x : clamp(roll, -1, 1);
  return {
    yaw: ((x * 0.35 * rig.yaw) / 100) * k,
    pitch: ((y * 0.25 * rig.pitch) / 100) * k,
    roll: ((r * 0.13 * rig.roll) / 100) * k
  };
}

// 웹캠 자세(라디안) → 시선 목표
export function poseToTarget(p) {
  return { x: p.yaw / 0.5, y: p.pitch / 0.35, roll: p.roll / 0.35 };
}

// 라이브 '리깅 강도' (편집기 미리보기도 같은 값을 쓴다)
export function rigStrength() {
  try {
    const v = parseInt(localStorage.getItem('ftRig') || '', 10);
    return Number.isNaN(v) ? 60 : v;
  } catch {
    return 60;
  }
}
