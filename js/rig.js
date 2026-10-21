// 몸 리깅 (베타): 관절 14개로 뼈 12개를 만들고, 고개 각도에 따라 몸통·팔·다리를 움직인다.
// 좌표는 그림 가로 = 1, 세로 = aspect 단위. 변환 행렬은 [a, b, c, d, tx, ty] (2×3 아핀).

export const BONE = {
  root: 0, pelvis: 1, thighL: 2, shinL: 3, thighR: 4, shinR: 5,
  spine: 6, upperArmL: 7, foreArmL: 8, upperArmR: 9, foreArmR: 10, head: 11
};
// 양다리·양팔을 한 장에 그린 레이어는 점마다 왼쪽/오른쪽 뼈를 따로 고른다
export const PAIR = { legs: -1, arms: -2 };

export const JOINT_LABEL = {
  neck: '목', waist: '허리',
  shoulderL: '어깨', elbowL: '팔꿈치', wristL: '손목',
  shoulderR: '어깨', elbowR: '팔꿈치', wristR: '손목',
  hipL: '엉덩이', kneeL: '무릎', ankleL: '발목',
  hipR: '엉덩이', kneeR: '무릎', ankleR: '발목'
};

export const BONE_LABEL = {
  [BONE.pelvis]: '몸 아래쪽', [BONE.spine]: '몸 위쪽', [BONE.head]: '머리',
  [BONE.thighL]: '왼다리 위쪽', [BONE.shinL]: '왼다리 아래쪽',
  [BONE.thighR]: '오른다리 위쪽', [BONE.shinR]: '오른다리 아래쪽',
  [BONE.upperArmL]: '왼팔 위쪽', [BONE.foreArmL]: '왼팔 아래쪽',
  [BONE.upperArmR]: '오른팔 위쪽', [BONE.foreArmR]: '오른팔 아래쪽',
  [PAIR.legs]: '양다리', [PAIR.arms]: '양팔'
};

// 관절 → 그 관절이 붙어 움직이는 뼈
export const JOINT_BONE = {
  neck: BONE.spine, waist: BONE.pelvis,
  shoulderL: BONE.spine, elbowL: BONE.upperArmL, wristL: BONE.foreArmL,
  shoulderR: BONE.spine, elbowR: BONE.upperArmR, wristR: BONE.foreArmR,
  hipL: BONE.pelvis, kneeL: BONE.thighL, ankleL: BONE.shinL,
  hipR: BONE.pelvis, kneeR: BONE.thighR, ankleR: BONE.shinR
};

// 길이를 바꿀 수 있는 팔·다리 뼈
export const LIMB_BONES = new Set([
  BONE.upperArmL, BONE.foreArmL, BONE.upperArmR, BONE.foreArmR,
  BONE.thighL, BONE.shinL, BONE.thighR, BONE.shinR
]);

// 포즈 편집: 이 관절을 끌면 [돌릴 뼈, 축이 되는 관절]
export const POSE_DRAG = {
  neck: [BONE.spine, 'waist'],
  elbowL: [BONE.upperArmL, 'shoulderL'], wristL: [BONE.foreArmL, 'elbowL'],
  elbowR: [BONE.upperArmR, 'shoulderR'], wristR: [BONE.foreArmR, 'elbowR'],
  kneeL: [BONE.thighL, 'hipL'], ankleL: [BONE.shinL, 'kneeL'],
  kneeR: [BONE.thighR, 'hipR'], ankleR: [BONE.shinR, 'kneeR']
};

