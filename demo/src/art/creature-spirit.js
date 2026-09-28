// Floating spirit minions: storm sprite, light wisp, water spirit, starling.
// One round head-body with a face, little nub arms and a wispy tail; each
// essence swaps the silhouette (cloud puffs, halo and wings, wave crest,
// star points) and adds orbiting props.

import { S, P, G, TAU, add, mix3, lerp, smooth, clamp01, tube, flame, tone, glowGrad, glowRadial, starry, eyes, brows, mouth, hex } from './creature-kit.js';

const BASE = { body: [0, 0.3, 0], head: [0, 0.42, 0], c: [0, 0.44, 0.0], r: 0.17 };

function spec(extra = {}) {
  const sp = {
    root: { pos: [0, 0, 0] },
    body: { parent: 'root', pos: BASE.body },
    head: { parent: 'body', pos: BASE.head },
    'arm.L': { parent: 'body', pos: [0.15, 0.4, 0.02] },
    'arm.R': { parent: 'body', pos: [-0.15, 0.4, 0.02] },
    tail1: { parent: 'body', pos: [0, 0.3, -0.02] },
    tail2: { parent: 'tail1', pos: [0, 0.22, -0.06] },
    tail3: { parent: 'tail2', pos: [0, 0.15, -0.1] },
  };
  return Object.assign(sp, extra);
}

// Cute face on a round body at center c, radius r.
function face(C, c, r, o = {}) {
  const ey = c[1] + r * (o.eyeY ?? 0.1), ex = r * (o.eyeX ?? 0.4), ez = c[2] + r * 0.9;
  const f = eyes([ex, ey, ez], o.eyeSize ?? [0.1, 0.12], {
    iris: o.iris ?? C.eye, iris2: o.iris2 ?? C.eye2, sclera: o.sclera, ink: o.ink ?? C.ink, angry: o.angry ?? 0, lidRest: o.lidRest ?? 0.1,
    irisSize: o.irisSize ?? 0.62, pupilSize: o.pupilSize ?? 0.28, yaw: 0.42, glow: o.glow ?? 0,
  });
  if (o.brows) f.push(...brows([ex, ey + r * 0.45, c[2] + r * 0.85], [0.1, 0.055], o.browCol ?? C.ink, { angle: o.browAngle ?? 0.5, yaw: 0.42 }));
  if (o.mouth !== false) f.push(mouth([0, c[1] - r * (o.mouthY ?? 0.35), c[2] + r * 0.95], o.mouthSize ?? [0.12, 0.07], { open: o.open ?? 0.35, smile: o.smile ?? 1, width: 0.75, asym: o.asym ?? 0.1, inside: o.inside ?? '#3a1030', ink: o.ink ?? C.ink, dir: [0, -0.3, 1] }));
  return f;
}

// Zigzag lightning bolt through points (glowing).
function bolt(pts, r0, r1) {
  const parts = [];
  for (let i = 1; i < pts.length; i++) parts.push(S.limb(pts[i - 1], pts[i], lerp(r0, r1, (i - 1) / (pts.length - 1)), lerp(r0, r1, i / (pts.length - 1))));
  return S.union(0, ...parts);
}

