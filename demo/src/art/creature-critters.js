// Critters: what a hexed enemy turns into. Harmless, funny, 0.3–0.5 m.
// Each essence has its own tiny sculpt; they share a bone vocabulary (body,
// head, leg/legB, wing, tail, ear, ant, tent*, stem) and six motion styles:
// hop, waddle, flutter, float, slide, wobble.

import { S, P, G, TAU, add, mix3, fx, lerp, smooth, clamp01, tube, horn, spike, flame, tone, belly, glowGrad, glowRadial, veins, mottle, starry, bands, eyes, brows, mouth, hex, mixc } from './creature-kit.js';

const B = (parent, pos) => ({ parent, pos });
const mirrorBones = (sp) => {
  for (const [n, b] of Object.entries({ ...sp })) {
    if (!n.endsWith('.L')) continue;
    const r = n.slice(0, -2) + '.R';
    if (!sp[r]) sp[r] = { parent: b.parent.endsWith('.L') ? b.parent.slice(0, -2) + '.R' : b.parent, pos: fx(b.pos) };
  }
  return sp;
};
const face2 = (C, c, size, o = {}) => eyes(c, size, {
  iris: o.iris ?? '#2a1a14', iris2: o.iris2 ?? '#000000', sclera: o.sclera, ink: o.ink ?? C.ink, angry: o.angry ?? 0,
  lidRest: o.lidRest ?? 0.06, irisSize: o.irisSize ?? 0.7, pupilSize: o.pupilSize ?? 0.4, yaw: o.yaw ?? 0.4, pitch: o.pitch ?? 0.05, glow: o.glow ?? 0, dir: o.dir,
});

