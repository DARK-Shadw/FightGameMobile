// Kraken (tide titan): a great mantle bursting out of a foaming water ring,
// eight tentacles on four-bone chains curling around it. Attacks by
// raising the two front tentacles and slamming them down.

import { S, P, G, TAU, add, mix3, lerp, smooth, clamp01, tube, spike, tone, glowGrad, scaled, eyes, brows, hex, mixc } from './creature-kit.js';

export function sculptKraken(ctx) {
  const { pal: C } = ctx;
  const skin = (x, y, z, l, nx, ny, nz) => {
    let col = mixc(hex('#1e3a8a'), hex('#2f6fed'), smooth((y - 0.3) / 2.2));
    if (ny > 0) col = mixc(col, hex('#6fb1ff'), ny * ny * 0.35);
    return { color: col, gloss: 0.55, emissive: 0 };
  };
  const hide = scaled(skin, '#12306e', 7, 0.2, 0.1);
  const spots = (x, y, z, l, nx, ny, nz, cell) => {
    const p = hide(x, y, z, l, nx, ny, nz, cell);
    const k = Math.sin(x * 7.3) * Math.sin(y * 6.1) * Math.sin(z * 7.7);
    const t = smooth((k - 0.72) / 0.1);
    return t > 0.02 ? { color: mixc(p.color, hex('#a5f3fc'), t), gloss: p.gloss, emissive: t * 0.9 } : p;
  };
  const under = tone('#5eead4', '#0f766e', '#ccfbf1', 0.2, 2.5, 0.45, 0.3);
  const suck = (x, y, z, l, nx, ny, nz, cell) => {
    const p = under(x, y, z, l, nx, ny, nz, cell);
    const r = Math.abs(Math.sin(x * 11) * Math.sin(y * 11) * Math.sin(z * 11));
    return r > 0.55 ? { ...p, color: mixc(p.color, hex('#f0fdfa'), 0.8) } : p;
  };
  const foam = tone('#e0f2fe', '#60a5fa', '#ffffff', 0.0, 0.3, 0.6, 0.5);
  const spec = { root: { pos: [0, 0, 0] }, body: { parent: 'root', pos: [0, 1.0, 0] }, head: { parent: 'body', pos: [0, 1.9, -0.05] } };
  const tents = [];
  const n = 8;
  const angles = [0.5, 1.15, 1.8, 2.45, -0.5, -1.15, -1.8, -2.45].map(a => a + Math.PI * 0.0);
  for (let i = 0; i < n; i++) {
    const a = angles[i] + (Math.abs(angles[i]) < 1 ? Math.sign(angles[i]) * 0.25 : 0);
    const front = Math.cos(a);
    const sx = Math.sin(a), sz = Math.cos(a);
    const r0 = 0.55;
    const height = 1.2 + 1.3 * (1 - (front + 1) / 2) + (i % 2) * 0.35;
    const reach = 1.1 + 0.35 * ((front + 1) / 2);
    const pts = [
      [sx * r0, 0.85, sz * r0],
      [sx * reach, 0.45, sz * reach],
      [sx * (reach + 0.35), 0.9 + height * 0.35, sz * (reach + 0.35)],
      [sx * (reach + 0.2), 1.0 + height * 0.75, sz * (reach + 0.2)],
      [sx * (reach - 0.25), 1.05 + height, sz * (reach - 0.25)],
    ];
    const radii = [0.3, 0.24, 0.18, 0.11, 0.035];
    let par = 'body';
    for (let j = 0; j < 4; j++) { spec['tent' + i + '_' + j] = { parent: par, pos: pts[j] }; par = 'tent' + i + '_' + j; }
    const segs = [];
    for (let j = 0; j < 4; j++) segs.push(S.limb(pts[j], pts[j + 1], radii[j], radii[j + 1]).bone('tent' + i + '_' + j));
    // pale underside strip toward the inner curve
    const inner = [];
    for (let j = 1; j < 4; j++) {
      const off = [-sx * radii[j] * 0.5, 0, -sz * radii[j] * 0.5];
      const off2 = [-sx * radii[j + 1] * 0.5, 0, -sz * radii[j + 1] * 0.5];
      inner.push(S.limb(add(pts[j], off), add(pts[j + 1], off2), radii[j] * 0.62, radii[j + 1] * 0.62).bone('tent' + i + '_' + j));
    }
    tents.push(S.union(0.04, S.union(0, ...segs).paint(spots), S.union(0, ...inner).paint(suck)));
  }
  const mantleCore = S.union(0.1,
    S.ellipsoid([0, 1.75, -0.1], [0.78, 0.95, 0.8]).rot(-0.35, 0, 0),
    S.ellipsoid([0, 1.2, 0.1], [0.72, 0.5, 0.7]),
  ).paint(spots);
  const head = S.union(0.04,
    mantleCore,
    S.mirror(S.ellipsoid([0.32, 1.62, 0.6], [0.24, 0.1, 0.14]).rot(-0.3, 0.3, -0.3)).paint(spots),
    S.ellipsoid([0, 1.02, 0.66], [0.2, 0.12, 0.1]).paint(P('#0b1d52', 0.4)),
    S.mirror(S.union(0.01, ...[0, 1, 2].map(i => spike([0.28 + i * 0.12, 2.4 - i * 0.12, -0.3 - i * 0.05], [0.38 + i * 0.16, 2.62 - i * 0.14, -0.45 - i * 0.05], 0.06)))).paint(G('#a5f3fc', 1, 0.6)),
  ).bone('head');
  const ring = S.union(0.05,
    S.torus([0, 0.1, 0], 1.25, 0.14),
    ...[...Array(10)].map((_, i) => { const a = (i / 10) * TAU; return spike([Math.sin(a) * 1.3, 0.12, Math.cos(a) * 1.3], [Math.sin(a) * 1.55, 0.45 + (i % 3) * 0.12, Math.cos(a) * 1.55], 0.1); }),
    S.cyl([0, 0.03, 0], 1.2, 0.03, 0.02).paint(tone('#1d4ed8', '#0b1d52', '#60a5fa', 0.0, 0.1, 0.8, 0.5)),
  ).paint(foam).bone('root');
  const sdf = S.union(0.05, head, ring, ...tents);
  const face = [
    ...eyes([0.3, 1.56, 0.68], [0.28, 0.24], { iris: '#ffe14d', iris2: '#ea580c', ink: '#0b1d52', angry: 0.85, lidRest: 0.2, irisSize: 0.6, pupilSize: 0.3, dir: [0.5, 0.05, 1], glow: 0.7 }),
    ...brows([0.31, 1.78, 0.64], [0.32, 0.12], '#0b1d52', { angle: 1.1, yaw: 0.5, thick: 0.4 }),
  ];
  return {
    spec, sdf, face: { sdf: mantleCore, bone: 'head', features: face }, props: [],
    cell: 0.052, aoStep: 0.06, tau: 0.07,
    height: 3.2, radius: 1.6,
    anim: 'kraken', animOpts: {}, spawn: 'rise', glow: C.glow, emissivePulse: 0.2,
    stiffness: 140, hitLean: 0.3,
  };
}

