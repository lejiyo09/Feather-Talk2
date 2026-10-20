// WebGL 렌더러. 레이어마다 격자 메쉬를 정점 셰이더로 변형해 가짜 3D 고개 회전,
// 볼록/오목, 머리카락 흔들림, 눈 눌림, 입 크기 변화를 그린다.
const GRID = 40;

const VERT = `
attribute vec2 a_uv;
uniform vec3 u_head;       // 좌우, 상하, 기울기(라디안)
uniform vec3 u_face;       // 중심 x, y, 반지름 (이미지 좌표 0~1)
uniform vec2 u_squash;     // 고개 늘어남/납작함
uniform float u_breath;    // -1~1 × 호흡 세기
uniform float u_onHead;
uniform float u_depth;
uniform float u_bulge;
uniform float u_physics;
uniform float u_anchor;
uniform vec2 u_swing;
uniform vec2 u_scaleCenter;
uniform vec2 u_scale;
varying vec2 v_uv;

vec2 rot(vec2 p, vec2 c, float a) {
  float s = sin(a), co = cos(a);
  p -= c;
  return c + vec2(p.x * co - p.y * s, p.x * s + p.y * co);
}

void main() {
  v_uv = a_uv;
  vec2 p = u_scaleCenter + (a_uv - u_scaleCenter) * u_scale;

  if (u_onHead > 0.5) {
    vec2 pivot = vec2(u_face.x, u_face.y + u_face.z * 1.1);
    if (u_physics > 0.5) {
      float t = clamp((a_uv.y - u_anchor) / max(1.0 - u_anchor, 0.05), 0.0, 1.0);
      t = t * t;
      // 고개를 기울여도 끝부분은 원래 방향을 유지하려 함
      p = rot(p, vec2(p.x, u_anchor), -u_head.z * 0.8 * t);
      p += vec2(u_swing.x, -abs(u_swing.x) * 0.3 + u_swing.y) * t;
    }
    float r = distance(a_uv, u_face.xy) / max(u_face.z, 0.01);
    float w = clamp(1.0 - r * r, 0.0, 1.0);
    float k = u_depth + u_bulge * w;
    p += u_head.xy * (0.025 + k * 0.06);
    p = rot(p, pivot, u_head.z);
    p = pivot + (p - pivot) * u_squash;
    p.y -= u_breath * 0.008;
  } else {
    p.y = 1.0 - (1.0 - p.y) * (1.0 + u_breath * 0.012);
    p.x = 0.5 + (p.x - 0.5) * (1.0 + u_breath * 0.006);
  }
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_alpha;
uniform float u_squeeze;
uniform vec2 u_band;
uniform float u_mask;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  if (u_squeeze > 0.0 && uv.y > u_band.x && uv.y < u_band.y) {
    float c = (u_band.x + u_band.y) * 0.5;
    float s = 1.0 - u_squeeze;
    if (s < 0.02) discard;
    uv.y = c + (uv.y - c) / s;
    if (uv.y < u_band.x || uv.y > u_band.y) discard;
  }
  vec4 col = texture2D(u_tex, uv);
  if (u_mask > 0.5) {
    if (col.a < 0.1) discard;
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = col * u_alpha;
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, stencil: true, antialias: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('이 브라우저에서는 WebGL을 쓸 수 없어요.');
    this.gl = gl;
    this.textures = new Map();

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    this.u = {};
    for (const name of ['u_head', 'u_face', 'u_squash', 'u_breath', 'u_onHead', 'u_depth', 'u_bulge', 'u_physics',
      'u_anchor', 'u_swing', 'u_scaleCenter', 'u_scale', 'u_tex', 'u_alpha', 'u_squeeze', 'u_band', 'u_mask']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    const verts = [];
    for (let y = 0; y <= GRID; y++) for (let x = 0; x <= GRID; x++) verts.push(x / GRID, y / GRID);
    const idx = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * (GRID + 1) + x;
        idx.push(i, i + 1, i + GRID + 1, i + 1, i + GRID + 2, i + GRID + 1);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.indexCount = idx.length;
    const loc = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.u.u_tex, 0);
  }

  setTexture(id, source) {
    const gl = this.gl;
    let tex = this.textures.get(id);
    if (!tex) {
      tex = gl.createTexture();
      this.textures.set(id, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    // 교차 출처 이미지는 여기서 SecurityError를 던진다
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  deleteTexture(id) {
    const tex = this.textures.get(id);
    if (tex) {
      this.gl.deleteTexture(tex);
      this.textures.delete(id);
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setLayerUniforms(item) {
    const gl = this.gl;
    const u = this.u;
    gl.uniform1f(u.u_onHead, item.onHead ? 1 : 0);
    gl.uniform1f(u.u_depth, item.depth);
    gl.uniform1f(u.u_bulge, item.bulge);
    gl.uniform1f(u.u_physics, item.physics ? 1 : 0);
    gl.uniform1f(u.u_anchor, item.anchor);
    gl.uniform2f(u.u_swing, item.swing[0], item.swing[1]);
    gl.uniform2f(u.u_scaleCenter, item.scaleCenter[0], item.scaleCenter[1]);
    gl.uniform2f(u.u_scale, item.scale[0], item.scale[1]);
    gl.uniform1f(u.u_squeeze, item.squeeze);
    gl.uniform1f(u.u_alpha, item.alpha);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get(item.id));
  }

  // frame: { head:[x,y,roll], face:[x,y,r], squash:[sx,sy], breath, band:[top,bottom], items:[...] }
  // items는 뒤에서 앞 순서. clipTo가 있으면 그 항목의 알파 안쪽에만 그린다.
  render(frame) {
    const gl = this.gl;
    const u = this.u;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    gl.uniform3f(u.u_head, ...frame.head);
    gl.uniform3f(u.u_face, ...frame.face);
    gl.uniform2f(u.u_squash, ...frame.squash);
    gl.uniform1f(u.u_breath, frame.breath);
    gl.uniform2f(u.u_band, ...frame.band);

    for (const item of frame.items) {
      if (!this.textures.has(item.id)) continue;
      if (item.clipTo && this.textures.has(item.clipTo.id)) {
        gl.enable(gl.STENCIL_TEST);
        gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        gl.uniform1f(u.u_mask, 1);
        this.setLayerUniforms(item.clipTo);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
        gl.colorMask(true, true, true, true);
        gl.uniform1f(u.u_mask, 0);
        gl.stencilFunc(gl.EQUAL, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        this.setLayerUniforms(item);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.STENCIL_TEST);
      } else {
        gl.uniform1f(u.u_mask, 0);
        this.setLayerUniforms(item);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
      }
    }
  }
}