const CRITTERS = {
  // ── Ember newt: flat-headed salamander with glowing ember spots and a flame-tipped tail.
  fire: C => {
    const skin = (x, y, z, l, nx, ny, nz, cell) => {
      const base = belly('#ff6a2a', '#ffd27a', '#c2330f', 0.02, 0.12, { light: '#ff9a55', under: 1 })(x, y, z, l, nx, ny, nz, cell);
      return base;
    };
    const spots = (x, y, z, l, nx, ny, nz, cell) => {
      const p = skin(x, y, z, l, nx, ny, nz, cell);
      if (ny < 0.4) return p;
      const d = Math.min(...[[0.03, -0.02], [-0.035, -0.07], [0.02, -0.12], [-0.01, 0.04], [0.04, 0.06]].map(([sx, sz]) => Math.hypot(x - sx, z - sz)));
      const t = 1 - smooth((d - 0.012) / 0.008);
      return t > 0.01 ? { color: mixc(p.color, hex('#ffe45c'), t), gloss: 0.4, emissive: t } : p;
    };
    const sp = mirrorBones({
      root: B(null, [0, 0, 0]), body: B('root', [0, 0.08, 0]), head: B('body', [0, 0.1, 0.12]),
      'leg.L': B('body', [0.06, 0.07, 0.08]), 'legB.L': B('body', [0.06, 0.07, -0.07]),
      tail1: B('body', [0, 0.08, -0.13]), tail2: B('tail1', [0.01, 0.075, -0.24]),
    });
    delete sp.root.parent;
    const headCore = S.union(0.03,
      S.ellipsoid([0, 0.11, 0.16], [0.09, 0.062, 0.08]),
      S.mirror(S.sphere([0.048, 0.155, 0.175], 0.036)),
    ).paint(skin);
    const leg = (bn, a, b) => S.union(0.012, S.limb(a, b, 0.024, 0.02), S.ellipsoid([b[0] + 0.012, 0.014, b[2] + 0.01], [0.03, 0.014, 0.03])).bone(bn);
    return {
      spec: sp, height: 0.3, radius: 0.22, style: 'waddle',
      sdf: S.union(0.02,
        S.ellipsoid([0, 0.085, 0], [0.078, 0.062, 0.14]).paint(spots).bone('body'),
        headCore.bone('head'),
        S.mirror(S.union(0.01, leg('leg.L', [0.06, 0.07, 0.08], [0.11, 0.025, 0.1]), leg('legB.L', [0.06, 0.07, -0.07], [0.11, 0.025, -0.09]))).paint(skin),
        S.union(0.01,
          tube([0, 0.08, -0.12], [0.02, 0.07, -0.22], [0.05, 0.08, -0.3], 0.048, 0.014, 3).paint(spots).bone('tail2'),
          flame([0.055, 0.09, -0.31], [0.07, 0.19, -0.33], 0.028).paint(glowGrad('#ff7a1a', '#ffe066', 0.08, 0.2, 1, 0.3)).bone('tail2'),
        ),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.048, 0.165, 0.2], [0.05, 0.055], { iris: '#3a1a08', dir: [0.35, 0.4, 1] }),
        mouth([0, 0.095, 0.235], [0.09, 0.04], { open: 0.2, smile: 1.2, width: 0.95, inside: '#6a1a0a', ink: C.ink, dir: [0, -0.1, 1] }),
      ] },
      pulse: 0.2,
    };
  },

  // ── Penguin in a little blue scarf.
  frost: C => {
    const dark = tone('#2b3a55', '#141c2e', '#4a6080', 0.05, 0.4, 0.3, 0.5);
    const white = P('#fbfdff', 0.3);
    const orange = P('#ff9a2e', 0.45);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.16, 0]), head: B('body', [0, 0.3, 0.01]), 'wing.L': B('body', [0.12, 0.25, 0]), 'leg.L': B('body', [0.05, 0.06, 0.02]), tail1: B('body', [0, 0.28, -0.08]) });
    const headCore = S.union(0.04,
      S.ellipsoid([0, 0.34, 0.01], [0.1, 0.09, 0.095]).paint(dark),
      S.mirror(S.ellipsoid([0.045, 0.345, 0.07], [0.04, 0.045, 0.03]).paint(white)),
    );
    return {
      spec: sp, height: 0.44, radius: 0.18, style: 'waddle',
      sdf: S.union(0.02,
        S.union(0.05,
          S.ellipsoid([0, 0.2, 0], [0.13, 0.17, 0.12]).paint(dark),
          S.ellipsoid([0, 0.185, 0.045], [0.1, 0.14, 0.085]).paint(white),
        ).bone('body'),
        headCore.bone('head'),
        S.limb([0, 0.335, 0.09], [0, 0.325, 0.15], 0.026, 0.006).paint(orange).bone('head'),
        S.mirror(S.ellipsoid([0.13, 0.21, 0.0], [0.025, 0.09, 0.045]).rot(0, 0, 0.35).paint(dark).bone('wing.L')),
        S.mirror(S.ellipsoid([0.05, 0.016, 0.06], [0.04, 0.016, 0.055]).paint(orange).bone('leg.L')),
        S.union(0.01,
          S.torus([0, 0.275, 0.0], 0.095, 0.028).rot(0.12, 0, 0),
          S.limb([0.06, 0.26, 0.07], [0.085, 0.17, 0.1], 0.03, 0.022),
        ).paint(bands('#38bdf8', '#e8f7ff', [0, 0, 0], [0.3, 1, 0.2], 0.035, 0.35, 0.12)).bone('body'),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.045, 0.35, 0.09], [0.05, 0.058], { iris: '#101828', irisSize: 0.72 }),
      ] },
    };
  },

  // ── Sparking hedgehog: round, spiky, with lightning-tipped quills.
  storm: C => {
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.12, 0]), head: B('body', [0, 0.11, 0.1]), 'leg.L': B('body', [0.06, 0.05, 0.06]), 'legB.L': B('body', [0.06, 0.05, -0.06]), 'ear.L': B('head', [0.05, 0.16, 0.1]) });
    const quillC = [0, 0.14, -0.03];
    const quill = (x, y, z) => {
      const d = Math.hypot(x - quillC[0], y - quillC[1], z - quillC[2]);
      const t = smooth((d - 0.14) / 0.07);
      return { color: mixc(hex('#3f3a8f'), hex('#fff38a'), t), gloss: 0.4, emissive: t * t };
    };
    const quills = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      const el = 0.25 + i * 0.33, az = -1.9 + j * 0.95 + (i % 2) * 0.45;
      if (i === 0 && j % 2) continue;
      const d = [Math.sin(el) * Math.sin(az + Math.PI), Math.cos(el), Math.sin(el) * Math.cos(az + Math.PI)];
      if (d[2] > 0.55) continue;
      const base = add(quillC, [d[0] * 0.1, d[1] * 0.1, d[2] * 0.1]);
      quills.push(spike(base, add(quillC, [d[0] * 0.22, d[1] * 0.22 + 0.02, d[2] * 0.22 - 0.02]), 0.032));
    }
    const tan = P('#e8c9a0', 0.25);
    const headCore = S.union(0.03, S.ellipsoid([0, 0.11, 0.1], [0.075, 0.068, 0.075]), S.limb([0, 0.105, 0.13], [0, 0.095, 0.19], 0.042, 0.022)).paint(tan);
    return {
      spec: sp, height: 0.32, radius: 0.2, style: 'waddle', pulse: 0.4,
      sdf: S.union(0.02,
        S.union(0.02, S.ellipsoid(quillC, [0.125, 0.11, 0.14]).paint(P('#4b4598', 0.3)), ...quills.map(q => q.paint(quill))).bone('body'),
        headCore.bone('head'),
        S.sphere([0, 0.1, 0.205], 0.017).paint(P('#1a1020', 0.7)).bone('head'),
        S.mirror(S.sphere([0.055, 0.165, 0.09], 0.022).paint(tan).bone('ear.L')),
        S.mirror(S.union(0.01, S.sphere([0.06, 0.03, 0.06], 0.025), S.sphere([0.065, 0.03, -0.07], 0.025)).paint(tan).bone('leg.L')),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.035, 0.135, 0.165], [0.04, 0.045], { iris: '#140c20', yaw: 0.5, pitch: 0.1 }),
        mouth([0, 0.082, 0.175], [0.05, 0.03], { open: 0.2, smile: 1, width: 0.7, ink: '#3a2020', dir: [0, -0.5, 1] }),
      ] },
    };
  },

  // ── Stone statue: a little figure frozen mid-shock on a mossy pedestal.
  stone: C => {
    const rock = mottle(tone('#b8b0a6', '#7d756d', '#e2dbd2', 0.0, 0.45, 0.15, 0.35), '#8f877f', 14, 0.35);
    const moss = (x, y, z, l, nx, ny, nz, cell) => {
      const p = rock(x, y, z, l, nx, ny, nz, cell);
      const m = smooth((ny - 0.6) / 0.25) * smooth((0.1 - y) / 0.02);
      return { ...p, color: mixc(p.color, hex('#7fae4a'), m) };
    };
    const sp = { root: { pos: [0, 0, 0] }, body: B('root', [0, 0.1, 0]), head: B('body', [0, 0.26, 0]) };
    const headCore = S.union(0.03, S.ellipsoid([0, 0.33, 0.0], [0.11, 0.1, 0.1]), S.mirror(S.ellipsoid([0.1, 0.33, -0.01], [0.03, 0.04, 0.025]))).paint(rock);
    return {
      spec: sp, height: 0.46, radius: 0.18, style: 'wobble', noBlink: true,
      sdf: S.union(0.015,
        S.union(0.01,
          S.box([0, 0.045, 0], [0.13, 0.045, 0.13], 0.015).paint(moss),
          S.box([0, 0.1, 0], [0.105, 0.015, 0.105], 0.01).paint(moss),
        ).bone('body'),
        S.union(0.03,
          S.ellipsoid([0, 0.18, 0], [0.085, 0.07, 0.07]),
          S.mirror(S.limb([0.07, 0.21, 0.0], [0.13, 0.3, 0.02], 0.025, 0.022)),
          S.mirror(S.sphere([0.135, 0.315, 0.025], 0.03)),
          S.mirror(S.limb([0.035, 0.13, 0.02], [0.045, 0.115, 0.06], 0.028, 0.026)),
        ).paint(rock).bone('body'),
        headCore.bone('head'),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.042, 0.345, 0.09], [0.05, 0.06], { iris: '#6d655e', iris2: '#4a433d', sclera: '#d8d1c8', ink: '#3a342f', irisSize: 0.35, pupilSize: 0 }),
        mouth([0, 0.29, 0.095], [0.045, 0.045], { open: 0.9, smile: 0, width: 0.45, inside: '#4a433d', ink: '#3a342f', dir: [0, -0.2, 1] }),
      ] },
    };
  },

  // ── Frog: vivid blue dart frog with big eyes and a wide grin.
  tide: C => {
    const skin = (x, y, z, l, nx, ny, nz, cell) => {
      const p = belly('#2f7bff', '#bde6ff', '#1a3f9a', 0.02, 0.2, { light: '#6fb1ff', under: 1, gloss: 0.55 })(x, y, z, l, nx, ny, nz, cell);
      const d = Math.min(...[[0.05, 0.19, -0.05], [-0.06, 0.17, -0.08], [0.0, 0.2, -0.1], [0.09, 0.13, 0.0], [-0.09, 0.14, 0.02]].map(q => Math.hypot(x - q[0], y - q[1], z - q[2])));
      const t = 1 - smooth((d - 0.014) / 0.008);
      return t > 0.01 && ny > -0.2 ? { ...p, color: mixc(p.color, hex('#0b1d52'), t) } : p;
    };
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.09, 0]), head: B('body', [0, 0.13, 0.06]), 'leg.L': B('body', [0.07, 0.08, 0.09]), 'legB.L': B('body', [0.09, 0.07, -0.06]) });
    const headCore = S.union(0.035,
      S.ellipsoid([0, 0.14, 0.08], [0.13, 0.075, 0.1]),
      S.mirror(S.sphere([0.075, 0.2, 0.09], 0.048)),
    ).paint(skin);
    return {
      spec: sp, height: 0.28, radius: 0.2, style: 'hop',
      sdf: S.union(0.02,
        S.ellipsoid([0, 0.11, -0.02], [0.12, 0.09, 0.13]).paint(skin).bone('body'),
        headCore.bone('head'),
        S.mirror(S.union(0.015,
          S.limb([0.07, 0.08, 0.09], [0.1, 0.02, 0.13], 0.022, 0.018).bone('leg.L'),
          S.ellipsoid([0.105, 0.01, 0.15], [0.035, 0.01, 0.03]).bone('leg.L'),
          S.ellipsoid([0.1, 0.07, -0.07], [0.045, 0.055, 0.075]).rot(0.4, 0, 0).bone('legB.L'),
          S.ellipsoid([0.13, 0.012, -0.02], [0.04, 0.012, 0.055]).bone('legB.L'),
        )).paint(skin),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.075, 0.215, 0.125], [0.07, 0.075], { iris: '#101010', irisSize: 0.6, dir: [0.35, 0.5, 1] }),
        mouth([0, 0.115, 0.175], [0.2, 0.05], { open: 0.1, smile: 1.1, width: 0.95, inside: '#5a1a2a', ink: '#0b1d52', dir: [0, -0.2, 1] }),
      ] },
    };
  },

  // ── Dandelion puff: a fluffy seed head on a stem with leaf feet, shedding seeds.
  gale: C => {
    const fluff = (x, y, z, l, nx, ny, nz) => {
      const d = Math.hypot(x, y - 0.31, z);
      return { color: mixc(hex('#eef7d0'), hex('#ffffff'), smooth((d - 0.08) / 0.07)), gloss: 0.15, emissive: 0 };
    };
    const green = tone('#84cc16', '#3f6d0c', '#c3f36a', 0.0, 0.2, 0.3, 0.4);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.02, 0]), stem: B('body', [0, 0.1, 0]), head: B('stem', [0, 0.2, 0]), 'leg.L': B('body', [0.04, 0.02, 0]), 'arm.L': B('stem', [0.02, 0.13, 0]) });
    const puff = S.displace(S.sphere([0, 0.31, 0], 0.13), 0.014, 22, 2, 7.7);
    return {
      spec: sp, height: 0.45, radius: 0.16, style: 'float', cell: 0.012,
      sdf: S.union(0.015,
        puff.paint(fluff).bone('head'),
        S.union(0.01,
          S.limb([0, 0.02, 0], [0, 0.19, 0], 0.02, 0.016).bone('stem'),
          S.mirror(S.ellipsoid([0.05, 0.012, 0.01], [0.055, 0.012, 0.025]).rot(0, 0.3, 0.1).bone('leg.L')),
          S.mirror(S.ellipsoid([0.05, 0.13, 0.0], [0.045, 0.01, 0.02]).rot(0, 0, 0.5).bone('arm.L')),
        ).paint(green),
      ),
      face: { sdf: S.sphere([0, 0.31, 0], 0.142), features: [
        ...face2(C, [0.045, 0.325, 0.13], [0.045, 0.055], { iris: '#1a2410', irisSize: 0.72 }),
        mouth([0, 0.285, 0.135], [0.05, 0.03], { open: 0.25, smile: 1.2, width: 0.7, ink: '#2a3a10', inside: '#5a2a1a' }),
      ] },
      props: [0, 1, 2].map(i => {
        const a = (i / 3) * TAU;
        const p = [Math.sin(a) * 0.22, 0.34 + 0.04 * i, Math.cos(a) * 0.22];
        return { sdf: S.union(0.005, S.sphere(p, 0.018), S.limb(p, add(p, [0, -0.04, 0]), 0.005, 0.004)).paint(P('#ffffff', 0.2)), bone: 'body', spin: 0.8, cell: 0.01, outline: false };
      }),
    };
  },

  // ── Harmless moth: fuzzy cream moth with eyespot wings and feathery antennae.
  light: C => {
    const fuzz = mottle(tone('#fff4d6', '#e8c98a', '#ffffff', 0.2, 0.36, 0.15, 0.3), '#f0d9a0', 40, 0.3);
    const wingP = (x, y, z) => {
      const ax = Math.abs(x);
      const e = Math.hypot(ax - 0.15, y - 0.35, z + 0.01);
      let col = mixc(hex('#ffe9a8'), hex('#f2c14e'), smooth((ax - 0.06) / 0.16));
      if (e < 0.035) col = mixc(col, hex('#7a4a1a'), 1 - smooth((e - 0.018) / 0.006));
      if (e < 0.018) col = mixc(col, hex('#fff8e0'), 1 - smooth((e - 0.008) / 0.006));
      return { color: col, gloss: 0.3, emissive: 0.1 };
    };
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.28, 0]), head: B('body', [0, 0.31, 0.06]), 'wing.L': B('body', [0.04, 0.31, 0.0]), 'ant.L': B('head', [0.02, 0.35, 0.09]), 'leg.L': B('body', [0.03, 0.26, 0.02]) });
    const headCore = S.sphere([0, 0.32, 0.075], 0.052).paint(fuzz);
    return {
      spec: sp, height: 0.46, radius: 0.24, style: 'flutter', cell: 0.012,
      sdf: S.union(0.015,
        S.union(0.03,
          S.ellipsoid([0, 0.3, 0.0], [0.058, 0.058, 0.065]),
          S.ellipsoid([0, 0.27, -0.08], [0.045, 0.045, 0.08]).rot(0.35, 0, 0).paint(bands('#fff0c8', '#d9a84a', [0, 0.27, 0], [0, 0.4, -1], 0.035, 0.35, 0.3, 0.3)),
          S.torus([0, 0.33, 0.035], 0.05, 0.025).rot(1.2, 0, 0),
        ).paint(fuzz).bone('body'),
        headCore.bone('head'),
        S.mirror(S.union(0.01,
          S.ellipsoid([0.14, 0.34, -0.01], [0.12, 0.012, 0.08]).rot(0.2, 0.25, 0.35),
          S.ellipsoid([0.1, 0.28, -0.07], [0.08, 0.011, 0.055]).rot(0.2, 0.5, 0.1),
        ).paint(wingP).bone('wing.L')),
        S.mirror(S.union(0.005,
          tube([0.02, 0.36, 0.1], [0.04, 0.43, 0.13], [0.07, 0.45, 0.1], 0.008, 0.005, 3),
          S.ellipsoid([0.065, 0.44, 0.11], [0.02, 0.012, 0.02]),
        ).paint(P('#c89a4a', 0.3)).bone('ant.L')),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.03, 0.33, 0.12], [0.045, 0.055], { iris: '#1a1008', irisSize: 0.78, pupilSize: 0.5, yaw: 0.55 }),
        mouth([0, 0.3, 0.123], [0.03, 0.02], { open: 0.1, smile: 1, width: 0.6, ink: '#5a3a10' }),
      ] },
    };
  },

  // ── Bat: purple, big ears, tiny fangs, scalloped wings.
  shadow: C => {
    const fur = tone('#7c3aed', '#3b1a78', '#a98bfa', 0.22, 0.42, 0.25, 0.4);
    const mem = tone('#4b2596', '#2a124f', '#6d44c4', 0.25, 0.4, 0.3, 0.3);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.28, 0]), head: B('body', [0, 0.33, 0.02]), 'wing.L': B('body', [0.05, 0.31, 0.0]), 'ear.L': B('head', [0.045, 0.42, 0.01]), 'leg.L': B('body', [0.03, 0.23, -0.01]) });
    const headCore = S.union(0.03, S.ellipsoid([0, 0.36, 0.025], [0.085, 0.075, 0.075]), S.ellipsoid([0, 0.34, 0.08], [0.04, 0.03, 0.03])).paint(fur);
    const wing = S.sub(0.008,
      S.union(0.01,
        S.ellipsoid([0.16, 0.3, -0.02], [0.13, 0.08, 0.012]).rot(0.1, 0.15, -0.1),
        S.limb([0.05, 0.32, -0.01], [0.2, 0.36, -0.03], 0.013, 0.008),
        S.limb([0.2, 0.36, -0.03], [0.29, 0.28, -0.05], 0.008, 0.004),
        S.limb([0.2, 0.36, -0.03], [0.21, 0.23, -0.04], 0.008, 0.004),
      ),
      S.sphere([0.25, 0.2, -0.04], 0.055),
      S.sphere([0.14, 0.19, -0.03], 0.05),
    ).paint(mem);
    return {
      spec: sp, height: 0.46, radius: 0.28, style: 'flutter',
      sdf: S.union(0.015,
        S.ellipsoid([0, 0.28, 0], [0.07, 0.08, 0.065]).paint(fur).bone('body'),
        headCore.bone('head'),
        S.mirror(S.carve(0.005,
          S.union(0.01, S.ellipsoid([0.055, 0.44, 0.01], [0.035, 0.06, 0.018]).rot(0, 0, -0.35), S.limb([0.06, 0.46, 0.01], [0.09, 0.52, 0.0], 0.02, 0.003)),
          S.ellipsoid([0.058, 0.445, 0.026], [0.02, 0.04, 0.008]).rot(0, 0, -0.35).paint(P('#ff9ec8', 0.3)),
        ).paint(fur).bone('ear.L')),
        S.mirror(S.limb([0.018, 0.318, 0.1], [0.017, 0.297, 0.103], 0.008, 0.002)).paint(P('#ffffff', 0.5)).bone('head'),
        S.mirror(wing.bone('wing.L')),
        S.mirror(S.limb([0.03, 0.22, 0.0], [0.035, 0.17, -0.01], 0.012, 0.009).paint(fur).bone('leg.L')),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.036, 0.375, 0.085], [0.05, 0.058], { iris: C.glow, iris2: '#6d28d9', glow: 0.5, irisSize: 0.66, yaw: 0.45 }),
        mouth([0, 0.325, 0.1], [0.045, 0.025], { open: 0.2, smile: 0.9, width: 0.65, ink: C.ink }),
      ] },
    };
  },

  // ── Sapling: a tiny walking tree with a leafy crown and an apple.
  life: C => {
    const barkP = tone('#8b5a2b', '#4f3119', '#c08a52', 0.0, 0.25, 0.2, 0.35);
    const leaves = mottle(tone('#3fcf6e', '#15803d', '#a3f0b0', 0.28, 0.48, 0.25, 0.45), '#1f9e4a', 18, 0.4);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.05, 0]), head: B('body', [0, 0.15, 0]), crown: B('head', [0, 0.3, 0]), 'leg.L': B('body', [0.035, 0.05, 0]), 'arm.L': B('body', [0.05, 0.2, 0]) });
    const trunk = S.union(0.02, S.limb([0, 0.04, 0], [0, 0.29, 0], 0.062, 0.045)).paint(barkP);
    return {
      spec: sp, height: 0.48, radius: 0.18, style: 'waddle',
      sdf: S.union(0.015,
        trunk.bone('head'),
        S.union(0.03,
          S.sphere([0, 0.36, 0.0], 0.1), S.sphere([0.08, 0.33, 0.0], 0.075), S.sphere([-0.08, 0.34, -0.01], 0.075),
          S.sphere([0.02, 0.42, -0.02], 0.08), S.sphere([0, 0.33, -0.07], 0.08),
        ).paint(leaves).bone('crown'),
        S.union(0.005, S.sphere([0.07, 0.3, 0.07], 0.03).paint(P('#ff4d4d', 0.6)), S.limb([0.07, 0.325, 0.07], [0.075, 0.345, 0.065], 0.006).paint(P('#5c3a1e', 0.3))).bone('crown'),
        S.mirror(S.union(0.01,
          S.limb([0.045, 0.2, 0.0], [0.11, 0.24, 0.02], 0.014, 0.01),
          S.ellipsoid([0.125, 0.255, 0.025], [0.03, 0.01, 0.018]).rot(0, 0, 0.6).paint(leaves),
        ).paint(barkP).bone('arm.L')),
        S.mirror(S.union(0.01,
          S.limb([0.03, 0.06, 0.02], [0.07, 0.01, 0.06], 0.022, 0.012),
          S.limb([0.04, 0.05, -0.02], [0.08, 0.01, -0.05], 0.02, 0.01),
        ).paint(barkP).bone('leg.L')),
      ),
      face: { sdf: trunk, features: [
        ...face2(C, [0.024, 0.2, 0.055], [0.035, 0.042], { iris: '#2a1606', irisSize: 0.72, yaw: 0.5 }),
        mouth([0, 0.165, 0.06], [0.035, 0.022], { open: 0.2, smile: 1.1, width: 0.7, ink: '#2a1606' }),
      ] },
    };
  },

  // ── Skeleton rat: long skull with glowing sockets, ribcage, whip tail.
  death: C => {
    const bone = tone(C.bone, C.boneDark, '#fffaf0', 0.02, 0.16, 0.35, 0.35);
    const socket = P('#10201e', 0.2);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.08, 0]), head: B('body', [0, 0.1, 0.1]), 'leg.L': B('body', [0.04, 0.07, 0.06]), 'legB.L': B('body', [0.045, 0.07, -0.07]), tail1: B('body', [0, 0.08, -0.12]), tail2: B('tail1', [0.02, 0.06, -0.23]), 'ear.L': B('head', [0.04, 0.16, 0.1]) });
    const skull = S.carve(0.008,
      S.union(0.025,
        S.ellipsoid([0, 0.115, 0.13], [0.06, 0.05, 0.065]),
        S.limb([0, 0.105, 0.16], [0, 0.085, 0.235], 0.035, 0.014),
      ),
      S.mirror(S.ellipsoid([0.033, 0.13, 0.172], [0.022, 0.024, 0.02])).paint(socket),
    ).paint(bone);
    const ribs = S.sub(0.005,
      S.shell(S.ellipsoid([0, 0.09, -0.02], [0.055, 0.052, 0.07]), 0.009),
      S.box([0, 0.09, -0.02], [0.1, 0.009, 0.1], 0.003),
      S.box([0, 0.09, -0.02], [0.1, 0.1, 0.009], 0.003),
    ).paint(bone);
    return {
      spec: sp, height: 0.24, radius: 0.2, style: 'waddle', noBlink: true,
      sdf: S.union(0.012,
        S.union(0.008, ribs, S.limb([0, 0.12, -0.08], [0, 0.125, 0.06], 0.012, 0.012).paint(bone), S.sphere([0, 0.09, -0.02], 0.03).paint(glowRadial([0, 0.09, 0], 0.035, '#e8fffb', C.body, 1))).bone('body'),
        skull.bone('head'),
        S.mirror(S.union(0.005, S.ellipsoid([0.045, 0.17, 0.1], [0.028, 0.03, 0.01]).rot(0, 0.4, -0.3)).paint(bone).bone('ear.L')),
        S.mirror(S.union(0.008,
          S.limb([0.035, 0.08, 0.05], [0.05, 0.015, 0.07], 0.011, 0.009).bone('leg.L'),
          S.limb([0.04, 0.08, -0.07], [0.055, 0.015, -0.06], 0.012, 0.009).bone('legB.L'),
          S.ellipsoid([0.05, 0.01, 0.08], [0.015, 0.008, 0.02]).bone('leg.L'),
          S.ellipsoid([0.055, 0.01, -0.05], [0.015, 0.008, 0.02]).bone('legB.L'),
        ).paint(bone)),
        tube([0, 0.08, -0.12], [0.05, 0.05, -0.25], [0.02, 0.09, -0.34], 0.012, 0.004, 4).paint(bone).bone('tail2'),
      ),
      face: { sdf: skull, features: [
        ...face2(C, [0.033, 0.13, 0.168], [0.034, 0.036], { iris: C.eye, iris2: C.body, sclera: '#0b1715', ink: '#0b1715', irisSize: 0.5, pupilSize: 0.1, glow: 1, yaw: 0.55 }),
      ] },
    };
  },

  // ── Mosquito: a blood-bloated little bug with a comically long proboscis.
  blood: C => {
    const shell = tone('#8a1230', '#3a0512', '#e11d48', 0.2, 0.36, 0.5, 0.45);
    const blood = (x, y, z) => ({ color: mixc(hex('#ff3d63'), hex('#ffb3c2'), smooth((y - 0.22) / 0.1)), gloss: 0.8, emissive: 0.45 });
    const wingP = P('#ffe0e8', 0.6, 0.05);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.3, 0]), head: B('body', [0, 0.32, 0.07]), 'wing.L': B('body', [0.03, 0.33, -0.01]), 'leg.L': B('body', [0.03, 0.28, 0.02]), 'legB.L': B('body', [0.03, 0.28, -0.03]) });
    const headCore = S.union(0.02, S.sphere([0, 0.325, 0.085], 0.045), S.mirror(S.sphere([0.032, 0.34, 0.1], 0.032))).paint(shell);
    return {
      spec: sp, height: 0.44, radius: 0.22, style: 'flutter', cell: 0.012,
      sdf: S.union(0.012,
        S.union(0.02,
          S.ellipsoid([0, 0.305, 0.01], [0.048, 0.042, 0.05]).paint(shell),
          S.ellipsoid([0, 0.265, -0.1], [0.058, 0.052, 0.095]).rot(0.45, 0, 0).paint(blood),
        ).bone('body'),
        headCore.bone('head'),
        S.limb([0, 0.31, 0.12], [0, 0.25, 0.23], 0.012, 0.004).paint(P('#2a0510', 0.5)).bone('head'),
        S.mirror(S.ellipsoid([0.1, 0.36, -0.03], [0.09, 0.008, 0.035]).rot(0.1, 0.35, 0.3).paint(wingP).bone('wing.L')),
        S.mirror(S.union(0.005,
          tube([0.03, 0.285, 0.03], [0.09, 0.26, 0.07], [0.1, 0.16, 0.08], 0.008, 0.005, 3).bone('leg.L'),
          tube([0.035, 0.285, 0.0], [0.1, 0.25, 0.0], [0.12, 0.15, -0.01], 0.008, 0.005, 3).bone('leg.L'),
          tube([0.03, 0.285, -0.03], [0.09, 0.25, -0.08], [0.1, 0.16, -0.1], 0.008, 0.005, 3).bone('legB.L'),
        ).paint(P('#3a0512', 0.4))),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.034, 0.345, 0.125], [0.042, 0.05], { iris: '#ff2a55', iris2: '#5a0014', glow: 0.4, irisSize: 0.72, yaw: 0.6 }),
      ] },
      pulse: 0.15,
    };
  },

  // ── Confused sheep: pink-tinted wool puff, dark face, dizzy stars.
  mind: C => {
    const wool = mottle(tone('#ffe6f2', '#f2b3d3', '#ffffff', 0.12, 0.34, 0.12, 0.35), '#ffd1e8', 30, 0.4);
    const face = tone('#4a3446', '#2a1a28', '#6a4a64', 0.18, 0.32, 0.3, 0.4);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.2, 0]), head: B('body', [0, 0.25, 0.11]), 'leg.L': B('body', [0.055, 0.12, 0.07]), 'legB.L': B('body', [0.055, 0.12, -0.07]), 'ear.L': B('head', [0.05, 0.29, 0.13]) });
    const headCore = S.union(0.03, S.ellipsoid([0, 0.26, 0.15], [0.062, 0.07, 0.065]), S.ellipsoid([0, 0.225, 0.19], [0.042, 0.035, 0.035])).paint(face);
    const puffs = [[0, 0.24, -0.02, 0.11], [0.07, 0.22, 0.04, 0.085], [-0.07, 0.22, 0.04, 0.085], [0.075, 0.23, -0.07, 0.085], [-0.075, 0.23, -0.07, 0.085], [0, 0.3, 0.0, 0.085], [0, 0.18, -0.1, 0.08]];
    return {
      spec: sp, height: 0.42, radius: 0.2, style: 'hop', derp: true,
      sdf: S.union(0.015,
        S.union(0.025, ...puffs.map(p => S.sphere([p[0], p[1], p[2]], p[3]))).paint(wool).bone('body'),
        headCore.bone('head'),
        S.sphere([0, 0.32, 0.13], 0.045).paint(wool).bone('head'),
        S.mirror(S.ellipsoid([0.075, 0.27, 0.13], [0.04, 0.016, 0.022]).rot(0, 0.3, -0.4).paint(face).bone('ear.L')),
        S.mirror(S.union(0.008,
          S.limb([0.055, 0.14, 0.07], [0.055, 0.02, 0.075], 0.018, 0.016).bone('leg.L'),
          S.limb([0.055, 0.14, -0.07], [0.055, 0.02, -0.07], 0.018, 0.016).bone('legB.L'),
        ).paint(face)),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.03, 0.275, 0.2], [0.042, 0.05], { iris: '#2a1030', irisSize: 0.45, pupilSize: 0.3, yaw: 0.45 }),
        mouth([0, 0.225, 0.222], [0.04, 0.025], { open: 0.35, smile: -0.4, width: 0.6, asym: 0.6, ink: '#1a0a18', dir: [0, -0.3, 1] }),
      ] },
      props: [0, 1, 2].map(i => {
        const a = (i / 3) * TAU;
        const p = [Math.sin(a) * 0.08, 0.41, 0.11 + Math.cos(a) * 0.08];
        return { sdf: S.union(0.004, S.limb(add(p, [0, -0.025, 0]), add(p, [0, 0.025, 0]), 0.012, 0.002), S.limb(add(p, [-0.025, 0, 0]), add(p, [0.025, 0, 0]), 0.012, 0.002)).paint(G(i === 1 ? '#ffe14d' : '#ff9ad5', 1, 0.6)), bone: 'body', spin: 3, cell: 0.008, outline: false };
      }),
    };
  },

  // ── Snail: golden clockwork snail; its shell is a glowing clock face.
  time: C => {
    const skin = tone('#f6e3b4', '#c8a060', '#fffaf0', 0.0, 0.14, 0.4, 0.4);
    const shellP = (x, y, z, l, nx, ny, nz) => {
      const a = Math.atan2(y - 0.17, z + 0.03), r = Math.hypot(y - 0.17, z + 0.03);
      const spiral = Math.sin(a * 1 - r * 60) * 0.5 + 0.5;
      const col = mixc(hex('#b07a2a'), hex('#e8b04a'), smooth(spiral * 1.4 - 0.2));
      return { color: ny > 0.3 ? mixc(col, hex('#f6d58a'), (ny - 0.3) * 0.5) : col, gloss: 0.6, emissive: 0 };
    };
    const clock = (x, y, z) => {
      const dy = y - 0.17, dz = z + 0.03;
      const r = Math.hypot(dy, dz);
      const handA = Math.abs(dz) < 0.006 && dy > 0 && dy < 0.05;
      const handB = Math.abs(dy - dz * 0.5) < 0.006 && dz > 0 && dz < 0.035;
      const tick = r > 0.052 && r < 0.062 && (Math.abs(dy) < 0.006 || Math.abs(dz) < 0.006);
      return handA || handB || tick ? { color: hex('#4a2c08'), gloss: 0.6, emissive: 0 } : { color: hex('#ffe9a8'), gloss: 0.6, emissive: 0.4 };
    };
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.04, 0]), head: B('body', [0, 0.1, 0.13]), shell: B('body', [0, 0.1, -0.03]), 'ant.L': B('head', [0.025, 0.17, 0.17]) });
    const headCore = S.union(0.02, S.limb([0, 0.05, 0.12], [0, 0.13, 0.17], 0.052, 0.046)).paint(skin);
    const stalks = S.mirror(S.union(0.008, S.limb([0.022, 0.16, 0.17], [0.045, 0.25, 0.19], 0.013, 0.01), S.sphere([0.047, 0.26, 0.195], 0.026)).paint(skin).bone('ant.L'));
    return {
      spec: sp, height: 0.32, radius: 0.2, style: 'slide', cell: 0.012,
      sdf: S.union(0.012,
        S.ellipsoid([0, 0.035, 0.03], [0.07, 0.038, 0.19]).paint(skin).bone('body'),
        headCore.bone('head'),
        stalks,
        S.union(0.015,
          S.ellipsoid([0, 0.17, -0.03], [0.085, 0.125, 0.125]).paint(shellP),
          S.mirror(S.cyl([0.083, 0.17, -0.03], 0.075, 0.008, 0.005).rot(0, 0, Math.PI / 2).paint(clock)),
        ).bone('shell'),
      ),
      face: { sdf: S.union(0.01, headCore, S.mirror(S.sphere([0.047, 0.26, 0.195], 0.026))), features: [
        ...face2(C, [0.052, 0.266, 0.22], [0.032, 0.036], { iris: '#3f2a08', irisSize: 0.7, dir: [0.2, 0.25, 1] }),
        mouth([0, 0.11, 0.208], [0.045, 0.025], { open: 0.2, smile: 1, width: 0.7, ink: '#5a3a08', dir: [0, 0.2, 1] }),
      ] },
    };
  },

  // ── Floating jellyfish: a cosmic bell with star specks and trailing tentacles.
  space: C => {
    const bell = starry(tone('#e879f9', '#7e22ce', '#fbd5ff', 0.26, 0.42, 0.6, 0.5), '#ffffff', 40, 0.75, 1);
    const tentP = glowGrad('#c026d3', '#f5c2ff', 0.05, 0.28, 0.35, 0.5);
    const sp = { root: { pos: [0, 0, 0] }, body: B('root', [0, 0.3, 0]), head: B('body', [0, 0.32, 0]) };
    const tents = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      const r = 0.075;
      const base = [Math.sin(a) * r, 0.25, Math.cos(a) * r];
      sp['tent' + i + 'a'] = B('body', base);
      sp['tent' + i + 'b'] = B('tent' + i + 'a', [Math.sin(a) * r * 1.1, 0.14, Math.cos(a) * r * 1.1]);
      tents.push(S.union(0.005,
        S.limb(base, [Math.sin(a) * r * 1.1, 0.14, Math.cos(a) * r * 1.1], 0.016, 0.011).bone('tent' + i + 'a'),
        S.limb([Math.sin(a) * r * 1.1, 0.14, Math.cos(a) * r * 1.1], [Math.sin(a) * r * 0.9, 0.04, Math.cos(a) * r * 0.9], 0.011, 0.004).bone('tent' + i + 'b'),
      ));
    }
    const bellCore = S.ellipsoid([0, 0.34, 0], [0.13, 0.105, 0.13]);
    return {
      spec: sp, height: 0.48, radius: 0.18, style: 'float', emissive: 1.6,
      sdf: S.union(0.012,
        S.union(0.01,
          S.sub(0.02, bellCore, S.ellipsoid([0, 0.26, 0], [0.105, 0.07, 0.105])),
          S.displace(S.torus([0, 0.262, 0], 0.115, 0.022), 0.008, 30, 1, 2),
        ).paint(bell).bone('head'),
        S.union(0, ...tents).paint(tentP),
      ),
      face: { sdf: bellCore, features: [
        ...face2(C, [0.045, 0.35, 0.115], [0.045, 0.055], { iris: '#2a0638', irisSize: 0.72 }),
        mouth([0, 0.31, 0.123], [0.04, 0.025], { open: 0.3, smile: 1.1, width: 0.7, ink: '#3b0f6e' }),
      ] },
    };
  },

  // ── Chicken: round amber hen with a red comb; bobs its head as it walks.
  beast: C => {
    const feathers = belly('#d9782e', '#fde6c6', '#9a4a14', 0.1, 0.3, { light: '#f2a24a', zFront: 0.02, soft: 0.04 });
    const red = P('#e8412c', 0.45), yellow = P('#ffc233', 0.45);
    const sp = mirrorBones({ root: { pos: [0, 0, 0] }, body: B('root', [0, 0.17, 0]), head: B('body', [0, 0.28, 0.07]), 'wing.L': B('body', [0.09, 0.22, -0.01]), 'leg.L': B('body', [0.04, 0.1, 0.01]), tail1: B('body', [0, 0.24, -0.11]) });
    const headCore = S.ellipsoid([0, 0.325, 0.075], [0.065, 0.068, 0.065]).paint(feathers);
    return {
      spec: sp, height: 0.44, radius: 0.18, style: 'hop', henBob: true,
      sdf: S.union(0.012,
        S.ellipsoid([0, 0.19, -0.01], [0.1, 0.1, 0.125]).paint(feathers).bone('body'),
        headCore.bone('head'),
        S.union(0.008, S.sphere([0, 0.395, 0.08], 0.022), S.sphere([0, 0.405, 0.055], 0.024), S.sphere([0, 0.39, 0.03], 0.02)).paint(red).bone('head'),
        S.ellipsoid([0, 0.28, 0.13], [0.015, 0.022, 0.012]).paint(red).bone('head'),
        S.limb([0, 0.315, 0.13], [0, 0.305, 0.165], 0.018, 0.004).paint(yellow).bone('head'),
        S.mirror(S.ellipsoid([0.095, 0.2, -0.02], [0.022, 0.06, 0.08]).rot(0.25, 0, 0.2).paint(feathers).bone('wing.L')),
        S.union(0.01, S.ellipsoid([0, 0.27, -0.14], [0.02, 0.06, 0.035]).rot(-0.5, 0, 0), S.mirror(S.ellipsoid([0.03, 0.26, -0.13], [0.018, 0.05, 0.03]).rot(-0.4, 0, 0.3))).paint(tone('#8a3a10', '#4a1a06', '#c46a1c', 0.2, 0.32, 0.3)).bone('tail1'),
        S.mirror(S.union(0.006,
          S.limb([0.04, 0.1, 0.01], [0.04, 0.02, 0.02], 0.012, 0.01),
          S.limb([0.04, 0.012, 0.02], [0.04, 0.008, 0.07], 0.008, 0.005),
          S.limb([0.04, 0.012, 0.02], [0.07, 0.008, 0.06], 0.008, 0.005),
          S.limb([0.04, 0.012, 0.02], [0.01, 0.008, 0.06], 0.008, 0.005),
        ).paint(yellow).bone('leg.L')),
      ),
      face: { sdf: headCore, features: [
        ...face2(C, [0.04, 0.335, 0.125], [0.034, 0.04], { iris: '#140a04', irisSize: 0.55, pupilSize: 0.4, yaw: 0.65 }),
      ] },
    };
  },

  // ── Small grey cube: just a cube. With a face. It hops.
  void: C => {
    const grey = tone('#9d9da6', '#6b6b74', '#d4d4d8', 0.0, 0.28, 0.35, 0.5);
    const sp = { root: { pos: [0, 0, 0] }, body: B('root', [0, 0.02, 0]), head: B('body', [0, 0.14, 0]) };
    const cube = S.box([0, 0.14, 0], [0.13, 0.13, 0.13], 0.035);
    return {
      spec: sp, height: 0.28, radius: 0.16, style: 'hop', cell: 0.012,
      sdf: cube.paint(grey).bone('head'),
      face: { sdf: cube, features: [
        ...face2(C, [0.045, 0.16, 0.13], [0.03, 0.04], { iris: '#18181b', sclera: '#18181b', irisSize: 0.9, pupilSize: 0.9, yaw: 0 }),
        mouth([0, 0.11, 0.13], [0.04, 0.02], { open: 0.1, smile: 0.4, width: 0.6, ink: '#18181b', dir: [0, 0, 1] }),
      ] },
    };
  },
};

