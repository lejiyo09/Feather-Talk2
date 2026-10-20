// WebGL 렌더러. 레이어마다 64×64 격자를 정점 셰이더에서 변형한다.
// 좌표는 그림 가로 = 1 단위 (세로는 0 ~ aspect).
import { BLINK_CLOSED, isLayerShown } from './model.js';

const GRID = 64;

const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec3 uRect;       // 그림이 놓인 화면 위치 x, y, 가로 길이 (px)
uniform float uAspect;
uniform vec3 uCenter;     // 얼굴 중심 x, y, 반지름
uniform vec3 uHead;       // yaw, pitch, roll (라디안)
uniform vec2 uSquash;
uniform vec2 uBreath;     // 몸 늘어남, 머리 오르내림
uniform float uSeg;       // 0 머리, 1 몸
uniform float uDepth;
uniform float uCurve;
uniform float uHairOn;
uniform float uAnchorY;
uniform float uHairDir;   // 1: 고정선 아래가 흔들림, -1: 위가 흔들림
uniform float uHairEnd;
uniform vec2 uHairOffset;
uniform float uHairAngle;
uniform vec3 uEyeBand;    // 눈 영역 가운데, 반높이, 눌림(1이면 그대로)
uniform float uPop;
uniform vec4 uMouth;      // 입 가운데 x, y, 가로 배율, 세로 배율
varying vec2 vUv;

