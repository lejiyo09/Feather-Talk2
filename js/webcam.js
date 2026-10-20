// 웹캠 얼굴 추적 (선택 기능). MediaPipe Tasks Vision의 FaceLandmarker로 고개 각도와 눈 감김을 읽는다.
// 영상은 화면에 띄우지 않고 어디로도 보내지 않는다. 모듈·모델은 처음 켤 때 CDN에서 받는다.
const VISION_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const DETECT_MS = 66;
const LOST_MS = 1000;
const SMOOTH = 0.5;
const EYE_SAMPLES = 8;
// 눈 위·아래, 바깥·안쪽 꼬리 랜드마크 번호 (왼눈, 오른눈)
const EYES = [
  { top: 159, bottom: 145, outer: 33, inner: 133 },
  { top: 386, bottom: 374, outer: 263, inner: 362 }
];

// 눈 세로/가로 비율 평균
function eyeOpenness(lm, w, h) {
  const dist = (a, b) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h, (a.z - b.z) * w);
  let sum = 0;
  for (const e of EYES) sum += dist(lm[e.top], lm[e.bottom]) / Math.max(1e-6, dist(lm[e.outer], lm[e.inner]));
  return sum / EYES.length;
}

// 4×4 변환 행렬(열 우선)에서 yaw, pitch, roll
function anglesOf(m) {
  const at = (r, c) => m[c * 4 + r];
  return {
    yaw: Math.atan2(at(0, 2), at(2, 2)),
    pitch: -Math.asin(Math.max(-1, Math.min(1, at(1, 2)))),
    roll: Math.atan2(at(0, 1), at(1, 1))
  };
}

export class FaceTracker {
  status = 'off'; // off | loading | searching | tracking | error
  error = '';
  zero = { yaw: 0, pitch: 0, roll: 0 };
  eyeBase = 0;
  onStatus = null;
  video = null;
  stream = null;
  landmarker = null;
  timer = 0;
  raw = null;
  eyeRecent = [];
  closed = false;
  closedCount = 0;
  lastSeen = -Infinity;
  running = false;

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus?.(s);
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.error = '';
    this.setStatus('loading');
    let stage = 'camera';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera api'), { name: 'NotSupportedError' });
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: { ideal: 15, max: 30 }, facingMode: 'user' },
        audio: false
      });
      if (!this.running) return this.stop();
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0';
      v.srcObject = this.stream;
      document.body.append(v);
      await v.play();
      this.video = v;

      stage = 'model';
      const { FaceLandmarker, FilesetResolver } = await import(/* @vite-ignore */ VISION_MODULE);
      const files = await FilesetResolver.forVisionTasks(VISION_WASM);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false
      });
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(files, options('GPU'));
      } catch {
        this.landmarker = await FaceLandmarker.createFromOptions(files, options('CPU'));
      }
      if (!this.running) return this.stop();
      this.setStatus('searching');
      this.timer = setInterval(() => this.detect(), DETECT_MS);
    } catch (err) {
      console.error('웹캠 추적을 시작하지 못했어요', err);
      if (stage === 'model') this.error = '얼굴 인식 모듈을 받지 못했어요 (인터넷 연결 확인)';
      else if (err?.name === 'NotAllowedError') this.error = '카메라 권한이 거부됐어요';
      else if (err?.name === 'NotFoundError') this.error = '카메라를 찾지 못했어요';
      else this.error = '카메라를 쓸 수 없어요';
      this.stop();
      this.setStatus('error');
    }
  }

  detect() {
    const v = this.video;
    const lm = this.landmarker;
    if (!v || !lm || v.readyState < 2) return;
    const now = performance.now();
    let res;
    try {
      res = lm.detectForVideo(v, now);
    } catch (err) {
      console.error(err);
      return;
    }
    const matrix = res.facialTransformationMatrixes?.[0];
    const marks = res.faceLandmarks?.[0];
    if (matrix) {
      const a = anglesOf(matrix.data);
      const r = this.raw;
      this.raw = r
        ? { yaw: r.yaw + (a.yaw - r.yaw) * SMOOTH, pitch: r.pitch + (a.pitch - r.pitch) * SMOOTH, roll: r.roll + (a.roll - r.roll) * SMOOTH }
        : a;
      this.lastSeen = now;
      this.setStatus('tracking');
      if (marks) this.updateEyes(eyeOpenness(marks, v.videoWidth || 320, v.videoHeight || 240));
    } else if (now - this.lastSeen > LOST_MS) {
      this.raw = null;
      this.setStatus('searching');
    }
  }

  // 평소 뜬 눈 대비 55% 미만이 두 번 연속이면 감음, 70% 넘으면 뜸
  updateEyes(open) {
    this.eyeRecent.push(open);
    if (this.eyeRecent.length > EYE_SAMPLES) this.eyeRecent.shift();
    if (!this.eyeBase) {
      this.closed = false;
      return;
    }
    const ratio = open / this.eyeBase;
    this.closedCount = ratio < 0.55 ? this.closedCount + 1 : 0;
    if (this.closedCount >= 2) this.closed = true;
    else if (ratio > 0.7) this.closed = false;
  }

  eyesClosed() {
    return this.status === 'tracking' && this.raw && this.eyeBase ? this.closed : null;
  }

  // 지금 자세를 정면으로, 지금 눈 뜬 정도를 기준으로
  calibrate() {
    if (this.raw) this.zero = { ...this.raw };
    if (this.eyeRecent.length) {
      this.eyeBase = this.eyeRecent.reduce((a, b) => a + b, 0) / this.eyeRecent.length;
      this.closed = false;
      this.closedCount = 0;
    }
  }

  pose(mirror) {
    if (!this.raw || this.status !== 'tracking') return null;
    const s = mirror ? -1 : 1;
    return {
      yaw: (this.raw.yaw - this.zero.yaw) * s,
      pitch: this.raw.pitch - this.zero.pitch,
      roll: (this.raw.roll - this.zero.roll) * s
    };
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video?.remove();
    this.video = null;
    this.raw = null;
    this.eyeRecent = [];
    this.closed = false;
    this.closedCount = 0;
    if (this.status !== 'error') this.setStatus('off');
  }
}