export const SKELETON = [
  ['neck', 'waist'], ['neck', 'shoulderL'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['neck', 'shoulderR'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
  ['waist', 'hipL'], ['hipL', 'kneeL'], ['kneeL', 'ankleL'],
  ['waist', 'hipR'], ['hipR', 'kneeR'], ['kneeR', 'ankleR']
];

export function mirrorJoint(name) {
  if (name.endsWith('L')) return `${name.slice(0, -1)}R`;
  if (name.endsWith('R')) return `${name.slice(0, -1)}L`;
  return null;
}

const IDENTITY = [1, 0, 0, 1, 0, 0];
const TILT = { lower: 0.1, upper: 0.35 };

function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
function rotateAbout(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, -s, c, p.x - c * p.x + s * p.y, p.y - s * p.x - c * p.y];
}
function scaleAbout(p, sx, sy) {
  return [sx, 0, 0, sy, p.x - sx * p.x, p.y - sy * p.y];
}
const translate = (x, y) => [1, 0, 0, 1, x, y];
export const applyM = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 관절 y를 그림 비율에 맞춰 늘린 좌표
export function scaledJoints(joints, aspect) {
  const out = {};
  for (const k in joints) out[k] = { x: joints[k].x, y: joints[k].y * aspect };
  return out;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

// 뼈마다 [번호, 시작 관절, 끝 관절, 두께]
function segments(j, radius, headR) {
  const hip = mid(j.hipL, j.hipR);
  const top = { x: j.neck.x, y: j.neck.y - headR * 2.2 };
  return [
    [BONE.pelvis, j.waist, hip, radius * 0.8],
    [BONE.thighL, j.hipL, j.kneeL, 0.04], [BONE.shinL, j.kneeL, j.ankleL, 0.035],
    [BONE.thighR, j.hipR, j.kneeR, 0.04], [BONE.shinR, j.kneeR, j.ankleR, 0.035],
    [BONE.spine, j.waist, j.neck, radius * 0.8],
    [BONE.upperArmL, j.shoulderL, j.elbowL, 0.03], [BONE.foreArmL, j.elbowL, j.wristL, 0.025],
    [BONE.upperArmR, j.shoulderR, j.elbowR, 0.03], [BONE.foreArmR, j.elbowR, j.wristR, 0.025],
    [BONE.head, j.neck, top, headR]
  ];
}

const PAIRS = [
  { left: [BONE.thighL, BONE.shinL], right: [BONE.thighR, BONE.shinR], parent: BONE.pelvis, pair: PAIR.legs },
  { left: [BONE.upperArmL, BONE.foreArmL], right: [BONE.upperArmR, BONE.foreArmR], parent: BONE.spine, pair: PAIR.arms }
];

// 레이어 그림의 불투명한 점들이 가장 가까운 뼈를 고른다
export function assignBone(points, body, aspect, headR) {
  if (!points.length) return BONE.spine;
  const segs = segments(scaledJoints(body.joints, aspect), body.radius, headR);
  const near = Array(12).fill(0);
  const inside = Array(12).fill(0);
  for (const p of points) {
    let best = 0;
    let bestD = Infinity;
    for (const [bone, a, b, r] of segs) {
      const d = Math.max(0, distToSegment(p, a, b) - r);
      if (d < bestD) {
        bestD = d;
        best = bone;
      }
    }
    near[best]++;
    if (bestD < 0.015) inside[best]++;
  }
  const share = (bones, arr = near) => bones.reduce((s, b) => s + arr[b], 0) / points.length;
  for (const pr of PAIRS) {
    if (share(pr.left) >= 0.2 && share(pr.right) >= 0.2) {
      return share([...pr.left, ...pr.right], inside) >= 0.6 ? pr.pair : pr.parent;
    }
  }
  return near.indexOf(Math.max(...near));
}

// 양팔·양다리 레이어: 격자 점마다 따라갈 뼈
export function vertexBones(grid, pair, body, aspect, headR) {
  const pr = PAIRS.find((x) => x.pair === pair);
  const allowed = new Set([...pr.left, ...pr.right]);
  const segs = segments(scaledJoints(body.joints, aspect), body.radius, headR).filter(([b]) => allowed.has(b));
  const out = new Float32Array((grid + 1) * (grid + 1));
  let k = 0;
  for (let y = 0; y <= grid; y++) {
    for (let x = 0; x <= grid; x++) {
      const p = { x: x / grid, y: (y / grid) * aspect };
      let best = pr.parent;
      let bestD = Infinity;
      for (const [bone, a, b, r] of segs) {
        const d = Math.max(0, distToSegment(p, a, b) - r);
        if (d < bestD) {
          bestD = d;
          best = bone;
        }
      }
      out[k++] = best;
    }
  }
  return out;
}

// 선분 a1→b1 을 a2→b2 로 옮기는 회전·확대·이동
function segmentMap(a1, b1, a2, b2) {
  const l1 = Math.hypot(b1.x - a1.x, b1.y - a1.y) || 1e-6;
  const ux = (b1.x - a1.x) / l1;
  const uy = (b1.y - a1.y) / l1;
  const l2 = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1e-6;
  const vx = (b2.x - a2.x) / l2;
  const vy = (b2.y - a2.y) / l2;
  const s = l2 / l1;
  const a = s * vx * ux + vy * uy;
  const c = s * vx * uy - vy * ux;
  const b = s * vy * ux - vx * uy;
  const d = s * vy * uy + vx * ux;
  return [a, b, c, d, a2.x - (a * a1.x + c * a1.y), a2.y - (b * a1.x + d * a1.y)];
}

// 다리: 발목은 바닥에 둔 채 엉덩이가 밀리면 무릎을 굽힌다
function bendLeg(hip, knee, ankle, hipNow, side) {
  const v = { x: ankle.x - hip.x, y: ankle.y - hip.y };
  const len = Math.hypot(v.x, v.y) || 1e-6;
  const u = { x: v.x / len, y: v.y / len };
  const n = { x: -u.y, y: u.x };
  const along = ((knee.x - hip.x) * u.x + (knee.y - hip.y) * u.y) / len;
  const off = (knee.x - hip.x) * n.x + (knee.y - hip.y) * n.y;
  const w = { x: ankle.x - hipNow.x, y: ankle.y - hipNow.y };
  const wl = Math.hypot(w.x, w.y) || 1e-6;
  const wu = { x: w.x / wl, y: w.y / wl };
  const wn = { x: -wu.y, y: wu.x };
  const bend = Math.max(0, Math.min(0.5, (len - wl) / len));
  const thigh = Math.hypot(knee.x - hip.x, knee.y - hip.y);
  const out = off + (Math.sign(wn.x * side) || 1) * bend * thigh * 1.2;
  const kneeNow = { x: hipNow.x + wu.x * along * wl + wn.x * out, y: hipNow.y + wu.y * along * wl + wn.y * out };
  return [segmentMap(hip, knee, hipNow, kneeNow), segmentMap(knee, ankle, kneeNow, ankle), bend, kneeNow];
}

// 포즈의 뼈 길이 배율 적용
function stretchLimb(bones, j1, j2, j3, b1, b2, s1, s2) {
  if (s1 === 1 && s2 === 1) return;
  const p1 = applyM(bones[b1], j1);
  const p2 = applyM(bones[b1], j2);
  const p3 = applyM(bones[b2], j3);
  const q2 = { x: p1.x + (p2.x - p1.x) * s1, y: p1.y + (p2.y - p1.y) * s1 };
  const q3 = { x: q2.x + (p3.x - p2.x) * s2, y: q2.y + (p3.y - p2.y) * s2 };
  bones[b1] = segmentMap(j1, j2, p1, q2);
  bones[b2] = segmentMap(j2, j3, q2, q3);
}

// opts: { head:{yaw,pitch,roll}, arms, squash, stretch, pose, poseLen }
export function computeBones(body, aspect, opts) {
  const j = scaledJoints(body.joints, aspect);
  const head = opts.head;
  const arms = opts.arms;
  const [sx, sy] = opts.squash || [1, 1];
  const bones = Array(12).fill(IDENTITY);
  const follow = body.follow / 100;
  const sway = (body.sway ?? 50) / 50;
  const hip = mid(j.hipL, j.hipR);
  const upperTilt = head.roll * TILT.upper;
  const shift = (head.yaw * 0.5 + head.roll * 0.8) * follow * 0.25 * sway;
  const drop = Math.abs(shift) * 1.5 + Math.max(0, head.pitch) * follow * 0.06 * sway;
  const lowerTilt = -head.roll * TILT.lower - shift * 6;
  const pelvis = mul(translate(shift, drop), rotateAbout(j.waist, lowerTilt));
  bones[BONE.root] = pelvis;
  bones[BONE.pelvis] = pelvis;

  const depth = Array(12).fill(0);
  const pose = opts.pose || [];
  const ang = (b) => pose[b] || 0;
  const lens = opts.poseLen || [];
  const len = (b) => lens[b] || 1;

  for (const [h, k, a, thigh, shin, side] of [
    [j.hipL, j.kneeL, j.ankleL, BONE.thighL, BONE.shinL, hip.x - j.hipL.x || 1],
    [j.hipR, j.kneeR, j.ankleR, BONE.thighR, BONE.shinR, hip.x - j.hipR.x || -1]
  ]) {
    const hipNow = applyM(pelvis, h);
    const [mThigh, mShin, bend, kneeNow] = bendLeg(h, k, a, hipNow, side);
    const turn = rotateAbout(hipNow, ang(thigh));
    bones[thigh] = mul(turn, mThigh);
    bones[shin] = mul(turn, mul(rotateAbout(kneeNow, ang(shin)), mShin));
    stretchLimb(bones, h, k, a, thigh, shin, len(thigh), len(shin));
    depth[thigh] = depth[shin] = bend;
  }

  const spine = mul(pelvis, mul(rotateAbout(j.waist, upperTilt - lowerTilt + ang(BONE.spine)), scaleAbout(j.waist, sx, sy * (1 + (opts.stretch || 0)))));
  bones[BONE.spine] = spine;
  bones[BONE.upperArmL] = mul(spine, rotateAbout(j.shoulderL, (arms?.upperL || 0) + ang(BONE.upperArmL)));
  bones[BONE.foreArmL] = mul(bones[BONE.upperArmL], rotateAbout(j.elbowL, (arms?.foreL || 0) + ang(BONE.foreArmL)));
  bones[BONE.upperArmR] = mul(spine, rotateAbout(j.shoulderR, (arms?.upperR || 0) + ang(BONE.upperArmR)));
  bones[BONE.foreArmR] = mul(bones[BONE.upperArmR], rotateAbout(j.elbowR, (arms?.foreR || 0) + ang(BONE.foreArmR)));
  stretchLimb(bones, j.shoulderL, j.elbowL, j.wristL, BONE.upperArmL, BONE.foreArmL, len(BONE.upperArmL), len(BONE.foreArmL));
  stretchLimb(bones, j.shoulderR, j.elbowR, j.wristR, BONE.upperArmR, BONE.foreArmR, len(BONE.upperArmR), len(BONE.foreArmR));
  bones[BONE.head] = mul(spine, rotateAbout(j.neck, head.roll - upperTilt));
  return { bones, depth };
}

// 포즈를 적용했을 때의 관절 위치 (포즈 편집 화면용, y는 0~1)
export function posedJoints(body, aspect, pose, poseLen) {
  const j = scaledJoints(body.joints, aspect);
  const { bones } = computeBones(body, aspect, { head: { yaw: 0, pitch: 0, roll: 0 }, pose, poseLen });
  const out = {};
  for (const k in j) {
    const p = applyM(bones[JOINT_BONE[k]], j[k]);
    out[k] = { x: p.x, y: p.y / aspect };
  }
  return out;
}