export function sculptCritter(ctx) {
  const { variant, pal: C } = ctx;
  const v = CRITTERS[variant](C);
  return {
    spec: v.spec, sdf: v.sdf, face: v.face ? { sdf: v.face.sdf, bone: 'head', features: v.face.features } : null, props: v.props || [],
    cell: v.cell ?? 0.013, aoStep: 0.016, tau: 0.018,
    height: v.height ?? 0.4, radius: v.radius ?? 0.18,
    anim: 'critter', animOpts: { style: v.style ?? 'hop', henBob: !!v.henBob }, spawn: 'pop', glow: C.glow,
    emissive: v.emissive, emissivePulse: v.pulse ?? 0, noBlink: v.noBlink, derp: v.derp,
  };
}

export function poseCritter(P, R, c) {
  const { t, sp, ph, kind, k } = c;
  const o = c.def.animOpts;
  const H = c.def.height;
  const w = smooth(sp * 1.6);
  const idle = 1 - w;
  let mood = 'idle';
  const sn = Math.sin(ph), cs = Math.cos(ph);
  P.head = [0.06 * Math.sin(t * 1.3) * idle, 0.25 * Math.sin(t * 0.6) * idle, 0.1 * Math.sin(t * 0.9) * idle];
  switch (o.style) {
    case 'hop': {
      // hop cycle while moving; idle: little bounces now and then
      const hp = (ph / Math.PI) % 2;
      const air = w > 0.05 ? Math.max(0, Math.sin(ph)) : Math.max(0, Math.sin(t * 5)) * (Math.sin(t * 0.8) > 0.6 ? 1 : 0);
      R.y += air * H * 0.3 * Math.max(w, 0.35);
      R.sy *= 1 + 0.18 * (air - 0.25) * (w > 0.05 ? 1 : 0.5);
      R.rx += 0.15 * w * Math.cos(ph);
      P['legB.L'] = [0.9 * air, 0, 0]; P['legB.R'] = [0.9 * air, 0, 0];
      P['leg.L'] = [-0.6 * air, 0, 0]; P['leg.R'] = [-0.6 * air, 0, 0];
      void hp;
      break;
    }
    case 'waddle': {
      const A = 0.7 * w;
      R.rz += sn * 0.14 * w + 0.03 * Math.sin(t * 1.5) * idle;
      R.y += Math.abs(cs) * 0.02 * w * H / 0.4;
      P['leg.L'] = [-sn * A, 0, 0]; P['leg.R'] = [sn * A, 0, 0];
      P['legB.L'] = [sn * A, 0, 0]; P['legB.R'] = [-sn * A, 0, 0];
      P['wing.L'] = [0, 0, 0.3 + 0.25 * Math.abs(sn) * w + 0.08 * Math.sin(t * 2)];
      P['wing.R'] = [0, 0, -0.3 - 0.25 * Math.abs(sn) * w - 0.08 * Math.sin(t * 2)];
      P['arm.L'] = [0, 0, 0.2 * Math.sin(t * 2)]; P['arm.R'] = [0, 0, -0.2 * Math.sin(t * 2)];
      P.body = [0, sn * 0.25 * w, 0];
      break;
    }
    case 'flutter': {
      const f = Math.sin(t * 26);
      R.y += H * 0.35 + 0.03 * Math.sin(t * 2.3) + 0.01 * f;
      R.rx += 0.25 * w;
      P['wing.L'] = [0, 0.1 * f, 0.9 * f];
      P['wing.R'] = [0, -0.1 * f, -0.9 * f];
      P['leg.L'] = [0.3, 0, 0.1]; P['leg.R'] = [0.3, 0, -0.1];
      P.body = [0.05 * Math.sin(t * 2.3), 0, 0];
      break;
    }
    case 'float': {
      R.y += 0.05 + 0.03 * Math.sin(t * 1.8);
      R.rz += 0.08 * Math.sin(t * 1.1);
      const pulse = Math.sin(t * 3.2);
      R.sy *= 1 + 0.06 * pulse;
      P.stem = [0.1 * Math.sin(t * 1.4), 0, 0.15 * Math.sin(t * 1.1)];
      P['arm.L'] = [0, 0, 0.3 * Math.sin(t * 2)]; P['arm.R'] = [0, 0, -0.3 * Math.sin(t * 2 + 1)];
      for (let i = 0; i < 6; i++) {
        P['tent' + i + 'a'] = [0.25 * Math.sin(t * 2.2 + i), 0, 0.2 * Math.cos(t * 1.9 + i)];
        P['tent' + i + 'b'] = [0.35 * Math.sin(t * 2.2 + i - 0.9), 0, 0.3 * Math.cos(t * 1.9 + i - 0.9)];
      }
      R.rx += 0.2 * w;
      break;
    }
    case 'slide': {
      const g = Math.sin(t * 2.2);
      R.sy *= 1 + 0.03 * g;
      P.shell = [0.05 * g, 0, 0.04 * Math.sin(t * 1.1)];
      P['ant.L'] = [0.25 * Math.sin(t * 1.7), 0, 0.2 * Math.sin(t * 1.3)];
      P['ant.R'] = [0.25 * Math.sin(t * 1.7 + 1), 0, -0.2 * Math.sin(t * 1.3 + 0.5)];
      break;
    }
    default: {
      // wobble: rocks in place, shuffles when moving
      R.rz += 0.06 * Math.sin(t * 2.4) * idle + 0.12 * sn * w;
      R.y += Math.max(0, sn) * 0.03 * w;
    }
  }
  P['ant.L'] ||= [0.2 * Math.sin(t * 3), 0, 0.15 * Math.sin(t * 2.3)];
  P['ant.R'] ||= [0.2 * Math.sin(t * 3 + 1), 0, -0.15 * Math.sin(t * 2.3 + 1)];
  P['ear.L'] = [0, 0, 0.15 * Math.sin(t * 2.7)]; P['ear.R'] = [0, 0, -0.15 * Math.sin(t * 2.7 + 0.5)];
  P.tail1 = [0.1 * Math.sin(t * 2), 0.4 * Math.sin(t * 3.1), 0];
  P.tail2 = [0.1 * Math.sin(t * 2 - 0.7), 0.5 * Math.sin(t * 3.1 - 0.8), 0];
  P.crown = [0.08 * Math.sin(t * 1.6), 0, 0.1 * Math.sin(t * 1.3)];
  if (o.henBob) { P.head[0] += 0.25 * Math.max(0, Math.sin(ph * 2)) * w; }

  if (kind === 'attack') {
    // harmless "bonk": lean in and bounce back
    const b = Math.sin(Math.PI * clamp01(k / 0.5));
    R.rx += 0.35 * b; R.z += 0.06 * b; R.sy *= 1 - 0.1 * b;
    mood = 'fierce';
  } else if (kind === 'spawn') {
    mood = 'idle';
  } else if (kind === 'hit') {
    mood = 'hurt';
  } else if (kind === 'death') {
    const f = smooth(k / 0.4);
    R.ry += 6 * f * f; R.y += 0.15 * Math.sin(Math.PI * clamp01(k / 0.4));
    mood = 'ko';
  }
  return mood;
}