export function poseKraken(P, R, c) {
  const { t, sp, kind, k } = c;
  let mood = 'idle';
  const br = Math.sin(t * 1.3);
  P.body = [0.03 * br, 0.1 * Math.sin(t * 0.4), 0.04 * Math.sin(t * 0.7)];
  P.head = [-0.05 * br + 0.04 * sp, 0.08 * Math.sin(t * 0.5), 0.03 * Math.sin(t * 0.9)];
  for (let i = 0; i < 8; i++) {
    const aa = [0.75, 1.15, 1.8, 2.45, -0.75, -1.15, -1.8, -2.45][i];
    const ox = Math.cos(aa), oz = -Math.sin(aa);
    for (let j = 0; j < 4; j++) {
      const wv = Math.sin(t * (1.4 + 0.5 * sp) - j * 0.8 + i * 1.3);
      const amp = 0.12 + j * 0.07;
      P['tent' + i + '_' + j] = [ox * wv * amp, 0.08 * Math.sin(t * 0.9 + i), oz * wv * amp];
    }
  }
  R.y += 0.04 * Math.sin(t * 0.8);
  if (kind === 'attack') {
    const up = smooth(k / 0.35), slam = smooth((k - 0.35) / 0.12), back = smooth((k - 0.65) / 0.35);
    const hold = 1 - back;
    for (const i of [3, 4]) {
      for (let j = 1; j < 4; j++) P['tent' + i + '_' + j] = [(-0.5 * up * (1 - slam) + 0.6 * slam) * hold, 0, 0];
    }
    P.head[0] += (-0.15 * up + 0.2 * slam) * hold;
    R.emi = 1 + slam * hold;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    const roar = smooth((k - 0.55) / 0.12) * (1 - smooth((k - 0.9) / 0.1));
    for (let i = 0; i < 8; i++) for (let j = 1; j < 4; j++) P['tent' + i + '_' + j][0] -= 0.3 * roar * Math.cos((i / 8) * TAU);
    mood = roar > 0.3 ? 'fierce' : 'idle';
  } else if (kind === 'hit') {
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.6);
    R.y -= 1.2 * f;
    mood = 'ko';
  }
  return mood;
}