vec2 rotate2(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
  vUv = aPos;
  float A = uAspect;
  vec2 m = vec2(aPos.x, aPos.y * A);

  // 눈 감기: 눈 영역 띠 안쪽만 세로로 누르고, 위 눈꺼풀이 더 내려오게 축을 살짝 아래로
  if (uEyeBand.z < 0.999) {
    float pivot = uEyeBand.x + uEyeBand.y * 0.3;
    float inside = 1.0 - smoothstep(uEyeBand.y, uEyeBand.y * 1.5, abs(m.y - uEyeBand.x));
    m.y = pivot + (m.y - pivot) * mix(1.0, uEyeBand.z, inside);
  }
  // 깜빡일 때 통통: 눈 높이를 축으로 세로 배율
  if (uPop != 1.0) m.y = uEyeBand.x + (m.y - uEyeBand.x) * uPop;
  // 입 벌림: 벌린 입 그림의 가운데를 축으로 크기 변화
  if (uMouth.w != 1.0) m = uMouth.xy + (m - uMouth.xy) * uMouth.zw;

  // 머리카락/장식: 고정선에서 멀수록 크게 휘고 밀린다
  if (uHairOn > 0.5) {
    float t = uHairDir > 0.0
      ? (m.y - uAnchorY) / max(uHairEnd - uAnchorY, 0.001)
      : (uAnchorY - m.y) / max(uAnchorY - uHairEnd, 0.001);
    float w = pow(smoothstep(0.0, 1.0, t), 1.5);
    vec2 a = vec2(m.x, uAnchorY);
    m = a + rotate2(m - a, uHairAngle * w) + uHairOffset * w;
  }

  if (uSeg < 0.5) {
    // 머리: 얼굴 중심의 구면 위에 있다고 보고 회전 (깊이 + 볼록/오목)
    vec2 p = m - uCenter.xy;
    float r2 = clamp(dot(p, p) / (uCenter.z * uCenter.z), 0.0, 1.0);
    float z = uDepth + uCurve * (1.0 - r2);
    p.x = p.x * cos(uHead.x) + z * sin(uHead.x);
    p.y = p.y * cos(uHead.y) + z * sin(uHead.y);
    m = uCenter.xy + p;
    m.y += uBreath.y;
  } else {
    // 몸: 발끝 기준으로 숨쉬며 늘어난다
    m.y = A + (m.y - A) * (1.0 + uBreath.x);
  }
  // 캐릭터 전체: 아래 가운데를 축으로 기울기 + 늘어남/납작해짐
  vec2 feet = vec2(0.5, A);
  m = feet + rotate2((m - feet) * uSquash, uHead.z);

  vec2 px = uRect.xy + m * uRect.z;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
uniform float uAlphaTest;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  if (uAlphaTest > 0.0 && c.a < uAlphaTest) discard;
  gl_FragColor = c * uAlpha;
}`;

const UNIFORMS = ['uRes', 'uRect', 'uAspect', 'uCenter', 'uHead', 'uSquash', 'uBreath', 'uSeg', 'uDepth', 'uCurve',
  'uHairOn', 'uAnchorY', 'uHairDir', 'uHairEnd', 'uHairOffset', 'uHairAngle', 'uTex', 'uAlpha', 'uAlphaTest',
  'uEyeBand', 'uPop', 'uMouth'];

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// 그림의 불투명한 영역(입 가운데 찾기 등)
let probe = null;
function analyze(img) {
  probe ||= (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    return c.getContext('2d', { willReadFrequently: true });
  })();
  probe.clearRect(0, 0, 128, 128);
  probe.drawImage(img, 0, 0, 128, 128);
  const d = probe.getImageData(0, 0, 128, 128).data;
  let x0 = 128, y0 = 128, x1 = -1, y1 = -1;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      if (d[(y * 128 + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return { mid: [0.5, 0.5], top: 0, bottom: 1 };
  return { mid: [(x0 + x1 + 1) / 2 / 128, (y0 + y1 + 1) / 2 / 128], top: y0 / 128, bottom: (y1 + 1) / 128 };
}

// opts.layout: 'center'(편집기, 여백 8%) | 'bottom'(라이브, 아래에 붙임)
export function createRenderer(canvas, opts = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, stencil: true });
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const u = {};
  for (const name of UNIFORMS) u[name] = gl.getUniformLocation(prog, name);

  const verts = [];
  for (let y = 0; y <= GRID; y++) for (let x = 0; x <= GRID; x++) verts.push(x / GRID, y / GRID);
  const idx = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const a = y * (GRID + 1) + x;
      const b = a + GRID + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.uniform1i(u.uTex, 0);

  const textures = new Map(); // 레이어 키 → { tex, ready, mid, top, bottom }
  let layers = [];
  let aspect = 1;

  const keyOf = (l) => `${l.id}|${l.src.type}:${l.src.value}`;

  function maxTexture() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE), Math.ceil(Math.min(screen.width, screen.height) * dpr));
  }

  async function shrink(img) {
    const limit = maxTexture();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (Math.max(w, h) <= limit || typeof createImageBitmap === 'undefined') return img;
    const k = limit / Math.max(w, h);
    try {
      return await createImageBitmap(img, { resizeWidth: Math.round(w * k), resizeHeight: Math.round(h * k), resizeQuality: 'high', premultiplyAlpha: 'premultiply' });
    } catch {
      return img;
    }
  }

  function load(layer, resolve) {
    const key = keyOf(layer);
    if (textures.has(key)) return;
    const entry = { key, tex: null, ready: false, mid: [0.5, 0.5], top: 0, bottom: 1 };
    textures.set(key, entry);
    if (!layer.src.value) return;
    resolve(layer).then((url) => {
      if (!url || textures.get(key) !== entry) return;
      const img = new Image();
      if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          Object.assign(entry, analyze(img));
        } catch {
          // 교차 출처 이미지는 분석을 건너뛴다
        }
        opts.onImageSize?.(layer, img.naturalWidth, img.naturalHeight);
        const src = await shrink(img);
        if (textures.get(key) !== entry) {
          if (src instanceof ImageBitmap) src.close();
          return;
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          if (src instanceof ImageBitmap) src.close();
          entry.tex = tex;
          entry.ready = true;
        } catch {
          gl.deleteTexture(tex);
          opts.onImageError?.(layer);
        }
      };
      img.onerror = () => opts.onImageError?.(layer);
      img.src = url;
    });
  }

  // 그림이 화면에 놓이는 위치 (캔버스 픽셀)
  function placement() {
    const w = canvas.width;
    const h = canvas.height;
    if (opts.layout === 'bottom') {
      const s = Math.min(w, h / aspect);
      return [(w - s) / 2, h - s * aspect, s];
    }
    const s = Math.min(w, h / aspect) * 0.92;
    return [(w - s) / 2, (h - s * aspect) / 2, s];
  }

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  return {
    setLayers(list, resolve) {
      layers = list;
      const keep = new Set(list.map(keyOf));
      for (const [key, entry] of textures) {
        if (!keep.has(key)) {
          if (entry.tex) gl.deleteTexture(entry.tex);
          textures.delete(key);
        }
      }
      for (const l of list) load(l, resolve);
    },
    isLoaded(layer) {
      return !!textures.get(keyOf(layer))?.ready;
    },
    // CSS 픽셀 기준 그림 위치: x, y, 가로, 세로
    cssRect() {
      const k = canvas.clientWidth / (canvas.width || 1);
      const [x, y, s] = placement();
      return [x * k, y * k, s * k, s * k * aspect];
    },
    render(f) {
      aspect = f.aspect || 1;
      const A = aspect;
      fitCanvas();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.disable(gl.STENCIL_TEST);
      gl.uniform1f(u.uAlphaTest, 0);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform3f(u.uRect, ...placement());
      gl.uniform1f(u.uAspect, A);
      gl.uniform3f(u.uCenter, f.center.x, f.center.y * A, f.center.r);
      gl.uniform3f(u.uHead, f.head.yaw, f.head.pitch, f.head.roll);
      gl.uniform2f(u.uSquash, ...(f.squash || [1, 1]));
      gl.uniform2f(u.uBreath, f.breath ? f.breath.bodyStretch : 0, f.breath ? f.breath.headBob * A : 0);

      const blink = f.blink ?? (f.eyesClosed ? 1 : 0);
      const eyes = f.eyes || { squash: false, y: 0.4, h: 0.05 };
      // 뒤(목록 아래)에서 앞으로 그린다
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        // 바로 위 레이어가 클리핑이면, 이 레이어 모양을 스텐실에 남긴다
        const isClipBase = !layer.clip && i > 0 && !!layers[i - 1].clip;
        if (!layer.clip) gl.clear(gl.STENCIL_BUFFER_BIT);
        const t = textures.get(keyOf(layer));
        if (!t || !t.ready || !isLayerShown(layer, f)) continue;

        const hair = layer.hair.enabled && layer.part === 'head' && f.hair?.get(layer.id);
        gl.uniform1f(u.uSeg, layer.part === 'head' ? 0 : 1);
        gl.uniform1f(u.uDepth, (layer.depth / 100) * 0.4);
        gl.uniform1f(u.uCurve, (layer.curve / 100) * 0.4);
        gl.uniform1f(u.uHairOn, hair ? 1 : 0);
        gl.uniform1f(u.uAnchorY, layer.hair.anchorY * A);
        gl.uniform1f(u.uHairDir, layer.hair.dir === 'up' ? -1 : 1);
        gl.uniform1f(u.uHairEnd, layer.hair.dir === 'up' ? 0 : A);
        gl.uniform2f(u.uHairOffset, ...(hair ? hair.offset : [0, 0]));
        gl.uniform1f(u.uHairAngle, hair ? hair.angle : 0);
        const squeeze = eyes.squash && layer.show === 'eyesOpen' ? 1 - 0.75 * Math.min(1, blink / BLINK_CLOSED) : 1;
        gl.uniform3f(u.uEyeBand, eyes.y * A, eyes.h * A, squeeze);
        gl.uniform1f(u.uPop, layer.pop ? (f.pop ?? 1) : 1);
        const open = layer.show === 'mouthOpen' && f.mouthAmount !== undefined ? f.mouthAmount : 1;
        gl.uniform4f(u.uMouth, t.mid[0], t.mid[1] * A, 0.8 + 0.2 * open, 0.5 + 0.5 * open);
        gl.uniform1f(u.uAlpha, f.focusId && f.focusId !== layer.id ? 0.25 : 1);
        gl.bindTexture(gl.TEXTURE_2D, t.tex);

        if (layer.clip) {
          gl.enable(gl.STENCIL_TEST);
          gl.stencilFunc(gl.EQUAL, 1, 0xff);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        }
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.STENCIL_TEST);

        if (isClipBase) {
          gl.enable(gl.STENCIL_TEST);
          gl.stencilFunc(gl.ALWAYS, 1, 0xff);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
          gl.colorMask(false, false, false, false);
          gl.uniform1f(u.uAlphaTest, 0.5);
          gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
          gl.uniform1f(u.uAlphaTest, 0);
          gl.colorMask(true, true, true, true);
          gl.disable(gl.STENCIL_TEST);
        }
      }
    },
    destroy() {
      for (const e of textures.values()) if (e.tex) gl.deleteTexture(e.tex);
      textures.clear();
    }
  };
}