const VARIANTS = {
  // ── Storm sprite: a grumpy little thundercloud with lightning horns and a bolt tail.
  storm: C => {
    const cloud = tone(C.light, C.dark, '#eef0ff', 0.28, 0.62, 0.2, 0.6);
    const volt = glowGrad('#ffe14d', '#fffbe0', 0.3, 0.8, 1, 0.6);
    const c = [0, 0.44, 0.02];
    const body = S.union(0.05,
      S.sphere(c, 0.155),
      S.mirror(S.sphere([0.13, 0.41, -0.01], 0.1)),
      S.sphere([0.05, 0.56, -0.03], 0.1),
      S.sphere([-0.07, 0.545, -0.02], 0.09),
      S.sphere([0, 0.47, -0.1], 0.12),
      S.mirror(S.sphere([0.07, 0.33, -0.01], 0.085)),
    ).paint(cloud);
    return {
      spec: spec(),
      head: S.sphere(c, 0.155),
      sdf: S.union(0.02,
        body.bone('head'),
        S.mirror(bolt([[0.06, 0.6, -0.02], [0.1, 0.68, -0.02], [0.075, 0.7, -0.02], [0.13, 0.8, -0.03]], 0.028, 0.008)).paint(volt).bone('head'),
        S.mirror(S.union(0.02, S.limb([0.15, 0.4, 0.02], [0.22, 0.36, 0.05], 0.035, 0.04), S.sphere([0.23, 0.35, 0.06], 0.05))).paint(cloud).bone('arm.L'),
        bolt([[0, 0.3, -0.02], [0.04, 0.23, -0.05], [-0.02, 0.2, -0.07], [0.02, 0.1, -0.12]], 0.035, 0.008).paint(volt).bone('tail2'),
      ),
      face: face(C, c, 0.155, { iris: '#9ff6ff', iris2: '#2a5bff', angry: 0.5, brows: true, browAngle: 1.0, glow: 0.4, open: 0.3, smile: 0.3, asym: 0.4, eyeY: 0.05 }),
      props: [0, 1, 2].map(i => {
        const a = (i / 3) * TAU + 0.5;
        const p = [Math.sin(a) * 0.3, 0.42 + 0.08 * Math.sin(a * 2), Math.cos(a) * 0.3];
        return { sdf: bolt([add(p, [0, 0.03, 0]), add(p, [0.02, 0, 0]), add(p, [-0.01, -0.005, 0]), add(p, [0.01, -0.04, 0])], 0.013, 0.005).paint(volt), bone: 'body', spin: 2.2, cell: 0.012, outline: false };
      }),
      pulse: 0.3,
    };
  },

  // ── Light wisp: a glowing orb with a halo, little feathered wings and a flame tail.
  light: C => {
    const c = [0, 0.44, 0.0];
    const orb = glowRadial([0, 0.46, 0.08], 0.2, '#fffbe6', '#ffc81f', 0.3, 0.5);
    const feather = tone('#ffffff', '#f4d27a', '#ffffff', 0.35, 0.55, 0.35, 0.3);
    const wing = S.union(0.012,
      S.ellipsoid([0.2, 0.5, -0.07], [0.09, 0.022, 0.04]).rot(0.3, 0.5, 0.55),
      S.ellipsoid([0.2, 0.46, -0.09], [0.075, 0.02, 0.035]).rot(0.3, 0.6, 0.25),
      S.ellipsoid([0.18, 0.42, -0.09], [0.06, 0.018, 0.03]).rot(0.3, 0.6, -0.05),
    ).paint(feather);
    return {
      spec: spec({ halo: { parent: 'head', pos: [0, 0.7, -0.02] }, 'wing.L': { parent: 'body', pos: [0.12, 0.46, -0.06] }, 'wing.R': { parent: 'body', pos: [-0.12, 0.46, -0.06] } }),
      head: S.sphere(c, 0.16),
      sdf: S.union(0.02,
        S.union(0.06,
          S.sphere(c, 0.16),
          flame([0, 0.52, -0.04], [0, 0.72, -0.16], 0.09, [0, 0.02, 0.02]),
        ).paint(orb).bone('head'),
        S.mirror(wing).bone('wing.L'),
        S.mirror(S.sphere([0.155, 0.38, 0.05], 0.04)).paint(orb).bone('arm.L'),
        tube([0, 0.32, -0.01], [0, 0.2, 0.0], [0, 0.14, -0.1], 0.08, 0.01, 3).paint(glowGrad('#ffb800', '#fff6c9', 0.12, 0.35, 0.8, 0.4)).bone('tail2'),
      ),
      face: face(C, c, 0.16, { iris: '#5a3200', iris2: '#1e0f00', sclera: '#fffdf6', ink: '#5a3a00', irisSize: 0.66, pupilSize: 0.32, open: 0.4, smile: 1.1 }),
      props: [{ sdf: S.torus([0, 0.7, -0.02], 0.085, 0.017).rot(0.25, 0, 0).paint(G('#ffe680', 1, 0.8)), bone: 'halo', spin: 1.5, cell: 0.012 }],
      emissive: 1.4, pulse: 0.15,
    };
  },

  // ── Water spirit: a droplet with a curling wave crest, fins and bubbles.
  tide: C => {
    const c = [0, 0.41, 0.0];
    const water = (x, y, z, l, nx, ny, nz) => {
      const t = smooth((y - 0.25) / 0.4);
      const a = hex(C.dark), b = hex(C.body), w = hex(C.light), f = hex(C.foam);
      let col = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const hl = Math.max(0, ny) * Math.max(0, nz * 0.5 + 0.5) * 0.6;
      col = col.map((v, i) => v + (w[i] - v) * hl);
      const foam = smooth((y - 0.66) / 0.05);
      col = col.map((v, i) => v + (f[i] - v) * foam);
      return { color: col, gloss: 0.7, emissive: 0 };
    };
    return {
      spec: spec({ crest: { parent: 'head', pos: [0, 0.56, -0.02] } }),
      head: S.sphere(c, 0.17),
      sdf: S.union(0.02,
        S.union(0.07,
          S.sphere(c, 0.17),
          tube([0, 0.5, -0.01], [0.0, 0.7, 0.0], [0, 0.7, -0.14], 0.1, 0.03, 4).bone('crest'),
          S.sphere([0, 0.66, -0.15], 0.045).bone('crest'),
        ).paint(water).bone('head'),
        S.mirror(S.ellipsoid([0.18, 0.37, 0.02], [0.07, 0.035, 0.03]).rot(0, 0.4, -0.6)).paint(water).bone('arm.L'),
        tube([0, 0.3, -0.01], [0.06, 0.18, -0.02], [-0.02, 0.12, -0.12], 0.08, 0.012, 4).paint(water).bone('tail2'),
      ),
      face: face(C, c, 0.17, { iris: '#bfe8ff', iris2: '#1d4ed8', open: 0.35, smile: 1.0, eyeSize: [0.105, 0.125] }),
      props: [0, 1, 2].map(i => {
        const a = (i / 3) * TAU;
        const p = [Math.sin(a) * 0.28, 0.35 + 0.1 * i, Math.cos(a) * 0.28];
        return { sdf: S.sphere(p, 0.028 - i * 0.004).paint(P('#dff3ff', 0.9, 0.25)), bone: 'body', spin: 1.1, cell: 0.012 };
      }),
    };
  },

  // ── Starling: a puffy five-pointed star with a cosmic hide and orbiting sparkles.
  space: C => {
    const c = [0, 0.42, 0.0];
    const hide = starry(tone(C.body, C.deep, C.light, 0.25, 0.62, 0.3, 0.45), '#ffffff', 22, 0.8, 1);
    const pts = [];
    const bones = {};
    const names = ['tip', 'arm.L', 'leg.L', 'leg.R', 'arm.R'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const d = [Math.sin(a), Math.cos(a), 0];
      const base = add(c, [d[0] * 0.08, d[1] * 0.08, 0]);
      const tip = add(c, [d[0] * 0.27, d[1] * 0.27, -0.01]);
      pts.push(S.limb(base, tip, 0.1, 0.04).bone(names[i]));
      bones[names[i]] = { parent: 'body', pos: add(c, [d[0] * 0.1, d[1] * 0.1, 0]) };
    }
    const sp = {
      root: { pos: [0, 0, 0] }, body: { parent: 'root', pos: [0, 0.42, 0] }, head: { parent: 'body', pos: [0, 0.42, 0] },
      ...bones,
    };
    return {
      spec: sp,
      head: S.ellipsoid(c, [0.15, 0.15, 0.13]),
      sdf: S.union(0.05, S.ellipsoid(c, [0.15, 0.15, 0.13]).bone('head'), ...pts).paint(hide),
      face: face(C, c, 0.14, { iris: '#ffe6ff', iris2: C.body, open: 0.3, smile: 1, eyeSize: [0.09, 0.11], glow: 0.5, eyeY: 0.12, mouthY: 0.3 }),
      props: [0, 1].map(i => {
        const a = i * Math.PI;
        const p = [Math.sin(a) * 0.32, 0.5 - 0.12 * i, Math.cos(a) * 0.32];
        return { sdf: S.union(0.008, S.limb(add(p, [0, -0.04, 0]), add(p, [0, 0.04, 0]), 0.018, 0.003), S.limb(add(p, [-0.04, 0, 0]), add(p, [0.04, 0, 0]), 0.018, 0.003)).paint(G('#fff6ff', 1, 0.8)), bone: 'body', spin: -1.6, cell: 0.012, outline: false };
      }),
      star: true, pulse: 0.1,
    };
  },
};

