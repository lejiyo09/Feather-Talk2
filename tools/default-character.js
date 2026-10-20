// 기본 캐릭터 대체 그림. 원본 /assets/*.png 는 수집되지 않았고 원작 그림의 사용 권한도
// 확인되지 않아, 같은 파일 이름·같은 512×512 정사각형 규칙으로 직접 그린 그림을 쓴다.
// tools/export-assets.mjs 가 이 파일로 assets/*.png 를 만든다.
export const SIZE = 512;
// 원본 기본값(얼굴 중심 0.5, 0.4 · 눈 높이 0.4)에 맞도록 머리 부위를 위로 올린다.
const HEAD_DY = -33;

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


function head(fn) {
  return (ctx) => {
    ctx.save();
    ctx.translate(0, HEAD_DY);
    fn(ctx);
    ctx.restore();
  };
}

function bodyPart(ctx) {
  ctx.save();
  // 목을 머리 쪽으로 늘려 이어 붙인다
  ctx.fillStyle = C.skin;
  ctx.fillRect(238, 262, 36, 40);
  stroke(ctx, C.skinLine, 3);
  ctx.beginPath();
  ctx.moveTo(238, 262); ctx.lineTo(238, 300);
  ctx.moveTo(274, 262); ctx.lineTo(274, 300);
  ctx.stroke();
  ctx.restore();
  draw.body(ctx);
}

// 파일 이름 → 그리는 함수 (원본 기본 레이어 목록과 같은 이름)
export const PARTS = {
  'bang.png': head(draw.bangs),
  'mouth.png': head(draw.mouthClosed),
  'mouthopen.png': head(draw.mouthOpen),
  'eyes.png': head((ctx) => { draw.eyeWhite(ctx); draw.pupil(ctx); draw.eyelid(ctx); }),
  'eyesclosed.png': head(draw.eyeClosed),
  'face.png': head(draw.face),
  'body.png': bodyPart,
  'back.png': head(draw.backHair),
};

export function drawIcon(ctx, size) {
  const s = size / 512;
  ctx.fillStyle = '#86d7ff';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.22);
  ctx.fill();
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(256, 256);
  ctx.rotate(-0.6);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -190);
  ctx.bezierCurveTo(110, -120, 110, 90, 0, 170);
  ctx.bezierCurveTo(-110, 90, -110, -120, 0, -190);
  ctx.fill();
  ctx.strokeStyle = '#3fb5ee';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -150);
  ctx.lineTo(0, 215);
  ctx.stroke();
  ctx.restore();
}
