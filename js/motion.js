// 고개 스프링, 호흡, 깜빡임, 입, 머리카락 흔들림 상태를 프레임마다 계산한다.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const BLINK_CLOSE = 0.07;
const BLINK_HOLD = 0.05;
const BLINK_OPEN = 0.09;

export class Motion {
  constructor() {
    this.time = 0;
    this.head = { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0 };
    this.pointer = { x: 0, y: 0 };
    this.squash = [1, 1];

    this.eyesHeld = false;       // '눈 감기' 버튼
    this.blinkStart = -1;        // 깜빡임 시작 시각
    this.blinkValue = 0;         // 0 뜸 ~ 1 감음
    this.reopenAt = -1;          // 다시 뜬 시각 (통통 효과)
    this.nextAutoBlink = 2;

    this.mouthHeld = false;      // '입 열기' 버튼
    this.talkUntil = 0;          // '말해 보기'
    this.talkOpen = false;
    this.talkNext = 0;
    this.micOpen = false;
    this.mouthTarget = false;
    this.mouthValue = 0;

    this.swing = new Map();      // 레이어 id → { tip, v, tipY, vy }
  }

  setPointer(nx, ny) {
    this.pointer.x = clamp(nx, -1, 1);
    this.pointer.y = clamp(ny, -1, 1);
  }

  blink() {
    if (this.blinkStart < 0) this.blinkStart = this.time;
  }

  talk(seconds = 2.5) {
    this.talkUntil = this.time + seconds;
  }

  update(dt, s, opts) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const t = this.time;
    const e = s.elastic / 100;

    // 고개 목표값
    let tx = 0;
    let ty = 0;
    let tr = 0;
    if (s.headMode === 'mouse') {
      tx = this.pointer.x;
      ty = this.pointer.y;
      tr = -tx * 0.35;
    } else if (s.headMode === 'auto') {
      tx = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.12;
      ty = Math.sin(t * 0.9 + 1) * 0.35;
      tr = Math.sin(t * 0.5 + 2) * 0.45;
    }

    // 탄력이 클수록 감쇠가 줄어 지나쳤다 돌아오는 반동이 커진다
    const k = 90;
    const zeta = 1 - 0.75 * e;
    const c = 2 * Math.sqrt(k) * zeta;
    const h = this.head;
    h.vx += (k * (tx - h.x) - c * h.vx) * dt;
    h.vy += (k * (ty - h.y) - c * h.vy) * dt;
    h.vr += (k * (tr - h.r) - c * h.vr) * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.r += h.vr * dt;

    const sq = clamp(Math.hypot(h.vx, h.vy) * 0.02 * e, 0, 0.07);
    if (Math.abs(h.vx) >= Math.abs(h.vy)) this.squash = [1 + sq, 1 - sq * 0.7];
    else this.squash = [1 - sq * 0.7, 1 + sq];

    const breath = Math.sin((t / 4) * Math.PI * 2) * (s.breath / 100);

    // 깜빡임
    if (opts.autoBlink && t >= this.nextAutoBlink) {
      this.blink();
      this.nextAutoBlink = t + 2 + Math.random() * 4;
    }
    let b = 0;
    if (this.blinkStart >= 0) {
      const bt = t - this.blinkStart;
      if (bt < BLINK_CLOSE) b = bt / BLINK_CLOSE;
      else if (bt < BLINK_CLOSE + BLINK_HOLD) b = 1;
      else if (bt < BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN) b = 1 - (bt - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
      else {
        this.blinkStart = -1;
        this.reopenAt = t;
      }
    }
    const heldTarget = this.eyesHeld ? 1 : 0;
    if (this.eyesHeld || this.blinkValue > b) {
      const step = dt / (this.eyesHeld ? BLINK_CLOSE : BLINK_OPEN);
      const prev = this.blinkValue;
      this.blinkValue = heldTarget > prev ? Math.min(1, prev + step) : Math.max(b, prev - step);
      if (prev > 0 && this.blinkValue === 0) this.reopenAt = t;
    } else {
      this.blinkValue = b;
    }
    const bv = this.blinkValue;
    let eyeBounce = 1;
    if (bv > 0) eyeBounce = 1 - 0.25 * bv;
    else if (this.reopenAt >= 0) {
      const rt = t - this.reopenAt;
      eyeBounce = 1 + 0.18 * Math.exp(-rt * 7) * Math.sin(rt * 22);
      if (rt > 1) this.reopenAt = -1;
    }

    // 입
    if (t < this.talkUntil) {
      if (t >= this.talkNext) {
        this.talkOpen = !this.talkOpen;
        this.talkNext = t + 0.08 + Math.random() * 0.14;
      }
    } else {
      this.talkOpen = false;
    }
    this.mouthTarget = this.mouthHeld || this.talkOpen || this.micOpen;
    if (s.mouthAnim) {
      const speed = this.mouthTarget ? 1 / 0.08 : 1 / 0.07;
      this.mouthValue = this.mouthTarget
        ? Math.min(1, this.mouthValue + speed * dt)
        : Math.max(0, this.mouthValue - speed * dt);
    } else {
      this.mouthValue = this.mouthTarget ? 1 : 0;
    }

    // 머리카락: 끝부분이 고개 이동을 늦게 따라온다
    const yawS = s.yaw / 100;
    const pitchS = s.pitch / 100;
    for (const id of opts.physicsIds) {
      let st = this.swing.get(id);
      const dx = h.x * yawS * 0.06 + h.r * 0.05;
      const dy = h.y * pitchS * 0.04 + breath * 0.004;
      if (!st) {
        st = { tip: dx, v: 0, tipY: dy, vy: 0 };
        this.swing.set(id, st);
      }
      st.dx = dx;
      st.dy = dy;
      st.v += (50 * (dx - st.tip) - 4 * st.v) * dt;
      st.tip += st.v * dt;
      st.vy += (60 * (dy - st.tipY) - 5 * st.vy) * dt;
      st.tipY += st.vy * dt;
    }

    return {
      head: [h.x * yawS, h.y * pitchS, h.r * 0.22 * (s.roll / 100)],
      squash: this.squash,
      breath,
      blink: bv,
      eyeBounce,
      mouth: this.mouthValue,
      mouthOpen: s.mouthAnim ? this.mouthValue > 0.02 : this.mouthTarget
    };
  }

  swingOf(id) {
    const st = this.swing.get(id);
    if (!st) return [0, 0];
    const dx = st.tip - st.dx;
    const dy = st.tipY - st.dy;
    return [clamp(dx * 2.2, -0.12, 0.12), clamp(dy * 1.5, -0.06, 0.06)];
  }

  forget(id) {
    this.swing.delete(id);
  }
}

// 마이크 소리 크기로 입을 연다. 잡음 수준을 따라가며 문턱값을 자동으로 맞춘다.
export class MicInput {
  constructor() {
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.floor = 0.01;
    this.lastLoud = -1;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 마이크를 지원하지 않아요.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser);
  }

  isOpen(now) {
    if (!this.analyser) return false;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    this.floor = rms < this.floor ? rms * 0.2 + this.floor * 0.8 : this.floor * 0.999 + rms * 0.001;
    const threshold = Math.max(0.012, this.floor * 3);
    if (rms > threshold) this.lastLoud = now;
    return this.lastLoud >= 0 && now - this.lastLoud < 0.1;
  }

  stop() {
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
  }
}