export function sculptSpirit(ctx) {
  const { variant, pal: C } = ctx;
  const v = VARIANTS[variant](C);
  return {
    spec: v.spec, sdf: v.sdf,
    face: { sdf: v.head, bone: 'head', features: v.face },
    props: v.props || [],
    cell: 0.019, aoStep: 0.024, tau: 0.03,
    height: 0.78, radius: 0.24,
    anim: 'spirit', animOpts: { star: !!v.star }, spawn: 'pop', glow: C.glow, emissive: v.emissive, emissivePulse: v.pulse ?? 0,
  };
}

export function poseSpirit(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const o = c.def.animOpts;
  const w = smooth(sp * 1.5);
  let mood = 'idle';
  const bob = Math.sin(t * 2.3);
  R.y += 0.06 + 0.035 * bob + 0.02 * Math.sin(ph * 2) * w;
  R.rx += 0.28 * w;
  R.rz += 0.06 * Math.sin(t * 1.3) * (1 - w);
  P.body = [0.04 * bob, 0.15 * Math.sin(t * 0.7) * (1 - w), 0];
  P.head = [-0.06 * bob - 0.1 * w, 0.1 * Math.sin(t * 0.9) * (1 - w), 0.05 * Math.sin(t * 1.1)];
  P['arm.L'] = [0.3 * Math.sin(t * 3) * (1 - w) + 0.5 * w, 0, 0.3 + 0.2 * Math.sin(t * 2.5)];
  P['arm.R'] = [-0.3 * Math.sin(t * 3) * (1 - w) + 0.5 * w, 0, -0.3 - 0.2 * Math.sin(t * 2.5 + 1)];
  for (let i = 1; i <= 3; i++) P['tail' + i] = [-0.35 * w + 0.15 * Math.sin(t * 3 - i), 0.3 * Math.sin(t * 2.4 - i * 0.9), 0];
  P['wing.L'] = [0, 0, 0.35 * Math.sin(t * 11)];
  P['wing.R'] = [0, 0, -0.35 * Math.sin(t * 11)];
  P.halo = [0, 0, 0.1 * Math.sin(t * 2)];
  P.crest = [0.15 * Math.sin(t * 2.5), 0.1 * Math.sin(t * 1.7), 0];
  if (o.star) {
    const wv = Math.sin(t * 3);
    P.tip = [0, 0, 0.15 * Math.sin(t * 2)];
    P['arm.L'] = [0, 0, 0.3 * wv]; P['arm.R'] = [0, 0, -0.3 * wv];
    P['leg.L'] = [0.3 * Math.sin(ph) * w, 0, 0.1 * Math.sin(t * 2.2)]; P['leg.R'] = [-0.3 * Math.sin(ph) * w, 0, -0.1 * Math.sin(t * 2.2)];
    P.body[2] = 0.12 * Math.sin(t * 1.2);
  }
  if (kind === 'attack') {
    const wind = smooth(k / 0.3), hit = smooth((k - 0.3) / 0.12), back = smooth((k - 0.55) / 0.45);
    const hold = 1 - back;
    R.z += (-0.08 * wind + 0.25 * hit) * hold;
    R.rx += (-0.3 * wind + 0.5 * hit) * hold;
    R.sy *= 1 - 0.15 * wind * (1 - hit) + 0.12 * hit * hold;
    P['arm.L'] = [-1.4 * hit * hold, 0, 0.3]; P['arm.R'] = [-1.4 * hit * hold, 0, -0.3];
    R.emi = 1 + 1.5 * hit * hold;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    mood = k > 0.4 ? 'happy' : 'idle';
  } else if (kind === 'hit') {
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.5);
    R.y -= 0.1 * f;
    R.ry += 4 * f * f;
    R.rz += 0.6 * f;
    mood = 'ko';
  }
  return mood;
}
