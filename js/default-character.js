// 기본 캐릭터. 원작 그림은 사용 권한이 불분명해 직접 그린 대체 캐릭터를 쓴다.
// 모든 부위는 같은 512×512 정사각형 캔버스에 그려 원본의 이미지 규칙을 따른다.
export const SIZE = 512;

const C = {
  line: '#7d6cc4',
  hair: '#e9e1fb',
  hairShade: '#cbbdf3',
  skin: '#fff3ec',
  skinLine: '#c99a92',
  blush: 'rgba(255, 150, 170, 0.45)',
  eye: '#5b6ad8',
  eyeDark: '#323a8f',
  lid: '#4a3f78',
  ribbon: '#b9d3f7',
  ribbonLine: '#6e91d4',
  dress: '#ffffff',
  dressShade: '#dfe9fb',
  mouth: '#a8424f',
  tongue: '#f08a96'
};

function stroke(ctx, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

const draw = {
  backHair(ctx) {
    ctx.beginPath();
    ctx.moveTo(108, 220);
    ctx.bezierCurveTo(100, 90, 412, 90, 404, 220);
    ctx.bezierCurveTo(430, 300, 440, 380, 404, 446);
    ctx.quadraticCurveTo(388, 420, 372, 450);
    ctx.quadraticCurveTo(356, 424, 340, 452);
    ctx.lineTo(172, 452);
    ctx.quadraticCurveTo(156, 424, 140, 450);
    ctx.quadraticCurveTo(124, 420, 108, 446);
    ctx.bezierCurveTo(72, 380, 82, 300, 108, 220);
    ctx.closePath();
    ctx.fillStyle = C.hair;
    ctx.fill();
    stroke(ctx, C.line, 4);
    ctx.stroke();
    stroke(ctx, C.hairShade, 3);
    for (const x of [130, 150, 362, 382]) {
      ctx.beginPath();
      ctx.moveTo(x, 260);
      ctx.quadraticCurveTo(x + (x < 256 ? -10 : 10), 350, x, 430);
      ctx.stroke();
    }
  },

  body(ctx) {
    // 목
    ctx.fillStyle = C.skin;
    ctx.fillRect(238, 296, 36, 40);
    stroke(ctx, C.skinLine, 3);
    ctx.beginPath();
    ctx.moveTo(238, 296); ctx.lineTo(238, 336);
    ctx.moveTo(274, 296); ctx.lineTo(274, 336);
    ctx.stroke();
    // 팔
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(256 + dir * 92, 420, 26, 62, dir * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = C.dressShade;
      ctx.fill();
      stroke(ctx, C.line, 3.5);
      ctx.stroke();
    }
    // 원피스
    ctx.beginPath();
    ctx.moveTo(196, 334);
    ctx.lineTo(316, 334);
    ctx.bezierCurveTo(340, 390, 362, 450, 372, 500);
    ctx.lineTo(140, 500);
    ctx.bezierCurveTo(150, 450, 172, 390, 196, 334);
    ctx.closePath();
    ctx.fillStyle = C.dress;
    ctx.fill();
    stroke(ctx, C.line, 3.5);
    ctx.stroke();
    stroke(ctx, C.dressShade, 3);
    for (const x of [210, 256, 302]) {
      ctx.beginPath();
      ctx.moveTo(x, 380);
      ctx.lineTo(x + (x - 256) * 0.35, 494);
      ctx.stroke();
    }
    // 털 칼라
    ctx.fillStyle = C.dress;
    stroke(ctx, C.line, 3);
    for (let i = 0; i < 7; i++) {
      const x = 194 + i * 20.5;
      ctx.beginPath();
      ctx.arc(x, 342 + (i % 2) * 4, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.rect(186, 334, 140, 10);
    ctx.fill();
    // 가슴 장식
    ctx.beginPath();
    ctx.arc(256, 362, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#ff7a8f';
    ctx.fill();
    stroke(ctx, '#c4475c', 2.5);
    ctx.stroke();
  },

  face(ctx) {
    ctx.beginPath();
    ctx.ellipse(256, 216, 112, 102, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.skin;
    ctx.fill();
    stroke(ctx, C.skinLine, 3.5);
    ctx.stroke();
    ctx.fillStyle = C.blush;
    for (const x of [192, 320]) {
      ctx.beginPath();
      ctx.ellipse(x, 266, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    stroke(ctx, C.skinLine, 2.5);
    ctx.beginPath();
    ctx.moveTo(254, 262); ctx.lineTo(258, 264);
    ctx.stroke();
  },

  eyeWhite(ctx) {
    for (const x of [208, 304]) {
      ctx.beginPath();
      ctx.ellipse(x, 238, 27, 32, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      stroke(ctx, C.skinLine, 2);
      ctx.stroke();
    }
  },

  pupil(ctx) {
    for (const x of [212, 300]) {
      const g = ctx.createLinearGradient(0, 214, 0, 270);
      g.addColorStop(0, C.eyeDark);
      g.addColorStop(1, '#a9b6ff');
      ctx.beginPath();
      ctx.ellipse(x, 244, 21, 27, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, 240, 10, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.eyeDark;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - 8, 232, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 7, 256, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  eyelid(ctx) {
    stroke(ctx, C.lid, 6);
    for (const [x, dir] of [[208, -1], [304, 1]]) {
      ctx.beginPath();
      ctx.ellipse(x, 240, 31, 35, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + dir * 30, 228);
      ctx.lineTo(x + dir * 40, 220);
      ctx.stroke();
    }
  },

  eyeClosed(ctx) {
    stroke(ctx, C.lid, 5);
    for (const x of [208, 304]) {
      ctx.beginPath();
      ctx.moveTo(x - 28, 242);
      ctx.quadraticCurveTo(x, 262, x + 28, 242);
      ctx.stroke();
    }
  },

  mouthClosed(ctx) {
    stroke(ctx, C.mouth, 3.5);
    ctx.beginPath();
    ctx.moveTo(244, 284);
    ctx.quadraticCurveTo(250, 291, 256, 286);
    ctx.quadraticCurveTo(262, 291, 268, 284);
    ctx.stroke();
  },

  mouthOpen(ctx) {
    ctx.beginPath();
    ctx.moveTo(240, 282);
    ctx.quadraticCurveTo(256, 278, 272, 282);
    ctx.quadraticCurveTo(270, 306, 256, 306);
    ctx.quadraticCurveTo(242, 306, 240, 282);
    ctx.closePath();
    ctx.fillStyle = C.mouth;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(256, 306, 12, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.tongue;
    ctx.fill();
    ctx.restore();
    stroke(ctx, '#7a2734', 2.5);
    ctx.beginPath();
    ctx.moveTo(240, 282);
    ctx.quadraticCurveTo(256, 278, 272, 282);
    ctx.quadraticCurveTo(270, 306, 256, 306);
    ctx.quadraticCurveTo(242, 306, 240, 282);
    ctx.stroke();
  },

  bangs(ctx) {
    ctx.beginPath();
    ctx.moveTo(128, 214);
    ctx.bezierCurveTo(118, 70, 394, 70, 384, 214);
    ctx.lineTo(362, 228);
    ctx.lineTo(348, 176);
    ctx.lineTo(322, 218);
    ctx.lineTo(302, 160);
    ctx.lineTo(282, 206);
    ctx.lineTo(256, 150);
    ctx.lineTo(230, 206);
    ctx.lineTo(210, 160);
    ctx.lineTo(190, 218);
    ctx.lineTo(164, 176);
    ctx.lineTo(150, 228);
    ctx.closePath();
    ctx.fillStyle = C.hair;
    ctx.fill();
    stroke(ctx, C.line, 4);
    ctx.stroke();
    // 옆머리
    for (const dir of [-1, 1]) {
      const x = 256 + dir * 122;
      ctx.beginPath();
      ctx.moveTo(x, 190);
      ctx.quadraticCurveTo(x - dir * 4, 290, x + dir * 2, 352);
      ctx.quadraticCurveTo(x - dir * 18, 320, x - dir * 26, 290);
      ctx.quadraticCurveTo(x - dir * 30, 240, x - dir * 22, 200);
      ctx.closePath();
      ctx.fillStyle = C.hair;
      ctx.fill();
      stroke(ctx, C.line, 3.5);
      ctx.stroke();
    }
    stroke(ctx, C.hairShade, 3);
    ctx.beginPath();
    ctx.moveTo(200, 110); ctx.quadraticCurveTo(190, 140, 196, 170);
    ctx.moveTo(312, 110); ctx.quadraticCurveTo(322, 140, 316, 170);
    ctx.stroke();
  },

  ribbon(ctx) {
    ctx.fillStyle = C.ribbon;
    stroke(ctx, C.ribbonLine, 3);
    // 꼬리
    for (const dx of [-10, 12]) {
      ctx.beginPath();
      ctx.moveTo(372, 152);
      ctx.quadraticCurveTo(382 + dx, 220, 384 + dx * 1.6, 286);
      ctx.lineTo(398 + dx * 1.6, 272);
      ctx.quadraticCurveTo(392 + dx, 210, 384, 152);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 고리
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(376, 150);
      ctx.quadraticCurveTo(376 + dir * 50, 104, 376 + dir * 44, 152);
      ctx.quadraticCurveTo(376 + dir * 40, 186, 376, 150);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(376, 150, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#d6e6fc';
    ctx.fill();
    ctx.stroke();
  }
};

const cache = new Map();

export function getDefaultImage(key) {
  if (cache.has(key)) return cache.get(key);
  const fn = draw[key];
  if (!fn) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  fn(canvas.getContext('2d'));
  cache.set(key, canvas);
  return canvas;
}

// 목록 위쪽이 앞(나중에 그림).
export function createDefaultLayers(makeLayer) {
  return [
    makeLayer({ name: '리본', part: 'deco', image: { type: 'default', key: 'ribbon' }, depth: 10, physics: true, anchor: 33 }),
    makeLayer({ name: '앞머리', part: 'hair', image: { type: 'default', key: 'bangs' }, depth: 35, bulge: 20, physics: true, anchor: 42 }),
    makeLayer({ name: '눈꺼풀', part: 'eye', image: { type: 'default', key: 'eyelid' }, when: 'eyesOpen', depth: 22, bulge: 20 }),
    makeLayer({ name: '눈동자', part: 'pupil', image: { type: 'default', key: 'pupil' }, when: 'eyesOpen', depth: 34, bulge: 20, clip: true }),
    makeLayer({ name: '흰자', part: 'eyeWhite', image: { type: 'default', key: 'eyeWhite' }, when: 'eyesOpen', depth: 20, bulge: 20 }),
    makeLayer({ name: '감은 눈', part: 'eyeClosed', image: { type: 'default', key: 'eyeClosed' }, when: 'eyesClosed', depth: 22, bulge: 20 }),
    makeLayer({ name: '벌린 입', part: 'mouthOpen', image: { type: 'default', key: 'mouthOpen' }, when: 'mouthOpen', depth: 16, bulge: 20 }),
    makeLayer({ name: '입', part: 'mouthClosed', image: { type: 'default', key: 'mouthClosed' }, when: 'mouthClosed', depth: 16, bulge: 20 }),
    makeLayer({ name: '얼굴', part: 'face', image: { type: 'default', key: 'face' }, depth: 0, bulge: 50 }),
    makeLayer({ name: '몸', part: 'body', image: { type: 'default', key: 'body' }, attach: 'body' }),
    makeLayer({ name: '뒷머리', part: 'hair', image: { type: 'default', key: 'backHair' }, depth: -40, physics: true, anchor: 45 })
  ];
}
